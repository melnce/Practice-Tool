// src/bench/soakEnv.ts
// Headless full-game soak environment: real decks, full action space, invariants.

import { state } from "../core/gameState.js";
import type {
  PlayerAction,
  Player,
  CardInstance,
} from "../core/types/index.js";
import { createRng, type RNG } from "../core/rng.js";
import { hashGameState } from "../core/stateHash.js";
import { isGameOver } from "../core/gameOver.js";
import { injectAdapter } from "../core/adapter.js";
import { dispatchAction } from "../logic/core/dispatch.js";
import { forceCompleteOrFizzlePendingTarget } from "../logic/core/resolveTarget.js";
import { startNewGame, getState } from "../engine.js";
import { canPlayCard } from "../logic/core/playCard/preflight.js";
import { getEffectiveCost } from "../logic/core/playCard/cost.js";
import { canEvolve } from "../logic/evolveUtils.js";
import { canToggleSecondPlayerBonusPp } from "../core/bonusPp.js";
import {
  getBoard,
  getHand,
  getPP,
  getHP,
  opponentOf,
} from "../core/playerHelpers.js";
import { checkSoakInvariants } from "./soakInvariants.js";
import { deckSpecForSeed, type SoakDeckSpec } from "./soakDecks.js";
import { CoverageTracker } from "./soakCoverage.js";

export const DEFAULT_TURN_CAP = 60;
export const DEFAULT_ACTION_CAP = 800;

export type SoakAction =
  | PlayerAction
  | { type: "CONFIRM_TARGETS" }
  | { type: "FORCE_COMPLETE_PENDING" };

export type SoakGameResult = {
  seed: number;
  gameIndex: number;
  regime: SoakDeckSpec["regime"];
  deckAId: string;
  deckBId: string;
  deckARaw?: SoakDeckSpec["deckARaw"];
  deckBRaw?: SoakDeckSpec["deckBRaw"];
  outcome:
    | "completed"
    | "crash"
    | "hang"
    | "invariant"
    | "determinism_mismatch";
  turns: number;
  actions: number;
  finalHash: string;
  winner?: string;
  error?: string;
  findings?: string[];
  trace: SoakAction[];
};

type ConfirmHook = (() => void) | null;

let confirmHook: ConfirmHook = null;

function installSoakAdapter(): void {
  injectAdapter({
    showTargetConfirmationButton: (vm: {
      onConfirm: () => void;
      count?: number;
    }) => {
      confirmHook = () => {
        confirmHook = null;
        vm.onConfirm();
      };
    },
    hideTargetConfirmation: () => {
      confirmHook = null;
    },
    triggerConfirmButtonClick: () => {
      if (confirmHook) {
        const fn = confirmHook;
        confirmHook = null;
        fn();
      }
    },
  });
}

function hasStorm(card: CardInstance): boolean {
  if (card.storm || card.hasStorm) return true;
  if (!card.keywords) return false;
  return card.keywords.some((k: any) => {
    const name = typeof k === "string" ? k : k?.name;
    return name?.toLowerCase() === "storm";
  });
}

function hasWard(card: CardInstance): boolean {
  if (card.ward || card.hasWard) return true;
  if (!card.keywords) return false;
  return card.keywords.some((k: any) => {
    const name = typeof k === "string" ? k : k?.name;
    return name?.toLowerCase() === "ward";
  });
}

function ignoresWard(card: CardInstance): boolean {
  if (card.ignoresWard || card.keywordState?.ignoresWard) return true;
  if (!card.keywords) return false;
  return card.keywords.some((k: any) => {
    const name = typeof k === "string" ? k : k?.name;
    const normalized = name?.toLowerCase().replace(/[\s_]/g, "");
    return normalized === "ignoresward";
  });
}

function hasAmbush(card: CardInstance): boolean {
  if (card.ambush || card.hasAmbush) return true;
  if (!card.keywords) return false;
  return card.keywords.some((k: any) => {
    const name = typeof k === "string" ? k : k?.name;
    return name?.toLowerCase() === "ambush";
  });
}

function canAttackFollower(card: CardInstance): boolean {
  if (card.type !== "Follower") return false;
  if (card.cant_attack) return false;
  if (!card.can_attack) return false;
  if (card.hasAttacked) return false;
  if (card.justPlayed && !hasStorm(card) && !card.hasRush) return false;
  return true;
}

function canAttackLeader(card: CardInstance): boolean {
  if (!canAttackFollower(card)) return false;
  if (card.justPlayed && card.hasRush && !hasStorm(card) && !card.hasStorm) {
    return false;
  }
  return true;
}

function canEngage(card: CardInstance, player: Player): boolean {
  if (card.type !== "Amulet" || !card.hasEngage) return false;
  const ks = card.keywordState;
  const engageOncePerTurn =
    ks?.engageOncePerTurn ?? card.engageOncePerTurn ?? true;
  if (engageOncePerTurn !== false && ks?.engagedThisTurn) return false;
  const cost = Number(ks?.engageCost ?? card.engageCost ?? 0);
  return getPP(state, player) >= cost;
}

function canUseBonusPp(): boolean {
  return canToggleSecondPlayerBonusPp();
}

/**
 * Enumerate legal soak actions for the current state.
 * When a target is pending, only target/confirm actions are legal.
 */
export function getLegalSoakActions(): SoakAction[] {
  const actions: SoakAction[] = [];
  const s = state;

  if (isGameOver(s)) return actions;

  // Mulligan phase
  if (s.phase === "mulligan") {
    const stage = s.mulliganStage;
    if (stage === "first" || stage === "second") {
      const player = stage as Player;
      const hand = getHand(s, player);
      for (const card of hand) {
        if (card && (card as any).__mulliganSelectable) {
          actions.push({
            type: "TOGGLE_MULLIGAN",
            player,
            cardUid: card.uid,
          });
        }
      }
      actions.push({ type: "CONFIRM_MULLIGAN", player });
    }
    return actions;
  }

  // Pending target: only choose / confirm
  const pending = s.pendingTargetEffect;
  if (pending) {
    const owner = pending.owner as Player;
    const poolUids =
      pending.poolUids ??
      (Array.isArray(pending.pool)
        ? pending.pool.filter(Boolean).map((c: CardInstance) => c.uid)
        : []);
    const selected = new Set(pending.targetUids ?? []);
    const required =
      typeof pending.selectCount === "number" && pending.selectCount > 0
        ? pending.selectCount
        : 1;
    const selectedCount = selected.size;

    // Once a confirm hook is armed, finish the selection — never toggle forever.
    if (confirmHook && selectedCount > 0) {
      return [{ type: "CONFIRM_TARGETS" }];
    }

    // Only offer unselected, still-present targets (avoid toggle loops).
    const stillPresent = new Set<string>();
    for (const p of ["first", "second"] as const) {
      for (const zone of ["hand", "board"] as const) {
        for (const c of s.players[p][zone]) {
          if (c?.uid) stillPresent.add(c.uid);
        }
      }
    }

    for (const uid of poolUids) {
      if (!uid || selected.has(uid)) continue;
      if (!stillPresent.has(uid)) continue;
      actions.push({
        type: "CHOOSE_TARGET",
        player: owner,
        target: { type: "card", uid },
      });
    }
    if (pending.canTargetLeader && !selected.has("leader")) {
      const enemy = opponentOf(owner);
      actions.push({
        type: "CHOOSE_TARGET",
        player: owner,
        target: { type: "leader", player: enemy },
      });
    }

    // Soft-max confirm path (hook not yet armed but we already have picks)
    if (confirmHook && selectedCount >= required) {
      actions.push({ type: "CONFIRM_TARGETS" });
    }

    // Stuck: no remaining selectable targets — force-complete or fizzle.
    if (actions.length === 0 && !confirmHook) {
      actions.push({ type: "FORCE_COMPLETE_PENDING" });
    }

    return actions;
  }

  const player = s.activePlayer;
  const hand = getHand(s, player);
  const myBoard = getBoard(s, player);
  const enemyBoard = getBoard(s, opponentOf(player));
  const availablePP = getPP(s, player);

  // Play cards
  for (const card of hand) {
    if (!card) continue;
    const cost = getEffectiveCost(card);
    if (cost > availablePP) continue;
    if (
      (card.type === "Follower" || card.type === "Amulet") &&
      myBoard.length >= 5
    ) {
      continue;
    }
    const check = canPlayCard(card, player);
    if (check.ok) {
      actions.push({ type: "PLAY_CARD", player, cardUid: card.uid });
    }
  }

  // Attacks
  const hasEnemyWard = enemyBoard.some(
    (c) => c && c.type === "Follower" && hasWard(c),
  );
  for (const attacker of myBoard) {
    if (!attacker || !canAttackFollower(attacker)) continue;
    const ignore = ignoresWard(attacker);

    for (const defender of enemyBoard) {
      if (!defender || defender.type !== "Follower") continue;
      if (hasAmbush(defender)) continue;
      if (hasEnemyWard && !ignore && !hasWard(defender)) continue;
      actions.push({
        type: "ATTACK",
        player,
        attackerUid: attacker.uid,
        defender: { type: "card", uid: defender.uid },
      });
    }

    if (canAttackLeader(attacker) && (!hasEnemyWard || ignore)) {
      actions.push({
        type: "ATTACK",
        player,
        attackerUid: attacker.uid,
        defender: { type: "leader", player: opponentOf(player) },
      });
    }
  }

  // Evolve / super-evolve
  for (const card of myBoard) {
    if (!card || card.type !== "Follower") continue;
    if (canEvolve(player, card, "normal")) {
      actions.push({
        type: "EVOLVE",
        player,
        cardUid: card.uid,
        mode: "normal",
      });
    }
    if (canEvolve(player, card, "super")) {
      actions.push({
        type: "EVOLVE",
        player,
        cardUid: card.uid,
        mode: "super",
      });
    }
  }

  // Engage
  for (const card of myBoard) {
    if (!card || !canEngage(card, player)) continue;
    actions.push({ type: "ENGAGE", player, cardUid: card.uid });
  }

  // Bonus PP (second player)
  if (canUseBonusPp()) {
    actions.push({ type: "BONUS_PP", player: "second" });
  }

  // End turn always legal in main phase
  actions.push({ type: "END_TURN" });

  return actions;
}

function stableKey(action: SoakAction): string {
  switch (action.type) {
    case "PLAY_CARD":
      return `PLAY_${action.cardUid}`;
    case "ATTACK":
      return `ATK_${action.attackerUid}_${action.defender.type === "leader" ? "L" : action.defender.uid}`;
    case "EVOLVE":
      return `EVO_${action.mode}_${action.cardUid}`;
    case "ENGAGE":
      return `ENG_${action.cardUid}`;
    case "BONUS_PP":
      return `BONUS`;
    case "CHOOSE_TARGET":
      return `TGT_${action.target.type === "leader" ? "L" : action.target.uid}`;
    case "CONFIRM_TARGETS":
      return `CONFIRM`;
    case "FORCE_COMPLETE_PENDING":
      return `FORCE_PENDING`;
    case "TOGGLE_MULLIGAN":
      return `MULL_T_${action.cardUid}`;
    case "CONFIRM_MULLIGAN":
      return `MULL_C_${action.player}`;
    case "END_TURN":
      return `END`;
    default:
      return action.type;
  }
}

export function sortSoakActions(actions: SoakAction[]): SoakAction[] {
  return [...actions].sort((a, b) => stableKey(a).localeCompare(stableKey(b)));
}

export function pickSoakAction(
  actions: SoakAction[],
  policyRng: RNG,
): SoakAction {
  const sorted = sortSoakActions(actions);
  // Bias away from always ending turn when other options exist (~70% play when available)
  const nonEnd = sorted.filter((a) => a.type !== "END_TURN");
  if (nonEnd.length > 0 && policyRng.nextFloat() < 0.72) {
    // Soft preference for PLAY_CARD so high-cost spotlight cards get cast when legal.
    const plays = nonEnd.filter((a) => a.type === "PLAY_CARD");
    if (plays.length > 0 && policyRng.nextFloat() < 0.55) {
      return plays[policyRng.nextInt(plays.length)]!;
    }
    return nonEnd[policyRng.nextInt(nonEnd.length)]!;
  }
  return sorted[policyRng.nextInt(sorted.length)]!;
}

function scanZonesForCoverage(coverage: CoverageTracker): void {
  for (const player of ["first", "second"] as const) {
    for (const card of state.players[player].board) {
      if (card?.id != null) coverage.mark("appearedOnBoard", String(card.id));
    }
    for (const card of state.players[player].graveyard) {
      if (card?.id != null)
        coverage.mark("appearedInGraveyard", String(card.id));
    }
  }
}

function noteActionCoverage(
  coverage: CoverageTracker,
  action: SoakAction,
): void {
  if (action.type === "PLAY_CARD") {
    const hand = getHand(state, action.player);
    const card = hand.find((c) => c.uid === action.cardUid);
    if (card?.id != null) coverage.mark("playedFromHand", String(card.id));
  } else if (action.type === "EVOLVE") {
    const board = getBoard(state, action.player);
    const card = board.find((c) => c.uid === action.cardUid);
    if (card?.id != null) {
      coverage.mark(
        action.mode === "super" ? "superEvolved" : "evolved",
        String(card.id),
      );
    }
  } else if (action.type === "ENGAGE") {
    const board = getBoard(state, action.player);
    const card = board.find((c) => c.uid === action.cardUid);
    if (card?.id != null) coverage.mark("engaged", String(card.id));
  }
}

function safeHash(): string {
  try {
    return hashGameState(state);
  } catch (e) {
    return `hash_error:${e instanceof Error ? e.message : String(e)}`;
  }
}

function applySoakAction(action: SoakAction): void {
  if (action.type === "CONFIRM_TARGETS") {
    if (confirmHook) {
      const fn = confirmHook;
      confirmHook = null;
      fn();
    }
    return;
  }
  if (action.type === "FORCE_COMPLETE_PENDING") {
    forceCompleteOrFizzlePendingTarget();
    return;
  }
  dispatchAction(state, action as PlayerAction, { checkInvariants: false });
}

export type RunSoakGameOptions = {
  seed: number;
  gameIndex: number;
  turnCap?: number;
  actionCap?: number;
  coverage?: CoverageTracker;
  /** When true, skip invariant checks (used only for timing). */
  skipInvariants?: boolean;
};

/**
 * Play one complete random seeded game. Records a full action trace for repro.
 */
export async function runSoakGame(
  opts: RunSoakGameOptions,
): Promise<SoakGameResult> {
  installSoakAdapter();
  confirmHook = null;

  const turnCap = opts.turnCap ?? DEFAULT_TURN_CAP;
  const actionCap = opts.actionCap ?? DEFAULT_ACTION_CAP;
  const deckSpec = deckSpecForSeed(opts.seed, opts.gameIndex);
  const policyRng = createRng(`soak-policy-${opts.seed}-${opts.gameIndex}`);
  const trace: SoakAction[] = [];

  const base: Omit<
    SoakGameResult,
    "outcome" | "turns" | "actions" | "finalHash"
  > = {
    seed: opts.seed,
    gameIndex: opts.gameIndex,
    regime: deckSpec.regime,
    deckAId: deckSpec.deckAId,
    deckBId: deckSpec.deckBId,
    ...(deckSpec.deckARaw ? { deckARaw: deckSpec.deckARaw } : {}),
    ...(deckSpec.deckBRaw ? { deckBRaw: deckSpec.deckBRaw } : {}),
    trace,
  };

  try {
    await startNewGame({
      deckAId: deckSpec.deckAId,
      deckBId: deckSpec.deckBId,
      seed: opts.seed + opts.gameIndex * 1_000_003,
    });
  } catch (e) {
    return {
      ...base,
      outcome: "crash",
      turns: 0,
      actions: 0,
      finalHash: "",
      error: `startNewGame: ${e instanceof Error ? e.message : String(e)}`,
      findings: [],
    };
  }

  let actions = 0;
  try {
    while (true) {
      if (isGameOver(state)) break;

      const turns = state.turnNumber | 0;
      if (turns > turnCap) {
        return {
          ...base,
          outcome: "hang",
          turns,
          actions,
          finalHash: safeHash(),
          error: `turn cap ${turnCap} exceeded (turnNumber=${turns})`,
          findings: [`hang: turn cap ${turnCap}`],
        };
      }
      if (actions >= actionCap) {
        return {
          ...base,
          outcome: "hang",
          turns,
          actions,
          finalHash: safeHash(),
          error: `action cap ${actionCap} exceeded`,
          findings: [`hang: action cap ${actionCap}`],
        };
      }

      const legal = getLegalSoakActions();
      if (legal.length === 0) {
        return {
          ...base,
          outcome: "hang",
          turns: state.turnNumber | 0,
          actions,
          finalHash: safeHash(),
          error: `no legal actions (phase=${state.phase}, pending=${!!state.pendingTargetEffect})`,
          findings: ["hang: no legal actions"],
        };
      }

      const action = pickSoakAction(legal, policyRng);
      if (opts.coverage) noteActionCoverage(opts.coverage, action);
      trace.push(action);

      applySoakAction(action);
      actions++;

      if (opts.coverage) scanZonesForCoverage(opts.coverage);

      if (!opts.skipInvariants) {
        const findings = checkSoakInvariants(state);
        if (findings.length) {
          return {
            ...base,
            outcome: "invariant",
            turns: state.turnNumber | 0,
            actions,
            finalHash: safeHash(),
            error: findings.map((f) => f.message).join("; "),
            findings: findings.map((f) => f.message),
          };
        }
      }
    }
  } catch (e) {
    return {
      ...base,
      outcome: "crash",
      turns: state.turnNumber | 0,
      actions,
      finalHash: safeHash(),
      error: e instanceof Error ? e.stack || e.message : String(e),
      findings: [],
    };
  }

  const completed: SoakGameResult = {
    ...base,
    outcome: "completed",
    turns: state.turnNumber | 0,
    actions,
    finalHash: safeHash(),
  };
  if (state.winner) completed.winner = state.winner;
  return completed;
}

/**
 * Replay a recorded trace for a seed (regression / determinism).
 */
export async function replaySoakTrace(
  seed: number,
  gameIndex: number,
  trace: SoakAction[],
): Promise<{ hash: string; error?: string }> {
  installSoakAdapter();
  confirmHook = null;
  const deckSpec = deckSpecForSeed(seed, gameIndex);
  try {
    await startNewGame({
      deckAId: deckSpec.deckAId,
      deckBId: deckSpec.deckBId,
      seed: seed + gameIndex * 1_000_003,
    });
    for (const action of trace) {
      applySoakAction(action);
    }
    return { hash: safeHash() };
  } catch (e) {
    return {
      hash: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function isTerminalSoak(): boolean {
  return (
    isGameOver(state) ||
    getHP(state, "first") <= 0 ||
    getHP(state, "second") <= 0 ||
    !!state.players.first.defeated ||
    !!state.players.second.defeated
  );
}
