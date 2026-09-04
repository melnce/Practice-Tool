/**
 * L2 real-card tests — Spell Runecraft deck (14 cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FORESIGHT = "10031310";
const TRUTH_SUMMONS = "10031320";
const STORMY_BLAST = "10831310";
const HARMONIOUS_MEAL = "10832310";
const MEOWSKERS = "10831110";
const AMETHYST_NAPTIME = "10833310";
const TICO = "10833110";
const WAMDUS = "10434110";
const SAMMY_MARIE = "10832110";
const TETRA = "10834110";
const WOODSONG = "10532120";
const GINGER = "10834120";
const ARA = "10534120";
const PHYLENE = "10934120";
const MISCALCULATED = "10931310";

const MYSTERIAN_MISSILE = "90031310";
const DELTA_CANNON = "90034340";
const SEND_EM_PACKING = "90034350";
const GUARDIAN_GOLEM = "90031120";
const REGAL_FALCON = "90061130";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function sbCount(card: {
  keywordState?: { spellboostCount?: number };
  spellboostCount?: number;
}): number {
  return (
    card.keywordState?.spellboostCount ??
    (card as { spellboostCount?: number }).spellboostCount ??
    0
  );
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    hp?: number;
    secondDeck?: string[];
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
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
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

function allyFollower(
  atk: number,
  def: number,
  name = "Ally",
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

/** Play N Foresights from hand index 0 (spellboosts hand each time). */
function playForesights(n: number): void {
  for (let i = 0; i < n; i++) {
    whenPlayCard("first", 0);
  }
}

/** Apply N spellboosts to one in-hand card (engine path). */
function boostCard(card: { uid: string; id?: string }, n: number): void {
  spellboostHand("first", n, card as Parameters<typeof spellboostHand>[2]);
}

describe("L2 Spell Runecraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Foresight (10031310)", () => {
    const DRAW_TOP = "10021110";
    const DRAW_SECOND = "10021120";

    it("draws the top stacked deck card into hand", () => {
      setupTurn(R6, {
        hand: [FORESIGHT],
        // Deck draws from array end (top of deck).
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 1,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(FORESIGHT);
      expect(deckIds()).toContain(DRAW_SECOND);
      expect(deckIds()).not.toContain(DRAW_TOP);
    });
  });

  describe("Miscalculated Experiment (10931310)", () => {
    it("adds exactly 3 copies of Truth Summons (10031320) to hand", () => {
      setupTurn(R6, { hand: [MISCALCULATED], pp: 1 });
      whenPlayCard("first", 0);
      const truths = thenHand("first").filter((c) => c.id === TRUTH_SUMMONS);
      expect(truths).toHaveLength(3);
      expect(handIds()).not.toContain(MISCALCULATED);
    });
  });

  describe("Stormy Blast (10831310)", () => {
    it("with X=2 (no spellboost): deals 2 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [STORMY_BLAST], pp: 1 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("On Spellboost increases X: after 2 spellboosts deals 4 to selected enemy", () => {
      setupTurn(R6, {
        hand: [FORESIGHT, FORESIGHT, STORMY_BLAST],
        deck: [FORESIGHT, FORESIGHT, FORESIGHT],
        pp: 3,
      });
      const wall = enemyFollower(1, 10, "Wall");
      playForesights(2);
      const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
      expect(sbCount(blast)).toBe(2);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === STORMY_BLAST),
      );
      resolvePendingByUid(wall.uid);
      expect(10 - Number(wall.defense)).toBe(4);
    });
  });

  describe("Harmonious Meal (10832310)", () => {
    const SPELLBOOST_TARGET = "10131320"; // Stormy Blast (10131320) — On Spellboost spell

    it("restores 2 defense to your leader", () => {
      setupTurn(R6, { hand: [HARMONIOUS_MEAL], pp: 2, hp: 15 });
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpBefore + 2);
    });

    it("spellboosts your hand", () => {
      setupTurn(R6, {
        hand: [HARMONIOUS_MEAL, SPELLBOOST_TARGET],
        pp: 2,
      });
      const target = thenHand("first").find((c) => c.id === SPELLBOOST_TARGET)!;
      const count0 = sbCount(target);
      whenPlayCard("first", 0);
      expect(sbCount(target)).toBeGreaterThan(count0);
    });
  });

  describe("Meowskers, Roly-Poly Mk II & Djeana (10831110)", () => {
    const SPELLBOOST_TARGET = "10131320";

    it("Fanfare: deals 1 to selected enemy; bystander untouched; spellboosts hand", () => {
      setupTurn(R6, {
        hand: [MEOWSKERS, SPELLBOOST_TARGET],
        pp: 2,
      });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      const sbCard = thenHand("first").find((c) => c.id === SPELLBOOST_TARGET)!;
      const sb0 = sbCount(sbCard);
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(4);
      expect(sbCount(sbCard)).toBeGreaterThan(sb0);
    });

    it("Evolve: replicates Fanfare (damage + spellboost again)", () => {
      setupTurn(R6, {
        hand: [MEOWSKERS, SPELLBOOST_TARGET],
        pp: 2,
      });
      state.players.first.evoCharges = 2;
      const target = enemyFollower(2, 4, "Target");
      const sbCard = thenHand("first").find((c) => c.id === SPELLBOOST_TARGET)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const defAfterFanfare = Number(target.defense);
      const sbAfterFanfare = sbCount(sbCard);
      const meow = findOnBoard("first", "Meowskers, Roly-Poly Mk II & Djeana")!;
      onEvolve(meow, "first", "normal", { spendPoint: true });
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(defAfterFanfare - 1);
      expect(sbCount(sbCard)).toBeGreaterThan(sbAfterFanfare);
    });
  });

  describe("Amethyst's Naptime (10833310)", () => {
    const DRAW_A = "10021110";
    const DRAW_B = "10021120";

    it("always draws 2 stacked cards", () => {
      setupTurn(R6, {
        hand: [AMETHYST_NAPTIME],
        deck: [FORESIGHT, DRAW_B, DRAW_A],
        pp: 3,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
    });

    it("when X < 5: does not restore leader or recover bonus PP", () => {
      setupTurn(R10, {
        hand: [...Array(4).fill(FORESIGHT), AMETHYST_NAPTIME],
        deck: Array(10).fill(FORESIGHT),
        pp: 10,
        hp: 15,
      });
      playForesights(4);
      const nap = thenHand("first").find((c) => c.id === AMETHYST_NAPTIME)!;
      expect(sbCount(nap)).toBe(4);
      const hpBefore = getHP(state, "first");
      const ppBefore = getPP(state, "first");
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === AMETHYST_NAPTIME),
      );
      expect(getHP(state, "first")).toBe(hpBefore);
      expect(getPP(state, "first")).toBe(ppBefore - 3);
    });

    it("when X >= 5: restores 2 defense and recovers 2 PP", () => {
      setupTurn(R10, {
        hand: [...Array(5).fill(FORESIGHT), AMETHYST_NAPTIME],
        deck: Array(12).fill(FORESIGHT),
        pp: 10,
        hp: 15,
      });
      playForesights(5);
      const nap = thenHand("first").find((c) => c.id === AMETHYST_NAPTIME)!;
      expect(sbCount(nap)).toBe(5);
      const hpBefore = getHP(state, "first");
      const ppBefore = getPP(state, "first");
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === AMETHYST_NAPTIME),
      );
      expect(getHP(state, "first")).toBe(hpBefore + 2);
      expect(getPP(state, "first")).toBe(ppBefore - 3 + 2);
    });
  });

  describe("Tico, Mysterian Spellcrafter (10833110)", () => {
    it("Fanfare: adds 2 copies of Mysterian Missile (90031310)", () => {
      setupTurn(R6, { hand: [TICO], pp: 3 });
      whenPlayCard("first", 0);
      const missiles = thenHand("first").filter(
        (c) => c.id === MYSTERIAN_MISSILE,
      );
      expect(missiles).toHaveLength(2);
    });

    it("Evolve: reduces cost of Mysteria spells in hand by 1, not other spells", () => {
      setupTurn(R7, { hand: [TICO], pp: 3 });
      state.players.first.evoCharges = 2;
      whenPlayCard("first", 0);
      const missile = thenHand("first").find(
        (c) => c.id === MYSTERIAN_MISSILE,
      )!;
      const foresight = createCard(FORESIGHT, "hand", "first");
      state.players.first.hand.push(foresight);
      const missileCost0 = getEffectiveCost(missile);
      const foresightCost0 = getEffectiveCost(foresight);
      const tico = findOnBoard("first", "Tico, Mysterian Spellcrafter")!;
      onEvolve(tico, "first", "normal", { spendPoint: true });
      expect(getEffectiveCost(missile)).toBe(missileCost0 - 1);
      expect(getEffectiveCost(foresight)).toBe(foresightCost0);
    });

    it("Super-Evolve: gains Crest: Tico, Mysterian Spellcrafter", () => {
      setupTurn(R7, { hand: [TICO], pp: 3 });
      state.players.first.superEvoCharges = 1;
      whenPlayCard("first", 0);
      const tico = findOnBoard("first", "Tico, Mysterian Spellcrafter")!;
      onEvolve(tico, "first", "super", { spendPoint: true });
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Tico, Mysterian Spellcrafter",
        ),
      ).toBe(true);
    });
  });

  describe("Wamdus, Water Personified (10434110)", () => {
    const SPELLBOOST_TARGET = "10131320";

    it("On Spellboost in hand: gives this follower +1/+1", () => {
      setupTurn(R6, { hand: [FORESIGHT, WAMDUS, SPELLBOOST_TARGET], pp: 2 });
      const wamdus = thenHand("first").find((c) => c.id === WAMDUS)!;
      const atk0 = Number(wamdus.attack);
      const def0 = Number(wamdus.defense);
      whenPlayCard("first", 0);
      const wamdusAfter = thenHand("first").find((c) => c.id === WAMDUS)!;
      expect(Number(wamdusAfter.attack)).toBe(atk0 + 1);
      expect(Number(wamdusAfter.defense)).toBe(def0 + 1);
    });

    it("Fanfare: spellboosts your hand", () => {
      setupTurn(R6, { hand: [WAMDUS, SPELLBOOST_TARGET], pp: 3 });
      const blast = thenHand("first").find((c) => c.id === SPELLBOOST_TARGET)!;
      const count0 = sbCount(blast);
      whenPlayCard("first", 0);
      expect(sbCount(blast)).toBeGreaterThan(count0);
    });

    it("Super-Evolve Mode 1: Barrier on other allies only", () => {
      setupTurn(R7, { pp: 6 });
      const ally = allyFollower(2, 2, "Ally");
      const wamdus = createCard(WAMDUS, "board", "first");
      applyKeywordsFromList(wamdus);
      wamdus.peak_defense = wamdus.defense;
      state.players.first.board = [ally, wamdus];
      state.players.first.superEvoCharges = 1;
      setScriptedModePickProvider(() => [0]);
      onEvolve(wamdus, "first", "super");
      setScriptedModePickProvider(null);
      expect(ally.hasBarrier).toBe(true);
      expect(wamdus.hasBarrier).toBe(false);
    });

    it("Super-Evolve Mode 2: deals X split damage (X = this follower's attack)", () => {
      setupTurn(R7, { pp: 6 });
      const wamdus = createCard(WAMDUS, "board", "first");
      applyKeywordsFromList(wamdus);
      wamdus.attack = 3;
      wamdus.peak_defense = wamdus.defense;
      const foeA = enemyFollower(2, 2, "FoeA");
      const foeB = enemyFollower(2, 2, "FoeB");
      state.players.first.board = [wamdus];
      state.players.first.superEvoCharges = 1;
      setScriptedModePickProvider(() => [1]);
      onEvolve(wamdus, "first", "super");
      setScriptedModePickProvider(null);
      const totalDamage = 2 - Number(foeA.defense) + (2 - Number(foeB.defense));
      expect(totalDamage).toBe(3);
    });
  });

  describe("Sammy & Marie, Flowers of Joy (10832110)", () => {
    const DRAW_A = "10021110";
    const DRAW_B = "10021120";
    const OPP_DRAW = "10011110";

    it("On Spellboost: reduces this card's cost by 1", () => {
      setupTurn(R8, { hand: [FORESIGHT, SAMMY_MARIE], pp: 2 });
      const sammy = thenHand("first").find((c) => c.id === SAMMY_MARIE)!;
      const cost0 = getEffectiveCost(sammy);
      whenPlayCard("first", 0);
      const sammyAfter = thenHand("first").find((c) => c.id === SAMMY_MARIE)!;
      expect(getEffectiveCost(sammyAfter)).toBe(cost0 - 1);
    });

    it("without spellboost: cost stays at printed 5", () => {
      setupTurn(R8, { hand: [SAMMY_MARIE], pp: 8 });
      const sammy = thenHand("first").find((c) => c.id === SAMMY_MARIE)!;
      expect(getEffectiveCost(sammy)).toBe(5);
    });

    it("Fanfare: you draw 2 stacked cards; opponent draws 1 stacked card", () => {
      setupTurn(R8, {
        hand: [SAMMY_MARIE],
        deck: [FORESIGHT, DRAW_B, DRAW_A],
        secondDeck: [FORESIGHT, OPP_DRAW],
        pp: 5,
      });
      whenPlayCard("first", 0);
      expect(handIds("first")).toContain(DRAW_A);
      expect(handIds("first")).toContain(DRAW_B);
      expect(handIds("second")).toContain(OPP_DRAW);
    });
  });

  describe("Tetra & Ladica, Forest BFFs (10834110)", () => {
    it("has Storm on field", () => {
      setupTurn(R8, { hand: [TETRA], pp: 6 });
      whenPlayCard("first", 0);
      const tetra = findOnBoard("first", "Tetra & Ladica, Forest BFFs")!;
      expect(tetra.hasStorm || tetra.keywordState?.hasStorm).toBe(true);
    });

    it("when X < 10: Fanfare adds neither Delta Cannon nor Send 'Em Packing", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 9);
      expect(sbCount(tetra)).toBe(9);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      expect(handIds()).not.toContain(DELTA_CANNON);
      expect(handIds()).not.toContain(SEND_EM_PACKING);
    });

    it("when X >= 10 and X < 20: adds Delta Cannon only", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 10);
      expect(sbCount(tetra)).toBe(10);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      expect(handIds()).toContain(DELTA_CANNON);
      expect(handIds()).not.toContain(SEND_EM_PACKING);
    });

    it("when X >= 20: adds Delta Cannon and Send 'Em Packing", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 20);
      expect(sbCount(tetra)).toBe(20);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      expect(handIds()).toContain(DELTA_CANNON);
      expect(handIds()).toContain(SEND_EM_PACKING);
    });
  });

  describe("Woodsong Haikumaster (10532120)", () => {
    const DRAW_TOP = "10021110";
    const SPELLBOOST_TARGET = "10131320";

    it("On Spellboost: reduces this card's cost by 1", () => {
      setupTurn(R8, { hand: [FORESIGHT, WOODSONG], pp: 2 });
      const woodsong = thenHand("first").find((c) => c.id === WOODSONG)!;
      const cost0 = getEffectiveCost(woodsong);
      whenPlayCard("first", 0);
      const woodsongAfter = thenHand("first").find((c) => c.id === WOODSONG)!;
      expect(getEffectiveCost(woodsongAfter)).toBe(cost0 - 1);
    });

    it("Fanfare: draws the top stacked deck card", () => {
      setupTurn(R8, {
        hand: [WOODSONG],
        deck: [FORESIGHT, DRAW_TOP],
        pp: 6,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
    });

    it("Last Words: spellboosts your hand", () => {
      setupTurn(R8, {
        hand: [WOODSONG, SPELLBOOST_TARGET],
        deck: [FORESIGHT],
        pp: 6,
      });
      whenPlayCard("first", 0);
      const sbCard = thenHand("first").find((c) => c.id === SPELLBOOST_TARGET)!;
      const countAfterFanfare = sbCount(sbCard);
      const woodsong = findOnBoard("first", "Woodsong Haikumaster")!;
      woodsong.defense = 0;
      cleanupDead();
      expect(sbCount(sbCard)).toBeGreaterThan(countAfterFanfare);
    });
  });

  describe("Ginger, Disastrous Word (10834120)", () => {
    const SPELLBOOST_TARGET = "10131320";

    it("Fanfare: summons 2 Guardian Golems (90031120); Ginger has no Rush", () => {
      setupTurn(R8, { hand: [GINGER], pp: 7 });
      whenPlayCard("first", 0);
      const golems = thenBoard("first").filter((c) => c.id === GUARDIAN_GOLEM);
      expect(golems).toHaveLength(2);
      const ginger = findOnBoard("first", "Ginger, Disastrous Word")!;
      expect(ginger.hasRush).toBeFalsy();
    });

    it("when another ally enters: gives it Rush and spellboosts hand; Ginger self-enter does not", () => {
      setupTurn(R8, { hand: [GINGER, SPELLBOOST_TARGET], pp: 7 });
      whenPlayCard("first", 0);
      const ginger = findOnBoard("first", "Ginger, Disastrous Word")!;
      const sbCard = thenHand("first").find((c) => c.id === SPELLBOOST_TARGET)!;
      const sb0 = sbCount(sbCard);
      fireTrigger("ally_follower_enter", "first", {
        enteringCard: ginger,
        enteringOwner: "first",
      });
      expect(ginger.hasRush).toBeFalsy();
      expect(sbCount(sbCard)).toBe(sb0);

      const newcomer = createCard(
        { name: "NewAlly", type: "Follower", cost: 1, attack: 1, defense: 1 },
        "board",
        "first",
      );
      newcomer.peak_defense = 1;
      state.players.first.board.push(newcomer);
      fireTrigger("ally_follower_enter", "first", {
        enteringCard: newcomer,
        enteringOwner: "first",
      });
      expect(newcomer.hasRush).toBe(true);
      expect(sbCount(sbCard)).toBeGreaterThan(sb0);
    });

    it("Evolve: summons a Guardian Golem", () => {
      setupTurn(R8, { hand: [GINGER], pp: 7 });
      state.players.first.evoCharges = 2;
      whenPlayCard("first", 0);
      const golemsAfterFanfare = thenBoard("first").filter(
        (c) => c.id === GUARDIAN_GOLEM,
      ).length;
      const ginger = findOnBoard("first", "Ginger, Disastrous Word")!;
      onEvolve(ginger, "first", "normal", { spendPoint: true });
      const golemsAfterEvolve = thenBoard("first").filter(
        (c) => c.id === GUARDIAN_GOLEM,
      ).length;
      expect(golemsAfterEvolve).toBe(golemsAfterFanfare + 1);
    });
  });

  describe("Ara, Dawnblossom (10534120)", () => {
    it("On Spellboost: reduces this card's cost by 1", () => {
      setupTurn(R10, { hand: [FORESIGHT, ARA], pp: 2 });
      const ara = thenHand("first").find((c) => c.id === ARA)!;
      const cost0 = getEffectiveCost(ara);
      whenPlayCard("first", 0);
      const araAfter = thenHand("first").find((c) => c.id === ARA)!;
      expect(getEffectiveCost(araAfter)).toBe(cost0 - 1);
    });

    it("Fanfare: deals 10 to selected enemy; bystander untouched", () => {
      setupTurn(R10, { hand: [ARA], pp: 10 });
      const target = enemyFollower(2, 12, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("Evolve: transforms another follower into Regal Falcon (90061130)", () => {
      setupTurn(R10, { hand: [ARA], pp: 10 });
      enemyFollower(2, 5, "Enemy");
      const bystander = allyFollower(3, 3, "Bystander");
      state.players.first.evoCharges = 2;
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const ara = findOnBoard("first", "Ara, Dawnblossom")!;
      onEvolve(ara, "first", "normal", { spendPoint: true });
      resolvePendingByUid(bystander.uid);
      expect(findOnBoard("first", "Bystander")).toBeFalsy();
      expect(thenBoard("first").some((c) => c.id === REGAL_FALCON)).toBe(true);
      expect(ara.name).toBe("Ara, Dawnblossom");
    });
  });

  describe("Phylene, Cleansing Revenant (10934120)", () => {
    it("On Spellboost: reduces this card's cost by 1", () => {
      setupTurn(R10, { hand: [PHYLENE], pp: 10 });
      const card = getHand(state, "first")[0]!;
      runEffects(
        [{ op: "spellboost", target: "ally:hand", count: 1 }],
        "first",
        card,
      );
      expect(Number(card.cost)).toBeLessThan(10);
    });

    it("has Bane, Ward, and Aura on field", () => {
      setupTurn(R10, { hand: [PHYLENE], pp: 10 });
      whenPlayCard("first", 0);
      const phylene = findOnBoard("first", "Phylene, Cleansing Revenant")!;
      expect(phylene.hasBane || phylene.keywordState?.hasBane).toBe(true);
      expect(phylene.hasWard || phylene.keywordState?.hasWard).toBe(true);
      expect(phylene.hasAura || phylene.keywordState?.hasAura).toBe(true);
    });
  });
});
