/**
 * Set 10009 — Swordcraft + Forestcraft + Runecraft audit (batch 2).
 *
 * Covers authored / partial cards only. Blocked cards are listed in the PR.
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
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getBoard, getHand, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const FILLER = "10111310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
    active?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function playCombo3(targetHandIndex: number): void {
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", targetHandIndex);
}

describe("Set 10009 — Forestcraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Sprouting Initiate — Combo (3) draws a card", () => {
    setupTurn(R5, {
      hand: [FILLER, FILLER, "10911110"],
      pp: 5,
      deck: [FILLER],
    });
    const hand0 = getHand(state, "first").length;
    playCombo3(0);
    expect(getHand(state, "first").length).toBeGreaterThan(hand0);
  });

  it("Leafshadow Assassin — Fanfare adds Fairy", () => {
    setupTurn(R6, { hand: ["10912110"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Fairy")).toBe(true);
  });

  it("Primate Plotters — Fanfare copies random enemy hand card; Evolve replicates", () => {
    setupTurn(R6, { hand: ["10912120"], pp: 3 });
    state.players.second.hand.push(
      createCard(
        { id: "10131310", name: "Radiant Rainbow", type: "Spell", cost: 2 },
        "hand",
        "second",
      ),
    );
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Radiant Rainbow")).toBe(
      true,
    );

    const plotter = findOnBoard("first", "Primate Plotters")!;
    state.players.first.evoCharges = 2;
    const handBefore = getHand(state, "first").length;
    whenEvolve(plotter, "first");
    expect(getHand(state, "first").length).toBeGreaterThan(handBefore);
  });

  it("Verdant Ring Kindred — mode deals random damage", () => {
    setupTurn(R6, { hand: ["10912310"], pp: 2 });
    enemyFollower(2, 6);
    whenPlayCard("first", 0);
    if (state.pendingModeChoice) state.pendingModeChoice.selectedIndex = 0;
    expect(Number(getBoard(state, "second")[0]!.defense)).toBeLessThan(6);
  });

  it("Virid Lieutenant — Combo (3) draws 2; Evolve gives ally Rush", () => {
    setupTurn(R6, {
      hand: [FILLER, FILLER, "10913110"],
      pp: 6,
      deck: [FILLER, FILLER],
    });
    playCombo3(0);
    expect(getHand(state, "first").length).toBeGreaterThanOrEqual(4);

    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    const lt = findOnBoard("first", "Virid Lieutenant")!;
    state.players.first.evoCharges = 2;
    whenEvolve(lt, "first");
    resolveFirstPending();
    expect(ally.hasRush).toBe(true);
  });

  it("Crimson Incense — destroys selected enemy follower and draws", () => {
    setupTurn(R6, { hand: ["10913310"], pp: 4, deck: [FILLER] });
    enemyFollower(2, 4);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second").length).toBe(0);
    expect(getHand(state, "first").length).toBe(1);
  });

  it("Magachiyo, Aromatic Convict — Fanfare damages selected enemy", () => {
    setupTurn(R6, { hand: ["10914110"], pp: 3 });
    const foe = enemyFollower(2, 8);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(4);
  });

  it("Hien, Redolent Revenant — Fanfare damages; Last Words summons self", () => {
    setupTurn(R10, { hand: ["10914120"], pp: 9 });
    const foe = enemyFollower(2, 8);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(4);

    const hien = findOnBoard("first", "Hien, Redolent Revenant")!;
    hien.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter((c) => c.name === "Hien, Redolent Revenant")
        .length,
    ).toBe(1);
  });
});

describe("Set 10009 — Swordcraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Open-Sea Scout — Evolve adds Gilded Boots", () => {
    setupTurn(R5, { hand: ["10921110"], pp: 2 });
    whenPlayCard("first", 0);
    const scout = findOnBoard("first", "Open-Sea Scout")!;
    state.players.first.evoCharges = 2;
    whenEvolve(scout, "first");
    expect(thenHand("first").some((c) => c.name === "Gilded Boots")).toBe(true);
  });

  it("Phalanx — summons Steelclad Knight with Ward", () => {
    setupTurn(R6, { hand: ["10921310"], pp: 2 });
    whenPlayCard("first", 0);
    const knight = thenBoard("first").find(
      (c) => c.name === "Steelclad Knight",
    );
    expect(knight).toBeTruthy();
    expect(knight?.hasWard).toBe(true);
  });

  it("Whirlpool Gunner — Fanfare adds Gilded Goblet", () => {
    setupTurn(R6, { hand: ["10922110"], pp: 3 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gilded Goblet")).toBe(
      true,
    );
  });

  it("Ferocious Commander — Fanfare summons 2 Steelclad Knights", () => {
    setupTurn(R7, { hand: ["10922120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Steelclad Knight").length,
    ).toBe(2);
  });

  it("Severed Ties — deals 5 to selected enemy; at cost 3 adds copy at 1", () => {
    setupTurn(R6, { hand: ["10922310"], pp: 3 });
    const foe = enemyFollower(2, 7);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
    const copy = thenHand("first").find((c) => c.name === "Severed Ties");
    expect(copy).toBeTruthy();
    expect(Number(copy?.cost)).toBe(1);
  });

  it("Roughwater First Mate — Fanfare damages selected enemy", () => {
    setupTurn(R7, { hand: ["10923110"], pp: 5 });
    const foe = enemyFollower(2, 6);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(3);
  });

  it("Roughwater First Mate — Super-Evolve adds Gilded tokens at cost 0", () => {
    setupTurn(R7, { hand: ["10923110"], pp: 5 });
    enemyFollower(2, 6);
    whenPlayCard("first", 0);
    resolveFirstPending();
    const mate = findOnBoard("first", "Roughwater First Mate")!;
    state.players.first.superEvoCharges = 1;
    state.players.first.evoCharges = 2;
    whenSuperEvolve(mate, "first");
    if (state.pendingTargetEffect) resolveFirstPending();
    const blade = thenHand("first").find((c) => c.name === "Gilded Blade");
    const necklace = thenHand("first").find(
      (c) => c.name === "Gilded Necklace",
    );
    expect(blade).toBeTruthy();
    expect(necklace).toBeTruthy();
    expect(Number(blade?.cost)).toBe(0);
    expect(Number(necklace?.cost)).toBe(0);
  });

  it("L'Age d'Or — deals damage to all enemy followers", () => {
    setupTurn(R6, { hand: ["10923310"], pp: 4 });
    enemyFollower(2, 5, "A");
    enemyFollower(2, 5, "B");
    whenPlayCard("first", 0);
    for (const f of getBoard(state, "second")) {
      expect(Number(f.defense)).toBe(3);
    }
  });

  it("Beltezore, Valorous Revenant — attacks 3 times per turn", () => {
    setupTurn(R10, { hand: ["10924120"], pp: 10 });
    whenPlayCard("first", 0);
    const bel = findOnBoard("first", "Beltezore, Valorous Revenant")!;
    expect((bel as { attacks_per_turn?: number }).attacks_per_turn).toBe(3);
  });
});

describe("Set 10009 — Runecraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Obsessed Test Subject — +3/+3 when 5 copies entered this match", () => {
    setupTurn(R5, { hand: ["10931110"], pp: 2 });
    state.players.first.followerEnterHistory = Array.from(
      { length: 5 },
      () => ({
        name: "Obsessed Test Subject",
        tribes: [],
        cardId: "10931110",
      }),
    );
    whenPlayCard("first", 0);
    const subj = findOnBoard("first", "Obsessed Test Subject")!;
    expect(subj.attack).toBe(5);
    expect(subj.defense).toBe(5);
  });

  it("Key Spirit — Fanfare damages follower and leader", () => {
    setupTurn(R8, { hand: ["10931120"], pp: 7 });
    const foe = enemyFollower(2, 10);
    const hp0 = getHP(state, "second");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(3);
    expect(getHP(state, "second")).toBe(hp0 - 4);
  });

  it("Miscalculated Experiment — adds 3 Truth Summons", () => {
    setupTurn(R5, { hand: ["10931310"], pp: 1 });
    whenPlayCard("first", 0);
    expect(
      thenHand("first").filter((c) => c.name === "Truth Summons").length,
    ).toBe(3);
  });

  it("Enamored Researcher — Fanfare summons 2; Evolve gives Obsessed Test Subject Bane", () => {
    setupTurn(R7, { hand: ["10932110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Obsessed Test Subject")
        .length,
    ).toBe(2);

    resetUidCounter();
    setupTurn(R7, { hand: ["10932110"], pp: 4 });
    whenPlayCard("first", 0);
    const subj = thenBoard("first").find(
      (c) => c.name === "Obsessed Test Subject",
    )!;
    const researcher = findOnBoard("first", "Enamored Researcher")!;
    state.players.first.evoCharges = 2;
    whenEvolve(researcher, "first");
    resolveFirstPending();
    expect(subj.hasBane).toBe(true);
  });

  it("Enamored Researcher — Enhance (8) summons 3 with Ward instead of Fanfare", () => {
    setupTurn(R8, { hand: ["10932110"], pp: 8 });
    whenPlayCard("first", 0);
    const subjects = thenBoard("first").filter(
      (c) => c.name === "Obsessed Test Subject",
    );
    expect(subjects.length).toBe(3);
    expect(subjects.every((c) => c.hasWard === true)).toBe(true);
    expect(thenBoard("first").length).toBe(4);
  });

  it("Noble Philosopher — returns hand to deck and draws equal count", () => {
    setupTurn(R6, {
      hand: ["10932120", FILLER, FILLER],
      pp: 3,
      deck: [FILLER, FILLER, FILLER],
    });
    whenPlayCard("first", 0);
    expect(getHand(state, "first").length).toBe(2);
  });

  it("Humane Love — summons buffed Obsessed Test Subject and adds buffed copy to hand", () => {
    setupTurn(R6, { hand: ["10932310"], pp: 3 });
    whenPlayCard("first", 0);
    const onBoard = thenBoard("first").find(
      (c) => c.name === "Obsessed Test Subject",
    );
    const inHand = thenHand("first").find(
      (c) => c.name === "Obsessed Test Subject",
    );
    expect(onBoard?.attack).toBe(3);
    expect(inHand?.attack).toBe(3);
  });

  it("Ecstatic Scholar — Fanfare draws 2 and summons Obsessed Test Subject", () => {
    setupTurn(R7, { hand: ["10933110"], pp: 5, deck: [FILLER, FILLER] });
    const hand0 = getHand(state, "first").length;
    whenPlayCard("first", 0);
    expect(getHand(state, "first").length).toBeGreaterThan(hand0);
    expect(
      thenBoard("first").some((c) => c.name === "Obsessed Test Subject"),
    ).toBe(true);
  });

  it("Obsidian Raven — summons Obsessed Test Subject and deals random damage twice", () => {
    setupTurn(R7, { hand: ["10933310"], pp: 5 });
    enemyFollower(2, 20);
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Obsessed Test Subject"),
    ).toBe(true);
    expect(Number(getBoard(state, "second")[0]!.defense)).toBeLessThan(20);
  });

  it("Sephie, Maven Convict — Fanfare summons 2 Obsessed Test Subject", () => {
    setupTurn(R8, { hand: ["10934110"], pp: 7 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Obsessed Test Subject")
        .length,
    ).toBe(2);
  });

  it("Phylene, Cleansing Revenant — Spellboost reduces cost", () => {
    setupTurn(R10, { hand: ["10934120"], pp: 10 });
    const card = getHand(state, "first")[0]!;
    runEffects(
      [{ op: "spellboost", target: "ally:hand", count: 2 }],
      "first",
      card,
    );
    expect(Number(card.cost)).toBeLessThan(10);
  });
});
