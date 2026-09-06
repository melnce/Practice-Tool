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
import { playCard } from "../logic/core/playCard/index.js";
import type { PlayOutcome } from "../logic/core/playCard/types.js";
import {
  captureSnapshot,
  setHistoryEnabled,
  onHistoryEvent,
  canUndo,
} from "../core/history.js";
import {
  savePosition,
  loadPosition,
  deletePosition,
  exportPositionToJson,
  importPositionFromJson,
  setCheckpoint,
  restoreCheckpoint,
  rerollFromCheckpoint,
  getCheckpointInfo,
  deriveRerollSeed,
  _resetPositionStoreForTests,
} from "../core/positionStore.js";
import { setNodeEnv } from "../core/env.js";
import type { GameState } from "../core/types/index.js";
import { startNewGame, dispatch as engineDispatch } from "../engine.js";
import { canPlayCard } from "../logic/core/playCard/preflight.js";
import { getEffectiveCost } from "../logic/core/playCard/cost.js";
import { canEvolve } from "../logic/evolveUtils.js";
import { canToggleSecondPlayerBonusPp } from "../core/bonusPp.js";
import { canFuse } from "../logic/core/fuseFromHand.js";
import { applyPendingModePickIndex } from "../logic/effects/ops/mode.js";
import {
  getBoard,
  getHand,
  getPP,
  getHP,
  opponentOf,
} from "../core/playerHelpers.js";
import { checkSoakInvariants } from "./soakInvariants.js";
import { assertAttackFlagsConsistent } from "./attackFlagsInvariant.js";
import { deckSpecForSeed, type SoakDeckSpec } from "./soakDecks.js";
import { CoverageTracker } from "./soakCoverage.js";
import type { PendingModeChoice } from "../logic/core/resolutionPause.js";

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
    | "attack-flags"
    | "determinism_mismatch"
    | "history"
    | "position"
    | "parity";
  turns: number;
  actions: number;
  finalHash: string;
  winner?: string;
  error?: string;
  findings?: string[];
  /** Position save/load, export/import, checkpoint, reroll checks performed. */
  positionChecks?: number;
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
  /** Per-action history commit counts (actions with commits ≥ 1 only). */
  commitSequence?: Array<{ actionType: string; commits: number }>;
  /** Count of each soak action type applied this game. */
  actionTypeCounts?: Record<string, number>;
  trace: SoakAction[];
};

/** One ring slot per applied action with ≥1 history commit. */
export type HistoryRingEntry = {
  action: SoakAction;
  commits: number;
  before: string;
  after: string;
};

const HISTORY_RING_MAX = 10;

/**
 * Top-level state fields mutated before history.ts snapshots during headless play,
 * or trigger-candidate cache bookkeeping that may differ ±1 across undo/redo without
 * changing gameplay outcomes. History soak comparisons (single-step, deep-chain, and
 * re-execute) all use this list via `historyIgnoreFields`.
 */
export const PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS = [
  "deferDeathTriggers",
  "gameTick",
  "lastDrawnCard",
  "lastDrawnCards",
  "lastSummoned",
  "actionSeq",
  "zoneVersion",
] as const;

export type ActionTelemetry = {
  historyCommits: number;
  /** Why this action type recorded zero commits (diagnostics). */
  zeroCommitReason?: string;
  playBlocked?: { cardUid: string; reason: string };
};

type ConfirmHook = (() => void) | null;

let confirmHook: ConfirmHook = null;

export type PendingSoakModeChoice = {
  owner: Player;
  optionCount: number;
  pickCallback: (index: number) => void;
  /** Identity of state.pendingModeChoice when the modal callback was registered. */
  promptIdentity: string;
};

let pendingModeChoice: PendingSoakModeChoice | null = null;

function modePromptIdentity(pending: PendingModeChoice): string {
  return JSON.stringify({
    owner: pending.owner,
    selectCount: pending.selectCount,
    optionCount: pending.optionCount,
    sourceCardUid: pending.sourceCardUid ?? null,
    partial: pending.partialPickedIndices ?? [],
  });
}

/** Drop modal accelerator when state no longer matches (undo/load/replay/partial pick). */
export function invalidateStaleModeCallback(): void {
  const sPending = state.pendingModeChoice;
  if (!sPending) {
    pendingModeChoice = null;
    return;
  }
  if (
    pendingModeChoice &&
    pendingModeChoice.promptIdentity !== modePromptIdentity(sPending)
  ) {
    pendingModeChoice = null;
  }
}

/** Legal CHOOSE_MODE indices: 0..optionCount-1 into the current pending.options round pool. */
export function legalModeChoiceIndices(pending: PendingModeChoice): number[] {
  const partial = pending.partialPickedIndices ?? [];
  if (partial.length >= pending.selectCount) return [];
  const indices: number[] = [];
  for (let i = 0; i < pending.optionCount; i++) {
    indices.push(i);
  }
  return indices;
}

/** Per-run soak options (set by runSoakGame; default off matches main soak). */
let activeSoakRunOptions: { fuse: boolean; interactiveModes: boolean } = {
  fuse: false,
  interactiveModes: false,
};

export function getPendingSoakModeChoice(): PendingSoakModeChoice | null {
  return pendingModeChoice;
}

export function clearPendingSoakModeChoice(): void {
  pendingModeChoice = null;
}

/** Mirror runSoakGame / replaySoakTrace setup before a parity core replay. */
export function prepareSoakReplay(opts: {
  fuse: boolean;
  interactiveModes: boolean;
}): void {
  activeSoakRunOptions = {
    fuse: opts.fuse,
    interactiveModes: opts.interactiveModes,
  };
  (globalThis as any).__SVWB_INTERACTIVE_MODES__ = opts.interactiveModes;
  installSoakAdapter({ interactiveModes: opts.interactiveModes });
  confirmHook = null;
  pendingModeChoice = null;
}

export function installSoakAdapter(opts?: {
  interactiveModes?: boolean;
}): void {
  const interactiveModes = opts?.interactiveModes ?? false;
  injectAdapter({
    ...(interactiveModes
      ? {
          showChoiceModal: (roundPool, cb) => {
            const sPending = state.pendingModeChoice;
            if (!sPending) return;
            pendingModeChoice = {
              owner: sPending.owner,
              optionCount: roundPool.length,
              pickCallback: cb,
              promptIdentity: modePromptIdentity(sPending),
            };
          },
        }
      : {}),
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

  // Mode choice modal: only CHOOSE_MODE until resolved (state is sole legality source).
  invalidateStaleModeCallback();
  const modePending = s.pendingModeChoice;
  if (modePending) {
    const { owner } = modePending;
    for (const i of legalModeChoiceIndices(modePending)) {
      actions.push({ type: "CHOOSE_MODE", player: owner, indices: [i] });
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

  // Fuse (opt-in soak path)
  if (activeSoakRunOptions.fuse) {
    for (const card of hand) {
      if (card && canFuse(player, card.uid)) {
        actions.push({ type: "FUSE", player, cardUid: card.uid });
      }
    }
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
    case "CHOOSE_MODE":
      return `MODE_${action.indices.join("_")}`;
    case "FUSE":
      return `FUSE_${action.cardUid}`;
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

/** Mulligan picks and target-selection clicks are not undoable by design. */
export const EXPECTED_NON_UNDOABLE_ACTION_TYPES = new Set([
  "CHOOSE_TARGET",
  "FORCE_COMPLETE_PENDING",
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

export function captureFullSnapshot(): SnapshotPair {
  const snap = captureSnapshot();
  return { canon: canonicalJson(snap), snap };
}

export function captureLegalSnapshot(): string {
  // History snapshots strip in-progress target picks (sanitizePendingTargetInSnapshot);
  // legal actions after undo must match that sanitized prompt, not live partial picks.
  const pending = state.pendingTargetEffect;
  const savedUids = pending?.targetUids;
  const savedTargets = pending?.targets;
  if (pending) {
    pending.targetUids = [];
    if (Array.isArray(pending.targets)) pending.targets = [];
  }
  try {
    return canonicalJson(sortSoakActions(getLegalSoakActions()));
  } finally {
    if (pending && savedUids !== undefined) {
      pending.targetUids = savedUids;
      if (savedTargets !== undefined) pending.targets = savedTargets;
    }
  }
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
  "CHOOSE_TARGET pick-only click (applyTargetClick → continue); " +
  "no doAction until selection completes (Resolve Targets or Confirm Targets).";

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

function formatPositionLegalMismatch(
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
  return (
    `position save-load legal-${phase} mismatch at action ${actionIndex} ` +
    `(${JSON.stringify(action)}):\n${diffText}`
  );
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
  // Modal callbacks are not in history snapshots; re-sync from state after undo/redo.
  pendingModeChoice = null;
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
    const outcome: PlayOutcome = playCard(hand, action.player, index);
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
      `undo×${n} (recorded commits=${n})`,
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

export function runDeepHistoryChain(
  actionIndex: number,
  ring: HistoryRingEntry[],
  historyIgnoreFields: readonly string[],
  dispatchPath: SoakDispatchPath,
): string | null {
  const k = Math.min(HISTORY_RING_MAX, ring.length);
  if (k === 0) return null;

  const slice = ring.slice(ring.length - k);

  // Undo newest → oldest: undo c_i times, compare with before_i.
  for (let j = 0; j < k; j++) {
    const entry = slice[slice.length - 1 - j]!;
    for (let u = 0; u < entry.commits; u++) {
      if (!canUndo()) {
        ring.length = 0;
        return null;
      }
      dispatchSoakHistory("UNDO", dispatchPath);
    }
    const actual = captureFullSnapshot().canon;
    if (!snapshotsEqual(entry.before, actual, historyIgnoreFields)) {
      const exp = JSON.parse(
        maskCanonicalSnapshot(entry.before, historyIgnoreFields),
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
      const label = formatSoakActionLabel(entry.action);
      return (
        `history chain-undo level ${j + 1} mismatch at action ${actionIndex} ` +
        `(${label}, commits=${entry.commits}):\n${diffText}`
      );
    }
  }

  // Redo oldest → newest among slice: redo c_i times, compare with after_i.
  for (let j = 0; j < k; j++) {
    const entry = slice[j]!;
    for (let r = 0; r < entry.commits; r++) {
      dispatchSoakHistory("REDO", dispatchPath);
    }
    const actual = captureFullSnapshot().canon;
    if (!snapshotsEqual(entry.after, actual, historyIgnoreFields)) {
      const exp = JSON.parse(
        maskCanonicalSnapshot(entry.after, historyIgnoreFields),
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
      const label = formatSoakActionLabel(entry.action);
      return (
        `history chain-redo level ${j + 1} mismatch at action ${actionIndex} ` +
        `(${label}, commits=${entry.commits}):\n${diffText}`
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Position save/load, export/import, checkpoint + reroll round-trip helpers
// ---------------------------------------------------------------------------

export type PositionViolationKind =
  | "save-load"
  | "export-import"
  | "checkpoint"
  | "reroll";

type PositionCheckContext = {
  actionIndex: number;
  action: SoakAction;
  ignoreFields: readonly string[];
  policyRng: RNG;
  dispatchPath: SoakDispatchPath;
};

function formatPositionMismatch(
  kind: PositionViolationKind,
  phase: string,
  actionIndex: number,
  action: SoakAction,
  expected: string,
  actual: string,
  ignoreFields: readonly string[],
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
  return (
    `position ${kind} ${phase} mismatch at action ${actionIndex} ` +
    `(${JSON.stringify(action)}):\n${diffText}`
  );
}

function formatPositionError(
  kind: PositionViolationKind,
  phase: string,
  actionIndex: number,
  action: SoakAction,
  message: string,
): string {
  return (
    `position ${kind} ${phase} at action ${actionIndex} ` +
    `(${JSON.stringify(action)}): ${message}`
  );
}

function deckIdMultiset(deck: CardInstance[]): string[] {
  return deck.map((c) => String(c.id)).sort();
}

function captureDeckRemainders(): { first: string[]; second: string[] } {
  return {
    first: deckIdMultiset(state.players.first.deck),
    second: deckIdMultiset(state.players.second.deck),
  };
}

function captureDeckUidOrders(): { first: string[]; second: string[] } {
  return {
    first: state.players.first.deck.map((c) => c.uid),
    second: state.players.second.deck.map((c) => c.uid),
  };
}

function captureKnownZonesCanon(): string {
  const snap = captureSnapshot();
  const known = {
    firstHand: snap.players.first.hand.map((c) => ({
      uid: c.uid,
      id: c.id,
    })),
    secondHand: snap.players.second.hand.map((c) => ({
      uid: c.uid,
      id: c.id,
    })),
    firstBoard: snap.players.first.board.map((c) =>
      c ? { uid: c.uid, id: c.id } : null,
    ),
    secondBoard: snap.players.second.board.map((c) =>
      c ? { uid: c.uid, id: c.id } : null,
    ),
    firstGraveyard: snap.players.first.graveyard.map((c) => ({
      uid: c.uid,
      id: c.id,
    })),
    secondGraveyard: snap.players.second.graveyard.map((c) => ({
      uid: c.uid,
      id: c.id,
    })),
    firstBanish: (snap.players.first.banish ?? []).map((c) => ({
      uid: c.uid,
      id: c.id,
    })),
    secondBanish: (snap.players.second.banish ?? []).map((c) => ({
      uid: c.uid,
      id: c.id,
    })),
  };
  return canonicalJson(known);
}

function verifyRerollFromCheckpoint(
  ctx: PositionCheckContext,
  checkpointKnownZones: string,
  checkpointDeckRemainders: { first: string[]; second: string[] },
  checkpointDeckUidOrders: { first: string[]; second: string[] },
): string | null {
  const { actionIndex, action } = ctx;

  if (canUndo()) {
    return formatPositionError(
      "reroll",
      "canUndo",
      actionIndex,
      action,
      "canUndo() must be false right after reroll (new history floor)",
    );
  }

  const knownAfter = captureKnownZonesCanon();
  if (knownAfter !== checkpointKnownZones) {
    return formatPositionMismatch(
      "reroll",
      "known-zones",
      actionIndex,
      action,
      checkpointKnownZones,
      knownAfter,
      [],
    );
  }

  const deckAfter = captureDeckRemainders();
  if (
    deckAfter.first.join(",") !== checkpointDeckRemainders.first.join(",") ||
    deckAfter.second.join(",") !== checkpointDeckRemainders.second.join(",")
  ) {
    return formatPositionError(
      "reroll",
      "deck-multiset",
      actionIndex,
      action,
      "undrawn deck remainder multiset must match checkpoint",
    );
  }

  const firstSorted = [...state.players.first.deck.map((c) => c.uid)].sort();
  const cpFirstSorted = [...checkpointDeckUidOrders.first].sort();
  const secondSorted = [...state.players.second.deck.map((c) => c.uid)].sort();
  const cpSecondSorted = [...checkpointDeckUidOrders.second].sort();
  if (
    firstSorted.join(",") !== cpFirstSorted.join(",") ||
    secondSorted.join(",") !== cpSecondSorted.join(",")
  ) {
    return formatPositionError(
      "reroll",
      "deck-permutation",
      actionIndex,
      action,
      "undrawn deck remainder must be a permutation of checkpoint deck",
    );
  }

  const info = getCheckpointInfo();
  if (
    info.originalSeed == null ||
    info.checkpointCursor == null ||
    info.rerollCount !== 1
  ) {
    return formatPositionError(
      "reroll",
      "checkpoint-info",
      actionIndex,
      action,
      `expected rerollCount=1 with RNG metadata, got ${JSON.stringify(info)}`,
    );
  }

  const expectedSeed = deriveRerollSeed(
    info.originalSeed,
    info.checkpointCursor,
    1,
  );
  const rngSnap = state.rng.snapshot();
  if (rngSnap.seed !== expectedSeed) {
    return formatPositionError(
      "reroll",
      "rng",
      actionIndex,
      action,
      `expected RNG on derived sub-seed ${expectedSeed}, got seed=${rngSnap.seed} cursor=${rngSnap.cursor}`,
    );
  }

  return null;
}

export function runPositionSaveLoad(
  ctx: PositionCheckContext,
  opts?: { sabotageSkipLoad?: boolean },
): string | null {
  const { actionIndex, action, ignoreFields, policyRng, dispatchPath } = ctx;

  const legalBeforeSave = captureLegalSnapshot();
  const savedCanon = captureFullSnapshot().canon;
  const saved = savePosition("soak");

  const legal = getLegalSoakActions();
  if (legal.length === 0) {
    deletePosition(saved.id);
    return null;
  }

  const nextAction = pickSoakAction(legal, policyRng);
  applySoakActionWithOutcome(nextAction, dispatchPath);
  const afterFirstCanon = captureFullSnapshot().canon;

  if (!opts?.sabotageSkipLoad) {
    loadPosition(saved.id, { autoRender: false });
    pendingModeChoice = null;
  }
  const loadedCanon = captureFullSnapshot().canon;
  if (!snapshotsEqual(savedCanon, loadedCanon, ignoreFields)) {
    deletePosition(saved.id);
    return formatPositionMismatch(
      "save-load",
      "load",
      actionIndex,
      action,
      savedCanon,
      loadedCanon,
      ignoreFields,
    );
  }

  const legalAfterLoad = canonicalJson(sortSoakActions(getLegalSoakActions()));
  if (legalAfterLoad !== legalBeforeSave) {
    deletePosition(saved.id);
    return formatPositionLegalMismatch(
      actionIndex,
      action,
      "after-load",
      legalBeforeSave,
      legalAfterLoad,
    );
  }

  applySoakActionWithOutcome(nextAction, dispatchPath);
  const afterSecondCanon = captureFullSnapshot().canon;
  if (!snapshotsEqual(afterFirstCanon, afterSecondCanon, ignoreFields)) {
    deletePosition(saved.id);
    return formatPositionMismatch(
      "save-load",
      "re-apply",
      actionIndex,
      action,
      afterFirstCanon,
      afterSecondCanon,
      ignoreFields,
    );
  }

  loadPosition(saved.id, { autoRender: false });
  pendingModeChoice = null;
  deletePosition(saved.id);
  return null;
}

export function runPositionExportImport(
  ctx: PositionCheckContext,
): string | null {
  const { actionIndex, action, ignoreFields } = ctx;

  const savedCanon = captureFullSnapshot().canon;
  const saved = savePosition("soak-export");
  const json = exportPositionToJson(saved.id);

  let imported;
  try {
    imported = importPositionFromJson(json, { load: false });
  } catch (e) {
    deletePosition(saved.id);
    return formatPositionError(
      "export-import",
      "import",
      actionIndex,
      action,
      e instanceof Error ? e.message : String(e),
    );
  }

  loadPosition(imported.id, { autoRender: false });
  pendingModeChoice = null;
  const loadedCanon = captureFullSnapshot().canon;

  deletePosition(saved.id);
  deletePosition(imported.id);

  if (!snapshotsEqual(savedCanon, loadedCanon, ignoreFields)) {
    return formatPositionMismatch(
      "export-import",
      "load",
      actionIndex,
      action,
      savedCanon,
      loadedCanon,
      ignoreFields,
    );
  }

  return null;
}

export function runPositionCheckpoint(
  ctx: PositionCheckContext,
): string | null {
  const { actionIndex, action, ignoreFields, policyRng, dispatchPath } = ctx;

  setCheckpoint();
  const checkpointCanon = captureFullSnapshot().canon;
  const checkpointKnownZones = captureKnownZonesCanon();
  const checkpointDeckRemainders = captureDeckRemainders();
  const checkpointDeckUidOrders = captureDeckUidOrders();

  for (let i = 0; i < 5; i++) {
    if (isGameOver(state)) break;
    const legal = getLegalSoakActions();
    if (legal.length === 0) break;
    const probe = pickSoakAction(legal, policyRng);
    applySoakActionWithOutcome(probe, dispatchPath);
  }

  if (!restoreCheckpoint({ autoRender: false })) {
    return formatPositionError(
      "checkpoint",
      "restore",
      actionIndex,
      action,
      "restoreCheckpoint returned false",
    );
  }

  const restoredCanon = captureFullSnapshot().canon;
  if (!snapshotsEqual(checkpointCanon, restoredCanon, ignoreFields)) {
    return formatPositionMismatch(
      "checkpoint",
      "restore",
      actionIndex,
      action,
      checkpointCanon,
      restoredCanon,
      ignoreFields,
    );
  }

  rerollFromCheckpoint({ autoRender: false });

  const rerollErr = verifyRerollFromCheckpoint(
    ctx,
    checkpointKnownZones,
    checkpointDeckRemainders,
    checkpointDeckUidOrders,
  );
  if (rerollErr) return rerollErr;

  return null;
}

function formatSoakActionLabel(action: SoakAction): string {
  return `${action.type}:${JSON.stringify(action)}`;
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
  if (action.type === "CHOOSE_MODE") {
    invalidateStaleModeCallback();
    if (state.pendingModeChoice) {
      for (const idx of action.indices) {
        applyPendingModePickIndex(idx);
      }
      pendingModeChoice = null;
      return;
    }
    if (pendingModeChoice) {
      const pick = pendingModeChoice;
      pendingModeChoice = null;
      for (const idx of action.indices) {
        pick.pickCallback(idx);
      }
      return;
    }
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
  /** When true, position save/load, export/import, checkpoint, reroll round-trips. */
  positionCheck?: boolean;
  /** Test hook: skip loadPosition during save/load round-trip (must fail). */
  sabotageSkipLoad?: boolean;
  /** Override deck pairing (skips deckSpecForSeed when both are set). */
  deckAId?: string;
  deckBId?: string;
  /** When true, list/dispatch FUSE actions (default false — matches main soak). */
  fuse?: boolean;
  /** When true, resolve mode prompts via modal/CHOOSE_MODE (default false). */
  interactiveModes?: boolean;
  /** Parity soak: capture legal + state fingerprint after each applied action. */
  onAfterAction?: (ctx: {
    actionIndex: number;
    action: SoakAction;
    legal: string;
    stateFp: string;
  }) => void;
  /** Top-level fields to ignore in parity state fingerprint (internal). */
  parityIgnoreFields?: readonly string[];
};

/**
 * Play one complete random seeded game. Records a full action trace for repro.
 */
export async function runSoakGame(
  opts: RunSoakGameOptions,
): Promise<SoakGameResult> {
  const fuse = opts.fuse ?? false;
  const interactiveModes = opts.interactiveModes ?? false;
  activeSoakRunOptions = { fuse, interactiveModes };
  (globalThis as any).__SVWB_INTERACTIVE_MODES__ = interactiveModes;
  installSoakAdapter({ interactiveModes });
  confirmHook = null;
  pendingModeChoice = null;

  if (opts.historyCheck || opts.positionCheck) {
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
  const historyRing: HistoryRingEntry[] = [];
  const commitSequence: NonNullable<SoakGameResult["commitSequence"]> = [];
  const nonUndoableActionTypes = new Set<string>();
  const playBlockedLog: SoakGameResult["playBlockedLog"] = [];
  const zeroCommitLog: NonNullable<SoakGameResult["zeroCommitLog"]> = [];
  const actionTypeCounts: Record<string, number> = {};
  const dispatchPath = opts.dispatch ?? DEFAULT_SOAK_DISPATCH;
  const historyReExecute = opts.historyReExecute ?? false;
  const positionCheck = opts.positionCheck ?? false;
  const sabotageSkipLoad = opts.sabotageSkipLoad ?? false;
  const historyIgnoreFields =
    opts.historyIgnoreFields ??
    (opts.historyCheck || positionCheck
      ? [...PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS]
      : []);
  let positionChecks = 0;
  if (positionCheck) {
    _resetPositionStoreForTests();
  }
  let unsubHistoryReset: (() => void) | undefined;
  if (opts.historyCheck || positionCheck) {
    unsubHistoryReset = onHistoryEvent((ev) => {
      if (ev.type === "reset") {
        historyRing.length = 0;
      }
      if (ev.type === "undo" || ev.type === "redo" || ev.type === "reset") {
        pendingModeChoice = null;
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

      const needsCommitTelemetry = opts.historyCheck || positionCheck;
      const beforeSnap = needsCommitTelemetry ? captureFullSnapshot() : null;
      const legalBefore = opts.historyCheck ? captureLegalSnapshot() : null;

      const telemetry = needsCommitTelemetry
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
      actionTypeCounts[action.type] = (actionTypeCounts[action.type] ?? 0) + 1;

      if (opts.onAfterAction) {
        const parityIgnore =
          opts.parityIgnoreFields ??
          (opts.historyCheck || positionCheck
            ? [...PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS]
            : []);
        let stateFp: string;
        if (parityIgnore.length === 0) {
          stateFp = safeHash();
        } else {
          const afterCanon = captureFullSnapshot().canon;
          stateFp = maskCanonicalSnapshot(afterCanon, parityIgnore);
        }
        opts.onAfterAction({
          actionIndex: actions,
          action,
          legal: captureLegalSnapshot(),
          stateFp,
        });
      }

      if (needsCommitTelemetry && beforeSnap) {
        if (historyCommits === 0) {
          if (opts.historyCheck) {
            nonUndoableActionTypes.add(action.type);
            if (telemetry.zeroCommitReason) {
              zeroCommitLog.push({
                actionIndex: actions,
                actionType: action.type,
                reason: telemetry.zeroCommitReason,
              });
            }
          }
        } else {
          if (opts.historyCheck && legalBefore) {
            const afterSnap = captureFullSnapshot();
            const legalAfter = captureLegalSnapshot();

            commitSequence.push({
              actionType: action.type,
              commits: historyCommits,
            });

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
                commitSequence,
                positionChecks,
              };
            }

            historyRing.push({
              action,
              commits: historyCommits,
              before: beforeSnap.canon,
              after: afterSnap.canon,
            });
            if (historyRing.length > HISTORY_RING_MAX) historyRing.shift();

            if (actions % 25 === 0 && historyRing.length > 0) {
              const chainErr = runDeepHistoryChain(
                actions,
                historyRing,
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
                  commitSequence,
                  positionChecks,
                };
              }
            }
          }

          if (positionCheck) {
            const posCtx: PositionCheckContext = {
              actionIndex: actions,
              action,
              ignoreFields: historyIgnoreFields,
              policyRng,
              dispatchPath,
            };

            positionChecks++;
            const saveLoadErr = runPositionSaveLoad(posCtx, {
              sabotageSkipLoad,
            });
            if (saveLoadErr) {
              return {
                ...base,
                outcome: "position",
                turns: state.turnNumber | 0,
                actions,
                finalHash: safeHash(),
                error: saveLoadErr,
                findings: [saveLoadErr],
                nonUndoableActionTypes: [...nonUndoableActionTypes].sort(),
                playBlockedLog,
                zeroCommitLog,
                commitSequence,
                positionChecks,
              };
            }

            if (actions % 10 === 0) {
              positionChecks++;
              const exportErr = runPositionExportImport(posCtx);
              if (exportErr) {
                return {
                  ...base,
                  outcome: "position",
                  turns: state.turnNumber | 0,
                  actions,
                  finalHash: safeHash(),
                  error: exportErr,
                  findings: [exportErr],
                  nonUndoableActionTypes: [...nonUndoableActionTypes].sort(),
                  playBlockedLog,
                  zeroCommitLog,
                  commitSequence,
                  positionChecks,
                };
              }
            }

            if (actions % 25 === 0) {
              positionChecks++;
              const checkpointErr = runPositionCheckpoint(posCtx);
              if (checkpointErr) {
                return {
                  ...base,
                  outcome: "position",
                  turns: state.turnNumber | 0,
                  actions,
                  finalHash: safeHash(),
                  error: checkpointErr,
                  findings: [checkpointErr],
                  nonUndoableActionTypes: [...nonUndoableActionTypes].sort(),
                  playBlockedLog,
                  zeroCommitLog,
                  commitSequence,
                  positionChecks,
                };
              }
            }
          }
        }
      } else if (!needsCommitTelemetry) {
        void telemetry;
      }

      if (opts.coverage) scanZonesForCoverage(opts.coverage);

      if (!opts.skipInvariants) {
        const attackCtx = {
          seed: opts.seed,
          gameIndex: opts.gameIndex,
          actionIndex: actions,
          actionType: action.type,
        };
        const attackFindings = assertAttackFlagsConsistent(state, attackCtx);
        if (attackFindings.length) {
          return {
            ...base,
            outcome: "attack-flags",
            turns: state.turnNumber | 0,
            actions,
            finalHash: safeHash(),
            error: attackFindings.map((f) => f.message).join("; "),
            findings: attackFindings.map((f) => f.message),
            nonUndoableActionTypes: [...nonUndoableActionTypes].sort(),
            playBlockedLog,
            zeroCommitLog,
            commitSequence,
            positionChecks,
          };
        }

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
    activeSoakRunOptions = { fuse: false, interactiveModes: false };
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = false;
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
    commitSequence,
    actionTypeCounts,
    ...(positionCheck ? { positionChecks } : {}),
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
  opts?: {
    dispatch?: SoakDispatchPath;
    fuse?: boolean;
    interactiveModes?: boolean;
  },
): Promise<{ hash: string; error?: string }> {
  const fuse = opts?.fuse ?? false;
  const interactiveModes = opts?.interactiveModes ?? false;
  prepareSoakReplay({ fuse, interactiveModes });
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
  } finally {
    activeSoakRunOptions = { fuse: false, interactiveModes: false };
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = false;
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
