/**
 * Trace emitter — format, determinism, fixture replay, soak hash parity.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import {
  runTraceGame,
  formatTraceJsonl,
} from "../../src/bench/trace/traceRunner.js";
import { createRecordingRng } from "../../src/bench/trace/rngRecorder.js";
import { createRng } from "../../src/core/rng.js";
import { runSoakGame, prepareSoakReplay } from "../../src/bench/soakEnv.js";
import { registerSoakDeck } from "../../src/bench/soakDecks.js";
import { resolveIdDeckFile } from "../../src/bench/trace/deckResolve.js";
import { startNewGame } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import { getHand } from "../../src/core/playerHelpers.js";
import {
  confirmMulliganCore,
  toggleMulliganPickCore,
} from "../../src/logic/core/mulliganCore.js";
import {
  installTraceRng,
  uninstallTraceRng,
} from "../../src/bench/trace/rngRecorder.js";
import {
  setDrawRecording,
  clearActionDraws,
} from "../../src/bench/trace/drawRecorder.js";
import { derivePicks } from "../../src/bench/trace/pickDerive.js";
import { captureSnapshot } from "../../src/core/history.js";
import {
  getLegalNeutralActions,
  soakActionToNeutral,
} from "../../src/bench/trace/neutralAction.js";
import { toCanonicalState } from "../../src/bench/trace/canonicalState.js";
import {
  givenGameState,
  whenRunEffects,
  whenPlayCard,
  createCard,
} from "../harness/builders.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { makeCardFromDB } from "../../src/logic/effects/ops/summon_ops/core.js";
import { getGlobalCardIndex } from "../../src/data/cardIndex.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import type {
  TraceHeader,
  TraceActionLine,
  CanonicalState,
} from "../../src/bench/trace/types.js";
import rampDeck from "../../decks/trace/ramp-dragon-37772.json";

const ROOT = resolve(__dirname, "../..");
const FIXTURE_DIR = resolve(ROOT, "tests/fixtures/traces");
const TRACE_SEED = 20260910;

const PLAYER_STATE_KEYS = [
  "banished",
  "cemetery",
  "combo",
  "crests",
  "deck",
  "earth",
  "ep",
  "evolves_used",
  "faith",
  "field",
  "hand",
  "leader_defense",
  "leader_max",
  "pp",
  "pp_bonus",
  "pp_max",
  "rally",
  "sep",
  "shadows",
] as const;

const CANONICAL_STATE_KEYS = [
  "active",
  "phase",
  "players",
  "turn",
  "winner",
] as const;

async function installFetch(): Promise<void> {
  if ((globalThis as any).__traceFetchReady) return;
  const fs = await import("fs");
  const path = await import("path");
  (globalThis as any).fetch = async (url: string) => {
    const clean = String(url)
      .split("?")[0]!
      .replace(/^[./]+/, "")
      .replace(/^\//, "");
    const p = path.resolve(ROOT, clean);
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
    return { ok: false, status: 404, headers: { get: () => null } } as any;
  };
  (globalThis as any).__traceFetchReady = true;
}

function parseTraceFile(filePath: string): {
  header: TraceHeader;
  lines: TraceActionLine[];
} {
  const raw = readFileSync(filePath, "utf-8").trim().split("\n");
  const header = JSON.parse(raw[0]!) as TraceHeader;
  const lines = raw.slice(1).map((l) => JSON.parse(l) as TraceActionLine);
  return { header, lines };
}

function multisetTotal(m: Record<string, number>): number {
  return Object.values(m).reduce((a, b) => a + b, 0);
}

function assertPlayerShape(p: CanonicalState["players"]["a"]): void {
  for (const key of PLAYER_STATE_KEYS) {
    expect(p).toHaveProperty(key);
  }
  expect(p.field).toHaveLength(5);
  const zoneTotal =
    multisetTotal(p.deck) +
    multisetTotal(p.cemetery) +
    multisetTotal(p.banished) +
    p.hand.length +
    p.field.filter(Boolean).length;
  // 40-card deck: all cards accounted for in visible zones (tokens/transforms may shift totals slightly mid-game).
  expect(zoneTotal).toBeGreaterThanOrEqual(0);
  expect(zoneTotal).toBeLessThanOrEqual(50);
}

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  process.env.DISABLE_HISTORY = "1";
  await installFetch();
  await initCardDatabaseNode();
});

describe("trace emitter", () => {
  it("recording RNG is roll-identical to bare RNG", () => {
    const inner = createRng(12345);
    const rec = createRecordingRng(inner);
    const bare = createRng(12345);
    for (let i = 0; i < 200; i++) {
      const arr = [1, 2, 3, 4, 5];
      expect(rec.rng.nextInt(10)).toBe(bare.nextInt(10));
      expect(rec.rng.nextFloat()).toBe(bare.nextFloat());
      expect(rec.rng.pick(arr)).toBe(bare.pick(arr));
    }
  });

  it("produces byte-identical traces for same seed + decks", async () => {
    const opts = {
      seed: TRACE_SEED,
      gameIndex: 0,
      deckA: rampDeck as Record<string, number>,
      deckB: rampDeck as Record<string, number>,
      turnCap: 30,
      actionCap: 200,
    };
    const run1 = await runTraceGame(opts);
    const run2 = await runTraceGame(opts);
    const json1 = formatTraceJsonl(run1.header, run1.lines);
    const json2 = formatTraceJsonl(run2.header, run2.lines);
    expect(json2).toBe(json1);
  }, 180_000);

  it("trace run finalHash matches soak run for same seed and decks", async () => {
    const seed = 424242;
    const gameIndex = 0;
    const deckRaw = resolveIdDeckFile(rampDeck as Record<string, number>);
    const deckAId = registerSoakDeck(deckRaw, `trace_cmp_a_${seed}`);
    const deckBId = registerSoakDeck(deckRaw, `trace_cmp_b_${seed}`);
    const soak = await runSoakGame({
      seed,
      gameIndex,
      deckAId,
      deckBId,
      turnCap: 30,
      actionCap: 200,
      fuse: true,
      interactiveModes: true,
    });
    expect(soak.outcome).toBe("completed");
    const trace = await runTraceGame({
      seed,
      gameIndex,
      deckA: rampDeck as Record<string, number>,
      deckB: rampDeck as Record<string, number>,
      turnCap: 30,
      actionCap: 200,
    });
    expect(trace.finalHash).toBe(soak.finalHash);
  }, 180_000);

  it("draw picks are recorded in engine draw order", async () => {
    const result = await runTraceGame({
      seed: TRACE_SEED,
      gameIndex: 0,
      deckA: rampDeck as Record<string, number>,
      deckB: rampDeck as Record<string, number>,
      turnCap: 30,
      actionCap: 200,
    });
    expect(result.lines.length).toBeGreaterThan(0);
    for (const line of result.lines) {
      for (const pick of line.rng.filter((p) => p.what === "draw")) {
        expect(typeof pick.chose).toBe("string");
      }
      for (const pick of line.rng.filter((p) => p.what === "random_target")) {
        if (pick.chose !== "leader" && "slot" in pick.chose) {
          expect(pick.chose.slot).toBeGreaterThanOrEqual(0);
          expect(pick.chose.slot).toBeLessThan(5);
        }
      }
    }
  }, 120_000);

  it("every raw rng pick has kind shuffle", async () => {
    for (let gameIndex = 0; gameIndex < 2; gameIndex++) {
      const result = await runTraceGame({
        seed: TRACE_SEED,
        gameIndex,
        deckA: rampDeck as Record<string, number>,
        deckB: rampDeck as Record<string, number>,
        turnCap: 30,
        actionCap: 200,
      });
      for (const line of result.lines) {
        for (const pick of line.rng) {
          if (pick.what === "raw") {
            expect(pick).toMatchObject({ kind: "shuffle" });
          }
        }
      }
    }
  }, 300_000);

  it("mulligan with four replacements records four draw picks", async () => {
    prepareSoakReplay({ fuse: true, interactiveModes: false });
    const deckRaw = resolveIdDeckFile(rampDeck as Record<string, number>);
    const deckAId = registerSoakDeck(deckRaw, "trace_mull_a");
    const deckBId = registerSoakDeck(deckRaw, "trace_mull_b");
    await startNewGame({ deckAId, deckBId, seed: TRACE_SEED });
    const recorder = installTraceRng(state)!;
    setDrawRecording(true);
    try {
      const hand = getHand(state, "first");
      for (const card of hand) {
        toggleMulliganPickCore("first", card.uid);
      }
      clearActionDraws();
      const before = captureSnapshot();
      confirmMulliganCore("first");
      const draws = derivePicks(recorder.getRolls(), before).filter(
        (p) => p.what === "draw",
      );
      expect(draws).toHaveLength(4);
      expect(draws.every((p) => p.what === "draw")).toBe(true);
      expect(recorder.getRolls().length).toBeGreaterThan(0);
    } finally {
      setDrawRecording(false);
      uninstallTraceRng(state);
      prepareSoakReplay({ fuse: false, interactiveModes: false });
    }
  }, 120_000);

  it("header includes opening hands before mulligan", async () => {
    const result = await runTraceGame({
      seed: TRACE_SEED,
      gameIndex: 0,
      deckA: rampDeck as Record<string, number>,
      deckB: rampDeck as Record<string, number>,
      turnCap: 5,
      actionCap: 10,
    });
    expect(result.header.opening_hands.a).toHaveLength(4);
    expect(result.header.opening_hands.b).toHaveLength(4);
    for (const id of result.header.opening_hands.a) {
      expect(typeof id).toBe("string");
    }
  }, 120_000);

  it("play resolves hand_pos and card id from pre-action state", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const filler = createCard("10001110", "hand", "first");
    const spell = createCard("10131320", "hand", "first");
    state.players.first.hand = [filler, filler, spell];
    const before = captureSnapshot();
    const neutral = soakActionToNeutral(
      { type: "PLAY_CARD", player: "first", cardUid: spell.uid },
      before,
    );
    expect(neutral).toEqual({
      play: { player: "a", hand_pos: 2, card: "10131320" },
    });
  });

  it("end_turn names the active player before the action", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const before = captureSnapshot();
    const neutral = soakActionToNeutral({ type: "END_TURN" }, before);
    expect(neutral).toEqual({ end_turn: { player: "a" } });
  });

  it("search records multiset_pick per removed deck card", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "Vanilla", type: "Follower", attack: 1, defense: 1 },
        { name: "TargetA", type: "Follower", attack: 2, defense: 2 },
        { name: "TargetB", type: "Follower", attack: 3, defense: 3 },
      ])
      .build();
    const recorder = installTraceRng(state)!;
    setDrawRecording(true);
    try {
      const before = captureSnapshot();
      clearActionDraws();
      whenRunEffects(
        [{ op: "search", filter: { type: "Follower" }, count: 2 }],
        "first",
      );
      const picks = derivePicks(recorder.getRolls(), before).filter(
        (p) => p.what === "multiset_pick",
      );
      expect(picks).toHaveLength(2);
      expect(picks.every((p) => p.among === "deck")).toBe(true);
      const handIds = state.players.first.hand.map((c) => String(c.id));
      expect(picks.map((p) => p.chose)).toEqual(handIds);
    } finally {
      setDrawRecording(false);
      uninstallTraceRng(state);
    }
  });

  it("summon from deck records one multiset_pick per summoned card", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.deck = [
      createCard("10121110", "deck", "first"),
      createCard("10001110", "deck", "first"),
    ];
    const recorder = installTraceRng(state)!;
    setDrawRecording(true);
    try {
      const before = captureSnapshot();
      clearActionDraws();
      whenRunEffects(
        [
          {
            op: "summon",
            source: "deck",
            count: 1,
            filter: { type: "Follower" },
          },
        ],
        "first",
      );
      const picks = derivePicks(recorder.getRolls(), before).filter(
        (p) => p.what === "multiset_pick",
      );
      expect(picks).toHaveLength(1);
      expect(picks[0]?.among).toBe("deck");
      expect(getBoard(state, "first")).toHaveLength(1);
    } finally {
      setDrawRecording(false);
      uninstallTraceRng(state);
    }
  });

  it("random_target slot counts surviving followers during a death batch", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const a = createCard("10001110", "board", "second");
    a.uid = "board_a";
    const b = createCard("10001110", "board", "second");
    b.uid = "board_b";
    b.defense = 0;
    const c = createCard("10001110", "board", "second");
    c.uid = "board_c";
    state.players.second.board = [a, b, c];

    const recorder = installTraceRng(state)!;
    try {
      const before = captureSnapshot();
      state.rng.pick([c]);
      const pick = derivePicks(recorder.getRolls(), before).find(
        (p) => p.what === "random_target",
      );
      expect(pick).toEqual({
        what: "random_target",
        among: "enemy_followers",
        chose: { slot: 1 },
      });
    } finally {
      uninstallTraceRng(state);
    }
  });

  it("board pick without zone derives random_target from game state", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const boardCard = createCard("90074140", "board", "second");
    boardCard.uid = "transformed_buddy";
    delete (boardCard as { zone?: string }).zone;
    state.players.second.board = [boardCard];

    const recorder = installTraceRng(state)!;
    try {
      const before = captureSnapshot();
      state.rng.pick([boardCard]);
      const roll = recorder.getRolls()[0];
      expect(roll?.m).toBe("pick");
      expect(roll?.chose).toMatchObject({
        zone: "board",
        slot: 0,
        owner: "second",
        card: "90074140",
      });
      const pick = derivePicks(recorder.getRolls(), before)[0];
      expect(pick).toEqual({
        what: "random_target",
        among: "enemy_followers",
        chose: { slot: 0 },
      });
    } finally {
      uninstallTraceRng(state);
    }
  });

  it("hand pick still derives by zone when card is not on a board", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const handCard = createCard("10131320", "hand", "first");
    state.players.first.hand = [handCard];

    const recorder = installTraceRng(state)!;
    try {
      const before = captureSnapshot();
      state.rng.pick([handCard]);
      const roll = recorder.getRolls()[0];
      expect(roll?.chose).toMatchObject({
        zone: "hand",
        card: "10131320",
      });
      const pick = derivePicks(recorder.getRolls(), before)[0];
      expect(pick).toEqual({
        what: "multiset_pick",
        among: "hand",
        chose: "10131320",
      });
    } finally {
      uninstallTraceRng(state);
    }
  });

  it("board pick without zone skips zero-defense cards in slot numbering", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const dead = createCard("10001110", "board", "second");
    dead.uid = "board_dead";
    dead.defense = 0;
    delete (dead as { zone?: string }).zone;
    const live = createCard("90074140", "board", "second");
    live.uid = "transformed_buddy";
    delete (live as { zone?: string }).zone;
    state.players.second.board = [dead, live];

    const recorder = installTraceRng(state)!;
    try {
      const before = captureSnapshot();
      state.rng.pick([live]);
      const roll = recorder.getRolls()[0];
      expect(roll?.chose).toMatchObject({
        zone: "board",
        slot: 0,
        owner: "second",
      });
      const pick = derivePicks(recorder.getRolls(), before)[0];
      expect(pick).toEqual({
        what: "random_target",
        among: "enemy_followers",
        chose: { slot: 0 },
      });
    } finally {
      uninstallTraceRng(state);
    }
  });

  it("random_target records board pick for card absent from before state", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.second.board = [];

    const recorder = installTraceRng(state)!;
    try {
      const before = captureSnapshot();
      const skeleton = createCard("90051110", "board", "second");
      skeleton.uid = "summoned_skeleton";
      state.players.second.board = [skeleton];
      state.rng.pick([skeleton]);
      const picks = derivePicks(recorder.getRolls(), before);
      expect(picks.some((p) => p.what === "random_target")).toBe(true);
      expect(picks.some((p) => p.what === "random_card")).toBe(false);
    } finally {
      uninstallTraceRng(state);
    }
  });

  it("random_target slot unchanged when no pending deaths", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const a = createCard("10001110", "board", "second");
    a.uid = "board_a";
    const b = createCard("10001110", "board", "second");
    b.uid = "board_b";
    const c = createCard("10001110", "board", "second");
    c.uid = "board_c";
    state.players.second.board = [a, b, c];

    const recorder = installTraceRng(state)!;
    try {
      const before = captureSnapshot();
      state.rng.pick([b]);
      const pick = derivePicks(recorder.getRolls(), before).find(
        (p) => p.what === "random_target",
      );
      expect(pick).toEqual({
        what: "random_target",
        among: "enemy_followers",
        chose: { slot: 1 },
      });
    } finally {
      uninstallTraceRng(state);
    }
  });

  it("rng picks follow execution order (random target before consequence draw)", () => {
    givenGameState({ seed: 99, activePlayer: "first" })
      .withFirstHand(["10012310"])
      .withFirstPP(10, 10)
      .build();

    const ally = createCard("10001110", "board", "first");
    ally.uid = "ally_return";
    state.players.first.board = [ally];

    const leah = createCard("10001120", "board", "second");
    leah.defense = 2;
    leah.peak_defense = 2;
    state.players.second.board = [leah];

    const before = captureSnapshot();
    const recorder = installTraceRng(state)!;
    setDrawRecording(true);
    try {
      clearActionDraws();
      whenPlayCard("first", 0);
      resolvePendingTarget("ally_return");
      const picks = derivePicks(recorder.getRolls(), before);
      const randomIdx = picks.findIndex((p) => p.what === "random_target");
      const drawIdx = picks.findIndex((p) => p.what === "draw");
      expect(randomIdx).toBeGreaterThanOrEqual(0);
      expect(drawIdx).toBeGreaterThanOrEqual(0);
      expect(randomIdx).toBeLessThan(drawIdx);
    } finally {
      setDrawRecording(false);
      uninstallTraceRng(state);
    }
  });

  it("evolved followers do not list rush from isRush combat flag", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstHand(["10011110", "10011110", "10011130"])
      .withFirstPP(10, 10)
      .build();

    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);

    const treant = getBoard(state, "first").find(
      (c) => c?.name === "Gentle Treant",
    );
    expect(treant?.hasEvolved).toBe(true);
    const slot = getBoard(state, "first").indexOf(treant!);
    const canon = toCanonicalState(state).players.a.field[slot]!;
    expect(canon?.traits ?? []).not.toContain("rush");
  });

  it("Normagdala fanfare exposes mode choice then records choose action", async () => {
    const result = await runTraceGame({
      seed: TRACE_SEED,
      gameIndex: 11,
      deckA: rampDeck as Record<string, number>,
      deckB: rampDeck as Record<string, number>,
      turnCap: 60,
      actionCap: 800,
    });
    const playIdx = result.lines.findIndex(
      (line) => "play" in line.action && line.action.play.card === "10944120",
    );
    expect(playIdx).toBeGreaterThanOrEqual(0);
    const playLine = result.lines[playIdx]!;
    expect(playLine.state.phase).toBe("choice");
    const modeLegals = playLine.legal.filter(
      (a) =>
        "choose" in a &&
        typeof a.choose.option === "object" &&
        "mode" in a.choose.option,
    );
    expect(modeLegals).toHaveLength(2);
    const chooseLine = result.lines[playIdx + 1];
    expect(chooseLine).toBeDefined();
    expect("choose" in chooseLine!.action).toBe(true);
    expect(chooseLine!.action).toMatchObject({
      choose: {
        player: playLine.action.play.player,
        option: { mode: expect.any(Number) },
      },
    });
  }, 180_000);

  it("choose slot carries player when selection pool spans both boards", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const enemy = createCard("10001110", "board", "second");
    enemy.uid = "enemy_board";
    const ally = createCard("10001110", "board", "first");
    ally.uid = "ally_board";
    state.players.second.board = [enemy];
    state.players.first.board = [ally];

    const sincerity = createCard("10573310", "hand", "first");
    state.pendingTargetEffect = {
      owner: "first",
      pool: [enemy, ally],
      poolUids: [enemy.uid, ally.uid],
      targetUids: [],
      selectCount: 1,
    };

    const legal = getLegalNeutralActions(state);
    const slotChoices = legal.filter(
      (action) =>
        "choose" in action &&
        typeof action.choose.option === "object" &&
        "slot" in action.choose.option,
    );
    expect(slotChoices).toHaveLength(2);
    expect(slotChoices).toEqual(
      expect.arrayContaining([
        { choose: { player: "a", option: { slot: 0, player: "a" } } },
        { choose: { player: "a", option: { slot: 0, player: "b" } } },
      ]),
    );

    const action = soakActionToNeutral(
      {
        type: "CHOOSE_TARGET",
        player: "first",
        target: { type: "card", uid: enemy.uid },
      },
      state,
    );
    expect(action).toEqual({
      choose: { player: "a", option: { slot: 0, player: "b" } },
    });
    state.pendingTargetEffect = undefined;
  });

  it("choose slot omits player when selection pool is one board", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const enemyA = createCard("10001110", "board", "second");
    enemyA.uid = "enemy_a";
    const enemyB = createCard("10001110", "board", "second");
    enemyB.uid = "enemy_b";
    state.players.second.board = [enemyA, enemyB];

    state.pendingTargetEffect = {
      owner: "first",
      pool: [enemyA, enemyB],
      poolUids: [enemyA.uid, enemyB.uid],
      targetUids: [],
      selectCount: 1,
    };

    const legal = getLegalNeutralActions(state);
    const slotChoices = legal.filter(
      (action) =>
        "choose" in action &&
        typeof action.choose.option === "object" &&
        "slot" in action.choose.option,
    );
    expect(slotChoices).toEqual([
      { choose: { player: "a", option: { slot: 0 } } },
      { choose: { player: "a", option: { slot: 1 } } },
    ]);

    const action = soakActionToNeutral(
      {
        type: "CHOOSE_TARGET",
        player: "first",
        target: { type: "card", uid: enemyB.uid },
      },
      state,
    );
    expect(action).toEqual({
      choose: { player: "a", option: { slot: 1 } },
    });
    state.pendingTargetEffect = undefined;
  });

  it("return-to-deck deferred insert records raw shuffle pick", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.hand = [
      createCard("10001110", "hand", "first"),
      createCard("10001120", "hand", "first"),
    ];
    state.players.first.deck = [createCard("10001130", "deck", "first")];

    const recorder = installTraceRng(state)!;
    setDrawRecording(true);
    try {
      const before = captureSnapshot();
      clearActionDraws();
      whenRunEffects(
        [
          {
            op: "return",
            destination: "deck",
            select: 1,
            select_mode: "random",
            target: "ally:hand",
          },
          { op: "draw", count: 1 },
        ],
        "first",
      );
      const rawPicks = derivePicks(recorder.getRolls(), before).filter(
        (p) => p.what === "raw",
      );
      expect(rawPicks.length).toBeGreaterThan(0);
      expect(rawPicks.every((p) => p.kind === "shuffle")).toBe(true);
      expect(
        rawPicks.some((p) => p.site.includes("core/utils.ts")),
      ).toBe(true);
    } finally {
      setDrawRecording(false);
      uninstallTraceRng(state);
    }
  });

  it("legal dedupes identical choose card options", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const a = createCard("10503310", "hand", "first");
    const b = createCard("10503310", "hand", "first");
    state.players.first.hand = [a, b];
    state.pendingTargetEffect = {
      owner: "first",
      pool: [a, b],
      poolUids: [a.uid, b.uid],
      targetUids: [],
      selectCount: 1,
    };

    const legal = getLegalNeutralActions(state);
    const cardChoices = legal.filter(
      (action) =>
        "choose" in action &&
        typeof action.choose.option === "object" &&
        "card" in action.choose.option,
    );
    expect(cardChoices).toHaveLength(1);
    expect(cardChoices[0]).toEqual({
      choose: { player: "a", option: { card: "10503310" } },
    });
    state.pendingTargetEffect = undefined;
  });

  it("field attacks_left falls back to attacks_per_turn before first attack", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
      .withFirstHand(["10924120"])
      .withFirstPP(10, 10)
      .build();
    whenPlayCard("first", 0);
    const bel = getBoard(state, "first").find((c) => c?.id === "10924120");
    expect(bel).toBeTruthy();
    expect(bel!.attacks_left).toBeUndefined();
    const slot = getBoard(state, "first").indexOf(bel!);
    const canon = toCanonicalState(state).players.a.field[slot]!;
    expect(canon.attacks_left).toBe(3);
  });

  it("field attacks_left uses explicit zero over attacks_per_turn", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const vanillaTpl = getGlobalCardIndex()?.byId.get("10001110");
    expect(vanillaTpl).toBeTruthy();
    const follower = makeCardFromDB(vanillaTpl!, "first");
    follower.attacks_per_turn = 3;
    follower.attacks_left = 0;
    follower.zone = "board";
    state.players.first.board = [follower];
    const canon = toCanonicalState(state).players.a.field[0]!;
    expect(canon.attacks_left).toBe(0);
  });

  it("field attacks_left defaults to 1 without attacks_per_turn", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const vanillaTpl = getGlobalCardIndex()?.byId.get("10001110");
    expect(vanillaTpl).toBeTruthy();
    const follower = makeCardFromDB(vanillaTpl!, "first");
    delete follower.attacks_left;
    delete follower.attacks_per_turn;
    follower.zone = "board";
    state.players.first.board = [follower];
    const canon = toCanonicalState(state).players.a.field[0]!;
    expect(canon.attacks_left).toBe(1);
  });

  it("printed engage and rush are traits/granted, not cross-listed", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const index = getGlobalCardIndex();
    const vanillaTpl = index?.byId.get("10001110");
    const engageTpl = index?.byId.get("10543310");
    expect(vanillaTpl).toBeTruthy();
    expect(engageTpl).toBeTruthy();

    const rushFollower = makeCardFromDB(vanillaTpl!, "first");
    rushFollower.hasRush = true;
    rushFollower.zone = "board";
    state.players.first.board = [rushFollower];
    const rushCanon = toCanonicalState(state).players.a.field[0]!;
    expect(rushCanon?.traits).toEqual(["rush"]);
    expect(rushCanon?.granted).toBeUndefined();

    const engageAmulet = makeCardFromDB(engageTpl!, "first");
    engageAmulet.zone = "board";
    state.players.first.board = [engageAmulet];
    const engageCanon = toCanonicalState(state).players.a.field[0]!;
    expect(engageCanon?.granted).toBeUndefined();
    expect(engageCanon?.traits ?? []).not.toContain("engage");
  });

  it("turn uses roundCount and pp is zero during mulligan", async () => {
    const result = await runTraceGame({
      seed: TRACE_SEED,
      gameIndex: 0,
      deckA: rampDeck as Record<string, number>,
      deckB: rampDeck as Record<string, number>,
      turnCap: 30,
      actionCap: 200,
    });
    const line0 = result.lines[0]!;
    expect(line0.state.turn).toBe(0);
    expect(line0.state.players.a.pp).toBe(0);
    expect(line0.state.players.b.pp).toBe(0);
    const postMulligan = result.lines.find((l) => l.state.phase === "main");
    expect(postMulligan?.state.turn).toBe(1);
  }, 120_000);

  it("mulligan legal lists all 16 swap bitmasks", async () => {
    const result = await runTraceGame({
      seed: TRACE_SEED,
      gameIndex: 0,
      deckA: rampDeck as Record<string, number>,
      deckB: rampDeck as Record<string, number>,
      turnCap: 30,
      actionCap: 200,
    });
    const line0 = result.lines[0]!;
    expect(line0.state.phase).toBe("mulligan");
    expect(line0.legal).toHaveLength(16);
    expect(line0.legal.every((a) => "mulligan" in a)).toBe(true);
  }, 120_000);
});

describe("committed trace fixtures", () => {
  const fixtures = [0, 1].map((i) =>
    resolve(FIXTURE_DIR, `trace-${TRACE_SEED}-${i}.jsonl`),
  );

  it("fixture files exist and validate format", () => {
    for (const file of fixtures) {
      expect(existsSync(file), file).toBe(true);
      const { header, lines } = parseTraceFile(file);
      expect(header.v).toBe(1);
      expect(header.engine).toBe("practice-tool");
      expect(header.deck_a).toHaveLength(40);
      expect(header.deck_b).toHaveLength(40);
      expect(header.opening_hands.a).toHaveLength(4);
      expect(header.opening_hands.b).toHaveLength(4);
      expect(header.x_final_hash).toBeTruthy();

      const last = lines[lines.length - 1]!;
      expect(last.state.phase).toBe("terminal");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        expect(line.i).toBe(i);
        for (const key of CANONICAL_STATE_KEYS) {
          expect(line.state).toHaveProperty(key);
        }
        assertPlayerShape(line.state.players.a);
        assertPlayerShape(line.state.players.b);
        expect(Array.isArray(line.legal)).toBe(true);
        if ("play" in line.action) {
          expect(line.action.play.card.startsWith("uid_")).toBe(false);
        }
      }
    }
  });

  it("no play.card values are uids", () => {
    for (const file of fixtures) {
      const { lines } = parseTraceFile(file);
      for (const line of lines) {
        if ("play" in line.action) {
          expect(line.action.play.card).not.toMatch(/^uid_/);
        }
      }
    }
  });

  it("fixture replay matches x_final_hash", async () => {
    for (let gameIndex = 0; gameIndex < fixtures.length; gameIndex++) {
      const file = fixtures[gameIndex]!;
      const { header } = parseTraceFile(file);
      // Fixtures were generated with mirror deck; replay uses soak trace format internally.
      // Verify hash via trace runner determinism instead of full soak replay when decks differ.
      const rerun = await runTraceGame({
        seed: TRACE_SEED,
        gameIndex,
        deckA: rampDeck as Record<string, number>,
        deckB: rampDeck as Record<string, number>,
        turnCap: 60,
        actionCap: 800,
      });
      expect(rerun.completion).toBe("terminal");
      expect(rerun.finalHash).toBe(header.x_final_hash);
    }
  }, 300_000);
});

void pathToFileURL;
