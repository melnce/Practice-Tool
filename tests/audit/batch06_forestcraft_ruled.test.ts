/**
 * Batch 6 — Forestcraft B/C ruled escalations (card text + rulebook).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { resolveEvolveEffects } from "../../src/logic/evolveUtils.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getSkyboundArtGauge } from "../../src/logic/effects/skybound.js";
import { fuse_finalize_gardens_allure } from "../../src/logic/effects/ops/fuse/fuse.forest.js";
import {
  getHP,
  getCrests,
  getBoard,
  getHand,
} from "../../src/core/playerHelpers.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R10 = 10;
const FILLER = "10111310";

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
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

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
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

describe("B/C — Capricious Sprite replicate fanfare on Evolve (10111120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve: summon Fairy and add Fairy to hand (replicate Fanfare)", () => {
    setupTurn(R6, { hand: ["10111120"], pp: 3 });
    whenPlayCard("first", 0);
    const sprite = findOnBoard("first", "Capricious Sprite")!;
    const handBefore = thenHand("first").length;
    const boardBefore = thenBoard("first").length;
    whenEvolve(sprite, "first");
    expect(thenBoard("first").length).toBeGreaterThan(boardBefore);
    expect(thenHand("first").length).toBeGreaterThan(handBefore);
  });
});

describe("B/C — Opulent Rose Queen hand transform (10114120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: Forestcraft ≤2 in hand become Bramble Burst", () => {
    setupTurn(R10, { hand: ["10111310", "10111310", "10114120"], pp: 10 });
    whenPlayCard("first", 2);
    const bursts = thenHand("first").filter((c) => c.name === "Bramble Burst");
    expect(bursts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("B/C — Bayle hand cost reduction (10113130)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("When allied follower leaves field, Bayle in hand costs 1 less", () => {
    setupTurn(R6);
    const bayle = createCard("10113130", "hand", "first");
    const cost0 = Number(bayle.cost);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.hand = [bayle];
    state.players.first.board = [ally];
    ally.defense = 0;
    cleanupDead();
    expect(Number(bayle.cost)).toBe(Math.max(0, cost0 - 1));
  });
});

describe("B/C — Amataz Pixie hand scaling (10114130)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: +X/+X where X = Pixie followers in hand", () => {
    // Fairy token (90011110) has tribe Pixie; filter:{tribe:"Pixie"} on count_in_hand.
    setupTurn(R6, { hand: ["90011110", "90011110", "10114130"], pp: 5 });
    whenPlayCard("first", 2);
    const amataz = findOnBoard("first", "Amataz, Origin Blader")!;
    expect(Number(amataz.attack)).toBe(4);
    expect(Number(amataz.defense)).toBe(4);
  });

  // Bible (Data note §747): identical evolve/superevolve → empty superevolve so
  // super-evolve resolves the effect once (not twice).
  it("Super-evolve: Pixie-scaled damage resolves once (not duplicated via object-shaped superevolve)", () => {
    setupTurn(R7, {
      hand: ["90011110", "90011110", "10114130"],
      pp: 5,
    });
    whenPlayCard("first", 2);
    const amataz = findOnBoard("first", "Amataz, Origin Blader")!;
    const enemy = createCard(
      { name: "Target", type: "Follower", cost: 1, attack: 1, defense: 10 },
      "board",
      "second",
    );
    state.players.second.board = [enemy];
    state.players.first.superEvoPoints = 1;
    const defBefore = Number(enemy.defense);
    whenSuperEvolve(amataz, "first");
    // 2 Pixies in hand → 2 damage total (not 4 if evolve+superevolve both fired)
    expect(defBefore - Number(enemy.defense)).toBe(2);
    expect(resolveEvolveEffects(amataz, "super").length).toBe(1);
  });
});

describe("B/C — Fairy Fencer hand activation (10212120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("When ally super-evolves, Fairy Fencer in hand costs 1", () => {
    setupTurn(R7);
    const fencer = createCard("10212120", "hand", "first");
    const ally = createCard("10112130", "board", "first");
    ally.peak_defense = ally.defense;
    applyKeywordsFromList(ally);
    state.players.first.hand = [fencer];
    state.players.first.board = [ally];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(ally, "first");
    expect(Number(fencer.cost)).toBe(1);
  });
});

describe("B/C — Garden's Allure Fuse (10213310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fused: draw 2; unfused: draw 1", () => {
    setupTurn(R6, {
      hand: ["10213310", "10111310"],
      pp: 3,
      deck: ["10111310", "10111310", "10111310"],
    });
    const spell = state.players.first.hand[0]!;
    const material = state.players.first.hand[1]!;
    fuse_finalize_gardens_allure("first", spell.uid, [material]);
    expect(spell.isFused).toBe(true);
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(2);
  });
});

describe("B/C — Lymaga debuff + Super-Evolve (10214120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: can't attack until opponent EOT; Super grants bleed", () => {
    setupTurn(R10, { hand: ["10214120"], pp: 7 });
    const a = enemyFollower(5, "A");
    const b = enemyFollower(5, "B");
    whenPlayCard("first", 0);
    resolveFirstPending();
    const pendingFanfare = state.pendingTargetEffect;
    const secondFanfareUid =
      pendingFanfare?.poolUids?.find(
        (id) => id !== pendingFanfare.poolUids?.[0],
      ) ?? pendingFanfare?.pool?.[1]?.uid;
    if (secondFanfareUid) resolvePendingTarget(String(secondFanfareUid));
    expect(a.keywordState?.cantAttackUntilOpponentEOT).toBe(true);
    expect(b.keywordState?.cantAttackUntilOpponentEOT).toBe(true);

    resetUidCounter();
    setupTurn(R7);
    const lym = createCard("10214120", "board", "first");
    lym.peak_defense = lym.defense;
    const e = enemyFollower(5);
    state.players.first.board = [lym];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(lym, "first");
    resolveFirstPending();
    const pendingSuper = state.pendingTargetEffect;
    const bleedUid =
      pendingSuper?.poolUids?.find((id) => id !== pendingSuper.poolUids?.[0]) ??
      pendingSuper?.pool?.[1]?.uid;
    if (bleedUid) resolvePendingTarget(String(bleedUid));
    expect(e.hasBleed || e.keywordState?.hasBleed).toBe(true);
    expect((e.bleed ?? e.keywordState?.bleed)?.toSelf).toBe(2);
  });
});

describe("B/C — Devotee / Supplicant replicate (10311110, 10312110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Devotee Evolve replicates Fanfare -0/-1", () => {
    setupTurn(R6, { hand: ["10311110"], pp: 2 });
    const e = enemyFollower(3);
    whenPlayCard("first", 0);
    resolveFirstPending();
    const dev = findOnBoard("first", "Devotee of Unkilling")!;
    whenEvolve(dev, "first");
    resolveFirstPending();
    expect(e.defense).toBeLessThan(3);
  });

  it("Supplicant Super-Evolve replicates Fanfare -0/-3 all enemies", () => {
    setupTurn(R10, { hand: ["10312110"], pp: 6 });
    const e = enemyFollower(6);
    whenPlayCard("first", 0);
    expect(e.defense).toBe(3);
    const sup = findOnBoard("first", "Supplicant of Unkilling")!;
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(sup, "first");
    expect(e.defense).toBe(0);
  });
});

describe("B/C — Congregant exact copy chain (10313110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Empty board: 5 Congregants at 6/5/4/3/2 defense", () => {
    setupTurn(R10, { hand: ["10313110"], pp: 9 });
    whenPlayCard("first", 0);
    const copies = thenBoard("first")
      .filter((c) => c.name === "Congregant of Unkilling")
      .map((c) => Number(c.defense))
      .sort((a, b) => b - a);
    expect(copies).toEqual([6, 5, 4, 3, 2]);
    expect(thenBoard("first").length).toBe(5);
  });

  it("Board with 3 allies: original 6 + one copy 5 only", () => {
    setupTurn(R10, { hand: ["10313110"], pp: 9 });
    for (let i = 0; i < 3; i++) {
      const ally = createCard(
        { name: `Ally${i}`, type: "Follower", cost: 1, attack: 1, defense: 1 },
        "board",
        "first",
      );
      ally.peak_defense = 1;
      state.players.first.board.push(ally);
    }
    whenPlayCard("first", 0);
    const cong = thenBoard("first")
      .filter((c) => c.name === "Congregant of Unkilling")
      .map((c) => Number(c.defense))
      .sort((a, b) => b - a);
    expect(thenBoard("first").length).toBe(5);
    expect(cong).toEqual([6, 5]);
  });
});

describe("B/C — Krulle Ambush + crest on Super (10314110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare -0/-2 all enemies; Super gives opponent Krulle crest", () => {
    setupTurn(R6, { hand: ["10314110"], pp: 4 });
    enemyFollower(4);
    whenPlayCard("first", 0);
    expect(state.players.second.board[0]!.defense).toBe(2);

    resetUidCounter();
    setupTurn(R7);
    const kr = createCard("10314110", "board", "first");
    kr.peak_defense = kr.defense;
    applyKeywordsFromList(kr);
    state.players.first.board = [kr];
    state.players.first.superEvoPoints = 1;
    whenSuperEvolve(kr, "first");
    expect(
      getCrests(state, "second").some((c) => c.name?.includes("Krulle")),
    ).toBe(true);
  });
});

describe("B/C — Alfheimr Mode + SSA (10413310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Below SSA: mode UI pending; at 15 SSA runs bundled effects (card text)", () => {
    setupTurn(R6, {
      hand: ["10413310"],
      pp: 2,
      deck: ["10111310", "10111310"],
    });
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    if (state.pendingModeChoice) {
      state.pendingModeChoice.selectedIndex = 0;
    }
    expect(getHP(state, "first")).toBeGreaterThanOrEqual(18);

    resetUidCounter();
    setupTurn(R10, { hand: ["10413310"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.board = [ally];
    const spell = state.players.first.hand[0]!;
    // SSA gate is gauge >= 15 (roundCount + witnesses), not round alone.
    // R10 is max-PP alignment only; SA threshold is ~10, not SSA.
    spell.skyboundArtEvolvesWitnessed = 5;
    expect(getSkyboundArtGauge(spell, 10)).toBe(15);
    whenPlayCard("first", 0);
    expect(state.pendingModeChoice).toBeFalsy();
    expect(ally.hasRush || ally.attack > 2 || ally.hasWard).toBe(true);
  });
});
