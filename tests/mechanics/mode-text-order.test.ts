/**
 * Mode resolution order — picked options resolve in text (option index) order,
 * not pick order (Japanese effect-processing spec, 2026-09-06).
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { captureSnapshot, setHistoryEnabled } from "../../src/core/history.js";
import {
  getHand,
  getPP,
  getShadows,
  getHP,
  addModeBonus,
} from "../../src/core/playerHelpers.js";
import * as logger from "../../src/core/logger.js";
import { clearLogs, getLogs } from "../../src/core/logger.js";
import {
  installSoakAdapter,
  clearPendingSoakModeChoice,
} from "../../src/bench/soakEnv.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

const SCREAMING_AND_LOATHING = "10353310";
const BITTERSWEET_DEPARTURES = "10852310";
const DAZZLING_RUNEKNIGHT = "10031110";

function chooseMode(index: number) {
  engineDispatch(state, {
    type: "CHOOSE_MODE",
    player: "first",
    indices: [index],
  });
}

function undo() {
  engineDispatch(state, { type: "UNDO" });
}

function redo() {
  engineDispatch(state, { type: "REDO" });
}

function firstLogIndex(type: string, after = -1): number {
  const logs = getLogs();
  for (let i = after + 1; i < logs.length; i++) {
    if (logs[i]!.type === type) return i;
  }
  return -1;
}

function setupScreamingAndLoathing() {
  const enemyFollower = createCard(
    { name: "Enemy Target", type: "Follower", cost: 2, attack: 2, defense: 5 },
    "board",
    "second",
  );
  applyKeywordsFromList(enemyFollower);
  enemyFollower.justPlayed = false;

  givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
    .withFirstPP(3, 10)
    .withFirstHand([SCREAMING_AND_LOATHING])
    .withFirstDeck([
      {
        name: "Deck Follower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      },
      { name: "Deck Spell", type: "Spell", cost: 3, attack: 0, defense: 0 },
      ...Array.from({ length: 20 }, (_, i) => ({
        name: `Filler${i}`,
        type: "Follower" as const,
        cost: 1,
        attack: 1,
        defense: 1,
      })),
    ])
    .withSecondBoard([enemyFollower])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function playScreamingPickOrder(indices: number[]) {
  whenPlayCard("first", 0);
  expect(state.pendingModeChoice).toBeDefined();
  for (const idx of indices) {
    chooseMode(idx);
  }
}

function withLogging<T>(fn: () => T): T {
  const prevHeadless = (globalThis as any).HEADLESS;
  (globalThis as any).HEADLESS = false;
  clearLogs();
  try {
    return fn();
  } finally {
    (globalThis as any).HEADLESS = prevHeadless;
  }
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("mode text order via engineDispatch", () => {
  beforeEach(() => {
    resetUidCounter();
    clearPendingSoakModeChoice();
    clearLogs();
    setHistoryEnabled(true);
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
    installSoakAdapter({ interactiveModes: true });
  });

  it("(a) Screaming and Loathing [3,1]: draw follower before random damage; same as [1,3]", () => {
    setupScreamingAndLoathing();
    withLogging(() => playScreamingPickOrder([3, 1]));

    const searchIdx = firstLogIndex("search");
    const damageIdx = firstLogIndex("damageRandom");
    expect(searchIdx).toBeGreaterThanOrEqual(0);
    expect(damageIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeLessThan(damageIdx);

    const snapReversePick = captureSnapshot();

    resetUidCounter();
    clearLogs();
    setupScreamingAndLoathing();
    playScreamingPickOrder([1, 3]);

    expect(captureSnapshot()).toEqual(snapReversePick);
  });

  it("(b) Bittersweet Departures [3,0]: leader damage before shadows (log order)", () => {
    let shadowsAtLeaderDamage = -1;

    givenGameState({ seed: 7, activePlayer: "first", roundCount: 8 })
      .withFirstPP(3, 8)
      .withFirstHand([BITTERSWEET_DEPARTURES])
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    let shadowsAfterPlay = 0;

    withLogging(() => {
      const realLogEvent = logger.logEvent;
      vi.spyOn(logger, "logEvent").mockImplementation((type, details) => {
        if (type === "leaderDamage") {
          shadowsAtLeaderDamage = getShadows(state, "first");
        }
        return realLogEvent(type, details);
      });

      whenPlayCard("first", 0);
      shadowsAfterPlay = getShadows(state, "first");
      chooseMode(3);
      chooseMode(0);
      vi.mocked(logger.logEvent).mockRestore();
    });

    expect(shadowsAtLeaderDamage).toBeLessThan(getShadows(state, "first"));
    expect(getShadows(state, "first")).toBe(shadowsAfterPlay + 4);
    expect(getHP(state, "second")).toBe(19);

    const snapReversePick = captureSnapshot();

    resetUidCounter();
    clearLogs();
    givenGameState({ seed: 7, activePlayer: "first", roundCount: 8 })
      .withFirstPP(3, 8)
      .withFirstHand([BITTERSWEET_DEPARTURES])
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);
    chooseMode(0);
    chooseMode(3);

    expect(captureSnapshot()).toEqual(snapReversePick);
  });

  it("(c) choose-1 mode card is unchanged (Dazzling Runeknight)", () => {
    givenGameState({ seed: 11, activePlayer: "first", roundCount: 6 })
      .withFirstPP(3, 6)
      .withFirstHand([DAZZLING_RUNEKNIGHT])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);
    chooseMode(0);

    const runeknight = state.players.first.board.find(
      (c) => c.name === "Dazzling Runeknight",
    )!;
    expect(Number(runeknight.attack)).toBe(2);
    expect(Number(runeknight.defense)).toBe(2);
    expect(state.pendingModeChoice).toBeUndefined();
  });

  it("(d) Sham-Nacha faith bonus: Screaming [3,2,0] resolves 0, 2, 3", () => {
    const enemyFollower = createCard(
      {
        name: "Enemy Target",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 5,
      },
      "board",
      "second",
    );
    applyKeywordsFromList(enemyFollower);
    enemyFollower.justPlayed = false;

    givenGameState({ seed: 99, activePlayer: "first", roundCount: 12 })
      .withFirstPP(3, 12)
      .withFirstHand([SCREAMING_AND_LOATHING])
      .withFirstDeck([
        {
          name: "Deck Follower",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
        { name: "Deck Spell", type: "Spell", cost: 3, attack: 0, defense: 0 },
        ...Array.from({ length: 20 }, (_, i) => ({
          name: `Filler${i}`,
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        })),
      ])
      .withSecondBoard([enemyFollower])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    addModeBonus(state, "first", 1);

    withLogging(() => {
      whenPlayCard("first", 0);
      chooseMode(3);
      chooseMode(2);
      chooseMode(0);
    });

    const searchIdx = firstLogIndex("search");
    const damageIdx = firstLogIndex("damageRandom");
    expect(searchIdx).toBeGreaterThanOrEqual(0);
    expect(damageIdx).toBeGreaterThanOrEqual(0);
    expect(searchIdx).toBeLessThan(damageIdx);
    expect(getPP(state, "first")).toBe(1);
    expect(
      getHand(state, "first").some((c) => c.type === "Spell" && c.cost === 3),
    ).toBe(true);
  });

  it("(e) undo → redo around (a) keeps the text-order outcome", () => {
    setupScreamingAndLoathing();
    whenPlayCard("first", 0);
    chooseMode(3);
    undo();
    expect(state.pendingModeChoice).toBeDefined();
    redo();
    chooseMode(1);

    const snapWithUndo = captureSnapshot();

    resetUidCounter();
    clearLogs();
    setupScreamingAndLoathing();
    playScreamingPickOrder([1, 3]);

    expect(captureSnapshot()).toEqual(snapWithUndo);
  });
});
