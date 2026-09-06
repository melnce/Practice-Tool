/**
 * Ominous Artifact α — fuse partners accumulate across turns (official Q&A 90073110).
 * Real fuse path: startFuseFromHand → partner picks → confirm.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import {
  resolvePendingTarget,
  forceCompleteOrFizzlePendingTarget,
} from "../../src/logic/core/resolveTarget.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import { canFuse } from "../../src/logic/core/fuseFromHand.js";
import { getBanish } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const OMINOUS_ALPHA = "90073110";
const OMINOUS_BETA = "90073120";
const OMINOUS_GAMMA = "90073130";
const MASTERWORK_OMEGA = "90074110";
const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 25 }, () => FILLER);
const R6 = 6;

function setupTurn(round: number = R6) {
  givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(6, 6)
    .withFirstDeck(PAD_DECK)
    .withSecondDeck(PAD_DECK)
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function fuseAlphaPartners(alphaUid: string, ...partnerUids: string[]) {
  startFuseFromHand("first", alphaUid);
  for (const uid of partnerUids) {
    resolvePendingTarget(uid);
  }
  if (state.pendingTargetEffect) {
    forceCompleteOrFizzlePendingTarget();
  }
}

function advanceFullRound() {
  endTurnBlue();
  endTurnRed();
  state.phase = "main";
}

function banishNames(): string[] {
  return getBanish(state, "first").map((c) => c.name);
}

describe("Mechanic Contract: Ominous Artifact α fuse accumulation", () => {
  beforeEach(() => {
    resetUidCounter();
    setupTurn();
  });

  it("β on turn 1 then γ on turn 3 → Masterwork Ω in hand; β and γ banished", () => {
    const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
    const beta = createCard(OMINOUS_BETA, "hand", "first");
    const gamma = createCard(OMINOUS_GAMMA, "hand", "first");
    state.players.first.hand = [alpha, beta, gamma];

    fuseAlphaPartners(alpha.uid, beta.uid);
    expect(thenHand("first").map((c) => c.id)).toEqual([
      OMINOUS_ALPHA,
      OMINOUS_GAMMA,
    ]);
    expect(alpha.fusedArtifacts).toEqual({ beta: true, gamma: false });
    expect(banishNames()).toContain("Ominous Artifact β");

    advanceFullRound();
    advanceFullRound();

    fuseAlphaPartners(alpha.uid, gamma.uid);

    expect(thenHand("first").some((c) => c.id === MASTERWORK_OMEGA)).toBe(true);
    expect(thenHand("first").some((c) => c.id === OMINOUS_ALPHA)).toBe(false);
    expect(banishNames()).toEqual(
      expect.arrayContaining(["Ominous Artifact β", "Ominous Artifact γ"]),
    );
    expect(banishNames()).toHaveLength(2);
  });

  it("γ first then β across turns → Masterwork Ω", () => {
    const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
    const gamma = createCard(OMINOUS_GAMMA, "hand", "first");
    state.players.first.hand = [alpha, gamma];

    fuseAlphaPartners(alpha.uid, gamma.uid);
    expect(thenHand("first")[0]!.id).toBe(OMINOUS_ALPHA);
    expect(alpha.fusedArtifacts).toEqual({ beta: false, gamma: true });

    advanceFullRound();
    advanceFullRound();

    const betaLater = createCard(OMINOUS_BETA, "hand", "first");
    state.players.first.hand = [alpha, betaLater];
    fuseAlphaPartners(alpha.uid, betaLater.uid);

    expect(thenHand("first")[0]!.id).toBe(MASTERWORK_OMEGA);
  });

  it("β and γ in one fuse → Masterwork Ω (unchanged)", () => {
    const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
    const beta = createCard(OMINOUS_BETA, "hand", "first");
    const gamma = createCard(OMINOUS_GAMMA, "hand", "first");
    state.players.first.hand = [alpha, beta, gamma];

    fuseAlphaPartners(alpha.uid, beta.uid, gamma.uid);

    expect(thenHand("first").map((c) => c.id)).toEqual([MASTERWORK_OMEGA]);
    expect(banishNames()).toEqual(
      expect.arrayContaining(["Ominous Artifact β", "Ominous Artifact γ"]),
    );
    expect(banishNames()).toHaveLength(2);
  });

  it("β alone → no Ω; α stays in hand with β flag set", () => {
    const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
    const beta = createCard(OMINOUS_BETA, "hand", "first");
    state.players.first.hand = [alpha, beta];

    fuseAlphaPartners(alpha.uid, beta.uid);

    expect(thenHand("first").map((c) => c.id)).toEqual([OMINOUS_ALPHA]);
    expect(thenHand("first").some((c) => c.id === MASTERWORK_OMEGA)).toBe(
      false,
    );
    expect(alpha.fusedArtifacts).toEqual({ beta: true, gamma: false });
    expect(state.lastFuse?.result_name).toBe("wasted");
  });

  it("Masterwork Artifact Ω cannot fuse", () => {
    const omega = createCard(MASTERWORK_OMEGA, "hand", "first");
    state.players.first.hand = [
      omega,
      createCard(OMINOUS_BETA, "hand", "first"),
    ];
    expect(canFuse("first", omega.uid)).toBe(false);
  });
});
