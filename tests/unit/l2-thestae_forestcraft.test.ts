/**
 * L2 real-card tests — Thestae Forestcraft deck (15 distinct cards).
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
  thenDeck,
  thenBoard,
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
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getGraveyard,
  getCrests,
  getPlaysThisTurn,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck cards
const ELVEN_TRAPPER = "10711120";
const SPROUTING_INITIATE = "10911110";
const WORLD_OF_GAMES = "10503210";
const LEAFSHADOW_ASSASSIN = "10912110";
const LYRIA = "10403120";
const VERDANT_RING = "10912310";
const VIREWIND_FENCER = "10712110";
const VIRID_LIEUTENANT = "10913110";
const MAGACHIYO = "10914110";
const MIROKU = "10514120";
const CRIMSON_INCENSE = "10913310";
const THESTAE = "10714110";
const GREAT_HART = "10714120";
const SETUS = "10814110";
const HIEN = "10914120";

// Tokens / filler
const FAIRY = "90011110";
const DEEPWOOD = "90011310";
const FILLER = "10111310";
const DRAW_TOP = "10011110";
const DRAW_DEEP = "10011120";
const LYRIA_BIG = "10814110"; // cost 7 — Lyria Enhance search target
const RETURN_CARD = "10021110"; // distinct hand card for Elven Trapper return

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
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

function playCombo3(targetHandIndex: number): void {
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", targetHandIndex);
}

/** Play two fillers, snapshot hand uids, then play the combo target at index 0. */
function playCombo3WithHandSnapshot(): Set<string> {
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  const uidsBeforeTarget = handUids();
  whenPlayCard("first", 0);
  return uidsBeforeTarget;
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

function allyFollower(atk: number, def: number, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
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
    { op: "summon", source: "named", name: "Fairy", count: 1 },
  ];
  state.players.second.board.push(lw);
  return lw;
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

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
}

/** Cards that entered hand after `before` snapshot; optional id filter. */
function newHandCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
): CardInstance[] {
  const fresh = thenHand(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function playFillerFromFirst(): void {
  const hand = getHand(state, "first");
  const idx = hand.findIndex(
    (c) => c.id === FILLER || c.name === "Fairy Convocation",
  );
  expect(idx).toBeGreaterThanOrEqual(0);
  const result = playCardNoRender(hand, "first", idx);
  expect(result.kind).toBe("done");
}

describe("L2 Thestae Forestcraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Elven Trapper (10711120)", () => {
    const printed =
      "Fanfare: Select a card in your hand and return it to deck. Add 2 copies of Fairy to your hand.";

    it("Fanfare returns selected hand card to deck and adds 2 Fairies by identity", () => {
      setupTurn(R5, {
        hand: [ELVEN_TRAPPER, RETURN_CARD],
        deck: [DRAW_TOP],
        pp: 1,
      });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const returnCard = thenHand("first").find((c) => c.id === RETURN_CARD);
      expect(returnCard).toBeTruthy();
      resolvePendingByUid(returnCard!.uid);
      expect(handIds()).not.toContain(RETURN_CARD);
      expect(deckIds()).toContain(RETURN_CARD);
      const newFairies = newHandCards(uidsBefore, "first", FAIRY);
      expect(newFairies).toHaveLength(2);
      expect(printed).toContain("Fairy");
    });
  });

  describe("Sprouting Initiate (10911110)", () => {
    const printed = "Fanfare: Combo (3) - Draw a card.\nRush";

    it("without Combo(3): does not draw; still has Rush", () => {
      setupTurn(R5, {
        hand: [SPROUTING_INITIATE],
        deck: [DRAW_TOP],
        pp: 1,
      });
      whenPlayCard("first", 0);
      const sprout = findOnBoard("first", "Sprouting Initiate")!;
      expect(sprout.hasRush).toBe(true);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(deckIds()).toContain(DRAW_TOP);
    });

    it("Combo(3): draws stacked deck card by identity", () => {
      setupTurn(R5, {
        hand: [FILLER, FILLER, SPROUTING_INITIATE],
        deck: [DRAW_TOP],
        pp: 5,
      });
      playCombo3(0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });
  });

  describe("World of Games (10503210)", () => {
    const printed =
      "Countdown (5) / Whenever you play another card, if there's a card on the field other than it with the same base cost, advance this amulet's count by 1. / Last Words: Draw 2 cards.";

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

    it("when another field card shares played card base cost: advances countdown by 1", () => {
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
      expect(printed).toContain("advance this amulet's count");
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

    it("Last Words: draws 2 stacked deck cards by identity", () => {
      setupTurn(R6, {
        hand: [WORLD_OF_GAMES],
        deck: [FILLER, DRAW_DEEP, DRAW_TOP],
        pp: 1,
      });
      whenPlayCard("first", 0);
      const games = findOnBoard("first", "World of Games")!;
      games.countdown = 0;
      cleanupDead();
      expect(findOnBoard("first", "World of Games")).toBeFalsy();
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_DEEP);
    });
  });

  describe("Leafshadow Assassin (10912110)", () => {
    const printed =
      "Fanfare: Add a Fairy to your hand. Combo (3) - Give it Bane.";

    it("Fanfare adds Fairy by identity", () => {
      setupTurn(R6, { hand: [LEAFSHADOW_ASSASSIN], pp: 2 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      expect(newHandCards(uidsBefore, "first", FAIRY)).toHaveLength(1);
    });

    it("without Combo(3): added Fairy lacks Bane", () => {
      setupTurn(R6, { hand: [LEAFSHADOW_ASSASSIN], pp: 2 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const fairy = newHandCards(uidsBefore, "first", FAIRY)[0]!;
      expect(fairy.hasBane).toBeFalsy();
    });

    it("Combo(3): gives the newly added Fairy Bane; Convocation Fairies untouched", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, LEAFSHADOW_ASSASSIN],
        pp: 6,
      });
      const uidsBeforeAssassin = playCombo3WithHandSnapshot();
      const convocationFairies = thenHand("first").filter(
        (c) => c.id === FAIRY && uidsBeforeAssassin.has(c.uid),
      );
      expect(convocationFairies).toHaveLength(4);
      for (const fairy of convocationFairies) {
        expect(fairy.hasBane).toBeFalsy();
      }
      const addedFairy = newHandCards(uidsBeforeAssassin, "first", FAIRY)[0]!;
      expect(addedFairy.hasBane).toBe(true);
      expect(printed).toContain("Give it Bane");
    });
  });

  describe("Lyria, Skydestined (10403120)", () => {
    const printed =
      "Enhance(8): Draw a follower that costs 7 or more. Recover 7 play points\nBarrier";

    it("without Enhance(8): plays as 2-cost follower with Barrier, no big draw", () => {
      setupTurn(R6, {
        hand: [LYRIA],
        pp: 2,
        deck: [LYRIA_BIG, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      const lyria = findOnBoard("first", "Lyria, Skydestined")!;
      expect(lyria.hasBarrier || lyria.keywordState?.hasBarrier).toBe(true);
      expect(handIds()).not.toContain(LYRIA_BIG);
      expect(deckIds()).toContain(LYRIA_BIG);
      expect(getPP(state, "first")).toBe(0);
    });

    it("Enhance(8): draws cost ≥7 follower and recovers 7 PP", () => {
      setupTurn(R10, {
        hand: [LYRIA],
        pp: 8,
        deck: [LYRIA_BIG, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(LYRIA_BIG);
      expect(deckIds()).toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(LYRIA_BIG);
      expect(getPP(state, "first")).toBe(7);
      expect(findOnBoard("first", "Lyria, Skydestined")).toBeDefined();
      expect(printed).toContain("Recover 7 play points");
    });
  });

  describe("Verdant Ring Kindred (10912310)", () => {
    const printed =
      "Select a Mode to activate. Combo (3) - Activate all of them instead.\n1. Deal 4 damage to a random enemy follower.\n2. Add a Deepwood Bounty and Fairy to your hand.";

    it("without Combo(3) Mode 1: deals 4 damage to one enemy follower (seed 42)", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, { hand: [VERDANT_RING], pp: 2 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const dmg = 6 - Number(target.defense) + (6 - Number(bystander.defense));
      expect(dmg).toBe(4);
      expect(handIds()).not.toContain(DEEPWOOD);
      expect(handIds()).not.toContain(FAIRY);
    });

    it("without Combo(3) Mode 2: adds Deepwood Bounty and Fairy by identity", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(R6, { hand: [VERDANT_RING], pp: 2 });
      enemyFollower(2, 6, "Target");
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(newHandCards(uidsBefore, "first", DEEPWOOD)).toHaveLength(1);
      expect(newHandCards(uidsBefore, "first", FAIRY)).toHaveLength(1);
    });

    it("Combo(3): activates both modes — damage plus hand tokens", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, VERDANT_RING],
        pp: 6,
      });
      const foe = enemyFollower(2, 6, "Foe");
      const defBefore = Number(foe.defense);
      const uidsBeforeRing = playCombo3WithHandSnapshot();
      expect(defBefore - Number(foe.defense)).toBe(4);
      expect(newHandCards(uidsBeforeRing, "first", DEEPWOOD)).toHaveLength(1);
      expect(newHandCards(uidsBeforeRing, "first", FAIRY)).toHaveLength(1);
      expect(printed).toContain("Activate all of them");
    });
  });

  describe("Virewind Fencer (10712110)", () => {
    const printed = "Fanfare: Combo (3) - Give this follower Storm.";

    it("without Combo(3): does not gain Storm", () => {
      setupTurn(R5, { hand: [VIREWIND_FENCER], pp: 2 });
      whenPlayCard("first", 0);
      const fencer = findOnBoard("first", "Virewind Fencer")!;
      expect(fencer.hasStorm).toBeFalsy();
    });

    it("Combo(3): gains Storm", () => {
      setupTurn(R5, {
        hand: [FILLER, FILLER, VIREWIND_FENCER],
        pp: 5,
      });
      playCombo3(0);
      const fencer = findOnBoard("first", "Virewind Fencer")!;
      expect(fencer.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Virid Lieutenant (10913110)", () => {
    const printed =
      "Fanfare: Combo (3) - Draw 2 cards.\nEvolve: Select another allied follower on the field and give it +1/+1 and Rush.";

    it("without Combo(3): does not draw from deck", () => {
      setupTurn(R6, {
        hand: [VIRID_LIEUTENANT],
        deck: [DRAW_TOP, DRAW_DEEP],
        pp: 2,
      });
      whenPlayCard("first", 0);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(handIds()).not.toContain(DRAW_DEEP);
      expect(deckIds()).toContain(DRAW_TOP);
    });

    it("Combo(3): draws 2 stacked deck cards by identity", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, VIRID_LIEUTENANT],
        deck: [DRAW_TOP, DRAW_DEEP],
        pp: 6,
      });
      playCombo3(0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_DEEP);
    });

    it("Evolve buffs another allied follower +1/+1 and Rush, not self", () => {
      setupTurn(R6, { hand: [VIRID_LIEUTENANT], pp: 2, evo: 2 });
      const ally = allyFollower(1, 1, "Bystander");
      whenPlayCard("first", 0);
      const lt = findOnBoard("first", "Virid Lieutenant")!;
      whenEvolve(lt, "first");
      resolveFirstPending();
      expect(Number(ally.attack)).toBe(2);
      expect(Number(ally.defense)).toBe(2);
      expect(ally.hasRush).toBe(true);
      expect(Number(lt.attack)).toBe(3);
      expect(Number(lt.defense)).toBe(5);
      expect(lt.hasRush).toBe(false);
      expect(printed).toContain("another allied follower");
    });
  });

  describe("Magachiyo, Aromatic Convict (10914110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 4 damage. Combo (3) - Deal damage to all enemy followers instead.\nSuper-Evolve: Give this follower Storm.";

    it("without Combo(3): deals 4 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [MAGACHIYO], pp: 3 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("Combo(3): damages all enemy followers instead of single select", () => {
      setupTurn(R6, { hand: [FILLER, FILLER, MAGACHIYO], pp: 6 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      playCombo3(0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(state.pendingTargetEffect).toBeUndefined();
    });

    it("Super-Evolve grants Storm", () => {
      setupTurn(R7, { hand: [MAGACHIYO], pp: 3 });
      whenPlayCard("first", 0);
      const maga = findOnBoard("first", "Magachiyo, Aromatic Convict")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(maga, "first");
      expect(maga.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Miroku, Swarmpetal (10514120)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Add 2 copies of Fairy to your hand.\n2. Recover 2 play points.\n3. Deal 3 damage split between all enemy followers.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Mode 1: adds 2 Fairies to hand by identity", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, { hand: [MIROKU], pp: 3 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(newHandCards(uidsBefore, "first", FAIRY)).toHaveLength(2);
    });

    it("Mode 2: recovers 2 play points", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(R6, { hand: [MIROKU], pp: 3 });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getPP(state, "first")).toBe(2);
    });

    it("Mode 3: deals 3 split damage to enemy followers", () => {
      setScriptedModePickProvider(() => [2]);
      setupTurn(R6, { hand: [MIROKU], pp: 3 });
      const a = enemyFollower(1, 2, "A");
      const b = enemyFollower(1, 2, "B");
      const startDef = Number(a.defense) + Number(b.defense);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const endDef = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(startDef - endDef).toBe(3);
    });

    it("Evolve replicates Fanfare mode pick", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, { hand: [MIROKU], pp: 3, evo: 2 });
      const uidsBeforeFanfare = handUids();
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(newHandCards(uidsBeforeFanfare, "first", FAIRY)).toHaveLength(2);
      const miroku = findOnBoard("first", "Miroku, Swarmpetal")!;
      const uidsBeforeEvolve = handUids();
      setScriptedModePickProvider(() => [0]);
      whenEvolve(miroku, "first");
      setScriptedModePickProvider(null);
      expect(newHandCards(uidsBeforeEvolve, "first", FAIRY)).toHaveLength(2);
      expect(newHandCards(uidsBeforeFanfare, "first", FAIRY)).toHaveLength(4);
    });
  });

  describe("Crimson Incense (10913310)", () => {
    const printed =
      "Activates in hand. At the end of your turn, Combo (3) - Reduce the cost of this card by 1.\nSelect an enemy follower on the field and destroy it. Draw a card.";

    it("destroys selected enemy (graveyard, not banish); bystander untouched", () => {
      setupTurn(R6, { hand: [CRIMSON_INCENSE], pp: 4, deck: [DRAW_TOP] });
      const target = enemyLastWordsFollower("Victim");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getGraveyard(state, "second").some((c) => c.uid === target.uid),
      ).toBe(true);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("on play draws stacked deck card by identity", () => {
      setupTurn(R6, { hand: [CRIMSON_INCENSE], pp: 4, deck: [DRAW_TOP] });
      enemyFollower(2, 4, "Victim");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(CRIMSON_INCENSE);
    });

    it("Combo(3) at owner's EOT: reduces cost by 1", () => {
      setupTurn(R6, {
        hand: [CRIMSON_INCENSE, FILLER, FILLER, FILLER],
        pp: 6,
        deck: [DRAW_TOP, DRAW_TOP, DRAW_TOP],
      });
      const incense = thenHand("first").find((c) => c.id === CRIMSON_INCENSE)!;
      expect(getEffectiveCost(incense)).toBe(4);
      playFillerFromFirst();
      playFillerFromFirst();
      playFillerFromFirst();
      expect(getPlaysThisTurn(state, "first")).toBe(3);
      whenEndTurn();
      const incenseAfter = thenHand("first").find(
        (c) => c.id === CRIMSON_INCENSE,
      )!;
      expect(getEffectiveCost(incenseAfter)).toBe(3);
      expect(printed).toContain("Reduce the cost");
    });

    it("below Combo(3) at owner's EOT: cost unchanged", () => {
      setupTurn(R6, {
        hand: [CRIMSON_INCENSE, FILLER],
        pp: 6,
        deck: [DRAW_TOP, DRAW_TOP, DRAW_TOP],
      });
      const incense = thenHand("first").find((c) => c.id === CRIMSON_INCENSE)!;
      playFillerFromFirst();
      whenEndTurn();
      const incenseAfter = thenHand("first").find(
        (c) => c.id === CRIMSON_INCENSE,
      )!;
      expect(getEffectiveCost(incenseAfter)).toBe(4);
    });

    it("opponent's EOT: does not reduce cost while Incense stays in hand", () => {
      setupTurn(R6, {
        hand: [CRIMSON_INCENSE],
        pp: 6,
        secondHand: [FILLER, FILLER, FILLER],
        secondPP: 6,
        deck: [DRAW_TOP, DRAW_TOP, DRAW_TOP],
      });
      whenEndTurn();
      expect(state.activePlayer).toBe("second");
      playCardNoRender(getHand(state, "second"), "second", 0);
      playCardNoRender(getHand(state, "second"), "second", 0);
      playCardNoRender(getHand(state, "second"), "second", 0);
      whenEndTurn();
      const incense = thenHand("first").find((c) => c.id === CRIMSON_INCENSE)!;
      expect(getEffectiveCost(incense)).toBe(4);
    });
  });

  describe("Thestae, Anathema of Distortion (10714110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and give it -0/-X. X is this follower's attack. Increase your Combo by 1.\nEvolve: Gain Crest: Thestae, Anathema of Distortion.";
    const crestPrinted =
      "Countdown (3)\nAt the end of your turn, Combo (3) - Give all followers in your deck +1/+1.";

    it("Fanfare gives selected enemy -0/-X where X is Thestae attack; bystander untouched", () => {
      setupTurn(R7, { hand: [THESTAE], pp: 4 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(5);
      expect(Number(target.attack)).toBe(2);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("Fanfare increases Combo by 1", () => {
      setupTurn(R7, { hand: [THESTAE], pp: 4 });
      enemyFollower(2, 8, "Target");
      expect(getPlaysThisTurn(state, "first")).toBe(0);
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(getPlaysThisTurn(state, "first")).toBe(2);
      expect(printed).toContain("Increase your Combo by 1");
    });

    it("Evolve gains Crest: Thestae with Countdown (3)", () => {
      setupTurn(R7, { hand: [THESTAE], pp: 4, evo: 2 });
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const thestae = findOnBoard("first", "Thestae, Anathema of Distortion")!;
      whenEvolve(thestae, "first");
      const crest = getCrests(state, "first").find((c) =>
        c.name.includes("Thestae"),
      );
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(3);
    });

    it("crest owner's EOT Combo(3): buffs deck followers +1/+1, not hand followers", () => {
      setupTurn(R7, { hand: [THESTAE], pp: 4, evo: 2 });
      const deckF = createCard(
        { name: "DeckFolo", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "deck",
        "first",
      );
      const handF = createCard(
        { name: "HandFolo", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "hand",
        "first",
      );
      state.players.first.deck = [deckF];
      state.players.first.hand.push(handF);
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const thestae = findOnBoard("first", "Thestae, Anathema of Distortion")!;
      whenEvolve(thestae, "first");
      state.players.first.playsThisTurn = 3;
      whenEndTurn();
      expect(Number(deckF.attack)).toBe(3);
      expect(Number(deckF.defense)).toBe(3);
      expect(Number(handF.attack)).toBe(2);
      expect(crestPrinted).toContain("followers in your deck");
    });

    it("crest owner's EOT below Combo(3): deck followers unchanged", () => {
      setupTurn(R7, { hand: [THESTAE], pp: 4, evo: 2 });
      const deckF = createCard(
        { name: "DeckFolo", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "deck",
        "first",
      );
      state.players.first.deck = [deckF];
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const thestae = findOnBoard("first", "Thestae, Anathema of Distortion")!;
      whenEvolve(thestae, "first");
      state.players.first.playsThisTurn = 2;
      whenEndTurn();
      expect(Number(deckF.attack)).toBe(2);
      expect(Number(deckF.defense)).toBe(2);
    });

    it("crest owner's EOT Combo(3): deck buff persists on draw and on board (owner ruling 2026-08-13)", () => {
      setupTurn(R7, {
        hand: [THESTAE],
        pp: 4,
        evo: 2,
        deck: [FILLER, FILLER, FILLER],
      });
      const deckF = createCard(
        { name: "DeckFolo", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "deck",
        "first",
      );
      state.players.first.deck = [FILLER, deckF];
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const thestae = findOnBoard("first", "Thestae, Anathema of Distortion")!;
      whenEvolve(thestae, "first");
      state.players.first.playsThisTurn = 3;
      whenEndTurn();
      expect(Number(deckF.attack)).toBe(3);
      expect(Number(deckF.defense)).toBe(3);
      whenEndTurn();
      const drawn = getHand(state, "first").find((c) => c.uid === deckF.uid)!;
      expect(Number(drawn.attack)).toBe(3);
      expect(Number(drawn.defense)).toBe(3);
      const idx = getHand(state, "first").findIndex((c) => c.uid === deckF.uid);
      const playResult = playCardNoRender(
        getHand(state, "first"),
        "first",
        idx,
      );
      expect(playResult.kind).toBe("done");
      const onBoard = thenBoard("first").find((c) => c.uid === deckF.uid)!;
      expect(Number(onBoard.attack)).toBe(3);
      expect(Number(onBoard.defense)).toBe(3);
    });

    it("crest does not buff deck followers on opponent's EOT", () => {
      setupTurn(R7, {
        hand: [THESTAE],
        pp: 4,
        evo: 2,
        secondHand: [FILLER, FILLER, FILLER],
        secondPP: 6,
        deck: [FILLER, FILLER, FILLER],
      });
      const deckF = createCard(
        { name: "DeckFolo", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "deck",
        "first",
      );
      state.players.first.deck = [deckF];
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const thestae = findOnBoard("first", "Thestae, Anathema of Distortion")!;
      whenEvolve(thestae, "first");
      whenEndTurn();
      expect(state.activePlayer).toBe("second");
      playCardNoRender(getHand(state, "second"), "second", 0);
      playCardNoRender(getHand(state, "second"), "second", 0);
      playCardNoRender(getHand(state, "second"), "second", 0);
      whenEndTurn();
      expect(Number(deckF.attack)).toBe(2);
      expect(Number(deckF.defense)).toBe(2);
    });

    it("crest expires after Countdown (3) owner turn-starts", () => {
      setupTurn(R7, {
        hand: [THESTAE],
        pp: 4,
        evo: 2,
        deck: [FILLER, FILLER, FILLER],
      });
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const thestae = findOnBoard("first", "Thestae, Anathema of Distortion")!;
      whenEvolve(thestae, "first");
      expect(
        getCrests(state, "first").some((c) => c.name.includes("Thestae")),
      ).toBe(true);
      for (let i = 0; i < 3; i++) {
        whenEndTurn();
        whenEndTurn();
      }
      expect(
        getCrests(state, "first").some((c) => c.name.includes("Thestae")),
      ).toBe(false);
    });
  });

  describe("Great Hart of the Glacial Realm (10714120)", () => {
    const printed =
      "Fanfare: Add 2 copies of Deepwood Bounty to your hand.\nAt the end of your turn, deal X damage split between all enemy followers. X is this follower's attack.\nSuper-Evolve: Gain Crest: Great Hart of the Glacial Realm.";
    const crestPrinted =
      "Countdown (3)\nAt the end of your turn, Combo (3) - Add a Deepwood Bounty to your hand.";

    it("Fanfare adds 2 Deepwood Bounty to hand by identity", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      expect(newHandCards(uidsBefore, "first", DEEPWOOD)).toHaveLength(2);
    });

    it("owner's EOT: deals attack-value split damage to enemy followers", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      const a = enemyFollower(1, 3, "A");
      const b = enemyFollower(1, 3, "B");
      whenPlayCard("first", 0);
      const startTotal = Number(a.defense) + Number(b.defense);
      whenEndTurn();
      const endTotal = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(startTotal - endTotal).toBe(5);
    });

    it("opponent's EOT: does not deal split damage", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6, active: "second" });
      const foe = enemyFollower(1, 5, "Foe");
      whenPlayCard("first", 0);
      const defBefore = Number(foe.defense);
      runEndOfTurnBoundary("second");
      expect(Number(foe.defense)).toBe(defBefore);
    });

    it("Super-Evolve gains Crest: Great Hart with Countdown (3)", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      whenPlayCard("first", 0);
      const hart = findOnBoard("first", "Great Hart of the Glacial Realm")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(hart, "first");
      const crest = getCrests(state, "first").find((c) =>
        c.name.includes("Great Hart"),
      );
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(3);
    });

    it("crest owner's EOT Combo(3): adds a new Deepwood Bounty to hand", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      const uidsBeforePlay = handUids();
      whenPlayCard("first", 0);
      const fanfareBounties = newHandCards(uidsBeforePlay, "first", DEEPWOOD);
      expect(fanfareBounties).toHaveLength(2);
      const hart = findOnBoard("first", "Great Hart of the Glacial Realm")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(hart, "first");
      const uidsBeforeEot = handUids();
      state.players.first.playsThisTurn = 3;
      whenEndTurn();
      expect(newHandCards(uidsBeforeEot, "first", DEEPWOOD)).toHaveLength(1);
      expect(crestPrinted).toContain("Deepwood Bounty");
    });

    it("crest owner's EOT below Combo(3): does not add Deepwood Bounty", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      const uidsBeforePlay = handUids();
      whenPlayCard("first", 0);
      newHandCards(uidsBeforePlay, "first", DEEPWOOD);
      const hart = findOnBoard("first", "Great Hart of the Glacial Realm")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(hart, "first");
      const uidsBeforeEot = handUids();
      state.players.first.playsThisTurn = 2;
      whenEndTurn();
      expect(newHandCards(uidsBeforeEot, "first", DEEPWOOD)).toHaveLength(0);
    });

    it("crest does not add Deepwood Bounty on opponent's EOT", () => {
      setupTurn(R7, {
        hand: [GREAT_HART],
        pp: 6,
        secondHand: [FILLER, FILLER, FILLER],
        secondPP: 6,
        deck: [FILLER, FILLER, FILLER],
      });
      const uidsBeforePlay = handUids();
      whenPlayCard("first", 0);
      newHandCards(uidsBeforePlay, "first", DEEPWOOD);
      const hart = findOnBoard("first", "Great Hart of the Glacial Realm")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(hart, "first");
      whenEndTurn();
      expect(state.activePlayer).toBe("second");
      const uidsBeforeOpponentEot = handUids();
      playCardNoRender(getHand(state, "second"), "second", 0);
      playCardNoRender(getHand(state, "second"), "second", 0);
      playCardNoRender(getHand(state, "second"), "second", 0);
      whenEndTurn();
      expect(
        newHandCards(uidsBeforeOpponentEot, "first", DEEPWOOD),
      ).toHaveLength(0);
    });

    it("crest expires after Countdown (3) owner turn-starts", () => {
      setupTurn(R7, {
        hand: [GREAT_HART],
        pp: 6,
        deck: [FILLER, FILLER, FILLER],
      });
      whenPlayCard("first", 0);
      const hart = findOnBoard("first", "Great Hart of the Glacial Realm")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(hart, "first");
      expect(
        getCrests(state, "first").some((c) => c.name.includes("Great Hart")),
      ).toBe(true);
      for (let i = 0; i < 3; i++) {
        whenEndTurn();
        whenEndTurn();
      }
      expect(
        getCrests(state, "first").some((c) => c.name.includes("Great Hart")),
      ).toBe(false);
    });
  });

  describe("Setus & Maisha, Bladerights (10814110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. Give all other allied followers on the field +1/+1.\nStorm\nWard";

    it("destroys selected enemy (graveyard, not banish); bystander enemy untouched", () => {
      setupTurn(R8, { hand: [SETUS], pp: 7 });
      const target = enemyLastWordsFollower("Victim");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getGraveyard(state, "second").some((c) => c.uid === target.uid),
      ).toBe(true);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("buffs other allied follower +1/+1 but not self; has Storm and Ward", () => {
      setupTurn(R8, { hand: [SETUS], pp: 7 });
      const bystander = allyFollower(2, 2, "Bystander");
      const victim = enemyFollower(2, 3, "Victim");
      whenPlayCard("first", 0);
      resolvePendingByUid(victim.uid);
      const setus = findOnBoard("first", "Setus & Maisha, Bladerights")!;
      expect(setus.hasStorm).toBe(true);
      expect(setus.hasWard).toBe(true);
      expect(Number(setus.attack)).toBe(4);
      expect(Number(setus.defense)).toBe(6);
      expect(Number(bystander.attack)).toBe(3);
      expect(Number(bystander.defense)).toBe(3);
      expect(printed).toContain("all other allied followers");
    });
  });

  describe("Hien, Redolent Revenant (10914120)", () => {
    const printed =
      "Activates in hand. Whenever you play a card, reduce the cost of this card by 1 until the end of the turn.\nFanfare: Select an enemy follower on the field and deal it 4 damage.\nLast Words: Summon a Hien, Redolent Revenant.";

    function hienInHand() {
      const hien = getHand(state, "first").find(
        (c) => c.id === HIEN || c.name === "Hien, Redolent Revenant",
      );
      expect(hien).toBeTruthy();
      return hien!;
    }

    it("playing one allied card reduces Hien cost 9 → 8 while in hand", () => {
      setupTurn(R10, {
        hand: [HIEN, FILLER],
        pp: 10,
        deck: [FILLER, FILLER],
      });
      expect(getEffectiveCost(hienInHand())).toBe(9);
      playFillerFromFirst();
      expect(getEffectiveCost(hienInHand())).toBe(8);
    });

    it("reductions expire at end of turn (back to 9 next turn)", () => {
      setupTurn(R10, {
        hand: [HIEN, FILLER, FILLER],
        pp: 10,
        deck: [FILLER, FILLER, FILLER],
      });
      playFillerFromFirst();
      playFillerFromFirst();
      expect(getEffectiveCost(hienInHand())).toBe(7);
      whenEndTurn();
      whenEndTurn();
      expect(getEffectiveCost(hienInHand())).toBe(9);
    });

    it("opponent playing cards does not reduce Hien in your hand", () => {
      setupTurn(R10, {
        hand: [HIEN],
        pp: 10,
        secondHand: [FILLER],
        secondPP: 10,
        deck: [FILLER, FILLER],
      });
      whenEndTurn();
      expect(state.activePlayer).toBe("second");
      const secondHand = getHand(state, "second");
      const idx = secondHand.findIndex((c) => c.id === FILLER);
      expect(playCardNoRender(secondHand, "second", idx).kind).toBe("done");
      expect(getEffectiveCost(hienInHand())).toBe(9);
    });

    it("Fanfare deals 4 to selected enemy; bystander untouched", () => {
      setupTurn(R10, { hand: [HIEN], pp: 9 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("Last Words summons exactly one Hien on board by identity", () => {
      setupTurn(R10, { hand: [HIEN], pp: 9 });
      enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const hien = findOnBoard("first", "Hien, Redolent Revenant")!;
      hien.defense = 0;
      cleanupDead();
      expect(boardIds().filter((id) => id === HIEN)).toHaveLength(1);
      expect(printed).toContain("Summon a Hien");
    });
  });
});
