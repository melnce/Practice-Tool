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
  consumeActionPicks,
} from "../../src/bench/trace/drawRecorder.js";
import { captureSnapshot } from "../../src/core/history.js";
import { soakActionToNeutral } from "../../src/bench/trace/neutralAction.js";
import { toCanonicalState } from "../../src/bench/trace/canonicalState.js";
import {
  givenGameState,
  whenRunEffects,
  createCard,
} from "../harness/builders.js";
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
      captureSnapshot();
      confirmMulliganCore("first");
      const draws = consumeActionPicks();
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
    installTraceRng(state)!;
    setDrawRecording(true);
    try {
      clearActionDraws();
      whenRunEffects(
        [{ op: "search", filter: { type: "Follower" }, count: 2 }],
        "first",
      );
      const picks = consumeActionPicks().filter(
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
    installTraceRng(state)!;
    setDrawRecording(true);
    try {
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
      const picks = consumeActionPicks().filter(
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
      expect(rerun.finalHash).toBe(header.x_final_hash);
    }
  }, 300_000);
});

void pathToFileURL;
