/**
 * Proves canonicalizeCard / hashGameState detect keyword runtime divergence.
 */
import { describe, it, expect } from "vitest";
import { createInitialState } from "../../src/core/gameState.js";
import { hashGameState } from "../../src/core/stateHash.js";
import type { CardInstance } from "../../src/core/types/index.js";
import type { Effect } from "../../src/core/types/effects.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function boardCard(overrides: Partial<CardInstance> = {}): CardInstance {
  return {
    id: "10001110",
    uid: "uid_test",
    name: "Test Follower",
    type: "Follower",
    cost: 2,
    attack: 2,
    defense: 2,
    ...overrides,
  } as CardInstance;
}

function withBoardCard(
  mutate?: (card: CardInstance) => void,
): ReturnType<typeof createInitialState> {
  const state = createInitialState(42);
  const card = boardCard();
  mutate?.(card);
  state.players.first.board = [card];
  return state;
}

describe("state hash keyword divergence", () => {
  it("keywordState {} hashes identically to absent keywordState", () => {
    const withEmpty = withBoardCard((c) => {
      c.keywordState = {};
    });
    const without = withBoardCard();
    expect(hashGameState(withEmpty)).toBe(hashGameState(without));
  });

  it("stable under object key insertion order", () => {
    const orderedA = withBoardCard((c) => {
      c.keywordState = {
        engagedThisTurn: true,
        cannotBeDestroyed: true,
        spellboostCount: 2,
      };
    });
    const orderedB = withBoardCard((c) => {
      c.keywordState = {};
      c.keywordState!.spellboostCount = 2;
      c.keywordState!.cannotBeDestroyed = true;
      c.keywordState!.engagedThisTurn = true;
    });
    expect(hashGameState(orderedA)).toBe(hashGameState(orderedB));
  });

  it("changes hash when mutating one keyword runtime field at a time", () => {
    const base = hashGameState(withBoardCard());

    const cases: Array<[string, (c: CardInstance) => void]> = [
      [
        "engagedThisTurn",
        (c) => {
          c.hasEngage = true;
          c.keywordState = { ...(c.keywordState ?? {}), engagedThisTurn: true };
        },
      ],
      [
        "spellboostCount",
        (c) => {
          c.keywordState = { ...(c.keywordState ?? {}), spellboostCount: 3 };
        },
      ],
      [
        "hasAmbush",
        (c) => {
          c.hasAmbush = true;
        },
      ],
      [
        "countdown",
        (c) => {
          c.hasCountdown = true;
          c.countdown = 3;
        },
      ],
      [
        "cannotBeDestroyed",
        (c) => {
          c.keywordState = {
            ...(c.keywordState ?? {}),
            cannotBeDestroyed: true,
          };
        },
      ],
    ];

    for (const [label, mutate] of cases) {
      const card = boardCard();
      mutate(card);
      const state = createInitialState(42);
      state.players.first.board = [card];
      expect(hashGameState(state), label).not.toBe(base);
    }
  });

  it("does not change hash when mutating excluded static effect arrays", () => {
    const dummyEffect: Effect = { op: "noop" } as Effect;
    const base = withBoardCard((c) => {
      c.keywordState = {
        hasStrike: true,
        strikeEffects: [],
        hasEngage: true,
        engageEffects: [],
        hasRally: true,
        rallyEffects: [],
        lastWordsEffects: [],
        triggers: [],
      };
      c.lastWordsEffects = [];
      c.triggers = [];
    });

    const baseHash = hashGameState(base);
    const mutated = withBoardCard((c) => {
      c.keywordState = {
        hasStrike: true,
        strikeEffects: [dummyEffect],
        hasEngage: true,
        engageEffects: [dummyEffect],
        hasRally: true,
        rallyEffects: [dummyEffect],
        lastWordsEffects: [dummyEffect],
        triggers: [{ when: "turn_start", effects: [dummyEffect] }],
      };
      c.lastWordsEffects = [dummyEffect];
      c.triggers = [{ when: "turn_start", effects: [dummyEffect] }];
      c.fanfare = [dummyEffect];
    });

    expect(hashGameState(mutated)).toBe(baseHash);
  });

  it("golden replay final hash diverges after keyword mutation (replay gate would fail)", async () => {
    const goldenPath = path.join(
      ROOT,
      "replays/golden/baseline_turn_pass.json",
    );
    const golden = JSON.parse(fs.readFileSync(goldenPath, "utf-8")) as {
      seed: number;
      final: { stateHash: string };
    };

    const { REPLAY_SCENARIOS } =
      await import("../../src/logic/core/replayScenarios.js");
    const { dispatchAction } = await import("../../src/logic/core/dispatch.js");
    const { resetGameState, state } =
      await import("../../src/core/gameState.js");
    const { initCardDatabaseNode } =
      await import("../../src/data/cardLoaderNode.js");
    const { setGlobalTrace, createArrayTrace } =
      await import("../../src/logic/core/effects/trace.js");

    await initCardDatabaseNode();
    const scenario = REPLAY_SCENARIOS.find(
      (s) => s.id === "baseline_turn_pass",
    );
    expect(scenario).toBeDefined();

    resetGameState(scenario!.seed);
    const trace = createArrayTrace();
    setGlobalTrace(trace);

    for (const action of scenario!.actions ?? []) {
      dispatchAction(state, action, null);
    }

    const cleanHash = hashGameState(state);
    expect(cleanHash).toBe(golden.final.stateHash);

    const card = state.players.first.board[0] ?? state.players.second.board[0];
    if (card) {
      card.keywordState = {
        ...(card.keywordState ?? {}),
        engagedThisTurn: true,
      };
    } else {
      state.players.first.board = [
        boardCard({
          keywordState: { engagedThisTurn: true },
        }),
      ];
    }
    const mutatedHash = hashGameState(state);
    expect(mutatedHash).not.toBe(cleanHash);
    expect(mutatedHash).not.toBe(golden.final.stateHash);
  });
});
