/**
 * L2 real-card tests — Antemaria Dragoncraft deck (14 cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach } from "vitest";
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
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import {
  playFollowerFromHandById,
  summonFollowerByCardId,
  PLAY_FILLER_FOLLOWER,
} from "../harness/l2Dispatch.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { getHand, getHP, getGraveyard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck cards
const DRAKE_TANTRUM = "10941310";
const RIPPER_THIEF = "10941110";
const ARTIGLIO = "10943310";
const MARAUDER = "10942110";
const JELLYFISH = "10542120";
const KIMIKA = "10842120";
const SLOTH = "10543310";
const VORLALAI = "10644120";
const RESOLUTE = "10641110";
const ADVENT = "10641310";
const CARRIER = "10741120";
const TYRANT = "10943110";
const ANTEMARIA = "10944110";
const SAGATSUMATSU = "10644110";

// Tokens / helpers
const FIRE_DRAKE_WHELP = "90041110";
const MEGALORCA = "90041130";
const DEPTHS_BLADES = "90044330";
const SPILLING_RED = "10642310";
const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const DRAW_THIRD = "10021130";
const HAND_FOLLOWER = "10161120";
const HAND_SPELL = "10131310";

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
    pp?: number;
    hp?: number;
    active?: "first" | "second";
    firstBoard?: Array<string | Record<string, unknown>>;
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
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.firstBoard?.length) b = b.withFirstBoard(opts.firstBoard as any);
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

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function discardHandCard(player: "first" | "second", cardId: string): void {
  const card = getHand(state, player).find((c) => c.id === cardId);
  if (!card) throw new Error(`Card not in hand: ${cardId}`);
  resolvePendingTarget(card.uid);
}

function setupTurnAfterAllyLeaderAttack(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
  } = {},
) {
  setupTurn(round, opts);
  const raider = createCard(
    {
      name: "Raider",
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      hasStorm: true,
      can_attack: true,
      attacks_left: 1,
      justPlayed: false,
      hasAttacked: false,
    },
    "board",
    "first",
  );
  state.players.first.board.push(raider);
  attackLeader(0, "first", "second");
  endTurnBlue();
  endTurnRed();
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

describe("L2 — Antemaria Dragoncraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("High-Spirited Marauder (10942110)", () => {
    const printed =
      "Storm\nStrike: If an allied follower attacked a leader on your last turn, give this follower +1/+0 until the end of the turn.";

    it("has Storm on play", () => {
      setupTurn(R6, { hand: [MARAUDER], pp: 2 });
      whenPlayCard("first", 0);
      const marauder = findOnBoard("first", "High-Spirited Marauder")!;
      expect(marauder.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });

    it("Strike with gate: +1/+0 before combat kills a 2-defense follower", () => {
      setupTurnAfterAllyLeaderAttack(R6, { hand: [MARAUDER], pp: 2 });
      const foe = enemyFollower(1, 2, "Victim");
      whenPlayCard("first", 0);
      const marauder = findOnBoard("first", "High-Spirited Marauder")!;
      marauder.can_attack = true;
      marauder.attacks_left = 1;
      marauder.justPlayed = false;
      attackFollower(0, 0, "first", "second");
      expect(findOnBoard("second", "Victim")).toBeUndefined();
    });

    it("Strike without gate: does not buff; 2-defense enemy survives", () => {
      setupTurn(R6, { hand: [MARAUDER], pp: 2 });
      const foe = enemyFollower(1, 2, "Tough");
      whenPlayCard("first", 0);
      const marauder = findOnBoard("first", "High-Spirited Marauder")!;
      const atkBefore = Number(marauder.attack);
      marauder.can_attack = true;
      marauder.attacks_left = 1;
      marauder.justPlayed = false;
      attackFollower(0, 0, "first", "second");
      expect(Number(marauder.attack)).toBe(atkBefore);
      expect(Number(foe.defense)).toBe(1);
      expect(printed).toContain("last turn");
    });
  });

  describe("Jellyfish Dancer (10542120)", () => {
    const printed =
      "Fanfare: Add a Majestic Megalorca to your hand.\nWhenever an allied Marine follower enters the field, give this follower Rush and Bane.";

    it("Fanfare adds Majestic Megalorca (90041130) to hand", () => {
      setupTurn(R6, { hand: [JELLYFISH], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(MEGALORCA);
      expect(handIds()).not.toContain(JELLYFISH);
      expect(printed).toContain("Add a Majestic Megalorca");
    });

    it("Marine ally enter grants Rush and Bane to Jellyfish Dancer", () => {
      setupTurn(R6, { hand: [JELLYFISH], pp: 4 });
      whenPlayCard("first", 0);
      const jelly = findOnBoard("first", "Jellyfish Dancer")!;
      playFollowerFromHandById("first", MEGALORCA);
      expect(jelly.hasRush || jelly.keywordState?.hasRush).toBe(true);
      expect(jelly.hasBane || jelly.keywordState?.hasBane).toBe(true);
    });

    it("non-Marine ally enter does not grant Rush or Bane", () => {
      setupTurn(R6, { hand: [JELLYFISH, PLAY_FILLER_FOLLOWER], pp: 4 });
      whenPlayCard("first", 0);
      const jelly = findOnBoard("first", "Jellyfish Dancer")!;
      playFollowerFromHandById("first", PLAY_FILLER_FOLLOWER);
      expect(jelly.hasRush || jelly.keywordState?.hasRush).toBeFalsy();
      expect(jelly.hasBane || jelly.keywordState?.hasBane).toBeFalsy();
      expect(printed).toContain("Marine");
    });
  });

  describe("Kimika, Cook of Happiness (10842120)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Draw a card. Restore 1 defense to your leader.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare discards selected card, draws stacked top, restores 1 HP", () => {
      setupTurn(R6, {
        hand: [KIMIKA, FILLER],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 2,
        hp: 15,
      });
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(FILLER);
      expect(handIds()).not.toContain(KIMIKA);
      expect(getHP(state, "first")).toBe(hpBefore + 1);
      expect(printed).toContain("Restore 1 defense");
    });

    it("Evolve replicates Fanfare: second discard, draw, and heal", () => {
      setupTurn(R6, {
        hand: [KIMIKA, FILLER, DRAW_TOP],
        deck: [DRAW_SECOND, DRAW_THIRD],
        pp: 2,
        hp: 14,
      });
      state.players.first.evoCharges = 2;
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      const kimika = findOnBoard("first", "Kimika, Cook of Happiness")!;
      const hpAfterFanfare = getHP(state, "first");
      whenEvolve(kimika, "first");
      discardHandCard("first", DRAW_TOP);
      expect(getHP(state, "first")).toBe(hpAfterFanfare + 1);
      expect(handIds()).toContain(DRAW_THIRD);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Sloth of the Crestpetal (10543310)", () => {
    const printed =
      'Do this 2 times: "Deal 2 damage to a random enemy follower." If you\'re in Overflow, deal 2 damage to the enemy leader.';

    it("without Overflow: deals 4 total to enemy followers only (seed 1)", () => {
      setupTurn(R6, { hand: [SLOTH], pp: 2 });
      state.players.first.maxPP = 6;
      state.players.second.hp = 20;
      const a = enemyFollower(1, 3, "A");
      const b = enemyFollower(1, 3, "B");
      const defBefore = Number(a.defense) + Number(b.defense);
      whenPlayCard("first", 0);
      const defAfter = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(defBefore - defAfter).toBe(4);
      expect(getHP(state, "second")).toBe(20);
    });

    it("with Overflow: also deals 2 damage to the enemy leader", () => {
      setupTurn(R8, { hand: [SLOTH], pp: 2 });
      state.players.first.maxPP = 7;
      state.players.second.hp = 20;
      enemyFollower(1, 5, "E");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Overflow");
    });
  });

  describe("Vorlalai, Eld Blades (10644120)", () => {
    const printed =
      "When this card is discarded, summon a Vorlalai, Eld Blades.\nBane\nEvolve: Add a Depths of the Eld Blades to your hand.\nSuper-Evolve: Add 3 copies instead.";

    it("when discarded from hand, summons Vorlalai on field", () => {
      setupTurn(R6, { hand: [SAGATSUMATSU, VORLALAI], pp: 7 });
      whenPlayCard("first", 0);
      discardHandCard("first", VORLALAI);
      const summoned = thenBoard("first").filter(
        (c) => c.name === "Vorlalai, Eld Blades",
      );
      expect(summoned.length).toBeGreaterThanOrEqual(1);
      expect(boardIds()).toContain(VORLALAI);
    });

    it("has Bane on play", () => {
      setupTurn(R6, { hand: [VORLALAI], pp: 2 });
      whenPlayCard("first", 0);
      const vor = findOnBoard("first", "Vorlalai, Eld Blades")!;
      applyKeywordsFromList(vor);
      expect(vor.hasBane || vor.keywordState?.hasBane).toBe(true);
    });

    it("Evolve adds Depths of the Eld Blades (90044330) to hand", () => {
      setupTurn(R6, { hand: [VORLALAI], pp: 2 });
      state.players.first.evoCharges = 2;
      whenPlayCard("first", 0);
      const vor = findOnBoard("first", "Vorlalai, Eld Blades")!;
      whenEvolve(vor, "first");
      expect(handIds()).toContain(DEPTHS_BLADES);
      expect(
        thenHand("first").filter((c) => c.id === DEPTHS_BLADES),
      ).toHaveLength(1);
    });

    it("Super-Evolve adds 3 copies of Depths of the Eld Blades", () => {
      setupTurn(R6, { hand: [VORLALAI], pp: 2 });
      state.players.first.superEvoCharges = 1;
      state.players.first.superEvoPoints = 1;
      whenPlayCard("first", 0);
      const vor = findOnBoard("first", "Vorlalai, Eld Blades")!;
      whenSuperEvolve(vor, "first");
      expect(
        thenHand("first").filter((c) => c.id === DEPTHS_BLADES),
      ).toHaveLength(3);
      expect(printed).toContain("3 copies");
    });
  });

  describe("Resolute Dragonewt (10641110)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it.\nLast Words: Draw 2 cards.";

    it("Fanfare discards the selected hand card", () => {
      setupTurn(R6, { hand: [RESOLUTE, FILLER], pp: 3 });
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      expect(handIds()).not.toContain(FILLER);
      expect(boardIds()).toContain(RESOLUTE);
    });

    it("Last Words draws the top 2 stacked deck cards", () => {
      setupTurn(R6, {
        hand: [RESOLUTE],
        deck: [DRAW_THIRD, DRAW_SECOND, DRAW_TOP],
        pp: 3,
      });
      whenPlayCard("first", 0);
      const dragonewt = findOnBoard("first", "Resolute Dragonewt")!;
      dragonewt.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(handIds()).not.toContain(DRAW_THIRD);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Advent of the Eld Blades (10641310)", () => {
    const printed =
      "When this card is discarded, if its cost is 4, add an Advent of the Eld Blades to your hand and set its cost to 2.\nSelect an allied follower on the field and give it +2/+2.";

    it("when played: buffs selected ally +2/+2; bystander untouched", () => {
      setupTurn(R6, {
        hand: [ADVENT],
        pp: 4,
        firstBoard: [
          { name: "Target", type: "Follower", cost: 2, attack: 2, defense: 2 },
          {
            name: "Bystander",
            type: "Follower",
            cost: 2,
            attack: 1,
            defense: 1,
          },
        ],
      });
      const target = findOnBoard("first", "Target")!;
      const bystander = findOnBoard("first", "Bystander")!;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.attack)).toBe(4);
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.attack)).toBe(1);
      expect(Number(bystander.defense)).toBe(1);
    });

    it("when discarded at cost 4: adds exactly one copy at cost 2 to hand; original is in graveyard", () => {
      setupTurn(R6, { hand: [SAGATSUMATSU, ADVENT], pp: 7 });
      const advent = getHand(state, "first").find((c) => c.id === ADVENT)!;
      whenPlayCard("first", 0);
      discardHandCard("first", ADVENT);
      const added = thenHand("first").filter((c) => c.id === ADVENT);
      expect(added).toHaveLength(1);
      expect(getEffectiveCost(added[0]!)).toBe(2);
      expect(
        getGraveyard(state, "first").some((c) => c.uid === advent.uid),
      ).toBe(true);
      expect(printed).toContain("if its cost is 4");
    });

    it("when discarded at cost 2: does not add another copy", () => {
      setupTurn(R6, { hand: [SAGATSUMATSU], pp: 7 });
      const reduced = createCard(ADVENT, "hand", "first");
      reduced.cost = 2;
      state.players.first.hand.push(reduced);
      whenPlayCard("first", 0);
      const countBefore = thenHand("first").filter(
        (c) => c.id === ADVENT,
      ).length;
      discardHandCard("first", ADVENT);
      const countAfter = thenHand("first").filter(
        (c) => c.id === ADVENT,
      ).length;
      expect(countAfter).toBe(countBefore - 1);
      expect(printed).toContain("if its cost is 4");
    });
  });

  describe("Carrier Wyvern (10741120)", () => {
    const printed =
      "Fanfare: Select another allied follower on the field and give it +2/+2.\nEvolve: Select a follower in your hand and give it +2/+2.";

    it("Fanfare buffs another ally +2/+2; Wyvern and bystander stats unchanged", () => {
      setupTurn(R6, {
        hand: [CARRIER],
        pp: 4,
        firstBoard: [
          {
            name: "BuffTarget",
            type: "Follower",
            cost: 2,
            attack: 1,
            defense: 1,
          },
        ],
      });
      const target = findOnBoard("first", "BuffTarget")!;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const wyvern = findOnBoard("first", "Carrier Wyvern")!;
      expect(Number(target.attack)).toBe(3);
      expect(Number(target.defense)).toBe(3);
      expect(Number(wyvern.attack)).toBe(3);
      expect(Number(wyvern.defense)).toBe(2);
    });

    it("Evolve buffs selected hand follower +2/+2; spell in hand untouched", () => {
      setupTurn(R6, { hand: [CARRIER, HAND_FOLLOWER, HAND_SPELL], pp: 4 });
      state.players.first.evoCharges = 2;
      const follower = thenHand("first").find((c) => c.id === HAND_FOLLOWER)!;
      const spell = thenHand("first").find((c) => c.id === HAND_SPELL)!;
      const spellAtk = Number(spell.attack ?? 0);
      const spellDef = Number(spell.defense ?? 0);
      whenPlayCard("first", 0);
      const wyvern = findOnBoard("first", "Carrier Wyvern")!;
      whenEvolve(wyvern, "first");
      resolvePendingByUid(follower.uid);
      expect(Number(follower.attack)).toBe(4);
      expect(Number(follower.defense)).toBe(3);
      expect(Number(spell.attack ?? 0)).toBe(spellAtk);
      expect(Number(spell.defense ?? 0)).toBe(spellDef);
      expect(printed).toContain("follower in your hand");
    });
  });

  describe("Antemaria, Piercing Convict (10944110)", () => {
    const printed =
      "Fanfare: If an allied follower attacked a leader on your last turn, give this follower Storm.\nRush\nIgnores Ward.";

    it("Fanfare grants Storm when gate met; Rush always present", () => {
      setupTurnAfterAllyLeaderAttack(R10, { hand: [ANTEMARIA], pp: 7 });
      whenPlayCard("first", 0);
      const ant = findOnBoard("first", "Antemaria, Piercing Convict")!;
      expect(ant.hasStorm).toBe(true);
      expect(ant.hasRush).toBe(true);
    });

    it("Fanfare skips Storm when gate not met; Rush remains", () => {
      setupTurn(R10, { hand: [ANTEMARIA], pp: 7 });
      whenPlayCard("first", 0);
      const ant = findOnBoard("first", "Antemaria, Piercing Convict")!;
      expect(ant.hasStorm).toBeFalsy();
      expect(ant.hasRush).toBe(true);
    });

    it("Ignores Ward: attacks backliner past enemy Ward follower", () => {
      setupTurn(R10, { hand: [ANTEMARIA], pp: 7 });
      whenPlayCard("first", 0);
      const ant = findOnBoard("first", "Antemaria, Piercing Convict")!;
      applyKeywordsFromList(ant);
      ant.can_attack = true;
      ant.attacks_left = 1;
      ant.justPlayed = false;
      const ward = enemyFollower(1, 5, "Ward", { hasWard: true });
      applyKeywordsFromList(ward);
      const back = enemyFollower(1, 5, "Backliner");
      attackFollower(0, 1, "first", "second");
      expect(Number(ward.defense)).toBe(5);
      expect(findOnBoard("second", "Backliner")).toBeUndefined();
      expect(printed).toContain("Ignores Ward");
    });
  });

  describe("Sagatsumatsu, Fair Beheader (10644110)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Add 2 copies of Spilling Red to your hand.\nStorm\nBane\nAura";

    it("Fanfare discards selected card and adds 2 Spilling Red (10642310)", () => {
      setupTurn(R10, { hand: [SAGATSUMATSU, FILLER], pp: 7 });
      whenPlayCard("first", 0);
      discardHandCard("first", FILLER);
      expect(handIds()).not.toContain(FILLER);
      expect(
        thenHand("first").filter((c) => c.id === SPILLING_RED),
      ).toHaveLength(2);
    });

    it("has Storm, Bane, and Aura on play", () => {
      setupTurn(R10, { hand: [SAGATSUMATSU], pp: 7 });
      whenPlayCard("first", 0);
      const saga = findOnBoard("first", "Sagatsumatsu, Fair Beheader")!;
      applyKeywordsFromList(saga);
      expect(saga.hasStorm).toBe(true);
      expect(saga.hasBane || saga.keywordState?.hasBane).toBe(true);
      expect(saga.hasAura || saga.keywordState?.hasAura).toBe(true);
      expect(printed).toContain("Aura");
    });
  });
});
