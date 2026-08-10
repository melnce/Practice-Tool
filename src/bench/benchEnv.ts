// src/bench/benchEnv.ts
// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK ENVIRONMENT - Clean wrapper for AI/benchmark simulation loops
// Exposes: reset, getLegalActions, applyAction, isTerminal
// ─────────────────────────────────────────────────────────────────────────────

// Import directly from specific files to avoid circular dependency issues
// with the type barrel exports
import { state, resetGameState } from "../core/gameState.js";
import type { PlayerSlot } from "../core/types/player.js";
import { canPlayCard } from "../logic/core/playCard/preflight.js";
import { playCardNoRender } from "../logic/core/playCard/index.js";
import { attackFollower, attackLeader } from "../logic/core/combat.js";
import { endTurnBlue, endTurnRed } from "../logic/core/turns.js";
import {
  getBoard,
  getHand,
  getPP,
  getHP,
  opponentOf,
} from "../core/playerHelpers.js";
import { getEffectiveCost } from "../logic/core/playCard/cost.js";
import { performance } from "perf_hooks";

// =============================================================================
// TYPES
// =============================================================================

// Use 'any' for CardInstance to avoid importing from types/index.js
// which has circular dependency with effects
type CardInstance = any;

export type BenchAction =
  | { type: "PLAY_CARD"; handIndex: number }
  | { type: "ATTACK_FOLLOWER"; attackerIdx: number; defenderIdx: number }
  | { type: "ATTACK_LEADER"; attackerIdx: number }
  | { type: "END_TURN" };

export interface BenchStats {
  firstHP: number;
  secondHP: number;
  firstBoardSize: number;
  secondBoardSize: number;
  firstHandSize: number;
  secondHandSize: number;
  turn: number;
  activePlayer: PlayerSlot;
}

// =============================================================================
// TIMING INSTRUMENTATION
// =============================================================================

interface TimingBucket {
  count: number;
  ms: number;
}

function createBucket(): TimingBucket {
  return { count: 0, ms: 0 };
}

export interface BenchTiming {
  enabled: boolean;
  // Level 1: Per action type
  PLAY_CARD: TimingBucket;
  ATTACK_FOLLOWER: TimingBucket;
  ATTACK_LEADER: TimingBucket;
  END_TURN: TimingBucket;
  // Level 2: Internal stages (accumulated across all action types)
  stages: {
    preflight: TimingBucket; // canPlayCard, board checks
    cardResolution: TimingBucket; // playCardCore inner work
    combatResolution: TimingBucket; // attackFollower/Leader core
    turnTransition: TimingBucket; // endTurn core
    triggerProcessing: TimingBucket; // fireTrigger calls
    effectProcessing: TimingBucket; // runEffects calls
  };
  reset(): void;
  summary(): {
    byActionType: Record<string, { count: number; ms: number; avgUs: number }>;
    byStage: Record<
      string,
      { count: number; ms: number; pct: number; avgUs: number }
    >;
    totalApplyMs: number;
  };
}

export const benchTiming: BenchTiming = {
  enabled: false,
  PLAY_CARD: createBucket(),
  ATTACK_FOLLOWER: createBucket(),
  ATTACK_LEADER: createBucket(),
  END_TURN: createBucket(),
  stages: {
    preflight: createBucket(),
    cardResolution: createBucket(),
    combatResolution: createBucket(),
    turnTransition: createBucket(),
    triggerProcessing: createBucket(),
    effectProcessing: createBucket(),
  },
  reset() {
    this.PLAY_CARD = createBucket();
    this.ATTACK_FOLLOWER = createBucket();
    this.ATTACK_LEADER = createBucket();
    this.END_TURN = createBucket();
    this.stages = {
      preflight: createBucket(),
      cardResolution: createBucket(),
      combatResolution: createBucket(),
      turnTransition: createBucket(),
      triggerProcessing: createBucket(),
      effectProcessing: createBucket(),
    };
  },
  summary() {
    const totalApplyMs =
      this.PLAY_CARD.ms +
      this.ATTACK_FOLLOWER.ms +
      this.ATTACK_LEADER.ms +
      this.END_TURN.ms;

    const byActionType: Record<
      string,
      { count: number; ms: number; avgUs: number }
    > = {};
    for (const key of [
      "PLAY_CARD",
      "ATTACK_FOLLOWER",
      "ATTACK_LEADER",
      "END_TURN",
    ] as const) {
      const b = this[key];
      byActionType[key] = {
        count: b.count,
        ms: b.ms,
        avgUs: b.count > 0 ? (b.ms * 1000) / b.count : 0,
      };
    }

    const totalStageMs = Object.values(this.stages).reduce(
      (a, b) => a + b.ms,
      0,
    );
    const byStage: Record<
      string,
      { count: number; ms: number; pct: number; avgUs: number }
    > = {};
    for (const [key, b] of Object.entries(this.stages)) {
      byStage[key] = {
        count: b.count,
        ms: b.ms,
        pct: totalStageMs > 0 ? (b.ms / totalStageMs) * 100 : 0,
        avgUs: b.count > 0 ? (b.ms * 1000) / b.count : 0,
      };
    }

    return { byActionType, byStage, totalApplyMs };
  },
};

// Helper to record stage timing
function recordStage(stage: keyof typeof benchTiming.stages, ms: number): void {
  if (!benchTiming.enabled) return;
  benchTiming.stages[stage].count++;
  benchTiming.stages[stage].ms += ms;
}

// =============================================================================
// BENCH ENVIRONMENT
// =============================================================================

/**
 * Reset the game state to an initial playable state.
 * Sets up minimal hands/decks for benchmarking.
 */
export function reset(seed: number): void {
  resetGameState(seed);

  // Set up minimal playable state
  // Both players get some PP, followers in hand, and start with full HP
  const setupPlayer = (slot: PlayerSlot) => {
    const ps = state.players[slot];

    // Resources
    ps.hp = 20;
    ps.maxHP = 20;
    ps.pp = 10; // Max PP for flexibility
    ps.maxPP = 10;
    ps.evoCharges = 2;
    ps.superEvoCharges = 2;

    // Create simple followers for the deck/hand
    // Using inline cards to avoid card database dependency for pure benchmarking
    const makeFollower = (idx: number): CardInstance => ({
      uid: state.rng.makeUid("bench"),
      id: `bench_follower_${idx}`,
      name: `Bench Follower ${idx}`,
      type: "Follower",
      cost: (idx % 3) + 1, // Costs 1, 2, 3
      attack: 2,
      defense: 2,
      zone: "hand",
      owner: slot,
      can_attack: false,
      hasAttacked: false,
      justPlayed: true,
    });

    // Hand: 4 followers
    ps.hand = [
      makeFollower(1),
      makeFollower(2),
      makeFollower(3),
      makeFollower(4),
    ];

    // Deck: more cards for longer games
    ps.deck = [];
    for (let i = 5; i <= 20; i++) {
      ps.deck.push({ ...makeFollower(i), zone: "deck" });
    }

    // Board: start empty
    ps.board = [];
    ps.graveyard = [];
  };

  setupPlayer("first");
  setupPlayer("second");

  // First player's turn
  state.activePlayer = "first";
  state.gameStarted = true;
  state.roundCount = 1;
  state.turnNumber = 1;
}

/**
 * Get all legal actions for the current player.
 * Returns an array of BenchAction objects.
 */
export function getLegalActions(): BenchAction[] {
  const preflightStart = benchTiming.enabled ? performance.now() : 0;

  const actions: BenchAction[] = [];
  const player = state.activePlayer;
  const hand = getHand(state, player);
  const myBoard = getBoard(state, player);
  const enemyBoard = getBoard(state, opponentOf(player));
  const availablePP = getPP(state, player);

  // 1. Play cards from hand
  for (let i = 0; i < hand.length; i++) {
    const card = hand[i];
    if (!card) continue;

    // Check PP
    const cost = getEffectiveCost(card);
    if (cost > availablePP) continue;

    // Check board space for permanents
    if (
      (card.type === "Follower" || card.type === "Amulet") &&
      myBoard.length >= 5
    ) {
      continue;
    }

    // Check playability
    const check = canPlayCard(card, player);
    if (check.ok) {
      actions.push({ type: "PLAY_CARD", handIndex: i });
    }
  }

  // 2. Attack with followers
  for (let i = 0; i < myBoard.length; i++) {
    const attacker = myBoard[i];
    if (!attacker) continue;
    if (attacker.type !== "Follower") continue;

    // Check if can attack
    if (!attacker.can_attack) continue;
    if (attacker.hasAttacked) continue;
    if (attacker.justPlayed && !hasStorm(attacker)) continue;
    if (isAttackForbidden(attacker)) continue;

    // Check for Ward on enemy board
    const hasEnemyWard = enemyBoard.some(
      (c: CardInstance) => c && c.type === "Follower" && hasWard(c),
    );

    // Attack enemy followers
    for (let j = 0; j < enemyBoard.length; j++) {
      const defender = enemyBoard[j];
      if (!defender) continue;
      if (defender.type !== "Follower") continue;
      if (hasAmbush(defender)) continue;

      // If enemy has Ward, can only attack Ward followers
      if (hasEnemyWard && !hasWard(defender)) continue;

      actions.push({ type: "ATTACK_FOLLOWER", attackerIdx: i, defenderIdx: j });
    }

    // Attack enemy leader (only if no Ward)
    if (!hasEnemyWard) {
      actions.push({ type: "ATTACK_LEADER", attackerIdx: i });
    }
  }

  // 3. End turn (always legal)
  actions.push({ type: "END_TURN" });

  if (benchTiming.enabled) {
    recordStage("preflight", performance.now() - preflightStart);
  }

  return actions;
}

/**
 * Apply a legal action to the current game state.
 * With optional timing instrumentation.
 */
export function applyAction(action: BenchAction): void {
  if (!benchTiming.enabled) {
    applyActionCore(action);
    return;
  }

  const start = performance.now();
  applyActionCore(action);
  const elapsed = performance.now() - start;

  // Record by action type
  benchTiming[action.type].count++;
  benchTiming[action.type].ms += elapsed;
}

/**
 * Core action application (no timing overhead).
 */
function applyActionCore(action: BenchAction): void {
  // PERF: Increment action sequence for cache invalidation
  (state as any).actionSeq = ((state as any).actionSeq ?? 0) + 1;

  const player = state.activePlayer;
  const hand = getHand(state, player);

  switch (action.type) {
    case "PLAY_CARD": {
      const stageStart = benchTiming.enabled ? performance.now() : 0;
      playCardNoRender(hand, player, action.handIndex);
      if (benchTiming.enabled) {
        recordStage("cardResolution", performance.now() - stageStart);
      }
      break;
    }
    case "ATTACK_FOLLOWER": {
      const stageStart = benchTiming.enabled ? performance.now() : 0;
      attackFollower(
        action.attackerIdx,
        action.defenderIdx,
        player,
        opponentOf(player),
      );
      if (benchTiming.enabled) {
        recordStage("combatResolution", performance.now() - stageStart);
      }
      break;
    }
    case "ATTACK_LEADER": {
      const stageStart = benchTiming.enabled ? performance.now() : 0;
      attackLeader(action.attackerIdx, player, opponentOf(player));
      if (benchTiming.enabled) {
        recordStage("combatResolution", performance.now() - stageStart);
      }
      break;
    }
    case "END_TURN": {
      const stageStart = benchTiming.enabled ? performance.now() : 0;
      if (player === "first") {
        endTurnBlue();
      } else {
        endTurnRed();
      }
      if (benchTiming.enabled) {
        recordStage("turnTransition", performance.now() - stageStart);
      }
      break;
    }
  }
}

/**
 * Check if the game is in a terminal state (either player HP <= 0).
 */
export function isTerminal(): boolean {
  return (
    getHP(state, "first") <= 0 ||
    getHP(state, "second") <= 0 ||
    state.players.first.defeated ||
    state.players.second.defeated
  );
}

/**
 * Get the current active player.
 */
export function getActivePlayer(): PlayerSlot {
  return state.activePlayer;
}

/**
 * Get current game statistics.
 */
export function getStats(): BenchStats {
  return {
    firstHP: getHP(state, "first"),
    secondHP: getHP(state, "second"),
    firstBoardSize: getBoard(state, "first").length,
    secondBoardSize: getBoard(state, "second").length,
    firstHandSize: getHand(state, "first").length,
    secondHandSize: getHand(state, "second").length,
    turn: state.turnNumber,
    activePlayer: state.activePlayer,
  };
}

// =============================================================================
// KEYWORD HELPERS
// =============================================================================

function hasStorm(card: CardInstance): boolean {
  if (card.storm) return true;
  if (!card.keywords) return false;
  return card.keywords.some((k: any) => {
    const name = typeof k === "string" ? k : k?.name;
    return name?.toLowerCase() === "storm";
  });
}

function hasWard(card: CardInstance): boolean {
  if (card.ward) return true;
  if (!card.keywords) return false;
  return card.keywords.some((k: any) => {
    const name = typeof k === "string" ? k : k?.name;
    return name?.toLowerCase() === "ward";
  });
}

function hasAmbush(card: CardInstance): boolean {
  if (card.ambush) return true;
  if (!card.keywords) return false;
  return card.keywords.some((k: any) => {
    const name = typeof k === "string" ? k : k?.name;
    return name?.toLowerCase() === "ambush";
  });
}

function isAttackForbidden(card: CardInstance): boolean {
  // Cards with can't attack flags
  if (card.cant_attack) return true;
  // Amulets can't attack
  if (card.type === "Amulet") return true;
  return false;
}
