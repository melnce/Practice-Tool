/**
 * Mode pick history: each CHOOSE_MODE commits; Earth Rite payment inside Confirm Choice.
 * Full-game soak replays need >5s under load; per-test timeout avoids vitest's default 5000ms.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import {
  captureSnapshot,
  onHistoryEvent,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { getPP, getHand } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  clearPendingSoakModeChoice,
  getPendingSoakModeChoice,
  getLegalSoakActions,
  applySoakActionWithOutcome,
  runSoakGame,
} from "../../src/bench/soakEnv.js";
import {
  savePosition,
  loadPosition,
  deletePosition,
} from "../../src/core/positionStore.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

const SCREAMING_AND_LOATHING = "10353310";
const DAZZLING_RUNEKNIGHT = "10031110";

type DispatchFn = typeof engineDispatch;

function chooseMode(dispatch: DispatchFn, index: number) {
  dispatch(state, {
    type: "CHOOSE_MODE",
    player: "first",
    indices: [index],
  });
}

function undo(dispatch: DispatchFn) {
  dispatch(state, { type: "UNDO" });
}

function redo(dispatch: DispatchFn) {
  dispatch(state, { type: "REDO" });
}

function earthSigilCounters(): number {
  const sigil = state.players.first.board.find(
    (c) => c?.type === "Amulet" && (c.counters?.earth ?? 0) > 0,
  );
  return sigil?.counters?.earth ?? 0;
}

function modalPick(index: number) {
  const pending = getPendingSoakModeChoice();
  expect(pending).not.toBeNull();
  pending!.pickCallback(index);
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("choose-two mode pick history via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    clearPendingSoakModeChoice();
    setHistoryEnabled(true);
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
    installSoakAdapter({ interactiveModes: true });
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstPP(3, 10)
      .withFirstHand([SCREAMING_AND_LOATHING])
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("each CHOOSE_MODE commits once; undo/redo matches no-undo run", () => {
    const commits: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") commits.push(ev.name);
    });

    whenPlayCard("first", 0);
    expect(state.pendingModeChoice).toBeDefined();

    const ppBefore = getPP(state, "first");
    const commitsAfterPlay = commits.length;

    chooseMode(dispatch, 0);
    expect(commits.slice(commitsAfterPlay)).toEqual(["Pick Mode"]);
    expect(state.pendingModeChoice?.partialPickedIndices).toEqual([0]);

    undo(dispatch);
    expect(state.pendingModeChoice).toBeDefined();
    expect(state.pendingModeChoice?.partialPickedIndices ?? []).toEqual([]);
    expect(getPP(state, "first")).toBe(ppBefore);

    redo(dispatch);
    expect(state.pendingModeChoice?.partialPickedIndices).toEqual([0]);
    expect(state.pendingModeChoice?.optionCount).toBe(3);

    chooseMode(dispatch, 0);
    expect(commits.slice(commitsAfterPlay)).toEqual([
      "Pick Mode",
      "Confirm Choice",
    ]);
    expect(state.pendingModeChoice).toBeUndefined();
    expect(getPP(state, "first")).toBe(ppBefore + 1);

    const snapWithUndo = captureSnapshot();
    unsub();

    resetUidCounter();
    clearPendingSoakModeChoice();
    setHistoryEnabled(true);
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
    installSoakAdapter({ interactiveModes: true });
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstPP(3, 10)
      .withFirstHand([SCREAMING_AND_LOATHING])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);
    chooseMode(dispatch, 0);
    chooseMode(dispatch, 0);

    expect(captureSnapshot()).toEqual(snapWithUndo);
  });

  it("modal first pick → save/load → CHOOSE_MODE second pick matches two modal picks", () => {
    whenPlayCard("first", 0);
    modalPick(0);
    expect(state.pendingModeChoice?.optionCount).toBe(3);
    expect(state.pendingModeChoice?.partialPickedIndices).toEqual([0]);

    const saved = savePosition("mid-mode");
    loadPosition(saved.id, { autoRender: false });
    deletePosition(saved.id);

    expect(state.pendingModeChoice?.optionCount).toBe(3);
    chooseMode(dispatch, 0);

    const snapModalThenState = captureSnapshot();
    const handLen = getHand(state, "first").length;

    resetUidCounter();
    clearPendingSoakModeChoice();
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstPP(3, 10)
      .withFirstHand([SCREAMING_AND_LOATHING])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);
    modalPick(0);
    modalPick(0);

    expect(getHand(state, "first").length).toBe(handLen);
    expect(captureSnapshot()).toEqual(snapModalThenState);
  });

  it("modal first pick → undo → redo → CHOOSE_MODE second pick matches two modal picks", () => {
    whenPlayCard("first", 0);
    modalPick(0);

    undo(dispatch);
    expect(state.pendingModeChoice?.partialPickedIndices ?? []).toEqual([]);
    expect(state.pendingModeChoice?.optionCount).toBe(4);

    redo(dispatch);
    expect(state.pendingModeChoice?.partialPickedIndices).toEqual([0]);
    expect(state.pendingModeChoice?.optionCount).toBe(3);

    chooseMode(dispatch, 0);

    const snapAfterRedo = captureSnapshot();

    resetUidCounter();
    clearPendingSoakModeChoice();
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstPP(3, 10)
      .withFirstHand([SCREAMING_AND_LOATHING])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);
    modalPick(0);
    modalPick(0);

    expect(captureSnapshot()).toEqual(snapAfterRedo);
  });

  it("soak CHOOSE_MODE legal actions pick same options as modal path", () => {
    whenPlayCard("first", 0);

    const firstLegal = getLegalSoakActions().find(
      (a) => a.type === "CHOOSE_MODE" && a.indices[0] === 0,
    );
    expect(firstLegal).toBeDefined();
    applySoakActionWithOutcome(firstLegal!, "engine");
    expect(state.pendingModeChoice?.optionCount).toBe(3);
    expect(state.pendingModeChoice?.partialPickedIndices).toEqual([0]);

    const secondLegal = getLegalSoakActions().find(
      (a) => a.type === "CHOOSE_MODE" && a.indices[0] === 0,
    );
    expect(secondLegal).toBeDefined();
    applySoakActionWithOutcome(secondLegal!, "engine");

    const snapSoakChoose = captureSnapshot();
    const handLen = getHand(state, "first").length;

    resetUidCounter();
    clearPendingSoakModeChoice();
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstPP(3, 10)
      .withFirstHand([SCREAMING_AND_LOATHING])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);
    modalPick(0);
    modalPick(0);

    expect(getHand(state, "first").length).toBe(handLen);
    expect(captureSnapshot()).toEqual(snapSoakChoose);
  });
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("earth rite mode pick history via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    clearPendingSoakModeChoice();
    setHistoryEnabled(true);
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
    installSoakAdapter({ interactiveModes: true });
    const sigil = createCard(
      {
        name: "Earth Sigil",
        type: "Amulet",
        cost: 0,
        attack: 0,
        defense: 0,
        counters: { earth: 3 },
      },
      "board",
      "first",
    );
    applyKeywordsFromList(sigil);
    givenGameState({ seed: 7, activePlayer: "first", roundCount: 6 })
      .withFirstPP(3, 6)
      .withFirstHand([DAZZLING_RUNEKNIGHT])
      .build();
    state.players.first.board = [sigil];
    state.gameStarted = true;
    state.phase = "main";
  });

  it("Earth Rite payment inside Confirm Choice — undo restores sigils", () => {
    const commits: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") commits.push(ev.name);
    });

    whenPlayCard("first", 0);
    expect(state.pendingModeChoice).toBeDefined();
    expect(earthSigilCounters()).toBe(3);

    chooseMode(dispatch, 1);
    expect(commits).toContain("Confirm Choice");
    expect(state.pendingModeChoice).toBeUndefined();
    expect(earthSigilCounters()).toBe(2);

    const runeknightAfter = () =>
      state.players.first.board.find((c) => c.name === "Dazzling Runeknight")!;
    expect(Number(runeknightAfter().attack)).toBe(4);
    expect(Number(runeknightAfter().defense)).toBe(4);

    undo(dispatch);
    expect(state.pendingModeChoice).toBeDefined();
    expect(earthSigilCounters()).toBe(3);
    expect(Number(runeknightAfter().attack)).toBe(2);
    expect(Number(runeknightAfter().defense)).toBe(2);

    redo(dispatch);
    expect(state.pendingModeChoice).toBeUndefined();
    expect(earthSigilCounters()).toBe(2);
    expect(Number(runeknightAfter().attack)).toBe(4);
    expect(Number(runeknightAfter().defense)).toBe(4);

    unsub();
  });
});

const FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/soak",
);

function loadFixture(name: string) {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as {
    seed: number;
    gameIndex: number;
    outcome: string;
  };
}

describe("soak history_allpaths fixture pins", () => {
  beforeAll(() => {
    (globalThis as any).HEADLESS = true;
    process.env.DISABLE_HISTORY = "1";
  });

  for (const gameIndex of [15, 161]) {
    it(`seed20260909 game ${gameIndex} history allpaths`, async () => {
      const fixture = loadFixture(
        `seed20260909_game${gameIndex}_history_allpaths.json`,
      );
      const result = await runSoakGame({
        seed: fixture.seed,
        gameIndex: fixture.gameIndex,
        turnCap: 60,
        actionCap: 800,
        historyCheck: true,
        dispatch: "engine",
        fuse: true,
        interactiveModes: true,
      });
      expect(result.outcome).toBe("completed");
    }, 60_000);
  }
});
