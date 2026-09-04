/**
 * L2 real-card tests — rotation-legal Neutral cards (28 cards).
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
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
  getBanish,
} from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

// Cards under test
const CITY_BABELON = "10703210";
const AIKA = "10803110";
const ALTARO = "10701110";
const VYRN = "10401120";
const ADVENTURERS_GUILD = "10002210";
const HEDONISTIC = "10703110";
const INTREPID = "10702110";
const YUNI = "10402110";
const ALFIED = "10802110";
const BEHEMOTH = "10502120";
const QUAKE = "10001130";
const BEAST_LOST = "10603110";
const ILLAMRITA = "10704110";
const JAILOR = "10901110";
const GETENOU = "10504110";
const OMEGOTEP = "10604110";
const WARDEN = "10903110";

// Helpers / fillers — distinct from tokens under test
const FILLER_FOREST = "10111310"; // Fairy Convocation
const DRAW_TOP = "10021110"; // Flashstep Quickblader
const DRAW_SECOND = "10021120"; // Arms Peddler
const DRAW_THIRD = "10021130";
const DRAW_FOURTH = "10021310";
const DRAW_FIFTH = "10022110";
const NEUTRAL_TOP = "10001130"; // Quake Goliath
const NEUTRAL_SECOND = "10001210"; // Detective's Lens
const FOLLOWER_DECK = "10001110"; // Fairy

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
    evo?: number;
    superEvo?: number;
    hp?: number;
    active?: "first" | "second";
    seed?: number;
  } = {},
) {
  const max = Math.min(round, 10);
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

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function boardCountByName(
  name: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.name === name).length;
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

function strikeReadyFollower(card: CardInstance): void {
  card.can_attack = true;
  card.hasAttacked = false;
  card.attacks_left = 1;
  card.justPlayed = false;
  card.peak_defense = Number(card.peak_defense ?? card.defense);
}

function crestNamed(name: string, player: "first" | "second" = "first") {
  return getCrests(state, player).find((c) => c.name === name);
}

function keywordCount(card: CardInstance): number {
  applyKeywordsFromList(card);
  const flags = [
    card.hasStorm,
    card.hasBane,
    card.hasIntimidate,
    card.hasDrain,
    card.hasAura,
    card.hasBarrier,
  ];
  return flags.filter(Boolean).length;
}

describe("L2 — Rotation Neutral", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Quake Goliath (10001130)", () => {
    const printed = "Ward";

    it("enters with Ward", () => {
      setupTurn(R6, { hand: [QUAKE], pp: 4 });
      whenPlayCard("first", 0);
      const goliath = findOnBoard("first", "Quake Goliath")!;
      applyKeywordsFromList(goliath);
      expect(goliath.hasWard || goliath.keywordState?.hasWard).toBe(true);
      expect(printed).toBe("Ward");
    });
  });

  describe("Adventurers' Guild (10002210)", () => {
    const printed =
      "Fanfare: Draw a follower.\nEngage: Destroy this card. Select an allied follower on the field and give it Rush.";

    it("Fanfare: draws stacked follower by identity from deck top", () => {
      setupTurn(R6, {
        hand: [ADVENTURERS_GUILD],
        deck: [FILLER_FOREST, FOLLOWER_DECK],
        pp: 3,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(FOLLOWER_DECK);
      expect(deckIds()).not.toContain(FOLLOWER_DECK);
      expect(printed).toContain("Draw a follower");
    });

    it("Engage: destroys this amulet", () => {
      setupTurn(R6, { hand: [ADVENTURERS_GUILD], pp: 3 });
      whenPlayCard("first", 0);
      const guild = findOnBoard("first", "Adventurers' Guild")!;
      const idx = getBoard(state, "first").findIndex(
        (c) => c.uid === guild.uid,
      );
      const fighter = allyFollower(2, 2, "RushAlly");
      fighter.uid = "rush_target";
      engageAmulet("first", idx);
      resolvePendingByUid("rush_target");
      expect(getBoard(state, "first").some((c) => c.uid === guild.uid)).toBe(
        false,
      );
      expect(printed).toContain("Destroy this card");
    });
  });

  describe("Vyrn, Bestest Pal (10401120)", () => {
    const printed =
      "Fanfare: If you've unlocked super-evolution, evolve this follower.";

    it("super-evolution unlocked: Fanfare evolves this follower", () => {
      setupTurn(R7, { hand: [VYRN], pp: 2 });
      whenPlayCard("first", 0);
      const vyrn = findOnBoard("first", "Vyrn, Bestest Pal")!;
      expect(vyrn.hasEvolved || vyrn.isEvolved).toBe(true);
      expect(printed).toContain("super-evolution");
    });

    it("super-evolution not unlocked: Fanfare does not evolve this follower", () => {
      setupTurn(R6, { hand: [VYRN], pp: 2 });
      whenPlayCard("first", 0);
      const vyrn = findOnBoard("first", "Vyrn, Bestest Pal")!;
      expect(vyrn.hasEvolved || vyrn.isEvolved).toBeFalsy();
    });
  });

  describe("Yuni, Cosmic Legacy (10402110)", () => {
    const printed =
      "Aura\nAt the end of your turn, restore 1 defense to all allies.";

    it("enters with Aura", () => {
      setupTurn(R6, { hand: [YUNI], pp: 3 });
      whenPlayCard("first", 0);
      const yuni = findOnBoard("first", "Yuni, Cosmic Legacy")!;
      applyKeywordsFromList(yuni);
      expect(yuni.hasAura || yuni.keywordState?.hasAura).toBe(true);
      expect(printed).toContain("Aura");
    });

    it("opponent's end of turn: does not restore ally defense", () => {
      setupTurn(R6, { hand: [YUNI], pp: 3 });
      whenPlayCard("first", 0);
      const yuni = findOnBoard("first", "Yuni, Cosmic Legacy")!;
      yuni.defense = 1;
      yuni.peak_defense = 3;
      const ally = allyFollower(1, 1, "YuniAlly");
      ally.peak_defense = 3;
      state.activePlayer = "second";
      runEndOfTurnBoundary("second");
      expect(Number(yuni.defense)).toBe(1);
      expect(Number(ally.defense)).toBe(1);
      expect(printed).toContain("At the end of your turn");
    });
  });

  describe("Behemoth General (10502120)", () => {
    const printed =
      "Evolve: If the sum of the 3 highest base costs in your hand is higher than that of your opponent's, destroy all enemy followers.";

    it("ally top-3 base-cost sum higher: destroys all enemy followers on Evolve", () => {
      setupTurn(R6, { evo: 2 });
      state.players.first.hand = [
        createCard(
          {
            name: "A",
            type: "Follower",
            cost: 8,
            base_cost: 8,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
        createCard(
          {
            name: "B",
            type: "Follower",
            cost: 7,
            base_cost: 7,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
        createCard(
          {
            name: "C",
            type: "Follower",
            cost: 6,
            base_cost: 6,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
      ];
      state.players.second.hand = [
        createCard(
          {
            name: "X",
            type: "Follower",
            cost: 3,
            base_cost: 3,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
        createCard(
          {
            name: "Y",
            type: "Follower",
            cost: 2,
            base_cost: 2,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
        createCard(
          {
            name: "Z",
            type: "Follower",
            cost: 1,
            base_cost: 1,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
      ];
      const foe = enemyFollower(2, 4, "BehemothVictim");
      const behemoth = createCard(BEHEMOTH, "board", "first");
      state.players.first.board = [behemoth];
      onEvolve(behemoth, "first", "normal", { spendPoint: true });
      expect(getBoard(state, "second").length).toBe(0);
      expect(Number(foe.defense)).toBe(0);
    });

    it("opponent top-3 base-cost sum not lower: does not destroy enemy followers", () => {
      setupTurn(R6, { evo: 2 });
      state.players.first.hand = [
        createCard(
          {
            name: "LowA",
            type: "Follower",
            cost: 1,
            base_cost: 1,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
        createCard(
          {
            name: "LowB",
            type: "Follower",
            cost: 1,
            base_cost: 1,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
        createCard(
          {
            name: "LowC",
            type: "Follower",
            cost: 1,
            base_cost: 1,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
      ];
      state.players.second.hand = [
        createCard(
          {
            name: "HighX",
            type: "Follower",
            cost: 8,
            base_cost: 8,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
        createCard(
          {
            name: "HighY",
            type: "Follower",
            cost: 7,
            base_cost: 7,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
        createCard(
          {
            name: "HighZ",
            type: "Follower",
            cost: 6,
            base_cost: 6,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
      ];
      const foe = enemyFollower(2, 4, "BehemothBystander");
      const behemoth = createCard(BEHEMOTH, "board", "first");
      state.players.first.board = [behemoth];
      onEvolve(behemoth, "first", "normal", { spendPoint: true });
      expect(getBoard(state, "second").length).toBe(1);
      expect(Number(foe.defense)).toBe(4);
      expect(printed).toContain("destroy all enemy followers");
    });
  });

  describe("Getenou, Eightfold Glory (10504110)", () => {
    const printed =
      "Fanfare: Discard your hand. Select a Mode to activate.\n1. Draw 8 cards.\n2. Draw 2 cards and reduce their costs by 8.";

    function stackDeck(ids: string[]): void {
      state.players.first.deck = ids.map((id) =>
        createCard(id, "deck", "first"),
      );
    }

    it("Fanfare: discards entire hand before mode selection", () => {
      setupTurn(R10, {
        hand: [GETENOU, FILLER_FOREST, DRAW_TOP],
        pp: 8,
      });
      stackDeck([DRAW_SECOND, DRAW_THIRD, DRAW_FOURTH, DRAW_FIFTH]);
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).not.toContain(FILLER_FOREST);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(printed).toContain("Discard your hand");
    });

    it("mode 1: draws 8 cards from stacked deck", () => {
      setupTurn(R10, { hand: [GETENOU], pp: 8 });
      stackDeck([
        DRAW_TOP,
        DRAW_SECOND,
        DRAW_THIRD,
        DRAW_FOURTH,
        DRAW_FIFTH,
        NEUTRAL_TOP,
        NEUTRAL_SECOND,
        FOLLOWER_DECK,
      ]);
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds().length).toBe(8);
      expect(handIds()).toContain(FOLLOWER_DECK);
      expect(handIds()).toContain(DRAW_TOP);
    });

    it("mode 2: draws 2 cards and reduces each cost by 8", () => {
      setupTurn(R10, { hand: [GETENOU], pp: 8, seed: 2 });
      stackDeck([DRAW_SECOND, DRAW_TOP]);
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const drawn = thenHand("first");
      expect(drawn.length).toBe(2);
      expect(getEffectiveCost(drawn[0]!)).toBe(0);
      expect(getEffectiveCost(drawn[1]!)).toBe(0);
      expect(printed).toContain("reduce their costs by 8");
    });
  });

  describe("Beast Lost to the Dark (10603110)", () => {
    const printed =
      "Fanfare: Give this follower 3 random abilities from the following.\n1. Storm.\n2. Bane.\n3. Intimidate.\n4. Drain.\n5. Aura.\n6. Barrier.";

    it("Fanfare: grants exactly 3 keywords from the printed pool (seed 1)", () => {
      setupTurn(R8, { hand: [BEAST_LOST], pp: 6, seed: 1 });
      whenPlayCard("first", 0);
      const beast = findOnBoard("first", "Beast Lost to the Dark")!;
      expect(keywordCount(beast)).toBe(3);
      expect(printed).toContain("3 random abilities");
    });
  });

  describe("Omegotep, the Dreaded One (10604110)", () => {
    const printed =
      "Fanfare: Activate 2 random abilities from the following.\n1. Destroy a random enemy follower.\n2. Deal 2 damage to the enemy leader.\n3. Recover 2 play points.\n4. Give this follower +4/+4 and activate its Fanfare ability.\nSuper-Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare: activates 2 random printed abilities (seed 1)", () => {
      setupTurn(R10, { hand: [OMEGOTEP], pp: 9, seed: 1 });
      const foe = enemyFollower(1, 5, "OmegotepFoe");
      const ppBefore = getPP(state, "first");
      whenPlayCard("first", 0);
      expect(getBoard(state, "second").length).toBe(0);
      expect(Number(foe.defense)).toBe(0);
      expect(getPP(state, "first")).toBe(ppBefore - 9 + 2);
      expect(printed).toContain("Activate 2 random abilities");
    });

    it("Super-Evolve: replicates Fanfare — seed 1 destroys respawned enemy and recovers 2 PP again", () => {
      setupTurn(R7, { hand: [OMEGOTEP], pp: 9, evo: 2, superEvo: 1, seed: 1 });
      const foe = enemyFollower(1, 5, "OmegotepFoe2");
      whenPlayCard("first", 0);
      const ppAfterFanfare = getPP(state, "first");
      foe.peak_defense = 5;
      foe.defense = 5;
      state.players.second.board = [foe];
      const omeg = findOnBoard("first", "Omegotep, the Dreaded One")!;
      onEvolve(omeg, "first", "super", { spendPoint: true });
      expect(getBoard(state, "second").length).toBe(0);
      expect(Number(foe.defense)).toBe(0);
      expect(getPP(state, "first")).toBe(ppAfterFanfare + 4);
      expect(printed).toContain("Replicate the effects");
    });
  });

  describe("Altaro Superfan (10701110)", () => {
    const printed = "Evolve: Draw a Neutral card.";

    it("Evolve: draws stacked Neutral card from deck top", () => {
      setupTurn(R5, {
        hand: [ALTARO],
        deck: [FILLER_FOREST, NEUTRAL_TOP],
        pp: 2,
        evo: 2,
      });
      whenPlayCard("first", 0);
      const altaro = findOnBoard("first", "Altaro Superfan")!;
      onEvolve(altaro, "first", "normal", { spendPoint: true });
      expect(handIds()).toContain(NEUTRAL_TOP);
      expect(handIds()).not.toContain(FILLER_FOREST);
      expect(printed).toContain("Neutral card");
    });
  });

  describe("Intrepid Newshound (10702110)", () => {
    const printed =
      "Last Words: Draw a card.\nSuper-Evolve: Summon 2 copies of Intrepid Newshound.";

    it("Last Words: draws stacked deck card by identity", () => {
      setupTurn(R6, {
        hand: [INTREPID],
        deck: [FILLER_FOREST, DRAW_TOP],
        pp: 3,
      });
      whenPlayCard("first", 0);
      const hound = findOnBoard("first", "Intrepid Newshound")!;
      hound.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });

    it("Super-Evolve: summons exactly 2 copies of Intrepid Newshound", () => {
      setupTurn(R7, { hand: [INTREPID], pp: 3, evo: 2, superEvo: 1 });
      whenPlayCard("first", 0);
      const hound = findOnBoard("first", "Intrepid Newshound")!;
      onEvolve(hound, "first", "super", { spendPoint: true });
      expect(boardCountByName("Intrepid Newshound", "first")).toBe(3);
      expect(printed).toContain("Summon 2 copies");
    });
  });

  describe("Hedonistic Socialite (10703110)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Deal 2 damage to all enemy followers.";

    it("Fanfare: discards selected hand card and deals 2 to all enemy followers; bystander ally untouched", () => {
      setupTurn(R6, { hand: [HEDONISTIC, FILLER_FOREST], pp: 3 });
      const target = enemyFollower(1, 5, "HedonTarget");
      const bystander = enemyFollower(1, 5, "HedonBystander");
      const ally = allyFollower(1, 5, "HedonAlly");
      whenPlayCard("first", 0);
      const discard = getHand(state, "first").find(
        (c) => c.id === FILLER_FOREST,
      )!;
      resolvePendingByUid(discard.uid);
      expect(handIds()).not.toContain(FILLER_FOREST);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(3);
      expect(Number(ally.defense)).toBe(5);
      expect(printed).toContain("Deal 2 damage to all enemy followers");
    });
  });

  describe("City of Babelon (10703210)", () => {
    const printed =
      "Countdown (1)\nAt the end of your turn, activate an ability in sequence from the following.\n1. Deal 2 damage to a random enemy follower.\n2. Restore 2 defense to your leader.\n3. Deal 2 damage to the enemy leader. Destroy this card.\nEngage (1): Select a card in your hand and discard it. Delay the count of this amulet by 1.";

    it("enters with Countdown (1)", () => {
      setupTurn(R6, { hand: [CITY_BABELON], pp: 1 });
      whenPlayCard("first", 0);
      const babelon = findOnBoard("first", "City of Babelon")!;
      expect(Number(babelon.countdown)).toBe(1);
      expect(printed).toContain("Countdown (1)");
    });

    it("owner EOT step 1: deals 2 damage to a random enemy follower", () => {
      setupTurn(R6, { hand: [CITY_BABELON], pp: 1 });
      const foe = enemyFollower(1, 5, "BabelonFoe");
      whenPlayCard("first", 0);
      const babelon = findOnBoard("first", "City of Babelon")!;
      runEndOfTurnBoundary("first");
      expect(Number(babelon.counters?.babelon)).toBe(1);
      expect(Number(foe.defense)).toBe(3);
    });

    it("owner EOT step 2: restores 2 defense to your leader", () => {
      setupTurn(R6, { hand: [CITY_BABELON], pp: 1, hp: 10 });
      enemyFollower(1, 5, "BabelonFoe2");
      whenPlayCard("first", 0);
      const babelon = findOnBoard("first", "City of Babelon")!;
      runEndOfTurnBoundary("first");
      runEndOfTurnBoundary("second");
      runEndOfTurnBoundary("first");
      expect(Number(babelon.counters?.babelon)).toBe(2);
      expect(getHP(state, "first")).toBe(12);
    });

    it("owner EOT step 3: deals 2 to enemy leader and destroys this amulet", () => {
      setupTurn(R6, { hand: [CITY_BABELON], pp: 1, hp: 10 });
      enemyFollower(1, 5, "BabelonFoe3");
      whenPlayCard("first", 0);
      const babelon = findOnBoard("first", "City of Babelon")!;
      runEndOfTurnBoundary("first");
      runEndOfTurnBoundary("second");
      runEndOfTurnBoundary("first");
      runEndOfTurnBoundary("second");
      runEndOfTurnBoundary("first");
      expect(Number(babelon.counters?.babelon)).toBe(3);
      expect(getHP(state, "second")).toBe(18);
      expect(getBoard(state, "first").some((c) => c.uid === babelon.uid)).toBe(
        false,
      );
    });

    it("opponent's end of turn: does not advance the Babelon sequence", () => {
      setupTurn(R6, { hand: [CITY_BABELON], pp: 1 });
      const foe = enemyFollower(1, 5, "BabelonOffBranch");
      whenPlayCard("first", 0);
      const babelon = findOnBoard("first", "City of Babelon")!;
      runEndOfTurnBoundary("second");
      expect(babelon.counters?.babelon ?? 0).toBe(0);
      expect(Number(foe.defense)).toBe(5);
    });

    it.fails(
      "Engage (1): discard selected hand card and delay countdown by 1 — 10703210 countdown stays 1 after Engage (printed: Delay the count of this amulet by 1)",
      () => {
        setupTurn(R6, { hand: [CITY_BABELON, FILLER_FOREST], pp: 10 });
        whenPlayCard("first", 0);
        const babelon = findOnBoard("first", "City of Babelon")!;
        expect(Number(babelon.countdown)).toBe(1);
        const idx = getBoard(state, "first").findIndex(
          (c) => c.uid === babelon.uid,
        );
        engageAmulet("first", idx);
        const discard = getHand(state, "first").find(
          (c) => c.id === FILLER_FOREST,
        )!;
        resolvePendingByUid(discard.uid);
        expect(handIds()).not.toContain(FILLER_FOREST);
        expect(Number(babelon.countdown)).toBe(2);
      },
    );
  });

  describe("Illamrita, Designated Target (10704110)", () => {
    const printed =
      'Follower Strike: Give this follower Barrier. Give the opposing follower "Can\'t attack followers or leaders" and "At the end of your turn, banish this card."\nLast Words: Gain Crest: Illamrita, Designated Target.';
    const crestPrinted =
      "Countdown (2)\nLast Words: Summon an Illamrita, Designated Target and evolve it.";

    function setupIllamritaStrike(): {
      illa: CardInstance;
      foe: CardInstance;
    } {
      setupTurn(R8, { pp: 10 });
      const illa = createCard(ILLAMRITA, "board", "first");
      strikeReadyFollower(illa);
      const foe = createCard(
        { name: "IllaFoe", type: "Follower", cost: 2, attack: 2, defense: 5 },
        "board",
        "second",
      );
      foe.peak_defense = 5;
      foe.justPlayed = false;
      state.players.first.board = [illa];
      state.players.second.board = [foe];
      attackFollower(0, 0, "first", "second");
      return { illa, foe };
    }

    it("Follower Strike: gives this follower Barrier", () => {
      const { illa } = setupIllamritaStrike();
      applyKeywordsFromList(illa);
      expect(illa.hasBarrier || illa.keywordState?.hasBarrier).toBe(true);
      expect(printed).toContain("Give this follower Barrier");
    });

    it.fails(
      "Follower Strike: opposing follower cannot attack — 10704110 grants cant_attack trigger to self instead of clash opponent",
      () => {
        const { foe } = setupIllamritaStrike();
        applyKeywordsFromList(foe);
        expect(
          foe.hasCantAttack ||
            foe.keywordState?.cantAttack ||
            foe.triggers?.some((t) => t.event === "end_of_turn"),
        ).toBe(true);
      },
    );

    it.fails(
      "Follower Strike: banishes opposing follower at end of its controller's turn — 10704110 attaches banish trigger to Illamrita instead",
      () => {
        const { illa, foe } = setupIllamritaStrike();
        runEndOfTurnBoundary("first");
        expect(getBoard(state, "first").some((c) => c.uid === illa.uid)).toBe(
          true,
        );
        runEndOfTurnBoundary("second");
        expect(getBanish(state, "second").some((c) => c.uid === foe.uid)).toBe(
          true,
        );
      },
    );

    it("Last Words: gains Crest: Illamrita, Designated Target with Countdown (2)", () => {
      setupTurn(R8, { hand: [ILLAMRITA], pp: 6 });
      whenPlayCard("first", 0);
      const illa = findOnBoard("first", "Illamrita, Designated Target")!;
      illa.defense = 0;
      cleanupDead();
      const crest = crestNamed("Illamrita, Designated Target");
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(2);
      expect(printed).toContain("Gain Crest");
    });

    it.fails(
      "crest Last Words: summons evolved Illamrita — 10704110 crest summon arrives unevolved (1/4, hasEvolved falsy)",
      () => {
        setupTurn(R8, { hand: [ILLAMRITA], pp: 6 });
        whenPlayCard("first", 0);
        const illa = findOnBoard("first", "Illamrita, Designated Target")!;
        illa.defense = 0;
        cleanupDead();
        whenEndTurn();
        whenEndTurn();
        whenEndTurn();
        whenEndTurn();
        expect(crestNamed("Illamrita, Designated Target")).toBeFalsy();
        const summoned = findOnBoard("first", "Illamrita, Designated Target")!;
        expect(summoned.hasEvolved || summoned.isEvolved).toBe(true);
        expect(crestPrinted).toContain("evolve it");
      },
    );
  });

  describe("Alfied, Squire of Joy (10802110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 4 damage.\nEvolve: Give this follower Storm.";

    it("Evolve: gives this follower Storm", () => {
      setupTurn(R6, { hand: [ALFIED], pp: 4, evo: 2 });
      enemyFollower(2, 5, "AlfiedWall");
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const alfied = findOnBoard("first", "Alfied, Squire of Joy")!;
      onEvolve(alfied, "first", "normal", { spendPoint: true });
      applyKeywordsFromList(alfied);
      expect(alfied.hasStorm || alfied.keywordState?.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Aika, Elegy of Loss (10803110)", () => {
    const printed =
      "Fanfare: Add a copy of a random allied follower destroyed this match to your hand without revealing it.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare: adds copy of destroyed allied follower to hand (seed 1)", () => {
      setupTurn(R6, { hand: [AIKA], pp: 2, seed: 1 });
      const dead = createCard(NEUTRAL_TOP, "graveyard", "first");
      recordDestroyed(state, "first", dead);
      whenPlayCard("first", 0);
      expect(thenHand("first").some((c) => c.name === "Quake Goliath")).toBe(
        true,
      );
      expect(printed).toContain("destroyed this match");
    });

    it("Evolve: replicates Fanfare — adds another destroyed-match copy to hand", () => {
      setupTurn(R6, { hand: [AIKA], pp: 2, evo: 2, seed: 1 });
      const deadA = createCard(NEUTRAL_TOP, "graveyard", "first");
      const deadB = createCard(NEUTRAL_SECOND, "graveyard", "first");
      recordDestroyed(state, "first", deadA);
      recordDestroyed(state, "first", deadB);
      whenPlayCard("first", 0);
      const aika = findOnBoard("first", "Aika, Elegy of Loss")!;
      const uidsBefore = new Set(thenHand("first").map((c) => c.uid));
      onEvolve(aika, "first", "normal", { spendPoint: true });
      const added = thenHand("first").filter((c) => !uidsBefore.has(c.uid));
      expect(added.length).toBe(1);
      expect(["Quake Goliath", "Detective's Lens"]).toContain(added[0]!.name);
      expect(printed).toContain("Replicate the effects");
    });
  });

  describe("Jailor of Antiquity (10901110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 6 damage. Deal 2 damage to a random unselected enemy follower.\nAccelerate (1): Deal 2 damage to a random enemy follower.\nWard";

    it("enters with Ward", () => {
      setupTurn(R6, { hand: [JAILOR], pp: 6 });
      whenPlayCard("first", 0);
      const jailor = findOnBoard("first", "Jailor of Antiquity")!;
      applyKeywordsFromList(jailor);
      expect(jailor.hasWard || jailor.keywordState?.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });
  });

  describe("Warden of Selflessness (10903110)", () => {
    const printed =
      "Fanfare: Add a Jailor of Antiquity to your hand. Deal X damage to 2 random enemy followers. X is the number of Neutral cards in your hand.\nEvolve: Recover 1 play point.";

    it("Fanfare: adds Jailor of Antiquity to hand by uid", () => {
      setupTurn(R6, { hand: [WARDEN], pp: 5 });
      const uidsBefore = new Set(thenHand("first").map((c) => c.uid));
      whenPlayCard("first", 0);
      const added = thenHand("first").filter((c) => !uidsBefore.has(c.uid));
      expect(added.length).toBe(1);
      expect(added[0]!.id).toBe(JAILOR);
      expect(added[0]!.name).toBe("Jailor of Antiquity");
      expect(printed).toContain("Add a Jailor of Antiquity to your hand");
    });

    it("Fanfare with 0 Neutral cards in hand: enemies take 0 damage", () => {
      setupTurn(R6, { hand: [WARDEN, FILLER_FOREST], pp: 5 });
      const foe = enemyFollower(1, 10, "WardenOff");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(9);
    });

    it("Fanfare: Deal X damage to 2 random enemy followers (X = Neutral in hand) — 10903110", () => {
      setupTurn(R6, {
        hand: [WARDEN, NEUTRAL_TOP, NEUTRAL_SECOND, FILLER_FOREST],
        pp: 5,
      });
      const e1 = enemyFollower(1, 10, "WardenOnA");
      const e2 = enemyFollower(1, 10, "WardenOnB");
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(7);
      expect(Number(e2.defense)).toBe(7);
      expect(printed).toContain("Deal X damage to 2 random enemy followers");
    });
  });
});
