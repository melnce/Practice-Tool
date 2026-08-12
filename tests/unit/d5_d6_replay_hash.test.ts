/**
 * D5: replay gate must fail on corrupted capsules (no vacuous undefined===undefined).
 * D6: hashGameState must see turn/phase/crests/banish/rng/etc.
 */
import { describe, it, expect } from "vitest";
import { diffReplays } from "../../src/logic/core/replayVerify.js";
import { createInitialState } from "../../src/core/gameState.js";
import { hashGameState } from "../../src/core/stateHash.js";
import type { ReplayCapsule } from "../../src/logic/core/replay.js";

describe("D5: replayVerify rejects vacuous / corrupted capsules", () => {
  const golden: ReplayCapsule = {
    version: "1.0.0",
    seed: 12345,
    actions: [{ type: "END_TURN" }],
    initial: { stateHash: "aaaaaaaa" },
    final: { stateHash: "bbbbbbbb" },
    trace: [],
  };

  it("string-shaped capsules (legacy scripts/replay.ts) do not match", () => {
    const corrupted = {
      id: "baseline_turn_pass",
      initial: "totally different",
      final: '{"blueHP":0,"everything":"wrong"}',
      trace: [],
    };
    const diff = diffReplays(corrupted as any, golden);
    expect(diff.ok).toBe(false);
    expect(diff.initialStateHashMatch).toBe(false);
    expect(diff.finalStateHashMatch).toBe(false);
    expect(diff.seedMatch).toBe(false);
  });

  it("two string-shaped capsules do not vacuously pass against each other", () => {
    const a = {
      initial: "A",
      final: "B",
      trace: [],
    };
    const b = {
      initial: "CORRUPT",
      final: "CORRUPT",
      trace: [],
    };
    expect(diffReplays(a as any, b as any).ok).toBe(false);
  });

  it("real capsules with mismatched final hash fail", () => {
    const bad: ReplayCapsule = {
      ...golden,
      final: { stateHash: "deadbeef" },
    };
    const diff = diffReplays(bad, golden);
    expect(diff.ok).toBe(false);
    expect(diff.finalStateHashMatch).toBe(false);
  });

  it("identical real capsules pass", () => {
    expect(diffReplays(golden, { ...golden }).ok).toBe(true);
  });
});

describe("D6: hashGameState covers previously-blind fields", () => {
  it("mutations to turn/phase/crests/banish/rng change the hash", () => {
    const base = hashGameState(createInitialState(42));
    expect(base).not.toBe(""); // sanity

    const cases: Array<
      [string, (s: ReturnType<typeof createInitialState>) => void]
    > = [
      [
        "turnNumber",
        (s) => {
          s.turnNumber = 99;
        },
      ],
      [
        "gameTick",
        (s) => {
          s.gameTick = 99;
        },
      ],
      [
        "phase",
        (s) => {
          s.phase = "main";
        },
      ],
      [
        "gameStarted",
        (s) => {
          s.gameStarted = true;
        },
      ],
      [
        "leaderBarrier",
        (s) => {
          s.players.first.leaderBarrier = 5;
        },
      ],
      [
        "crests",
        (s) => {
          s.players.first.crests = [{ name: "Faith", owner: "first" } as any];
        },
      ],
      [
        "banish",
        (s) => {
          s.players.first.banish = [
            { id: "1", name: "Gone", uid: "b1", type: "Follower" } as any,
          ];
        },
      ],
      [
        "evoCount",
        (s) => {
          s.players.first.evoCount = 7;
        },
      ],
      [
        "totalDamageDealt",
        (s) => {
          s.players.first.totalDamageDealt = 100;
        },
      ],
      [
        "rng draws",
        (s) => {
          for (let i = 0; i < 5; i++) s.rng.nextFloat();
        },
      ],
    ];

    for (const [label, mutate] of cases) {
      const s = createInitialState(42);
      mutate(s);
      expect(hashGameState(s), label).not.toBe(base);
    }
  });
});
