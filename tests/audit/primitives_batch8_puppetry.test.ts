/**
 * Batch 8 — Puppetry trait, tokens, Vier hand transform (Portal).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R8 = 8;

const PUPPETRY_TOKEN_NAMES = [
  "Puppet",
  "Enhanced Puppet",
  "Doll Slayer",
  "Lloyd",
  "Victoria",
];

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({ seed: 1, activePlayer: "first", roundCount: round })
    .withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
}

describe("Puppetry tokens — tribe inventory", () => {
  it("named Puppetry tokens carry Puppetry tribe (except Lloyd/Victoria check)", () => {
    for (const name of ["Puppet", "Enhanced Puppet", "Doll Slayer"]) {
      const c = getCardById(
        name === "Puppet"
          ? "90071110"
          : name === "Enhanced Puppet"
            ? "90071120"
            : "90072130",
      );
      expect(c?.tribes).toContain("Puppetry");
    }
    expect(PUPPETRY_TOKEN_NAMES.length).toBe(5);
  });
});

describe("Puppetry — real play", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Puppet Shield summons 2 Enhanced Puppet", () => {
    setupTurn(R6, { hand: ["10171310"], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Enhanced Puppet").length,
    ).toBe(2);
  });

  it("Noah Fanfare adds 3 Puppets and +1/+0 to Puppetry cards in hand", () => {
    setupTurn(R8, { hand: ["10172130", "90071120"], pp: 6 });
    const enhancedBefore = thenHand("first").find(
      (c) => c.id === "90071120",
    )!;
    const atk0 = Number(enhancedBefore.attack);
    whenPlayCard("first", 0);
    const puppets = thenHand("first").filter((c) => c.name === "Puppet");
    expect(puppets.length).toBe(3);
    const enhancedAfter = thenHand("first").find((c) => c.id === "90071120")!;
    expect(Number(enhancedAfter.attack)).toBe(atk0 + 1);
  });

  it("Vier Fanfare transforms selected Puppetry hand follower into Doll Slayer", () => {
    setupTurn(R6, { hand: ["10272110", "90071110"], pp: 2 });
    const puppet = thenHand("first").find((c) => c.name === "Puppet")!;
    whenPlayCard("first", 0);
    resolvePendingTarget(puppet.uid);
    expect(
      thenHand("first").some((c) => c.name === "Doll Slayer" && c.uid === puppet.uid),
    ).toBe(true);
  });
});
