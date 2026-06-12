/**
 * Batch 4 — Swordcraft B/C ruled escalations (card text + rulebook).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  findOnBoard,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { handleSuperEvoGate } from "../../src/logic/effects/gates/gates.js";
import { evaluateCondition } from "../../src/logic/effects/gates/conditions.js";
import { fuse_finalize_loot } from "../../src/logic/effects/ops/fuse/fuse.loot.js";
import {
  getHP,
  getCrests,
  getBoard,
  getHand,
  setRally,
  getRally,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R10 = 10;
const R15 = 15;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({ seed: 1, activePlayer: "first", roundCount: round })
    .withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
}

function enemyFollower(def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("B/C — Ernesta replicate fanfare (10121120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve replicates Fanfare: other allies +1/+1 again", () => {
    setupTurn(R6, { hand: ["10121120"], pp: 6 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(ally.attack).toBe(3);
    const ern = findOnBoard("first", "Ernesta, Peace Hawker")!;
    onEvolve(ern, "first", "normal");
    expect(ally.attack).toBe(4);
  });
});

describe("B/C — Ignominious Samurai super_evo gate (10121150)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare grants Bane when super-evolution unlocked (gate, not hardcoded turn)", () => {
    let unlockedRound = 0;
    for (let r = 1; r <= 15; r++) {
      resetUidCounter();
      setupTurn(r, { hand: ["10121150"], pp: 2 });
      if (handleSuperEvoGate("first")) {
        unlockedRound = r;
        break;
      }
    }
    expect(unlockedRound).toBeGreaterThan(0);
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Ignominious Samurai")?.hasBane).toBe(true);

    resetUidCounter();
    setupTurn(unlockedRound - 1, { hand: ["10121150"], pp: 2 });
    expect(
      evaluateCondition(
        { op: "gate", condition: "super_evo_unlocked" } as any,
        "first",
        null,
      ),
    ).toBe(false);
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Ignominious Samurai")?.hasBane).toBeFalsy();
  });
});

describe("B/C — Ironcrown Majesty mode (10122310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Mode 1 summons Steelclad Knight and Knight; Mode 2 buffs allies", () => {
    setupTurn(R6, { pp: 3 });
    const modeBlock = getCardById("10122310")!.spell![0] as any;
    runEffects(modeBlock.options[0].effects, "first", null);
    expect(thenBoard("first").some((c) => c.name === "Steelclad Knight")).toBe(true);
    expect(thenBoard("first").some((c) => c.name === "Knight")).toBe(true);

    resetUidCounter();
    setupTurn(R6, { pp: 3 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    runEffects(modeBlock.options[1].effects, "first", null);
    expect(ally.attack).toBe(3);
    expect(ally.defense).toBe(3);
  });
});

describe("B/C — Gelt super-evolved ally EOT gate (10222110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("EOT: +1/+1 all allies when a super-evolved ally is on field", () => {
    setupTurn(R7);
    const gelt = createCard("10222110", "board", "first");
    applyKeywordsFromList(gelt);
    gelt.peak_defense = gelt.defense;
    const superAlly = createCard(
      { name: "Super", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    superAlly.peak_defense = superAlly.defense;
    superAlly.hasEvolved = true;
    superAlly.evoType = "super";
    state.players.first.board = [gelt, superAlly];
    const before = gelt.attack;
    const eotFx = (gelt.triggers![0] as any).effects;
    runEffects(eotFx, "first", gelt);
    expect(superAlly.attack).toBe(3);
  });
});

describe("B/C — Gildaria Rally(20) super + enter ping (10224110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Rally(20) Fanfare super-evolves; ally enter deals 1 to all enemy followers", () => {
    setupTurn(R7, { hand: ["10224110"], pp: 6 });
    setRally(state, "first", 19);
    state.players.first.superEvoPoints = 1;
    enemyFollower(3, "A");
    enemyFollower(3, "B");
    whenPlayCard("first", 0);
    const gild = findOnBoard("first", "Gildaria, Anathema of Peace")!;
    expect(gild.evoType).toBe("super");
    expect(getRally(state, "first")).toBeGreaterThanOrEqual(20);

    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    runEffects(
      [{ op: "summon", source: "named", name: "Knight", count: 1 } as any],
      "first",
      gild,
    );
    expect(state.players.second.board.every((c) => c.defense === 2)).toBe(true);
  });
});

describe("B/C — Lair of Usurpation Engage mode (10322210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Engage mode 1: Blade + Necklace; mode 2: Goblet + Boots", () => {
    setupTurn(R6, { hand: ["10322210"], pp: 1 });
    whenPlayCard("first", 0);
    const lair = findOnBoard("first", "Lair of Usurpation")!;
    const engageFx = (getCardById("10322210")!.keywords![0] as any).effects[0];
    runEffects(engageFx.options[0].effects, "first", lair);
    const names = thenHand("first").map((c) => c.name);
    expect(names).toContain("Gilded Blade");
    expect(names).toContain("Gilded Necklace");

    resetUidCounter();
    setupTurn(R6, { hand: ["10322210"], pp: 1 });
    whenPlayCard("first", 0);
    runEffects(engageFx.options[1].effects, "first", lair);
    const names2 = thenHand("first").map((c) => c.name);
    expect(names2).toContain("Gilded Goblet");
    expect(names2).toContain("Gilded Boots");
  });
});

describe("B/C — Returning Slash fuse gate (10323310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Without fuse: damage + Blade; top deck card drawn by play", () => {
    (globalThis as any).HEADLESS = true;
    setupTurn(R6, {
      hand: ["10323310"],
      pp: 1,
      deck: [{ name: "Top", type: "Follower", attack: 1, defense: 1 }],
    });
    enemyFollower(4);
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gilded Blade")).toBe(true);
    expect(thenHand("first").some((c) => c.name === "Top")).toBe(false);
  });

  it("With fused loot: has_fuse_materials gate also draws", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstPP(6, 6)
      .build();
    state.players.first.deck = [
      createCard(
        { name: "Stay", type: "Follower", attack: 1, defense: 1 },
        "deck",
        "first",
      ),
      createCard(
        { name: "DrawMe", type: "Follower", attack: 1, defense: 1 },
        "deck",
        "first",
      ),
    ];
    const fusedSlash = createCard("10323310", "hand", "first");
    const boots = createCard(
      { name: "Gilded Boots", type: "Spell", cost: 1, tribes: ["Loot"] },
      "hand",
      "first",
    );
    state.players.first.hand = [fusedSlash, boots];
    fuse_finalize_loot("first", fusedSlash.uid, [boots]);
    expect(
      evaluateCondition(
        { op: "gate", condition: "has_fuse_materials" } as any,
        "first",
        fusedSlash,
      ),
    ).toBe(true);
    runEffects([...(getCardById("10323310")!.spell ?? [])], "first", fusedSlash);
    expect(thenHand("first").map((c) => c.name)).toContain("DrawMe");
  });
});

describe("B/C — Octrice crest (10324120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("loot_fused on hand advances Octrice crest", () => {
    setupTurn(R6, { hand: ["10324120"], pp: 3 });
    whenPlayCard("first", 0);
    const crestBefore = getCrests(state, "first").find(
      (c) => c.name === "Octrice, Hollowness Manifest",
    )!;
    const cdBefore = crestBefore.countdown ?? crestBefore.count ?? 8;
    const host = createCard("10323310", "hand", "first");
    const partner = createCard(
      { name: "Gilded Boots", type: "Spell", cost: 1, tribes: ["Loot"] },
      "hand",
      "first",
    );
    state.players.first.hand.push(host, partner);
    fuse_finalize_loot("first", host.uid, [partner]);
    const crestAfter = getCrests(state, "first").find(
      (c) => c.name === "Octrice, Hollowness Manifest",
    )!;
    const cdAfter = crestAfter.countdown ?? crestAfter.count ?? 8;
    expect(cdAfter).toBeLessThan(cdBefore);
  });

  it("Fanfare gains Countdown(8) crest; Evolve adds Blade and Necklace", () => {
    setupTurn(R6, { hand: ["10324120"], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Octrice, Hollowness Manifest"),
    ).toBe(true);

    const oct = findOnBoard("first", "Octrice, Hollowness Manifest")!;
    onEvolve(oct, "first", "normal");
    const names = thenHand("first").map((c) => c.name);
    expect(names).toContain("Gilded Blade");
    expect(names).toContain("Gilded Necklace");
  });
});

describe("B/C — Golden Knight mode / Enhance(9) (10423110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Mode super-evolve; Enhance(9) applies all three effects", () => {
    setupTurn(R10, { hand: ["10423110"], pp: 10 });
    state.players.first.superEvoPoints = 1;
    const modes = getCardById("10423110")!.fanfare![0] as any;
    const knight = createCard("10423110", "board", "first");
    state.players.first.board = [knight];
    runEffects(modes.options[0].effects, "first", knight);
    expect(knight.evoType).toBe("super");

    resetUidCounter();
    setupTurn(R10, { hand: ["10423110"], pp: 10 });
    state.players.first.superEvoPoints = 1;
    state.players.first.hp = 12;
    enemyFollower(6);
    const enhanceFx = (getCardById("10423110")!.keywords![0] as any).effects;
    const goldenOnBoard = createCard("10423110", "board", "first");
    state.players.first.superEvoPoints = 1;
    state.players.first.board = [goldenOnBoard];
    state.players.first.hp = 12;
    runEffects(enhanceFx, "first", goldenOnBoard);
    expect(goldenOnBoard.evoType).toBe("super");
    expect(state.players.second.board.every((c) => c.defense === 2)).toBe(true);
    expect(getHP(state, "first")).toBe(16);
  });
});

describe("B/C — Knightly Ardor mode + EP (10423310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Mode 3 recovers 2 PP and 1 EP; Mode 2 buffs Swordcraft allies", () => {
    setupTurn(R6, { pp: 2 });
    const spell = getCardById("10423310")!.spell![0] as any;
    const beforeEvo = state.players.first.evoCharges;
    runEffects(spell.options[2].effects, "first", null);
    expect(state.players.first.pp).toBeGreaterThan(2);
    expect(state.players.first.evoCharges).toBe(beforeEvo + 1);

    resetUidCounter();
    setupTurn(R6, { pp: 5 });
    const ally = createCard("10121110", "board", "first");
    state.players.first.board = [ally];
    runEffects(spell.options[1].effects, "first", null);
    expect(ally.attack).toBeGreaterThanOrEqual(3);
  });
});

describe("B/C — Seofon Skybound Art / SSA (10424120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Skybound Art- evolves all unevolved allies; SSA super-evolves at gauge ≥ 15", () => {
    setupTurn(R10, { hand: ["10424120"], pp: 4 });
    const raw = createCard(
      { name: "Raw", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    raw.peak_defense = raw.defense;
    state.players.first.board = [raw];
    const seofonHand = getHand(state, "first")[0]!;
    for (let i = 0; i < 4; i++) incrementSkyboundArt("first");
    seofonHand.skyboundArtEvolvesWitnessed = 4;
    whenPlayCard("first", 0);
    expect(raw.hasEvolved).toBe(true);

    resetUidCounter();
    setupTurn(R15, { hand: ["10424120"], pp: 4 });
    state.players.first.superEvoPoints = 2;
    const raw2 = createCard(
      { name: "Raw2", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    raw2.peak_defense = raw2.defense;
    state.players.first.board = [raw2];
    const seofonHand2 = getHand(state, "first")[0]!;
    for (let i = 0; i < 5; i++) incrementSkyboundArt("first");
    seofonHand2.skyboundArtEvolvesWitnessed = 5;
    whenPlayCard("first", 0);
    expect(raw2.evoType).toBe("super");
  });
});
