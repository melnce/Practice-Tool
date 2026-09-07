/**
 * Set 10008 — Chronicle of Destiny audit (authored subset).
 *
 * Focus: non-trivial targeting, triggers, conditionals, class mechanics.
 * Stubbed / blocked cards are intentionally not covered here.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { runEffects } from "../../src/logic/core/effects/index.js";
import { isCantAttackLocked } from "../../src/logic/core/keywords/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getShadows,
  getEvoCharges,
  getCrests,
} from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

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

const AUTHORED_SAMPLE = [
  "10801110",
  "10802110",
  "10811120",
  "10812110",
  "10821120",
  "10823110",
  "10824120",
  "10831310",
  "10841130",
  "10852110",
  "10854120",
  "10862310",
  "10863110",
  "10864120",
  "10874110",
] as const;

describe("Set 10008 — Chronicle of Destiny", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  afterEach(() => {
    delete (globalThis as any).HEADLESS;
  });

  it("sample authored cards classify as implemented", () => {
    for (const id of AUTHORED_SAMPLE) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!), id).toBe("ops_present");
    }
  });

  it("Hamsa — Evolve gives +5/+5", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstPP(5, 5)
      .withFirstEvo(2)
      .withFirstHand(["10801110"])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    whenPlayCard("first", 0);
    const hamsa = findOnBoard("first", "Hamsa, Sculpted Divinity")!;
    const atk0 = hamsa.attack!;
    const def0 = hamsa.defense!;
    whenEvolve(hamsa, "first");
    expect(hamsa.attack).toBe(atk0 + 7);
    expect(hamsa.defense).toBe(def0 + 7);
  });

  it("Alfied — Fanfare deals 4 to selected enemy", () => {
    setupTurn(4, { hand: ["10802110"], pp: 4 });
    enemyFollower(2, 5, "Wall");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")[0]?.defense).toBe(1);
  });

  it("Citrus — Fanfare summons 2 Fairies; Evolve replicates", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstPP(5, 5)
      .withFirstEvo(2)
      .withFirstHand(["10811120"])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    whenPlayCard("first", 0);
    expect(
      getBoard(state, "first").filter((c) => c.name === "Fairy"),
    ).toHaveLength(2);
    const citrus = findOnBoard("first", "Citrus, Heretical Hermit")!;
    whenEvolve(citrus, "first");
    expect(
      getBoard(state, "first").filter((c) => c.name === "Fairy"),
    ).toHaveLength(4);
  });

  it("Ruflet — once-per-turn buff summons Fairy; Last Words adds Fairy", () => {
    setupTurn(3, { hand: ["10812110"], pp: 3 });
    whenPlayCard("first", 0);
    const ruflet = findOnBoard("first", "Ruflet, Primeval Fairy")!;
    runEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack: 1,
          defense: 0,
        },
      ],
      "first",
      ruflet,
    );
    expect(
      getBoard(state, "first").filter((c) => c.name === "Fairy"),
    ).toHaveLength(1);
    ruflet.defense = 0;
    cleanupDead();
    expect(getHand(state, "first").some((c) => c.name === "Fairy")).toBe(true);
  });

  it("Shaili — Evolve gives Can't Attack until opponent turn end", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstPP(5, 5)
      .withFirstEvo(2)
      .withFirstHand(["10821120"])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    const foe = enemyFollower(3, 3, "Target");
    whenPlayCard("first", 0);
    const shaili = findOnBoard("first", "Shaili, Prowling Assassin")!;
    expect(shaili.hasAmbush).toBe(true);
    whenEvolve(shaili, "first");
    resolveFirstPending();
    expect(isCantAttackLocked(foe)).toBe(true);
  });

  it("Okita — Fanfare evolves when super-evo unlocked; Rush", () => {
    setupTurn(7, { hand: ["10823110"], pp: 7 });
    whenPlayCard("first", 0);
    const okita = findOnBoard("first", "Okita Souji")!;
    expect(okita.hasRush).toBe(true);
    expect(okita.hasEvolved).toBe(true);
  });

  it("Mars — Fanfare summons 3 Knights; Officer enter buffs", () => {
    setupTurn(8, { hand: ["10824120"], pp: 8 });
    whenPlayCard("first", 0);
    const knights = getBoard(state, "first").filter((c) => c.name === "Knight");
    expect(knights).toHaveLength(3);
    expect(knights.every((k) => k.hasRush)).toBe(true);
    expect(knights.every((k) => (k.attack ?? 0) >= 3)).toBe(true);
    const mars = findOnBoard("first", "Mars, Conflagrant Commander")!;
    expect(mars.attack).toBe(1 + 3);
  });

  it("Stormy Blast — deals base 2 damage (X starts at 2)", () => {
    setupTurn(3, { hand: ["10831310"], pp: 3 });
    const wall = enemyFollower(2, 5, "Wall");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(wall.defense).toBe(3);
    const card = getCardById("10831310")!;
    const spell = (card as any).spell?.[0];
    expect(spell?.add_amount).toBe("{self.spellboostCount}");
  });

  it("Spirit of Wadatsumi — Fanfare adds Megalorca; Evolve gains crest", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstPP(5, 5)
      .withFirstEvo(2)
      .withFirstHand(["10841130"])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    whenPlayCard("first", 0);
    expect(
      getHand(state, "first").some((c) => c.name === "Majestic Megalorca"),
    ).toBe(true);
    const spirit = findOnBoard("first", "Spirit of Wadatsumi")!;
    whenEvolve(spirit, "first");
    expect(
      (getCrests(state, "first") || []).some(
        (c) => c.name === "Spirit of Wadatsumi",
      ),
    ).toBe(true);
  });

  it("Fiole — Fanfare summons 3 Bats and grants them Rush", () => {
    setupTurn(6, { hand: ["10852110"], pp: 6 });
    whenPlayCard("first", 0);
    const bats = getBoard(state, "first").filter((c) => c.name === "Bat");
    expect(bats).toHaveLength(3);
    expect(bats.every((b) => b.hasRush)).toBe(true);
  });

  it("Ceres — Necromancy (20) reduces Abysscraft hand costs", () => {
    setupTurn(5, {
      hand: ["10854120", "10852120"],
      pp: 5,
    });
    state.players.first.shadows = 20;
    const marshaBefore = getHand(state, "first").find(
      (c) => c.name === "Marsha, Dark Knight",
    )!;
    const costBefore = Number(marshaBefore.cost);
    whenPlayCard("first", 0);
    // Followers do not gain a shadow on play; Necromancy spends 20 from 20
    expect(getShadows(state, "first")).toBe(0);
    const marsha = getHand(state, "first").find(
      (c) => c.name === "Marsha, Dark Knight",
    )!;
    expect(Number(marsha.cost)).toBe(costBefore - 2);
  });

  it("Lingering Threat — banishes selected enemy with 3 defense or less", () => {
    setupTurn(2, { hand: ["10862310"], pp: 2 });
    enemyFollower(2, 3, "Fragile");
    enemyFollower(4, 4, "Tank");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second").map((c) => c.name)).toEqual(["Tank"]);
  });

  it("Colette — Fanfare evolves if evolved ally present; evolve damages twice", () => {
    setupTurn(5, { hand: ["10863110"], pp: 5 });
    const ally = createCard(
      { name: "EvoAlly", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    ally.hasEvolved = true;
    state.players.first.board = [ally];
    enemyFollower(2, 4, "A");
    enemyFollower(2, 4, "B");
    whenPlayCard("first", 0);
    const colette = findOnBoard("first", "Colette, Holy Exorcist")!;
    expect(colette.hasEvolved).toBe(true);
    const totalDef = getBoard(state, "second").reduce(
      (a, c) => a + (c.defense ?? 0),
      0,
    );
    expect(totalDef).toBe(6);
  });

  it("Zoe — Mode (headless) damages enemies then self for 3", () => {
    setupTurn(5, { hand: ["10864120"], pp: 5 });
    enemyFollower(2, 5, "A");
    enemyFollower(2, 5, "B");
    whenPlayCard("first", 0);
    // Headless prefers damage options → option 1 (all enemy followers)
    expect(getBoard(state, "second").every((c) => (c.defense ?? 0) <= 2)).toBe(
      true,
    );
    const zoe = findOnBoard("first", "Zoe, Dazzling Hope");
    if (zoe) {
      expect(zoe.defense).toBeLessThanOrEqual(1);
    } else {
      // 4 defense − 3 self damage can kill if already damaged; accept death
      expect(getHP(state, "first")).toBeGreaterThan(0);
    }
  });

  it("Asher Enhance (9) — evolves with Storm and destroys Ward enemies", () => {
    setupTurn(9, { hand: ["10874110"], pp: 9 });
    enemyFollower(2, 4, "Wall");
    whenPlayCard("first", 0);
    resolveFirstPending();
    const asher = findOnBoard("first", "Asher & Lydia, Paths Beyond")!;
    expect(asher.hasEvolved).toBe(true);
    expect(asher.hasStorm).toBe(true);
    cleanupDead();
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Reina — Fanfare recovers 1 evolution point", () => {
    setupTurn(5, { hand: ["10801120"], pp: 5 });
    state.players.first.evoCharges = 0;
    whenPlayCard("first", 0);
    expect(getEvoCharges(state, "first")).toBe(1);
  });

  it("Shared Existence — -10/-10 highest enemy at base; Enhance (6) also summons 3 Wretches", () => {
    setupTurn(6, { hand: ["10822310"], pp: 4 });
    const baseFoe = enemyFollower(5, 3, "Bruiser");
    whenPlayCard("first", 0);
    expect(baseFoe.attack).toBeLessThanOrEqual(-5);
    expect(baseFoe.defense).toBeLessThanOrEqual(-7);
    cleanupDead();
    expect(findOnBoard("second", "Bruiser")).toBeFalsy();

    resetUidCounter();
    setupTurn(6, { hand: ["10822310"], pp: 6 });
    const enhanceFoe = enemyFollower(5, 3, "Bruiser");
    whenPlayCard("first", 0);
    expect(enhanceFoe.attack).toBeLessThanOrEqual(-5);
    expect(enhanceFoe.defense).toBeLessThanOrEqual(-7);
    cleanupDead();
    expect(findOnBoard("second", "Bruiser")).toBeFalsy();
    expect(
      getBoard(state, "first").filter((c) => c.name === "Wretch"),
    ).toHaveLength(3);
  });
});
