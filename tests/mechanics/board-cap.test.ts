/**
 * Board field cap (5 real cards). Null death placeholders hold a slot until
 * filled or compacted; Last Words summons fill freed slots.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { replaySoakTrace } from "../../src/bench/soakEnv.js";
import { checkSoakInvariants } from "../../src/bench/soakInvariants.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { countRealBoardCards } from "../../src/logic/effects/ops/summon_ops/core.js";
import "../../src/logic/core/effects/index.js";

const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/soak",
);

function loadSoakFixture(name: string) {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as {
    seed: number;
    gameIndex: number;
    deckAId: string;
    deckBId: string;
    trace: unknown[];
  };
}

const MAJESTIC_CONQUEST = "10622310";
const ROSE = "10223110";
const FEARLESS_SOLDIER = "10621110";

function gainMajesticCrest() {
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
    .withFirstHand([MAJESTIC_CONQUEST])
    .withFirstPP(1, 6)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  whenPlayCard("first", 0);
}

describe("board field cap", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("enhanced follower enters before crest summon — soak game 391 shape stays at 5", () => {
    gainMajesticCrest();
    state.players.first.board = [
      createCard("10523110", "board", "first"),
      createCard("10303210", "board", "first"),
      createCard("10724110", "board", "first"),
      createCard("10021120", "board", "first"),
    ];
    state.players.first.hand = [createCard(ROSE, "hand", "first")];
    state.players.first.pp = 5;

    whenPlayCard("first", 0);

    const board = thenBoard("first");
    expect(board.length).toBeLessThanOrEqual(5);
    expect(countRealBoardCards(getBoard(state, "first"))).toBeLessThanOrEqual(
      5,
    );
    expect(board.filter((c) => c.name === "Rosé, Princess Knight").length).toBe(
      1,
    );
    // Crest may summon Fearless Soldier only if room remains after Rose enters.
    const soldiers = board.filter((c) => c.name === "Fearless Soldier");
    expect(soldiers.length).toBeLessThanOrEqual(1);
    if (soldiers.length === 1) {
      expect(board.length).toBe(5);
    }
  });

  it("named summon at 5 real cards does nothing (no throw, no sixth card)", () => {
    givenGameState({ seed: 2 }).build();
    state.gameStarted = true;
    state.players.first.board = Array.from({ length: 5 }, (_, i) =>
      createCard(
        { name: `F${i}`, type: "Follower", attack: 1, defense: 1 },
        "board",
        "first",
      ),
    );
    summonNamed({ op: "summon", name: "Goblin", count: 1 } as any, "first");
    expect(thenBoard("first").length).toBe(5);
    expect(countRealBoardCards(getBoard(state, "first"))).toBe(5);
  });

  it("deferred death: LW summon fills freed slot; second summon in batch refused at 5", () => {
    givenGameState({ seed: 3, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.phase = "main";

    const filler = Array.from({ length: 4 }, (_, i) =>
      createCard(
        { name: `F${i}`, type: "Follower", attack: 1, defense: 1 },
        "board",
        "first",
      ),
    );
    const victim = createCard(
      {
        name: "LW Victim",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        keywords: [
          {
            name: "LastWords",
            effects: [
              {
                op: "summon",
                source: "named",
                name: "Steelclad Knight",
                count: 1,
              },
              {
                op: "summon",
                source: "named",
                name: "Steelclad Knight",
                count: 1,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(victim);
    victim.peak_defense = 1;
    state.players.first.board = [...filler, victim];

    (state as any).deferDeathTriggers = true;
    dealDamage(victim, 1);
    cleanupDead();
    (state as any).deferDeathTriggers = false;
    flushDeferredDeathBatch();

    const board = thenBoard("first");
    expect(board.length).toBe(5);
    expect(countRealBoardCards(getBoard(state, "first"))).toBe(5);
    expect(board.filter((c) => c.name === "Steelclad Knight").length).toBe(1);
  });

  it("soak repro seed20260913 game391 — replaySoakTrace stays at ≤5 field", async () => {
    const fixture = loadSoakFixture("seed20260913_game391_board_cap.json");
    const result = await replaySoakTrace(
      fixture.seed,
      fixture.gameIndex,
      fixture.trace as any,
    );
    expect(result.error).toBeUndefined();
    const findings = checkSoakInvariants(state);
    expect(
      findings.map((f) => f.message),
      findings.map((f) => f.message).join("; "),
    ).toEqual([]);
    expect(getBoard(state, "first").length).toBeLessThanOrEqual(5);
  });
});
