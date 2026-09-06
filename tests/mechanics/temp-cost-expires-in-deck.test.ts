/**
 * @file Mechanic Contract: until-EOT cost mods expire in deck (official Q&A 90044310)
 *
 * Whitefrost Whisper hand tax expires at end of opponent's turn even if the card
 * was returned to deck. Permanent Spellboost reductions are retained.
 *
 * Sabotage: sweeping hand only leaves deck Goliath at cost 5 after EOT (expects 4).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  resetUidCounter,
  thenDeck,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { drawCard } from "../../src/core/utils.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const WHITEFROST = "90044310";
const QUAKE_GOLIATH = "10001130";
const RUBY = "10101110";
const BLAZE_DESTROYER = "10032120";

const R7 = 7;
const SECOND_PAD_DECK = [
  { name: "PadA", type: "Follower" as const, cost: 1, attack: 1, defense: 1 },
  { name: "PadB", type: "Follower" as const, cost: 1, attack: 1, defense: 1 },
];

function applyWhitefrostHandTaxToSecond(): void {
  setScriptedModePickProvider(() => [1]);
  whenPlayCard("first", 0);
  setScriptedModePickProvider(null);
}

function setupWhitefrostRubyGoliath(): string {
  givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: R7,
  })
    .withFirstPP(3, R7)
    .withFirstHand([WHITEFROST])
    .withSecondHand([RUBY, QUAKE_GOLIATH])
    .withSecondDeck(SECOND_PAD_DECK)
    .withSecondPP(7, R7)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  applyWhitefrostHandTaxToSecond();
  whenEndTurn();
  const goliath = getHand(state, "second").find((c) => c.id === QUAKE_GOLIATH)!;
  return goliath.uid;
}

describe("Mechanic Contract: temp cost mods expire in deck", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("Goliath returned to deck same turn still costs 5 until tax expires", () => {
    const goliathUid = setupWhitefrostRubyGoliath();
    const rubyIdx = getHand(state, "second").findIndex((c) => c.id === RUBY);
    whenPlayCard("second", rubyIdx);
    resolvePendingTarget(goliathUid);

    const inDeck = thenDeck("second").find((c) => c.uid === goliathUid)!;
    expect(getEffectiveCost(inDeck)).toBe(5);
  }, 60_000);

  it("Goliath in deck reverts to cost 4 after opponent turn ends", () => {
    const goliathUid = setupWhitefrostRubyGoliath();
    const rubyIdx = getHand(state, "second").findIndex((c) => c.id === RUBY);
    whenPlayCard("second", rubyIdx);
    resolvePendingTarget(goliathUid);

    const inDeck = thenDeck("second").find((c) => c.uid === goliathUid)!;
    expect(getEffectiveCost(inDeck)).toBe(5);

    whenEndTurn();
    expect(getEffectiveCost(inDeck)).toBe(4);
  }, 60_000);

  it("redrawn next turn after deck expiry costs 4", () => {
    const goliathUid = setupWhitefrostRubyGoliath();
    const rubyIdx = getHand(state, "second").findIndex((c) => c.id === RUBY);
    whenPlayCard("second", rubyIdx);
    resolvePendingTarget(goliathUid);

    const inDeck = thenDeck("second").find((c) => c.uid === goliathUid)!;
    whenEndTurn();
    expect(getEffectiveCost(inDeck)).toBe(4);

    whenEndTurn();
    whenEndTurn();
    drawCard(state.players.second.hand, state.players.second.deck, "second");
    const redrawn = thenHand("second").find((c) => c.uid === goliathUid)!;
    expect(getEffectiveCost(redrawn)).toBe(4);
  }, 60_000);

  it("positive control: Spellboost reduction on Blaze Destroyer kept after return and EOT", () => {
    givenGameState({
      seed: 42,
      activePlayer: "second",
      roundCount: R7,
    })
      .withSecondHand([RUBY, BLAZE_DESTROYER])
      .withSecondDeck(SECOND_PAD_DECK)
      .withSecondPP(7, R7)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const blaze = getHand(state, "second").find(
      (c) => c.id === BLAZE_DESTROYER,
    )!;
    spellboostHand("second", 2, blaze);
    expect(getEffectiveCost(blaze)).toBe(8);

    const blazeUid = blaze.uid;
    const rubyIdx = getHand(state, "second").findIndex((c) => c.id === RUBY);
    whenPlayCard("second", rubyIdx);
    resolvePendingTarget(blazeUid);

    const inDeck = thenDeck("second").find((c) => c.uid === blazeUid)!;
    expect(getEffectiveCost(inDeck)).toBe(8);
    expect((inDeck as any).temp_cost_mod_until_eot).toBeUndefined();

    whenEndTurn();
    expect(getEffectiveCost(inDeck)).toBe(8);
  }, 60_000);
});
