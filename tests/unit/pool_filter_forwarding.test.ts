/**
 * Pool filter forwarding — filter keys in card data must reach getPool → applyFilters.
 * Red-first regressions for Dark Dimensions, Illusory Conjuration, Flight of Icarus, Carnelia.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getPool } from "../../src/logic/core/targeting.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

function selectionPool(
  target: string,
  condition: Record<string, unknown> | undefined,
) {
  return getPool(target, "first", null, condition ?? {}, {
    isTargetedEffect: true,
  });
}

describe("pool filter forwarding — ignored keys", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10603210 Dark Dimensions — Encroacher followers are not damaged; others on both sides take 2", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const encAlly = createCard(
      {
        name: "Encroacher Ally",
        type: "Follower",
        defense: 5,
        tribes: ["Encroacher"],
      },
      "board",
      "first",
    );
    encAlly.peak_defense = 5;
    const encFoe = createCard(
      {
        name: "Encroacher Foe",
        type: "Follower",
        defense: 5,
        tribes: ["Encroacher"],
      },
      "board",
      "second",
    );
    encFoe.peak_defense = 5;
    const plainAlly = createCard(
      { name: "Plain Ally", type: "Follower", defense: 5 },
      "board",
      "first",
    );
    plainAlly.peak_defense = 5;
    const plainFoe = createCard(
      { name: "Plain Foe", type: "Follower", defense: 5 },
      "board",
      "second",
    );
    plainFoe.peak_defense = 5;

    state.players.first.board = [encAlly, plainAlly];
    state.players.second.board = [encFoe, plainFoe];

    const trigger = getCardById("10603210")!.triggers![0]!;
    whenRunEffects(trigger.effects!, "first");

    expect(encAlly.defense).toBe(5);
    expect(encFoe.defense).toBe(5);
    expect(plainAlly.defense).toBe(3);
    expect(plainFoe.defense).toBe(3);
  });

  it("10333310 Illusory Conjuration — hand selection pool excludes spells", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10333310", "10331310", "10331110"])
      .build();

    const selectEff = getCardById("10333310")!.spell!.find(
      (e) => e.op === "select",
    )!;
    const pool = selectionPool(
      String(selectEff.target),
      selectEff.condition as Record<string, unknown>,
    );

    expect(pool.some((c) => c.type === "Follower")).toBe(true);
    expect(pool.some((c) => c.type === "Spell")).toBe(false);
  });

  it("10272310 Flight of Icarus — hand selection excludes Artifact spells", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["90071210", "90072110"])
      .build();

    const kwEff = getCardById("10272310")!.fanfare![0]!;
    const pool = selectionPool(
      String(kwEff.target),
      kwEff.condition as Record<string, unknown>,
    );

    expect(pool.map((c) => c.name)).toContain("Striker Artifact");
    expect(pool.map((c) => c.name)).not.toContain("Gear of Ambition");
  });

  it("10273110 Carnelia — evolve hand selection excludes Artifact spells", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["90071210", "90072110"])
      .build();

    const kwEff = getCardById("10273110")!.evolve![0]!;
    const pool = selectionPool(
      String(kwEff.target),
      kwEff.condition as Record<string, unknown>,
    );

    expect(pool.map((c) => c.name)).toContain("Striker Artifact");
    expect(pool.map((c) => c.name)).not.toContain("Gear of Ambition");
  });
});

describe("pool filter forwarding — tribe regression", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("keyword tribe + type filters still restrict hand pool", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["90071210", "90072110"])
      .build();

    const artifactOnly = selectionPool("ally:hand", { tribe: "Artifact" });
    expect(artifactOnly).toHaveLength(2);

    const artifactFollowers = selectionPool("ally:hand", {
      tribe: "Artifact",
      type: "Follower",
    });
    expect(artifactFollowers).toHaveLength(1);
    expect(artifactFollowers[0]!.name).toBe("Striker Artifact");
  });
});
