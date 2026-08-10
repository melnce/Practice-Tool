import type { PlayerAction, GameState } from "../../core/types/index.js";
import { playCard } from "./replayScenarioDsl.js";
import type { ReplayInvariant } from "./replayInvariants.js";

import {
  invHandSize,
  invBoardSize,
  invCardMoved,
  invCardMovedByUid,
} from "./replayInvariants.js";
import { getHand, getPP } from "../../core/playerHelpers.js";

/**
 * Static scenario with pre-defined actions.
 */
export interface ScenarioInitParams {
  startingPP?: number;
  initialDraw?: number;
}

export type ScenarioBuildResult =
  | readonly PlayerAction[]
  | { actions: readonly PlayerAction[]; meta: Record<string, any> };

export interface DynamicReplayScenario {
  id: string;
  seed: number;
  /** Build actions dynamically from initialized state */
  build: (state: GameState) => ScenarioBuildResult;
  versionTag?: string;
  /** Description of what this scenario tests */
  description?: string;
  /** Semantic assertions to run after replay */
  invariants?: readonly ReplayInvariant[];
  initParams?: ScenarioInitParams;
}

export interface StaticReplayScenario {
  id: string;
  seed: number;
  actions: readonly PlayerAction[];
  versionTag?: string;
  /** Description of what this scenario tests */
  description?: string;
  /** Semantic assertions to run after replay */
  invariants?: readonly ReplayInvariant[];
  initParams?: ScenarioInitParams;
}

export type ReplayScenario = StaticReplayScenario | DynamicReplayScenario;

/** Type guard to check if scenario is dynamic */
export function isDynamicScenario(
  s: ReplayScenario,
): s is DynamicReplayScenario {
  return "build" in s && typeof s.build === "function";
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLAY SCENARIOS - Deterministic scenarios for golden file testing
// Each scenario must:
// - Be deterministic (seeded)
// - Be self-contained (no external state)
// - Use only actions (no direct state mutation)
// - Be short (≤ 10 actions) and focused
// - Target a specific subsystem
// ─────────────────────────────────────────────────────────────────────────────

export const REPLAY_SCENARIOS: readonly ReplayScenario[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1: Baseline Turn Passing
  // Tests: Turn system, PP regen, draw on turn start
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "baseline_turn_pass",
    seed: 12345,
    description: "Basic turn passing - tests turn system and resource regen",
    actions: [
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2: History/Undo System
  // Tests: Undo/redo functionality, state restoration
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "history_undo_redo",
    seed: 999,
    description: "History system - tests undo/redo state restoration",
    actions: [
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "UNDO" },
      { type: "UNDO" },
      { type: "REDO" },
      { type: "END_TURN" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3: Multi-Turn Resource Accumulation
  // Tests: PP max increase, turn counting, deck drawing
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "resource_accumulation",
    seed: 54321,
    description:
      "Multi-turn resource accumulation - tests PP growth and hand size",
    actions: [
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4: History Reset
  // Tests: History reset clears undo stack
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "history_reset",
    seed: 42,
    description: "History reset - tests that reset clears the undo stack",
    actions: [
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "RESET_HISTORY" },
      { type: "END_TURN" },
      { type: "UNDO" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5: Extended Turn Sequence
  // Tests: Long game stability, no state drift
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "extended_turn_sequence",
    seed: 77777,
    description: "Extended turn sequence - tests long game stability",
    actions: [
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "END_TURN" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 6: Interleaved Undo/Redo
  // Tests: Complex history navigation
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "interleaved_history",
    seed: 31337,
    description: "Interleaved undo/redo - tests complex history navigation",
    actions: [
      { type: "END_TURN" },
      { type: "UNDO" },
      { type: "END_TURN" },
      { type: "END_TURN" },
      { type: "UNDO" },
      { type: "REDO" },
      { type: "UNDO" },
      { type: "REDO" },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Dynamic Scenarios (Actions generated at runtime)
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario 7: Basic Play Card (Dynamic)
  // Tests: Playing a card dynamically found in hand
  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // Scenario 7: Basic Play Card (Dynamic)
  // Tests: Playing a card dynamically found in hand
  // ─────────────────────────────────────────────────────────────────────────────
  {
    id: "play_card_basic",
    seed: 100000,
    description:
      "Plays the first available card from hand (preferring cheap/no-target)",
    initParams: { startingPP: 10, initialDraw: 12 }, // Ensure lots of PP and options
    build: (gameState) => {
      const hand = getHand(gameState, "first");

      // Prefer cards that are usually safe to play (no mandatory targets)
      // Prefer cards that are usually safe to play (no mandatory targets)
      const SAFE_CARDS = [
        "Goblin",
        "Indomitable Fighter",
        "Flashstep Quickblader",
        "Water Fairy",
        "Fairy Circle",
      ];

      let targetIndex = hand.findIndex((c) => SAFE_CARDS.includes(c.name));

      // Fallback to any card if no safe ones found (might fail dispatch if target required, but we tried)
      if (targetIndex === -1) {
        targetIndex = 0;
      }

      const card = hand[targetIndex];

      // Ensure card is defined before accessing name
      if (!card) {
        const debugMsg = `[SCENARIO FAIL] No cards in hand. PP: ${getPP(gameState, "first")}`;
        throw new Error(debugMsg);
      }

      const cardName = card.name;

      const actions: PlayerAction[] = [
        playCard(gameState, "first", { index: targetIndex }),
      ];

      return {
        actions,
        meta: { playedCardName: cardName },
      };
    },
    invariants: [
      invCardMoved("played_to_board", {
        metaKey: "playedCardName",
        player: "first",
        fromZone: "hand",
        toZone: "board",
      }),
      invHandSize("blue_hand_dec", "first", 8), // 9 - 1 = 8 (Assuming cap 9)
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 8: Multiple Card Plays
  // Tests: Multiple card plays in sequence
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "multiple_plays",
    seed: 100002,
    description: "Multiple card plays - tests sequential play pipeline",
    initParams: { startingPP: 10, initialDraw: 12 },
    build: (gameState) => {
      const actions: PlayerAction[] = [];
      const hand = getHand(gameState, "first");

      // Strict Mode: Require at least 2 distinct playable cards (Follower, Cost <= 3)
      // Filter hand to find valid card instances
      const playableCards = hand.filter(
        (c) => c.type === "Follower" && Number(c.cost) <= 3,
      );

      if (playableCards.length < 2) {
        // FAIL if requirements not met
        const msg = `[SCENARIO FAIL] multiple_plays requires at least 2 playable followers (Cost <= 3). Found ${playableCards.length}. Hand: ${hand.map((c) => `${c.name}(${c.cost})`).join(",")}`;
        throw new Error(msg);
      }

      // Deterministic selection: Pick first two matches
      const card1 = playableCards[0]!;
      const card2 = playableCards[1]!;

      // Strict check: UIDs must be distinct (should always be true for distinct objects)
      if (card1.uid === card2.uid) {
        throw new Error(
          `[SCENARIO FAIL] Selected same card UID twice: ${card1.uid}`,
        );
      }

      // Build actions using Strict UID Selector
      actions.push(playCard(gameState, "first", { uid: card1.uid }));
      actions.push(playCard(gameState, "first", { uid: card2.uid }));

      // Return actions + meta for invariants
      return {
        actions,
        meta: {
          playedUid1: card1.uid,
          playedUid2: card2.uid,
        },
      };
    },
    invariants: [
      invBoardSize("blue_board_size_2", "first", 2),
      invCardMovedByUid("first_play", {
        metaKey: "playedUid1",
        player: "first",
        fromZone: "hand",
        toZone: "board",
      }),
      invCardMovedByUid("second_play", {
        metaKey: "playedUid2",
        player: "first",
        fromZone: "hand",
        toZone: "board",
      }),
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 9: Play then End Turn
  // Tests: Card play followed by turn end
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "play_then_end",
    seed: 100003,
    description: "Play card then end turn - tests turn transition after play",
    initParams: { startingPP: 10, initialDraw: 12 },
    build: (gameState) => {
      const actions: PlayerAction[] = [];

      try {
        // Play index 0, assuming robust starting hand or fallback
        // Use Follower to ensure board size invariant passes
        actions.push(
          playCard(gameState, "first", { cardType: "Follower", index: 0 }),
        );
      } catch {
        // No card available
      }

      actions.push({ type: "END_TURN" });
      actions.push({ type: "END_TURN" });

      return actions;
    },
    invariants: [invBoardSize("blue_retains_board", "first", 1)],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 10: Alternating Players
  // Tests: Both players playing cards
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "alternating_plays",
    seed: 100004,
    description: "Alternating player plays - tests both sides playing",
    initParams: { startingPP: 10, initialDraw: 12 },
    build: (gameState) => {
      const actions: PlayerAction[] = [];

      // Blue plays first
      try {
        actions.push(playCard(gameState, "first", { index: 0 }));
      } catch {
        /* skip */
      }

      // End blue turn
      actions.push({ type: "END_TURN" });

      // Red plays
      try {
        actions.push(playCard(gameState, "second", { index: 0 }));
      } catch {
        /* skip */
      }

      // End red turn
      actions.push({ type: "END_TURN" });

      return actions;
    },
  },
];
