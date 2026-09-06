/**
 * Start-of-turn Invoke ordering — official Q&A (Sandalphon 10404110).
 * Sequence: countdown tick/destruction → Invoke summon → queued Last Words →
 * when-invoked → turn draw (docs/official-qa.md; rulebook §223–232).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import {
  canRedo,
  canUndo,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import * as effectsIndex from "../../src/logic/core/effects/index.js";
import {
  drainTurnBoundaryQueue,
  runStartOfTurnBoundary,
} from "../../src/logic/core/turnBoundary.js";
import type { Player } from "../../src/core/types/index.js";

const SANDALPHON = "10404110";
const SERENE_SANCTUARY = "10161210";
const PACT = "10163210";
const HOLY_FALCON = "90061110";
const FAIRY = "10001110";
const R6 = 6;

function deckFill(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    type: "Follower" as const,
    cost: 1,
    attack: 1,
    defense: 1,
  }));
}

function endTurnViaEngine(player: "first" | "second") {
  engineDispatch(state, { type: "END_TURN", player });
}

function invokeSummonLogIndex(cardName: string): number {
  return getLogs().findIndex(
    (e) =>
      e.type === "invoke" && e.details?.card === cardName && e.details?.uid,
  );
}

function drawCountLogIndex(player: "first" | "second", count: number): number {
  return getLogs().findIndex(
    (e) =>
      e.type === "draw" &&
      e.details?.player === player &&
      e.details?.count === count,
  );
}

function taggedEffect(tag: string, op = "damage", amount = 0) {
  return { op, target: "enemy:leader", amount, tag };
}

function grantSotCrest(
  owner: Player,
  name: string,
  effects: Record<string, unknown>[],
  insertionTs: number,
) {
  state.players[owner].crests.push({
    name,
    owner,
    insertionTs,
    triggers: [{ type: "start_of_turn_own", effects }],
  } as any);
}

function sotBoardMarker(
  name: string,
  owner: Player,
  insertionTs: number,
  event: "start_of_turn" | "start_of_turn_own" = "start_of_turn_own",
) {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        event === "start_of_turn_own"
          ? { type: "start_of_turn_own", effects: [taggedEffect(name)] }
          : {
              event: "start_of_turn",
              condition: { whose_turn: "opponent" },
              effects: [taggedEffect(name)],
            },
      ],
    },
    "board",
    owner,
  );
  card.insertionTs = insertionTs;
  return card;
}

function recordEffectTags(fn: () => void): string[] {
  const seq: string[] = [];
  const realRunEffects = effectsIndex.runEffects.bind(effectsIndex);
  const spy = vi
    .spyOn(effectsIndex, "runEffects")
    .mockImplementation((effects, owner, sourceCard, context) => {
      for (const eff of effects as any[]) {
        if (eff.tag) seq.push(eff.tag);
      }
      return realRunEffects(effects, owner, sourceCard, context);
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return seq;
}

describe("start-of-turn Invoke order (engineDispatch)", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    clearLogs();
    (globalThis as any).HEADLESS = false;
  });

  it("(a) Pact countdown-0: Invoke before LW; Tiger blocked on full board; draw last", () => {
    givenGameState({
      seed: 42,
      activePlayer: "first",
      roundCount: R6,
    })
      .withFirstHand([PACT])
      .withFirstDeck([SANDALPHON, FAIRY, ...deckFill("F", 12)])
      .withSecondDeck(deckFill("S", 15))
      .withFirstPP(6, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    whenPlayCard("first", 0);
    const pactIdx = getBoard(state, "first").findIndex((c) => c.id === PACT);
    engageAmulet("first", pactIdx);
    for (let i = 0; i < 4; i++) {
      state.players.first.board.push(createCard(HOLY_FALCON, "board", "first"));
    }
    state.players.first.evoCount = 6;
    state.activePlayer = "second";
    clearLogs();

    endTurnViaEngine("second");

    expect(findOnBoard("first", "Pact of the Beast Princess")).toBeFalsy();
    expect(
      thenBoard("first").filter((c) => c.name === "Holy Falcon"),
    ).toHaveLength(4);
    expect(findOnBoard("first", "Holyflame Tiger")).toBeFalsy();
    expect(
      thenHand("first").some(
        (c) => c.name === "Sandalphon, Primarch Successor",
      ),
    ).toBe(true);
    expect(thenBoard("first").length).toBe(4);

    const invokeIdx = invokeSummonLogIndex("Sandalphon, Primarch Successor");
    const turnDrawIdx = drawCountLogIndex("first", 1);
    expect(invokeIdx).toBeGreaterThanOrEqual(0);
    expect(turnDrawIdx).toBeGreaterThan(invokeIdx);
  });

  it("(b) Serene Sanctuary: destroy → invoke → LW draw 2 → return → turn draw", () => {
    givenGameState({
      seed: 42,
      activePlayer: "first",
      roundCount: R6,
    })
      .withFirstHand([])
      .withFirstDeck([SANDALPHON, FAIRY, FAIRY])
      .withSecondDeck(deckFill("S", 15))
      .withFirstPP(6, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    const sanctuary = createCard(SERENE_SANCTUARY, "board", "first");
    sanctuary.countdown = 1;
    sanctuary.hasCountdown = true;
    state.players.first.board = [sanctuary];
    const handBefore = thenHand("first").length;
    state.players.first.evoCount = 6;
    state.activePlayer = "second";
    clearLogs();

    endTurnViaEngine("second");

    expect(findOnBoard("first", "Serene Sanctuary")).toBeFalsy();
    expect(thenBoard("first").length).toBe(0);
    expect(
      thenHand("first").some(
        (c) => c.name === "Sandalphon, Primarch Successor",
      ),
    ).toBe(true);
    expect(thenHand("first").length).toBe(handBefore + 3);

    const invokeIdx = invokeSummonLogIndex("Sandalphon, Primarch Successor");
    const lwDrawIdx = getLogs().findIndex(
      (e) =>
        e.type === "draw" &&
        e.details?.owner === "first" &&
        e.details?.count === 2,
    );
    const turnDrawIdx = drawCountLogIndex("first", 1);
    expect(invokeIdx).toBeGreaterThanOrEqual(0);
    expect(lwDrawIdx).toBeGreaterThan(invokeIdx);
    expect(turnDrawIdx).toBeGreaterThan(lwDrawIdx);
  });

  it("(c) control: Serene countdown-0 without invokable card — LW then draw only", () => {
    givenGameState({
      seed: 42,
      activePlayer: "first",
      roundCount: R6,
    })
      .withFirstHand([])
      .withFirstDeck([FAIRY, FAIRY, FAIRY])
      .withSecondDeck(deckFill("S", 15))
      .withFirstPP(6, 6)
      .build();
    const sanctuary = createCard(SERENE_SANCTUARY, "board", "first");
    sanctuary.countdown = 1;
    sanctuary.hasCountdown = true;
    state.players.first.board = [sanctuary];
    const handBefore = thenHand("first").length;
    state.activePlayer = "second";
    clearLogs();

    endTurnViaEngine("second");

    expect(findOnBoard("first", "Serene Sanctuary")).toBeFalsy();
    expect(thenHand("first").length).toBe(handBefore + 3);
    expect(getLogs().some((e) => e.type === "invoke")).toBe(false);

    const lwIdx = getLogs().findIndex((e) => e.type === "lastWords");
    const lwDrawIdx = getLogs().findIndex(
      (e) =>
        e.type === "draw" &&
        e.details?.owner === "first" &&
        e.details?.count === 2,
    );
    const turnDrawIdx = drawCountLogIndex("first", 1);
    expect(lwIdx).toBeGreaterThanOrEqual(0);
    expect(lwDrawIdx).toBeGreaterThan(lwIdx);
    expect(turnDrawIdx).toBeGreaterThan(lwDrawIdx);
  });

  it("(d) control: invokable card with full board stays in deck; Serene LW still resolves", () => {
    givenGameState({
      seed: 42,
      activePlayer: "first",
      roundCount: R6,
    })
      .withFirstHand([])
      .withFirstDeck([SANDALPHON, FAIRY, FAIRY, FAIRY])
      .withSecondDeck(deckFill("S", 15))
      .withFirstPP(6, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    for (let i = 0; i < 5; i++) {
      state.players.first.board.push(createCard(HOLY_FALCON, "board", "first"));
    }
    state.players.first.evoCount = 6;
    state.activePlayer = "second";
    clearLogs();

    endTurnViaEngine("second");

    expect(thenBoard("first").length).toBe(5);
    expect(findOnBoard("first", "Sandalphon, Primarch Successor")).toBeFalsy();
    expect(invokeSummonLogIndex("Sandalphon, Primarch Successor")).toBe(-1);

    // Serene countdown-0 LW still resolves when invoke cannot (separate board slot).
    resetUidCounter();
    givenGameState({
      seed: 43,
      activePlayer: "first",
      roundCount: R6,
    })
      .withFirstHand([])
      .withFirstDeck([FAIRY, FAIRY, FAIRY])
      .withSecondDeck(deckFill("S", 15))
      .withFirstPP(6, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    const sanctuary = createCard(SERENE_SANCTUARY, "board", "first");
    sanctuary.countdown = 1;
    sanctuary.hasCountdown = true;
    state.players.first.board = [sanctuary];
    state.activePlayer = "second";
    clearLogs();
    endTurnViaEngine("second");
    expect(getLogs().some((e) => e.type === "lastWords")).toBe(true);
    expect(findOnBoard("first", "Serene Sanctuary")).toBeFalsy();
  });

  it("(e) undo → redo across turn boundary reproduces invoke order", () => {
    givenGameState({
      seed: 42,
      activePlayer: "first",
      roundCount: R6,
    })
      .withFirstHand([])
      .withFirstDeck([SANDALPHON, FAIRY, FAIRY])
      .withSecondDeck(deckFill("S", 15))
      .withFirstPP(6, 6)
      .build();
    const sanctuary = createCard(SERENE_SANCTUARY, "board", "first");
    sanctuary.countdown = 1;
    sanctuary.hasCountdown = true;
    state.players.first.board = [sanctuary];
    state.players.first.evoCount = 6;
    state.activePlayer = "second";

    endTurnViaEngine("second");
    const handAfter = thenHand("first").map((c) => c.name);
    const boardAfter = thenBoard("first").map((c) => c.name);

    expect(canUndo()).toBe(true);
    engineDispatch(state, { type: "UNDO" });
    expect(state.activePlayer).toBe("second");

    engineDispatch(state, { type: "REDO" });
    expect(thenHand("first").map((c) => c.name)).toEqual(handAfter);
    expect(thenBoard("first").map((c) => c.name)).toEqual(boardAfter);
    expect(findOnBoard("first", "Serene Sanctuary")).toBeFalsy();
    expect(
      thenHand("first").some(
        (c) => c.name === "Sandalphon, Primarch Successor",
      ),
    ).toBe(true);
  });

  /**
   * Rulebook §231 (JP): 各項で誘発し処理待ちとなる能力については一連の処理が終了した後、
   * 処理待ちとなった項番順に処理する — deferred Last Words after full SOT queue.
   * Red on main: LW draw fires after crest kill (step 2) before board SOT (step 3).
   */
  it("(f) deferDrain SOT: crest kill → board SOT → opponent SOT → then Last Words (no Invoke)", () => {
    givenGameState({
      seed: 42,
      activePlayer: "first",
      roundCount: 5,
    })
      .withFirstDeck(deckFill("D", 10))
      .withSecondDeck(deckFill("S", 10))
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const lwVictim = createCard(
      {
        name: "LWVictim",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        hasLastWords: true,
        lastWordsEffects: [
          { op: "draw", source: "deck", count: 1, tag: "LWDraw" },
        ],
      },
      "board",
      "first",
    );
    lwVictim.insertionTs = 1;
    state.players.first.board = [lwVictim];
    grantSotCrest(
      "first",
      "CrestKill",
      [{ op: "destroy", target: "ally:follower", tag: "CrestKill" }],
      1,
    );
    state.players.first.board.push(
      sotBoardMarker("BoardSOT", "first", 2, "start_of_turn_own"),
    );
    state.players.second.board = [
      sotBoardMarker("OppSOT", "second", 1, "start_of_turn"),
    ];

    const handBefore = thenHand("first").length;
    clearLogs();

    const queueSeq = recordEffectTags(() =>
      runStartOfTurnBoundary("first", undefined, { deferDrain: true }),
    );

    expect(queueSeq).toEqual(["CrestKill", "BoardSOT", "OppSOT"]);
    expect(thenHand("first").length).toBe(handBefore);
    expect(findOnBoard("first", "LWVictim")).toBeFalsy();

    recordEffectTags(() => drainTurnBoundaryQueue());

    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(getLogs().some((e) => e.type === "lastWords")).toBe(true);
  });
});
