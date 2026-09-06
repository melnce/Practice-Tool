/**
 * L2 real-card tests — Lhynkal Runecraft deck (15 distinct cards).
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
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  playFollowerFromHandById,
  PLAY_FILLER_FOLLOWER,
} from "../harness/l2Dispatch.js";
import {
  getBoard,
  getHP,
  getPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FORESIGHT = "10031310";
const LHYNKAL = "10534110";
const STORMY_BLAST = "10831310";
const WORLD_OF_GAMES = "10503210";
const HARMONIOUS_MEAL = "10832310";
const METAMORPHOSIS = "10531310";
const WILLS_UNITED = "10803310";
const AMETHYST_NAPTIME = "10833310";
const TICO = "10833110";
const SAMMY_MARIE = "10832110";
const TETRA = "10834110";
const WOODSONG = "10532120";
const GINGER = "10834120";
const ARA = "10534120";
const PHYLENE = "10934120";

const MYSTERIAN_MISSILE = "90031310";
const DELTA_CANNON = "90034340";
const SEND_EM_PACKING = "90034350";
const GUARDIAN_GOLEM = "90031120";
const REGAL_FALCON = "90061130";
const REANIMATE_CORPSE = "10201110"; // Twinblade Goblin (cost 1)

const R5 = 5;
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
    hand?: Array<string | Record<string, unknown>>;
    deck?: Array<string | Record<string, unknown>>;
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
  if (opts.hand?.length) b = b.withFirstHand(opts.hand as any);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck as any);
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

function playForesights(n: number): void {
  for (let i = 0; i < n; i++) {
    whenPlayCard("first", 0);
  }
}

function boostCard(card: { uid: string; id?: string }, n: number): void {
  spellboostHand("first", n, card as Parameters<typeof spellboostHand>[2]);
}

describe("L2 Lhynkal Runecraft — real-card tests", () => {
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

  describe("Lhynkal, Wandering Fool (10534110)", () => {
    it("Fanfare: gains Crest: Lhynkal, Wandering Fool", () => {
      setupTurn(R6, { hand: [LHYNKAL], pp: 1 });
      whenPlayCard("first", 0);
      expect(
        getCrests(state, "first").some((c) => c.name.includes("Lhynkal")),
      ).toBe(true);
    });

    it("has Rush on field", () => {
      setupTurn(R6, { hand: [LHYNKAL], pp: 1 });
      whenPlayCard("first", 0);
      const lhynkal = findOnBoard("first", "Lhynkal, Wandering Fool")!;
      expect(lhynkal.hasRush || lhynkal.keywordState?.hasRush).toBe(true);
    });

    it("Super-Evolve: adds 10 copies of Lhynkal, Wandering Fool to your deck", () => {
      setupTurn(R7, { hand: [LHYNKAL], pp: 1, deck: [FORESIGHT] });
      state.players.first.superEvoCharges = 1;
      whenPlayCard("first", 0);
      const lhynkal = findOnBoard("first", "Lhynkal, Wandering Fool")!;
      const deckBefore = deckIds().filter((id) => id === LHYNKAL).length;
      whenSuperEvolve(lhynkal, "first");
      const deckAfter = deckIds().filter((id) => id === LHYNKAL).length;
      expect(deckAfter - deckBefore).toBe(10);
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

  describe("World of Games (10503210)", () => {
    const DRAW_A = "10021110";
    const DRAW_B = "10021120";

    it("enters with Countdown (5)", () => {
      setupTurn(R5, { hand: [WORLD_OF_GAMES], pp: 1 });
      whenPlayCard("first", 0);
      const games = findOnBoard("first", "World of Games")!;
      expect(Number(games.countdown)).toBe(5);
    });

    it("playing the amulet itself does not advance its countdown", () => {
      setupTurn(R5, { hand: [WORLD_OF_GAMES], pp: 1 });
      whenPlayCard("first", 0);
      const games = findOnBoard("first", "World of Games")!;
      expect(Number(games.countdown)).toBe(5);
    });

    it("when another field card shares the played card base cost: advances countdown by 1", () => {
      resetUidCounter();
      givenGameState({ seed: 7, activePlayer: "first", roundCount: R5 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const games = createCard(WORLD_OF_GAMES, "board", "first");
      games.hasCountdown = true;
      games.countdown = 5;
      getBoard(state, "first").push(games);

      const onField = createCard("10001110", "board", "first");
      onField.cost = 3;
      (onField as { base_cost?: number }).base_cost = 3;
      getBoard(state, "first").push(onField);

      const played = createCard("10001120", "hand", "first");
      played.cost = 3;
      (played as { base_cost?: number }).base_cost = 3;
      state.players.first.hand.push(played);

      whenPlayCard("first", 0);
      expect(Number(games.countdown)).toBe(4);
    });

    it("when no other field card shares base cost: playing another card does not advance countdown", () => {
      resetUidCounter();
      givenGameState({ seed: 7, activePlayer: "first", roundCount: R5 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const games = createCard(WORLD_OF_GAMES, "board", "first");
      games.hasCountdown = true;
      games.countdown = 5;
      getBoard(state, "first").push(games);

      const played = createCard("10001120", "hand", "first");
      played.cost = 3;
      (played as { base_cost?: number }).base_cost = 3;
      state.players.first.hand.push(played);

      whenPlayCard("first", 0);
      expect(Number(games.countdown)).toBe(5);
    });

    it("Last Words: draws 2 stacked deck cards", () => {
      setupTurn(R6, {
        hand: [WORLD_OF_GAMES],
        deck: [FORESIGHT, DRAW_B, DRAW_A],
        pp: 1,
      });
      whenPlayCard("first", 0);
      const games = findOnBoard("first", "World of Games")!;
      games.countdown = 0;
      cleanupDead();
      expect(findOnBoard("first", "World of Games")).toBeFalsy();
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
    });
  });

  describe("Harmonious Meal (10832310)", () => {
    const SPELLBOOST_TARGET = "10131320";

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

  describe("Metamorphosis of the Dawnblossom (10531310)", () => {
    const DISCARD = "10021110";
    const DRAW_A = "10021120";
    const DRAW_B = "10011110";

    it("discards the selected hand card and draws 2 stacked deck cards", () => {
      setupTurn(R6, {
        hand: [METAMORPHOSIS, DISCARD],
        deck: [FORESIGHT, DRAW_B, DRAW_A],
        pp: 2,
      });
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(handIds()).not.toContain(DISCARD);
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(handIds()).not.toContain(METAMORPHOSIS);
    });
  });

  describe("Wills United (10803310)", () => {
    it("Mode 1: deals 3 damage to a random enemy follower (seed 1)", () => {
      setupTurn(R6, { hand: [WILLS_UNITED], pp: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const totalDamage =
        5 - Number(target.defense) + (5 - Number(bystander.defense));
      expect(totalDamage).toBe(3);
    });

    it("Mode 2: Reanimate (2) summons a destroyed cost-1 follower from graveyard", () => {
      setupTurn(R6, { hand: [WILLS_UNITED], pp: 2 });
      const corpse = createCard(REANIMATE_CORPSE, "board", "first");
      corpse.uid = "corpse_uid";
      corpse.peak_defense = Number(corpse.defense) || 1;
      state.players.first.board.push(corpse);
      corpse.defense = 0;
      cleanupDead();
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(thenBoard("first").some((c) => c.id === REANIMATE_CORPSE)).toBe(
        true,
      );
    });

    it("Mode 3: gives all allied followers on the field +1/+0", () => {
      setupTurn(R6, { hand: [WILLS_UNITED], pp: 2 });
      const allyA = allyFollower(2, 2, "AllyA");
      const allyB = allyFollower(3, 3, "AllyB");
      setScriptedModePickProvider(() => [2]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(Number(allyA.attack)).toBe(3);
      expect(Number(allyB.attack)).toBe(4);
      expect(Number(allyA.defense)).toBe(2);
      expect(Number(allyB.defense)).toBe(3);
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
      whenEvolve(tico, "first");
      expect(getEffectiveCost(missile)).toBe(missileCost0 - 1);
      expect(getEffectiveCost(foresight)).toBe(foresightCost0);
    });

    it("Super-Evolve: gains Crest: Tico, Mysterian Spellcrafter", () => {
      setupTurn(R7, { hand: [TICO], pp: 3 });
      state.players.first.superEvoCharges = 1;
      whenPlayCard("first", 0);
      const tico = findOnBoard("first", "Tico, Mysterian Spellcrafter")!;
      whenSuperEvolve(tico, "first");
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Tico, Mysterian Spellcrafter",
        ),
      ).toBe(true);
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
      setupTurn(R8, {
        hand: [GINGER, SPELLBOOST_TARGET, PLAY_FILLER_FOLLOWER],
        pp: 10,
      });
      whenPlayCard("first", 0);
      const ginger = findOnBoard("first", "Ginger, Disastrous Word")!;
      const sbCard = thenHand("first").find((c) => c.id === SPELLBOOST_TARGET)!;
      const sb0 = sbCount(sbCard);
      expect(ginger.hasRush).toBeFalsy();
      expect(sbCount(sbCard)).toBe(sb0);

      const newcomer = playFollowerFromHandById("first", PLAY_FILLER_FOLLOWER);
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
      whenEvolve(ginger, "first");
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
      whenEvolve(ara, "first");
      resolvePendingByUid(bystander.uid);
      expect(findOnBoard("first", "Bystander")).toBeFalsy();
      expect(thenBoard("first").some((c) => c.id === REGAL_FALCON)).toBe(true);
      expect(ara.name).toBe("Ara, Dawnblossom");
    });
  });

  describe("Phylene, Cleansing Revenant (10934120)", () => {
    it("On Spellboost: reduces this card's cost by 1 when a spell is played", () => {
      setupTurn(R10, { hand: [FORESIGHT, PHYLENE], pp: 2 });
      const phylene = thenHand("first").find((c) => c.id === PHYLENE)!;
      const cost0 = getEffectiveCost(phylene);
      whenPlayCard("first", 0);
      const phyleneAfter = thenHand("first").find((c) => c.id === PHYLENE)!;
      expect(getEffectiveCost(phyleneAfter)).toBe(cost0 - 1);
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
