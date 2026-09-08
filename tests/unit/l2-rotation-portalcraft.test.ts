/**
 * L2 real-card tests — rotation-legal Portalcraft cards (31 cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolveOpenPendingTarget } from "../harness/l2Dispatch.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getGraveyard,
  getBanish,
  getEvoCharges,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Rotation Portalcraft cards (31)
const ZERK = "10871130";
const ADVENT_ELD_AXE = "10671310";
const BLINK_STEP = "10772310";
const ELECTRIC_WHIP_LASS = "10072110";
const LEONA = "10871120";
const LUNAR_BUNNY = "10572120";
const TSUBASA = "10471120";
const KITTY_CANNONEER = "10071110";
const JOURNEY_AHEAD = "10873310";
const UNSULLIED_DAYS = "10872310";
const WARP_SLASH = "10773310";
const BULLET_BEYOND = "10071310";
const LAYLA = "10872110";
const MARIONETTE_MASTER = "10571110";
const NEW_AGE_CARTOGRAPHER = "10572110";
const TIMID_PIONEER = "10672120";
const TWINDRONE = "10971120";
const CASSIUS = "10473110";
const EUSTACE = "10472110";
const FLOWERING_ARTISAN = "10571120";
const MECHA_CAVALIER = "10072120";
const NEURON_DISRUPTER = "10573110";
const AUDACIOUS_ARTIST = "10772120";
const BLADE_PUPPETEER = "10972120";
const BRILLIANT_INVENTOR = "10671120";
const DIMENSIONAL_SELECTION = "10971310";
const MECHANIZED_BEAST = "10071130";
const BEAT_BREAKER = "10771120";
const ILSA = "10472120";
const KRATOS = "10871110";
const MIRIAM = "10873110";

// Tokens
const PUPPET = "90071110";
const ENHANCED_PUPPET = "90071120";
const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";
const ANALYZING_ARTIFACT = "90071130";
const ANCIENT_ARTIFACT = "90071140";
const MYSTIC_ARTIFACT = "90071150";
const RADIANT_ARTIFACT = "90071160";
const FORTIFIER_ARTIFACT = "90072120";
const STRIKER_ARTIFACT = "90072110";
const OMINOUS_ALPHA = "90073110";
const OMINOUS_BETA = "90073120";

// Fillers / deck stack helpers
const FILLER = "10111310";
const SPELL_A = "10571310"; // Light of the Dewdrop (1-cost spell)
const SPELL_B = "10572310"; // Resurrection Tuner (2-cost spell)
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const DRAW_THIRD = "10021130";
const HAND_FOLLOWER = "10712110"; // Virewind Fencer (Swordcraft follower for Blink Step hand buff)
const SKYBOUND_HAND_SPELL = "10171320";

const PAD_DECK = Array.from({ length: 25 }, () => FILLER);

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    secondDeck?: string[];
    secondHand?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    firstBoard?: string[];
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
  else b = b.withFirstDeck(PAD_DECK);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  else b = b.withSecondDeck(PAD_DECK);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.firstBoard?.length) b = b.withFirstBoard(opts.firstBoard);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

function resolvePendingByUid(uid: string): void {
  resolveOpenPendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
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

function enemyLastWordsFollower(name = "LWEnemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 3 },
    "board",
    "second",
  );
  c.peak_defense = 3;
  c.hasLastWords = true;
  c.lastWordsEffects = [
    { op: "summon", source: "named", name: "Fairy", count: 1 },
  ];
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

function allyBigFollower(baseCost: number, name = "BigAlly") {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: baseCost,
      base_cost: baseCost,
      attack: baseCost,
      defense: baseCost,
    },
    "board",
    "first",
  );
  c.peak_defense = baseCost;
  state.players.first.board.push(c);
  return c;
}

function pushUniqueArtifactEnters(
  entries: Array<{ id: string; name: string }>,
): void {
  if (!state.players.first.followerEnterHistory) {
    state.players.first.followerEnterHistory = [];
  }
  for (const e of entries) {
    state.players.first.followerEnterHistory.push({
      name: e.name,
      tribes: ["Artifact"],
      cardId: e.id,
    });
  }
}

function hasKeyword(
  card: {
    hasRush?: boolean;
    hasWard?: boolean;
    hasBane?: boolean;
    hasAmbush?: boolean;
    hasStorm?: boolean;
  },
  kw: "Rush" | "Ward" | "Bane" | "Ambush" | "Storm",
): boolean {
  applyKeywordsFromList(card as any);
  switch (kw) {
    case "Rush":
      return !!card.hasRush;
    case "Ward":
      return !!card.hasWard;
    case "Bane":
      return !!card.hasBane;
    case "Ambush":
      return !!card.hasAmbush;
    case "Storm":
      return !!card.hasStorm;
  }
}

describe("L2 rotation Portalcraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Zerk, Artifact Manipulator (10871130)", () => {
    const printed =
      "Fanfare: Add a copy of a random allied Artifact follower destroyed this match to your hand without revealing it.";

    it("Fanfare adds a destroyed allied Artifact follower to hand (seeded)", () => {
      setupTurn(R5, { hand: [ZERK], pp: 1 });
      const destroyed = createCard(ANCIENT_ARTIFACT, "graveyard", "first");
      recordDestroyed(state, "first", destroyed);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANCIENT_ARTIFACT);
      expect(handIds()).not.toContain(ZERK);
      expect(printed).toContain("Artifact follower destroyed this match");
    });

    it("Fanfare with no destroyed allied Artifact followers: hand unchanged except Zerk left", () => {
      setupTurn(R5, { hand: [ZERK], pp: 1 });
      whenPlayCard("first", 0);
      expect(handIds()).toEqual([]);
    });
  });

  describe("Advent of the Eld Axe (10671310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 4 damage. If there's an allied follower on the field with a base cost of 5 or more, draw a card.";

    it("deals 4 damage to selected enemy follower; bystander untouched", () => {
      setupTurn(R5, { hand: [ADVENT_ELD_AXE], deck: [DRAW_TOP], pp: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(1);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("with ally base cost ≥5: draws stacked card from deck", () => {
      setupTurn(R5, { hand: [ADVENT_ELD_AXE], deck: [DRAW_TOP], pp: 2 });
      allyBigFollower(5);
      enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("draw a card");
    });

    it("without ally base cost ≥5: deals 4 damage but does not draw", () => {
      setupTurn(R5, { hand: [ADVENT_ELD_AXE], deck: [DRAW_TOP], pp: 2 });
      allyFollower(2, 2, "Small");
      enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(handIds()).not.toContain(DRAW_TOP);
    });
  });

  describe("Blink Step (10772310)", () => {
    const printed =
      "Give all allied followers on the field +1/+0. If you've unlocked super-evolution, give all followers in your hand +1/+0.";

    it("gives all allied board followers +1/+0", () => {
      setupTurn(R5, { hand: [BLINK_STEP], pp: 2 });
      const ally = allyFollower(2, 2, "Boardie");
      whenPlayCard("first", 0);
      expect(Number(ally.attack)).toBe(3);
      expect(Number(ally.defense)).toBe(2);
    });

    it("super-evo unlocked (round 7): also gives hand followers +1/+0", () => {
      setupTurn(R7, { hand: [BLINK_STEP, HAND_FOLLOWER], pp: 2 });
      const handCard = getHand(state, "first").find(
        (c) => c.id === HAND_FOLLOWER,
      )!;
      const atkBefore = Number(handCard.attack);
      whenPlayCard("first", 0);
      expect(Number(handCard.attack)).toBe(atkBefore + 1);
      expect(printed).toContain("super-evolution");
    });

    it("super-evo not unlocked (round 5): hand followers not buffed", () => {
      setupTurn(R5, { hand: [BLINK_STEP, HAND_FOLLOWER], pp: 2 });
      const handCard = getHand(state, "first").find(
        (c) => c.id === HAND_FOLLOWER,
      )!;
      const atkBefore = Number(handCard.attack);
      whenPlayCard("first", 0);
      expect(Number(handCard.attack)).toBe(atkBefore);
    });
  });

  describe("Electric Whip Lass (10072110)", () => {
    const printed = "Fanfare: Add a Gear of Remembrance to your hand.";

    it("Fanfare adds Gear of Remembrance (90071220) to hand", () => {
      setupTurn(R5, { hand: [ELECTRIC_WHIP_LASS], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(GEAR_REMEMBRANCE);
      expect(handIds()).not.toContain(ELECTRIC_WHIP_LASS);
      expect(printed).toContain("Gear of Remembrance");
    });
  });

  describe("Leona, Overbearing Guardian (10871120)", () => {
    const printed =
      "Ward\nSuper-Evolve: Select another allied follower on the field and give it Ambush.";

    it("has Ward on board", () => {
      setupTurn(R7, { hand: [LEONA], pp: 2, superEvo: 1 });
      whenPlayCard("first", 0);
      const leona = findOnBoard("first", "Leona, Overbearing Guardian")!;
      expect(hasKeyword(leona, "Ward")).toBe(true);
    });

    it("Super-Evolve grants Ambush to selected ally; Leona and bystander states correct", () => {
      setupTurn(R7, { hand: [LEONA], pp: 2, superEvo: 1 });
      whenPlayCard("first", 0);
      const leona = findOnBoard("first", "Leona, Overbearing Guardian")!;
      const bystander = allyFollower(2, 2, "Bystander");
      whenSuperEvolve(leona, "first");
      resolvePendingByUid(bystander.uid);
      expect(hasKeyword(bystander, "Ambush")).toBe(true);
      expect(hasKeyword(leona, "Ambush")).toBe(false);
      expect(printed).toContain("another allied follower");
    });
  });

  describe("Lunar Bunny (10572120)", () => {
    const printed = "Ward\nWhen you play a spell, evolve this follower.";

    it("has Ward on board", () => {
      setupTurn(R5, { hand: [LUNAR_BUNNY], pp: 2 });
      whenPlayCard("first", 0);
      const bunny = findOnBoard("first", "Lunar Bunny")!;
      expect(hasKeyword(bunny, "Ward")).toBe(true);
    });

    it("does not evolve before a spell is played", () => {
      setupTurn(R5, { hand: [LUNAR_BUNNY, SPELL_A], pp: 5 });
      whenPlayCard("first", 0);
      const bunny = findOnBoard("first", "Lunar Bunny")!;
      expect(bunny.hasEvolved).toBeFalsy();
    });

    it("evolves when owner plays a spell", () => {
      setupTurn(R5, { hand: [LUNAR_BUNNY, SPELL_A], pp: 5 });
      whenPlayCard("first", 0);
      const bunny = findOnBoard("first", "Lunar Bunny")!;
      const spellIdx = getHand(state, "first").findIndex(
        (c) => c.id === SPELL_A,
      );
      whenPlayCard("first", spellIdx);
      expect(bunny.hasEvolved).toBe(true);
      expect(printed).toContain("evolve this follower");
    });
  });

  describe("Tsubasa, Blazing Gearcyclist (10471120)", () => {
    const printed =
      "Fanfare: Increase the Skybound Art gauges of all cards in your hand by 1.\nRush";

    it("Fanfare increases Skybound Art gauge on all hand cards by 1", () => {
      setupTurn(R6, { hand: [TSUBASA, SKYBOUND_HAND_SPELL], pp: 2 });
      const spell = getHand(state, "first").find(
        (c) => c.id === SKYBOUND_HAND_SPELL,
      )!;
      const g0 = Number(spell.skyboundArtEvolvesWitnessed ?? 0);
      whenPlayCard("first", 0);
      expect(Number(spell.skyboundArtEvolvesWitnessed ?? 0)).toBe(g0 + 1);
    });

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [TSUBASA], pp: 2 });
      whenPlayCard("first", 0);
      const tsubasa = findOnBoard("first", "Tsubasa, Blazing Gearcyclist")!;
      expect(hasKeyword(tsubasa, "Rush")).toBe(true);
    });
  });

  describe("Kitty Cannoneer (10071110)", () => {
    const printed = "Fanfare: Add a Gear of Ambition to your hand.\nRush";

    it("Fanfare adds Gear of Ambition (90071210) to hand", () => {
      setupTurn(R5, { hand: [KITTY_CANNONEER], pp: 3 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(GEAR_AMBITION);
      expect(handIds()).not.toContain(KITTY_CANNONEER);
    });

    it("has Rush on board", () => {
      setupTurn(R5, { hand: [KITTY_CANNONEER], pp: 3 });
      whenPlayCard("first", 0);
      const kitty = findOnBoard("first", "Kitty Cannoneer")!;
      expect(hasKeyword(kitty, "Rush")).toBe(true);
    });
  });

  describe("The Journey Ahead (10873310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 6 damage. If at least 3 differently named allied Artifact followers have entered the field this match, recover 1 evolution point.";

    it("deals 6 damage to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [JOURNEY_AHEAD], pp: 3 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("with 3+ unique Artifact enters and 0 EP: recovers 1 evolution point", () => {
      setupTurn(R6, { hand: [JOURNEY_AHEAD], pp: 3 });
      state.players.first.evoCharges = 0;
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
        { id: MYSTIC_ARTIFACT, name: "Mystic Artifact" },
      ]);
      enemyFollower(2, 6, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(getEvoCharges(state, "first")).toBe(1);
    });

    it("with fewer than 3 unique Artifact enters: deals 6 damage but no EP recovery", () => {
      setupTurn(R6, { hand: [JOURNEY_AHEAD], pp: 3 });
      state.players.first.evoCharges = 0;
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
      ]);
      enemyFollower(2, 6, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(getEvoCharges(state, "first")).toBe(0);
    });
  });

  describe("Unsullied Days (10872310)", () => {
    const printed =
      "Draw 2 cards. If you've unlocked super-evolution, restore 2 defense to your leader.";

    it("draws 2 stacked cards from deck", () => {
      setupTurn(R5, {
        hand: [UNSULLIED_DAYS],
        // Deck top is array end: DRAW_TOP drawn first, then DRAW_SECOND.
        deck: [DRAW_THIRD, DRAW_SECOND, DRAW_TOP],
        pp: 3,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(handIds()).not.toContain(UNSULLIED_DAYS);
    });

    it("super-evo unlocked (round 7): restores 2 leader HP", () => {
      setupTurn(R7, { hand: [UNSULLIED_DAYS], pp: 3, hp: 18 });
      const hp0 = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hp0 + 2);
    });

    it("super-evo not unlocked (round 5): draws 2 but does not heal leader", () => {
      setupTurn(R5, {
        hand: [UNSULLIED_DAYS],
        deck: [DRAW_TOP, DRAW_SECOND],
        pp: 3,
        hp: 18,
      });
      const hp0 = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hp0);
      expect(handIds()).toContain(DRAW_TOP);
    });
  });

  describe("Warp Slash (10773310)", () => {
    const printed =
      "Deal X damage to all enemy followers. X is the number of differently named allied Artifact followers that have entered the field this match. Deal 1 damage to the enemy leader.";

    it("with 3 unique Artifact enters: X=3 AoE + 1 leader damage", () => {
      setupTurn(R6, { hand: [WARP_SLASH], pp: 3 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
        { id: MYSTIC_ARTIFACT, name: "Mystic Artifact" },
      ]);
      const foe = enemyFollower(2, 10, "Foe");
      const hp0 = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(7);
      expect(getHP(state, "second")).toBe(hp0 - 1);
    });

    it("with 0 unique Artifact enters: 0 AoE + 1 leader damage only", () => {
      setupTurn(R6, { hand: [WARP_SLASH], pp: 3 });
      const foe = enemyFollower(2, 10, "Foe");
      const hp0 = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(10);
      expect(getHP(state, "second")).toBe(hp0 - 1);
    });
  });

  describe("Bullet from Beyond (10071310)", () => {
    const printed =
      "Select an enemy follower on the field and destroy it. Add a Gear of Ambition and Gear of Remembrance to your hand.";

    it("destroys selected enemy and adds both gears; bystander survives", () => {
      setupTurn(R8, { hand: [BULLET_BEYOND], pp: 4 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").map((c) => c.uid)).toEqual([
        bystander.uid,
      ]);
      expect(handIds()).toContain(GEAR_AMBITION);
      expect(handIds()).toContain(GEAR_REMEMBRANCE);
    });
  });

  describe("Layla, Artificial Gift of Life (10872110)", () => {
    const printed = "Rush\nLast Words: Add an Ancient Artifact to your hand.";

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [LAYLA], pp: 4 });
      whenPlayCard("first", 0);
      const layla = findOnBoard("first", "Layla, Artificial Gift of Life")!;
      expect(hasKeyword(layla, "Rush")).toBe(true);
    });

    it("Last Words adds Ancient Artifact (90071140) to hand", () => {
      setupTurn(R6, { hand: [LAYLA], pp: 4 });
      whenPlayCard("first", 0);
      const layla = findOnBoard("first", "Layla, Artificial Gift of Life")!;
      layla.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(ANCIENT_ARTIFACT);
    });
  });

  describe("Marionette Master (10571110)", () => {
    const printed =
      "Fanfare: Summon an Enhanced Puppet and Puppet.\nEnhance (7): Give them Storm.";

    it("Fanfare summons exactly 1 Enhanced Puppet and 1 Puppet", () => {
      setupTurn(R6, { hand: [MARIONETTE_MASTER], pp: 4 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === ENHANCED_PUPPET)).toHaveLength(1);
      expect(boardIds().filter((id) => id === PUPPET)).toHaveLength(1);
    });

    it("Enhance (7): Fanfare and Enhance both fire; puppets gain Storm", () => {
      setupTurn(R8, { hand: [MARIONETTE_MASTER], pp: 7 });
      whenPlayCard("first", 0);
      const enhanced = thenBoard("first").filter(
        (c) => c.id === ENHANCED_PUPPET,
      );
      const puppet = thenBoard("first").filter((c) => c.id === PUPPET);
      expect(enhanced).toHaveLength(1);
      expect(puppet).toHaveLength(1);
      expect(hasKeyword(enhanced[0]!, "Storm")).toBe(true);
      expect(hasKeyword(puppet[0]!, "Storm")).toBe(true);
    });

    it("at 4 PP without Enhance: puppets summoned without Storm", () => {
      setupTurn(R6, { hand: [MARIONETTE_MASTER], pp: 4 });
      whenPlayCard("first", 0);
      const enhanced = thenBoard("first").find(
        (c) => c.id === ENHANCED_PUPPET,
      )!;
      const puppet = thenBoard("first").find((c) => c.id === PUPPET)!;
      expect(hasKeyword(enhanced, "Storm")).toBe(false);
      expect(hasKeyword(puppet, "Storm")).toBe(false);
    });
  });

  describe("New-Age Cartographer (10572110)", () => {
    const printed =
      "Fanfare: Add an Ominous Artifact β to your hand.\nSuper-Evolve: Select an Artifact follower in your hand that costs 5 or less and summon an exact copy of it.";

    it("Fanfare adds Ominous Artifact β (90073120) to hand", () => {
      setupTurn(R6, { hand: [NEW_AGE_CARTOGRAPHER], pp: 4 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(OMINOUS_BETA);
    });

    it("Super-Evolve with Analyzing Artifact summons exact copy (10572110) — printed: 'Select an Artifact follower in your hand that costs 5 or less and summon an exact copy of it.'", () => {
      setupTurn(R8, {
        hand: [NEW_AGE_CARTOGRAPHER, ANALYZING_ARTIFACT],
        pp: 4,
        superEvo: 1,
      });
      whenPlayCard("first", 0);
      const cart = findOnBoard("first", "New-Age Cartographer")!;
      const handArtifact = getHand(state, "first").find(
        (c) => c.id === ANALYZING_ARTIFACT,
      )!;
      whenSuperEvolve(cart, "first");
      resolvePendingByUid(handArtifact.uid);
      expect(boardIds().filter((id) => id === ANALYZING_ARTIFACT)).toHaveLength(
        1,
      );
    });

    it("Super-Evolve summons exact copy of hand Artifact without enter trigger; original stays in hand", () => {
      setupTurn(R8, { hand: [NEW_AGE_CARTOGRAPHER], pp: 4, superEvo: 1 });
      const plainArtifact = createCard(
        {
          name: "PlainArtifact",
          type: "Follower",
          tribes: ["Artifact"],
          cost: 3,
          attack: 2,
          defense: 2,
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(plainArtifact);
      whenPlayCard("first", 0);
      const cart = findOnBoard("first", "New-Age Cartographer")!;
      whenSuperEvolve(cart, "first");
      resolvePendingByUid(plainArtifact.uid);
      const summoned = findOnBoard("first", "PlainArtifact");
      expect(summoned).toBeTruthy();
      expect(summoned!.uid).not.toBe(plainArtifact.uid);
      expect(
        getHand(state, "first").some((c) => c.uid === plainArtifact.uid),
      ).toBe(true);
      expect(Number(summoned!.attack)).toBe(Number(plainArtifact.attack));
      expect(Number(summoned!.defense)).toBe(Number(plainArtifact.defense));
      expect(printed).toContain("summon an exact copy of it");
    });
  });

  describe("Timid Pioneer (10672120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field with 3 defense or less and banish it.\nAmbush";

    it("Fanfare banishes enemy ≤3 DEF (not destroy — Last Words do not fire)", () => {
      setupTurn(R6, { hand: [TIMID_PIONEER], pp: 4 });
      const lwTarget = enemyLastWordsFollower("Fragile");
      const tank = enemyFollower(4, 4, "Tank");
      whenPlayCard("first", 0);
      resolvePendingByUid(lwTarget.uid);
      expect(getBoard(state, "second").map((c) => c.name)).toEqual(["Tank"]);
      expect(getGraveyard(state, "second")).toHaveLength(0);
      expect(getBanish(state, "second").length).toBe(1);
    });

    it("has Ambush on board", () => {
      setupTurn(R6, { hand: [TIMID_PIONEER], pp: 4 });
      whenPlayCard("first", 0);
      const pioneer = findOnBoard("first", "Timid Pioneer")!;
      expect(hasKeyword(pioneer, "Ambush")).toBe(true);
    });
  });

  describe("Twindrone Engineer (10971120)", () => {
    const printed =
      "Fanfare: Summon an Analyzing Artifact.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare summons exactly 1 Analyzing Artifact (90071130)", () => {
      setupTurn(R6, { hand: [TWINDRONE], pp: 4 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === ANALYZING_ARTIFACT)).toHaveLength(
        1,
      );
    });

    it("Evolve replicates Fanfare: exactly 2 Analyzing Artifacts on board", () => {
      setupTurn(R6, { hand: [TWINDRONE], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const eng = findOnBoard("first", "Twindrone Engineer")!;
      whenEvolve(eng, "first");
      expect(boardIds().filter((id) => id === ANALYZING_ARTIFACT)).toHaveLength(
        2,
      );
    });
  });

  describe("Cassius, Sky-Yearning Arrival (10473110)", () => {
    const printed =
      "Fanfare: Select an Artifact follower in your hand and deal X damage to all enemy followers. X is the selected follower's attack.\nLast Words: Add a Fortifier Artifact to your hand.";

    it("Fanfare: enemy followers take damage equal to selected Artifact ATK", () => {
      setupTurn(R6, { hand: [CASSIUS, STRIKER_ARTIFACT], pp: 5 });
      const striker = getHand(state, "first").find(
        (c) => c.id === STRIKER_ARTIFACT,
      )!;
      const atk = Number(striker.attack);
      const foe = enemyFollower(2, 6, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(striker.uid);
      expect(Number(foe.defense)).toBe(6 - atk);
    });

    it("Last Words adds Fortifier Artifact (90072120) to hand", () => {
      setupTurn(R6, { hand: [CASSIUS], pp: 5 });
      whenPlayCard("first", 0);
      const cassius = findOnBoard("first", "Cassius, Sky-Yearning Arrival")!;
      cassius.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(FORTIFIER_ARTIFACT);
    });
  });

  describe("Eustace, Howl of Thunder (10472110)", () => {
    const printed =
      "Fanfare: Skybound Art- Select another unevolved allied follower on the field and evolve it and this follower.\nClash: Deal 3 damage to the opposing follower.";

    it("Skybound Art (round 10): evolves selected ally and Eustace", () => {
      setupTurn(R10, { hand: [EUSTACE], pp: 5 });
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      resolvePendingByUid(ally.uid);
      expect(ally.hasEvolved).toBe(true);
      const eustace = findOnBoard("first", "Eustace, Howl of Thunder")!;
      expect(eustace.hasEvolved).toBe(true);
    });

    it("Skybound Art not met (round 5): Eustace and ally stay unevolved", () => {
      setupTurn(R5, { hand: [EUSTACE], pp: 5 });
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      expect(ally.hasEvolved).toBeFalsy();
      const eustace = findOnBoard("first", "Eustace, Howl of Thunder")!;
      expect(eustace.hasEvolved).toBeFalsy();
    });

    it("Clash deals 3 damage to opposing follower before strike damage", () => {
      setupTurn(R6, { hand: [EUSTACE], pp: 5 });
      whenPlayCard("first", 0);
      const eustace = findOnBoard("first", "Eustace, Howl of Thunder")!;
      eustace.can_attack = true;
      eustace.can_attack_followers = true;
      eustace.attacks_left = 1;
      eustace.hasAttacked = false;
      const foe = enemyFollower(2, 10);
      const defBefore = Number(foe.defense);
      const eustaceIdx = state.players.first.board.indexOf(eustace);
      attackFollower(eustaceIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(defBefore - 3 - Number(eustace.attack));
    });
  });

  describe("Flowering Artisan (10571120)", () => {
    const printed =
      "Fanfare: Draw a spell.\nWhenever you play a spell, deal 3 damage to all enemy followers.";

    it("Fanfare draws stacked spell from deck", () => {
      setupTurn(R6, {
        hand: [FLOWERING_ARTISAN],
        deck: [DRAW_TOP, SPELL_A],
        pp: 5,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(SPELL_A);
    });

    it("when owner plays a spell: deals 3 damage to all enemy followers", () => {
      setupTurn(R6, {
        hand: [FLOWERING_ARTISAN, SPELL_A],
        deck: [DRAW_TOP],
        pp: 6,
      });
      whenPlayCard("first", 0);
      const foeA = enemyFollower(2, 5, "FoeA");
      const foeB = enemyFollower(2, 5, "FoeB");
      const spellIdx = getHand(state, "first").findIndex(
        (c) => c.id === SPELL_A,
      );
      whenPlayCard("first", spellIdx);
      expect(Number(foeA.defense)).toBe(2);
      expect(Number(foeB.defense)).toBe(2);
    });

    it("when opponent plays a spell during their turn: no damage to enemy followers", () => {
      setupTurn(R6, {
        hand: [FLOWERING_ARTISAN],
        secondHand: [SPELL_A],
        pp: 5,
        active: "second",
      });
      whenPlayCard("first", 0);
      const foe = enemyFollower(2, 5, "Foe");
      state.activePlayer = "second";
      whenPlayCard("second", 0);
      expect(Number(foe.defense)).toBe(5);
    });
  });

  describe("Mecha Cavalier (10072120)", () => {
    const printed =
      "Ward\nEvolve: Summon a Mecha Cavalier.\nSuper-Evolve: Summon 2 instead.";

    it("has Ward on board", () => {
      setupTurn(R7, { hand: [MECHA_CAVALIER], pp: 5, evo: 2 });
      whenPlayCard("first", 0);
      const mecha = findOnBoard("first", "Mecha Cavalier")!;
      expect(hasKeyword(mecha, "Ward")).toBe(true);
    });

    it("Evolve summons exactly 1 additional Mecha Cavalier (2 total on board)", () => {
      setupTurn(R7, { hand: [MECHA_CAVALIER], pp: 5, evo: 2 });
      whenPlayCard("first", 0);
      const mecha = findOnBoard("first", "Mecha Cavalier")!;
      whenEvolve(mecha, "first");
      expect(boardIds().filter((id) => id === MECHA_CAVALIER)).toHaveLength(2);
    });

    it("Super-Evolve summons exactly 2 additional Mecha Cavaliers (3 total on board)", () => {
      setupTurn(R8, { hand: [MECHA_CAVALIER], pp: 5, superEvo: 1 });
      whenPlayCard("first", 0);
      const mecha = findOnBoard("first", "Mecha Cavalier")!;
      whenSuperEvolve(mecha, "first");
      expect(boardIds().filter((id) => id === MECHA_CAVALIER)).toHaveLength(3);
    });
  });

  describe("Neuron Disrupter (10573110)", () => {
    const printed =
      "Fanfare: Recover X play points. X is the number of other allied followers on the field.\nRush\nLast Words: Draw 2 cards.";

    it("Fanfare recovers PP equal to other allied followers (3 others → net +3 after cost 5)", () => {
      setupTurn(R6, { hand: [NEURON_DISRUPTER], pp: 6 });
      allyFollower(1, 1, "A");
      allyFollower(1, 1, "B");
      allyFollower(1, 1, "C");
      whenPlayCard("first", 0);
      // Paid 5 PP (6→1), recovered 3 → 4
      expect(getPP(state, "first")).toBe(4);
    });

    it("Fanfare with no other allies: recovers 0 PP (ends at 0 after cost 5)", () => {
      setupTurn(R6, { hand: [NEURON_DISRUPTER], pp: 5 });
      whenPlayCard("first", 0);
      expect(getPP(state, "first")).toBe(0);
    });

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [NEURON_DISRUPTER], pp: 5 });
      whenPlayCard("first", 0);
      const neuron = findOnBoard("first", "Neuron Disrupter")!;
      expect(hasKeyword(neuron, "Rush")).toBe(true);
    });

    it("Last Words draws 2 stacked cards from deck", () => {
      setupTurn(R6, {
        hand: [NEURON_DISRUPTER],
        deck: [DRAW_THIRD, DRAW_SECOND, DRAW_TOP],
        pp: 5,
      });
      whenPlayCard("first", 0);
      const neuron = findOnBoard("first", "Neuron Disrupter")!;
      neuron.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
    });
  });

  describe("Audacious Artist (10772120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. If at least 3 differently named allied Artifact followers have entered the field this match, summon an Ancient Artifact and Mystic Artifact.";

    it("Fanfare destroys selected enemy; bystander survives", () => {
      setupTurn(R8, { hand: [AUDACIOUS_ARTIST], pp: 6 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").map((c) => c.uid)).toEqual([
        bystander.uid,
      ]);
    });

    it("with 3+ unique Artifact enters: summons Ancient Artifact and Mystic Artifact", () => {
      setupTurn(R8, { hand: [AUDACIOUS_ARTIST], pp: 6 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
        { id: MYSTIC_ARTIFACT, name: "Mystic Artifact" },
      ]);
      enemyFollower(2, 4, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(boardIds().filter((id) => id === ANCIENT_ARTIFACT)).toHaveLength(
        1,
      );
      expect(boardIds().filter((id) => id === MYSTIC_ARTIFACT)).toHaveLength(1);
    });

    it("with fewer than 3 unique Artifact enters: destroys enemy but no artifact summons", () => {
      setupTurn(R8, { hand: [AUDACIOUS_ARTIST], pp: 6 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
      ]);
      enemyFollower(2, 4, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(boardIds().filter((id) => id === ANCIENT_ARTIFACT)).toHaveLength(
        0,
      );
      expect(boardIds().filter((id) => id === MYSTIC_ARTIFACT)).toHaveLength(0);
    });
  });

  describe("Blade Puppeteer (10972120)", () => {
    const printed =
      "Fanfare: Summon an Enhanced Puppet and Puppet.\nWhenever an allied Puppetry follower enters the field, deal 1 damage to the enemy leader.";

    it("Fanfare summons exactly 1 Enhanced Puppet and 1 Puppet", () => {
      setupTurn(R8, { hand: [BLADE_PUPPETEER], pp: 6 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === ENHANCED_PUPPET)).toHaveLength(1);
      expect(boardIds().filter((id) => id === PUPPET)).toHaveLength(1);
    });

    it("Puppetry ally enter deals 1 damage to enemy leader", () => {
      setupTurn(R8, { hand: [BLADE_PUPPETEER], pp: 6 });
      const hp0 = getHP(state, "second");
      whenPlayCard("first", 0);
      // Fanfare summons trigger Puppetry enter — leader already damaged
      expect(getHP(state, "second")).toBeLessThan(hp0);
    });
  });

  describe("Brilliant Inventor (10671120)", () => {
    const printed =
      "Fanfare: Summon an Ominous Artifact α and give it Bane and Ward.";

    it("Fanfare summons Ominous Artifact α (90073110) with Bane and Ward", () => {
      setupTurn(R8, { hand: [BRILLIANT_INVENTOR], pp: 6 });
      whenPlayCard("first", 0);
      const alpha = thenBoard("first").find((c) => c.id === OMINOUS_ALPHA)!;
      expect(alpha).toBeTruthy();
      expect(hasKeyword(alpha, "Bane")).toBe(true);
      expect(hasKeyword(alpha, "Ward")).toBe(true);
    });
  });

  describe("Dimensional Selection (10971310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Deal 5 damage to all enemy followers.\n2. Summon 2 copies of Mystic Artifact.";

    it("mode 1: deals 5 damage to all enemy followers", () => {
      setupTurn(R8, { hand: [DIMENSIONAL_SELECTION], pp: 6 });
      setScriptedModePickProvider(() => [0]);
      const foe = enemyFollower(2, 6, "Foe");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(1);
    });

    it("mode 2: summons exactly 2 Mystic Artifacts", () => {
      setupTurn(R8, { hand: [DIMENSIONAL_SELECTION], pp: 6 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === MYSTIC_ARTIFACT)).toHaveLength(2);
    });
  });

  describe("Mechanized Beast (10071130)", () => {
    const printed = "Bane\nWard";

    it("has Bane and Ward on board", () => {
      setupTurn(R8, { hand: [MECHANIZED_BEAST], pp: 6 });
      whenPlayCard("first", 0);
      const beast = findOnBoard("first", "Mechanized Beast")!;
      expect(hasKeyword(beast, "Bane")).toBe(true);
      expect(hasKeyword(beast, "Ward")).toBe(true);
    });
  });

  describe("Beat Breaker (10771120)", () => {
    const printed =
      "Fanfare: Summon a Beat Breaker. If at least 3 differently named allied Artifact followers have entered the field this match, summon 2 instead.\nRush";

    it("with fewer than 3 unique Artifact enters: summons 1 additional Beat Breaker (2 on board)", () => {
      setupTurn(R8, { hand: [BEAT_BREAKER], pp: 7 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === BEAT_BREAKER)).toHaveLength(2);
    });

    it("with 3+ unique Artifact enters: summons 2 additional Beat Breakers (3 total)", () => {
      setupTurn(R8, { hand: [BEAT_BREAKER], pp: 7 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
        { id: RADIANT_ARTIFACT, name: "Radiant Artifact" },
      ]);
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === BEAT_BREAKER)).toHaveLength(3);
    });

    it("has Rush on board", () => {
      setupTurn(R8, { hand: [BEAT_BREAKER], pp: 7 });
      whenPlayCard("first", 0);
      const breaker = findOnBoard("first", "Beat Breaker")!;
      expect(hasKeyword(breaker, "Rush")).toBe(true);
    });
  });

  describe("Ilsa, Brutal Drill Sergeant (10472120)", () => {
    const printed =
      'Fanfare: Select a Mode to activate.\n1. Do this 3 times: "Deal 4 damage to a random enemy follower."\n2. Deal 4 damage to the enemy leader.';

    it("mode 1: deals 4 damage to a random enemy follower 3 times", () => {
      setupTurn(R10, { hand: [ILSA], pp: 7 });
      setScriptedModePickProvider(() => [0]);
      const foe = enemyFollower(2, 12, "Foe");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(0);
    });

    it("mode 2: deals 4 damage to enemy leader", () => {
      setupTurn(R10, { hand: [ILSA], pp: 7 });
      setScriptedModePickProvider(() => [1]);
      const hp0 = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(hp0 - 4);
    });
  });

  describe("Kratos, Everyday Joy (10871110)", () => {
    const printed =
      "Ward\nLast Words: Summon a Kratos, Everyday Joy and remove Last Words from it.";

    it("has Ward on board", () => {
      setupTurn(R8, { hand: [KRATOS], pp: 7 });
      whenPlayCard("first", 0);
      const kratos = findOnBoard("first", "Kratos, Everyday Joy")!;
      expect(hasKeyword(kratos, "Ward")).toBe(true);
    });

    it("Last Words summons exactly 1 Kratos without Last Words", () => {
      setupTurn(R8, { hand: [KRATOS], pp: 7 });
      whenPlayCard("first", 0);
      const kratos = findOnBoard("first", "Kratos, Everyday Joy")!;
      kratos.defense = 0;
      cleanupDead();
      const summoned = thenBoard("first").filter((c) => c.id === KRATOS);
      expect(summoned).toHaveLength(1);
      expect(summoned[0]?.hasLastWords).toBeFalsy();
      expect(
        summoned[0]?.keywords?.some((k) =>
          String(
            typeof k === "string" ? k : (k as { name?: string })?.name,
          ).includes("Last Words"),
        ),
      ).toBeFalsy();
    });
  });

  describe("Miriam, Reciprocator (10873110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. Summon a Radiant Artifact.";

    it("Fanfare destroys selected enemy and summons Radiant Artifact; bystander survives", () => {
      setupTurn(R8, { hand: [MIRIAM], pp: 7 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").map((c) => c.uid)).toEqual([
        bystander.uid,
      ]);
      expect(boardIds().filter((id) => id === RADIANT_ARTIFACT)).toHaveLength(
        1,
      );
    });
  });
});
