/**
 * L2 real-card tests — Forestcraft tokens (7 tokens).
 *
 * Protocol: assert printed token text from cards/token_details.json description,
 * not JSON behaviour. Conditional cards test both ON and OFF branches.
 * Failing-by-design → it.fails with finding comment.
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
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { giveStatBuffViaEngine } from "../harness/l2Dispatch.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import { getBoard, getHand, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Tokens under test
const EVE = "90014110";
const FAIRY = "90011110";
const SPRINGBLOOM = "90011120";
const DEEPWOOD = "90011310";
const DEPTHS_LANCE = "90014330";
const ANNIHILATING = "90014320";
const BRAMBLE = "90014310";

// Generators (meta-deck first)
const TIA = "10814120";
const BATTLEDORE = "10511120";
const KINDLY = "10612110";
const GREAT_HART = "10714120";
const SATHANID = "10614120";
const IZUDIA = "10314120";
const OPULENT_ROSE = "10114120";

const FILLER = "10111310";
const DRAW_TOP = "10011110";
const DRAW_DEEP = "10011120";

const FAITH_CREST = faithCrestNameForCard("Sathanid, Eld Lance");

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | { name: string; type: string; cost?: number }>;
    pp?: number;
    evo?: number;
    hp?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
    secondDeck?: string[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
}

function boardUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenBoard(player).map((c) => c.uid));
}

function newHandCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
) {
  const fresh = thenHand(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function newBoardCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
) {
  const fresh = thenBoard(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
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
  atk = 2,
  def = 2,
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

function buffSelf(card: ReturnType<typeof createCard>, atk = 1, def = 0): void {
  giveStatBuffViaEngine(card, "first", atk, def);
}

function setupFaith(owner: "first" | "second", amount: number): void {
  bootstrapFaithForPlayer(
    owner,
    state.players[owner].deck,
    state.players[owner].hand,
  );
  crestAddCounter(owner, FAITH_CREST, "faith", amount);
}

function readyAttacker(
  card: ReturnType<typeof createCard>,
  owner: "first" | "second" = "first",
): void {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
}

describe("L2 — Forestcraft tokens", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {});

  describe("Eve, Blade of Crystalia (90014110)", () => {
    const printed = "Storm\nWard";

    it("real path via Tia buff: adds Eve by uid with 3/3 Forestcraft stats", () => {
      setupTurn(3, { hand: [TIA], pp: 2 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const tia = findOnBoard("first", "Tia, Eternal Crystalian")!;
      buffSelf(tia, 1, 0);
      const added = newHandCards(uidsBefore, "first", EVE);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(3);
      expect(Number(added[0]!.attack)).toBe(3);
      expect(Number(added[0]!.defense)).toBe(3);
      expect(added[0]!.type).toBe("Follower");
      expect(added[0]!.class).toBe("Forestcraft");
    });

    it("Storm: can attack enemy leader the turn it is played", () => {
      setupTurn(R6, { hand: [EVE], pp: 3 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const eve = findOnBoard("first", "Eve, Blade of Crystalia")!;
      readyAttacker(eve);
      const atkIdx = getBoard(state, "first").indexOf(eve);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(17);
      expect(printed).toContain("Storm");
    });

    it("Ward: has Ward keyword on play", () => {
      setupTurn(R6, { hand: [EVE], pp: 3 });
      whenPlayCard("first", 0);
      const eve = findOnBoard("first", "Eve, Blade of Crystalia")!;
      applyKeywordsFromList(eve);
      expect(eve.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Ward: enemy cannot attack non-Ward follower while Eve is on board", () => {
      setupTurn(R6, { hand: [EVE], pp: 3 });
      whenPlayCard("first", 0);
      const eve = findOnBoard("first", "Eve, Blade of Crystalia")!;
      applyKeywordsFromList(eve);
      const bystander = allyFollower(1, 5, "Bystander");
      const attacker = enemyFollower(3, 3, "Attacker");
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      const defBefore = Number(bystander.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(bystander),
        "second",
        "first",
      );
      expect(Number(bystander.defense)).toBe(defBefore);
      state.activePlayer = "first";
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(eve),
        "second",
        "first",
      );
      expect(Number(eve.defense)).toBe(0);
    });
  });

  describe("Fairy (90011110)", () => {
    const printed = "Rush";

    it("real path via Battledore Woodsmaiden Fanfare: summons Fairy by uid", () => {
      setupTurn(R6, { hand: [BATTLEDORE], pp: 5 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", FAIRY);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(1);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Forestcraft");
      expect(summoned[0]!.tribes).toContain("Pixie");
    });

    it("Rush: can attack enemy follower the turn it is summoned", () => {
      setupTurn(R6, { hand: [BATTLEDORE], pp: 5 });
      const foe = enemyFollower(1, 3, "Foe");
      whenPlayCard("first", 0);
      const fairy = thenBoard("first").find((c) => c.id === FAIRY)!;
      applyKeywordsFromList(fairy);
      expect(fairy.hasRush).toBe(true);
      readyAttacker(fairy);
      const atkIdx = getBoard(state, "first").indexOf(fairy);
      attackFollower(atkIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("Rush");
    });

    it("Rush: cannot attack enemy leader the turn it is played", () => {
      setupTurn(R6, { hand: [FAIRY], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const fairy = findOnBoard("first", "Fairy")!;
      applyKeywordsFromList(fairy);
      fairy.can_attack = true;
      fairy.attacks_left = 1;
      const atkIdx = getBoard(state, "first").indexOf(fairy);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Springbloom Fairy (90011120)", () => {
    const printed = "Ward\nAt the end of your turn, evolve this follower.";

    it("real path via Kindly Executor Fanfare: adds Springbloom by uid", () => {
      setupTurn(R6, { hand: [KINDLY], pp: 2 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(uidsBefore, "first", SPRINGBLOOM);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(2);
      expect(Number(added[0]!.attack)).toBe(1);
      expect(Number(added[0]!.defense)).toBe(1);
      expect(added[0]!.type).toBe("Follower");
      expect(added[0]!.class).toBe("Forestcraft");
      expect(added[0]!.tribes).toContain("Pixie");
    });

    it("Ward: has Ward keyword on play", () => {
      setupTurn(R6, { hand: [SPRINGBLOOM], pp: 2 });
      whenPlayCard("first", 0);
      const spring = findOnBoard("first", "Springbloom Fairy")!;
      applyKeywordsFromList(spring);
      expect(spring.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("owner's EOT: evolves this follower without spending evolution points", () => {
      setupTurn(R6, { hand: [SPRINGBLOOM], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const spring = findOnBoard("first", "Springbloom Fairy")!;
      const evoBefore = state.players.first.evoCharges;
      whenEndTurn();
      expect(spring.hasEvolved).toBe(true);
      expect(state.players.first.evoCharges).toBe(evoBefore);
      expect(printed).toContain("evolve this follower");
    });

    it("opponent's EOT: does not evolve Springbloom Fairy", () => {
      setupTurn(R6, {
        active: "second",
        secondHand: [FILLER],
        secondPP: 1,
        secondDeck: [DRAW_TOP, DRAW_DEEP],
      });
      const spring = createCard(SPRINGBLOOM, "board", "first");
      spring.peak_defense = spring.defense;
      state.players.first.board.push(spring);
      runEndOfTurnBoundary("second");
      expect(spring.hasEvolved).toBeFalsy();
    });
  });

  describe("Deepwood Bounty (90011310)", () => {
    const printed = "Restore 1 defense to your leader.";

    it("real path via Great Hart Fanfare: adds Deepwood Bounty by uid", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(uidsBefore, "first", DEEPWOOD);
      expect(added).toHaveLength(2);
      expect(Number(added[0]!.cost)).toBe(0);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Forestcraft");
    });

    it("on play restores exactly 1 defense to your leader", () => {
      setupTurn(R6, { hand: [DEEPWOOD], pp: 0, hp: 18 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("Restore 1 defense");
    });

    it("at full leader defense: playing Deepwood Bounty leaves HP unchanged", () => {
      setupTurn(R6, { hand: [DEEPWOOD], pp: 0, hp: 20 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(20);
    });
  });

  describe("Depths of the Eld Lance (90014330)", () => {
    const printed =
      "Select an unevolved allied follower on the field and evolve it.";

    it("real path via Sathanid Fanfare: adds Depths by uid with faith ≥10", () => {
      setupTurn(R6, { hand: [SATHANID], pp: 1 });
      setupFaith("first", 10);
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(uidsBefore, "first", DEPTHS_LANCE);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Forestcraft");
      expect(added[0]!.tribes).toContain("Encroacher");
    });

    it("on play: evolves selected unevolved ally; bystander evolved ally untouched", () => {
      setupTurn(R6, { hand: [DEPTHS_LANCE], pp: 1, evo: 2 });
      const target = allyFollower(2, 2, "Target");
      const bystander = allyFollower(2, 2, "Bystander");
      bystander.hasEvolved = true;
      const evoBefore = state.players.first.evoCharges;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(target.hasEvolved).toBe(true);
      expect(bystander.hasEvolved).toBe(true);
      expect(state.players.first.evoCharges).toBe(evoBefore);
      expect(printed).toContain("unevolved allied follower");
    });

    it("unevolved bystander remains unevolved when evolved ally is the only other follower", () => {
      setupTurn(R6, { hand: [DEPTHS_LANCE], pp: 1, evo: 2 });
      const evolved = allyFollower(2, 2, "Evolved");
      evolved.hasEvolved = true;
      const unevolved = allyFollower(2, 2, "Unevolved");
      whenPlayCard("first", 0);
      resolvePendingByUid(unevolved.uid);
      expect(unevolved.hasEvolved).toBe(true);
      expect(evolved.hasEvolved).toBe(true);
    });
  });

  describe("Annihilating Onslaught (90014320)", () => {
    const printed =
      "Activates in hand. At the end of your turn, reduce the cost of this card by 1.\nDeal 6 damage to the enemy leader. If there's an allied Izudia, Annihilation Manifest on the field, deal 20 damage instead.";

    it("real path via Izudia Evolve: adds Annihilating Onslaught by uid", () => {
      setupTurn(R10, { hand: [IZUDIA], pp: 8, evo: 2 });
      enemyFollower(8, 8, "FanfareTarget");
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      resolveFirstPending();
      const iz = findOnBoard("first", "Izudia, Annihilation Manifest")!;
      whenEvolve(iz, "first");
      const added = newHandCards(uidsBefore, "first", ANNIHILATING);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(6);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Forestcraft");
    });

    it("owner's EOT: reduces in-hand cost by 1", () => {
      setupTurn(R10, {
        hand: [ANNIHILATING],
        pp: 6,
        deck: [DRAW_TOP, DRAW_DEEP],
      });
      const onslaught = thenHand("first").find((c) => c.id === ANNIHILATING)!;
      expect(getEffectiveCost(onslaught)).toBe(6);
      whenEndTurn();
      const after = thenHand("first").find((c) => c.id === ANNIHILATING)!;
      expect(getEffectiveCost(after)).toBe(5);
      expect(printed).toContain("reduce the cost");
    });

    it("opponent's EOT: in-hand cost unchanged", () => {
      setupTurn(R10, {
        hand: [ANNIHILATING],
        pp: 6,
        active: "second",
        secondHand: [FILLER],
        secondPP: 1,
        secondDeck: [DRAW_TOP, DRAW_DEEP],
      });
      const onslaught = thenHand("first").find((c) => c.id === ANNIHILATING)!;
      expect(getEffectiveCost(onslaught)).toBe(6);
      runEndOfTurnBoundary("second");
      const after = thenHand("first").find((c) => c.id === ANNIHILATING)!;
      expect(getEffectiveCost(after)).toBe(6);
    });

    it("without allied Izudia on field: deals 6 damage to enemy leader", () => {
      setupTurn(R10, { hand: [ANNIHILATING], pp: 6 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(14);
      expect(printed).toContain("Deal 6 damage");
    });

    it("with allied Izudia on field: deals 20 damage to enemy leader instead", () => {
      setupTurn(R10, { hand: [ANNIHILATING], pp: 6 });
      const izudia = createCard(IZUDIA, "board", "first");
      izudia.peak_defense = izudia.defense;
      state.players.first.board.push(izudia);
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(0);
      expect(printed).toContain("deal 20 damage instead");
    });
  });

  describe("Bramble Burst (90014310)", () => {
    const printed =
      "Select an enemy follower on the field or the enemy leader and deal it 3 damage.";

    it("real path via Opulent Rose Queen Fanfare: transforms hand card into Bramble Burst by uid", () => {
      setupTurn(R10, { hand: [OPULENT_ROSE, FILLER], pp: 9 });
      const fillerUid = thenHand("first").find((c) => c.id === FILLER)!.uid;
      whenPlayCard("first", 0);
      const transformed = thenHand("first").find((c) => c.uid === fillerUid)!;
      expect(String(transformed.id)).toBe(BRAMBLE);
      expect(transformed.name).toBe("Bramble Burst");
      expect(Number(transformed.cost)).toBe(1);
      expect(transformed.type).toBe("Spell");
      expect(transformed.class).toBe("Forestcraft");
    });

    it("on play: deals 3 damage to selected enemy follower; bystander untouched", () => {
      setupTurn(R6, { hand: [BRAMBLE], pp: 1 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(6);
      expect(printed).toContain("deal it 3 damage");
    });

    it("on play: can target enemy leader for 3 damage", () => {
      setupTurn(R6, { hand: [BRAMBLE], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid("leader");
      expect(getHP(state, "second")).toBe(17);
    });
  });
});
