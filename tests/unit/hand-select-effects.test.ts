/**
 * Hand-selection engine fixes — Vier (transform + tribe + select) and Cassius (select + object filter).
 * Red-first: these assert correct pool/selection behavior, not the pre-audit bugs.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  resetUidCounter,
  whenPlayCard,
  thenHand,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleSelect } from "../../src/logic/core/targeting.js";
import { handleTransform } from "../../src/logic/effects/ops/transform.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { getDeck } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function setupFirstTurn(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
}

describe("Vier 10272110 — hand transform honors tribe filter and select", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("transforms only the selected Puppetry follower when hand has mixed cards", () => {
    setupFirstTurn(R6, {
      hand: ["10272110", "90071110", "10102310", "10102110"],
      pp: 2,
    });

    const puppet = thenHand("first").find((c) => c.name === "Puppet")!;
    const seraphic = thenHand("first").find(
      (c) => c.name === "Seraphic Tidings",
    )!;
    const apollo = thenHand("first").find(
      (c) => c.name === "Apollo, Heaven's Envoy",
    )!;

    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeDefined();
    expect(state.pendingTargetEffect!.pool!.map((c) => c.name)).toEqual([
      "Puppet",
    ]);

    resolvePendingTarget(puppet.uid);

    expect(
      thenHand("first").some(
        (c) => c.name === "Doll Slayer" && c.uid === puppet.uid,
      ),
    ).toBe(true);
    expect(thenHand("first").some((c) => c.uid === seraphic.uid)).toBe(true);
    expect(thenHand("first").find((c) => c.uid === seraphic.uid)!.name).toBe(
      "Seraphic Tidings",
    );
    expect(thenHand("first").some((c) => c.uid === apollo.uid)).toBe(true);
    expect(thenHand("first").find((c) => c.uid === apollo.uid)!.name).toBe(
      "Apollo, Heaven's Envoy",
    );
  });

  it("leaves non-selected hand cards' uid and cost modifications intact", () => {
    setupFirstTurn(R6, {
      hand: ["10272110", "90071110", "10102310"],
      pp: 2,
    });

    const spell = thenHand("first").find((c) => c.name === "Seraphic Tidings")!;
    spell.cost_mod = -2;
    spell.effectiveCost = 1;

    const puppet = thenHand("first").find((c) => c.name === "Puppet")!;
    whenPlayCard("first", 0);
    resolvePendingTarget(puppet.uid);

    const spellAfter = thenHand("first").find((c) => c.uid === spell.uid)!;
    expect(spellAfter.name).toBe("Seraphic Tidings");
    expect(spellAfter.cost_mod).toBe(-2);
    expect(spellAfter.effectiveCost).toBe(1);
  });
});

describe("Cassius 10473110 — select pool honors object filter", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("offers only Artifact followers in hand, not spells or non-Artifact cards", () => {
    setupFirstTurn(R6, {
      hand: ["10473110", "90072110", "90071210", "90071110"],
      pp: 5,
    });

    whenPlayCard("first", 0);

    expect(state.pendingTargetEffect).toBeDefined();
    const poolNames = state.pendingTargetEffect!.pool!.map((c) => c.name);
    expect(poolNames).toEqual(["Striker Artifact"]);
  });
});

describe("select op — object filter merge (regression)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("still applies leftmost string filter after object filters are merged", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstBoard([
        { name: "Left", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "Mid", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "Right", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();

    const res = handleSelect(
      {
        op: "select",
        target: "ally:follower",
        filter: "leftmost",
        select: 1,
        effects: [{ op: "destroy", target: "selected:follower" }],
      } as any,
      "first",
      null,
      [],
      {},
    );

    expect(res).toBe("pending");
    expect(state.pendingTargetEffect!.pool!.map((c) => c.name)).toEqual([
      "Left",
    ]);
  });
});

describe("deck-zone transform — tribe/type filter regression", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("transforms only deck cards matching name filter (Apathetic Gaze pattern)", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const deck = getDeck(state, "first");
    deck.length = 0;
    const gaze = createCard(
      { name: "Apathetic Gaze", type: "Spell", cost: 2 },
      "deck",
      "first",
    );
    const other = createCard(
      { name: "Other Spell", type: "Spell", cost: 2 },
      "deck",
      "first",
    );
    deck.push(gaze, other);

    const lazing = getCardById("10742310");
    expect(lazing?.name).toBe("Lazing Flame");

    handleTransform(
      {
        op: "transform",
        target: "ally:deck",
        filter: { name: "Apathetic Gaze" },
        into: "Lazing Flame",
      } as any,
      "first",
      { sourceCard: null, context: {} },
    );

    expect(deck.find((c) => c.uid === gaze.uid)!.name).toBe("Lazing Flame");
    expect(deck.find((c) => c.uid === other.uid)!.name).toBe("Other Spell");
  });
});
