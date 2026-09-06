/**
 * Official Q&A: "Whose cost has been changed" = effective play cost ≠ printed
 * base cost at the moment of playing (Institute of Truth 10332210).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import "../../src/logic/core/effects/index.js";

const INSTITUTE = "10332210";
const BLAZE = "10032120";
const QUAKE = "10001130";
const WHITEFROST = "90044310";
const FILLER = "10131310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function playInstituteFromHand(extraHand: string[] = []) {
  setupTurn(6, {
    hand: [INSTITUTE, ...extraHand],
    pp: 6,
    deck: [FILLER, FILLER, FILLER],
  });
  whenPlayCard("first", 0);
  return findOnBoard("first", "Institute of Truth")!;
}

function instituteCountdown(): number {
  return Number(findOnBoard("first", "Institute of Truth")!.countdown);
}

describe("cost_changed — net effective vs printed base", () => {
  beforeEach(() => resetUidCounter());

  it("Blaze spellboosted once (9): triggers draw + countdown advance", () => {
    playInstituteFromHand([BLAZE]);
    const cd0 = instituteCountdown();
    const deck0 = state.players.first.deck.length;
    const blaze = thenHand("first").find((c) => c.id === BLAZE)!;
    spellboostHand("first", 1, blaze);
    state.players.first.pp = 9;
    whenPlayCard("first", 0);
    expect(state.players.first.deck.length).toBe(deck0 - 1);
    expect(instituteCountdown()).toBe(cd0 - 1);
  });

  it("Blaze at 9 then +1 Whitefrost on enemy turn (net 10): does not trigger", () => {
    playInstituteFromHand([BLAZE]);
    const blaze = thenHand("first").find((c) => c.id === BLAZE)!;
    spellboostHand("first", 1, blaze);
    expect(Number(blaze.cost)).toBe(9);

    whenEndTurn();
    state.players.second.hand = [createCard(WHITEFROST, "hand", "second")];
    state.players.second.pp = 3;
    (globalThis as any).HEADLESS = true;
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("second", 0);
    whenEndTurn();

    const blazeAfter = thenHand("first").find((c) => c.id === BLAZE)!;
    expect(getEffectiveCost(blazeAfter)).toBe(10);
    const cd0 = instituteCountdown();
    state.players.first.pp = 10;
    const blazeIdx = thenHand("first").findIndex((c) => c.id === BLAZE);
    whenPlayCard("first", blazeIdx);
    expect(instituteCountdown()).toBe(cd0);
  });

  it("Blaze spellboosted 10 times (0): triggers", () => {
    playInstituteFromHand([BLAZE]);
    const cd0 = instituteCountdown();
    const deck0 = state.players.first.deck.length;
    const blaze = thenHand("first").find((c) => c.id === BLAZE)!;
    spellboostHand("first", 10, blaze);
    state.players.first.pp = 0;
    whenPlayCard("first", 0);
    expect(state.players.first.deck.length).toBe(deck0 - 1);
    expect(instituteCountdown()).toBe(cd0 - 1);
  });

  it("Quake Goliath raised to 5: triggers", () => {
    playInstituteFromHand([QUAKE]);
    const cd0 = instituteCountdown();
    const deck0 = state.players.first.deck.length;
    const quake = thenHand("first").find((c) => c.id === QUAKE)!;
    quake.cost_mod = 1;
    state.players.first.pp = 5;
    whenPlayCard("first", 0);
    expect(state.players.first.deck.length).toBe(deck0 - 1);
    expect(instituteCountdown()).toBe(cd0 - 1);
  });

  it("untouched follower: no trigger", () => {
    playInstituteFromHand([QUAKE]);
    const cd0 = instituteCountdown();
    const deck0 = state.players.first.deck.length;
    state.players.first.pp = 4;
    whenPlayCard("first", 0);
    expect(state.players.first.deck.length).toBe(deck0);
    expect(instituteCountdown()).toBe(cd0);
  });
});

describe("cost_changed — sabotage proof", () => {
  it("would trigger Institute when net cost equals printed after Whitefrost", () => {
    playInstituteFromHand([BLAZE]);
    const cd0 = instituteCountdown();
    const blaze = thenHand("first").find((c) => c.id === BLAZE)!;
    spellboostHand("first", 1, blaze);
    blaze.cost_mod = 1;
    state.players.first.pp = 10;
    whenPlayCard("first", 0);
    // Sabotage: old rule treated any cost_mod !== 0 as changed even at net 10.
    expect(instituteCountdown()).toBe(cd0);
  });
});
