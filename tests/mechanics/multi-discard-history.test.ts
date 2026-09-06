/**
 * Multi-pick discard history: each CHOOSE_TARGET pick commits; re-execute matches.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
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
import { getHand, getGraveyard } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  applySoakActionWithOutcome,
  runSoakGame,
} from "../../src/bench/soakEnv.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { createCard } from "../harness/builders.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";

const LUMIORE = "10844120";
const PARTING_JAWS = "10942310";
const GODDESS = "10502110";
const DEPTHS = "90044330";
const FILLER = "10102110";

type DispatchFn = typeof engineDispatch;

function chooseTarget(dispatch: DispatchFn, uid: string) {
  dispatch(state, {
    type: "CHOOSE_TARGET",
    player: state.pendingTargetEffect?.owner ?? "first",
    target: { type: "card", uid },
  });
}

function undo(dispatch: DispatchFn) {
  dispatch(state, { type: "UNDO" });
}

function redo(dispatch: DispatchFn) {
  dispatch(state, { type: "REDO" });
}

function setupLumioreDiscard(
  hand: string[],
  player: "first" | "second" = "first",
) {
  const round = 10;
  let b = givenGameState({ seed: 42, activePlayer: player, roundCount: round });
  if (player === "first") {
    b = b.withFirstPP(10, 10).withFirstHand(hand);
  } else {
    b = b.withSecondPP(10, 10).withSecondHand(hand);
  }
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = player;
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe.each([
  ["engineDispatch", engineDispatch],
  ["dispatchAction", dispatchAction as DispatchFn],
])("multi-discard history via %s", (_label, dispatch) => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    installSoakAdapter();
  });

  it("Lumiore: two CHOOSE_TARGET picks commit; both discarded; undo/redo round-trip", () => {
    setupLumioreDiscard([LUMIORE, DEPTHS, FILLER]);
    const commits: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") commits.push(ev.name);
    });

    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeDefined();

    const hand = getHand(state, "first");
    const pickA = hand.find((c) => String(c.id) === DEPTHS)!;
    const pickB = hand.find((c) => String(c.id) === FILLER)!;

    chooseTarget(dispatch, pickA.uid);
    expect(commits).toEqual(["Pick Target"]);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(getGraveyard(state, "first").some((c) => c.uid === pickA.uid)).toBe(
      true,
    );
    expect(state.lastDiscardedCosts).toEqual([pickA.cost]);

    chooseTarget(dispatch, pickB.uid);
    expect(commits).toEqual(["Pick Target", "Resolve Targets"]);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(state.lastDiscardedCosts).toHaveLength(2);
    expect(getGraveyard(state, "first").some((c) => c.uid === pickB.uid)).toBe(
      true,
    );

    const snapDone = captureSnapshot();
    unsub();

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect!.targetUids ?? []).toEqual([]);
    expect(getGraveyard(state, "first").some((c) => c.uid === pickB.uid)).toBe(
      false,
    );

    undo(dispatch);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect!.targetUids ?? []).toEqual([]);
    expect(getGraveyard(state, "first").some((c) => c.uid === pickA.uid)).toBe(
      false,
    );

    redo(dispatch);
    redo(dispatch);
    expect(captureSnapshot()).toEqual(snapDone);
  });

  it("Parting Jaws spell: two picks discard and close prompt", () => {
    setupLumioreDiscard([PARTING_JAWS, DEPTHS, FILLER]);
    whenPlayCard("first", 0);
    const hand = getHand(state, "first");
    const pickA = hand.find((c) => String(c.id) === DEPTHS)!;
    const pickB = hand.find((c) => String(c.id) === FILLER)!;
    chooseTarget(dispatch, pickA.uid);
    chooseTarget(dispatch, pickB.uid);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(state.lastDiscardedCosts).toHaveLength(2);
    expect(
      getGraveyard(state, "first").filter((c) =>
        [pickA.uid, pickB.uid].includes(c.uid),
      ),
    ).toHaveLength(2);
  });
});

describe("Goddess of Starlight evolve select-3 discard history", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    installSoakAdapter();
  });

  it("three picks via engineDispatch commit and discard all", () => {
    givenGameState({ seed: 99, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withFirstBoard([GODDESS])
      .withFirstHand([DEPTHS, FILLER, "10031310", "10001110", "10001120"])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.players.first.evoPoints = 3;

    const commits: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") commits.push(ev.name);
    });

    const goddess = state.players.first.board[0]!;
    applyKeywordsFromList(goddess);
    onEvolve(goddess, "first", "normal", { spendPoint: true });
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect!.selectCount).toBe(3);

    const picks = getHand(state, "first").slice(-3);
    for (const card of picks) {
      chooseTarget(engineDispatch, card.uid);
    }
    expect(commits.filter((n) => n === "Pick Target")).toHaveLength(2);
    expect(commits).toContain("Resolve Targets");
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(state.lastDiscardedCosts).toHaveLength(3);
    unsub();
  });
});

describe("soak history-reexecute pins (seed 20260909)", () => {
  beforeAll(async () => {
    (globalThis as any).HEADLESS = true;
    const { initCardDatabaseNode } =
      await import("../../src/data/cardLoaderNode.js");
    await initCardDatabaseNode();

    if (typeof fetch === "undefined" || !(globalThis as any).__soakFetchReady) {
      const fs = await import("fs");
      const path = await import("path");
      const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
      const prev = globalThis.fetch;
      (globalThis as any).fetch = async (url: string) => {
        const clean = String(url)
          .split("?")[0]!
          .replace(/^[./]+/, "")
          .replace(/^\//, "");
        const p = path.resolve(root, clean);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const body = fs.readFileSync(p, "utf-8");
          return {
            ok: true,
            status: 200,
            headers: {
              get: (n: string) =>
                n.toLowerCase() === "content-type" ? "application/json" : null,
            },
            text: async () => body,
            json: async () => JSON.parse(body),
          } as any;
        }
        if (typeof prev === "function") return prev(url);
        return { ok: false, status: 404, headers: { get: () => null } } as any;
      };
      (globalThis as any).__soakFetchReady = true;
    }
  });

  for (const gameIndex of [38, 58, 83]) {
    it(`game ${gameIndex}: history re-execute clean`, async () => {
      const fixturePath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        `../fixtures/soak/seed20260909_game${gameIndex}_history_reexecute.json`,
      );
      const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
      const result = await runSoakGame({
        seed: fixture.seed,
        gameIndex: fixture.gameIndex,
        turnCap: 60,
        actionCap: 800,
        historyCheck: true,
        historyReExecute: true,
        dispatch: "engine",
      });
      expect(result.outcome).toBe("completed");
    }, 60_000);
  }
});
