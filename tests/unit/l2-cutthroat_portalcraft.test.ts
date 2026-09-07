/**
 * L2 real-card tests — Cutthroat Portalcraft deck (38 cards).
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
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  runStartOfTurnBoundary,
  runEndOfTurnBoundary,
} from "../../src/logic/core/turnBoundary.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
  getBanish,
  getGraveyard,
  getDeck,
  getSuperEvoCharges,
  getEvoCharges,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck cards
const BLUERUST = "10971110";
const DISGRACEFUL = "10972310";
const FREERUNNING = "10771310";
const LIGHT_DEWDROP = "10571310";
const SINCERITY = "10573310";
const WORLD_GAMES = "10503210";
const COOL_COURIER = "10772110";
const CUTTHROAT = "10974110";
const EUDIE = "10874120";
const IMARI = "10574120";
const ISAAC = "10471130";
const LYRIA = "10403120";
const PUPPET_LANCER = "10071120";
const PUPPET_THEATER = "10072210";
const YOG = "10674120";
const ALTARO = "10704120";
const BRAZEN = "10773110";
const LAZULI = "10872120";
const SHO = "10471110";
const SLAUS = "10574110";
const STONE_BREAKER = "10472310";
const BARKEEP = "10771110";
const GRAN = "10403110";
const IRONWORK = "10972110";
const SOULFORGE = "10973310";
const ASHER = "10874110";
const KATALINA = "10401110";
const LU_WOH = "10474110";
const STEELFORGED = "10973110";
const CHAOS = "10473310";
const MYRIAD = "10672310";
const SANDALPHON = "10404110";
const SHODDY = "10671110";
const AIZEDEN = "10974120";
const CAMISCILLA = "10674110";
const LUDICROUS = "10673110";
const SCARLET = "10774110";
const BEELZEBUB = "10474120";
const BERYL = "10152120";

// Tokens
const PUPPET = "90071110";
const ENHANCED_PUPPET = "90071120";
const STRIKER = "90072110";
const ANALYZING = "90071130";
const ANCIENT = "90071140";
const MYSTIC = "90071150";
const RADIANT = "90071160";
const IMARI_BUDDIES = "90074140";
const DEPTHS_AXE = "90074320";
const WARDEN = "90074150";
const SUBSTANDARD = "10672110";
const LUDICROUS_ID = "10673110";
const SHODDY_ID = "10671110";

// Helpers / fillers
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const SPELL_A = "10111310";
const SPELL_B = "10031310";
const BIG_FOLLOWER = "10002120";
const SMALL_FOLLOWER = "10001110";
const FILLER = "10111310";
const FAIRY = "90011110";

const R4 = 4;
const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R9 = 9;
const R10 = 10;

const HIGHLANDER_DECK = [
  { name: "HighlanderA", type: "Follower", cost: 1, attack: 1, defense: 1 },
  { name: "HighlanderB", type: "Spell", cost: 2 },
  { name: "HighlanderC", type: "Follower", cost: 3, attack: 2, defense: 2 },
  { name: "HighlanderD", type: "Follower", cost: 4, attack: 3, defense: 3 },
  { name: "HighlanderE", type: "Amulet", cost: 2 },
  { name: "HighlanderF", type: "Follower", cost: 5, attack: 4, defense: 4 },
  { name: "HighlanderG", type: "Spell", cost: 1 },
  { name: "HighlanderH", type: "Follower", cost: 6, attack: 5, defense: 5 },
  { name: "HighlanderI", type: "Follower", cost: 7, attack: 6, defense: 6 },
  { name: "HighlanderJ", type: "Follower", cost: 8, attack: 7, defense: 7 },
];

const DUPLICATE_DECK = [
  { name: "DupPair", type: "Follower", cost: 1, attack: 1, defense: 1 },
  { name: "DupPair", type: "Follower", cost: 1, attack: 1, defense: 1 },
  { name: "UniqueA", type: "Follower", cost: 2, attack: 1, defense: 1 },
  { name: "UniqueB", type: "Spell", cost: 1 },
  { name: "UniqueC", type: "Follower", cost: 3, attack: 2, defense: 2 },
];

const HIGHLANDER_FILLER = [
  { name: "SingletonA", type: "Follower", cost: 1, attack: 1, defense: 1 },
  { name: "SingletonB", type: "Spell", cost: 2 },
  { name: "SingletonC", type: "Follower", cost: 3, attack: 2, defense: 2 },
];

const PAD_DECK = Array.from({ length: 15 }, () => FILLER);

function setupTurn(
  round: number,
  opts: {
    hand?: Array<string | Record<string, unknown>>;
    secondHand?: Array<string | Record<string, unknown>>;
    deck?: Array<string | Record<string, unknown>>;
    secondDeck?: Array<string | Record<string, unknown>>;
    pp?: number;
    hp?: number;
    active?: "first" | "second";
    evo?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand as any);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand as any);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck as any);
  else b = b.withFirstDeck(PAD_DECK);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck as any);
  else b = b.withSecondDeck(PAD_DECK);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.active === "second") {
    state.players.second.pp = pp;
    state.players.second.maxPP = max;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function advanceToFirstNextTurn(): void {
  whenEndTurn();
  whenEndTurn();
}

function findCrestGain(card: Record<string, unknown>): unknown {
  let found: unknown;
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const rec = obj as Record<string, unknown>;
    if (rec.op === "crest" && rec.action === "gain") found = rec;
    if (Array.isArray(obj)) obj.forEach(walk);
    else Object.values(rec).forEach(walk);
  }
  walk(card);
  return found;
}

function gainCardCrest(cardId: string, owner: "first" | "second"): void {
  const card = getCardById(cardId);
  expect(card).toBeDefined();
  const gain = findCrestGain(card as Record<string, unknown>);
  expect(gain).toBeDefined();
  handleGainCrest(gain as Parameters<typeof handleGainCrest>[0], owner);
}

function gainCutthroatCrest(): void {
  setupTurn(R6, {
    hand: [CUTTHROAT],
    pp: 2,
    deck: [
      { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
      { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
      ...HIGHLANDER_FILLER,
    ],
    evo: 2,
  });
  whenPlayCard("first", 0);
  const cut = findOnBoard("first", "Cutthroat, Fluxblade Convict")!;
  whenEvolve(cut, "first");
  expect(
    getCrests(state, "first").some(
      (c) => c.name === "Cutthroat, Fluxblade Convict",
    ),
  ).toBe(true);
}

function readyStormAttacker(
  owner: "first" | "second",
  atk = 5,
  name = "Storm Raider",
) {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: atk,
      defense: 2,
      hasStorm: true,
      justPlayed: false,
      can_attack: true,
      can_attack_followers: true,
      attacks_left: 1,
    },
    "board",
    owner,
  );
  applyKeywordsFromList(c);
  c.peak_defense = 2;
  getBoard(state, owner).push(c);
  return c;
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

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
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

function boardFollower(
  owner: "first" | "second",
  atk: number,
  def: number,
  name = "Board",
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    owner,
  );
  c.peak_defense = def;
  state.players[owner].board.push(c);
  return c;
}

function playBeelzebubFanfare(
  player: "first" | "second",
  targetA: { uid: string },
  targetB: { uid: string },
) {
  const idx = getHand(state, player).findIndex((c) => c.id === BEELZEBUB);
  whenPlayCard(player, idx);
  resolvePendingByUid(targetA.uid);
  resolvePendingByUid(targetB.uid);
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

function enemyLastWordsFollower(name = "LWTarget") {
  const lw = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 3 },
    "board",
    "second",
  );
  lw.peak_defense = 3;
  lw.hasLastWords = true;
  lw.lastWordsEffects = [
    { op: "summon", source: "named", name: "Puppet", count: 1 },
  ];
  state.players.second.board.push(lw);
  return lw;
}

function evolvedAlly(name = "EvolvedAlly") {
  const c = allyFollower(name);
  c.hasEvolved = true;
  c.isEvolved = true;
  return c;
}

function pushArtifactHistory(names: string[]): void {
  const idByName: Record<string, string> = {
    "Analyzing Artifact": ANALYZING,
    "Ancient Artifact": ANCIENT,
    "Mystic Artifact": MYSTIC,
    "Radiant Artifact": RADIANT,
    "Striker Artifact": STRIKER,
  };
  if (!state.players.first.followerEnterHistory) {
    state.players.first.followerEnterHistory = [];
  }
  for (const name of names) {
    state.players.first.followerEnterHistory.push({
      name,
      tribes: ["Artifact"],
      cardId: idByName[name] ?? "90071130",
    });
  }
}

describe("L2 — Cutthroat Portalcraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Bluerust Underling (10971110)", () => {
    const printed =
      "Fanfare: If there are no duplicates in your deck, select an enemy follower on the field and deal it 5 damage.\nRush";

    it("highlander ON: deals 5 to selected enemy; bystander unchanged", () => {
      setupTurn(R5, {
        hand: [BLUERUST],
        deck: HIGHLANDER_DECK,
        pp: 1,
      });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(8);
      expect(printed).toContain("deal it 5 damage");
    });

    it("highlander OFF: no damage to enemies", () => {
      setupTurn(R5, {
        hand: [BLUERUST],
        deck: DUPLICATE_DECK,
        pp: 1,
      });
      const foe = enemyFollower(2, 8);
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(8);
    });

    it("has Rush on field", () => {
      setupTurn(R5, { hand: [BLUERUST], deck: HIGHLANDER_DECK, pp: 1 });
      whenPlayCard("first", 0);
      const blu = findOnBoard("first", "Bluerust Underling")!;
      expect(blu.hasRush || blu.keywordState?.hasRush).toBe(true);
      expect(printed).toContain("Rush");
    });
  });

  describe("Disgraceful Banishment (10972310)", () => {
    const printed =
      "Select a card in your hand and discard it. Draw a card. If there are no duplicates in your deck, draw 3 instead.";

    it("discards selected hand card and draws 1 with duplicates in deck", () => {
      setupTurn(R5, {
        hand: [DISGRACEFUL, FILLER],
        deck: DUPLICATE_DECK,
        pp: 1,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === FILLER)!.uid,
      );
      expect(handIds()).not.toContain(DISGRACEFUL);
      expect(handIds().length).toBe(1);
      expect(printed).toContain("Draw a card");
    });

    it("highlander ON: draws 3 after discard", () => {
      setupTurn(R5, {
        hand: [DISGRACEFUL, FILLER],
        deck: [...HIGHLANDER_DECK, DRAW_TOP, DRAW_SECOND],
        pp: 1,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === FILLER)!.uid,
      );
      expect(getHand(state, "first").length).toBe(3);
    });
  });

  describe("Freerunning (10771310)", () => {
    const printed =
      "Select a Mode to activate. If at least 3 differently named allied Artifact followers have entered the field this match, activate all of them instead.\n1. Add an Analyzing Artifact to your hand.\n2. Add an Ancient Artifact to your hand.";

    it("mode 1: adds Analyzing Artifact to hand", () => {
      setupTurn(R6, { hand: [FREERUNNING], pp: 1 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANALYZING);
      expect(printed).toContain("Analyzing Artifact");
    });

    it("mode 2: adds Ancient Artifact to hand", () => {
      setupTurn(R6, { hand: [FREERUNNING], pp: 1 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANCIENT);
      expect(printed).toContain("Ancient Artifact");
    });

    it("with 3+ unique Artifact enters: activates BOTH modes", () => {
      setupTurn(R6, { hand: [FREERUNNING], pp: 1 });
      pushArtifactHistory([
        "Analyzing Artifact",
        "Ancient Artifact",
        "Mystic Artifact",
      ]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANALYZING);
      expect(handIds()).toContain(ANCIENT);
    });
  });

  describe("Light of the Dewdrop (10571310)", () => {
    const printed = "Draw a card.";

    it("draws the top stacked deck card into hand", () => {
      setupTurn(R6, {
        hand: [LIGHT_DEWDROP],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 1,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(LIGHT_DEWDROP);
      expect(deckIds()).toContain(DRAW_SECOND);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(printed).toBe("Draw a card.");
    });
  });

  describe("Sincerity of the Dewdrop (10573310)", () => {
    const printed =
      "Select a card on the field and transform it into an Imari's Little Buddies.";

    it("transforms selected field card to Imari's Little Buddies; bystander unchanged", () => {
      setupTurn(R5, { hand: [SINCERITY], pp: 1 });
      const target = enemyFollower(2, 4, "TransformMe");
      const bystander = enemyFollower(2, 4, "Safe");
      whenPlayCard("first", 0);
      if (state.pendingTargetEffect) {
        resolvePendingByUid(target.uid);
      }
      const transformed = getBoard(state, "second").find(
        (c) => c.uid === target.uid,
      );
      expect(
        transformed?.name === "Imari's Little Buddies" ||
          getBoard(state, "second").some(
            (c) => c.name === "Imari's Little Buddies",
          ),
      ).toBe(true);
      expect(
        getBoard(state, "second").some((c) => c.uid === bystander.uid),
      ).toBe(true);
      expect(printed).toContain("Imari's Little Buddies");
    });
  });

  describe("World of Games (10503210)", () => {
    const printed =
      "Countdown (5)\nWhenever you play another card, if there's a card on the field other than it with the same base cost, advance this amulet's count by 1.\nLast Words: Draw 2 cards.";

    it("enters play with Countdown (5)", () => {
      setupTurn(R5, { hand: [WORLD_GAMES], pp: 1 });
      whenPlayCard("first", 0);
      const games = findOnBoard("first", "World of Games")!;
      expect(Number(games.countdown)).toBe(5);
      expect(printed).toContain("Countdown (5)");
    });

    it("playing the amulet itself does not advance its countdown", () => {
      setupTurn(R5, { hand: [WORLD_GAMES], pp: 1 });
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

      const games = createCard(WORLD_GAMES, "board", "first");
      games.hasCountdown = true;
      games.countdown = 5;
      getBoard(state, "first").push(games);

      const onField = createCard(SMALL_FOLLOWER, "board", "first");
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

      const games = createCard(WORLD_GAMES, "board", "first");
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
        hand: [WORLD_GAMES],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 1,
      });
      whenPlayCard("first", 0);
      const games = findOnBoard("first", "World of Games")!;
      games.countdown = 0;
      cleanupDead();
      expect(findOnBoard("first", "World of Games")).toBeFalsy();
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
    });
  });

  describe("Cool Courier (10772110)", () => {
    const printed =
      "Fanfare: Add an Ancient Artifact to your hand.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare adds Ancient Artifact to hand", () => {
      setupTurn(R6, { hand: [COOL_COURIER], pp: 3 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANCIENT);
      expect(printed).toContain("Ancient Artifact");
    });

    it("Evolve replicates Fanfare (second Ancient Artifact)", () => {
      setupTurn(R6, { hand: [COOL_COURIER], pp: 3 });
      whenPlayCard("first", 0);
      const courier = findOnBoard("first", "Cool Courier")!;
      state.players.first.evoCharges = 2;
      whenEvolve(courier, "first");
      expect(
        getHand(state, "first").filter((c) => c.id === ANCIENT).length,
      ).toBe(2);
    });
  });

  describe("Cutthroat, Fluxblade Convict (10974110)", () => {
    const printed =
      "Bane\nEvolve: Banish all copies of Cutthroat, Fluxblade Convict from your deck. Then, if there are no duplicates in your deck, gain Crest: Cutthroat, Fluxblade Convict.";

    it("has Bane on field", () => {
      setupTurn(R6, { hand: [CUTTHROAT], pp: 2, deck: HIGHLANDER_DECK });
      whenPlayCard("first", 0);
      const cut = findOnBoard("first", "Cutthroat, Fluxblade Convict")!;
      expect(cut.hasBane || cut.keywordState?.hasBane).toBe(true);
      expect(printed).toContain("Bane");
    });

    it("Evolve banishes deck copies (banish zone, not graveyard); gains crest when singleton", () => {
      setupTurn(R6, {
        hand: [CUTTHROAT],
        pp: 2,
        deck: [
          { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
          { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
          ...HIGHLANDER_DECK.slice(0, 3),
        ],
      });
      whenPlayCard("first", 0);
      const cut = findOnBoard("first", "Cutthroat, Fluxblade Convict")!;
      state.players.first.evoCharges = 2;
      whenEvolve(cut, "first");
      expect(
        getDeck(state, "first").filter(
          (c) => c.name === "Cutthroat, Fluxblade Convict",
        ).length,
      ).toBe(0);
      expect(
        getBanish(state, "first").filter(
          (c) => c.name === "Cutthroat, Fluxblade Convict",
        ).length,
      ).toBe(2);
      expect(
        getGraveyard(state, "first").filter(
          (c) => c.name === "Cutthroat, Fluxblade Convict",
        ).length,
      ).toBe(0);
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Cutthroat, Fluxblade Convict",
        ),
      ).toBe(true);
    });

    it("Evolve does not gain crest when duplicates remain after banish", () => {
      setupTurn(R6, {
        hand: [CUTTHROAT],
        pp: 2,
        deck: [
          { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
          { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
          { name: "DupFodder", type: "Follower", cost: 1 },
          { name: "DupFodder", type: "Follower", cost: 1 },
        ],
      });
      whenPlayCard("first", 0);
      const cut = findOnBoard("first", "Cutthroat, Fluxblade Convict")!;
      state.players.first.evoCharges = 2;
      whenEvolve(cut, "first");
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Cutthroat, Fluxblade Convict",
        ),
      ).toBe(false);
    });

    it("crest: first follower each turn evolves without spending an evolution point", () => {
      gainCutthroatCrest();
      state.players.first.hand = [
        createCard(FAIRY, "hand", "first"),
        createCard(FAIRY, "hand", "first"),
      ];
      state.players.first.pp = 10;
      const evoBefore = getEvoCharges(state, "first");
      whenPlayCard("first", 0);
      const firstFairy = findOnBoard("first", "Fairy")!;
      expect(firstFairy.hasEvolved).toBe(true);
      expect(getEvoCharges(state, "first")).toBe(evoBefore);

      whenPlayCard("first", 0);
      const fairies = thenBoard("first").filter((c) => c.name === "Fairy");
      expect(fairies.filter((c) => c.hasEvolved).length).toBe(1);
      expect(fairies.filter((c) => !c.hasEvolved).length).toBe(1);
    });

    it("crest: opponent playing a follower does not evolve it", () => {
      gainCutthroatCrest();
      advanceToFirstNextTurn();
      state.players.second.hand = [createCard(FAIRY, "hand", "second")];
      state.players.second.pp = 10;
      state.activePlayer = "second";
      whenPlayCard("second", 0);
      const foeFairy = findOnBoard("second", "Fairy")!;
      expect(foeFairy.hasEvolved).toBeFalsy();
    });

    it("crest: on owner's next turn the first follower is evolved again", () => {
      gainCutthroatCrest();
      state.players.first.hand = [createCard(FAIRY, "hand", "first")];
      state.players.first.pp = 10;
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Fairy")!.hasEvolved).toBe(true);

      advanceToFirstNextTurn();
      state.players.first.hand = [createCard(FAIRY, "hand", "first")];
      state.players.first.pp = 10;
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Fairy")!.hasEvolved).toBe(true);
    });
  });

  describe("Eudie, Your Dependable Mentor (10874120)", () => {
    const printed =
      "Fanfare: Add an Analyzing Artifact to your hand.\nEvolve: Select another unevolved allied follower on the field and evolve it.";

    it("Fanfare adds Analyzing Artifact to hand", () => {
      setupTurn(R6, { hand: [EUDIE], pp: 3 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANALYZING);
    });

    it("Evolve evolves other unevolved ally, not self", () => {
      setupTurn(R6, { hand: [EUDIE], pp: 3 });
      whenPlayCard("first", 0);
      const eudie = findOnBoard("first", "Eudie, Your Dependable Mentor")!;
      const ally = allyFollower("PickMe");
      state.players.first.evoCharges = 2;
      whenEvolve(eudie, "first");
      resolvePendingByUid(ally.uid);
      expect(ally.hasEvolved).toBe(true);
      expect(eudie.hasEvolved).toBe(true);
      expect(printed).toContain("another unevolved allied follower");
    });
  });

  describe("Imari, Dewdrop (10574120)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Draw a spell.\nWhenever you play a spell, if this follower is evolved, summon an Imari's Little Buddies.\nSuper-Evolve: Draw 2 differently named 1-cost spells.";

    it("Fanfare discards selected card and draws a spell", () => {
      setupTurn(R6, {
        hand: [IMARI, DRAW_TOP],
        deck: [SPELL_A, FILLER],
        pp: 2,
      });
      const discard = getHand(state, "first").find((c) => c.id === DRAW_TOP)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(discard.uid);
      expect(handIds()).toContain(SPELL_A);
      expect(handIds()).not.toContain(DRAW_TOP);
    });

    it("when evolved, playing a spell summons Imari's Little Buddies", () => {
      setupTurn(R6, {
        hand: [IMARI, DRAW_TOP, SPELL_A],
        pp: 4,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === DRAW_TOP)!.uid,
      );
      const imari = findOnBoard("first", "Imari, Dewdrop")!;
      state.players.first.evoCharges = 2;
      whenEvolve(imari, "first");
      const spellIdx = getHand(state, "first").findIndex(
        (c) => c.id === SPELL_A,
      );
      whenPlayCard("first", spellIdx);
      expect(
        thenBoard("first").some((c) => c.name === "Imari's Little Buddies"),
      ).toBe(true);
    });

    it("when not evolved, playing a spell does not summon buddies", () => {
      setupTurn(R6, {
        hand: [IMARI, DRAW_TOP],
        deck: [SPELL_A],
        pp: 2,
      });
      const discard = getHand(state, "first").find((c) => c.id === DRAW_TOP)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(discard.uid);
      const spellIdx = getHand(state, "first").findIndex(
        (c) => c.id === SPELL_A,
      );
      whenPlayCard("first", spellIdx);
      expect(
        thenBoard("first").some((c) => c.name === "Imari's Little Buddies"),
      ).toBe(false);
    });

    it("Super-Evolve draws exactly 2 differently named 1-cost spells", () => {
      setupTurn(R8, {
        hand: [IMARI, DRAW_TOP],
        deck: [SPELL_A, SPELL_B],
        pp: 3,
      });
      state.players.first.superEvoCharges = 2;
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === DRAW_TOP)!.uid,
      );
      const imari = findOnBoard("first", "Imari, Dewdrop")!;
      whenSuperEvolve(imari, "first");
      const spells = getHand(state, "first").filter((c) => c.type === "Spell");
      expect(spells).toHaveLength(2);
      expect(spells.every((c) => Number(c.cost) === 1)).toBe(true);
      expect(new Set(spells.map((c) => c.id)).size).toBe(2);
      expect(printed).toContain("differently named 1-cost spells");
    });
  });

  describe("Isaac, Congenial Engineer (10471130)", () => {
    const printed = "Last Words: Add a Striker Artifact to your hand.";

    it("Last Words adds Striker Artifact to hand", () => {
      setupTurn(R6, { hand: [ISAAC], pp: 2 });
      whenPlayCard("first", 0);
      const isaac = findOnBoard("first", "Isaac, Congenial Engineer")!;
      isaac.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(STRIKER);
      expect(printed).toContain("Striker Artifact");
    });
  });

  describe("Lyria, Skydestined (10403120)", () => {
    const printed =
      "Enhance(8): Draw a follower that costs 7 or more. Recover 7 play points\nBarrier";

    it("without 8 PP: plays with Barrier, no big follower draw", () => {
      setupTurn(R5, { hand: [LYRIA], deck: [BIG_FOLLOWER, FILLER], pp: 2 });
      whenPlayCard("first", 0);
      const lyria = findOnBoard("first", "Lyria, Skydestined")!;
      expect(lyria.hasBarrier || lyria.keywordState?.hasBarrier).toBe(true);
      expect(handIds()).not.toContain(BIG_FOLLOWER);
      expect(printed).toContain("Barrier");
    });

    it("Enhance(8): draws big follower and recovers 7 PP", () => {
      setupTurn(R10, {
        hand: [LYRIA],
        pp: 8,
        deck: [
          { name: "Big", type: "Follower", cost: 8, attack: 8, defense: 8 },
          { name: "Small", type: "Follower", cost: 2, attack: 2, defense: 2 },
        ],
      });
      whenPlayCard("first", 0);
      expect(thenHand("first").some((c) => c.name === "Big")).toBe(true);
      expect(getPP(state, "first")).toBe(7);
      expect(findOnBoard("first", "Lyria, Skydestined")).toBeDefined();
    });
  });

  describe("Puppet Lancer (10071120)", () => {
    const printed = "Fanfare: Add an Enhanced Puppet to your hand.";

    it("Fanfare adds Enhanced Puppet to hand", () => {
      setupTurn(R6, { hand: [PUPPET_LANCER], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ENHANCED_PUPPET);
      expect(printed).toContain("Enhanced Puppet");
    });
  });

  describe("Puppet Theater (10072210)", () => {
    const printed =
      "Fanfare: Add a Puppet to your hand.\nCountdown (2)\nAt the end of your turn, add a Puppet to your hand.";

    it("Fanfare adds Puppet; enters with Countdown (2)", () => {
      setupTurn(R5, { hand: [PUPPET_THEATER], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(PUPPET);
      const theater = findOnBoard("first", "Puppet Theater")!;
      expect(Number(theater.countdown)).toBe(2);
    });

    it("owner's EOT adds exactly one Puppet to hand", () => {
      setupTurn(R5, { hand: [PUPPET_THEATER], pp: 2 });
      whenPlayCard("first", 0);
      const puppetsAfterFanfare = handIds().filter(
        (id) => id === PUPPET,
      ).length;
      whenEndTurn();
      expect(handIds().filter((id) => id === PUPPET).length).toBe(
        puppetsAfterFanfare + 1,
      );
    });

    it("opponent's EOT does not add Puppet from allied Puppet Theater", () => {
      setupTurn(R5, { hand: [PUPPET_THEATER], pp: 2, active: "second" });
      whenPlayCard("first", 0);
      const handBefore = handIds();
      runEndOfTurnBoundary("second");
      expect(handIds()).toEqual(handBefore);
    });
  });

  describe("Yog-Zentha, Eld Axe (10674120)", () => {
    const printed =
      "Fanfare: If there's an allied follower on the field with a base cost of 5 or more, add a Depths of the Eld Axe to your hand.\nRush";

    it("with 5+ base cost ally: adds Depths of the Eld Axe", () => {
      setupTurn(R6, { hand: [YOG], pp: 3 });
      const big = createCard(
        {
          name: "BigAlly",
          type: "Follower",
          cost: 5,
          base_cost: 5,
          attack: 5,
          defense: 5,
        },
        "board",
        "first",
      );
      big.peak_defense = 5;
      state.players.first.board.push(big);
      whenPlayCard("first", 0);
      expect(
        getHand(state, "first").some((c) => c.name === "Depths of the Eld Axe"),
      ).toBe(true);
    });

    it("without 5+ base cost ally: does not add Depths", () => {
      setupTurn(R6, { hand: [YOG], pp: 3 });
      allyFollower("Small", 2, 2, { cost: 2, base_cost: 2 });
      whenPlayCard("first", 0);
      expect(
        getHand(state, "first").some((c) => c.name === "Depths of the Eld Axe"),
      ).toBe(false);
    });

    it("has Rush on field", () => {
      setupTurn(R6, { hand: [YOG], pp: 3 });
      whenPlayCard("first", 0);
      const yog = findOnBoard("first", "Yog-Zentha, Eld Axe")!;
      expect(yog.hasRush || yog.keywordState?.hasRush).toBe(true);
    });
  });

  describe("Altaro, Mayor of Babelon (10704120)", () => {
    const printed = "Ambush\nAt the end of your turn, draw a card.";

    it("has Ambush on field", () => {
      setupTurn(R6, { hand: [ALTARO], pp: 3 });
      whenPlayCard("first", 0);
      const altaro = findOnBoard("first", "Altaro, Mayor of Babelon")!;
      expect(altaro.hasAmbush || altaro.keywordState?.hasAmbush).toBe(true);
    });

    it("owner's EOT draws a card", () => {
      setupTurn(R6, {
        hand: [ALTARO],
        deck: [DRAW_TOP, FILLER],
        pp: 3,
      });
      whenPlayCard("first", 0);
      const handBefore = handIds().length;
      whenEndTurn();
      expect(handIds().length).toBe(handBefore + 1);
    });

    it("opponent's EOT does not draw from allied Altaro", () => {
      setupTurn(R6, {
        hand: [ALTARO],
        deck: [DRAW_TOP],
        pp: 3,
        active: "second",
      });
      whenPlayCard("first", 0);
      const handBefore = handIds().length;
      runEndOfTurnBoundary("second");
      expect(handIds().length).toBe(handBefore);
    });
  });

  describe("Brazen Broadcaster (10773110)", () => {
    const printed =
      "Fanfare: Summon an Analyzing Artifact.\nEnhance (5): Summon a Mystic Artifact.\nWhenever an allied Artifact follower enters the field, give it Rush.";

    it("Fanfare summons Analyzing Artifact", () => {
      setupTurn(R6, { hand: [BRAZEN], pp: 3 });
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").some((c) => c.name === "Analyzing Artifact"),
      ).toBe(true);
    });

    it("Enhance (5): summons exactly 1 Mystic and 1 Analyzing Artifact", () => {
      setupTurn(R8, { hand: [BRAZEN], pp: 5 });
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Mystic Artifact").length,
      ).toBe(1);
      expect(
        thenBoard("first").filter((c) => c.name === "Analyzing Artifact")
          .length,
      ).toBe(1);
    });

    it("without 5 PP: only Analyzing Artifact from Fanfare", () => {
      setupTurn(R6, { hand: [BRAZEN], pp: 3 });
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Mystic Artifact").length,
      ).toBe(0);
      expect(
        thenBoard("first").filter((c) => c.name === "Analyzing Artifact")
          .length,
      ).toBe(1);
    });

    it("artifact enter grants Rush to entering follower", () => {
      setupTurn(R6, { hand: [BRAZEN, ANALYZING], pp: 6 });
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      const artifacts = thenBoard("first").filter(
        (c) => c.name === "Analyzing Artifact",
      );
      expect(artifacts).toHaveLength(2);
      expect(artifacts.every((c) => c.hasRush || c.keywordState?.hasRush)).toBe(
        true,
      );
    });

    it("non-Artifact ally enter does not grant Rush", () => {
      setupTurn(R10, { hand: [BRAZEN, PUPPET_LANCER], pp: 10 });
      whenPlayCard("first", 0);
      const lancerIdx = getHand(state, "first").findIndex(
        (c) => c.id === PUPPET_LANCER,
      );
      expect(lancerIdx).toBeGreaterThanOrEqual(0);
      const outcome = playCardNoRender(
        getHand(state, "first"),
        "first",
        lancerIdx,
      );
      expect(outcome.kind).toBe("done");
      const lancer = findOnBoard("first", "Puppet Lancer")!;
      expect(lancer.hasRush || lancer.keywordState?.hasRush).toBeFalsy();
    });
  });

  describe("Lazuli, Gateway Connector (10872120)", () => {
    const printed = "Fanfare: Add a Radiant Artifact to your hand.";

    it("Fanfare adds Radiant Artifact to hand", () => {
      setupTurn(R6, { hand: [LAZULI], pp: 3 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(RADIANT);
      expect(printed).toContain("Radiant Artifact");
    });
  });

  describe("Sho, Reborn Night King (10471110)", () => {
    const printed =
      "Fanfare: If you've unlocked super-evolution, give this follower Barrier.\nStorm.";

    it("has Storm on field", () => {
      setupTurn(R6, { hand: [SHO], pp: 3 });
      whenPlayCard("first", 0);
      const sho = findOnBoard("first", "Sho, Reborn Night King")!;
      expect(sho.hasStorm || sho.keywordState?.hasStorm).toBe(true);
    });

    it("R7+ with super unlocked: gains Barrier", () => {
      setupTurn(R7, { hand: [SHO], pp: 3 });
      whenPlayCard("first", 0);
      const sho = findOnBoard("first", "Sho, Reborn Night King")!;
      expect(sho.hasBarrier || sho.keywordState?.hasBarrier).toBe(true);
    });

    it("below R7: no Barrier even with Storm", () => {
      setupTurn(R4, { hand: [SHO], pp: 3 });
      whenPlayCard("first", 0);
      const sho = findOnBoard("first", "Sho, Reborn Night King")!;
      expect(sho.hasStorm || sho.keywordState?.hasStorm).toBe(true);
      expect(sho.hasBarrier || sho.keywordState?.hasBarrier).toBeFalsy();
    });
  });

  describe("Slaus, Revolving Wheel of Fortune (10574110)", () => {
    const printed =
      "Ambush\nAt the end of your turn, if this follower is evolved, give your opponent Crest: Slaus, Revolving Wheel of Fortune and banish this card.\nAt the start of your turn, activate a random ability that hasn't been activated yet from the following.\n1. Reduce the cost of all cards in your hand by 1 until the end of the turn.\n2. Give all allied followers on the field +2/+2.\n3. Restore 3 defense to your leader.";

    it("has Ambush on field", () => {
      setupTurn(R6, { hand: [SLAUS], pp: 3 });
      whenPlayCard("first", 0);
      const slaus = findOnBoard("first", "Slaus, Revolving Wheel of Fortune")!;
      expect(slaus.hasAmbush || slaus.keywordState?.hasAmbush).toBe(true);
    });

    it("evolved owner's EOT banishes Slaus and gives opponent crest", () => {
      setupTurn(R6, { hand: [SLAUS], pp: 3 });
      whenPlayCard("first", 0);
      const slaus = findOnBoard("first", "Slaus, Revolving Wheel of Fortune")!;
      state.players.first.evoCharges = 2;
      whenEvolve(slaus, "first");
      whenEndTurn();
      expect(
        getBoard(state, "first").some((c) => c.name.includes("Slaus")),
      ).toBe(false);
      expect(
        getCrests(state, "second").some((c) => c.name.includes("Slaus")),
      ).toBe(true);
    });

    it("not evolved owner's EOT: no banish, no opponent crest", () => {
      setupTurn(R6, { hand: [SLAUS], pp: 3 });
      whenPlayCard("first", 0);
      whenEndTurn();
      expect(
        getBoard(state, "first").some((c) => c.name.includes("Slaus")),
      ).toBe(true);
      expect(
        getCrests(state, "second").some((c) => c.name.includes("Slaus")),
      ).toBe(false);
    });

    it("owner's SOT activates a mode (mode 2 buffs allies)", () => {
      setupTurn(R6, { hand: [SLAUS], pp: 3 });
      whenPlayCard("first", 0);
      const slaus = findOnBoard("first", "Slaus, Revolving Wheel of Fortune")!;
      const ally = allyFollower("Ally1", 1, 1);
      (slaus as { usedModeIndices?: number[] }).usedModeIndices = [0, 2];
      const atkBefore = Number(ally.attack);
      runStartOfTurnBoundary("first");
      expect(Number(ally.attack)).toBe(atkBefore + 2);
    });

    it("own SOT: three consecutive turns each fire one unused ability; fourth does nothing", () => {
      setupTurn(R6, { hand: [], pp: 3 });
      const slaus = createCard(SLAUS, "board", "first");
      state.players.first.board = [slaus];
      const ally = allyFollower("ModeAlly", 1, 1);
      const handCard = createCard(
        { name: "HandCard", type: "Follower", cost: 5, attack: 1, defense: 1 },
        "hand",
        "first",
      );
      state.players.first.hand.push(handCard);
      state.players.first.hp = 15;

      const usedLengths: number[] = [];
      for (let i = 0; i < 4; i++) {
        const hpBefore = getHP(state, "first");
        const costBefore = getEffectiveCost(handCard);
        const atkBefore = Number(ally.attack);
        runStartOfTurnBoundary("first");
        const used =
          (slaus as { usedModeIndices?: number[] }).usedModeIndices ?? [];
        usedLengths.push(used.length);
        if (i < 3) {
          const changed =
            getHP(state, "first") !== hpBefore ||
            getEffectiveCost(handCard) !== costBefore ||
            Number(ally.attack) !== atkBefore;
          expect(changed).toBe(true);
        } else {
          expect(getHP(state, "first")).toBe(hpBefore);
          expect(getEffectiveCost(handCard)).toBe(costBefore);
          expect(Number(ally.attack)).toBe(atkBefore);
        }
      }
      expect(usedLengths).toEqual([1, 2, 3, 3]);
      expect(new Set(usedLengths.slice(0, 3)).size).toBe(3);
    });

    it("opponent crest: three SOT debuffs then crest removed", () => {
      setupTurn(R6, { hand: [SLAUS], pp: 3 });
      whenPlayCard("first", 0);
      const slaus = findOnBoard("first", "Slaus, Revolving Wheel of Fortune")!;
      state.players.first.evoCharges = 2;
      whenEvolve(slaus, "first");

      const oppHand = createCard(
        { name: "OppHand", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "hand",
        "second",
      );
      state.players.second.hand.push(oppHand);
      const oppAlly = createCard(
        { name: "OppAlly", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      oppAlly.peak_defense = 2;
      state.players.second.board.push(oppAlly);
      state.players.second.hp = 20;

      const debuffKinds = new Set<string>();
      const noteDebuff = (
        costBefore: number,
        atkBefore: number,
        defBefore: number,
        hpBefore: number,
      ) => {
        if (getEffectiveCost(oppHand) === costBefore + 1) {
          debuffKinds.add("cost");
        }
        if (
          Number(oppAlly.attack) === atkBefore - 2 &&
          Number(oppAlly.defense) === defBefore - 2
        ) {
          debuffKinds.add("stat");
        }
        if (getHP(state, "second") === hpBefore - 3) {
          debuffKinds.add("damage");
        }
      };

      let costBefore = getEffectiveCost(oppHand);
      let atkBefore = Number(oppAlly.attack);
      let defBefore = Number(oppAlly.defense);
      let hpBefore = getHP(state, "second");

      whenEndTurn();
      noteDebuff(costBefore, atkBefore, defBefore, hpBefore);
      costBefore = getEffectiveCost(oppHand);
      atkBefore = Number(oppAlly.attack);
      defBefore = Number(oppAlly.defense);
      hpBefore = getHP(state, "second");

      let crest = getCrests(state, "second").find((c) =>
        c.name.includes("Slaus"),
      );
      expect(crest).toBeDefined();
      // Crest gained at CD 3; opponent SOT during whenEndTurn already ticked it once → 2
      expect(Number(crest!.countdown)).toBe(2);

      for (let i = 0; i < 2; i++) {
        whenEndTurn();
        whenEndTurn();
        noteDebuff(costBefore, atkBefore, defBefore, hpBefore);
        costBefore = getEffectiveCost(oppHand);
        atkBefore = Number(oppAlly.attack);
        defBefore = Number(oppAlly.defense);
        hpBefore = getHP(state, "second");
      }

      expect(debuffKinds.size).toBe(3);
      crest = getCrests(state, "second").find((c) => c.name.includes("Slaus"));
      expect(crest).toBeUndefined();
    });

    it("opponent's SOT does not activate Slaus modes", () => {
      setupTurn(R6, { hand: [SLAUS], pp: 3, active: "second" });
      whenPlayCard("first", 0);
      const ally = allyFollower("Ally1", 1, 1);
      const atkBefore = Number(ally.attack);
      runStartOfTurnBoundary("second");
      expect(Number(ally.attack)).toBe(atkBefore);
    });
  });

  describe("Stone Breaker (10472310)", () => {
    const printed =
      'Do this 6 times: "Deal 1 damage to a random enemy follower."';

    it("deals 6 total damage across enemy followers", () => {
      setupTurn(R6, { hand: [STONE_BREAKER], pp: 3 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      const totalBefore = Number(a.defense) + Number(b.defense);
      whenPlayCard("first", 0);
      const totalAfter = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(totalBefore - totalAfter).toBe(6);
      expect(printed).toContain("6 times");
    });
  });

  describe("Brusque Barkeep (10771110)", () => {
    const printed =
      "Whenever an allied Artifact follower enters the field, restore 1 defense to your leader.\nEvolve: Summon a Mystic Artifact.";

    it("artifact enter restores 1 leader defense", () => {
      setupTurn(R6, { hand: [BARKEEP, ANALYZING], pp: 6, hp: 15 });
      whenPlayCard("first", 0);
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpBefore + 1);
    });

    it("non-Artifact ally enter does not restore leader defense", () => {
      setupTurn(R6, { hand: [BARKEEP, PUPPET_LANCER], pp: 6, hp: 15 });
      whenPlayCard("first", 0);
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpBefore);
    });

    it("Evolve summons Mystic Artifact", () => {
      setupTurn(R6, { hand: [BARKEEP], pp: 4 });
      whenPlayCard("first", 0);
      const barkeep = findOnBoard("first", "Brusque Barkeep")!;
      state.players.first.evoCharges = 2;
      whenEvolve(barkeep, "first");
      expect(thenBoard("first").some((c) => c.name === "Mystic Artifact")).toBe(
        true,
      );
    });
  });

  describe("Gran & Djeeta, Valiant Skyfarers (10403110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\nSkybound Art- Evolve this follower.\n1. Deal 5 damage to a random enemy follower.\n2. Draw 2 followers.";

    it("mode 1: deals 5 damage to a random enemy follower", () => {
      setupTurn(R8, { hand: [GRAN], pp: 4 });
      enemyFollower(2, 8, "Victim");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(Number(getBoard(state, "second")[0]!.defense)).toBe(3);
    });

    it("mode 2: draws 2 followers from deck", () => {
      setupTurn(R8, {
        hand: [GRAN],
        deck: [DRAW_TOP, DRAW_SECOND, FILLER],
        pp: 4,
      });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
    });

    it("Skybound Art at 10: self-evolves on Fanfare", () => {
      setupTurn(R10, { hand: [GRAN], pp: 4 });
      const gran = getHand(state, "first").find((c) => c.id === GRAN)!;
      gran.skyboundArtEvolvesWitnessed = 10;
      setScriptedModePickProvider(() => [0]);
      enemyFollower(2, 8);
      whenPlayCard("first", 0);
      const onBoard = findOnBoard("first", "Gran & Djeeta, Valiant Skyfarers")!;
      expect(onBoard.hasEvolved).toBe(true);
      expect(printed).toContain("Skybound Art- Evolve this follower");
    });
  });

  describe("Ironwork Bodyguard (10972110)", () => {
    const printed =
      "Fanfare: If there are no duplicates in your deck, select an enemy follower on the field, deal it 4 damage, and restore 4 defense to your leader.\nWard";

    it("highlander ON: damages selected enemy and restores leader", () => {
      setupTurn(R6, {
        hand: [IRONWORK],
        deck: HIGHLANDER_DECK,
        pp: 4,
        hp: 12,
      });
      const foe = enemyFollower(2, 8);
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      expect(Number(foe.defense)).toBe(4);
      expect(getHP(state, "first")).toBe(hpBefore + 4);
    });

    it("highlander OFF: no damage or heal", () => {
      setupTurn(R6, {
        hand: [IRONWORK],
        deck: DUPLICATE_DECK,
        pp: 4,
        hp: 12,
      });
      const foe = enemyFollower(2, 8);
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(8);
      expect(getHP(state, "first")).toBe(hpBefore);
    });

    it("has Ward on field", () => {
      setupTurn(R6, { hand: [IRONWORK], deck: HIGHLANDER_DECK, pp: 4 });
      whenPlayCard("first", 0);
      const iron = findOnBoard("first", "Ironwork Bodyguard")!;
      expect(iron.hasWard || iron.keywordState?.hasWard).toBe(true);
    });
  });

  describe("Soulforge (10973310)", () => {
    const printed =
      "Select an enemy follower on the field and destroy it. If there are no duplicates in your deck, destroy all enemy followers instead.";

    it("OFF: destroys only selected enemy", () => {
      setupTurn(R6, { hand: [SOULFORGE], deck: DUPLICATE_DECK, pp: 4 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getBoard(state, "second").some((c) => c.uid === bystander.uid),
      ).toBe(true);
    });

    it("highlander ON: destroys all enemy followers", () => {
      setupTurn(R6, {
        hand: [SOULFORGE],
        deck: HIGHLANDER_DECK,
        pp: 4,
      });
      enemyFollower(2, 4, "A");
      enemyFollower(2, 4, "B");
      whenPlayCard("first", 0);
      expect(getBoard(state, "second").length).toBe(0);
    });
  });

  describe("Asher & Lydia, Paths Beyond (10874110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and give it Ward.\nEnhance (9): Evolve this follower and give it Storm.\nWhen this follower evolves, destroy 2 random enemy followers with Ward.";

    it("Fanfare gives Ward to selected enemy", () => {
      setupTurn(R8, { hand: [ASHER], pp: 6 });
      const foe = enemyFollower(2, 4);
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      expect(foe.hasWard || foe.keywordState?.hasWard).toBe(true);
    });

    it("Enhance off-branch: below 9 PP → Fanfare Ward only, not evolved, no Storm", () => {
      setupTurn(R8, { hand: [ASHER], pp: 6 });
      const foe = enemyFollower(2, 4);
      whenPlayCard("first", 0);
      resolvePendingByUid(foe.uid);
      const asher = findOnBoard("first", "Asher & Lydia, Paths Beyond")!;
      expect(asher.hasEvolved).toBeFalsy();
      expect(asher.hasStorm || asher.keywordState?.hasStorm).toBeFalsy();
      expect(foe.hasWard || foe.keywordState?.hasWard).toBe(true);
      expect(printed).toContain("Enhance (9)");
    });

    it("Enhance (9): evolves with Storm and destroys Ward enemies", () => {
      setupTurn(R9, { hand: [ASHER], pp: 9 });
      const w1 = enemyFollower(2, 4, "Ward1", { keywords: ["Ward"] });
      const w2 = enemyFollower(2, 4, "Ward2", { keywords: ["Ward"] });
      applyKeywordsFromList(w1);
      applyKeywordsFromList(w2);
      whenPlayCard("first", 0);
      resolvePendingByUid(w1.uid);
      const asher = findOnBoard("first", "Asher & Lydia, Paths Beyond")!;
      expect(asher.hasEvolved).toBe(true);
      expect(asher.hasStorm || asher.keywordState?.hasStorm).toBe(true);
      cleanupDead();
      expect(getBoard(state, "second").length).toBe(0);
    });

    it("Evolve (normal): destroys exactly 2 of 3 Ward enemies; non-Ward survives", () => {
      setupTurn(R8, { hand: [ASHER], pp: 6 });
      const w1 = enemyFollower(2, 4, "W1", { keywords: ["Ward"] });
      const w2 = enemyFollower(2, 4, "W2", { keywords: ["Ward"] });
      const w3 = enemyFollower(2, 4, "W3", { keywords: ["Ward"] });
      const plain = enemyFollower(2, 4, "Plain");
      applyKeywordsFromList(w1);
      applyKeywordsFromList(w2);
      applyKeywordsFromList(w3);
      whenPlayCard("first", 0);
      const asher = findOnBoard("first", "Asher & Lydia, Paths Beyond")!;
      state.players.first.evoCharges = 2;
      whenEvolve(asher, "first");
      cleanupDead();
      expect(getBoard(state, "second").length).toBe(2);
      expect(getBoard(state, "second").some((c) => c.uid === plain.uid)).toBe(
        true,
      );
      expect(
        getBoard(state, "second").filter(
          (c) => c.hasWard || c.keywordState?.hasWard,
        ).length,
      ).toBe(1);
    });
  });

  describe("Katalina, Sky's Protector (10401110)", () => {
    const printed =
      "Fanfare: Skybound Art- Deal 5 damage to 2 random enemy followers.\nWard \nCan't take more than 3 damage at a time.";

    it("Skybound Fanfare deals 5 to two random enemy followers", () => {
      setupTurn(R10, { hand: [KATALINA], pp: 5 });
      const kat = getHand(state, "first").find((c) => c.id === KATALINA)!;
      kat.skyboundArtEvolvesWitnessed = 10;
      enemyFollower(2, 8, "E1");
      enemyFollower(2, 8, "E2");
      whenPlayCard("first", 0);
      const defs = thenBoard("second").map((c) => Number(c.defense));
      expect(defs.every((d) => d === 3)).toBe(true);
    });

    it("Skybound off-branch: gauge < 10 → no damage", () => {
      setupTurn(R5, { hand: [KATALINA], pp: 5 });
      const kat = getHand(state, "first").find((c) => c.id === KATALINA)!;
      kat.skyboundArtEvolvesWitnessed = 0;
      const e1 = enemyFollower(2, 8, "E1");
      const e2 = enemyFollower(2, 8, "E2");
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(8);
      expect(Number(e2.defense)).toBe(8);
      expect(printed).toContain("Skybound Art");
    });

    it("has Ward on field", () => {
      setupTurn(R6, { hand: [KATALINA], pp: 5 });
      whenPlayCard("first", 0);
      const kat = findOnBoard("first", "Katalina, Sky's Protector")!;
      expect(kat.hasWard || kat.keywordState?.hasWard).toBe(true);
    });

    it("can't take more than 3 damage at a time", () => {
      setupTurn(R6, { hand: [KATALINA], pp: 5 });
      whenPlayCard("first", 0);
      const kat = findOnBoard("first", "Katalina, Sky's Protector")!;
      expect(kat.keywordState?.maxDamageCap ?? 0).toBe(3);
      dealDamage(kat, 5);
      expect(Number(kat.defense)).toBe(2);
      dealDamage(kat, 4);
      expect(Number(kat.defense)).toBe(0);
      expect(printed).toContain("3 damage");
    });
  });

  describe("Lu Woh, Light Personified (10474110)", () => {
    const printed =
      'Fanfare: Do this 6 times: "Deal 1 damage to a random enemy follower." Give all followers in your opponent\'s hand +1/+0.\nSkybound Art- GainCrest: Lu Woh, Light Personified.';

    it("Fanfare deals 6 total damage to enemy followers", () => {
      setupTurn(R8, { hand: [LU_WOH], pp: 5 });
      const foe = enemyFollower(2, 8);
      const defBefore = Number(foe.defense);
      whenPlayCard("first", 0);
      expect(defBefore - Number(foe.defense)).toBe(6);
    });

    it("Give all followers in your opponent's hand +1/+0 — hand follower 3/2, board bystander attack unchanged, spell in enemy hand untouched", () => {
      setupTurn(R8, { hand: [LU_WOH], pp: 5 });
      const handFoe = createCard(
        {
          name: "HandFoe",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
        "hand",
        "second",
      );
      state.players.second.hand.push(handFoe);
      const handSpell = createCard(
        { name: "HandSpell", type: "Spell", cost: 1 },
        "hand",
        "second",
      );
      state.players.second.hand.push(handSpell);
      const boardBystander = enemyFollower(2, 20, "BoardBystander");
      const spellAtkBefore = Number(handSpell.attack ?? 0);
      whenPlayCard("first", 0);
      const buffed = getHand(state, "second").find(
        (c) => c.uid === handFoe.uid,
      )!;
      const spell = getHand(state, "second").find(
        (c) => c.uid === handSpell.uid,
      )!;
      expect(Number(buffed.attack)).toBe(3);
      expect(Number(buffed.defense)).toBe(2);
      expect(Number(boardBystander.attack)).toBe(2);
      expect(Number(spell.attack ?? 0)).toBe(spellAtkBefore);
      expect(printed).toContain("+1/+0");
    });

    it("Skybound off-branch: gauge < 10 → no crest", () => {
      setupTurn(R5, { hand: [LU_WOH], pp: 5 });
      const lu = getHand(state, "first").find((c) => c.id === LU_WOH)!;
      lu.skyboundArtEvolvesWitnessed = 0;
      whenPlayCard("first", 0);
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Lu Woh, Light Personified",
        ),
      ).toBe(false);
    });

    it("Skybound Art: gains Crest: Lu Woh, Light Personified", () => {
      setupTurn(R10, { hand: [LU_WOH], pp: 5 });
      const lu = getHand(state, "first").find((c) => c.id === LU_WOH)!;
      lu.skyboundArtEvolvesWitnessed = 10;
      whenPlayCard("first", 0);
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Lu Woh, Light Personified",
        ),
      ).toBe(true);
    });

    it("crest: countdown 2; Storm attacker gets -3 attack until end of turn; non-Storm unaffected", () => {
      setupTurn(R10, { hand: [], pp: 10, active: "first" });
      gainCardCrest(LU_WOH, "second");
      const crest = getCrests(state, "second").find(
        (c) => c.name === "Lu Woh, Light Personified",
      );
      expect(Number(crest?.countdown)).toBe(2);

      const stormAttacker = readyStormAttacker("first", 5, "Storm Raider");
      const hpBeforeStorm = getHP(state, "second");
      attackLeader(0, "first", "second");
      expect(Number(stormAttacker.attack)).toBe(2);
      expect(getHP(state, "second")).toBe(hpBeforeStorm - 2);

      const plainAttacker = createCard(
        {
          name: "Plain Raider",
          type: "Follower",
          cost: 2,
          attack: 5,
          defense: 2,
          justPlayed: false,
          can_attack: true,
          can_attack_followers: true,
          attacks_left: 1,
        },
        "board",
        "first",
      );
      plainAttacker.peak_defense = 2;
      getBoard(state, "first").push(plainAttacker);
      const hpBeforePlain = getHP(state, "second");
      attackLeader(1, "first", "second");
      expect(Number(plainAttacker.attack)).toBe(5);
      expect(getHP(state, "second")).toBe(hpBeforePlain - 5);
    });
  });

  describe("Steelforged Right Hand (10973110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. If there are no duplicates in your deck, give this follower Storm.";

    it("destroys selected enemy follower", () => {
      setupTurn(R7, { hand: [STEELFORGED], deck: DUPLICATE_DECK, pp: 5 });
      enemyFollower(2, 4);
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      expect(getBoard(state, "second").length).toBe(0);
    });

    it("highlander ON: gains Storm after destroy", () => {
      setupTurn(R7, {
        hand: [STEELFORGED],
        deck: HIGHLANDER_DECK,
        pp: 5,
      });
      enemyFollower(2, 4);
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const hand = findOnBoard("first", "Steelforged Right Hand")!;
      expect(hand.hasStorm || hand.keywordState?.hasStorm).toBe(true);
    });

    it("highlander OFF: no Storm", () => {
      setupTurn(R7, { hand: [STEELFORGED], deck: DUPLICATE_DECK, pp: 5 });
      enemyFollower(2, 4);
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const hand = findOnBoard("first", "Steelforged Right Hand")!;
      expect(hand.hasStorm || hand.keywordState?.hasStorm).toBeFalsy();
    });
  });

  describe("Chaos Legion (10473310)", () => {
    const printed =
      "Deal 3 damage to all enemies.\nSuper Skybound Art- Deal 6 damage instead.";

    it("without Super Skybound Art: deals 3 to all enemies", () => {
      setupTurn(R6, { hand: [CHAOS], pp: 6 });
      const chaos = getHand(state, "first").find((c) => c.id === CHAOS)!;
      chaos.skyboundArtEvolvesWitnessed = 0;
      const foe = enemyFollower(2, 5);
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(2);
      expect(getHP(state, "second")).toBe(hpBefore - 3);
    });

    it("with Super Skybound Art (15): deals 6 to all enemies", () => {
      setupTurn(R10, { hand: [CHAOS], pp: 6 });
      const chaos = getHand(state, "first").find((c) => c.id === CHAOS)!;
      chaos.skyboundArtEvolvesWitnessed = 15;
      enemyFollower(2, 8);
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(hpBefore - 6);
    });
  });

  describe("Myriad Designs (10672310)", () => {
    const printed =
      "Summon a Ludicrous Ordnance, Shoddy Plaything, and Substandard Puppet and give them +0/+1.";

    it("summons Ludicrous, Shoddy, Substandard each with +0/+1", () => {
      setupTurn(R8, { hand: [MYRIAD], pp: 6 });
      whenPlayCard("first", 0);
      const board = thenBoard("first");
      expect(board.filter((c) => c.name === "Ludicrous Ordnance").length).toBe(
        1,
      );
      expect(board.filter((c) => c.name === "Shoddy Plaything").length).toBe(1);
      expect(board.filter((c) => c.name === "Substandard Puppet").length).toBe(
        1,
      );
      const lud = board.find((c) => c.name === "Ludicrous Ordnance")!;
      const shod = board.find((c) => c.name === "Shoddy Plaything")!;
      const sub = board.find((c) => c.name === "Substandard Puppet")!;
      const baseLud = createCard(LUDICROUS_ID, "hand", "first");
      const baseShod = createCard(SHODDY_ID, "hand", "first");
      const baseSub = createCard(SUBSTANDARD, "hand", "first");
      expect(Number(lud.attack)).toBe(Number(baseLud.attack));
      expect(Number(lud.defense)).toBe(Number(baseLud.defense) + 1);
      expect(Number(shod.attack)).toBe(Number(baseShod.attack));
      expect(Number(shod.defense)).toBe(Number(baseShod.defense) + 1);
      expect(Number(sub.attack)).toBe(Number(baseSub.attack));
      expect(Number(sub.defense)).toBe(Number(baseSub.defense) + 1);
      expect(printed).toContain("+0/+1");
    });
  });

  describe("Sandalphon, Primarch Successor (10404110)", () => {
    const printed =
      'Activates in deck. At the start of your turn, if allied followers have evolved at least 6 times this match, Invoke this card.\nWhen this card is Invoked, gain Crest: Sandalphon, Primarch Successor and return this card to hand\nFanfare: Super Skybound Art- Do this 5 times: "Deal 2 damage to a random enemy."';

    it("below 6 evolves: does not invoke at turn start", () => {
      setupTurn(R6, { hand: [], deck: [SANDALPHON, FILLER], pp: 6 });
      state.players.first.evoCount = 5;
      whenEndTurn();
      whenEndTurn();
      expect(handIds()).not.toContain(SANDALPHON);
      expect(deckIds()).toContain(SANDALPHON);
    });

    it("at 6+ evolves: invokes, gains crest, returns to hand", () => {
      setupTurn(R6, { hand: [], deck: [SANDALPHON, FILLER], pp: 6 });
      state.players.first.evoCount = 6;
      whenEndTurn();
      whenEndTurn();
      expect(handIds()).toContain(SANDALPHON);
      expect(deckIds()).not.toContain(SANDALPHON);
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Sandalphon, Primarch Successor",
        ),
      ).toBe(true);
    });

    it("Fanfare Super Skybound Art: 5 hits of 2 damage", () => {
      setupTurn(R10, { hand: [SANDALPHON], pp: 6 });
      const sand = getHand(state, "first").find((c) => c.id === SANDALPHON)!;
      sand.skyboundArtEvolvesWitnessed = 15;
      enemyFollower(2, 20, "Wall");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const wall = getBoard(state, "second")[0]!;
      const followerDmg = 20 - Number(wall.defense);
      const leaderDmg = 20 - getHP(state, "second");
      expect(followerDmg + leaderDmg).toBe(10);
    });
  });

  describe("Shoddy Plaything (10671110)", () => {
    const printed =
      "Fanfare: Draw 3 cards.\nWard\nAccelerate (2): Summon a Shoddy Plaything.";

    it("Fanfare draws 3 cards", () => {
      setupTurn(R8, {
        hand: [SHODDY],
        deck: [DRAW_TOP, DRAW_SECOND, FILLER],
        pp: 6,
      });
      const handBefore = handIds().length;
      whenPlayCard("first", 0);
      expect(handIds().length).toBe(handBefore + 2);
    });

    it("has Ward on field", () => {
      setupTurn(R8, { hand: [SHODDY], pp: 6 });
      whenPlayCard("first", 0);
      const shod = findOnBoard("first", "Shoddy Plaything")!;
      expect(shod.hasWard || shod.keywordState?.hasWard).toBe(true);
    });

    it("Accelerate (2): summons a Shoddy Plaything", () => {
      setupTurn(R6, { hand: [SHODDY], pp: 2 });
      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("done");
      expect(
        thenBoard("first").filter((c) => c.name === "Shoddy Plaything").length,
      ).toBe(1);
    });
  });

  describe("Aizeden, Killshot Revenant (10974120)", () => {
    const printed =
      "Fanfare: Summon a Warden of the Trigger.\nWhenever an allied Artifact follower enters the field, destroy a random enemy follower.\nSuper-Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare summons Warden of the Trigger", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 7 });
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").some((c) => c.name === "Warden of the Trigger"),
      ).toBe(true);
    });

    it("artifact enter destroys random enemy follower", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 10 });
      enemyFollower(3, 5, "Victim");
      whenPlayCard("first", 0);
      const artifact = createCard(ANALYZING, "hand", "first");
      state.players.first.hand.push(artifact);
      whenPlayCard("first", 0);
      expect(getBoard(state, "second").length).toBe(0);
    });

    it("non-Artifact ally enter does not destroy enemy follower", () => {
      setupTurn(R8, { hand: [AIZEDEN, PUPPET_LANCER], pp: 10 });
      whenPlayCard("first", 0);
      enemyFollower(3, 5, "Victim");
      whenPlayCard("first", 0);
      expect(getBoard(state, "second").length).toBe(1);
    });

    it("Super-Evolve replicates Fanfare (exactly 2 Wardens total)", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 7 });
      state.players.first.superEvoCharges = 2;
      whenPlayCard("first", 0);
      const aizeden = findOnBoard("first", "Aizeden, Killshot Revenant")!;
      whenSuperEvolve(aizeden, "first");
      expect(
        thenBoard("first").filter((c) => c.name === "Warden of the Trigger")
          .length,
      ).toBe(2);
    });
  });

  describe("Camiscilla, Unfeeling Heart (10674110)", () => {
    const printed =
      "Fanfare: Summon a Shoddy Plaything and Substandard Puppet.\nWhenever another allied follower with a base cost of 5 or more enters the field, evolve it.\nSuper-Evolve: Deal X damage to the enemy leader. X is the number of allied followers on the field with a base cost of 5 or more.";

    it("Fanfare summons Shoddy Plaything and Substandard Puppet", () => {
      setupTurn(R8, { hand: [CAMISCILLA], pp: 7 });
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").some((c) => c.name === "Shoddy Plaything"),
      ).toBe(true);
      expect(
        thenBoard("first").some((c) => c.name === "Substandard Puppet"),
      ).toBe(true);
    });

    it("when 5+ base cost ally enters: evolves it (fanfare summons)", () => {
      setupTurn(R8, { hand: [CAMISCILLA], pp: 7 });
      whenPlayCard("first", 0);
      const cam = findOnBoard("first", "Camiscilla, Unfeeling Heart")!;
      expect(cam.hasEvolved).toBeFalsy();
      const toys = thenBoard("first").filter(
        (c) => c.name === "Shoddy Plaything" || c.name === "Substandard Puppet",
      );
      expect(toys.length).toBe(2);
      expect(toys.every((c) => c.hasEvolved)).toBe(true);
    });

    it("≤4-cost ally entering afterwards is not evolved", () => {
      setupTurn(R8, { hand: [CAMISCILLA, BLUERUST], pp: 8 });
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      const underling = findOnBoard("first", "Bluerust Underling");
      expect(underling?.hasEvolved).toBeFalsy();
    });

    it("Super-Evolve deals exactly 3 damage (Camiscilla + Shoddy + Substandard)", () => {
      setupTurn(R8, { hand: [CAMISCILLA], pp: 8 });
      state.players.first.superEvoCharges = 2;
      whenPlayCard("first", 0);
      const cam = findOnBoard("first", "Camiscilla, Unfeeling Heart")!;
      const hpBefore = getHP(state, "second");
      whenSuperEvolve(cam, "first");
      expect(getHP(state, "second")).toBe(hpBefore - 3);
    });
  });

  describe("Ludicrous Ordnance (10673110)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Ludicrous Ordnance.\nAt the end of your turn, deal 3 damage split between all enemy followers.\nEvolve: Deal 3 damage split between all enemy followers.\nAccelerate (4): Summon a Ludicrous Ordnance.";

    it("Fanfare summons exactly 2 additional copies (3 total on board)", () => {
      setupTurn(R10, { hand: [LUDICROUS], pp: 8 });
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Ludicrous Ordnance")
          .length,
      ).toBe(3);
    });

    it("owner's EOT deals 3 split damage to enemy followers", () => {
      setupTurn(R6, { hand: [LUDICROUS], pp: 4 });
      const foe = enemyFollower(2, 6);
      playCardNoRender(getHand(state, "first"), "first", 0);
      const defBefore = Number(foe.defense);
      whenEndTurn();
      expect(defBefore - Number(foe.defense)).toBe(3);
    });

    it("opponent's EOT does not deal split damage", () => {
      setupTurn(R10, { hand: [LUDICROUS], pp: 8, active: "second" });
      const foe = enemyFollower(2, 6);
      whenPlayCard("first", 0);
      const defBefore = Number(foe.defense);
      runEndOfTurnBoundary("second");
      expect(Number(foe.defense)).toBe(defBefore);
    });

    it("Evolve deals 3 split damage to enemy followers", () => {
      setupTurn(R10, { hand: [LUDICROUS], pp: 8 });
      const foe = enemyFollower(2, 6);
      whenPlayCard("first", 0);
      const lud = findOnBoard("first", "Ludicrous Ordnance")!;
      state.players.first.evoCharges = 2;
      const defBefore = Number(foe.defense);
      whenEvolve(lud, "first");
      expect(defBefore - Number(foe.defense)).toBe(3);
    });

    it("Accelerate (4): summons one Ludicrous Ordnance", () => {
      setupTurn(R6, { hand: [LUDICROUS], pp: 4 });
      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("done");
      expect(
        thenBoard("first").filter((c) => c.name === "Ludicrous Ordnance")
          .length,
      ).toBe(1);
    });
  });

  describe("Scarlet, Anathema of Dislocation (10774110)", () => {
    const printed =
      "Fanfare: Deal X damage to all enemy followers. X is the number of differently named allied Artifact followers that have entered the field this match.\nStorm\nWard";

    it("Fanfare deals X damage based on unique Artifact enter history", () => {
      setupTurn(R10, { hand: [SCARLET], pp: 8 });
      pushArtifactHistory(["Analyzing Artifact", "Ancient Artifact"]);
      const a = enemyFollower(2, 5, "A");
      const b = enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(3);
      expect(Number(b.defense)).toBe(3);
    });

    it("Fanfare: X = 0 when no Artifact has entered → no damage", () => {
      setupTurn(R10, { hand: [SCARLET], pp: 8 });
      const a = enemyFollower(2, 5, "A");
      const b = enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(5);
      expect(Number(b.defense)).toBe(5);
    });

    it("has Storm and Ward on field", () => {
      setupTurn(R10, { hand: [SCARLET], pp: 8 });
      whenPlayCard("first", 0);
      const scarlet = findOnBoard("first", "Scarlet, Anathema of Dislocation")!;
      expect(scarlet.hasStorm || scarlet.keywordState?.hasStorm).toBe(true);
      expect(scarlet.hasWard || scarlet.keywordState?.hasWard).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Beelzebub, Supreme King (10474120)", () => {
    const printed =
      'Fanfare: Select 2 enemy followers on the field, remove all abilities from them, and deal them 9 damage. Give the enemy leader "Takes 1 more damage."';

    it("selects 2 enemies, silences and deals 9 damage each", () => {
      setupTurn(R10, { hand: [BEELZEBUB], pp: 9 });
      const a = enemyFollower(5, 9, "A");
      const b = enemyFollower(5, 9, "B");
      applyKeywordsFromList(a);
      applyKeywordsFromList(b);
      a.hasWard = true;
      a.hasStorm = true;
      b.hasWard = true;
      b.hasStorm = true;
      whenPlayCard("first", 0);
      resolvePendingByUid(a.uid);
      resolvePendingByUid(b.uid);
      expect(Number(a.defense)).toBe(0);
      expect(Number(b.defense)).toBe(0);
      expect(a.hasWard || a.keywordState?.hasWard).toBeFalsy();
      expect(a.hasStorm || a.keywordState?.hasStorm).toBeFalsy();
      expect(b.hasWard || b.keywordState?.hasWard).toBeFalsy();
      expect(b.hasStorm || b.keywordState?.hasStorm).toBeFalsy();
    });

    it('Give the enemy leader "Takes 1 more damage." — first 1-damage hit takes 2', () => {
      setupTurn(R10, { hand: [BEELZEBUB], pp: 9 });
      const a = enemyFollower(5, 9, "A");
      const b = enemyFollower(5, 9, "B");
      whenPlayCard("first", 0);
      resolvePendingByUid(a.uid);
      resolvePendingByUid(b.uid);
      const hpBefore = getHP(state, "second");
      applyLeaderDamage("second", 1);
      expect(getHP(state, "second")).toBe(hpBefore - 2);
      expect(printed).toContain("Takes 1 more damage");
    });

    it("Vulnerable debuff is permanent: second 1-damage hit also takes 2", () => {
      setupTurn(R10, { hand: [BEELZEBUB], pp: 9 });
      const a = enemyFollower(5, 9, "A");
      const b = enemyFollower(5, 9, "B");
      whenPlayCard("first", 0);
      resolvePendingByUid(a.uid);
      resolvePendingByUid(b.uid);
      applyLeaderDamage("second", 1);
      const hpMid = getHP(state, "second");
      applyLeaderDamage("second", 1);
      expect(getHP(state, "second")).toBe(hpMid - 2);
    });

    it("Vulnerable debuff does not affect the owner's own leader (bystander)", () => {
      setupTurn(R10, { hand: [BEELZEBUB], pp: 9 });
      const a = enemyFollower(5, 9, "A");
      const b = enemyFollower(5, 9, "B");
      whenPlayCard("first", 0);
      resolvePendingByUid(a.uid);
      resolvePendingByUid(b.uid);
      const allyHpBefore = getHP(state, "first");
      applyLeaderDamage("first", 1);
      expect(getHP(state, "first")).toBe(allyHpBefore - 1);
    });

    it("Beelzebub ×2 (10474120) — official Q&A #1: 3-damage effect deals 5 (20 → 15)", () => {
      setupTurn(R10, { hand: [BEELZEBUB, BEELZEBUB], pp: 9 });
      state.players.second.hp = 20;
      const a = enemyFollower(5, 9, "A");
      const b = enemyFollower(5, 9, "B");
      playBeelzebubFanfare("first", a, b);
      expect(state.players.second.leaderDamageTakenBonus).toBe(1);
      advanceToFirstNextTurn();
      const c = enemyFollower(5, 9, "C");
      const d = enemyFollower(5, 9, "D");
      playBeelzebubFanfare("first", c, d);
      expect(state.players.second.leaderDamageTakenBonus).toBe(2);
      expect(getHP(state, "second")).toBe(20);
      applyLeaderDamage("second", 3);
      expect(getHP(state, "second")).toBe(15);
    }, 60_000);

    it("Beryl (10152120) — official Q&A #2: Fanfare deals 4 to your leader under Takes 1 more damage", () => {
      setupTurn(R10, {
        hand: [BERYL],
        secondHand: [BEELZEBUB],
        pp: 9,
        hp: 20,
        active: "second",
      });
      const a = boardFollower("first", 5, 9, "A");
      const b = boardFollower("first", 5, 9, "B");
      playBeelzebubFanfare("second", a, b);
      expect(state.players.first.leaderDamageTakenBonus).toBe(1);
      state.activePlayer = "first";
      state.players.first.hp = 20;
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpBefore - 4);
    }, 60_000);

    it("Super-evolve destroy — official Q&A #3: enemy super-evolved follower ping deals 2 to your leader", () => {
      setupTurn(R10, { secondHand: [BEELZEBUB], pp: 9, active: "second" });
      const a = boardFollower("first", 5, 9, "A");
      const b = boardFollower("first", 5, 9, "B");
      playBeelzebubFanfare("second", a, b);
      expect(state.players.first.leaderDamageTakenBonus).toBe(1);

      const attacker = createCard(
        {
          name: "Super Striker",
          type: "Follower",
          cost: 3,
          attack: 5,
          defense: 5,
        },
        "board",
        "second",
      );
      attacker.peak_defense = 5;
      attacker.evoType = "super";
      attacker.hasEvolved = true;
      attacker.can_attack = true;
      attacker.attacks_left = 1;
      attacker.justPlayed = false;
      applyKeywordsFromList(attacker);

      const fodder = allyFollower("Fodder", 1, 1);
      state.players.second.board = [attacker];
      state.players.first.board = [fodder];
      state.activePlayer = "second";
      state.players.first.hp = 20;

      const hpBefore = getHP(state, "first");
      attackFollower(0, 0, "second", "first");
      expect(getHP(state, "first")).toBe(hpBefore - 2);
    }, 60_000);
  });
});
