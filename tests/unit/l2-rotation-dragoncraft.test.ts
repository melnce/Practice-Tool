/**
 * L2 real-card tests — rotation-legal Dragoncraft cards (45 cards).
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
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Cards under test
const EPHEMERAL_FOXFIRE = "10843310";
const STRIKE_DRAGONEWT = "10041310";
const CRESCENT_TUBE = "10441310";
const DRACONIC_PART_TIMER = "10742120";
const FRUITFISH = "10641120";
const MARI = "10441120";
const MAX_LOVE_BOMB = "10442310";
const SEARING_FIRENEWT = "10041110";
const SPIRIT_WADATSUMI = "10841130";
const SPRINGWELL_STEWARD = "10541110";
const BLADE_CRESTPETAL = "10541310";
const JOEL = "10441110";
const LAZING_FLAME = "10742310";
const MEG = "10443110";
const PARTING_JAWS = "10942310";
const YUBE = "10544120";
const APATHETIC_GAZE = "10741310";
const DECISIVE_SWORDMASTER = "10642110";
const DRACHE = "10844110";
const DRACONIC_BERSERKER = "10042110";
const GIDO = "10841110";
const ROAR_PROMINENCE = "10542310";
const BATTLEFORGED = "10042120";
const CAVE_DRAGON = "10941120";
const DRAGONEWT_PATHFINDER = "10743110";
const IZMIR = "10442110";
const PRIMAL_ABSORPTION = "10443310";
const REEF_LOLO = "10842110";
const ART_OF_DECAY = "10842310";
const AXE_DRAGONSLAYER = "10041120";
const GIADA = "10843110";
const IMPEDING_PUGILIST = "10643110";
const STORMY_SHAMISEN = "10541120";
const BEHEADING_BLADES = "10643310";
const BLACKFLAME_DELUGE = "10743310";
const GALLANT_GATEKEEPER = "10742110";
const RUINBRINGER = "10543110";
const SANDSTORM_WATCHDRAGON = "10841120";
const WILNAS = "10444110";
const DRAGONFOLK_BUTLER = "10942120";
const IRONMACE_DRAGOON = "10542110";
const MUGEN = "10442120";
const SPIKED_DRAGON = "10642120";
const WARRIOR_DEEP = "10041130";
const DRAGONS_VALE_ELDER = "10744120";

// Helpers / tokens
const VASTWING = "90041120";
const MEGALORCA = "90041130";
const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const DRAW_THIRD = "10021130";
const LIU_YANG = "10143120"; // 3-base-cost for Mari super-evolve
const COST2_FOLLOWER = "10641120"; // Fruitfish — 2-base-cost
const RESOLUTE = "10641110"; // discard fodder

const R2 = 2;
const R4 = 4;
const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const R15 = 15;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    maxPP?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    seed?: number;
  } = {},
) {
  const max = opts.maxPP ?? Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
    state.players.first.superEvoPoints = opts.superEvo;
  }
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

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function discardHandCard(player: "first" | "second", id: string): void {
  const card = getHand(state, player).find((c) => c.id === id);
  if (!card) throw new Error(`Card ${id} not in hand`);
  resolvePendingByUid(card.uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function boardCountById(
  id: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.id === id).length;
}

function crestNamed(name: string, player: "first" | "second" = "first") {
  return getCrests(state, player).find((c) => c.name === name);
}

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
}

function newHandCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
): CardInstance[] {
  const fresh = thenHand(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function enemyAmulet(name = "EnemySigil", extra: Record<string, unknown> = {}) {
  const c = createCard(
    { name, type: "Amulet", cost: 2, ...extra },
    "board",
    "second",
  );
  state.players.second.board.push(c);
  return c;
}

function gainYubeCrest(): CardInstance {
  setupTurn(R6, { hand: [YUBE, FILLER], pp: 3, evo: 2 });
  whenPlayCard("first", 0);
  const yube = findOnBoard("first", "Yube, Crestpetal")!;
  onEvolve(yube, "first", "normal", { spendPoint: true });
  discardHandCard("first", FILLER);
  return thenBoard("first").find((c) => c.id === MEGALORCA)!;
}

describe("L2 — Rotation Dragoncraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Ephemeral Foxfire (10843310)", () => {
    const printed =
      "Select an enemy follower on the field or the enemy leader and deal it 1 damage. Add an Ephemeral Foxfire to your deck. If you're in Overflow, draw a card.";

    it("deals 1 damage to selected enemy follower and adds Ephemeral Foxfire to deck", () => {
      setupTurn(R6, { hand: [EPHEMERAL_FOXFIRE], pp: 1, deck: [FILLER] });
      const foe = enemyFollower(1, 3, "Target");
      const deckBefore = deckIds().filter(
        (id) => id === EPHEMERAL_FOXFIRE,
      ).length;
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      expect(Number(foe.defense)).toBe(2);
      expect(deckIds().filter((id) => id === EPHEMERAL_FOXFIRE).length).toBe(
        deckBefore + 1,
      );
      expect(printed).toContain("Add an Ephemeral Foxfire");
    });

    it("can target enemy leader for 1 damage — printed: 'enemy follower or the enemy leader' (10843310)", () => {
      setupTurn(R6, { hand: [EPHEMERAL_FOXFIRE], pp: 1 });
      state.players.second.hp = 20;
      const foe = enemyFollower(1, 3, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid("leader");
      expect(getHP(state, "second")).toBe(19);
      expect(Number(foe.defense)).toBe(3);
    });

    it("without Overflow: does not draw a card", () => {
      setupTurn(R6, {
        hand: [EPHEMERAL_FOXFIRE],
        pp: 1,
        deck: [DRAW_TOP],
        maxPP: 6,
      });
      enemyFollower(1, 3, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(state.players.second.board[0].uid);
      expect(handIds()).not.toContain(DRAW_TOP);
    });

    it("with Overflow: draws stacked deck card", () => {
      setupTurn(R7, {
        hand: [EPHEMERAL_FOXFIRE],
        pp: 1,
        deck: [DRAW_TOP],
      });
      expect(isOverflow("first")).toBe(true);
      enemyFollower(1, 3, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(state.players.second.board[0].uid);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("Overflow");
    });
  });

  describe("Strike of the Dragonewt (10041310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 2 damage. If you're in Overflow, deal 4 damage instead.";

    it("without Overflow: deals 2 damage to selected follower; bystander untouched", () => {
      setupTurn(R6, { hand: [STRIKE_DRAGONEWT], pp: 1, maxPP: 6 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("with Overflow: deals 4 damage instead of 2", () => {
      setupTurn(R7, { hand: [STRIKE_DRAGONEWT], pp: 1 });
      expect(isOverflow("first")).toBe(true);
      const target = enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(1);
      expect(printed).toContain("deal 4 damage");
    });
  });

  describe("Crescent Tube Ride (10441310)", () => {
    const printed =
      "Gain Crest: Crescent Tube Ride (Countdown (4). At the end of your turn, give a random allied follower on the field +1/+1.)";

    it("gains Crest: Crescent Tube Ride with countdown 4", () => {
      setupTurn(R6, { hand: [CRESCENT_TUBE], pp: 2 });
      whenPlayCard("first", 0);
      const crest = crestNamed("Crescent Tube Ride");
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(4);
      expect(printed).toContain("Countdown (4)");
    });

    it("crest owner's EOT: gives one random allied follower +1/+1", () => {
      setupTurn(R6, { hand: [CRESCENT_TUBE], pp: 2 });
      whenPlayCard("first", 0);
      const allyA = allyFollower(2, 3, "AllyA");
      const allyB = allyFollower(2, 3, "AllyB");
      const before = Number(allyA.attack) + Number(allyB.attack);
      runEndOfTurnBoundary("first");
      const after = Number(allyA.attack) + Number(allyB.attack);
      expect(after - before).toBe(1);
    });

    it("crest does not buff on opponent's EOT", () => {
      setupTurn(R6, { hand: [CRESCENT_TUBE], pp: 2 });
      whenPlayCard("first", 0);
      const ally = allyFollower(2, 3, "Ally");
      const atkBefore = Number(ally.attack);
      runEndOfTurnBoundary("second");
      expect(Number(ally.attack)).toBe(atkBefore);
    });

    it("crest expires after four owner turn-starts; no EOT buff after expiry", () => {
      setupTurn(R6, { hand: [CRESCENT_TUBE], pp: 2 });
      whenPlayCard("first", 0);
      for (let i = 0; i < 4; i++) {
        whenEndTurn();
        whenEndTurn();
      }
      expect(crestNamed("Crescent Tube Ride")).toBeFalsy();
      const ally = allyFollower(2, 3, "Ally");
      const atkBefore = Number(ally.attack);
      runEndOfTurnBoundary("first");
      expect(Number(ally.attack)).toBe(atkBefore);
    });
  });

  describe("Draconic Part-Timer (10742120)", () => {
    const printed =
      "Fanfare: If you have 10 max play points, evolve this follower. / At the end of your turn, restore 1 defense to your leader. If this follower is evolved, restore 2 defense instead.";

    it("Fanfare at 10 max PP: evolves this follower", () => {
      setupTurn(R10, { hand: [DRACONIC_PART_TIMER], pp: 2 });
      whenPlayCard("first", 0);
      const part = findOnBoard("first", "Draconic Part-Timer")!;
      expect(part.hasEvolved || part.isEvolved).toBe(true);
    });

    it("Fanfare below 10 max PP: does not evolve", () => {
      setupTurn(R6, { hand: [DRACONIC_PART_TIMER], pp: 2 });
      whenPlayCard("first", 0);
      const part = findOnBoard("first", "Draconic Part-Timer")!;
      expect(part.hasEvolved || part.isEvolved).toBeFalsy();
    });

    it("owner's EOT unevolved: restores 1 leader defense", () => {
      setupTurn(R6, { hand: [DRACONIC_PART_TIMER], pp: 2, hp: 15 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(getHP(state, "first")).toBe(16);
    });

    it("owner's EOT evolved: restores 2 leader defense", () => {
      setupTurn(R10, { hand: [DRACONIC_PART_TIMER], pp: 2, hp: 15 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("restore 2");
    });

    it("opponent's EOT: does not restore leader defense", () => {
      setupTurn(R10, { hand: [DRACONIC_PART_TIMER], pp: 2, hp: 15 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      expect(getHP(state, "first")).toBe(15);
    });
  });

  describe("Fruitfish (10641120)", () => {
    const printed =
      "Enhance (6): Summon 2 copies of Fruitfish. / Last Words: Restore 1 defense to your leader.";

    it("without Enhance(6): summons exactly one Fruitfish on board", () => {
      setupTurn(R6, { hand: [FRUITFISH], pp: 2 });
      whenPlayCard("first", 0);
      expect(boardCountById(FRUITFISH)).toBe(1);
    });

    it("Enhance(6): summons exactly 2 additional copies (3 total)", () => {
      setupTurn(R6, { hand: [FRUITFISH], pp: 6 });
      whenPlayCard("first", 0);
      expect(boardCountById(FRUITFISH)).toBe(3);
      expect(printed).toContain("Summon 2 copies");
    });

    it("Last Words: restores 1 leader defense", () => {
      setupTurn(R6);
      state.players.first.hp = 14;
      const fish = createCard(FRUITFISH, "board", "first");
      fish.peak_defense = fish.defense;
      fish.defense = 0;
      state.players.first.board = [fish];
      cleanupDead();
      expect(getHP(state, "first")).toBe(15);
    });
  });

  describe("Mari, Meg's Bestie (10441120)", () => {
    const printed =
      "Activates in hand. Whenever a 3-base-cost allied follower super-evolves, set the cost of this card to 0 until the end of the turn. / At the end of your turn, give a random super-evolved allied follower on the field +1/+1.";

    it("3-base-cost ally super-evolve sets Mari cost to 0 until EOT", () => {
      setupTurn(R7, { hand: [MARI, LIU_YANG], evo: 2, superEvo: 2 });
      const liu = createCard(LIU_YANG, "board", "first");
      liu.peak_defense = liu.defense;
      state.players.first.board = [liu];
      const mari = getHand(state, "first").find((c) => c.id === MARI)!;
      expect(getEffectiveCost(mari)).toBe(2);
      onEvolve(liu, "first", "super");
      expect(getEffectiveCost(mari)).toBe(0);
    });

    it("non-3-base-cost super-evolve does not zero Mari cost", () => {
      setupTurn(R7, { hand: [MARI, DRACONIC_BERSERKER], evo: 2, superEvo: 2 });
      const berserker = createCard(DRACONIC_BERSERKER, "board", "first");
      berserker.peak_defense = berserker.defense;
      state.players.first.board = [berserker];
      const mari = getHand(state, "first").find((c) => c.id === MARI)!;
      onEvolve(berserker, "first", "super");
      expect(getEffectiveCost(mari)).toBe(2);
    });

    it("owner's EOT: +1/+1 to super-evolved ally only (seed 2)", () => {
      givenGameState({ seed: 2, activePlayer: "first", roundCount: 7 }).build();
      state.gameStarted = true;
      const superGuy = createCard(DRACONIC_BERSERKER, "board", "first");
      superGuy.peak_defense = superGuy.defense;
      onEvolve(superGuy, "first", "super");
      const plain = createCard(
        { name: "Plain", type: "Follower", cost: 1, attack: 1, defense: 1 },
        "board",
        "first",
      );
      const mari = createCard(MARI, "board", "first");
      state.players.first.board = [superGuy, plain, mari];
      const beforeSuper = {
        atk: Number(superGuy.attack),
        def: Number(superGuy.defense),
      };
      const plainAtk = Number(plain.attack);
      const eot = (mari.triggers as any[]).find(
        (t) => t.event === "end_of_turn",
      );
      runEffects(eot.effects, "first", mari);
      expect(Number(superGuy.attack)).toBe(beforeSuper.atk + 1);
      expect(Number(superGuy.defense)).toBe(beforeSuper.def + 1);
      expect(Number(plain.attack)).toBe(plainAtk);
      expect(printed).toContain("super-evolved");
    });

    it("opponent's EOT: does not give super-evolved ally +1/+1", () => {
      givenGameState({ seed: 2, activePlayer: "first", roundCount: 7 }).build();
      state.gameStarted = true;
      const superGuy = createCard(DRACONIC_BERSERKER, "board", "first");
      superGuy.peak_defense = superGuy.defense;
      onEvolve(superGuy, "first", "super");
      createCard(MARI, "board", "first");
      const before = {
        atk: Number(superGuy.attack),
        def: Number(superGuy.defense),
      };
      runEndOfTurnBoundary("second");
      expect(Number(superGuy.attack)).toBe(before.atk);
      expect(Number(superGuy.defense)).toBe(before.def);
    });
  });

  describe("Maximum Love Bomb (10442310)", () => {
    const printed =
      "Select an enemy follower on the field, deal it 3 damage, and give it \"Can't attack followers or leaders\" until the end of your opponent's turn.";

    it("deals 3 damage and applies can't attack until opponent EOT", () => {
      setupTurn(R6, { hand: [MAX_LOVE_BOMB], pp: 2 });
      const foe = enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      expect(Number(foe.defense)).toBe(2);
      expect(foe.keywordState?.cantAttack).toBe(true);
      expect(foe.keywordState?.cantAttackUntilOpponentEOT).toBe(true);
      expect(printed).toContain("Can't attack");
    });
  });

  describe("Searing Firenewt (10041110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 1 damage.";

    it("Fanfare deals 1 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [SEARING_FIRENEWT], pp: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(5);
    });
  });

  describe("Spirit of Wadatsumi (10841130)", () => {
    const printed =
      "Fanfare: Add a Majestic Megalorca to your hand. / Evolve: Gain Crest: Spirit of Wadatsumi. // Special Effects: Whenever an allied Marine follower enters the field, give it +1/+1.";

    it("Fanfare adds Majestic Megalorca (90041130) to hand", () => {
      setupTurn(R6, { hand: [SPIRIT_WADATSUMI], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(MEGALORCA);
    });

    it("Evolve gains Crest: Spirit of Wadatsumi", () => {
      setupTurn(R6, { hand: [SPIRIT_WADATSUMI], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const spirit = findOnBoard("first", "Spirit of Wadatsumi")!;
      onEvolve(spirit, "first", "normal", { spendPoint: true });
      expect(crestNamed("Spirit of Wadatsumi")).toBeTruthy();
    });

    it("crest: Marine ally enter gains +1/+1 via summon path; non-Marine does not", () => {
      setupTurn(R6, { hand: [SPIRIT_WADATSUMI], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const spirit = findOnBoard("first", "Spirit of Wadatsumi")!;
      onEvolve(spirit, "first", "normal", { spendPoint: true });
      summonNamed(
        { op: "summon", source: "named", name: "Majestic Megalorca", count: 1 },
        "first",
      );
      const marine = thenBoard("first").find((c) => c.id === MEGALORCA)!;
      expect(Number(marine.attack)).toBe(3);
      expect(Number(marine.defense)).toBe(3);

      const plain = allyFollower(2, 2, "Plain");
      const plainAtk = Number(plain.attack);
      fireTrigger("ally_follower_enter", "first", {
        enteringCard: plain,
        enteringOwner: "first",
      });
      expect(Number(plain.attack)).toBe(plainAtk);
      expect(printed).toContain("Marine");
    });
  });

  describe("Springwell Steward (10541110)", () => {
    const printed =
      "Evolve: Select an enemy follower on the field and deal it 5 damage. / Super-Evolve: Select 2 instead.";

    it("Evolve deals 5 to one selected enemy; bystander untouched", () => {
      setupTurn(R7, { hand: [SPRINGWELL_STEWARD], pp: 2, evo: 2 });
      const e1 = enemyFollower(1, 6, "E1");
      const e2 = enemyFollower(1, 6, "E2");
      whenPlayCard("first", 0);
      const steward = findOnBoard("first", "Springwell Steward")!;
      onEvolve(steward, "first", "normal", { spendPoint: true });
      resolvePendingByUid(e1.uid);
      expect(Number(e1.defense)).toBe(1);
      expect(Number(e2.defense)).toBe(6);
    });

    it("Super-Evolve deals 5 to two selected enemies", () => {
      setupTurn(R7, {
        hand: [SPRINGWELL_STEWARD],
        pp: 2,
        evo: 2,
        superEvo: 1,
      });
      const e1 = enemyFollower(1, 6, "E1");
      const e2 = enemyFollower(1, 6, "E2");
      whenPlayCard("first", 0);
      const steward = findOnBoard("first", "Springwell Steward")!;
      onEvolve(steward, "first", "super", { spendPoint: true });
      resolvePendingByUid(e1.uid);
      resolvePendingByUid(e2.uid);
      expect(Number(e1.defense)).toBe(1);
      expect(Number(e2.defense)).toBe(1);
      expect(printed).toContain("Select 2");
    });
  });

  describe("Blade of the Crestpetal (10541310)", () => {
    const printed =
      "Draw a follower. Deal X damage to a random enemy follower. X is the cost of the card you drew.";

    it("draws stacked follower and deals damage equal to its cost (seed 1)", () => {
      setupTurn(R6, {
        hand: [BLADE_CRESTPETAL],
        deck: [DRAW_SECOND, BATTLEFORGED],
        pp: 3,
      });
      const foe = enemyFollower(1, 10, "Foe");
      whenPlayCard("first", 0);
      expect(handIds()).toContain(BATTLEFORGED);
      expect(Number(foe.defense)).toBe(5);
      expect(printed).toContain("cost of the card you drew");
    });
  });

  describe("Joel, Wave Chaser (10441110)", () => {
    const printed = "Ward. / Aura.";

    it("enters with Ward and Aura", () => {
      setupTurn(R6, { hand: [JOEL], pp: 3 });
      whenPlayCard("first", 0);
      const joel = findOnBoard("first", "Joel, Wave Chaser")!;
      applyKeywordsFromList(joel);
      expect(joel.hasWard || joel.keywordState?.hasWard).toBe(true);
      expect(joel.hasAura || joel.keywordState?.hasAura).toBe(true);
    });
  });

  describe("Lazing Flame (10742310)", () => {
    const printed =
      "Restore 3 defense to your leader. If you're in Overflow, draw a card.";

    it("without Overflow: restores 3 HP, does not draw stacked card", () => {
      setupTurn(R6, {
        hand: [LAZING_FLAME],
        deck: [DRAW_TOP],
        pp: 3,
        hp: 14,
        maxPP: 6,
      });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(17);
      expect(handIds()).not.toContain(DRAW_TOP);
    });

    it("with Overflow: restores 3 HP and draws stacked card", () => {
      setupTurn(R7, {
        hand: [LAZING_FLAME],
        deck: [DRAW_TOP],
        pp: 3,
        hp: 14,
      });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(17);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("Overflow");
    });
  });

  describe("Meg, Girl Next Door (10443110)", () => {
    const printed =
      "Fanfare: Skybound Art- Super-evolve this follower. / Whenever a 2-base-cost allied follower enters the field, give this follower Ward.";

    it("Skybound Art(10): super-evolves on Fanfare", () => {
      setupTurn(R10, { hand: [MEG], pp: 3 });
      const megHand = getHand(state, "first").find((c) => c.id === MEG)!;
      megHand.skyboundArtEvolvesWitnessed = 0;
      whenPlayCard("first", 0);
      const meg = findOnBoard("first", "Meg, Girl Next Door")!;
      expect(meg.evoType).toBe("super");
    });

    it("below Skybound Art(10): does not super-evolve on Fanfare", () => {
      setupTurn(R5, { hand: [MEG], pp: 3 });
      const megHand = getHand(state, "first").find((c) => c.id === MEG)!;
      megHand.skyboundArtEvolvesWitnessed = 0;
      whenPlayCard("first", 0);
      const meg = findOnBoard("first", "Meg, Girl Next Door")!;
      expect(meg.evoType).not.toBe("super");
      expect(meg.hasEvolved || meg.isEvolved).toBeFalsy();
    });

    it("2-base-cost ally enter grants Ward; other costs do not", () => {
      setupTurn(R6, { hand: [MEG], pp: 3 });
      whenPlayCard("first", 0);
      const meg = findOnBoard("first", "Meg, Girl Next Door")!;
      const cost2 = createCard(COST2_FOLLOWER, "board", "first");
      cost2.peak_defense = cost2.defense;
      fireTrigger("ally_follower_enter", "first", {
        enteringCard: cost2,
        enteringOwner: "first",
      });
      expect(meg.hasWard || meg.keywordState?.hasWard).toBe(true);

      const cost3 = createCard(MEG, "board", "first");
      cost3.peak_defense = cost3.defense;
      const hadWard = meg.hasWard || meg.keywordState?.hasWard;
      fireTrigger("ally_follower_enter", "first", {
        enteringCard: cost3,
        enteringOwner: "first",
      });
      expect(meg.hasWard || meg.keywordState?.hasWard).toBe(hadWard);
      expect(printed).toContain("2-base-cost");
    });
  });

  describe("Parting Jaws (10942310)", () => {
    const printed =
      "Select 2 cards in your hand and discard them. Deal 3 damage to a random enemy follower and the enemy leader.";

    it("discards 2 selected cards; deals 3 to enemy leader and random follower", () => {
      setupTurn(R6, {
        hand: [PARTING_JAWS, FILLER, DRAW_TOP],
        pp: 3,
      });
      const foe = enemyFollower(2, 5, "Foe");
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      discardHandCard("first", DRAW_TOP);
      expect(handIds()).not.toContain(FILLER);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(getHP(state, "second")).toBe(hpBefore - 3);
      expect(Number(foe.defense)).toBe(2);
    });
  });

  describe("Yube, Crestpetal (10544120)", () => {
    const printed =
      "Fanfare: Summon a Majestic Megalorca. / Evolve: Select a card in your hand and discard it. Gain Crest: Yube, Crestpetal. // Special Effects: Whenever an allied Marine follower attacks, give it +1/+0 until the end of the turn and, once on each of your turns, add a Majestic Megalorca to your hand.";

    it("Fanfare summons exactly one Majestic Megalorca", () => {
      setupTurn(R6, { hand: [YUBE], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      expect(boardCountById(MEGALORCA)).toBe(1);
    });

    it("Evolve discards selected card and gains Crest: Yube, Crestpetal", () => {
      setupTurn(R6, { hand: [YUBE, FILLER], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const yube = findOnBoard("first", "Yube, Crestpetal")!;
      onEvolve(yube, "first", "normal", { spendPoint: true });
      discardHandCard("first", FILLER);
      expect(handIds()).not.toContain(FILLER);
      expect(crestNamed("Yube, Crestpetal")).toBeTruthy();
    });

    it("crest: Marine attack grants +1/+0 until EOT; clears after owner's EOT", () => {
      setupTurn(R6, { hand: [YUBE, FILLER], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const yube = findOnBoard("first", "Yube, Crestpetal")!;
      onEvolve(yube, "first", "normal", { spendPoint: true });
      discardHandCard("first", FILLER);
      const marine = createCard(MEGALORCA, "board", "first");
      marine.tribes = ["Marine"];
      marine.can_attack = true;
      marine.attacks_left = 1;
      marine.justPlayed = false;
      marine.hasStorm = true;
      marine.peak_defense = marine.defense;
      state.players.first.board.push(marine);
      enemyFollower(0, 10, "Wall");
      const atkBefore = Number(marine.attack);
      attackFollower(
        state.players.first.board.indexOf(marine),
        0,
        "first",
        "second",
      );
      expect(Number(marine.attack)).toBe(atkBefore + 1);
      whenEndTurn();
      expect(Number(marine.attack)).toBe(atkBefore);
      expect(printed).toContain("+1/+0");
    });

    it("crest: first Marine attack per turn adds exactly one Megalorca; second same turn adds none; next owner turn adds one again", () => {
      const marine = gainYubeCrest();
      marine.can_attack = true;
      marine.attacks_left = 2;
      marine.justPlayed = false;
      marine.hasStorm = true;
      const uidsBefore = handUids();
      enemyFollower(0, 10, "W1");
      enemyFollower(0, 10, "W2");
      attackFollower(
        state.players.first.board.indexOf(marine),
        0,
        "first",
        "second",
      );
      expect(newHandCards(uidsBefore, "first", MEGALORCA)).toHaveLength(1);
      const uidsMid = handUids();
      attackFollower(
        state.players.first.board.indexOf(marine),
        0,
        "first",
        "second",
      );
      expect(newHandCards(uidsMid, "first", MEGALORCA)).toHaveLength(0);
      whenEndTurn();
      whenEndTurn();
      const uidsNextTurn = handUids();
      marine.can_attack = true;
      marine.attacks_left = 1;
      enemyFollower(0, 10, "W3");
      attackFollower(
        state.players.first.board.indexOf(marine),
        0,
        "first",
        "second",
      );
      expect(newHandCards(uidsNextTurn, "first", MEGALORCA)).toHaveLength(1);
      expect(printed).toContain("once on each of your turns");
    });

    it("crest: non-Marine attacker gets neither +1/+0 nor Megalorca", () => {
      gainYubeCrest();
      const plain = allyFollower(2, 2, "Plain");
      plain.can_attack = true;
      plain.justPlayed = false;
      plain.attacks_left = 1;
      plain.hasStorm = true;
      const uidsBefore = handUids();
      const atkBefore = Number(plain.attack);
      enemyFollower(0, 10, "Wall");
      attackFollower(
        state.players.first.board.indexOf(plain),
        0,
        "first",
        "second",
      );
      expect(Number(plain.attack)).toBe(atkBefore);
      expect(newHandCards(uidsBefore, "first", MEGALORCA)).toHaveLength(0);
    });
  });

  describe("Apathetic Gaze (10741310)", () => {
    const printed =
      "Gain 1 max play point. Transform all copies of Apathetic Gaze in your hand and deck into copies of Lazing Flame.";

    it("gains 1 max PP and transforms hand/deck Apathetic Gaze into Lazing Flame", () => {
      setupTurn(R6, {
        hand: [APATHETIC_GAZE, APATHETIC_GAZE],
        deck: [APATHETIC_GAZE, FILLER],
        pp: 4,
      });
      const maxBefore = state.players.first.maxPP;
      whenPlayCard("first", 0);
      expect(state.players.first.maxPP).toBe(maxBefore + 1);
      expect(handIds().every((id) => id !== APATHETIC_GAZE)).toBe(true);
      expect(handIds().some((id) => id === LAZING_FLAME)).toBe(true);
      expect(deckIds().some((id) => id === LAZING_FLAME)).toBe(true);
      expect(deckIds()).toContain(FILLER);
    });
  });

  describe("Decisive Swordmaster (10642110)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it.\nRush\nBarrier";

    it("Fanfare discards selected card", () => {
      setupTurn(R6, { hand: [DECISIVE_SWORDMASTER, FILLER], pp: 4 });
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      expect(handIds()).not.toContain(FILLER);
    });

    it("enters with Rush and Barrier", () => {
      setupTurn(R6, { hand: [DECISIVE_SWORDMASTER, FILLER], pp: 4 });
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      const sword = findOnBoard("first", "Decisive Swordmaster")!;
      applyKeywordsFromList(sword);
      expect(sword.hasRush || sword.keywordState?.hasRush).toBe(true);
      expect(sword.hasBarrier || sword.keywordState?.hasBarrier).toBe(true);
    });
  });

  describe("Drache & Aluzard, Burning Blood (10844110)", () => {
    const printed =
      "Fanfare: Give this follower +X/+X. If X is at least 2, evolve this follower. X is the number of other allied copies of Drache & Aluzard, Burning Blood that have entered the field this match.\nWard\nLast Words: Gain Crest: Drache & Aluzard, Burning Blood.";

    it("first play (X=0): 4/4 unevolved; second play (X=1): 5/5 unevolved", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
        .withFirstPP(20, 20)
        .withFirstHand([DRACHE])
        .build();
      state.gameStarted = true;
      whenPlayCard("first", 0);
      const first = findOnBoard("first", "Drache & Aluzard, Burning Blood")!;
      expect(Number(first.attack)).toBe(4);
      expect(Number(first.defense)).toBe(4);
      expect(first.hasEvolved || first.isEvolved).toBeFalsy();
      state.players.first.board = [];

      state.players.first.hand.push(createCard(DRACHE, "hand", "first"));
      whenPlayCard("first", 0);
      const second = findOnBoard("first", "Drache & Aluzard, Burning Blood")!;
      expect(Number(second.attack)).toBe(5);
      expect(Number(second.defense)).toBe(5);
    });

    it("third play (X=2): 8/8 and auto-evolves", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
        .withFirstPP(20, 20)
        .withFirstHand([DRACHE, DRACHE, DRACHE])
        .build();
      state.gameStarted = true;
      whenPlayCard("first", 0);
      state.players.first.board = [];
      whenPlayCard("first", 0);
      state.players.first.board = [];
      whenPlayCard("first", 0);
      const third = findOnBoard("first", "Drache & Aluzard, Burning Blood")!;
      expect(Number(third.attack)).toBe(8);
      expect(Number(third.defense)).toBe(8);
      expect(third.hasEvolved || third.isEvolved).toBe(true);
    });

    it("enters with Ward; Last Words gains crest with countdown 2", () => {
      setupTurn(R8, { hand: [DRACHE], pp: 4 });
      whenPlayCard("first", 0);
      const drache = findOnBoard("first", "Drache & Aluzard, Burning Blood")!;
      applyKeywordsFromList(drache);
      expect(drache.hasWard || drache.keywordState?.hasWard).toBe(true);
      drache.defense = 0;
      cleanupDead();
      const crest = crestNamed("Drache & Aluzard, Burning Blood");
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(2);
      expect(printed).toContain("Last Words");
    });

    const crestPrinted =
      "Countdown (2)\nLast Words: Add a Drache & Aluzard, Burning Blood to your hand and set its cost to 2.";

    it("crest Countdown (2): after two owner turn-starts LW adds Drache at cost 2 by uid; no copy before expiry; opponent turn-starts do not tick", () => {
      setupTurn(R8, { hand: [DRACHE], pp: 4 });
      whenPlayCard("first", 0);
      const drache = findOnBoard("first", "Drache & Aluzard, Burning Blood")!;
      drache.defense = 0;
      cleanupDead();
      const uidsAtGain = handUids();
      expect(crestNamed("Drache & Aluzard, Burning Blood")).toBeTruthy();
      expect(newHandCards(uidsAtGain, "first", DRACHE)).toHaveLength(0);

      whenEndTurn();
      expect(crestNamed("Drache & Aluzard, Burning Blood")).toBeTruthy();
      expect(
        Number(crestNamed("Drache & Aluzard, Burning Blood")!.countdown),
      ).toBe(2);
      expect(newHandCards(uidsAtGain, "first", DRACHE)).toHaveLength(0);

      whenEndTurn();
      expect(crestNamed("Drache & Aluzard, Burning Blood")).toBeTruthy();
      expect(
        Number(crestNamed("Drache & Aluzard, Burning Blood")!.countdown),
      ).toBe(1);
      expect(newHandCards(uidsAtGain, "first", DRACHE)).toHaveLength(0);

      whenEndTurn();
      whenEndTurn();
      expect(crestNamed("Drache & Aluzard, Burning Blood")).toBeFalsy();
      const added = newHandCards(uidsAtGain, "first", DRACHE);
      expect(added).toHaveLength(1);
      expect(getEffectiveCost(added[0]!)).toBe(2);
      expect(crestPrinted).toContain("set its cost to 2");
    });
  });

  describe("Draconic Berserker (10042110)", () => {
    const printed =
      "Evolve: Select an enemy follower on the field and deal it 4 damage. / Super-Evolve: Deal damage to all enemy followers instead.";

    it("Evolve deals 4 to one selected enemy; bystander on enemy side untouched until super", () => {
      setupTurn(R6, { evo: 2 });
      const berserker = createCard(DRACONIC_BERSERKER, "board", "first");
      berserker.peak_defense = berserker.defense;
      const e1 = enemyFollower(2, 6, "E1");
      const e2 = enemyFollower(2, 6, "E2");
      state.players.first.board = [berserker];
      onEvolve(berserker, "first", "normal", { spendPoint: true });
      resolvePendingByUid(e1.uid);
      expect(Number(e1.defense)).toBe(2);
      expect(Number(e2.defense)).toBe(6);
    });

    it("Super-Evolve deals 4 to all enemy followers (not single-target evolve)", () => {
      setupTurn(R6, { evo: 2, superEvo: 1 });
      const berserker = createCard(DRACONIC_BERSERKER, "board", "first");
      berserker.peak_defense = berserker.defense;
      const e1 = enemyFollower(2, 6, "E1");
      const e2 = enemyFollower(2, 6, "E2");
      state.players.first.board = [berserker];
      onEvolve(berserker, "first", "super", { spendPoint: true });
      expect(Number(e1.defense)).toBe(2);
      expect(Number(e2.defense)).toBe(2);
      expect(printed).toContain("all enemy followers");
    });
  });

  describe("Gido, Leader of the Pack (10841110)", () => {
    const printed =
      "Fanfare: If your leader's defense is 10 or less, evolve this follower.\nBane\nWard";

    it("Fanfare at leader HP 10 or less: evolves", () => {
      setupTurn(R6, { hand: [GIDO], pp: 4, hp: 10 });
      whenPlayCard("first", 0);
      const gido = findOnBoard("first", "Gido, Leader of the Pack")!;
      expect(gido.hasEvolved || gido.isEvolved).toBe(true);
    });

    it("Fanfare above 10 leader HP: does not evolve", () => {
      setupTurn(R6, { hand: [GIDO], pp: 4, hp: 11 });
      whenPlayCard("first", 0);
      const gido = findOnBoard("first", "Gido, Leader of the Pack")!;
      expect(gido.hasEvolved || gido.isEvolved).toBeFalsy();
    });

    it("enters with Bane and Ward", () => {
      setupTurn(R6, { hand: [GIDO], pp: 4, hp: 20 });
      whenPlayCard("first", 0);
      const gido = findOnBoard("first", "Gido, Leader of the Pack")!;
      applyKeywordsFromList(gido);
      expect(gido.hasBane || gido.keywordState?.hasBane).toBe(true);
      expect(gido.hasWard || gido.keywordState?.hasWard).toBe(true);
    });
  });

  describe("Roar of Prominence (10542310)", () => {
    const printed =
      "Deal X damage to all followers. X is the number of followers on the field.";

    it("deals damage equal to total follower count on both sides", () => {
      setupTurn(R6, { hand: [ROAR_PROMINENCE], pp: 4 });
      const ally = allyFollower(2, 4, "Ally");
      const foeA = enemyFollower(2, 4, "FoeA");
      const foeB = enemyFollower(2, 4, "FoeB");
      whenPlayCard("first", 0);
      expect(Number(ally.defense)).toBe(1);
      expect(Number(foeA.defense)).toBe(1);
      expect(Number(foeB.defense)).toBe(1);
      expect(printed).toContain("all followers");
    });
  });

  describe("Battleforged Dragon Keeper (10042120)", () => {
    const printed = "Enhance (7): Summon a Vastwing Dragon.";

    it("without Enhance(7): plays as follower only, no Vastwing", () => {
      setupTurn(R6, { hand: [BATTLEFORGED], pp: 5 });
      whenPlayCard("first", 0);
      expect(boardCountById(BATTLEFORGED)).toBe(1);
      expect(boardCountById(VASTWING)).toBe(0);
    });

    it("Enhance(7): summons exactly one Vastwing Dragon", () => {
      setupTurn(R7, { hand: [BATTLEFORGED], pp: 7 });
      whenPlayCard("first", 0);
      expect(boardCountById(VASTWING)).toBe(1);
      expect(printed).toContain("Vastwing Dragon");
    });
  });

  describe("Cave Dragon (10941120)", () => {
    const printed =
      "Fanfare: If you're in Overflow, evolve this follower. / Ambush";

    it("without Overflow: does not evolve on Fanfare", () => {
      setupTurn(R6, { hand: [CAVE_DRAGON], pp: 5, maxPP: 6 });
      whenPlayCard("first", 0);
      const cave = findOnBoard("first", "Cave Dragon")!;
      expect(cave.hasEvolved || cave.isEvolved).toBeFalsy();
    });

    it("with Overflow: evolves on Fanfare", () => {
      setupTurn(R7, { hand: [CAVE_DRAGON], pp: 5 });
      expect(isOverflow("first")).toBe(true);
      whenPlayCard("first", 0);
      const cave = findOnBoard("first", "Cave Dragon")!;
      expect(cave.hasEvolved || cave.isEvolved).toBe(true);
    });

    it("enters with Ambush", () => {
      setupTurn(R6, { hand: [CAVE_DRAGON], pp: 5, maxPP: 6 });
      whenPlayCard("first", 0);
      const cave = findOnBoard("first", "Cave Dragon")!;
      applyKeywordsFromList(cave);
      expect(cave.hasAmbush || cave.keywordState?.hasAmbush).toBe(true);
    });
  });

  describe("Dragonewt Pathfinder (10743110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate. Destroy a random enemy follower with the highest attack.\n1. Evolve this follower.\n2. Give this follower Ambush.";

    it("mode 1: destroys highest-attack enemy and evolves self", () => {
      setupTurn(R6, { hand: [DRAGONEWT_PATHFINDER], pp: 5 });
      const low = enemyFollower(2, 5, "Low");
      const high = enemyFollower(5, 5, "High");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(findOnBoard("second", "High")).toBeUndefined();
      expect(findOnBoard("second", "Low")).toBeTruthy();
      const path = findOnBoard("first", "Dragonewt Pathfinder")!;
      expect(path.hasEvolved || path.isEvolved).toBe(true);
    });

    it("mode 2: destroys highest-attack enemy and grants Ambush", () => {
      setupTurn(R6, { hand: [DRAGONEWT_PATHFINDER], pp: 5 });
      enemyFollower(5, 5, "High");
      enemyFollower(2, 5, "Low");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const path = findOnBoard("first", "Dragonewt Pathfinder")!;
      applyKeywordsFromList(path);
      expect(path.hasAmbush || path.keywordState?.hasAmbush).toBe(true);
      expect(path.hasEvolved || path.isEvolved).toBeFalsy();
      expect(printed).toContain("Ambush");
    });
  });

  describe("Izmir, Frigid Fate (10442110)", () => {
    const printed =
      "Fanfare: If you have 10 max play points, evolve this follower. / When this follower evolves, deal 3 damage to all enemy followers.";

    it("at 10 max PP Fanfare: auto-evolves and deals 3 to all enemy followers", () => {
      setupTurn(R10, { hand: [IZMIR], pp: 5 });
      const foe = enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      const iz = findOnBoard("first", "Izmir, Frigid Fate")!;
      expect(iz.hasEvolved || iz.isEvolved).toBe(true);
      expect(Number(foe.defense)).toBe(2);
    });

    it("below 10 max PP: does not auto-evolve on Fanfare", () => {
      setupTurn(R6, { hand: [IZMIR], pp: 5 });
      whenPlayCard("first", 0);
      const iz = findOnBoard("first", "Izmir, Frigid Fate")!;
      expect(iz.hasEvolved || iz.isEvolved).toBeFalsy();
    });

    it("manual evolve deals 3 damage to all enemy followers", () => {
      setupTurn(R6, { hand: [IZMIR], pp: 5, evo: 2 });
      const foe = enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      const iz = findOnBoard("first", "Izmir, Frigid Fate")!;
      onEvolve(iz, "first", "normal", { spendPoint: true });
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("deal 3 damage");
    });
  });

  describe("Primal Beast Absorption (10443310)", () => {
    const printed =
      "Select an enemy card on the field, banish it, and add a copy of it to your hand.";

    it("banishes selected enemy (Last Words do not fire) and adds copy to hand", () => {
      setupTurn(R6, { hand: [PRIMAL_ABSORPTION], pp: 5 });
      const lw = enemyFollower(2, 4, "LWVictim");
      lw.hasLastWords = true;
      lw.lastWordsEffects = [
        { op: "summon", source: "named", name: "Fairy", count: 1 },
      ];
      state.players.second.shadows = 0;
      whenPlayCard("first", 0);
      resolvePendingByUid(lw.uid);
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(getGraveyard(state, "second").some((c) => c.uid === lw.uid)).toBe(
        false,
      );
      expect(getBanish(state, "second").some((c) => c.uid === lw.uid)).toBe(
        true,
      );
      expect(thenHand("first").some((c) => c.name === "LWVictim")).toBe(true);
      expect(printed).toContain("banish");
    });

    it("banishes selected enemy amulet (Last Words do not fire) and adds copy to hand by name", () => {
      setupTurn(R6, { hand: [PRIMAL_ABSORPTION], pp: 5 });
      const amulet = enemyAmulet("SigilOfDoom", {
        hasLastWords: true,
        lastWordsEffects: [
          { op: "summon", source: "named", name: "Fairy", count: 1 },
        ],
      });
      state.players.second.shadows = 0;
      whenPlayCard("first", 0);
      resolvePendingByUid(amulet.uid);
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(
        getGraveyard(state, "second").some((c) => c.uid === amulet.uid),
      ).toBe(false);
      expect(getBanish(state, "second").some((c) => c.uid === amulet.uid)).toBe(
        true,
      );
      expect(thenHand("first").some((c) => c.name === "SigilOfDoom")).toBe(
        true,
      );
      expect(getBoard(state, "second").some((c) => c.name === "Fairy")).toBe(
        false,
      );
    });
  });

  describe("Reef & Lolo, Serene Sirens (10842110)", () => {
    const printed =
      "Fanfare: Summon a Reef & Lolo, Serene Sirens. / Rush / At the end of your turn, add a Majestic Megalorca to your hand.";

    it("Fanfare summons exactly one copy of itself", () => {
      setupTurn(R6, { hand: [REEF_LOLO], pp: 5 });
      whenPlayCard("first", 0);
      expect(boardCountById(REEF_LOLO)).toBe(2);
    });

    it("enters with Rush", () => {
      setupTurn(R6, { hand: [REEF_LOLO], pp: 5 });
      whenPlayCard("first", 0);
      const reef = thenBoard("first").find((c) => c.id === REEF_LOLO)!;
      applyKeywordsFromList(reef);
      expect(reef.hasRush || reef.keywordState?.hasRush).toBe(true);
    });

    it("owner's EOT adds Majestic Megalorca to hand", () => {
      setupTurn(R6, { hand: [REEF_LOLO], pp: 5 });
      whenPlayCard("first", 0);
      const handBefore = handIds().filter((id) => id === MEGALORCA).length;
      runEndOfTurnBoundary("first");
      expect(handIds().filter((id) => id === MEGALORCA).length).toBe(
        handBefore + 2,
      );
      expect(printed).toContain("Majestic Megalorca");
    });

    it("opponent's EOT does not add Majestic Megalorca", () => {
      setupTurn(R6, { hand: [REEF_LOLO], pp: 5 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      const afterOwner = handIds().filter((id) => id === MEGALORCA).length;
      runEndOfTurnBoundary("second");
      expect(handIds().filter((id) => id === MEGALORCA).length).toBe(
        afterOwner,
      );
    });
  });

  describe("Art of Decay (10842310)", () => {
    const printed =
      "Deal 4 damage to a random enemy follower. Deal 4 damage to the enemy leader.";

    it("deals 4 to enemy leader and 4 to a random enemy follower", () => {
      setupTurn(R6, { hand: [ART_OF_DECAY], pp: 6 });
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 6, "Foe");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(16);
      expect(Number(foe.defense)).toBe(2);
    });
  });

  describe("Axe-Wielding Dragonslayer (10041120)", () => {
    const printed = "Ward";

    it("enters with Ward", () => {
      setupTurn(R6, { hand: [AXE_DRAGONSLAYER], pp: 6 });
      whenPlayCard("first", 0);
      const axe = findOnBoard("first", "Axe-Wielding Dragonslayer")!;
      applyKeywordsFromList(axe);
      expect(axe.hasWard || axe.keywordState?.hasWard).toBe(true);
    });
  });

  describe("Giada, Peerless Flame of War (10843110)", () => {
    const printed =
      'Rush / Intimidate / Strike: Give this follower Barrier. If attacking a follower, give this follower "Can attack 2 times per turn" until the end of the turn.';

    it("enters with Rush and Intimidate", () => {
      setupTurn(R6, { hand: [GIADA], pp: 6 });
      whenPlayCard("first", 0);
      const giada = findOnBoard("first", "Giada, Peerless Flame of War")!;
      applyKeywordsFromList(giada);
      expect(giada.hasRush || giada.keywordState?.hasRush).toBe(true);
      expect(giada.hasIntimidate || giada.keywordState?.hasIntimidate).toBe(
        true,
      );
    });

    it("Strike vs follower: grants Barrier and 2 attacks per turn until owner EOT", () => {
      setupTurn(R6, { hand: [GIADA], pp: 6 });
      whenPlayCard("first", 0);
      const giada = findOnBoard("first", "Giada, Peerless Flame of War")!;
      giada.can_attack = true;
      giada.justPlayed = false;
      giada.attacks_left = 1;
      enemyFollower(1, 10, "Wall");
      attackFollower(0, 0, "first", "second");
      applyKeywordsFromList(giada);
      expect(giada.hasBarrier || giada.keywordState?.hasBarrier).toBe(true);
      expect(giada.attacks_per_turn).toBe(2);
      whenEndTurn();
      const after = findOnBoard("first", "Giada, Peerless Flame of War")!;
      expect((after as any).attacks_per_turn_pre_eot).toBeUndefined();
      expect(printed).toContain("Can attack 2 times");
    });

    it("Strike vs leader: grants Barrier but not extra attack", () => {
      setupTurn(R6, { hand: [GIADA], pp: 6 });
      whenPlayCard("first", 0);
      const giada = findOnBoard("first", "Giada, Peerless Flame of War")!;
      giada.can_attack = true;
      giada.justPlayed = false;
      giada.attacks_left = 1;
      attackLeader(0, "first", "second");
      applyKeywordsFromList(giada);
      expect(giada.hasBarrier || giada.keywordState?.hasBarrier).toBe(true);
      expect(giada.attacks_per_turn).not.toBe(2);
      expect((giada as any).attacks_per_turn_pre_eot).toBeUndefined();
    });
  });

  describe("Impeding Pugilist (10643110)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Deal 6 damage to a random enemy follower.\nWard\nBarrier\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare discards and deals 6 to random enemy follower (seed 1)", () => {
      setupTurn(R6, { hand: [IMPEDING_PUGILIST, FILLER], pp: 6 });
      const foe = enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      expect(handIds()).not.toContain(FILLER);
      expect(Number(foe.defense)).toBe(2);
    });

    it("enters with Ward and Barrier", () => {
      setupTurn(R6, { hand: [IMPEDING_PUGILIST, FILLER], pp: 6 });
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      const pug = findOnBoard("first", "Impeding Pugilist")!;
      applyKeywordsFromList(pug);
      expect(pug.hasWard || pug.keywordState?.hasWard).toBe(true);
      expect(pug.hasBarrier || pug.keywordState?.hasBarrier).toBe(true);
    });

    it("Evolve replicates Fanfare discard and 6 damage", () => {
      setupTurn(R6, {
        hand: [IMPEDING_PUGILIST, FILLER, DRAW_TOP],
        pp: 6,
        evo: 2,
      });
      const foe1 = enemyFollower(2, 8, "Foe1");
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      expect(Number(foe1.defense)).toBe(2);
      const foe2 = enemyFollower(2, 8, "Foe2");
      const pug = findOnBoard("first", "Impeding Pugilist")!;
      onEvolve(pug, "first", "normal", { spendPoint: true });
      discardHandCard("first", DRAW_TOP);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(Number(foe2.defense)).toBe(2);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Stormy Shamisen Shredder (10541120)", () => {
    const printed =
      "Fanfare: Summon a Majestic Megalorca. / Whenever an allied Marine follower enters the field, restore 2 defense to your leader.";

    it("Fanfare summons exactly one Majestic Megalorca", () => {
      setupTurn(R6, { hand: [STORMY_SHAMISEN], pp: 6 });
      whenPlayCard("first", 0);
      expect(boardCountById(MEGALORCA)).toBe(1);
    });

    it("Marine ally enter restores 2 leader HP; non-Marine does not", () => {
      setupTurn(R6, { hand: [STORMY_SHAMISEN], pp: 6, hp: 14 });
      whenPlayCard("first", 0);
      // Fanfare summons a Marine, which triggers +2 heal once
      expect(getHP(state, "first")).toBe(16);
      const plain = allyFollower(1, 1, "Plain");
      fireTrigger("ally_follower_enter", "first", {
        enteringCard: plain,
        enteringOwner: "first",
      });
      expect(getHP(state, "first")).toBe(16);
      const marine = createCard(MEGALORCA, "board", "first");
      marine.peak_defense = marine.defense;
      fireTrigger("ally_follower_enter", "first", {
        enteringCard: marine,
        enteringOwner: "first",
      });
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("Marine");
    });
  });

  describe("Beheading Eld Blades (10643310)", () => {
    const printed =
      "When this card is discarded, if its cost is 7, add a Beheading Eld Blades to your hand and set its cost to 5. If this card's cost is 5, add a Beheading Eld Blades to your hand and set its cost to 3.\nDeal X damage to all enemy followers. X is this card's cost.";

    it("when played at cost 7: deals 7 to all enemy followers", () => {
      setupTurn(R6, { hand: [BEHEADING_BLADES], pp: 7 });
      const a = enemyFollower(2, 8, "A");
      const b = enemyFollower(2, 8, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(1);
      expect(Number(b.defense)).toBe(1);
    });

    it("when discarded at cost 7: adds copy at cost 5", () => {
      setupTurn(R6, { hand: [RESOLUTE, BEHEADING_BLADES], pp: 3 });
      whenPlayCard("first", 0);
      discardHandCard("first", BEHEADING_BLADES);
      const added = thenHand("first").filter((c) => c.id === BEHEADING_BLADES);
      expect(added).toHaveLength(1);
      expect(getEffectiveCost(added[0]!)).toBe(5);
    });

    it("when discarded at cost 5: adds copy at cost 3", () => {
      setupTurn(R6, { hand: [RESOLUTE] });
      const reduced = createCard(BEHEADING_BLADES, "hand", "first");
      reduced.cost = 5;
      state.players.first.hand.push(reduced);
      whenPlayCard("first", 0);
      discardHandCard("first", BEHEADING_BLADES);
      const added = thenHand("first").filter((c) => c.id === BEHEADING_BLADES);
      expect(added).toHaveLength(1);
      expect(getEffectiveCost(added[0]!)).toBe(3);
    });

    it("when played at effective cost 5: deals exactly 5 to all enemy followers", () => {
      setupTurn(R6);
      const reduced = createCard(BEHEADING_BLADES, "hand", "first");
      reduced.cost = 5;
      state.players.first.hand.push(reduced);
      state.players.first.pp = 5;
      state.players.first.maxPP = 10;
      const a = enemyFollower(2, 8, "A");
      const b = enemyFollower(2, 8, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(3);
      expect(Number(b.defense)).toBe(3);
      expect(printed).toContain("X is this card's cost");
    });
  });

  describe("Blackflame Deluge (10743310)", () => {
    const printed =
      "Deal 5 damage to all enemy followers. Deal 3 damage to the enemy leader.";

    it("deals 5 to all enemy followers and 3 to enemy leader; ally untouched", () => {
      setupTurn(R7, { hand: [BLACKFLAME_DELUGE], pp: 7 });
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 6, "Foe");
      const ally = allyFollower(2, 6, "Ally");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(1);
      expect(Number(ally.defense)).toBe(6);
      expect(getHP(state, "second")).toBe(17);
    });
  });

  describe("Gallant Gatekeeper (10742110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it.\nWard";

    it("Fanfare destroys selected enemy; bystander survives", () => {
      setupTurn(R7, { hand: [GALLANT_GATEKEEPER], pp: 7 });
      const target = enemyFollower(3, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(findOnBoard("second", "Target")).toBeUndefined();
      expect(findOnBoard("second", "Bystander")).toBeTruthy();
    });

    it("enters with Ward", () => {
      setupTurn(R7, { hand: [GALLANT_GATEKEEPER], pp: 7 });
      whenPlayCard("first", 0);
      const gate = findOnBoard("first", "Gallant Gatekeeper")!;
      applyKeywordsFromList(gate);
      expect(gate.hasWard || gate.keywordState?.hasWard).toBe(true);
    });
  });

  describe("Ruinbringer (10543110)", () => {
    const printed =
      "Super-Evolve: Banish all 1-, 3-, 5-, 7-, and 9-cost cards from your deck. Deal X damage split between all enemy followers. X is the number of cards you banished.";

    it("Super-Evolve banishes 1- and 3-cost by uid (not graveyard); 2-cost stays in deck; splits exactly X=2 damage", () => {
      setupTurn(R7, {
        hand: [RUINBRINGER],
        pp: 7,
        evo: 2,
        superEvo: 1,
        seed: 1,
      });
      const c1 = createCard(FILLER, "deck", "first");
      c1.cost = 1;
      const c3 = createCard(FILLER, "deck", "first");
      c3.cost = 3;
      const c2 = createCard(DRAW_TOP, "deck", "first");
      c2.cost = 2;
      state.players.first.deck = [c2, c3, c1];
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      whenPlayCard("first", 0);
      const ruin = findOnBoard("first", "Ruinbringer")!;
      onEvolve(ruin, "first", "super", { spendPoint: true });
      expect(getBanish(state, "first").some((c) => c.uid === c1.uid)).toBe(
        true,
      );
      expect(getBanish(state, "first").some((c) => c.uid === c3.uid)).toBe(
        true,
      );
      expect(getGraveyard(state, "first").some((c) => c.uid === c1.uid)).toBe(
        false,
      );
      expect(getGraveyard(state, "first").some((c) => c.uid === c3.uid)).toBe(
        false,
      );
      expect(thenDeck("first").some((c) => c.uid === c2.uid)).toBe(true);
      expect(getBanish(state, "first").length).toBe(2);
      const dmg1 = 5 - Number(e1.defense);
      const dmg2 = 5 - Number(e2.defense);
      expect(dmg1 + dmg2).toBe(2);
      expect(dmg1).toBeLessThanOrEqual(2);
      expect(dmg2).toBeLessThanOrEqual(2);
      expect(printed).toContain("banished");
    });
  });

  describe("Sandstorm Watchdragon (10841120)", () => {
    const printed = "Ward\nLast Words: Draw 3 cards.";

    it("enters with Ward", () => {
      setupTurn(R7, { hand: [SANDSTORM_WATCHDRAGON], pp: 7 });
      whenPlayCard("first", 0);
      const sand = findOnBoard("first", "Sandstorm Watchdragon")!;
      applyKeywordsFromList(sand);
      expect(sand.hasWard || sand.keywordState?.hasWard).toBe(true);
    });

    it("Last Words draws exactly 3 stacked deck cards", () => {
      setupTurn(R7, {
        hand: [SANDSTORM_WATCHDRAGON],
        deck: [FILLER, DRAW_THIRD, DRAW_SECOND, DRAW_TOP],
        pp: 7,
      });
      whenPlayCard("first", 0);
      const sand = findOnBoard("first", "Sandstorm Watchdragon")!;
      sand.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(handIds()).toContain(DRAW_THIRD);
      expect(handIds()).not.toContain(SANDSTORM_WATCHDRAGON);
      expect(printed).toContain("Draw 3 cards");
    });
  });

  describe("Wilnas, Flame Personified (10444110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 8 damage. / Intimidate. / Evolve: Replicate the effects of this card'sFanfare ability.";

    it("Fanfare deals 8 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [WILNAS], pp: 7 });
      const target = enemyFollower(2, 10, "Target");
      const bystander = enemyFollower(2, 10, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(10);
    });

    it("enters with Intimidate", () => {
      setupTurn(R6, { hand: [WILNAS], pp: 7 });
      whenPlayCard("first", 0);
      const wilnas = findOnBoard("first", "Wilnas, Flame Personified")!;
      applyKeywordsFromList(wilnas);
      expect(wilnas.hasIntimidate || wilnas.keywordState?.hasIntimidate).toBe(
        true,
      );
    });

    it("Evolve replicates Fanfare 8 damage", () => {
      setupTurn(R6, { hand: [WILNAS], pp: 7, evo: 2 });
      const foe = enemyFollower(2, 10, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      expect(Number(foe.defense)).toBe(2);
      const wilnas = findOnBoard("first", "Wilnas, Flame Personified")!;
      const foe2 = enemyFollower(2, 10, "Foe2");
      onEvolve(wilnas, "first", "normal", { spendPoint: true });
      resolvePendingByUid(foe2.uid);
      expect(Number(foe2.defense)).toBe(2);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Dragonfolk Butler (10942120)", () => {
    const printed =
      "Fanfare: Restore 3 defense to your leader. Recover 3 play points. / Evolve: Select another allied follower on the field and give it +3/+3.";

    it("Fanfare restores 3 HP and recovers 3 PP", () => {
      setupTurn(R6, { hand: [DRAGONFOLK_BUTLER], pp: 8, hp: 12 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(15);
      expect(getPP(state, "first")).toBe(3);
    });

    it("Evolve gives +3/+3 to another selected ally", () => {
      setupTurn(R6, { hand: [DRAGONFOLK_BUTLER], pp: 8, evo: 2 });
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      const butler = findOnBoard("first", "Dragonfolk Butler")!;
      onEvolve(butler, "first", "normal", { spendPoint: true });
      resolvePendingByUid(ally.uid);
      expect(Number(ally.attack)).toBe(5);
      expect(Number(ally.defense)).toBe(5);
    });
  });

  describe("Ironmace Dragoon (10542110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 7 damage. Summon a Vastwing Dragon.";

    it("Fanfare deals 7 to selected enemy and summons Vastwing", () => {
      setupTurn(R8, { hand: [IRONMACE_DRAGOON], pp: 8 });
      const foe = enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      expect(Number(foe.defense)).toBe(1);
      expect(boardCountById(VASTWING)).toBe(1);
    });
  });

  describe("Mugen, Steel-Bodied Honesty (10442120)", () => {
    const printed =
      "Fanfare: Super Skybound Art (15)- Give this follower Storm. / Super-Evolve: Select 2 enemy followers on the field and destroy them.";

    it("Super Skybound Art(15): grants Storm on Fanfare", () => {
      setupTurn(R15, { hand: [MUGEN], pp: 8 });
      whenPlayCard("first", 0);
      const mugen = findOnBoard("first", "Mugen, Steel-Bodied Honesty")!;
      applyKeywordsFromList(mugen);
      expect(mugen.hasStorm || mugen.keywordState?.hasStorm).toBe(true);
    });

    it("below Super Skybound Art(15): no Storm on Fanfare", () => {
      setupTurn(R6, { hand: [MUGEN], pp: 8 });
      whenPlayCard("first", 0);
      const mugen = findOnBoard("first", "Mugen, Steel-Bodied Honesty")!;
      applyKeywordsFromList(mugen);
      expect(mugen.hasStorm || mugen.keywordState?.hasStorm).toBeFalsy();
    });

    it("Super-Evolve destroys 2 selected enemy followers", () => {
      setupTurn(R7, { hand: [MUGEN], pp: 8, evo: 2, superEvo: 1 });
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      const mugen = findOnBoard("first", "Mugen, Steel-Bodied Honesty")!;
      onEvolve(mugen, "first", "super", { spendPoint: true });
      resolvePendingByUid(a.uid);
      resolvePendingByUid(b.uid);
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(printed).toContain("destroy them");
    });
  });

  describe("Spiked Dragon (10642120)", () => {
    const printed =
      "At the end of your turn, evolve this follower. / When this follower evolves, deal 3 damage to all enemies.";

    it("owner's EOT evolves Spiked Dragon", () => {
      setupTurn(R8, { hand: [SPIKED_DRAGON], pp: 8 });
      enemyFollower(2, 5, "Wall");
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      const spiked = findOnBoard("first", "Spiked Dragon")!;
      expect(spiked.hasEvolved || spiked.isEvolved).toBe(true);
    });

    it("opponent's EOT does not evolve Spiked Dragon", () => {
      setupTurn(R8, { hand: [SPIKED_DRAGON], pp: 8 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      const spiked = findOnBoard("first", "Spiked Dragon")!;
      expect(spiked.hasEvolved || spiked.isEvolved).toBeFalsy();
    });

    it("on evolve: deals 3 to enemy follower and leader", () => {
      setupTurn(R8, { hand: [SPIKED_DRAGON], pp: 8 });
      state.players.second.hp = 20;
      const wall = enemyFollower(2, 5, "Wall");
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(Number(wall.defense)).toBe(2);
      expect(getHP(state, "second")).toBe(17);
      expect(printed).toContain("deal 3 damage");
    });
  });

  describe("Warrior of the Deep (10041130)", () => {
    const printed = "Fanfare: Deal 6 damage to the enemy leader.";

    it("Fanfare deals 6 to enemy leader", () => {
      setupTurn(R8, { hand: [WARRIOR_DEEP], pp: 8 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(14);
    });
  });

  describe("Dragon's Vale Elder (10744120)", () => {
    const printed =
      "Fanfare: Summon a Vastwing Dragon. Gain Crest: Dragon's Vale Elder.\nWard\nSuper-Evolve: Delay the count of your Crest: Dragon's Vale Elder by 2.\n// Special Effects: Countdown (2) / At the end of your turn, summon a Vastwing Dragon.";

    it("Fanfare summons Vastwing and gains crest countdown 2", () => {
      setupTurn(R10, { hand: [DRAGONS_VALE_ELDER], pp: 10 });
      whenPlayCard("first", 0);
      expect(boardCountById(VASTWING)).toBe(1);
      const crest = crestNamed("Dragon's Vale Elder");
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(2);
      const elder = findOnBoard("first", "Dragon's Vale Elder")!;
      applyKeywordsFromList(elder);
      expect(elder.hasWard || elder.keywordState?.hasWard).toBe(true);
    });

    it("Super-Evolve delays crest countdown by 2", () => {
      setupTurn(R10, {
        hand: [DRAGONS_VALE_ELDER],
        pp: 10,
        evo: 2,
        superEvo: 1,
      });
      whenPlayCard("first", 0);
      const elder = findOnBoard("first", "Dragon's Vale Elder")!;
      onEvolve(elder, "first", "super", { spendPoint: true });
      const crest = crestNamed("Dragon's Vale Elder");
      expect(Number(crest!.countdown)).toBe(4);
      expect(printed).toContain("Delay");
    });

    it("crest owner's EOT summons Vastwing Dragon", () => {
      setupTurn(R10, { hand: [DRAGONS_VALE_ELDER], pp: 10 });
      whenPlayCard("first", 0);
      const before = boardCountById(VASTWING);
      runEndOfTurnBoundary("first");
      expect(boardCountById(VASTWING)).toBe(before + 1);
    });

    it("crest Countdown (2): summons Vastwing at owner EOT for two turns then expires", () => {
      setupTurn(R10, { hand: [DRAGONS_VALE_ELDER], pp: 10 });
      whenPlayCard("first", 0);
      expect(boardCountById(VASTWING)).toBe(1);
      whenEndTurn();
      expect(boardCountById(VASTWING)).toBe(2);
      whenEndTurn();
      whenEndTurn();
      expect(boardCountById(VASTWING)).toBe(3);
      whenEndTurn();
      expect(crestNamed("Dragon's Vale Elder")).toBeFalsy();
      whenEndTurn();
      expect(boardCountById(VASTWING)).toBe(3);
    });

    it("crest does not summon Vastwing on opponent's EOT", () => {
      setupTurn(R10, { hand: [DRAGONS_VALE_ELDER], pp: 10 });
      whenPlayCard("first", 0);
      const before = boardCountById(VASTWING);
      runEndOfTurnBoundary("second");
      expect(boardCountById(VASTWING)).toBe(before);
    });

    it("Super-Evolve delay +2: crest outlasts baseline countdown (2) by two owner turn-starts", () => {
      setupTurn(R10, {
        hand: [DRAGONS_VALE_ELDER],
        pp: 10,
        evo: 2,
        superEvo: 1,
      });
      whenPlayCard("first", 0);
      const elder = findOnBoard("first", "Dragon's Vale Elder")!;
      onEvolve(elder, "first", "super", { spendPoint: true });
      expect(Number(crestNamed("Dragon's Vale Elder")!.countdown)).toBe(4);
      whenEndTurn();
      whenEndTurn();
      expect(crestNamed("Dragon's Vale Elder")).toBeTruthy();
      whenEndTurn();
      whenEndTurn();
      expect(crestNamed("Dragon's Vale Elder")).toBeTruthy();
      whenEndTurn();
      whenEndTurn();
      expect(crestNamed("Dragon's Vale Elder")).toBeTruthy();
      whenEndTurn();
      whenEndTurn();
      expect(crestNamed("Dragon's Vale Elder")).toBeFalsy();
      const before = boardCountById(VASTWING);
      whenEndTurn();
      expect(boardCountById(VASTWING)).toBe(before);
      expect(printed).toContain("Delay");
    });
  });
});
