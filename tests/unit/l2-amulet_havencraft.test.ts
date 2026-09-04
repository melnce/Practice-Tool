/**
 * L2 real-card tests — Amulet Havencraft deck (14 cards).
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
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getGraveyard,
  getBanish,
  getShadows,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const EARRINGS = "10761210";
const WINGED_STATUE = "10062210";
const ACADEMY_HIJINKS = "10863210";
const ROARING_BASILICA = "10961210";
const SCRIPTURE = "10662210";
const TIMEPIECE = "10762210";
const UNHOLY_WATER = "10661210";
const TRIDENT = "10763210";
const KANDIMA = "10664110";
const SUBLIME_ELD_TOME = "10663210";
const PROSTRATING = "10661110";
const OMERIO = "10964120";
const INITIA = "10764120";
const LYANTHOTH = "10664120";

const SERENE_SANCTUARY = "10161210"; // cost 2 amulet with Last Words
const FILLER = "10111310";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R9 = 9;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
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
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
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
  resolvePendingTarget(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function boardNames(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => c.name);
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

function allyAmulet(name = "Sigil", cost = 1) {
  const c = createCard({ name, type: "Amulet", cost }, "board", "first");
  state.players.first.board.push(c);
  return c;
}

function enemyAmulet(name = "EnemyAmulet") {
  const c = createCard({ name, type: "Amulet", cost: 2 }, "board", "second");
  state.players.second.board.push(c);
  return c;
}

function enemyLastWordsFollower(name = "LWTarget") {
  const lw = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 3 },
    "board",
    "second",
  );
  lw.peak_defense = 3;
  lw.hasLastWords = true;
  lw.lastWordsEffects = [
    { op: "summon", source: "named", name: "Fairy", count: 1 },
  ];
  state.players.second.board.push(lw);
  return lw;
}

function recordDestroyedAmulet(
  id: string,
  owner: "first" | "second" = "first",
) {
  const card = createCard(id, "graveyard", owner);
  card.hasLastWords = true;
  state.players[owner].graveyard.push(card);
  recordDestroyed(state, owner, card);
  return card;
}

function amuletIndex(name: string): number {
  return state.players.first.board.findIndex((c) => c.name === name);
}

function triggerLastWords(amuletId: string, amuletName: string): void {
  const card = findOnBoard("first", amuletName)!;
  const lwKw = (getCardById(amuletId)!.keywords as any[]).find(
    (k) => k?.name === "LastWords",
  );
  runEffects(lwKw.effects, "first", card);
  cleanupDead();
}

describe("L2 Amulet Havencraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Earrings of Sunlight (10761210)", () => {
    const printed =
      "Fanfare: Select a card in your hand and return it to deck. Draw a card.\nEngage: Destroy this card. Replicate the effects of this card's Fanfare ability.";

    const RETURN_CARD = "10001110";
    const DRAW_TOP = "10021110";

    it("Fanfare: returns selected hand card to deck and draws stacked top card", () => {
      setupTurn(R6, {
        hand: [EARRINGS, RETURN_CARD],
        deck: [DRAW_TOP],
        pp: 1,
      });
      const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);

      expect(deckIds()).toContain(RETURN_CARD);
      expect(handIds()).not.toContain(RETURN_CARD);
      expect(handIds()).toContain(DRAW_TOP);
      expect(findOnBoard("first", "Earrings of Sunlight")).toBeDefined();
      expect(printed).toContain("return it to deck");
    });

    it("Engage: destroys this card on the field", () => {
      setupTurn(R6, {
        hand: [EARRINGS, RETURN_CARD],
        deck: [DRAW_TOP],
        pp: 1,
      });
      const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);
      engageAmulet("first", amuletIndex("Earrings of Sunlight"));
      expect(findOnBoard("first", "Earrings of Sunlight")).toBeUndefined();
      expect(printed).toContain("Destroy this card");
    });

    it.fails(
      "Engage replicates Fanfare (return selected hand card to deck and draw) — 10761210: printed Engage replicates Fanfare; observed destroy only with no hand/deck change",
      () => {
        setupTurn(R6, {
          hand: [EARRINGS, RETURN_CARD, FILLER],
          deck: [DRAW_TOP, "10021120"],
          pp: 1,
        });
        const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
        whenPlayCard("first", 0);
        resolvePendingByUid(toReturn.uid);
        const engageReturn = thenHand("first").find((c) => c.id === FILLER)!;
        const snapshot = {
          hand: handIds().slice().sort(),
          deck: deckIds().slice().sort(),
        };
        engageAmulet("first", amuletIndex("Earrings of Sunlight"));
        if (state.pendingTargetEffect) {
          resolveFirstPending();
        }
        expect(findOnBoard("first", "Earrings of Sunlight")).toBeUndefined();
        expect(handIds()).not.toContain(engageReturn.id);
        expect(
          handIds().slice().sort().join() !== snapshot.hand.join() ||
            deckIds().slice().sort().join() !== snapshot.deck.join(),
        ).toBe(true);
      },
    );
  });

  describe("Winged Statue (10062210)", () => {
    const printed =
      "Countdown (4)\nLast Words: Summon a Holy Falcon.\nEngage (1): Advance this amulet's count by 1.";

    it("enters with Countdown (4)", () => {
      setupTurn(R6, { hand: [WINGED_STATUE], pp: 1 });
      whenPlayCard("first", 0);
      const statue = findOnBoard("first", "Winged Statue")!;
      expect(statue.countdown).toBe(4);
      expect(printed).toContain("Countdown (4)");
    });

    it("Engage (1): advances countdown by 1 and spends 1 PP", () => {
      setupTurn(R6, { hand: [WINGED_STATUE], pp: 2 });
      whenPlayCard("first", 0);
      const statue = findOnBoard("first", "Winged Statue")!;
      const ppBefore = getPP(state, "first");
      engageAmulet("first", amuletIndex("Winged Statue"));
      expect(statue.countdown).toBe(3);
      expect(getPP(state, "first")).toBe(ppBefore - 1);
    });

    it("Last Words at countdown 0: summons Holy Falcon", () => {
      setupTurn(R6, { hand: [WINGED_STATUE], pp: 2 });
      whenPlayCard("first", 0);
      engageAmulet("first", amuletIndex("Winged Statue"));
      expect(findOnBoard("first", "Winged Statue")!.countdown).toBe(3);
      whenEndTurn();
      whenEndTurn();
      state.players.first.pp = 1;
      engageAmulet("first", amuletIndex("Winged Statue"));
      whenEndTurn();
      whenEndTurn();
      state.players.first.pp = 1;
      engageAmulet("first", amuletIndex("Winged Statue"));
      whenEndTurn();
      whenEndTurn();
      state.players.first.pp = 1;
      engageAmulet("first", amuletIndex("Winged Statue"));
      cleanupDead();
      expect(findOnBoard("first", "Winged Statue")).toBeUndefined();
      expect(boardNames()).toContain("Holy Falcon");
      expect(printed).toContain("Summon a Holy Falcon");
    });
  });

  describe("Academy Hijinks (10863210)", () => {
    const printed =
      "Countdown (2)\nAt the end of your turn, draw a card and, if there's an evolved allied follower on the field, restore 1 defense to your leader. If there's a super-evolved allied follower on the field, restore 2 defense instead.";

    const DRAW_TOP = "10021110";

    it("owner EOT: always draws stacked top card", () => {
      setupTurn(R6, {
        hand: [ACADEMY_HIJINKS],
        deck: [DRAW_TOP],
        pp: 2,
        hp: 15,
      });
      whenPlayCard("first", 0);
      const handBefore = handIds().length;
      whenEndTurn();
      expect(handIds().length).toBeGreaterThan(handBefore);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("draw a card");
    });

    it("owner EOT without evolved ally: no leader heal", () => {
      setupTurn(R6, { hand: [ACADEMY_HIJINKS], pp: 2, hp: 15 });
      whenPlayCard("first", 0);
      whenEndTurn();
      expect(getHP(state, "first")).toBe(15);
    });

    it("owner EOT with evolved ally: restores 1 defense", () => {
      setupTurn(R6, { hand: [ACADEMY_HIJINKS], pp: 2, hp: 15 });
      whenPlayCard("first", 0);
      const ally = allyFollower(2, 2, "EvolvedAlly");
      ally.isEvolved = true;
      ally.hasEvolved = true;
      whenEndTurn();
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("restore 1 defense");
    });

    it("owner EOT with super-evolved ally: restores 2 defense instead of 1", () => {
      setupTurn(R7, { hand: [ACADEMY_HIJINKS], pp: 2, hp: 15 });
      whenPlayCard("first", 0);
      const ally = allyFollower(2, 2, "SuperAlly");
      ally.isEvolved = true;
      ally.hasEvolved = true;
      ally.evoType = "super";
      whenEndTurn();
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("restore 2 defense instead");
    });

    it("opponent EOT: does not heal even with evolved ally present", () => {
      givenGameState({
        seed: 2,
        activePlayer: "second",
        roundCount: R6,
      })
        .withFirstHand([])
        .withFirstHP(15)
        .withFirstPP(0, 6)
        .build();
      state.gameStarted = true;
      state.phase = "main";
      const hijinks = createCard(ACADEMY_HIJINKS, "board", "first");
      applyKeywordsFromList(hijinks);
      state.players.first.board = [hijinks];
      const ally = allyFollower(2, 2, "EvolvedAlly");
      ally.isEvolved = true;
      ally.hasEvolved = true;
      const hpBefore = getHP(state, "first");
      whenEndTurn();
      expect(getHP(state, "first")).toBe(hpBefore);
    });
  });

  describe("Roaring Basilica (10961210)", () => {
    const printed =
      "Countdown (3)\nLast Words: Summon a Holyflame Tiger. Deal 4 damage to a random enemy follower.\nEngage (3): Advance this amulet's count by 3.";

    it("enters with Countdown (3)", () => {
      setupTurn(R6, { hand: [ROARING_BASILICA], pp: 2 });
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Roaring Basilica")!.countdown).toBe(3);
    });

    it("Engage (3): advances countdown by 3 and triggers Last Words", () => {
      setupTurn(R6, { hand: [ROARING_BASILICA], pp: 5 });
      const foe = enemyFollower(2, 6, "Foe");
      whenPlayCard("first", 0);
      engageAmulet("first", amuletIndex("Roaring Basilica"));
      cleanupDead();
      expect(findOnBoard("first", "Roaring Basilica")).toBeUndefined();
      expect(boardNames()).toContain("Holyflame Tiger");
      expect(Number(foe.defense)).toBeLessThan(6);
      expect(printed).toContain("Deal 4 damage");
    });
  });

  describe("Scripture of Salvation (10662210)", () => {
    const printed =
      "Countdown (4)\nLast Words: Draw 2 cards. Deal 2 damage to all enemy followers. Restore 2 defense to your leader.";

    const DRAW_A = "10021110";
    const DRAW_B = "10021120";

    it("enters with Countdown (4)", () => {
      setupTurn(R6, { hand: [SCRIPTURE], pp: 2 });
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Scripture of Salvation")!.countdown).toBe(4);
    });

    it("Last Words: draws 2 stacked cards, damages all enemies, restores leader", () => {
      setupTurn(R6, {
        hand: [SCRIPTURE],
        deck: [DRAW_A, DRAW_B],
        pp: 2,
        hp: 15,
      });
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      triggerLastWords(SCRIPTURE, "Scripture of Salvation");

      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Timepiece of Perfection (10762210)", () => {
    const printed =
      "Enhance (4): Deal 1 damage to all enemy followers.\nEngage: Destroy this card. Deal 1 damage to all enemy followers.";

    it("without Enhance(4): plays amulet without damaging enemies", () => {
      setupTurn(R6, { hand: [TIMEPIECE], pp: 2 });
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Timepiece of Perfection")).toBeDefined();
      expect(Number(a.defense)).toBe(4);
      expect(Number(b.defense)).toBe(4);
    });

    it("Enhance(4): deals 1 damage to all enemy followers and still plays amulet", () => {
      setupTurn(R6, { hand: [TIMEPIECE], pp: 4 });
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(3);
      expect(Number(b.defense)).toBe(3);
      expect(findOnBoard("first", "Timepiece of Perfection")).toBeDefined();
      expect(printed).toContain("Enhance (4)");
    });

    it("Engage: destroys amulet and deals 1 to all enemy followers", () => {
      setupTurn(R6, { hand: [TIMEPIECE], pp: 2 });
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      engageAmulet("first", amuletIndex("Timepiece of Perfection"));
      cleanupDead();
      expect(findOnBoard("first", "Timepiece of Perfection")).toBeUndefined();
      expect(Number(a.defense)).toBe(3);
      expect(Number(b.defense)).toBe(3);
    });
  });

  describe("Unholy Water (10661210)", () => {
    const printed =
      "Countdown (3)\nLast Words: Draw a card. Destroy a random enemy follower.\nEngage (1): Advance this amulet's count by 1.";

    const DRAW_TOP = "10021110";

    it("enters with Countdown (3)", () => {
      setupTurn(R6, { hand: [UNHOLY_WATER], pp: 2 });
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Unholy Water")!.countdown).toBe(3);
    });

    it("Engage (1): advances countdown by 1", () => {
      setupTurn(R6, { hand: [UNHOLY_WATER], pp: 3 });
      whenPlayCard("first", 0);
      const water = findOnBoard("first", "Unholy Water")!;
      engageAmulet("first", amuletIndex("Unholy Water"));
      expect(water.countdown).toBe(2);
    });

    it("Last Words: draws stacked card and destroys a random enemy follower", () => {
      setupTurn(R6, {
        hand: [UNHOLY_WATER],
        deck: [DRAW_TOP],
        pp: 2,
      });
      enemyFollower(2, 4, "Foe");
      whenPlayCard("first", 0);
      triggerLastWords(UNHOLY_WATER, "Unholy Water");
      expect(handIds()).toContain(DRAW_TOP);
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(printed).toContain("Destroy a random enemy follower");
    });
  });

  describe("Trident of Eroding Tides (10763210)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 4 damage.\nEngage: Destroy this card. Select an enemy follower on the field and deal it 2 damage.";

    it("Fanfare: deals 4 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [TRIDENT], pp: 3 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("Engage: destroys amulet and deals 2 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [TRIDENT], pp: 3 });
      whenPlayCard("first", 0);
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      engageAmulet("first", amuletIndex("Trident of Eroding Tides"));
      resolvePendingByUid(target.uid);
      expect(findOnBoard("first", "Trident of Eroding Tides")).toBeUndefined();
      expect(Number(target.defense)).toBe(6);
      expect(Number(bystander.defense)).toBe(8);
      expect(printed).toContain("deal it 2 damage");
    });
  });

  describe("Kandima, Sublime Hatred (10664110)", () => {
    const printed =
      "Fanfare: Summon a copy each of 2 random differently named allied amulets destroyed this match with Last Words and a base cost of 2 or less.\nSuper-Evolve: Select another card on the field and destroy it. If you selected an allied amulet, deal 3 damage to all enemy followers.";

    it("Fanfare: summons 2 distinct destroyed LW amulets by name", () => {
      setupTurn(R6, { hand: [KANDIMA], pp: 4 });
      recordDestroyedAmulet(WINGED_STATUE);
      recordDestroyedAmulet(SERENE_SANCTUARY);
      whenPlayCard("first", 0);
      const amulets = thenBoard("first").filter((c) => c.type === "Amulet");
      const names = new Set(amulets.map((c) => c.name));
      expect(names.has("Winged Statue")).toBe(true);
      expect(names.has("Serene Sanctuary")).toBe(true);
      expect(names.size).toBeGreaterThanOrEqual(2);
      expect(printed).toContain("differently named");
    });

    it("Super-Evolve destroying enemy amulet: no follower damage", () => {
      setupTurn(R6, { hand: [KANDIMA], pp: 4 });
      const foeAmulet = enemyAmulet();
      const foe = enemyFollower(2, 6);
      whenPlayCard("first", 0);
      const kandima = findOnBoard("first", "Kandima, Sublime Hatred")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      onEvolve(kandima, "first", "super");
      resolvePendingByUid(foeAmulet.uid);
      expect(Number(foe.defense)).toBe(6);
    });

    it("Super-Evolve destroying allied amulet: deals 3 to all enemy followers", () => {
      setupTurn(R6, { hand: [KANDIMA], pp: 4 });
      const ally = allyAmulet("Sacrifice", 2);
      const foe = enemyFollower(2, 6);
      whenPlayCard("first", 0);
      const kandima = findOnBoard("first", "Kandima, Sublime Hatred")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      onEvolve(kandima, "first", "super");
      resolvePendingByUid(ally.uid);
      expect(Number(foe.defense)).toBe(3);
      expect(printed).toContain("deal 3 damage to all enemy followers");
    });
  });

  describe("Sublime Eld Tome (10663210)", () => {
    const printed =
      "Fanfare: Select another card on the field and destroy it. If you selected an allied amulet, recover 2 play points.\nCountdown (2)\nLast Words: Summon a copy of a random allied amulet destroyed this match with Last Words and a base cost of 2 or less.";

    it("Fanfare destroying enemy amulet: no PP recovery", () => {
      setupTurn(R6, { hand: [SUBLIME_ELD_TOME], pp: 4 });
      const foe = enemyAmulet();
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      expect(getPP(state, "first")).toBe(0);
    });

    it("Fanfare destroying allied amulet: recovers 2 PP", () => {
      setupTurn(R6, { hand: [SUBLIME_ELD_TOME], pp: 4 });
      const ally = allyAmulet("Sacrifice", 2);
      whenPlayCard("first", 0);
      resolvePendingByUid(ally.uid);
      expect(getPP(state, "first")).toBe(2);
    });

    it("enters with Countdown (2)", () => {
      setupTurn(R6, { hand: [SUBLIME_ELD_TOME], pp: 4 });
      whenPlayCard("first", 0);
      const tome = findOnBoard("first", "Sublime Eld Tome")!;
      expect(tome.countdown).toBe(2);
    });

    it("Last Words: summons a destroyed allied LW amulet", () => {
      setupTurn(R6, { hand: [SUBLIME_ELD_TOME], pp: 4 });
      recordDestroyedAmulet(WINGED_STATUE);
      whenPlayCard("first", 0);
      const ally = allyAmulet("Fodder", 1);
      resolvePendingByUid(ally.uid);
      const tome = findOnBoard("first", "Sublime Eld Tome")!;
      tome.countdown = 0;
      cleanupDead();
      triggerLastWords(SUBLIME_ELD_TOME, "Sublime Eld Tome");
      expect(boardNames()).toContain("Winged Statue");
      expect(printed).toContain("Summon a copy");
    });
  });

  describe("Prostrating Coward (10661110)", () => {
    const followerPrinted =
      "When this follower enters the field, restore 2 defense to your leader.\nBane\nWard";
    const crystallizePrinted =
      "Crystallize (2): Countdown (3)\nLast Words: Summon a Prostrating Coward.";

    it("entering at 5 cost: restores 2 leader HP and has Bane and Ward", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 5, hp: 15 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(17);
      const coward = findOnBoard("first", "Prostrating Coward")!;
      expect(coward.hasBane).toBe(true);
      expect(coward.hasWard).toBe(true);
      expect(coward.type).toBe("Follower");
      expect(followerPrinted).toContain("restore 2 defense");
    });

    it("follower form has no Last Words: destroying it does not summon Prostrating Coward", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 5, hp: 20 });
      whenPlayCard("first", 0);
      const coward = findOnBoard("first", "Prostrating Coward")!;
      expect(coward.type).toBe("Follower");
      expect(Boolean(coward.hasLastWords)).toBe(false);
      destroyTarget(coward, "first");
      cleanupDead();
      expect(
        thenBoard("first").filter((c) => c.name === "Prostrating Coward"),
      ).toHaveLength(0);
      expect(followerPrinted).not.toContain("Last Words");
    });

    it("Crystallize (2): becomes amulet with Countdown (3); enter heal does not run", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 2, hp: 15 });
      expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
        "done",
      );
      const amulet = findOnBoard("first", "Prostrating Coward")!;
      expect(amulet.type).toBe("Amulet");
      expect(amulet.countdown).toBe(3);
      expect(getHP(state, "first")).toBe(15);
      expect(Boolean(amulet.hasWard)).toBe(false);
      expect(Boolean(amulet.hasBane)).toBe(false);
      expect(crystallizePrinted).toContain("Countdown (3)");
    });

    it("Crystallize amulet Last Words: destroying amulet summons Prostrating Coward", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 2, hp: 20 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = findOnBoard("first", "Prostrating Coward")!;
      expect(amulet.type).toBe("Amulet");
      destroyTarget(amulet, "first");
      cleanupDead();
      expect(
        thenBoard("first").some(
          (c) => c.name === "Prostrating Coward" && c.type === "Follower",
        ),
      ).toBe(true);
      expect(crystallizePrinted).toContain("Summon a Prostrating Coward");
    });

    it("Crystallize amulet Last Words: at countdown 0 summons Prostrating Coward", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 2, hp: 20 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = findOnBoard("first", "Prostrating Coward")!;
      amulet.countdown = 0;
      cleanupDead();
      expect(
        thenBoard("first").some(
          (c) => c.name === "Prostrating Coward" && c.type === "Follower",
        ),
      ).toBe(true);
      expect(crystallizePrinted).toContain("Countdown (3)");
    });
  });

  describe("Omerio, Winged Revenant (10964120)", () => {
    const printed =
      "Whenever an allied amulet is destroyed, activate an ability in sequence from the following.\n1. Deal 3 damage to 2 random enemy followers.\n2. Restore 2 defense to your leader.\n3. Summon a Holy Falcon.\nEvolve: Destroy all allied amulets.";

    function playOmerio() {
      setupTurn(R8, { hand: [OMERIO], pp: 6 });
      whenPlayCard("first", 0);
      return findOnBoard("first", "Omerio, Winged Revenant")!;
    }

    it("1st allied amulet destroyed: deals 3 damage to enemy followers", () => {
      playOmerio();
      enemyFollower(2, 6, "Foe");
      const amulet = allyAmulet("Trigger1");
      destroyTarget(amulet, "first");
      cleanupDead();
      expect(Number(getBoard(state, "second")[0]!.defense)).toBeLessThan(6);
    });

    it("2nd allied amulet destroyed: restores 2 leader HP", () => {
      playOmerio();
      state.players.first.hp = 15;
      destroyTarget(allyAmulet("T1"), "first");
      cleanupDead();
      destroyTarget(allyAmulet("T2"), "first");
      cleanupDead();
      expect(getHP(state, "first")).toBe(17);
    });

    it("3rd allied amulet destroyed: summons Holy Falcon", () => {
      playOmerio();
      destroyTarget(allyAmulet("T1"), "first");
      cleanupDead();
      destroyTarget(allyAmulet("T2"), "first");
      cleanupDead();
      destroyTarget(allyAmulet("T3"), "first");
      cleanupDead();
      expect(boardNames()).toContain("Holy Falcon");
    });

    it("Evolve: destroys all allied amulets on field", () => {
      playOmerio();
      allyAmulet("Stay1");
      allyAmulet("Stay2");
      const omerio = findOnBoard("first", "Omerio, Winged Revenant")!;
      state.players.first.evoCharges = 2;
      onEvolve(omerio, "first", "normal");
      expect(getBoard(state, "first").every((c) => c.type !== "Amulet")).toBe(
        true,
      );
      expect(printed).toContain("Destroy all allied amulets");
    });
  });

  describe("Initia, Chief Ordination Officer (10764120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and banish it. If there are at least 3 allied amulets on the field, restore 3 defense to your leader.\nWard\nAura\nSuper-Evolve: Replicate the effects of this card's Fanfare ability.";

    // Fanfare both branches: tests/unit/l0-rotation-coverage.test.ts
    // "with 3 amulets: banishes selected enemy and restores 3 leader HP"
    // "with 2 amulets: banish still fires but leader is not healed"

    it("Super-Evolve: replicates Fanfare banish and conditional heal with 3 amulets", () => {
      setupTurn(R7, { hand: [INITIA], pp: 7 });
      state.players.first.hp = 10;
      allyAmulet("A1");
      allyAmulet("A2");
      allyAmulet("A3");
      const target = enemyLastWordsFollower("BanishMe");
      state.players.second.shadows = 0;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getHP(state, "first")).toBe(13);
      const initia = findOnBoard("first", "Initia, Chief Ordination Officer")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      const foe2 = enemyLastWordsFollower("BanishMe2");
      state.players.second.shadows = 0;
      onEvolve(initia, "first", "super");
      resolvePendingByUid(foe2.uid);

      expect(getBoard(state, "second").some((c) => c.uid === foe2.uid)).toBe(
        false,
      );
      expect(getGraveyard(state, "second")).toHaveLength(0);
      expect(getBanish(state, "second").some((c) => c.uid === foe2.uid)).toBe(
        true,
      );
      expect(getShadows(state, "second")).toBe(0);
      expect(getHP(state, "first")).toBe(16);
      expect(initia.hasWard).toBe(true);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Lyanthoth, Eld Tome (10664120)", () => {
    const printed =
      "Fanfare: Select 3 other cards on the field and destroy them.\nWard\nAt the end of your turn, reduce your faith's value by 10 to add a Depths of the Eld Tome to your hand.";

    // EOT faith payoff: tests/unit/lyanthoth-eot-faith.test.ts
    // "owner's EOT adds Depths when faith ≥ 10"
    // "opponent's EOT does not add Depths"

    it("Fanfare: destroys exactly 3 other field cards; bystander on field if only 3 targets", () => {
      setupTurn(R9, { hand: [LYANTHOTH], pp: 9 });
      const t1 = allyFollower(1, 1, "T1");
      const t2 = allyFollower(1, 1, "T2");
      const t3 = enemyFollower(1, 1, "T3");
      whenPlayCard("first", 0);
      resolvePendingByUid(t1.uid);
      resolvePendingByUid(t2.uid);
      resolvePendingByUid(t3.uid);
      expect(getBoard(state, "first")).toHaveLength(1);
      expect(getBoard(state, "second")).toHaveLength(0);
      const lyanthoth = findOnBoard("first", "Lyanthoth, Eld Tome")!;
      expect(lyanthoth.hasWard).toBe(true);
      expect(printed).toContain("destroy them");
    });

    it("enters with Ward", () => {
      setupTurn(R9, { hand: [LYANTHOTH], pp: 9 });
      const t1 = allyFollower(1, 1, "T1");
      const t2 = allyFollower(1, 1, "T2");
      const t3 = enemyFollower(1, 1, "T3");
      whenPlayCard("first", 0);
      resolvePendingByUid(t1.uid);
      resolvePendingByUid(t2.uid);
      resolvePendingByUid(t3.uid);
      expect(findOnBoard("first", "Lyanthoth, Eld Tome")!.hasWard).toBe(true);
    });
  });
});
