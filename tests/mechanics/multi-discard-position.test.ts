/**
 * Multi-pick discard position save/load: committed picks survive snapshots (PR #308).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import {
  applySnapshot,
  captureSnapshot,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { getHand, getGraveyard } from "../../src/core/playerHelpers.js";
import { installSoakAdapter, runSoakGame } from "../../src/bench/soakEnv.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { setPendingTarget } from "../../src/logic/core/pendingTarget/index.js";
import { highlightSelectable } from "../../src/logic/core/targeting.js";

const LUMIORE = "10844120";
const PARTING_JAWS = "10942310";
const GODDESS = "10502110";
const DEPTHS = "90044330";
const FILLER = "10102110";
const ENGINE = "engine" as const;

function chooseTarget(uid: string) {
  engineDispatch(state, {
    type: "CHOOSE_TARGET",
    player: state.pendingTargetEffect?.owner ?? "first",
    target: { type: "card", uid },
  });
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

function graveyardUids(player: "first" | "second"): string[] {
  return getGraveyard(state, player).map((c) => c.uid);
}

type DiscardScenario = {
  name: string;
  setup: () => { pickUids: string[] };
};

const DISCARD_SCENARIOS: DiscardScenario[] = [
  {
    name: "Lumiore & Argente",
    setup: () => {
      setupLumioreDiscard([LUMIORE, DEPTHS, FILLER]);
      whenPlayCard("first", 0);
      const hand = getHand(state, "first");
      const pickA = hand.find((c) => String(c.id) === DEPTHS)!;
      const pickB = hand.find((c) => String(c.id) === FILLER)!;
      return { pickUids: [pickA.uid, pickB.uid] };
    },
  },
  {
    name: "Parting Jaws",
    setup: () => {
      setupLumioreDiscard([PARTING_JAWS, DEPTHS, FILLER]);
      whenPlayCard("first", 0);
      const hand = getHand(state, "first");
      const pickA = hand.find((c) => String(c.id) === DEPTHS)!;
      const pickB = hand.find((c) => String(c.id) === FILLER)!;
      return { pickUids: [pickA.uid, pickB.uid] };
    },
  },
  {
    name: "Goddess of Starlight evolve",
    setup: () => {
      givenGameState({ seed: 99, activePlayer: "first", roundCount: 10 })
        .withFirstPP(10, 10)
        .withFirstBoard([GODDESS])
        .withFirstHand([DEPTHS, FILLER, "10031310", "10001110", "10001120"])
        .build();
      state.gameStarted = true;
      state.phase = "main";
      state.players.first.evoPoints = 3;
      const goddess = state.players.first.board[0]!;
      applyKeywordsFromList(goddess);
      onEvolve(goddess, "first", "normal", { spendPoint: true });
      const picks = getHand(state, "first").slice(-3);
      return { pickUids: picks.map((c) => c.uid) };
    },
  },
];

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("multi-discard position save/load (engineDispatch)", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    installSoakAdapter();
  });

  describe.each(DISCARD_SCENARIOS)("(a) $name", ({ setup }) => {
    it("save after first pick → restore → remaining picks match uninterrupted run", () => {
      const { pickUids } = setup();
      expect(state.pendingTargetEffect?.picksAreCommitted).toBe(true);

      chooseTarget(pickUids[0]);
      expect(state.pendingTargetEffect).toBeDefined();
      const midPrompt = captureSnapshot();

      chooseTarget(pickUids[1]);
      const snapDone = captureSnapshot();
      const gyDone = graveyardUids("first");

      applySnapshot(midPrompt, { autoRender: false });
      expect(state.pendingTargetEffect?.targetUids).toEqual([pickUids[0]]);

      chooseTarget(pickUids[1]);
      expect(captureSnapshot()).toEqual(snapDone);
      expect(graveyardUids("first")).toEqual(gyDone);
    });
  });

  it("(b) restored mid-prompt snapshot reports first pick in targetUids", () => {
    const { pickUids } = DISCARD_SCENARIOS[0].setup();
    chooseTarget(pickUids[0]);
    const midPrompt = captureSnapshot();

    applySnapshot(midPrompt, { autoRender: false });
    expect(state.pendingTargetEffect?.picksAreCommitted).toBe(true);
    expect(state.pendingTargetEffect?.targetUids).toEqual([pickUids[0]]);
  });

  it("(d) uncommitted multi-pick prompt restores with no picks (f9a55e6)", () => {
    givenGameState({ seed: 5, activePlayer: "first" }).build();
    const a = createCard("10001110", "board", "second");
    const b = createCard("10001120", "board", "second");
    a.uid = "t_a";
    b.uid = "t_b";
    a.peak_defense = Number(a.defense);
    b.peak_defense = Number(b.defense);
    state.players.second.board = [a, b];

    setPendingTarget({
      eff: { op: "damage", amount: 2, select: 2 } as any,
      owner: "first",
      sourceCard: null,
      pool: [a, b],
      poolUids: [a.uid, b.uid],
      targets: [],
      targetUids: [],
      selectCount: 2,
      requiresConfirmation: true,
    });
    highlightSelectable([a, b]);
    expect(state.pendingTargetEffect?.picksAreCommitted).toBeFalsy();

    chooseTarget(a.uid);
    expect(state.pendingTargetEffect?.targetUids).toEqual([a.uid]);

    const saved = captureSnapshot();
    applySnapshot(saved, { autoRender: false });
    expect(state.pendingTargetEffect?.targetUids).toEqual([]);
  });
});

describe("multi-discard position soak pins (seed 20260925)", () => {
  const PINS = [
    { gameIndex: 15, label: "game 15 action 25" },
    { gameIndex: 35, label: "game 35 action 82" },
    { gameIndex: 43, label: "game 43 action 77" },
    { gameIndex: 55, label: "game 55 action 50" },
    { gameIndex: 79, label: "game 79 action 51" },
  ];

  for (const pin of PINS) {
    it(`seed 20260925 ${pin.label} — position save-load re-apply`, async () => {
      const result = await runSoakGame({
        seed: 20260925,
        gameIndex: pin.gameIndex,
        positionCheck: true,
        dispatch: ENGINE,
        turnCap: 60,
        actionCap: 800,
      });
      expect(
        result.outcome,
        result.error ?? `game ${pin.gameIndex} outcome ${result.outcome}`,
      ).toBe("completed");
    }, 60_000);
  }
});
