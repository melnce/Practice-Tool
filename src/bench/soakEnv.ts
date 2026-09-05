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
import { playCard, playCardNoRender } from "../logic/core/playCard/index.js";
import type { PlayOutcome } from "../logic/core/playCard/types.js";
import {
  captureSnapshot,
  setHistoryEnabled,
  onHistoryEvent,
} from "../core/history.js";
import { setNodeEnv } from "../core/env.js";
import type { GameState } from "../core/types/index.js";
import { startNewGame, dispatch as engineDispatch } from "../engine.js";
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

/** Which dispatch entrypoint soak uses for PlayerActions (default: UI/engine path). */
export type SoakDispatchPath = "engine" | "core";

export const DEFAULT_SOAK_DISPATCH: SoakDispatchPath = "engine";

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
    | "determinism_mismatch"
    | "history";
  turns: number;
  actions: number;
  finalHash: string;
  winner?: string;
  error?: string;
  findings?: string[];
  /** Action types that created zero history commits during this game (not undoable). */
  nonUndoableActionTypes?: string[];
  /** Blocked play attempts (engine refused after soak listed them as legal). */
  playBlockedLog?: Array<{
    actionIndex: number;
    cardUid: string;
    reason: string;
  }>;
  /** Zero-commit actions with diagnostic reason (non-mulligan). */
  zeroCommitLog?: Array<{
    actionIndex: number;
    actionType: string;
    reason: string;
  }>;
  trace: SoakAction[];
};

/** Top-level state fields mutated before history.ts snapshots during headless play. */
export const PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS = [
  "deferDeathTriggers",
  "gameTick",
  "lastDrawnCard",
  "lastDrawnCards",
  "lastSummoned",
] as const;

export type ActionTelemetry = {
  historyCommits: number;
  /** Why this action type recorded zero commits (diagnostics). */
  zeroCommitReason?: string;
  playBlocked?: { cardUid: string; reason: string };
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

// ---------------------------------------------------------------------------
// History round-trip helpers (canonical full-state comparison)
// ---------------------------------------------------------------------------

type SnapshotPair = { canon: string; snap: GameState };

/** Mulligan picks are not undoable by design; anything else here is a soak finding. */
export const EXPECTED_NON_UNDOABLE_ACTION_TYPES = new Set([
  "TOGGLE_MULLIGAN",
  "CONFIRM_MULLIGAN",
]);

export function maskCanonicalSnapshot(
  canon: string,
  ignoreFields: readonly string[],
): string {
  if (ignoreFields.length === 0) return canon;
  const obj = JSON.parse(canon) as Record<string, unknown>;
  for (const key of ignoreFields) {
    delete obj[key];
  }
  return canonicalJson(obj);
}

function snapshotsEqual(
  expected: string,
  actual: string,
  ignoreFields: readonly string[],
): boolean {
  if (ignoreFields.length === 0) return expected === actual;
  return (
    maskCanonicalSnapshot(expected, ignoreFields) ===
    maskCanonicalSnapshot(actual, ignoreFields)
  );
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function captureFullSnapshot(): SnapshotPair {
  const snap = captureSnapshot();
  return { canon: canonicalJson(snap), snap };
}

function captureLegalSnapshot(): string {
  return canonicalJson(sortSoakActions(getLegalSoakActions()));
}

export type JsonPathDiff = { path: string; a: unknown; b: unknown };

export function diffJsonPaths(
  a: unknown,
  b: unknown,
  prefix = "",
  out: JsonPathDiff[] = [],
  max = 10,
): JsonPathDiff[] {
  if (out.length >= max) return out;
  if (Object.is(a, b)) return out;

  const isArrA = Array.isArray(a);
  const isArrB = Array.isArray(b);
  const typeA = isArrA ? "array" : typeof a;
  const typeB = isArrB ? "array" : typeof b;

  if (
    typeA !== typeB ||
    (typeA !== "object" && typeA !== "array") ||
    a === null ||
    b === null
  ) {
    out.push({ path: prefix || "(root)", a, b });
    return out;
  }

  if (isArrA && isArrB) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len && out.length < max; i++) {
      diffJsonPaths(a[i], b[i], `${prefix}[${i}]`, out, max);
    }
    return out;
  }

  const keys = new Set([
    ...Object.keys(a as object),
    ...Object.keys(b as object),
  ]);
  for (const key of [...keys].sort()) {
    if (out.length >= max) break;
    const pa = (a as Record<string, unknown>)[key];
    const pb = (b as Record<string, unknown>)[key];
    diffJsonPaths(pa, pb, prefix ? `${prefix}.${key}` : key, out, max);
  }
  return out;
}

export function findUnexpectedNonUndoableActionTypes(
  types: Iterable<string>,
): string[] {
  return [...types]
    .filter((t) => !EXPECTED_NON_UNDOABLE_ACTION_TYPES.has(t))
    .sort();
}

export const CHOOSE_TARGET_ZERO_COMMIT_REASON =
  "CHOOSE_TARGET calls resolvePendingTarget → applyTargetClick (resolveTarget.ts); " +
  "no doAction until Confirm Targets (showConfirmationButton onConfirm).";

function formatHistoryMismatch(
  actionIndex: number,
  action: SoakAction,
  phase: string,
  expected: string,
  actual: string,
  ignoreFields: readonly string[] = [],
): string {
  const exp = JSON.parse(
    maskCanonicalSnapshot(expected, ignoreFields),
  ) as unknown;
  const act = JSON.parse(
    maskCanonicalSnapshot(actual, ignoreFields),
  ) as unknown;
  const diffs = diffJsonPaths(exp, act);
  const diffText = diffs
    .map(
      (d) =>
        `  ${d.path}: expected=${JSON.stringify(d.a)} actual=${JSON.stringify(d.b)}`,
    )
    .join("\n");
  return `history ${phase} mismatch at action ${actionIndex} (${JSON.stringify(action)}):\n${diffText}`;
}

function formatLegalMismatch(
  actionIndex: number,
  action: SoakAction,
  phase: string,
  expected: string,
  actual: string,
): string {
  const exp = JSON.parse(expected) as unknown;
  const act = JSON.parse(actual) as unknown;
  const diffs = diffJsonPaths(exp, act);
  const diffText = diffs
    .map(
      (d) =>
        `  ${d.path}: expected=${JSON.stringify(d.a)} actual=${JSON.stringify(d.b)}`,
    )
    .join("\n");
  return `history legal-${phase} mismatch at action ${actionIndex} (${JSON.stringify(action)}):\n${diffText}`;
}

function dispatchSoakPlayerAction(
  action: PlayerAction,
  dispatchPath: SoakDispatchPath,
): void {
  if (dispatchPath === "engine") {
    engineDispatch(state, action);
  } else {
    dispatchAction(state, action, { checkInvariants: false });
  }
}

function dispatchSoakHistory(
  type: "UNDO" | "REDO",
  dispatchPath: SoakDispatchPath,
): void {
  dispatchSoakPlayerAction({ type }, dispatchPath);
}

function countHistoryCommitsDuring(
  action: SoakAction,
  dispatchPath: SoakDispatchPath,
): ActionTelemetry {
  let commits = 0;
  const unsub = onHistoryEvent((ev) => {
    if (ev.type === "commit") commits++;
    if (ev.type === "reset") commits = 0;
  });
  const telemetry = applySoakActionWithOutcome(action, dispatchPath);
  unsub();
  telemetry.historyCommits = commits;
  if (commits === 0) {
    if (telemetry.playBlocked) {
      telemetry.zeroCommitReason = `PLAY_CARD blocked: ${telemetry.playBlocked.reason}`;
    } else if (action.type === "CHOOSE_TARGET") {
      telemetry.zeroCommitReason = CHOOSE_TARGET_ZERO_COMMIT_REASON;
    }
  }
  return telemetry;
}

export function applySoakActionWithOutcome(
  action: SoakAction,
  dispatchPath: SoakDispatchPath = DEFAULT_SOAK_DISPATCH,
): ActionTelemetry {
  const telemetry: ActionTelemetry = { historyCommits: 0 };
  if (action.type === "PLAY_CARD") {
    const hand = getHand(state, action.player);
    const index = hand.findIndex((c) => c.uid === action.cardUid);
    if (index === -1) {
      dispatchSoakPlayerAction(action as PlayerAction, dispatchPath);
      return telemetry;
    }
    const outcome: PlayOutcome =
      dispatchPath === "engine"
        ? playCard(hand, action.player, index)
        : playCardNoRender(hand, action.player, index);
    if (outcome.kind === "blocked") {
      telemetry.playBlocked = {
        cardUid: action.cardUid,
        reason: outcome.reason ?? "blocked",
      };
    }
    return telemetry;
  }
  applySoakAction(action, dispatchPath);
  return telemetry;
}

type HistoryCheckContext = {
  actionIndex: number;
  action: SoakAction;
  before: SnapshotPair;
  after: SnapshotPair;
  legalBefore: string;
  legalAfter: string;
  policyRng: RNG;
  historyCommits: number;
  historyIgnoreFields: readonly string[];
  historyReExecute: boolean;
  dispatchPath: SoakDispatchPath;
};

function runHistoryRoundTrip(ctx: HistoryCheckContext): string | null {
  const {
    actionIndex,
    action,
    before,
    after,
    legalBefore,
    legalAfter,
    policyRng,
    historyCommits: n,
    historyIgnoreFields,
    historyReExecute,
    dispatchPath,
  } = ctx;

  for (let i = 0; i < n; i++) {
    dispatchSoakHistory("UNDO", dispatchPath);
  }

  let actual = captureFullSnapshot().canon;
  if (!snapshotsEqual(before.canon, actual, historyIgnoreFields)) {
    return formatHistoryMismatch(
      actionIndex,
      action,
      `undo×${n}`,
      before.canon,
      actual,
      historyIgnoreFields,
    );
  }
  let legalActual = captureLegalSnapshot();
  if (legalActual !== legalBefore) {
    return formatLegalMismatch(
      actionIndex,
      action,
      `undo×${n}`,
      legalBefore,
      legalActual,
    );
  }

  const useReExecute = historyReExecute && policyRng.nextInt(4) === 0;
  if (useReExecute) {
    applySoakActionWithOutcome(action, dispatchPath);
    actual = captureFullSnapshot().canon;
    if (!snapshotsEqual(after.canon, actual, historyIgnoreFields)) {
      return formatHistoryMismatch(
        actionIndex,
        action,
        "re-execute",
        after.canon,
        actual,
        historyIgnoreFields,
      );
    }
    legalActual = captureLegalSnapshot();
    if (legalActual !== legalAfter) {
      return formatLegalMismatch(
        actionIndex,
        action,
        "re-execute",
        legalAfter,
        legalActual,
      );
    }
  } else {
    for (let i = 0; i < n; i++) {
      dispatchSoakHistory("REDO", dispatchPath);
    }
    actual = captureFullSnapshot().canon;
    if (!snapshotsEqual(after.canon, actual, historyIgnoreFields)) {
      return formatHistoryMismatch(
        actionIndex,
        action,
        `redo×${n}`,
        after.canon,
        actual,
        historyIgnoreFields,
      );
    }
    legalActual = captureLegalSnapshot();
    if (legalActual !== legalAfter) {
      return formatLegalMismatch(
        actionIndex,
        action,
        `redo×${n}`,
        legalAfter,
        legalActual,
      );
    }
  }

  return null;
}

function runDeepHistoryChain(
  actionIndex: number,
  beforeRing: string[],
  afterRing: string[],
  historyIgnoreFields: readonly string[],
  dispatchPath: SoakDispatchPath,
): string | null {
  const k = Math.min(10, beforeRing.length);
  if (k === 0) return null;

  for (let j = 1; j <= k; j++) {
    dispatchSoakHistory("UNDO", dispatchPath);
    const expected = beforeRing[beforeRing.length - j]!;
    const actual = captureFullSnapshot().canon;
    if (!snapshotsEqual(expected, actual, historyIgnoreFields)) {
      const exp = JSON.parse(
        maskCanonicalSnapshot(expected, historyIgnoreFields),
      ) as unknown;
      const act = JSON.parse(
        maskCanonicalSnapshot(actual, historyIgnoreFields),
      ) as unknown;
      const diffs = diffJsonPaths(exp, act);
      const diffText = diffs
        .map(
          (d) =>
            `  ${d.path}: expected=${JSON.stringify(d.a)} actual=${JSON.stringify(d.b)}`,
        )
        .join("\n");
      return `history chain-undo level ${j} mismatch at action ${actionIndex}:\n${diffText}`;
    }
  }

  for (let j = 1; j <= k; j++) {
    dispatchSoakHistory("REDO", dispatchPath);
    const expected = afterRing[afterRing.length - k + j - 1]!;
    const actual = captureFullSnapshot().canon;
    if (!snapshotsEqual(expected, actual, historyIgnoreFields)) {
      const exp = JSON.parse(
        maskCanonicalSnapshot(expected, historyIgnoreFields),
      ) as unknown;
      const act = JSON.parse(
        maskCanonicalSnapshot(actual, historyIgnoreFields),
      ) as unknown;
      const diffs = diffJsonPaths(exp, act);
      const diffText = diffs
        .map(
          (d) =>
            `  ${d.path}: expected=${JSON.stringify(d.a)} actual=${JSON.stringify(d.b)}`,
        )
        .join("\n");
      return `history chain-redo level ${j} mismatch at action ${actionIndex}:\n${diffText}`;
    }
  }

  return null;
}

function applySoakAction(
  action: SoakAction,
  dispatchPath: SoakDispatchPath = DEFAULT_SOAK_DISPATCH,
): void {
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
  dispatchSoakPlayerAction(action as PlayerAction, dispatchPath);
}

export type RunSoakGameOptions = {
  seed: number;
  gameIndex: number;
  turnCap?: number;
  actionCap?: number;
  coverage?: CoverageTracker;
  /** When true, skip invariant checks (used only for timing). */
  skipInvariants?: boolean;
  /** When true, undo/redo round-trip after every action with full-state comparison. */
  historyCheck?: boolean;
  /** Top-level snapshot fields to ignore when comparing undo/redo round-trips. */
  historyIgnoreFields?: string[];
  /** Dispatch entrypoint for PlayerActions (default engine / UI path). */
  dispatch?: SoakDispatchPath;
  /** When true, ~25% of round-trips re-apply the action after undo instead of redo. */
  historyReExecute?: boolean;
  /** Override deck pairing (skips deckSpecForSeed when both are set). */
  deckAId?: string;
  deckBId?: string;
};

/**
 * Play one complete random seeded game. Records a full action trace for repro.
 */
export async function runSoakGame(
  opts: RunSoakGameOptions,
): Promise<SoakGameResult> {
  installSoakAdapter();
  confirmHook = null;

  if (opts.historyCheck) {
    setNodeEnv("DISABLE_HISTORY", undefined);
    setHistoryEnabled(true);
  }

  const turnCap = opts.turnCap ?? DEFAULT_TURN_CAP;
  const actionCap = opts.actionCap ?? DEFAULT_ACTION_CAP;
  const pinned =
    opts.deckAId != null && opts.deckBId != null
      ? {
          regime: "shipped" as const,
          deckAId: opts.deckAId,
          deckBId: opts.deckBId,
        }
      : null;
  const deckSpec = pinned ?? deckSpecForSeed(opts.seed, opts.gameIndex);
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
    ...("deckARaw" in deckSpec && deckSpec.deckARaw
      ? { deckARaw: deckSpec.deckARaw }
      : {}),
    ...("deckBRaw" in deckSpec && deckSpec.deckBRaw
      ? { deckBRaw: deckSpec.deckBRaw }
      : {}),
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
  const engineBeforeRing: string[] = [];
  const engineAfterRing: string[] = [];
  const nonUndoableActionTypes = new Set<string>();
  const playBlockedLog: SoakGameResult["playBlockedLog"] = [];
  const zeroCommitLog: NonNullable<SoakGameResult["zeroCommitLog"]> = [];
  const historyIgnoreFields = opts.historyIgnoreFields ?? [];
  const dispatchPath = opts.dispatch ?? DEFAULT_SOAK_DISPATCH;
  const historyReExecute = opts.historyReExecute ?? false;
  let unsubHistoryReset: (() => void) | undefined;
  if (opts.historyCheck) {
    unsubHistoryReset = onHistoryEvent((ev) => {
      if (ev.type === "reset") {
        engineBeforeRing.length = 0;
        engineAfterRing.length = 0;
      }
    });
  }
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

      const beforeSnap = opts.historyCheck ? captureFullSnapshot() : null;
      const legalBefore = opts.historyCheck ? captureLegalSnapshot() : null;

      const telemetry = opts.historyCheck
        ? countHistoryCommitsDuring(action, dispatchPath)
        : (applySoakActionWithOutcome(action, dispatchPath),
          {
            historyCommits: 0,
          });
      const historyCommits = telemetry.historyCommits;
      if (telemetry.playBlocked) {
        playBlockedLog.push({
          actionIndex: actions + 1,
          cardUid: telemetry.playBlocked.cardUid,
          reason: telemetry.playBlocked.reason,
        });
      }
      actions++;

      if (opts.historyCheck && beforeSnap && legalBefore) {
        if (historyCommits === 0) {
          nonUndoableActionTypes.add(action.type);
          if (telemetry.zeroCommitReason) {
            zeroCommitLog.push({
              actionIndex: actions,
              actionType: action.type,
              reason: telemetry.zeroCommitReason,
            });
          }
        } else {
          const afterSnap = captureFullSnapshot();
          const legalAfter = captureLegalSnapshot();

          const roundTripErr = runHistoryRoundTrip({
            actionIndex: actions,
            action,
            before: beforeSnap,
            after: afterSnap,
            legalBefore,
            legalAfter,
            policyRng,
            historyCommits,
            historyIgnoreFields,
            historyReExecute,
            dispatchPath,
          });
          if (roundTripErr) {
            return {
              ...base,
              outcome: "history",
              turns: state.turnNumber | 0,
              actions,
              finalHash: safeHash(),
              error: roundTripErr,
              findings: [roundTripErr],
              nonUndoableActionTypes: [...nonUndoableActionTypes].sort(),
              playBlockedLog,
              zeroCommitLog,
            };
          }

          if (historyCommits === 1) {
            engineBeforeRing.push(beforeSnap.canon);
            engineAfterRing.push(afterSnap.canon);
            if (engineBeforeRing.length > 10) engineBeforeRing.shift();
            if (engineAfterRing.length > 10) engineAfterRing.shift();
          }

          if (actions % 25 === 0 && engineBeforeRing.length > 0) {
            const chainErr = runDeepHistoryChain(
              actions,
              engineBeforeRing,
              engineAfterRing,
              historyIgnoreFields,
              dispatchPath,
            );
            if (chainErr) {
              return {
                ...base,
                outcome: "history",
                turns: state.turnNumber | 0,
                actions,
                finalHash: safeHash(),
                error: chainErr,
                findings: [chainErr],
                nonUndoableActionTypes: [...nonUndoableActionTypes].sort(),
                playBlockedLog,
                zeroCommitLog,
              };
            }
          }
        }
      } else if (!opts.historyCheck) {
        void telemetry;
      }

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
  } finally {
    unsubHistoryReset?.();
  }

  const completed: SoakGameResult = {
    ...base,
    outcome: "completed",
    turns: state.turnNumber | 0,
    actions,
    finalHash: safeHash(),
    nonUndoableActionTypes: [...nonUndoableActionTypes].sort(),
    playBlockedLog,
    zeroCommitLog,
  };
  const unexpected = findUnexpectedNonUndoableActionTypes(
    nonUndoableActionTypes,
  );
  if (unexpected.length > 0) {
    return {
      ...completed,
      outcome: "history",
      error: `unexpected non-undoable action types: ${unexpected.join(", ")}`,
      findings: [
        `unexpected non-undoable action types: ${unexpected.join(", ")}`,
      ],
    };
  }
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
  opts?: { dispatch?: SoakDispatchPath },
): Promise<{ hash: string; error?: string }> {
  installSoakAdapter();
  confirmHook = null;
  const dispatchPath = opts?.dispatch ?? DEFAULT_SOAK_DISPATCH;
  const deckSpec = deckSpecForSeed(seed, gameIndex);
  try {
    await startNewGame({
      deckAId: deckSpec.deckAId,
      deckBId: deckSpec.deckBId,
      seed: seed + gameIndex * 1_000_003,
    });
    for (const action of trace) {
      applySoakActionWithOutcome(action, dispatchPath);
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
