/**
 * @file Mechanic Contract: banish-all-crests leaves Faith alone.
 *
 * Official Q&A: Alabaster Bahamut mode 3 — banishes crests but not faith.
 * Owner ruling 2026-09-06: Faith is not a crest for counting; shares five slots.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { countCrests, getCrests } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const ALABASTER = "10804110";
const R10 = 10;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
): void {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function grantFaithCrest(owner: "first" | "second" = "first"): void {
  handleGainCrest(
    {
      op: "crest",
      action: "gain",
      name: "Faith: Test Subject",
      is_faith: true,
    } as any,
    owner,
  );
}

function gainCrest(owner: "first" | "second", name: string): void {
  handleGainCrest({ op: "crest", action: "gain", name } as any, owner);
}

describe("Mechanic Contract: banish-all-crests keeps Faith", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Alabaster Bahamut mode 3 — ordinary crests banished, Faith and counter remain", () => {
    setupTurn(R10, { hand: [ALABASTER], pp: 10 });
    grantFaithCrest();
    gainCrest("first", "Test Crest A");
    gainCrest("first", "Test Crest B");
    expect(getCrests(state, "first").length).toBe(3);
    expect(countCrests(state, "first")).toBe(2);

    const faith = getCrests(state, "first").find((c) => c.isFaith)!;
    faith.counters = { faith: 4 };
    const faithBefore = faith.counters.faith;

    setScriptedModePickProvider(() => [2]);
    whenPlayCard("first", 0);
    setScriptedModePickProvider(null);

    const crests = getCrests(state, "first");
    expect(crests.length).toBe(1);
    expect(crests[0]!.isFaith).toBe(true);
    expect(crests[0]!.counters?.faith).toBe(faithBefore);
    expect(crests.some((c) => c.name === "Test Crest A")).toBe(false);
    expect(crests.some((c) => c.name === "Test Crest B")).toBe(false);
  }, 60_000);

  it("Alabaster Bahamut mode 3 with no Faith — all crests banished", () => {
    setupTurn(R10, { hand: [ALABASTER], pp: 10 });
    gainCrest("first", "Only Crest");
    expect(getCrests(state, "first").length).toBe(1);

    setScriptedModePickProvider(() => [2]);
    whenPlayCard("first", 0);
    setScriptedModePickProvider(null);

    expect(getCrests(state, "first").length).toBe(0);
  }, 60_000);
});
