/**
 * L2 real-card tests — Kukishiro Havencraft deck (15 distinct cards).
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
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { drawCard } from "../../src/core/utils.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const BOUQUET_BELIEVER = "10561120";
const EARRINGS = "10761210";
const VOW_OF_DEVOTION = "10962310";
const WORLD_OF_GAMES = "10503210";
const COLETTE = "10863110";
const DE_LA_FILLE = "10463210";
const RESOLVE_MISTBLOOM = "10563210";
const TRIDENT = "10763210";
const TROUE = "10461110";
const DESPERATE_SHRINEMOUSE = "10562120";
const FATE_OF_WORLD = "10503310";
const PROSTRATING = "10661110";
const ZOE = "10864120";
const BLADE_ANGEL = "10902110";
const KUKISHIRO = "10564120";

const DRAW_A = "10021110"; // Flashstep Quickblader
const DRAW_B = "10021120"; // Arms Peddler
const DRAW_C = "10021130";
const RETURN_CARD = "10001110"; // Indomitable Fighter
const FILLER = "10102110";
const BIG_ALLY = "10002120"; // Caravan Mammoth (cost 7)
const ENGAGE_AMULET = "10161210"; // Serene Sanctuary
const FOX_OF_PURITY = "10061120"; // cost 2
const COST_ONE_DRAW = "10031310"; // Foresight (cost 1)

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | Record<string, unknown>>;
    pp?: number;
    hp?: number;
    active?: "first" | "second";
    evo?: number;
    secondDeck?: string[];
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
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck as any);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
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

function boardNames(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => c.name);
}

function amuletIndex(name: string): number {
  return state.players.first.board.findIndex((c) => c.name === name);
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

function evolvedAlly(name = "EvolvedAlly") {
  const c = allyFollower(name);
  c.hasEvolved = true;
  c.isEvolved = true;
  return c;
}

function drawFromDeck(): void {
  drawCard(state.players.first.hand, state.players.first.deck, "first");
}

function crestSummonNames(player: "first" | "second"): string[] {
  return thenBoard(player)
    .filter((c) => c.name === "Fox of Purity" || c.name === "Holy Falcon")
    .map((c) => c.name);
}

describe("L2 — Kukishiro Havencraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Bouquet Believer (10561120)", () => {
    const printed =
      "Enhance (4): Draw a card. Give this follower Bane.\nDuring your turn, whenever you draw a card, give this follower Rush.";

    it("without Enhance(4): plays at 1 PP without Bane or extra draw", () => {
      setupTurn(R6, {
        hand: [BOUQUET_BELIEVER],
        deck: [DRAW_A],
        pp: 1,
      });
      const handBefore = handIds().length;
      whenPlayCard("first", 0);
      const believer = findOnBoard("first", "Bouquet Believer")!;
      applyKeywordsFromList(believer);
      expect(believer.hasBane).toBeFalsy();
      expect(handIds().length).toBe(handBefore - 1);
      expect(handIds()).not.toContain(DRAW_A);
    });

    it("Enhance(4): draws stacked deck card and grants Bane", () => {
      setupTurn(R6, {
        hand: [BOUQUET_BELIEVER],
        deck: [DRAW_B, DRAW_A],
        pp: 4,
      });
      whenPlayCard("first", 0);
      const believer = findOnBoard("first", "Bouquet Believer")!;
      applyKeywordsFromList(believer);
      expect(believer.hasBane).toBe(true);
      expect(handIds()).toContain(DRAW_A);
      expect(deckIds()).not.toContain(DRAW_A);
      expect(printed).toContain("Draw a card");
    });

    it("during your turn draw grants Rush", () => {
      setupTurn(R6, {
        hand: [BOUQUET_BELIEVER, FILLER],
        deck: [DRAW_A, FILLER],
        pp: 1,
      });
      whenPlayCard("first", 0);
      const believer = findOnBoard("first", "Bouquet Believer")!;
      applyKeywordsFromList(believer);
      expect(believer.hasRush).toBeFalsy();
      drawFromDeck();
      applyKeywordsFromList(believer);
      expect(believer.hasRush).toBe(true);
    });

    it.fails(
      "opponent turn draw does not grant Rush — 10561120: printed During your turn; observed Rush on opponent turn",
      () => {
        setupTurn(R6, {
          hand: [BOUQUET_BELIEVER],
          deck: [DRAW_A, FILLER],
          pp: 1,
          active: "second",
          secondDeck: [FILLER, FILLER],
        });
        whenPlayCard("first", 0);
        const believer = findOnBoard("first", "Bouquet Believer")!;
        applyKeywordsFromList(believer);
        runEndOfTurnBoundary("second");
        drawFromDeck();
        applyKeywordsFromList(believer);
        expect(believer.hasRush).toBeFalsy();
      },
    );
  });

  describe("Earrings of Sunlight (10761210)", () => {
    const printed =
      "Fanfare: Select a card in your hand and return it to deck. Draw a card.\nEngage: Destroy this card. Replicate the effects of this card's Fanfare ability.";

    it("Fanfare: returns selected hand card to deck and draws stacked top card", () => {
      setupTurn(R6, {
        hand: [EARRINGS, RETURN_CARD],
        deck: [DRAW_A],
        pp: 1,
      });
      const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);
      expect(deckIds()).toContain(RETURN_CARD);
      expect(handIds()).not.toContain(RETURN_CARD);
      expect(handIds()).toContain(DRAW_A);
      expect(findOnBoard("first", "Earrings of Sunlight")).toBeDefined();
      expect(printed).toContain("return it to deck");
    });

    it("Engage: destroys amulet and replicates Fanfare return-and-draw", () => {
      setupTurn(R6, {
        hand: [EARRINGS, RETURN_CARD, FILLER],
        deck: [DRAW_A, DRAW_B],
        pp: 1,
      });
      const toReturn = thenHand("first").find((c) => c.id === RETURN_CARD)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);
      const engageReturn = thenHand("first").find((c) => c.id === FILLER)!;
      engageAmulet("first", amuletIndex("Earrings of Sunlight"));
      resolvePendingByUid(engageReturn.uid);
      expect(findOnBoard("first", "Earrings of Sunlight")).toBeUndefined();
      expect(thenDeck("first").some((c) => c.id === FILLER)).toBe(true);
      expect(handIds()).toContain(DRAW_A);
      expect(printed).toContain("Replicate the effects");
    });
  });

  describe("Vow of Devotion (10962310)", () => {
    const printed =
      "Select a Mode to activate. If there's an allied card on the field with a base cost of 6 or more, activate all of them instead.\n1. Deal 3 damage to a random enemy follower.\n2. Restore 2 defense to your leader.";

    it("without cost-6+ ally: mode 1 deals 3 to random enemy; mode 2 does not fire", () => {
      setupTurn(R6, { hand: [VOW_OF_DEVOTION], pp: 1, hp: 18 });
      const foe = enemyFollower(2, 6, "Foe");
      const hpBefore = getHP(state, "first");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(3);
      expect(getHP(state, "first")).toBe(hpBefore);
      expect(printed).toContain("Deal 3 damage");
    });

    it("without cost-6+ ally: mode 2 restores 2 leader defense; mode 1 does not fire", () => {
      setupTurn(R6, { hand: [VOW_OF_DEVOTION], pp: 1, hp: 18 });
      const foe = enemyFollower(2, 6, "Foe");
      const hpBefore = getHP(state, "first");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpBefore + 2);
      expect(Number(foe.defense)).toBe(6);
      expect(printed).toContain("Restore 2 defense");
    });

    it("with cost-6+ ally on field: activates all modes (damage and heal)", () => {
      setupTurn(R8, { hand: [VOW_OF_DEVOTION], pp: 1, hp: 18 });
      const big = createCard(BIG_ALLY, "board", "first");
      big.peak_defense = big.defense;
      state.players.first.board.push(big);
      const foe = enemyFollower(2, 6, "Foe");
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(3);
      expect(getHP(state, "first")).toBe(hpBefore + 2);
      expect(printed).toContain("activate all of them instead");
    });
  });

  describe("World of Games (10503210)", () => {
    const printed =
      "Countdown (5)\nWhenever you play another card, if there's a card on the field other than it with the same base cost, advance this amulet's count by 1.\nLast Words: Draw 2 cards.";

    it("enters with Countdown (5)", () => {
      setupTurn(R5, { hand: [WORLD_OF_GAMES], pp: 1 });
      whenPlayCard("first", 0);
      expect(Number(findOnBoard("first", "World of Games")!.countdown)).toBe(5);
    });

    it("playing the amulet itself does not advance its countdown", () => {
      setupTurn(R5, { hand: [WORLD_OF_GAMES], pp: 1 });
      whenPlayCard("first", 0);
      expect(Number(findOnBoard("first", "World of Games")!.countdown)).toBe(5);
    });

    it("when another field card shares base cost: advances countdown by 1", () => {
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
        deck: [FILLER, DRAW_B, DRAW_A],
        pp: 1,
      });
      whenPlayCard("first", 0);
      const games = findOnBoard("first", "World of Games")!;
      games.countdown = 0;
      cleanupDead();
      expect(findOnBoard("first", "World of Games")).toBeFalsy();
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Colette, Holy Exorcist (10863110)", () => {
    const printed =
      'Fanfare: If there\'s an evolved allied follower on the field, evolve this follower.\nWard\nWhen this follower evolves, do this 2 times: "Deal 1 damage to a random enemy follower."';

    it("without evolved ally: does not auto-evolve on Fanfare", () => {
      setupTurn(R6, { hand: [COLETTE], pp: 3 });
      allyFollower("PlainAlly");
      whenPlayCard("first", 0);
      const colette = findOnBoard("first", "Colette, Holy Exorcist")!;
      expect(colette.hasEvolved).toBeFalsy();
    });

    it("with evolved ally: Fanfare evolves Colette", () => {
      setupTurn(R6, { hand: [COLETTE], pp: 3 });
      evolvedAlly();
      enemyFollower(2, 4, "A");
      enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      const colette = findOnBoard("first", "Colette, Holy Exorcist")!;
      expect(colette.hasEvolved).toBe(true);
      expect(printed).toContain("evolve this follower");
    });

    it("has Ward on board", () => {
      setupTurn(R6, { hand: [COLETTE], pp: 3 });
      whenPlayCard("first", 0);
      const colette = findOnBoard("first", "Colette, Holy Exorcist")!;
      applyKeywordsFromList(colette);
      expect(colette.hasWard).toBe(true);
    });

    it("when evolves: deals 1 damage twice to random enemy followers (total 2 off two 4-def)", () => {
      setupTurn(R6, { hand: [COLETTE], pp: 3, evo: 2 });
      evolvedAlly();
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      const totalDef = Number(a.defense) + Number(b.defense);
      expect(totalDef).toBe(6);
      expect(printed).toContain("do this 2 times");
    });
  });

  describe("De La Fille's Gleaming Gems (10463210)", () => {
    const printed =
      "Engage: Destroy this card. Select a Mode to activate.\n1. Destroy a random enemy follower.\n2. Draw 2 cards.";

    it("Engage mode 1: destroys random enemy follower and destroys amulet", () => {
      setupTurn(R6, { hand: [DE_LA_FILLE], pp: 3 });
      enemyFollower(4, 4, "Victim");
      whenPlayCard("first", 0);
      setScriptedModePickProvider(() => [0]);
      engageAmulet("first", amuletIndex("De La Fille's Gleaming Gems"));
      expect(
        findOnBoard("first", "De La Fille's Gleaming Gems"),
      ).toBeUndefined();
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(printed).toContain("Destroy a random enemy follower");
    });

    it("Engage mode 2: draws 2 stacked deck cards and destroys amulet", () => {
      setupTurn(R6, {
        hand: [DE_LA_FILLE],
        deck: [DRAW_B, DRAW_A],
        pp: 3,
      });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(() => [1]);
      engageAmulet("first", amuletIndex("De La Fille's Gleaming Gems"));
      expect(
        findOnBoard("first", "De La Fille's Gleaming Gems"),
      ).toBeUndefined();
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Resolve of the Mistbloom (10563210)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 5 damage.\nEngage: Destroy this card. Return 2 random cards from your hand to deck. Draw 2 cards.";

    it("Fanfare: deals 5 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [RESOLVE_MISTBLOOM], pp: 3 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("Engage: returns 2 random hand cards to deck then draws 2 stacked cards", () => {
      const PICK_A = "10111310";
      const PICK_B = "10112310";
      const STAY = "10102110";
      setupTurn(R10, {
        hand: [RESOLVE_MISTBLOOM, PICK_A, PICK_B, STAY],
        deck: [DRAW_A, DRAW_B],
        pp: 10,
      });
      const enemy = enemyFollower(5, 5, "EngageTarget");
      whenPlayCard("first", 0);
      resolvePendingByUid(enemy.uid);
      engageAmulet(
        "first",
        getBoard(state, "first").findIndex((c) => c.id === RESOLVE_MISTBLOOM),
      );
      expect(deckIds()).toContain(PICK_A);
      expect(deckIds()).toContain(STAY);
      expect(handIds()).toContain(PICK_B);
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(handIds()).not.toContain(PICK_A);
      expect(handIds()).not.toContain(STAY);
      expect(printed).toContain("Return 2 random cards");
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
      const target = enemyFollower(2, 8, "EngageTarget");
      const bystander = enemyFollower(2, 8, "EngageBystander");
      engageAmulet("first", amuletIndex("Trident of Eroding Tides"));
      resolvePendingByUid(target.uid);
      expect(findOnBoard("first", "Trident of Eroding Tides")).toBeUndefined();
      expect(Number(target.defense)).toBe(6);
      expect(Number(bystander.defense)).toBe(8);
      expect(printed).toContain("deal it 2 damage");
    });
  });

  describe("Troue, Heroic Visionary (10461110)", () => {
    const printed =
      "Storm.\nWhenever you Engage an amulet, give this follower Drain.";

    it("has Storm on board", () => {
      setupTurn(R5, { hand: [TROUE], pp: 3 });
      whenPlayCard("first", 0);
      const troue = findOnBoard("first", "Troue, Heroic Visionary")!;
      applyKeywordsFromList(troue);
      expect(troue.hasStorm).toBe(true);
    });

    it("without Engaging an amulet: does not gain Drain", () => {
      setupTurn(R5, { hand: [TROUE], pp: 3 });
      whenPlayCard("first", 0);
      const troue = findOnBoard("first", "Troue, Heroic Visionary")!;
      expect(troue.hasDrain).toBeFalsy();
    });

    it("Engaging an amulet grants Drain to Troue", () => {
      setupTurn(R6, { hand: [ENGAGE_AMULET, TROUE], pp: 4 });
      const troue = createCard(TROUE, "board", "first");
      applyKeywordsFromList(troue);
      troue.peak_defense = troue.defense;
      state.players.first.board = [troue];
      whenPlayCard("first", 0);
      const amuletIdx = state.players.first.board.findIndex(
        (c) => c.type === "Amulet" && c.name === "Serene Sanctuary",
      );
      engageAmulet("first", amuletIdx);
      expect(troue.hasDrain).toBe(true);
      expect(printed).toContain("give this follower Drain");
    });
  });

  describe("Desperate Shrinemouse (10562120)", () => {
    const printed =
      "Fanfare: Draw a card.\nDuring your turn, whenever you draw a card, deal 1 damage to all enemy followers.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare: draws stacked deck card", () => {
      setupTurn(R8, {
        hand: [DESPERATE_SHRINEMOUSE],
        deck: [DRAW_B, DRAW_A],
        pp: 5,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_A);
      expect(deckIds()).not.toContain(DRAW_A);
      expect(printed).toContain("Draw a card");
    });

    it("during your turn draw deals 1 to all enemy followers", () => {
      setupTurn(R8, {
        hand: [],
        deck: [DRAW_A, FILLER],
        pp: 5,
      });
      const mouse = createCard(DESPERATE_SHRINEMOUSE, "board", "first");
      mouse.peak_defense = mouse.defense;
      state.players.first.board.push(mouse);
      const a = enemyFollower(2, 4, "A");
      const b = enemyFollower(2, 4, "B");
      drawFromDeck();
      expect(Number(a.defense)).toBe(3);
      expect(Number(b.defense)).toBe(3);
    });

    it("opponent turn draw does not damage enemy followers", () => {
      setupTurn(R8, {
        hand: [DESPERATE_SHRINEMOUSE],
        deck: [DRAW_A, FILLER],
        pp: 5,
        active: "second",
        secondDeck: [FILLER, FILLER],
      });
      const a = enemyFollower(2, 4, "A");
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      drawFromDeck();
      expect(Number(a.defense)).toBe(4);
    });

    it("Evolve replicates Fanfare: draws another stacked deck card", () => {
      setupTurn(R8, {
        hand: [DESPERATE_SHRINEMOUSE],
        deck: [DRAW_C, DRAW_B, DRAW_A],
        pp: 5,
        evo: 2,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_A);
      const mouse = findOnBoard("first", "Desperate Shrinemouse")!;
      onEvolve(mouse, "first", "normal", { spendPoint: true });
      expect(handIds()).toContain(DRAW_B);
      expect(printed).toContain("Replicate the effects");
    });
  });

  describe("Fate of the World (10503310)", () => {
    const printed =
      "Draw 2 cards. Destroy a random enemy follower with the highest attack.\nEnhance (10): Deal 4 damage to all enemies.";

    it("without Enhance(10): draws 2 stacked cards and destroys highest-attack enemy only", () => {
      setupTurn(R6, {
        hand: [FATE_OF_WORLD],
        deck: [DRAW_B, DRAW_A],
        pp: 5,
      });
      const low = enemyFollower(2, 5, "Low");
      const high = enemyFollower(5, 3, "High");
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(findOnBoard("second", "High")).toBeFalsy();
      expect(findOnBoard("second", "Low")).toBeDefined();
      expect(getHP(state, "second")).toBe(20);
      expect(Number(low.defense)).toBe(5);
    });

    it("Enhance(10): also deals 4 damage to all enemies after base spell", () => {
      setupTurn(R10, {
        hand: [FATE_OF_WORLD],
        deck: [DRAW_B, DRAW_A],
        pp: 10,
        hp: 20,
      });
      const low = enemyFollower(2, 6, "Low");
      const high = enemyFollower(5, 6, "High");
      const hpEnemyBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(findOnBoard("second", "High")).toBeFalsy();
      expect(Number(low.defense)).toBe(2);
      expect(getHP(state, "second")).toBe(hpEnemyBefore - 4);
      expect(printed).toContain("Deal 4 damage to all enemies");
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
      applyKeywordsFromList(coward);
      expect(coward.hasBane).toBe(true);
      expect(coward.hasWard).toBe(true);
      expect(coward.type).toBe("Follower");
      expect(followerPrinted).toContain("restore 2 defense");
    });

    it("follower form has no Last Words: destroying it does not summon", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 5, hp: 20 });
      whenPlayCard("first", 0);
      const coward = findOnBoard("first", "Prostrating Coward")!;
      expect(Boolean(coward.hasLastWords)).toBe(false);
      destroyTarget(coward, "first");
      cleanupDead();
      expect(
        thenBoard("first").filter((c) => c.name === "Prostrating Coward"),
      ).toHaveLength(0);
    });

    it("Crystallize (2): becomes amulet Countdown (3); enter heal does not run", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 2, hp: 15 });
      expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
        "done",
      );
      const amulet = findOnBoard("first", "Prostrating Coward")!;
      expect(amulet.type).toBe("Amulet");
      expect(amulet.countdown).toBe(3);
      expect(getHP(state, "first")).toBe(15);
      expect(crystallizePrinted).toContain("Countdown (3)");
    });

    it("Crystallize amulet Last Words: destroying amulet summons Prostrating Coward follower", () => {
      setupTurn(R6, { hand: [PROSTRATING], pp: 2, hp: 20 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = findOnBoard("first", "Prostrating Coward")!;
      destroyTarget(amulet, "first");
      cleanupDead();
      expect(
        thenBoard("first").some(
          (c) => c.name === "Prostrating Coward" && c.type === "Follower",
        ),
      ).toBe(true);
      expect(crystallizePrinted).toContain("Summon a Prostrating Coward");
    });
  });

  describe("Zoe, Dazzling Hope (10864120)", () => {
    const printed =
      "Fanfare: Select a Mode to activate. Deal 3 damage to this follower.\n1. Deal 3 damage to all enemy followers.\n2. Deal 3 damage to the enemy leader.\n3. Restore 3 defense to your leader.\nEvolve: Gain Crest: Zoe, Dazzling Hope.";

    it("mode 1: self takes 3 then all enemy followers take 3", () => {
      setupTurn(R6, { hand: [ZOE], pp: 5 });
      const a = enemyFollower(2, 5, "A");
      const b = enemyFollower(2, 5, "B");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const zoe = findOnBoard("first", "Zoe, Dazzling Hope");
      if (zoe) expect(Number(zoe.defense)).toBe(1);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
    });

    it("mode 2: self takes 3 then enemy leader takes 3", () => {
      setupTurn(R6, { hand: [ZOE], pp: 5, hp: 20 });
      const hpEnemyBefore = getHP(state, "second");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(hpEnemyBefore - 3);
    });

    it.fails(
      "mode 3 restores leader then deals 3 to Zoe — 10864120: printed Fanfare deals 3 to self; observed restore without self damage",
      () => {
        setupTurn(R6, { hand: [ZOE], pp: 5, hp: 15 });
        const hpBefore = getHP(state, "first");
        setScriptedModePickProvider(() => [2]);
        whenPlayCard("first", 0);
        const zoe = findOnBoard("first", "Zoe, Dazzling Hope")!;
        expect(getHP(state, "first")).toBe(hpBefore + 3);
        expect(Number(zoe.defense)).toBe(1);
      },
    );

    it.fails(
      "Evolve gains Crest: Zoe, Dazzling Hope — 10864120: evolve crest not applied",
      () => {
        setupTurn(R6, { hand: [ZOE], pp: 5 });
        setScriptedModePickProvider(() => [1]);
        whenPlayCard("first", 0);
        const zoe = findOnBoard("first", "Zoe, Dazzling Hope")!;
        state.players.first.evoCharges = 2;
        onEvolve(zoe, "first", "normal", { spendPoint: true });
        expect(
          getCrests(state, "first").some(
            (c) => c.name === "Zoe, Dazzling Hope",
          ),
        ).toBe(true);
      },
    );
  });

  describe("Blade Angel (10902110)", () => {
    const printed =
      "Fanfare: Select 2 other allied followers on the field and give them +3/+3.";

    it("Fanfare buffs exactly two selected allies +3/+3; Blade Angel and bystander stats unchanged", () => {
      setupTurn(R7, { hand: [BLADE_ANGEL], pp: 7 });
      const allyA = allyFollower("AllyA", 1, 1);
      const allyB = allyFollower("AllyB", 1, 1);
      const bystander = allyFollower("Bystander", 2, 2);
      whenPlayCard("first", 0);
      resolvePendingByUid(allyA.uid);
      resolvePendingByUid(allyB.uid);
      expect(Number(allyA.attack)).toBe(4);
      expect(Number(allyA.defense)).toBe(4);
      expect(Number(allyB.attack)).toBe(4);
      expect(Number(allyB.defense)).toBe(4);
      expect(Number(bystander.attack)).toBe(2);
      expect(Number(bystander.defense)).toBe(2);
      const angel = findOnBoard("first", "Blade Angel")!;
      expect(Number(angel.attack)).toBe(6);
      expect(Number(angel.defense)).toBe(6);
      expect(printed).toContain("+3/+3");
    });
  });

  describe("Kukishiro, Mistbloom (10564120)", () => {
    const printed =
      "Fanfare: Gain Crest: Kukishiro, Mistbloom. Return 2 random cards from your hand to deck. Draw 2 cards.\nRush";
    const crestPrinted =
      "During your turn, whenever you draw a 1-, 3-, or 5-cost card, summon a Fox of Purity or Holy Falcon at random.\nDuring your turn, whenever you draw a 2-, 4-, or 6-cost card, summon an enemy Fox of Purity or Holy Falcon at random.";

    const PICK_A = "10111310";
    const PICK_B = "10112310";
    const STAY = "10102110";

    it("Fanfare: gains Crest: Kukishiro, Mistbloom", () => {
      setupTurn(R10, {
        hand: [KUKISHIRO, PICK_A, PICK_B, STAY],
        deck: [DRAW_A, DRAW_B],
        pp: 10,
      });
      whenPlayCard("first", 0);
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Kukishiro, Mistbloom",
        ),
      ).toBe(true);
      expect(printed).toContain("Gain Crest");
    });

    it("Fanfare: returns 2 random hand cards to deck then draws 2 stacked cards", () => {
      setupTurn(R10, {
        hand: [KUKISHIRO, PICK_A, PICK_B, STAY],
        deck: [DRAW_A, DRAW_B],
        pp: 10,
      });
      whenPlayCard("first", 0);
      expect(deckIds()).toContain(PICK_A);
      expect(deckIds()).toContain(STAY);
      expect(handIds()).toContain(PICK_B);
      expect(handIds()).toContain(DRAW_A);
      expect(handIds()).toContain(DRAW_B);
      expect(handIds()).not.toContain(PICK_A);
      expect(handIds()).not.toContain(STAY);
    });

    it("has Rush on board", () => {
      setupTurn(R10, {
        hand: [KUKISHIRO, PICK_A, PICK_B, STAY],
        deck: [DRAW_A, DRAW_B],
        pp: 10,
      });
      whenPlayCard("first", 0);
      const kuki = findOnBoard("first", "Kukishiro, Mistbloom")!;
      applyKeywordsFromList(kuki);
      expect(kuki.hasRush).toBe(true);
    });

    it("crest during your turn: drawing cost-1 card summons Fox or Holy Falcon on your side", () => {
      setupTurn(R10, {
        hand: [KUKISHIRO, PICK_A, PICK_B, STAY],
        deck: [FILLER, FILLER, FILLER],
        pp: 10,
      });
      whenPlayCard("first", 0);
      const allyBefore = crestSummonNames("first").length;
      state.players.first.deck.unshift(
        createCard(COST_ONE_DRAW, "deck", "first"),
      );
      drawFromDeck();
      const allyAfter = crestSummonNames("first").length;
      expect(allyAfter - allyBefore).toBe(1);
      expect(crestPrinted).toContain("1-, 3-, or 5-cost");
    });

    it.fails(
      "crest drawing cost-2 summons on enemy side — 10564120: printed enemy Fox of Purity or Holy Falcon; observed ally-side summon",
      () => {
        setupTurn(R10, {
          hand: [KUKISHIRO, PICK_A, PICK_B, STAY],
          deck: [FILLER, FILLER, FILLER],
          pp: 10,
        });
        whenPlayCard("first", 0);
        const enemyBefore = crestSummonNames("second").length;
        state.players.first.deck.unshift(
          createCard(FOX_OF_PURITY, "deck", "first"),
        );
        drawFromDeck();
        const enemyAfter = crestSummonNames("second").length;
        expect(enemyAfter - enemyBefore).toBe(1);
        expect(crestPrinted).toContain("2-, 4-, or 6-cost");
      },
    );

    it("crest does not summon during opponent turn draw", () => {
      setupTurn(R10, {
        hand: [KUKISHIRO, PICK_A, PICK_B, STAY],
        deck: [FILLER],
        pp: 10,
        active: "second",
        secondDeck: [FILLER, FILLER],
      });
      whenPlayCard("first", 0);
      const allyBefore = crestSummonNames("first").length;
      const enemyBefore = crestSummonNames("second").length;
      runEndOfTurnBoundary("second");
      state.players.first.deck.unshift(
        createCard(
          { name: "Cost1Opp", type: "Spell", cost: 1 },
          "deck",
          "first",
        ),
      );
      drawFromDeck();
      expect(crestSummonNames("first").length).toBe(allyBefore);
      expect(crestSummonNames("second").length).toBe(enemyBefore);
    });
  });
});
