/**
 * Batch 4 — Loot fuse primitives (fuse_recipes + Returning Slash / Octrice).
 * Assertions from card text + Batch 4 fix-pass rulings only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { fuse_finalize_loot } from "../../src/logic/effects/ops/fuse/fuse.loot.js";
import { evaluateCondition } from "../../src/logic/effects/gates/conditions.js";
import {
  getShadows,
  getCrests,
  getHand,
} from "../../src/core/playerHelpers.js";
import { getGraveyard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function lootSpell(name: string) {
  return createCard(
    { name, type: "Spell", cost: 1, tribes: ["Loot"] },
    "hand",
    "first",
  );
}

describe("Loot fuse — fuse_recipes primitive", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("fuses two differently-named Loot spells: leave hand, no shadows, fused_loot_unique = 2, gate draws", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstPP(6, 6)
      .build();
    const shadowsBefore = getShadows(state, "first");
    const host = createCard("10323310", "hand", "first");
    const boots = lootSpell("Gilded Boots");
    const goblet = lootSpell("Gilded Goblet");
    state.players.first.hand = [host, boots, goblet];

    fuse_finalize_loot("first", host.uid, [boots, goblet]);

    expect(thenHand("first").map((c) => c.uid)).toEqual([host.uid]);
    expect(getShadows(state, "first")).toBe(shadowsBefore);
    expect((host as any)._fusedLootNames?.length).toBe(2);
    expect(
      evaluateCondition(
        { op: "gate", condition: "has_fuse_materials" } as any,
        "first",
        host,
      ),
    ).toBe(true);

    const deck = [
      { name: "Drawn", type: "Follower", cost: 1, attack: 1, defense: 1 },
    ];
    state.players.first.deck = deck.map((d) =>
      createCard(d, "deck", "first"),
    ) as any;
    runEffects([...(getCardById("10323310")!.spell ?? [])], "first", host);
    expect(thenHand("first").some((c) => c.name === "Drawn")).toBe(true);
    expect(
      getGraveyard(state, "first").some((c) => c.name === "Gilded Boots"),
    ).toBe(false);
  });

  it("loot_fused advances Octrice crest countdown", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10324120"])
      .withFirstPP(3, 6)
      .build();
    whenPlayCard("first", 0);
    const crest = getCrests(state, "first").find(
      (c) => c.name === "Octrice, Hollowness Manifest",
    )!;
    const before = crest.countdown ?? crest.count ?? 8;
    const host = lootSpell("Gilded Blade");
    host.fuse_recipes = getCardById("10323310")!.fuse_recipes;
    state.players.first.hand.push(host);
    const blade2 = lootSpell("Gilded Necklace");
    fuse_finalize_loot("first", host.uid, [blade2]);
    const after = getCrests(state, "first").find(
      (c) => c.name === "Octrice, Hollowness Manifest",
    )!;
    expect((after.countdown ?? after.count) as number).toBeLessThan(before);
  });
});
