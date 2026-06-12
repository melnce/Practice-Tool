/**
 * Batch 2 — Dragoncraft audit (sets 10001–10004; basic set in Batch 1).
 *
 * Cardinal rule: assertions from card text + rulebook only.
 * States use natural roundCount/maxPP/permPP alignment (no permPP skew).
 *
 * CLASSIFICATION SUMMARY (49 non-basic Dragoncraft cards):
 * - A (behavioral test): 44
 * - A stats/keywords only (no test; check:cards): 2 — Genesis Dragon Reborn, Forte
 * - B/C resolved → tests/audit/batch02_dragoncraft_ruled.test.ts
 *
 * Primitives reused: Overflow (§769), gain_max / ramp (§326, Dragonsign owner), replicate (§747),
 *   super-evolve (§933), Engage, Enhance, Ward/Storm/Rush/Intimidate/Bane.
 * New primitive: zero damage counts as taking damage (primitives_batch1.test.ts).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenHand,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getDeck,
  getMaxPP,
  getPermPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import "../../src/logic/core/effects/index.js";

const R7 = 7;
const R6 = 6;
const R10 = 10;
const R15 = 15;

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid =
    pending!.poolUids?.[0] ??
    String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: Parameters<typeof givenGameState>[0] extends never ? never : any;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({ seed: 1, activePlayer: "first", roundCount: round })
    .withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck) b = b.withFirstDeck(opts.deck);
  b.build();
  expect(getPermPP(state, "first")).toBe(0);
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

describe("Batch 2 — Dragoncraft [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Silvercloud Dragonrider — Last Words summons Vastwing Dragon", () => {
    setupTurn(R6, { pp: 8 });
    const rider = createCard("10141110", "board", "first");
    applyKeywordsFromList(rider);
    rider.defense = 0;
    state.players.first.board = [rider];
    cleanupDead();
    expect(thenBoard("first").some((c) => c.name === "Vastwing Dragon")).toBe(true);
  });

  it("Swordsnout Trencher — Fanfare grants Storm only in Overflow", () => {
    setupTurn(R6, { hand: ["10141120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Swordsnout Trencher")?.hasStorm).toBeFalsy();

    resetUidCounter();
    setupTurn(R7, { hand: ["10141120"], pp: 5 });
    expect(isOverflow("first")).toBe(true);
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Swordsnout Trencher")?.hasStorm).toBe(true);
  });

  it("Fledgling Dragonslayer — Fanfare destroys selected enemy follower", () => {
    setupTurn(R6, { hand: ["10141130"], pp: 4 });
    const enemy = enemyFollower(4);
    whenPlayCard("first", 0);
    resolvePendingTarget(String(enemy.uid));
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Little Dragon Nanny — Fanfare summons Fire Drake Whelp; Evolve replicates Fanfare", () => {
    setupTurn(R6, { hand: ["10141140"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Fire Drake Whelp")).toHaveLength(1);

    const nanny = findOnBoard("first", "Little Dragon Nanny")!;
    onEvolve(nanny, "first", "normal");
    expect(thenBoard("first").filter((c) => c.name === "Fire Drake Whelp")).toHaveLength(2);
  });

  it("Whitescale Herald — Fanfare restores 4 leader defense in Overflow", () => {
    setupTurn(R7, { hand: ["10141150"], pp: 4 });
    state.players.first.hp = 12;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(16);
  });

  it("Calamity Breath — deals 5 damage to all followers", () => {
    setupTurn(R6, { hand: ["10141310"], pp: 6 });
    const ally = enemyFollower(5, "Ally");
    ally.owner = "first";
    state.players.first.board = [ally];
    const foe = enemyFollower(5, "Foe");
    whenPlayCard("first", 0);
    expect(ally.defense).toBe(0);
    expect(foe.defense).toBe(0);
  });

  it("Fan of Otohime — Engage (3) summons Bodyguard and discards a hand card", () => {
    setupTurn(R6, {
      hand: ["10143210", "10042310"],
      pp: 4,
    });
    const fan = createCard("10143210", "board", "first");
    applyKeywordsFromList(fan);
    state.players.first.board = [fan];
    const handBefore = thenHand("first").length;
    engageAmulet("first", 0);
    resolveFirstPending();
    expect(thenBoard("first").some((c) => c.name === "Otohime's Bodyguard")).toBe(true);
    expect(thenHand("first").length).toBe(handBefore - 1);
  });

  it("Kit, Luxfang Champion — when discarded, random ally follower gains +1/+0", () => {
    setupTurn(R6);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    const kit = createCard("10142110", "hand", "first");
    state.players.first.hand = [kit];
    applyKeywordsFromList(kit);
    if (Array.isArray(kit.on_discard)) {
      runEffects([...kit.on_discard], "first", kit);
    }
    expect(ally.attack).toBe(3);
    expect(ally.defense).toBe(2);
  });

  it("Eyfa, Windrider — Overflow Fanfare grants Intimidate (has Storm)", () => {
    setupTurn(R7, { hand: ["10142120"], pp: 3 });
    whenPlayCard("first", 0);
    const eyfa = findOnBoard("first", "Eyfa, Windrider")!;
    expect(eyfa.hasStorm).toBe(true);
    expect(eyfa.hasIntimidate).toBe(true);
  });

  it("Zell, Windreader — Super-Evolve grants Storm to another ally", () => {
    setupTurn(R7);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    const zell = createCard("10142130", "board", "first");
    zell.peak_defense = zell.defense;
    state.players.first.board = [ally, zell];
    onEvolve(zell, "first", "super");
    resolvePendingTarget(String(ally.uid));
    expect(ally.hasStorm).toBe(true);
  });

  it("Marion, Ravishing Dragonewt — +2/+2 ally; +3/+3 in Overflow", () => {
    setupTurn(R6, { hand: ["10142140"], pp: 4 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    resolvePendingTarget(String(ally.uid));
    expect(ally.attack).toBe(3);
    expect(ally.defense).toBe(3);

    resetUidCounter();
    setupTurn(R7, { hand: ["10142140"], pp: 4 });
    const ally2 = createCard(
      { name: "Ally2", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [ally2];
    whenPlayCard("first", 0);
    resolvePendingTarget(String(ally2.uid));
    expect(ally2.attack).toBe(4);
    expect(ally2.defense).toBe(4);
  });

  it("Goldennote Melody — draws 2; Overflow restores 2 leader defense", () => {
    setupTurn(R6, {
      hand: ["10142310"],
      pp: 3,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    state.players.first.hp = 10;
    const before = thenHand("first").length;
    whenPlayCard("first", 0);
    // Played card leaves hand; draw 2 → net +1 vs pre-play count
    expect(thenHand("first").length).toBe(before + 1);
    expect(getHP(state, "first")).toBe(10);

    resetUidCounter();
    setupTurn(R7, {
      hand: ["10142310"],
      pp: 3,
      deck: [
        { name: "D3", type: "Follower", attack: 1, defense: 1 },
        { name: "D4", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    state.players.first.hp = 10;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(12);
  });

  it("Liu Feng — Overflow Fanfare effect-evolves; When this evolves gains 1 max PP", () => {
    setupTurn(R7, { hand: ["10143120"], pp: 3 });
    whenPlayCard("first", 0);
    const liu = findOnBoard("first", "Liu Feng, Goldennote Ward")!;
    expect(liu.hasEvolved).toBe(true);
    expect(liu.evolve_trigger_always).toBe(true);
    expect(getPermPP(state, "first")).toBe(1);
    expect(getMaxPP(state, "first")).toBe(8);
  });

  it("Zahar, Stormwave Dragoon — Fanfare summons Vastwing Dragon", () => {
    setupTurn(R6, { hand: ["10143130"], pp: 6 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Vastwing Dragon")).toBe(true);
  });

  it("Twilight Dragon — Fanfare -0/-9 all enemies; Super-Evolve draws 3", () => {
    setupTurn(R6, { hand: ["10143140"], pp: 9 });
    const e = enemyFollower(10);
    whenPlayCard("first", 0);
    expect(e.defense).toBe(1);

    resetUidCounter();
    setupTurn(R7, {
      hand: ["10143140"],
      pp: 9,
      deck: Array.from({ length: 5 }, (_, i) => ({
        name: `Deck${i}`,
        type: "Follower" as const,
        attack: 1,
        defense: 1,
      })),
    });
    const twi = createCard("10143140", "board", "first");
    twi.peak_defense = twi.defense;
    state.players.first.board = [twi];
    const before = thenHand("first").length;
    onEvolve(twi, "first", "super");
    expect(thenHand("first").length).toBe(before + 3);
  });

  it("Burnite — Fanfare discard deals X damage to all enemy followers (X = discarded cost)", () => {
    setupTurn(R6, { hand: ["10144110", "10141310"], pp: 7 });
    const e = enemyFollower(6);
    whenPlayCard("first", 0);
    resolvePendingTarget(String(getHand(state, "first").find((c) => c.name === "Calamity Breath")!.uid));
    expect(e.defense).toBe(0);
  });

  it("Garyu — Fanfare summons Supreme Golden and Silver Dragons", () => {
    setupTurn(R6, { hand: ["10144130"], pp: 8 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Supreme Golden Dragon")).toBe(true);
    expect(thenBoard("first").some((c) => c.name === "Supreme Silver Dragon")).toBe(true);
  });
});

describe("Batch 2 — Dragoncraft [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Wise Guardian Dragon — allied super-evolve reduces its hand cost by 3", () => {
    setupTurn(R7, { hand: ["10241110"] });
    const berserker = createCard("10042110", "board", "first");
    berserker.peak_defense = berserker.defense;
    state.players.first.board = [berserker];
    const wise = getHand(state, "first").find((c) => c.name === "Wise Guardian Dragon")!;
    const baseCost = wise.cost;
    onEvolve(berserker, "first", "super");
    expect(wise.cost).toBe(baseCost - 3);
  });

  it("Soaring Ivory Dragon — Overflow Fanfare draws 1", () => {
    setupTurn(R7, {
      hand: ["10241120"],
      pp: 1,
      deck: [{ name: "Drawn", type: "Follower", attack: 1, defense: 1 }],
    });
    const before = thenHand("first").length;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBe(before);
    expect(thenHand("first").some((c) => c.name === "Drawn")).toBe(true);
  });

  it("Call of the Megalorca — summons Megalorca; Overflow adds spell copy to hand", () => {
    setupTurn(R6, { hand: ["10241310"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Majestic Megalorca")).toBe(true);
    expect(thenHand("first").some((c) => c.name === "Call of the Megalorca")).toBeFalsy();

    resetUidCounter();
    setupTurn(R7, {
      hand: ["10241310"],
      pp: 2,
      deck: [{ name: "Call of the Megalorca", type: "Spell", cost: 2, attack: 0, defense: 0 }],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Call of the Megalorca")).toBe(true);
  });

  it("Intent Dragonewt Princess — Fanfare draws 2 if super-evolved ally exists", () => {
    setupTurn(R7, {
      hand: ["10242110"],
      pp: 2,
      deck: Array.from({ length: 4 }, (_, i) => ({
        name: `C${i}`,
        type: "Follower" as const,
        attack: 1,
        defense: 1,
      })),
    });
    const ally = createCard("10042110", "board", "first");
    ally.peak_defense = ally.defense;
    state.players.first.board = [ally];
    onEvolve(ally, "first", "super");
    expect(ally.evoType).toBe("super");
    const before = thenHand("first").length;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBe(before + 1);
  });

  it("Seasoned Merman — Fanfare 2 Megalorca; Evolve summons 1 more", () => {
    setupTurn(R6, { hand: ["10242120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Majestic Megalorca")).toHaveLength(2);
    const merman = findOnBoard("first", "Seasoned Merman")!;
    onEvolve(merman, "first", "normal");
    expect(thenBoard("first").filter((c) => c.name === "Majestic Megalorca")).toHaveLength(3);
  });

  it("Pyrewyrm Blade — Engage (1) buffs ally with +1/+1 and Blade Last Words", () => {
    setupTurn(R6, { hand: ["10242210"], pp: 3 });
    const blade = createCard("10242210", "board", "first");
    applyKeywordsFromList(blade);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [blade, ally];
    engageAmulet("first", 0);
    resolvePendingTarget(String(ally.uid));
    expect(ally.attack).toBe(2);
    expect(ally.defense).toBe(2);
    expect(ally.hasLastWords).toBe(true);
  });

  it("Neptune — Fanfare crest and 2 Megalorca; Super-Evolve 2 more", () => {
    setupTurn(R7, { hand: ["10243110"], pp: 7 });
    whenPlayCard("first", 0);
    expect(getCrests(state, "first").some((c) => c.name?.includes("Neptune"))).toBe(true);
    expect(thenBoard("first").filter((c) => c.name === "Majestic Megalorca")).toHaveLength(2);

    resetUidCounter();
    setupTurn(R7);
    const nep = createCard("10243110", "board", "first");
    nep.peak_defense = nep.defense;
    state.players.first.board = [nep];
    onEvolve(nep, "first", "super");
    expect(thenBoard("first").filter((c) => c.name === "Majestic Megalorca")).toHaveLength(2);
  });

  it("Draconic Strike — reduces selected hand card cost by 2 and deals 3 to all enemy followers", () => {
    setupTurn(R6, { hand: ["10243310", "10141310"], pp: 6 });
    const e = enemyFollower(5);
    whenPlayCard("first", 0);
    const calamity = getHand(state, "first").find((c) => c.name === "Calamity Breath")!;
    resolvePendingTarget(String(calamity.uid));
    expect(calamity.cost).toBe(4);
    expect(e.defense).toBe(2);
  });

  it("Filene — Overflow adds Whitefrost Whisper; Evolve 1 damage to all enemy followers", () => {
    setupTurn(R7, { hand: ["10244110"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Whitefrost Whisper")).toBe(true);

    resetUidCounter();
    setupTurn(R6);
    const filene = createCard("10244110", "board", "first");
    filene.peak_defense = filene.defense;
    const e = enemyFollower(3);
    state.players.first.board = [filene];
    onEvolve(filene, "first", "normal");
    expect(e.defense).toBe(2);
  });

  it("Fennie — Fanfare halves all deck card costs", () => {
    setupTurn(R6, {
      hand: ["10244120"],
      pp: 8,
      deck: [
        { name: "Four", type: "Spell", cost: 4, attack: 0, defense: 0 },
        { name: "Six", type: "Spell", cost: 6, attack: 0, defense: 0 },
      ],
    });
    whenPlayCard("first", 0);
    const costs = thenDeck("first").map((c) => c.cost);
    expect(costs).toContain(2);
    expect(costs).toContain(3);
  });
});

describe("Batch 2 — Dragoncraft [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Devotee of Disdain — during your turn, damage without destroy draws Dragoncraft follower", () => {
    setupTurn(R6, {
      deck: [{ name: "DCFollower", type: "Follower", class: "Dragoncraft", attack: 1, defense: 1 }],
    });
    const devotee = createCard("10341110", "board", "first");
    state.players.first.board = [devotee];
    dealDamage(devotee, 1, "first");
    expect(thenHand("first").some((c) => c.name === "DCFollower")).toBe(true);
  });

  it("Snowstorm Dragonewt — destroys damaged enemy followers", () => {
    setupTurn(R6, { hand: ["10341120"], pp: 6 });
    const ok = enemyFollower(6);
    const damaged = enemyFollower(3);
    damaged.defense = 1;
    whenPlayCard("first", 0);
    expect(getBoard(state, "second").some((c) => c.uid === ok.uid)).toBe(true);
    expect(getBoard(state, "second").some((c) => c.uid === damaged.uid)).toBeFalsy();
  });

  it("Raging Lightning — 5 damage to highest-defense followers", () => {
    setupTurn(R6, { hand: ["10341310"], pp: 3 });
    enemyFollower(3, "Low");
    const high = enemyFollower(7, "High");
    whenPlayCard("first", 0);
    expect(high.defense).toBe(2);
    expect(findOnBoard("second", "Low")!.defense).toBe(3);
  });

  it("Supplicant of Disdain — EOT restores self and leader defense", () => {
    setupTurn(R6, { hand: ["10342110"], pp: 5 });
    state.players.first.hp = 10;
    whenPlayCard("first", 0);
    const sup = findOnBoard("first", "Supplicant of Disdain")!;
    dealDamage(sup, 3, "first");
    dealDamage({ type: "Leader" } as any, 5, "first");
    whenEndTurn();
    expect(sup.defense).toBe(sup.peak_defense ?? 7);
    expect(getHP(state, "first")).toBeGreaterThan(10);
  });

  it("Ocean Rider — 1 Megalorca; 2 in Overflow; Marine ally gains Ward", () => {
    setupTurn(R6, { hand: ["10342120"], pp: 3 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Majestic Megalorca")).toHaveLength(1);

    resetUidCounter();
    setupTurn(R7, { hand: ["10342120"], pp: 3 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Majestic Megalorca")).toHaveLength(2);

    const megalorca = thenBoard("first").find((c) => c.name === "Majestic Megalorca")!;
    expect(megalorca.hasWard).toBe(true);
  });

  it("Nation of Disdain — Engage (1) deals 1 damage to all followers", () => {
    setupTurn(R6, { hand: ["10342210"], pp: 3 });
    const amulet = createCard("10342210", "board", "first");
    applyKeywordsFromList(amulet);
    state.players.first.board = [amulet];
    const ally = enemyFollower(3, "Ally");
    ally.owner = "first";
    state.players.first.board.push(ally);
    state.players.second.board = [enemyFollower(3)];
    engageAmulet("first", 0);
    expect(ally.defense).toBe(2);
    expect(state.players.second.board[0].defense).toBe(2);
  });

  it("Congregant of Disdain — Fanfare 3 damage to all; EOT buffs Dragoncraft hand if def ≤ 3", () => {
    setupTurn(R6, { hand: ["10343110"], pp: 6 });
    enemyFollower(5);
    whenPlayCard("first", 0);
    const cong = findOnBoard("first", "Congregant of Disdain")!;
    expect(cong.defense).toBe(4);
    dealDamage(cong, 1, "first");
    expect(cong.defense).toBe(3);
    const handCard = createCard(
      { name: "HandDC", type: "Follower", class: "Dragoncraft", cost: 2, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    state.players.first.hand.push(handCard);
    whenEndTurn();
    expect(handCard.attack).toBe(2);
    expect(handCard.defense).toBe(2);
  });

  it("Ferocious Flame — 1 dmg ally, 3 to random enemy follower; Overflow draws Dragoncraft follower", () => {
    setupTurn(R6, {
      hand: ["10343310"],
      pp: 1,
      deck: [{ name: "DC", type: "Follower", class: "Dragoncraft", attack: 1, defense: 1 }],
    });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 3, defense: 3 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    state.players.second.board = [enemyFollower(5)];
    whenPlayCard("first", 0);
    resolvePendingTarget(String(ally.uid));
    expect(ally.defense).toBe(2);

    resetUidCounter();
    setupTurn(R7, {
      hand: ["10343310"],
      pp: 1,
      deck: [{ name: "DC2", type: "Follower", class: "Dragoncraft", attack: 1, defense: 1 }],
    });
    state.players.first.board = [ally];
    state.players.second.board = [enemyFollower(5)];
    whenPlayCard("first", 0);
    resolvePendingTarget(String(ally.uid));
    expect(thenHand("first").some((c) => c.name === "DC2")).toBe(true);
  });

  it("Azurifrit — Fanfare deals 2 damage to all followers three times", () => {
    setupTurn(R6, { hand: ["10344110"], pp: 9 });
    const e = enemyFollower(6);
    whenPlayCard("first", 0);
    expect(e.defense).toBe(0);
  });

  it("Galmieux — Fanfare crest; Enhance (7) Storm; once per turn damage trigger hits enemy", () => {
    setupTurn(R6, { hand: ["10344120"], pp: 7 });
    whenPlayCard("first", 0);
    expect(getCrests(state, "first").some((c) => c.name?.includes("Galmieux"))).toBe(true);
    const g = findOnBoard("first", "Galmieux, Ardor Manifest")!;
    expect(g.hasStorm).toBe(true);
    state.players.second.board = [enemyFollower(5)];
    dealDamage(g, 1, "first");
    const enemy = state.players.second.board[0];
    expect(enemy.defense).toBe(2);
  });
});

describe("Batch 2 — Dragoncraft [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Joel — has Ward and Aura on play", () => {
    setupTurn(R6, { hand: ["10441110"], pp: 3 });
    whenPlayCard("first", 0);
    const joel = findOnBoard("first", "Joel, Wave Chaser")!;
    expect(joel.hasWard).toBe(true);
    expect(joel.hasAura).toBe(true);
  });

  it("Crescent Tube Ride — gains countdown crest", () => {
    setupTurn(R6, { hand: ["10441310"], pp: 2 });
    whenPlayCard("first", 0);
    expect(getCrests(state, "first").some((c) => c.name?.includes("Crescent Tube Ride"))).toBe(
      true,
    );
  });

  it("Izmir — at 10 max PP Fanfare effect-evolves; When this evolves deals 3 to all enemies", () => {
    setupTurn(R10, { hand: ["10442110"], pp: 5 });
    const e = enemyFollower(5);
    whenPlayCard("first", 0);
    const iz = findOnBoard("first", "Izmir, Frigid Fate")!;
    expect(iz.hasEvolved).toBe(true);
    expect(iz.evolve_trigger_always).toBe(true);
    expect(e.defense).toBe(2);
  });

  it("Mugen — Super Skybound Art (15) grants Storm; Super-Evolve destroys 2 enemies", () => {
    setupTurn(R15, { hand: ["10442120"], pp: 8 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Mugen, Steel-Bodied Honesty")?.hasStorm).toBe(true);

    resetUidCounter();
    setupTurn(R7);
    const mugen = createCard("10442120", "board", "first");
    mugen.peak_defense = mugen.defense;
    state.players.second.board = [enemyFollower(3, "A"), enemyFollower(3, "B")];
    state.players.first.board = [mugen];
    onEvolve(mugen, "first", "super");
    resolvePendingTarget(String(state.players.second.board[0].uid));
    resolvePendingTarget(String(state.players.second.board[1]?.uid ?? state.players.second.board[0].uid));
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Maximum Love Bomb — 3 damage and can't attack until opponent EOT", () => {
    setupTurn(R6, { hand: ["10442310"], pp: 2 });
    const e = enemyFollower(5);
    whenPlayCard("first", 0);
    resolvePendingTarget(String(e.uid));
    expect(e.defense).toBe(2);
    expect(e.cantAttack || e.cantAttackFollowers || e.cantAttackLeaders).toBeTruthy();
  });

  it("Meg — Skybound Art (10) super-evolves on Fanfare", () => {
    setupTurn(R10, { hand: ["10443110"], pp: 3 });
    whenPlayCard("first", 0);
    const meg = findOnBoard("first", "Meg, Girl Next Door")!;
    expect(meg.evoType).toBe("super");
  });

  it("Primal Beast Absorption — banishes enemy and adds copy to hand", () => {
    setupTurn(R6, { hand: ["10443310"], pp: 5 });
    const e = enemyFollower(4);
    whenPlayCard("first", 0);
    resolvePendingTarget(String(e.uid));
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(thenHand("first").some((c) => c.name === "Enemy")).toBe(true);
  });

  it("Wilnas — Fanfare 8 damage to enemy; Evolve replicates Fanfare", () => {
    setupTurn(R6, { hand: ["10444110"], pp: 7 });
    const e = enemyFollower(10);
    whenPlayCard("first", 0);
    resolvePendingTarget(String(e.uid));
    expect(e.defense).toBe(2);

    resetUidCounter();
    setupTurn(R6);
    const w = createCard("10444110", "board", "first");
    w.peak_defense = w.defense;
    const e2 = enemyFollower(10);
    state.players.first.board = [w];
    onEvolve(w, "first", "normal");
    resolvePendingTarget(String(e2.uid));
    expect(e2.defense).toBe(2);
  });
});
