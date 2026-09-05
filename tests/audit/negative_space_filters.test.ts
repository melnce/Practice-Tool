/**
 * Negative-space audit — filtered selection / random pools.
 * Asserts out-of-filter candidates are absent from pendingTargetEffect pools
 * (or never chosen by seeded random deck / highest-attack picks).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
}

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function allyFollower(name: string, extra: Record<string, unknown> = {}) {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      ...extra,
    },
    "board",
    "first",
  );
  c.peak_defense = Number(c.defense);
  state.players.first.board.push(c);
  return c;
}

describe("negative-space filters — defense bound (≤3)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10062110 Ironfist Priest — Evolve pool excludes enemies above 3 defense", () => {
    setupTurn(R6);
    const fragile = enemyFollower(2, 3, "Fragile");
    const tank = enemyFollower(4, 4, "Tank");
    const priest = createCard("10062110", "board", "first");
    priest.peak_defense = priest.defense;
    state.players.first.board = [priest];
    onEvolve(priest, "first", "normal");
    expect(poolUids()).toContain(String(fragile.uid));
    expect(poolUids()).not.toContain(String(tank.uid));
  });

  it("10672120 Timid Pioneer — Fanfare pool excludes enemies above 3 defense", () => {
    setupTurn(R6, { hand: ["10672120"], pp: 4 });
    const fragile = enemyFollower(2, 3, "Fragile");
    const tank = enemyFollower(4, 4, "Tank");
    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(fragile.uid));
    expect(poolUids()).not.toContain(String(tank.uid));
  });

  it("10862310 Lingering Threat — pool excludes enemies above 3 defense", () => {
    setupTurn(R6, { hand: ["10862310"], pp: 2 });
    const fragile = enemyFollower(2, 3, "Fragile");
    const tank = enemyFollower(4, 4, "Tank");
    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(fragile.uid));
    expect(poolUids()).not.toContain(String(tank.uid));
  });
});

describe("negative-space filters — Artifact hand (≤5 cost)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10172320 Doomwright Resurgence — pool is Artifact followers ≤5 only", () => {
    setupTurn(R6, {
      hand: ["10172320", "90072110", "90074110", "90071210"],
      pp: 5,
    });
    const legal = thenHand("first").find((c) => c.id === "90072110")!;
    const costly = thenHand("first").find((c) => c.id === "90074110")!;
    const spell = thenHand("first").find((c) => c.id === "90071210")!;
    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(legal.uid));
    expect(poolUids()).not.toContain(String(costly.uid));
    expect(poolUids()).not.toContain(String(spell.uid));
  });

  it("10173140 Alouette — Evolve never summons Artifact followers above 5 cost", () => {
    setupTurn(R6, { hand: ["90072110", "90074110"], pp: 5 });
    const costly = thenHand("first").find((c) => c.id === "90074110")!;
    const alouette = createCard("10173140", "board", "first");
    alouette.peak_defense = alouette.defense;
    state.players.first.board = [alouette];
    onEvolve(alouette, "first", "normal");
    if (state.pendingTargetEffect) {
      const pool = poolUids();
      expect(pool).not.toContain(String(costly.uid));
      resolvePendingTarget(pool[0]!);
    }
    expect(thenHand("first").some((c) => c.uid === costly.uid)).toBe(true);
    expect(
      thenBoard("first").some((c) => c.name === "Masterwork Artifact Ω"),
    ).toBe(false);
    expect(thenBoard("first").some((c) => c.name === "Striker Artifact")).toBe(
      true,
    );
  });

  it("10174130 Ralmia — Fanfare never summons Artifact followers above 5 cost", () => {
    setupTurn(R10, {
      hand: ["10174130", "90072110", "90074110"],
      pp: 8,
    });
    const costly = thenHand("first").find((c) => c.id === "90074110")!;
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) {
      const pool = poolUids();
      expect(pool).not.toContain(String(costly.uid));
      while (state.pendingTargetEffect) {
        resolvePendingTarget(poolUids()[0]!);
      }
    }
    expect(thenHand("first").some((c) => c.uid === costly.uid)).toBe(true);
    expect(
      thenBoard("first").some((c) => c.name === "Masterwork Artifact Ω"),
    ).toBe(false);
    expect(thenBoard("first").some((c) => c.name === "Striker Artifact")).toBe(
      true,
    );
  });

  it("10271210 Artifact Catapult — Engage pool is Artifact followers ≤5 only", () => {
    setupTurn(R6, {
      hand: ["10271210", "90072110", "90074110"],
      pp: 6,
    });
    const legal = thenHand("first").find((c) => c.id === "90072110")!;
    const costly = thenHand("first").find((c) => c.id === "90074110")!;
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Artifact Catapult",
    );
    engageAmulet("first", idx);
    expect(poolUids()).toContain(String(legal.uid));
    expect(poolUids()).not.toContain(String(costly.uid));
  });

  it("10274120 Karula — Fanfare never summons Artifact followers above 5 cost", () => {
    setupTurn(R6, { hand: ["10274120", "90072110", "90074110"], pp: 5 });
    const costly = thenHand("first").find((c) => c.id === "90074110")!;
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) {
      const pool = poolUids();
      expect(pool).not.toContain(String(costly.uid));
      resolvePendingTarget(pool[0]!);
    }
    expect(thenHand("first").some((c) => c.uid === costly.uid)).toBe(true);
    expect(
      thenBoard("first").some((c) => c.name === "Masterwork Artifact Ω"),
    ).toBe(false);
    expect(thenBoard("first").some((c) => c.name === "Striker Artifact")).toBe(
      true,
    );
  });

  it("10572110 New-Age Cartographer — Super-Evolve pool is Artifact followers ≤5 only", () => {
    setupTurn(R7, { hand: ["10572110", "90072110", "90074110"], pp: 4 });
    whenPlayCard("first", 0);
    const cart = findOnBoard("first", "New-Age Cartographer")!;
    state.players.first.superEvoCharges = 1;
    onEvolve(cart, "first", "super");
    const legal = thenHand("first").find((c) => c.id === "90072110")!;
    const costly = thenHand("first").find((c) => c.id === "90074110")!;
    expect(poolUids()).toContain(String(legal.uid));
    expect(poolUids()).not.toContain(String(costly.uid));
  });
});

describe("negative-space filters — tribe / type hand selection", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10371120 Supersonic Fighter — Evolve pool is allied Artifact followers only", () => {
    setupTurn(R6, { hand: ["10371120"], pp: 7 });
    whenPlayCard("first", 0);
    const artifact = allyFollower("StrikerOnBoard", { tribes: ["Artifact"] });
    const plain = allyFollower("PlainAlly");
    const fighter = findOnBoard("first", "Supersonic Fighter")!;
    onEvolve(fighter, "first", "normal");
    expect(poolUids()).toContain(String(artifact.uid));
    expect(poolUids()).not.toContain(String(plain.uid));
  });

  it("10332210 Institute of Truth — Engage pool is hand followers only", () => {
    setupTurn(R6, { hand: ["10332210", "10131110", "10131310"], pp: 3 });
    const follower = thenHand("first").find((c) => c.type === "Follower")!;
    const spell = thenHand("first").find((c) => c.type === "Spell")!;
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Institute of Truth",
    );
    engageAmulet("first", idx);
    expect(poolUids()).toContain(String(follower.uid));
    expect(poolUids()).not.toContain(String(spell.uid));
  });

  it("10741120 Carrier Wyvern — Evolve pool is hand followers only", () => {
    setupTurn(R6, { hand: ["10741120", "10161120", "10131310"], pp: 4 });
    const followerUid = thenHand("first").find((c) => c.id === "10161120")!.uid;
    const spellUid = thenHand("first").find((c) => c.id === "10131310")!.uid;
    whenPlayCard("first", 0);
    const wyvern = findOnBoard("first", "Carrier Wyvern")!;
    onEvolve(wyvern, "first", "normal");
    expect(poolUids()).toContain(String(followerUid));
    expect(poolUids()).not.toContain(String(spellUid));
  });

  it("10853110 Suzy — Evolve buffs only the selected hand follower", () => {
    setupTurn(R6, { hand: ["10853110", "10161120", "10131310"], pp: 4 });
    const follower = thenHand("first").find((c) => c.id === "10161120")!;
    const spell = thenHand("first").find((c) => c.id === "10131310")!;
    const atk0 = Number(follower.attack);
    enemyFollower(3, 3, "FanfareTarget");
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) {
      resolvePendingTarget(poolUids()[0]!);
    }
    const suzy = findOnBoard("first", "Suzy, Sincere Hexcaster")!;
    onEvolve(suzy, "first", "normal");
    if (state.pendingTargetEffect) {
      resolvePendingTarget(String(follower.uid));
    }
    expect(Number(follower.attack)).toBe(atk0 + 3);
    expect(Number(spell.attack ?? 0)).toBe(0);
  });

  it("10161110 Angelic Prism Priestess — Evolve pool is hand amulets only", () => {
    setupTurn(R6, { hand: ["10161110", "10161210", "10161120"], pp: 3 });
    const amulet = thenHand("first").find((c) => c.type === "Amulet")!;
    const follower = thenHand("first").find((c) => c.type === "Follower")!;
    whenPlayCard("first", 0);
    const priestess = findOnBoard("first", "Angelic Prism Priestess")!;
    onEvolve(priestess, "first", "normal");
    expect(poolUids()).toContain(String(amulet.uid));
    expect(poolUids()).not.toContain(String(follower.uid));
  });

  it("10131310 Radiant Rainbow — pool is On Spellboost cards only", () => {
    setupTurn(R6, { hand: ["10131310", "10131320", "10161120"], pp: 2 });
    const spellboostUid = thenHand("first").find(
      (c) => c.id === "10131320",
    )!.uid;
    const plainUid = thenHand("first").find((c) => c.id === "10161120")!.uid;
    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(spellboostUid));
    expect(poolUids()).not.toContain(String(plainUid));
  });

  it("10521310 Extravagance — pool is hand spells only", () => {
    setupTurn(R6, { hand: ["10521310", "10131310", "10131110"], pp: 3 });
    const spell = thenHand("first").find((c) => c.id === "10131310")!;
    const follower = thenHand("first").find((c) => c.id === "10131110")!;
    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(spell.uid));
    expect(poolUids()).not.toContain(String(follower.uid));
  });
});

describe("negative-space filters — Ward keyword pool", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10262310 Divine Guard — pool is allied followers with Ward only", () => {
    setupTurn(R6, { hand: ["10262310"], pp: 1 });
    const ward = allyFollower("WardAlly", { hasWard: true });
    applyKeywordsFromList(ward);
    const plain = allyFollower("PlainAlly");
    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(ward.uid));
    expect(poolUids()).not.toContain(String(plain.uid));
  });
});

describe("negative-space filters — unevolved selection", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10104110 Olivia — Super-Evolve pool is unevolved allies only (excludes evolved)", () => {
    setupTurn(R10, { hand: ["10104110"], pp: 7 });
    const raw = allyFollower("RawAlly");
    const evolved = allyFollower("EvoAlly");
    evolved.hasEvolved = true;
    whenPlayCard("first", 0);
    const olivia = findOnBoard("first", "Olivia, Heroic Dark Angel")!;
    state.players.first.superEvoCharges = 1;
    onEvolve(olivia, "first", "super");
    expect(poolUids()).toContain(String(raw.uid));
    expect(poolUids()).not.toContain(String(evolved.uid));
    expect(poolUids()).not.toContain(String(olivia.uid));
  });

  it("10472110 Eustace — Skybound Art pool is unevolved allies only", () => {
    setupTurn(R10, { hand: ["10472110"], pp: 5 });
    const raw = allyFollower("RawAlly");
    const evolved = allyFollower("EvoAlly");
    evolved.hasEvolved = true;
    whenPlayCard("first", 0);
    expect(poolUids()).toContain(String(raw.uid));
    expect(poolUids()).not.toContain(String(evolved.uid));
  });

  it("10874120 Eudie — Evolve pool is unevolved allies only (excludes self)", () => {
    setupTurn(R6, { hand: ["10874120"], pp: 2 });
    whenPlayCard("first", 0);
    const raw = allyFollower("RawAlly");
    const evolved = allyFollower("EvoAlly");
    evolved.hasEvolved = true;
    const eudie = findOnBoard("first", "Eudie, Your Dependable Mentor")!;
    onEvolve(eudie, "first", "normal");
    expect(poolUids()).toContain(String(raw.uid));
    expect(poolUids()).not.toContain(String(evolved.uid));
    expect(poolUids()).not.toContain(String(eudie.uid));
  });
});

describe("negative-space filters — Golem tribe selection", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10032110 Remi & Rami — Super-Evolve pool is allied Golem followers only", () => {
    setupTurn(R7, { hand: ["10032110"], pp: 4 });
    whenPlayCard("first", 0);
    const golem = allyFollower("GuardianOnBoard", { tribes: ["Golem"] });
    const plain = allyFollower("PlainAlly");
    const remi = findOnBoard("first", "Remi & Rami, Two-Faced Witch")!;
    state.players.first.superEvoCharges = 1;
    onEvolve(remi, "first", "super");
    expect(poolUids()).toContain(String(golem.uid));
    expect(poolUids()).not.toContain(String(plain.uid));
  });
});

describe("negative-space filters — damaged (auto-destroy, not interactive)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10341120 Snowstorm Dragonewt — Fanfare leaves healthy enemies on field", () => {
    setupTurn(R6, { hand: ["10341120"], pp: 6 });
    const damaged = enemyFollower(3, 4, "Damaged");
    damaged.defense = 2;
    damaged.peak_defense = 4;
    const healthy = enemyFollower(3, 4, "Healthy");
    whenPlayCard("first", 0);
    expect(findOnBoard("second", "Healthy")).toBeTruthy();
    expect(findOnBoard("second", "Damaged")).toBeFalsy();
  });
});

describe("negative-space filters — highest-attack random picks", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10103310 Divine Thunder — destroys highest-attack enemy, spares lower attack", () => {
    setupTurn(R6, { hand: ["10103310"], pp: 5 });
    const bruiser = enemyFollower(7, 5, "Bruiser");
    const weak = enemyFollower(2, 5, "Weak");
    whenPlayCard("first", 0);
    expect(findOnBoard("second", "Bruiser")).toBeFalsy();
    expect(findOnBoard("second", "Weak")).toBeTruthy();
    expect(weak.defense).toBe(4);
  });

  it("10822310 Shared Existence — debuffs highest-attack enemy only", () => {
    setupTurn(R6, { hand: ["10822310"], pp: 4 });
    const bruiser = enemyFollower(7, 5, "Bruiser");
    const weak = enemyFollower(2, 5, "Weak");
    whenPlayCard("first", 0);
    expect(bruiser.attack).toBeLessThanOrEqual(-3);
    expect(weak.attack).toBe(2);
  });

  it("10832320 Earth-Shattering Bolt — damages highest-attack enemy, spares lower", () => {
    setupTurn(R8, { hand: ["10832320"], pp: 5 });
    const bruiser = enemyFollower(9, 10, "Bruiser");
    const weak = enemyFollower(2, 10, "Weak");
    whenPlayCard("first", 0);
    expect(bruiser.defense).toBeLessThan(10);
    expect(weak.defense).toBe(10);
  });
});

describe("negative-space filters — random deck summon (class / cost)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("10462120 Sophia — summons Havencraft follower costing ≤2 from deck", () => {
    setupTurn(R6, {
      hand: ["10462120"],
      pp: 4,
      deck: ["10162110", "10161120", "10201110"],
    });
    whenPlayCard("first", 0);
    const summoned = thenBoard("first").find(
      (c) => c.uid !== findOnBoard("first", "Sophia, Zeyen Priestess")?.uid,
    )!;
    expect(summoned.class).toBe("Havencraft");
    expect(Number(summoned.cost)).toBeLessThanOrEqual(2);
    expect(summoned.name).toBe("Sarissa, Luxspear Al-mi'raj");
  });

  it("10322120 Peppy Scout — summons Swordcraft follower costing ≤3 from deck", () => {
    setupTurn(R6, {
      hand: ["10322120"],
      pp: 5,
      deck: ["10121110", "10201110"],
    });
    whenPlayCard("first", 0);
    const scout = findOnBoard("first", "Peppy Scout")!;
    const summoned = thenBoard("first").find((c) => c.uid !== scout.uid)!;
    expect(summoned.class).toBe("Swordcraft");
    expect(Number(summoned.cost)).toBeLessThanOrEqual(3);
    expect(summoned.name).toBe("Ian, Lovebound Knight");
  });

  it("10813310 Curiosity Abounds — summons followers costing ≤2 from deck", () => {
    setupTurn(R6, {
      hand: ["10813310"],
      pp: 5,
      deck: ["10011110", "10011120", "10161120"],
    });
    whenPlayCard("first", 0);
    const summons = thenBoard("first").filter((c) => c.type === "Follower");
    expect(summons.length).toBeGreaterThanOrEqual(2);
    for (const c of summons) {
      expect(Number(c.cost)).toBeLessThanOrEqual(2);
    }
    expect(summons.every((c) => c.name !== "Holy Shieldmaiden")).toBe(true);
  });

  it("10754110 Adahime — summons Abysscraft followers costing ≤2 from deck", () => {
    setupTurn(R6, {
      hand: ["10754110"],
      pp: 6,
      deck: ["10151120", "10152110", "10151150"],
    });
    whenPlayCard("first", 0);
    const adahime = findOnBoard("first", "Adahime, Anathema of Death")!;
    const summons = thenBoard("first").filter((c) => c.uid !== adahime.uid);
    expect(summons.length).toBeGreaterThanOrEqual(2);
    for (const c of summons) {
      expect(c.class).toBe("Abysscraft");
      expect(Number(c.cost)).toBeLessThanOrEqual(2);
    }
    expect(summons.every((c) => c.name !== "Darkseal Demon")).toBe(true);
  });
});
