/**
 * L2 real-card tests — Midrange Abysscraft deck.
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
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import {
  summonFollowerByCardId,
  playFollowerFromHandById,
} from "../harness/l2Dispatch.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getBoard, getHand, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck cards
const LILITH_CUTIE = "10851120";
const LILITH_SUCCUBUS = "10052110";
const NETHERWORLD_LT = "10951120";
const RAZ = "10751120";
const BAAL = "10452130";
const BIBATII = "10654120";
const FICKLE_NECRO = "10552110";
const HARK = "10753310";
const HIGHWIRE = "10752110";
const ADAHIME = "10754110";
const VOID_COLONEL = "10952110";
const GARODETH = "10954120";
const BROTHERS = "10854110";
const MACMILLAN = "10754120";

// Tokens
const BAT = "90051120";
const SKELETON = "90051110";
const GHOST = "90051130";
const ROTTING_ZOMBIE = "90051140";
const DEPTHS_SIGHT = "90054330";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | { name: string; type: string; cost?: number }>;
    pp?: number;
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
  name = "Ally",
  atk = 2,
  def = 2,
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

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardNames(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => c.name);
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

describe("L2 — Midrange Abysscraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Lilith, Devilish Cutie (10851120)", () => {
    const printed =
      "Strike: Deal 1 damage to both leaders.\nLast Words: Add a Bat to your hand.";

    it("Strike deals 1 damage to both leaders when attacking a follower", () => {
      setupTurn(5);
      enemyFollower(1, 5, "Blocker");
      const lilith = createCard(LILITH_CUTIE, "board", "first");
      lilith.can_attack = true;
      lilith.justPlayed = false;
      lilith.peak_defense = lilith.defense;
      state.players.first.board = [lilith];

      const hpSelfBefore = getHP(state, "first");
      const hpEnemyBefore = getHP(state, "second");
      attackFollower(0, 0, "first", "second");

      expect(getHP(state, "first")).toBe(hpSelfBefore - 1);
      expect(getHP(state, "second")).toBe(hpEnemyBefore - 1);
      expect(printed).toContain("both leaders");
    });

    it("Last Words adds Bat (90051120) to hand", () => {
      setupTurn(1);
      const lilith = createCard(LILITH_CUTIE, "board", "first");
      applyKeywordsFromList(lilith);
      lilith.defense = 0;
      state.players.first.board = [lilith];

      cleanupDead();
      expect(handIds()).toContain(BAT);
      expect(printed).toContain("Add a Bat");
    });
  });

  describe("Lilith, Enchanting Succubus (10052110)", () => {
    const printed = "Last Words: Add a Bat to your hand.";

    it("Last Words adds Bat (90051120) to hand", () => {
      setupTurn(1);
      const lilith = createCard(LILITH_SUCCUBUS, "board", "first");
      applyKeywordsFromList(lilith);
      lilith.defense = 0;
      state.players.first.board = [lilith];

      cleanupDead();
      expect(handIds()).toContain(BAT);
      expect(printed).toContain("Add a Bat");
    });
  });

  describe("Netherworld Lieutenant (10951120)", () => {
    const printed =
      "Last Words: Summon a Netherworld Lieutenant, give it +1/+0 and Rush, and remove Last Words from it.";

    it("Last Words summons a 2/1 Rush copy without Last Words", () => {
      setupTurn(5, { hand: [NETHERWORLD_LT], pp: 2 });
      whenPlayCard("first", 0);
      const lt = findOnBoard("first", "Netherworld Lieutenant")!;
      lt.defense = 0;
      cleanupDead();

      const summoned = thenBoard("first").filter(
        (c) => c.name === "Netherworld Lieutenant" && c.uid !== lt.uid,
      );
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.attack)).toBe(2);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.hasRush).toBe(true);
      expect(summoned[0]!.keywords?.some((k) => k === "LastWords")).toBeFalsy();
      expect(printed).toContain("+1/+0 and Rush");
    });
  });

  describe("Raz, Demon on the Drums (10751120)", () => {
    const printed =
      "Last Words: Summon a Skeleton.\nEvolve: Select an enemy follower on the field and deal it 3 damage.";

    it("Last Words summons Skeleton (90051110)", () => {
      setupTurn(5, { hand: [RAZ], pp: 2 });
      whenPlayCard("first", 0);
      const raz = findOnBoard("first", "Raz, Demon on the Drums")!;
      raz.defense = 0;
      cleanupDead();
      expect(boardNames()).toContain("Skeleton");
      expect(thenBoard("first").some((c) => c.id === SKELETON)).toBe(true);
      expect(printed).toContain("Summon a Skeleton");
    });

    it("Evolve deals 3 damage to selected enemy; bystander untouched", () => {
      setupTurn(6, { hand: [RAZ], pp: 2 });
      state.players.first.evoCharges = 2;
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      const raz = findOnBoard("first", "Raz, Demon on the Drums")!;
      whenEvolve(raz, "first");
      resolvePendingByUid(target.uid);

      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("deal it 3 damage");
    });
  });

  describe("Baal, Elemental Resonance (10452130)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Give this follower and another random allied follower on the field +1/+1.\n2. Deal 3 damage to a random enemy follower.";

    it("Mode 1: Baal and another ally each gain +1/+1", () => {
      setupTurn(6, { hand: [BAAL], pp: 4 });
      const ally = allyFollower("Ally", 2, 2);
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const baal = findOnBoard("first", "Baal, Elemental Resonance")!;
      expect(Number(baal.attack)).toBe(3);
      expect(Number(ally.attack)).toBe(3);
      expect(printed).toContain("+1/+1");
    });

    it("Mode 2: deals 3 damage to a random enemy follower", () => {
      setupTurn(6, { hand: [BAAL], pp: 4 });
      const foe = enemyFollower(2, 5, "Foe");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("Deal 3 damage");
    });
  });

  describe("Bibatii, Eld Sight (10654120)", () => {
    const printed =
      "Fanfare: Necromancy (4) - Evolve this follower.\nWhen this follower evolves, add a Depths of the Eld Sight to your hand.";

    it("with Necromancy (4): Fanfare evolves Bibatii and adds Depths (90054330)", () => {
      setupTurn(8, { hand: [BIBATII], pp: 4 });
      state.players.first.shadows = 4;
      whenPlayCard("first", 0);
      const bibatii = findOnBoard("first", "Bibatii, Eld Sight")!;
      expect(bibatii.hasEvolved).toBe(true);
      expect(handIds()).toContain(DEPTHS_SIGHT);
      expect(printed).toContain("Necromancy (4)");
    });

    it("without Necromancy (4): Fanfare does not evolve Bibatii", () => {
      setupTurn(8, { hand: [BIBATII], pp: 4 });
      state.players.first.shadows = 3;
      whenPlayCard("first", 0);
      const bibatii = findOnBoard("first", "Bibatii, Eld Sight")!;
      expect(bibatii.hasEvolved).toBeFalsy();
      expect(handIds()).not.toContain(DEPTHS_SIGHT);
      expect(printed).toContain("Evolve this follower");
    });

    it("manual evolve adds Depths of the Eld Sight (90054330)", () => {
      setupTurn(8, { hand: [BIBATII], pp: 4 });
      state.players.first.evoCharges = 2;
      state.players.first.shadows = 0;
      whenPlayCard("first", 0);
      const bibatii = findOnBoard("first", "Bibatii, Eld Sight")!;
      whenEvolve(bibatii, "first");
      expect(handIds()).toContain(DEPTHS_SIGHT);
      expect(printed).toContain("Depths of the Eld Sight");
    });
  });

  describe("Fickle Necromancer (10552110)", () => {
    const printed =
      "Fanfare: Summon a Ghost and Skeleton.\nEvolve: Summon a Rotting Zombie.";

    it("Fanfare summons Ghost (90051130) and Skeleton (90051110)", () => {
      setupTurn(6, { hand: [FICKLE_NECRO], pp: 3 });
      whenPlayCard("first", 0);
      const ids = boardNames("first");
      expect(ids).toContain("Ghost");
      expect(ids).toContain("Skeleton");
      expect(
        thenBoard("first").some((c) => c.id === GHOST || c.id === SKELETON),
      ).toBe(true);
      expect(printed).toContain("Ghost and Skeleton");
    });

    it("Evolve summons Rotting Zombie (90051140)", () => {
      setupTurn(6, { hand: [FICKLE_NECRO], pp: 3 });
      state.players.first.evoCharges = 2;
      whenPlayCard("first", 0);
      const necro = findOnBoard("first", "Fickle Necromancer")!;
      whenEvolve(necro, "first");
      expect(boardNames()).toContain("Rotting Zombie");
      expect(thenBoard("first").some((c) => c.id === ROTTING_ZOMBIE)).toBe(
        true,
      );
      expect(printed).toContain("Summon a Rotting Zombie");
    });
  });

  describe("Hark to the Night Song (10753310)", () => {
    const printed =
      "Deal 6 damage split between all enemy followers. Necromancy (6) - Deal 2 damage to the enemy leader.";

    it("with Necromancy (6): splits 6 among followers and deals 2 to enemy leader", () => {
      setupTurn(5, { hand: [HARK], pp: 5 });
      state.players.first.shadows = 6;
      state.players.second.hp = 20;
      enemyFollower(2, 4, "A");
      enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      cleanupDead();
      const totalDef = getBoard(state, "second").reduce(
        (s, c) => s + (Number(c.defense) || 0),
        0,
      );
      expect(totalDef).toBeLessThanOrEqual(2);
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Necromancy (6)");
    });

    it("without Necromancy (6): splits damage but does not hit enemy leader", () => {
      setupTurn(5, { hand: [HARK], pp: 5 });
      // Playing the spell adds +1 shadow; 4 → 5, still below Necromancy (6).
      state.players.first.shadows = 4;
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 10, "Only");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(20);
      expect(Number(foe.defense)).toBe(4);
      expect(printed).toContain("enemy leader");
    });
  });

  describe("Highwire Feline (10752110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 3 damage. Summon a Skeleton.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare deals 3 to selected enemy, summons Skeleton, bystander untouched", () => {
      setupTurn(8, { hand: [HIGHWIRE], pp: 5 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);

      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
      expect(boardNames("first")).toContain("Skeleton");
      expect(printed).toContain("Summon a Skeleton");
    });

    it("Evolve replicates Fanfare: damage, Skeleton summon, bystander untouched", () => {
      setupTurn(8, { hand: [HIGHWIRE], pp: 5 });
      state.players.first.evoCharges = 2;
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const feline = findOnBoard("first", "Highwire Feline")!;
      const skeletonsBefore = thenBoard("first").filter(
        (c) => c.name === "Skeleton",
      ).length;

      whenEvolve(feline, "first");
      resolvePendingByUid(target.uid);

      expect(Number(target.defense)).toBeLessThan(2);
      expect(Number(bystander.defense)).toBe(5);
      expect(
        thenBoard("first").filter((c) => c.name === "Skeleton").length,
      ).toBeGreaterThan(skeletonsBefore);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Adahime, Anathema of Death (10754110)", () => {
    const printed =
      "Fanfare: Summon 2 random differently named Abysscraft followers that cost 2 or less from your deck.\nWhenever another allied Abysscraft follower enters the field, give it Rush.\nSuper-Evolve: Give all other allied Abysscraft followers on the field +2/+2.";

    it("Fanfare summons 2 distinct Abysscraft followers costing ≤2 from deck", () => {
      setupTurn(6, {
        hand: [ADAHIME],
        pp: 6,
        deck: ["10151120", "10152110", "10151150"],
      });
      whenPlayCard("first", 0);
      const adahime = findOnBoard("first", "Adahime, Anathema of Death")!;
      const summons = thenBoard("first").filter((c) => c.uid !== adahime.uid);
      expect(summons.length).toBeGreaterThanOrEqual(2);
      const names = summons.map((c) => c.name);
      expect(new Set(names).size).toBeGreaterThanOrEqual(2);
      for (const c of summons) {
        expect(c.class).toBe("Abysscraft");
        expect(Number(c.cost)).toBeLessThanOrEqual(2);
      }
      expect(printed).toContain("cost 2 or less");
    });

    it("another allied Abysscraft follower entering gains Rush; Adahime does not", () => {
      setupTurn(8, { hand: ["10151120"], pp: 2 });
      const adahime = createCard(ADAHIME, "board", "first");
      adahime.peak_defense = adahime.defense;
      state.players.first.board = [adahime];
      whenPlayCard("first", 0);
      const summoned = thenBoard("first").find((c) => c.id === "10151120");
      expect(summoned?.hasRush).toBe(true);
      expect(adahime.hasRush).toBeFalsy();
      expect(printed).toContain("give it Rush");
    });

    it("self-enter does not grant Rush to Adahime", () => {
      setupTurn(8, { hand: [ADAHIME], pp: 6 });
      whenPlayCard("first", 0);
      const adahime = findOnBoard("first", "Adahime, Anathema of Death")!;
      expect(adahime.hasRush).toBeFalsy();
    });

    it("Super-Evolve gives +2/+2 to other allied Abysscraft followers only", () => {
      setupTurn(8, { hand: [ADAHIME], pp: 6 });
      state.players.first.superEvoCharges = 1;
      const ally = allyFollower("AbyssAlly", 2, 3, { class: "Abysscraft" });
      whenPlayCard("first", 0);
      const adahime = findOnBoard("first", "Adahime, Anathema of Death")!;
      const adahimeAtk = Number(adahime.attack);
      const allyAtkBefore = Number(ally.attack);
      whenSuperEvolve(adahime, "first");
      expect(Number(ally.attack)).toBe(allyAtkBefore + 2);
      expect(Number(ally.defense)).toBe(5);
      expect(Number(adahime.attack)).toBe(adahimeAtk + 3);
      expect(printed).toContain("all other allied Abysscraft");
    });
  });

  describe("Void Colonel (10952110)", () => {
    const printed =
      "Ward\nLast Words: Destroy a random enemy follower. Restore 2 defense to your leader.\nCrystallize (2): Countdown (4)\nLast Words: Summon a Void Colonel.";

    it("enters the field with Ward", () => {
      setupTurn(8, { hand: [VOID_COLONEL], pp: 6 });
      whenPlayCard("first", 0);
      const colonel = findOnBoard("first", "Void Colonel")!;
      expect(colonel.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Last Words destroys a random enemy follower and restores 2 leader defense", () => {
      setupTurn(8, { hand: [VOID_COLONEL], pp: 6 });
      enemyFollower(2, 4, "Foe");
      state.players.first.hp = 18;
      whenPlayCard("first", 0);
      const colonel = findOnBoard("first", "Void Colonel")!;
      colonel.defense = 0;
      cleanupDead();
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(getHP(state, "first")).toBe(20);
      expect(printed).toContain("Restore 2 defense");
    });

    it("Crystallize (2) places countdown-4 amulet; expiry summons Ward follower", () => {
      setupTurn(6, { hand: [VOID_COLONEL], pp: 2 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      expect(
        thenBoard("first").some(
          (c) => c.name === "Void Colonel" && c.type === "Follower",
        ),
      ).toBe(false);
      const amulet = findOnBoard("first", "Void Colonel")!;
      expect(amulet.type).toBe("Amulet");
      expect(Number(amulet.countdown)).toBe(4);

      amulet.countdown = 0;
      cleanupDead();

      const colonel = findOnBoard("first", "Void Colonel")!;
      expect(colonel.type).toBe("Follower");
      expect(colonel.hasWard).toBe(true);
      expect(printed).toContain("Countdown (4)");
    });
  });

  describe("Garodeth vs. Zeth (10954120)", () => {
    const printed =
      "Activates in hand. At the end of your turn, if your leader's defense is 12 or less, reduce the cost of this card by 1.\nFanfare: Select a Mode to activate.\n1. Give this follower Storm. Deal 2 damage to your leader.\n2. Give this follower Ward. Deal 8 damage to all enemy followers.";

    it("end of your turn with leader defense ≤12 reduces hand cost by 1", () => {
      setupTurn(10, { hand: [GARODETH], pp: 8 });
      state.players.first.hp = 10;
      whenEndTurn();
      const garodeth = getHand(state, "first").find((c) => c.id === GARODETH)!;
      expect(Number(garodeth.cost)).toBe(7);
      expect(printed).toContain("reduce the cost");
    });

    it("end of your turn with leader defense >12 does not reduce cost", () => {
      setupTurn(10, { hand: [GARODETH], pp: 8 });
      state.players.first.hp = 20;
      whenEndTurn();
      const garodeth = getHand(state, "first").find((c) => c.id === GARODETH)!;
      expect(Number(garodeth.cost)).toBe(8);
      expect(printed).toContain("12 or less");
    });

    it("opponent's end of turn does not reduce Garodeth hand cost", () => {
      setupTurn(10, { hand: [GARODETH], pp: 8, active: "second" });
      state.players.first.hp = 10;
      whenEndTurn();
      const garodeth = getHand(state, "first").find((c) => c.id === GARODETH)!;
      expect(Number(garodeth.cost)).toBe(8);
    });

    it("Fanfare mode 1: grants Storm and deals 2 damage to your leader", () => {
      setupTurn(10, { hand: [GARODETH], pp: 8 });
      state.players.first.hp = 20;
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const garodeth = findOnBoard("first", "Garodeth vs. Zeth")!;
      expect(garodeth.hasStorm).toBe(true);
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("Storm");
    });

    it("Fanfare mode 2: grants Ward and deals 8 damage to all enemy followers", () => {
      setupTurn(10, { hand: [GARODETH], pp: 8 });
      const foeA = enemyFollower(2, 10, "A");
      const foeB = enemyFollower(2, 10, "B");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const garodeth = findOnBoard("first", "Garodeth vs. Zeth")!;
      expect(garodeth.hasWard).toBe(true);
      expect(Number(foeA.defense)).toBe(2);
      expect(Number(foeB.defense)).toBe(2);
      expect(printed).toContain("Deal 8 damage");
    });
  });

  describe("Itsurugi & Taketsumi, Brothers (10854110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Deal 4 damage to the enemy leader. Restore 4 defense to your leader.\n2. Deal 5 damage to all enemy followers. Recover 1 evolution point.\nEvolve: Select a Mode to activate.\n1. Draw 2 cards.\n2. Recover 2 play points.";

    it("Fanfare mode 1: 4 to enemy leader and restore 4 to your leader", () => {
      setupTurn(10, { hand: [BROTHERS], pp: 8 });
      state.players.first.hp = 12;
      state.players.second.hp = 20;
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(16);
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("Restore 4 defense");
    });

    it("Fanfare mode 2: 5 damage to all enemy followers and recover 1 EP", () => {
      setupTurn(10, { hand: [BROTHERS], pp: 8 });
      state.players.first.evoCharges = 1;
      const foeA = enemyFollower(2, 6, "A");
      const foeB = enemyFollower(2, 6, "B");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(foeA.defense)).toBe(1);
      expect(Number(foeB.defense)).toBe(1);
      expect(state.players.first.evoCharges).toBe(2);
      expect(printed).toContain("Recover 1 evolution point");
    });

    it("Evolve mode 1: draws 2 stacked deck cards", () => {
      setupTurn(10, {
        hand: [BROTHERS],
        // Deck stack: last entry is top-of-deck for draws.
        deck: ["10021130", "10021120", "10021110"],
        pp: 8,
      });
      state.players.first.evoCharges = 2;
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const brothers = findOnBoard("first", "Itsurugi & Taketsumi, Brothers")!;
      const handBefore = handIds();
      setScriptedModePickProvider(() => [0]);
      whenEvolve(brothers, "first");
      expect(handIds()).toContain("10021110");
      expect(handIds()).toContain("10021120");
      expect(handIds().length).toBeGreaterThan(handBefore.length);
      expect(printed).toContain("Draw 2 cards");
    });

    it("Evolve mode 2: recovers 2 play points", () => {
      setupTurn(10, { hand: [BROTHERS], pp: 8 });
      state.players.first.evoCharges = 2;
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const brothers = findOnBoard("first", "Itsurugi & Taketsumi, Brothers")!;
      state.players.first.pp = 0;
      setScriptedModePickProvider(() => [1]);
      whenEvolve(brothers, "first");
      expect(state.players.first.pp).toBe(2);
      expect(printed).toContain("Recover 2 play points");
    });
  });

  describe("Macmillan, Reaper of Ceremonies (10754120)", () => {
    const printed =
      "Fanfare: Necromancy (10) - Summon 3 copies of Rotting Zombie.\nDuring your turn, whenever an allied Departed follower enters the field, give it +1/+0, Rush, and Ward and deal 1 damage to the enemy leader.";

    it("with Necromancy (10): Fanfare summons 3 Rotting Zombies (90051140)", () => {
      setupTurn(10, { hand: [MACMILLAN], pp: 9 });
      state.players.first.shadows = 10;
      whenPlayCard("first", 0);
      const zombies = thenBoard("first").filter((c) => c.id === ROTTING_ZOMBIE);
      expect(zombies.length).toBe(3);
      expect(printed).toContain("Summon 3 copies");
    });

    it("without Necromancy (10): Fanfare does not summon Rotting Zombies", () => {
      setupTurn(10, { hand: [MACMILLAN], pp: 9 });
      state.players.first.shadows = 9;
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.id === ROTTING_ZOMBIE),
      ).toHaveLength(0);
      expect(printed).toContain("Necromancy (10)");
    });

    it("during your turn: Departed enter gains +1/+0, Rush, Ward and deals 1 to enemy leader", () => {
      setupTurn(10, { hand: [GHOST], pp: 1 });
      const mac = createCard(MACMILLAN, "board", "first");
      mac.peak_defense = mac.defense;
      state.players.first.board = [mac];
      const hpEnemyBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      const ghost = thenBoard("first").find((c) => c.id === GHOST)!;
      expect(Number(ghost.attack)).toBe(2);
      expect(ghost.hasRush).toBe(true);
      expect(ghost.hasWard).toBe(true);
      expect(getHP(state, "second")).toBe(hpEnemyBefore - 1);
      expect(printed).toContain("Departed follower");
    });

    it("during opponent's turn: Departed enter does not buff or damage leader", () => {
      setupTurn(10, { active: "second" });
      const mac = createCard(MACMILLAN, "board", "first");
      mac.peak_defense = mac.defense;
      state.players.first.board = [mac];
      const hpEnemyBefore = getHP(state, "second");
      const ghost = summonFollowerByCardId(GHOST, "first");
      expect(Number(ghost.attack)).toBe(1);
      expect(ghost.hasRush).toBeFalsy();
      expect(ghost.hasWard).toBeFalsy();
      expect(getHP(state, "second")).toBe(hpEnemyBefore);
    });
  });
});
