/**
 * L2 real-card tests — rotation-legal Forestcraft cards without dedicated L2 files.
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 *
 * Clauses fully covered in audit tests are cited in the PR description (not duplicated here):
 * Bug Alert, Chloe, Anthuria, Flowering Friendship, Wolfraud, Monkey of Paradise,
 * Primate Plotters.
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
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { getSkyboundArtGauge } from "../../src/logic/effects/skybound.js";
import {
  getBoard,
  getHand,
  getHP,
  getGraveyard,
  getCrests,
  getPlaysThisTurn,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Cards under test
const MAGNIFIED_MALICE = "10713310";
const MINIMIZED_ANXIETY = "10712310";
const MOELLE = "10811130";
const STARRY_SKY = "10412310";
const ALFHEIMR = "10413310";
const COMET_DRIVE = "10411310";
const WILD_PROFUSION = "10011210";
const FROSTBOW = "10713110";
const GRACE = "10513310";
const QUIET_ENC = "10512310";
const GENTLE_TREANT = "10011130";
const MANAMEL = "10411120";
const PEACEFUL = "10812310";
const BATTLEDORe = "10511120";
const FAIRY_BEAST = "10512120";
const FLORAL = "10612310";
const HAWKEYED = "10712120";
const YUEL = "10414120";
const HOWLING = "10612120";
const ADVENT = "10611310";
const JUNGLE = "10911120";
const KOU_YOU = "10411110";
const MARLONE = "10811110";
const SELWYN = "10012120";
const MACROBEAR = "10711110";
const TRAP = "10911210";

// Tokens / filler
const FAIRY = "90011110";
const SPRINGBLOOM = "90011120";
const FILLER = "10111310";
const DRAW_TOP = "10011110";
const DRAW_DEEP = "10011120";
const RETURN_CARD = "10021110";
const EVOLVED_ALLY = "10112120";

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

function playCombo3(targetHandIndex: number): void {
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", targetHandIndex);
}

function playCombo5(targetHandIndex: number): void {
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", targetHandIndex);
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

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
}

function newHandCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
) {
  const fresh = thenHand(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

describe("L2 — rotation Forestcraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Magnified Malice (10713310)", () => {
    const printed =
      "Deal 2 damage to a random enemy follower. Combo (3) - Gain Crest: Magnified Malice.";
    const crestPrinted =
      "Countdown (1) / Last Words: Add a Minimized Anxiety to your hand.";

    it("deals 2 damage to a random enemy follower", () => {
      setupTurn(R5, { hand: [MAGNIFIED_MALICE], pp: 1 });
      const foe = enemyFollower(2, 5, "Foe");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      const totalDef = Number(foe.defense) + Number(bystander.defense);
      expect(10 - totalDef).toBe(2);
      expect(getHP(state, "second")).toBe(20);
      expect(printed).toContain("Deal 2 damage");
    });

    it("without Combo(3): does not gain crest", () => {
      setupTurn(R5, { hand: [MAGNIFIED_MALICE], pp: 1 });
      enemyFollower(2, 5);
      whenPlayCard("first", 0);
      expect(
        getCrests(state, "first").some((c) =>
          c.name.includes("Magnified Malice"),
        ),
      ).toBe(false);
    });

    it("Combo(3): gains Crest: Magnified Malice with Countdown (1)", () => {
      setupTurn(R5, {
        hand: [FILLER, FILLER, MAGNIFIED_MALICE],
        pp: 3,
      });
      enemyFollower(2, 5);
      playCombo3(0);
      const crest = getCrests(state, "first").find((c) =>
        c.name.includes("Magnified Malice"),
      );
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(1);
    });

    it("crest Last Words at countdown 0 adds Minimized Anxiety to hand", () => {
      setupTurn(R5, {
        hand: [FILLER, FILLER, MAGNIFIED_MALICE],
        pp: 3,
      });
      enemyFollower(2, 5);
      playCombo3(0);
      const uidsBefore = handUids();
      whenEndTurn();
      whenEndTurn();
      expect(newHandCards(uidsBefore, "first", MINIMIZED_ANXIETY)).toHaveLength(
        1,
      );
      expect(crestPrinted).toContain("Minimized Anxiety");
    });
  });

  describe("Minimized Anxiety (10712310)", () => {
    const printed =
      "Restore 1 defense to your leader. Combo (3) - Gain Crest: Minimized Anxiety.";
    const crestPrinted =
      "Countdown (1) / Last Words: Add a Magnified Malice to your hand.";

    it("restores 1 defense to leader", () => {
      setupTurn(R5, { hand: [MINIMIZED_ANXIETY], pp: 1, hp: 18 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("Restore 1 defense");
    });

    it("without Combo(3): does not gain crest", () => {
      setupTurn(R5, { hand: [MINIMIZED_ANXIETY], pp: 1, hp: 18 });
      whenPlayCard("first", 0);
      expect(
        getCrests(state, "first").some((c) =>
          c.name.includes("Minimized Anxiety"),
        ),
      ).toBe(false);
    });

    it("Combo(3): gains Crest: Minimized Anxiety with Countdown (1)", () => {
      setupTurn(R5, {
        hand: [FILLER, FILLER, MINIMIZED_ANXIETY],
        pp: 3,
        hp: 18,
      });
      playCombo3(0);
      const crest = getCrests(state, "first").find((c) =>
        c.name.includes("Minimized Anxiety"),
      );
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(1);
    });

    it("crest Last Words at countdown 0 adds Magnified Malice to hand", () => {
      setupTurn(R5, {
        hand: [FILLER, FILLER, MINIMIZED_ANXIETY],
        pp: 3,
        hp: 18,
      });
      playCombo3(0);
      const uidsBefore = handUids();
      whenEndTurn();
      whenEndTurn();
      expect(newHandCards(uidsBefore, "first", MAGNIFIED_MALICE)).toHaveLength(
        1,
      );
      expect(crestPrinted).toContain("Magnified Malice");
    });
  });

  describe("Moelle, Gloomy Maiden (10811130)", () => {
    const printed =
      "Fanfare: Select a card in your hand and return it to deck. Draw a card.\nWard";

    it("Fanfare returns selected hand card to deck and draws stacked card", () => {
      setupTurn(R5, {
        hand: [MOELLE, RETURN_CARD],
        pp: 1,
        deck: [DRAW_TOP, DRAW_DEEP],
      });
      const returnCard = getHand(state, "first").find(
        (c) => c.id === RETURN_CARD,
      )!;
      whenPlayCard("first", 0);
      resolvePendingByUid(returnCard.uid);
      expect(deckIds()).toContain(RETURN_CARD);
      expect(handIds()).toContain(DRAW_DEEP);
      expect(handIds()).not.toContain(RETURN_CARD);
      expect(deckIds()).not.toContain(DRAW_DEEP);
    });

    it("has Ward on field", () => {
      setupTurn(R5, { hand: [MOELLE], pp: 1 });
      whenPlayCard("first", 0);
      const moelle = findOnBoard("first", "Moelle, Gloomy Maiden")!;
      expect(moelle.hasWard || moelle.keywordState?.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });
  });

  describe("Starry Sky (10412310)", () => {
    const printed =
      "Deal 2 damage to a random enemy follower. Combo(5) - Gain Crest: Starry Sky.";
    const crestPrinted =
      "Countdown (1) / Last Words: Deal 1 damage to the enemy leader. Add a Starry Sky to your hand.";

    it("deals 2 damage to a random enemy follower", () => {
      setupTurn(R5, { hand: [STARRY_SKY], pp: 1 });
      const foe = enemyFollower(2, 5, "Foe");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      const totalDef = Number(foe.defense) + Number(bystander.defense);
      expect(10 - totalDef).toBe(2);
      expect(getHP(state, "second")).toBe(20);
    });

    it("without Combo(5): does not gain crest", () => {
      setupTurn(R5, { hand: [STARRY_SKY], pp: 1 });
      enemyFollower(2, 5);
      whenPlayCard("first", 0);
      expect(
        getCrests(state, "first").some((c) => c.name.includes("Starry Sky")),
      ).toBe(false);
    });

    it("Combo(5): gains Crest: Starry Sky with Countdown (1)", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, FILLER, FILLER, STARRY_SKY],
        pp: 5,
      });
      enemyFollower(2, 5);
      playCombo5(0);
      const crest = getCrests(state, "first").find((c) =>
        c.name.includes("Starry Sky"),
      );
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(1);
    });

    it("crest Last Words at countdown 0 deals 1 to enemy leader and adds Starry Sky", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, FILLER, FILLER, STARRY_SKY],
        pp: 5,
      });
      enemyFollower(2, 5);
      playCombo5(0);
      state.players.second.hp = 20;
      const uidsBefore = handUids();
      whenEndTurn();
      whenEndTurn();
      expect(getHP(state, "second")).toBe(19);
      expect(newHandCards(uidsBefore, "first", STARRY_SKY)).toHaveLength(1);
      expect(crestPrinted).toContain("enemy leader");
    });
  });

  describe("Alfheimr (10413310)", () => {
    const printed =
      "Select a Mode to activate. Super Skybound Art- Activate all of them instead.\n1. Draw a card. Restore 1 defense to your leader.\n2. Give all allied followers on the field +1/+0 and Rush.\n3. Give all allied followers on the field +0/+1 and Ward.";

    it("Mode 1: draws stacked card and restores 1 leader defense", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, {
        hand: [ALFHEIMR],
        pp: 2,
        deck: [DRAW_TOP],
        hp: 18,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("Draw a card");
    });

    it("Mode 2: gives all allied followers +1/+0 and Rush", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(R6, { hand: [ALFHEIMR], pp: 2 });
      const ally = allyFollower(2, 2, "Veteran");
      whenPlayCard("first", 0);
      expect(Number(ally.attack)).toBe(3);
      expect(Number(ally.defense)).toBe(2);
      expect(ally.hasRush).toBe(true);
    });

    it("Mode 3: gives all allied followers +0/+1 and Ward", () => {
      setScriptedModePickProvider(() => [2]);
      setupTurn(R6, { hand: [ALFHEIMR], pp: 2 });
      const ally = allyFollower(2, 2, "Veteran");
      whenPlayCard("first", 0);
      expect(Number(ally.attack)).toBe(2);
      expect(Number(ally.defense)).toBe(3);
      expect(ally.hasWard || ally.keywordState?.hasWard).toBe(true);
    });

    it("below Super Skybound Art: Mode 1 alone does not buff allied followers", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, { hand: [ALFHEIMR], pp: 2, deck: [DRAW_TOP], hp: 18 });
      const ally = allyFollower(2, 2, "Veteran");
      whenPlayCard("first", 0);
      expect(Number(ally.attack)).toBe(2);
      expect(ally.hasRush).toBeFalsy();
      expect(handIds()).toContain(DRAW_TOP);
    });

    it("Super Skybound Art: activates all three modes without mode pick", () => {
      setupTurn(R10, { hand: [ALFHEIMR], pp: 2, deck: [DRAW_TOP], hp: 18 });
      const ally = allyFollower(2, 2, "Veteran");
      const spell = state.players.first.hand[0]!;
      spell.skyboundArtEvolvesWitnessed = 5;
      expect(getSkyboundArtGauge(spell, 10)).toBe(15);
      whenPlayCard("first", 0);
      expect(state.pendingModeChoice).toBeFalsy();
      expect(handIds()).toContain(DRAW_TOP);
      expect(getHP(state, "first")).toBe(19);
      expect(Number(ally.attack)).toBe(3);
      expect(Number(ally.defense)).toBe(3);
      expect(ally.hasRush).toBe(true);
      expect(ally.hasWard || ally.keywordState?.hasWard).toBe(true);
    });
  });

  describe("Comet Drive (10411310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 4 damage. If there's an evolved allied follower on the field, draw a card.";

    it("deals 4 to selected enemy; bystander untouched; draws when evolved ally present", () => {
      setupTurn(R6, { hand: [COMET_DRIVE], pp: 2, deck: [DRAW_TOP] });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      const evo = createCard(EVOLVED_ALLY, "board", "first");
      evo.hasEvolved = true;
      evo.peak_defense = evo.defense;
      state.players.first.board.push(evo);
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("draw a card");
    });

    it("without evolved allied follower: deals 4 but does not draw", () => {
      setupTurn(R6, { hand: [COMET_DRIVE], pp: 2, deck: [DRAW_TOP] });
      const target = enemyFollower(2, 6, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(deckIds()).toContain(DRAW_TOP);
    });
  });

  describe("Wild Profusion (10011210)", () => {
    const printed =
      "Fanfare: Add a Fairy to your hand.\nCountdown (2)\nWhenever an allied Pixie follower enters the field, deal 1 damage to a random enemy follower.";

    it("Fanfare adds Fairy to hand by identity", () => {
      setupTurn(R5, { hand: [WILD_PROFUSION], pp: 2 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      expect(newHandCards(uidsBefore, "first", FAIRY)).toHaveLength(1);
    });

    it("Countdown (2): amulet is destroyed after two owner turn-starts", () => {
      setupTurn(R5, { hand: [WILD_PROFUSION], pp: 2 });
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Wild Profusion")).toBeTruthy();
      whenEndTurn();
      whenEndTurn();
      expect(findOnBoard("first", "Wild Profusion")).toBeTruthy();
      whenEndTurn();
      whenEndTurn();
      expect(findOnBoard("first", "Wild Profusion")).toBeFalsy();
      expect(printed).toContain("Countdown (2)");
    });

    it("allied Pixie enter deals 1 to a random enemy follower", () => {
      setupTurn(R5, { hand: [FAIRY], pp: 1 });
      const profusion = createCard(WILD_PROFUSION, "board", "first");
      applyKeywordsFromList(profusion);
      state.players.first.board = [profusion];
      const foe = enemyFollower(2, 3, "Foe");
      const bystander = enemyFollower(2, 3, "Bystander");
      whenPlayCard("first", 0);
      const totalDef = Number(foe.defense) + Number(bystander.defense);
      expect(6 - totalDef).toBe(1);
    });
  });

  describe("Frostbow Sniper (10713110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it X damage. X is this follower's attack.\nAt the end of your turn, Combo (3) - Draw a card.";

    it("Fanfare deals damage equal to this follower's attack; bystander untouched", () => {
      setupTurn(R6, { hand: [FROSTBOW], pp: 3 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(5);
      expect(Number(bystander.defense)).toBe(8);
      expect(printed).toContain("X is this follower's attack");
    });

    it("owner's EOT Combo(3): draws stacked deck card", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, FROSTBOW],
        pp: 5,
        deck: [DRAW_TOP, DRAW_DEEP],
      });
      enemyFollower(2, 8);
      playCombo3(0);
      resolveFirstPending();
      const uidsBefore = handUids();
      whenEndTurn();
      expect(newHandCards(uidsBefore, "first", DRAW_DEEP)).toHaveLength(1);
    });

    it("owner's EOT below Combo(3): does not draw", () => {
      setupTurn(R6, {
        hand: [FROSTBOW],
        pp: 3,
        deck: [DRAW_TOP],
      });
      enemyFollower(2, 8);
      whenPlayCard("first", 0);
      resolveFirstPending();
      const handLen = thenHand("first").length;
      whenEndTurn();
      expect(thenHand("first").length).toBe(handLen);
      expect(deckIds()).toContain(DRAW_TOP);
    });

    it("opponent's EOT: does not draw even at Combo(3)", () => {
      setupTurn(R6, { pp: 5, deck: [DRAW_TOP] });
      const sniper = createCard(FROSTBOW, "board", "first");
      sniper.peak_defense = sniper.defense;
      state.players.first.board = [sniper];
      state.players.first.playsThisTurn = 3;
      state.activePlayer = "second";
      const deckBefore = [...deckIds()];
      runEndOfTurnBoundary("second");
      expect(deckIds()).toEqual(deckBefore);
    });
  });

  describe("Grace of the Swarmpetal (10513310)", () => {
    const printed = "Draw X cards. X is your Combo.";

    it("as first card played (Combo 1): draws exactly 1 stacked deck card", () => {
      setupTurn(R6, {
        hand: [GRACE],
        pp: 3,
        deck: [DRAW_TOP, DRAW_DEEP],
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_DEEP);
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(deckIds()).toEqual([DRAW_TOP]);
    });

    it("Combo 3: draws exactly 3 stacked deck cards", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, GRACE],
        pp: 5,
        deck: [DRAW_TOP, DRAW_DEEP, FILLER],
      });
      playCombo3(0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_DEEP);
      expect(handIds().filter((id) => id === FILLER).length).toBe(1);
      expect(printed).toContain("X is your Combo");
    });
  });

  describe("Quiet Encouragement (10512310)", () => {
    const printed =
      "Deal 1 damage to all enemies. Combo (3) - Deal 2 damage instead.";

    it("without Combo(3): deals 1 to all enemies", () => {
      setupTurn(R6, { hand: [QUIET_ENC], pp: 3 });
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 3, "Foe");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(19);
      expect(Number(foe.defense)).toBe(2);
    });

    it("Combo(3): deals 2 to all enemies instead", () => {
      setupTurn(R6, {
        hand: [FILLER, FILLER, QUIET_ENC],
        pp: 5,
      });
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 3, "Foe");
      playCombo3(0);
      expect(getHP(state, "second")).toBe(18);
      expect(Number(foe.defense)).toBe(1);
      expect(printed).toContain("Deal 2 damage instead");
    });
  });

  describe("Trap in the Woods (10911210)", () => {
    const printed =
      "Whenever an enemy follower enters the field, destroy it and this card.";

    it("enemy follower enter destroys it and the trap", () => {
      setupTurn(R6, {
        hand: [TRAP],
        pp: 3,
        secondHand: [FAIRY],
        secondPP: 1,
      });
      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Trap in the Woods")).toBeTruthy();
      whenEndTurn();
      whenPlayCard("second", 0);
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(findOnBoard("first", "Trap in the Woods")).toBeFalsy();
      expect(printed).toContain("destroy it and this card");
    });
  });

  describe("Gentle Treant (10011130)", () => {
    const printed =
      "Fanfare: Combo (3) - Evolve this follower.\nStrike: Restore 2 defense to your leader.";

    it("without Combo(3): does not evolve on Fanfare", () => {
      setupTurn(R5, { hand: [GENTLE_TREANT], pp: 4 });
      whenPlayCard("first", 0);
      const treant = findOnBoard("first", "Gentle Treant")!;
      expect(treant.hasEvolved).toBeFalsy();
    });

    it("Combo(3): evolves this follower on Fanfare", () => {
      setupTurn(R5, {
        hand: [FILLER, FILLER, GENTLE_TREANT],
        pp: 10,
      });
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      const treant = findOnBoard("first", "Gentle Treant")!;
      expect(treant.hasEvolved).toBe(true);
    });

    it("Strike restores 2 defense to leader", () => {
      setupTurn(R5, { hand: [GENTLE_TREANT], pp: 4, hp: 15 });
      const enemy = enemyFollower(0, 5, "Dummy");
      whenPlayCard("first", 0);
      const treant = findOnBoard("first", "Gentle Treant")!;
      treant.hasEvolved = true;
      treant.can_attack = true;
      treant.justPlayed = false;
      const atkIdx = getBoard(state, "first").indexOf(treant);
      attackFollower(atkIdx, 0, "first", "second");
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("Restore 2 defense");
    });
  });

  describe("Manamel, Super Cutest (10411120)", () => {
    const printed =
      "At the end of your turn, evolve this follower. When this follower evolves, deal 1 damage to all enemy followers.";

    it("owner's EOT: evolves and deals 1 to all enemy followers", () => {
      setupTurn(R6, { hand: [MANAMEL], pp: 4 });
      const manamel = createCard(MANAMEL, "board", "first");
      manamel.peak_defense = manamel.defense;
      manamel.justPlayed = false;
      state.players.first.board = [manamel];
      const foe = enemyFollower(2, 3, "Foe");
      whenEndTurn();
      expect(manamel.hasEvolved).toBe(true);
      expect(Number(foe.defense)).toBe(2);
    });

    it("opponent's EOT: does not evolve Manamel", () => {
      setupTurn(R6, { active: "second", secondHand: [FILLER], secondPP: 1 });
      const manamel = createCard(MANAMEL, "board", "first");
      manamel.peak_defense = manamel.defense;
      manamel.justPlayed = false;
      state.players.first.board = [manamel];
      runEndOfTurnBoundary("second");
      expect(manamel.hasEvolved).toBeFalsy();
      expect(printed).toContain("your turn");
    });
  });

  describe("Peaceful Solitude (10812310)", () => {
    const printed =
      "Select an enemy follower on the field and destroy it. Restore 2 defense to your leader.";

    it("destroys selected enemy follower and restores 2 leader defense", () => {
      setupTurn(R6, { hand: [PEACEFUL], pp: 4, hp: 16 });
      const target = enemyFollower(2, 5, "Target");
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
      expect(getHP(state, "first")).toBe(18);
    });
  });

  describe("Battledore Woodsmaiden (10511120)", () => {
    const printed =
      "Fanfare: Summon a Fairy.\nWhenever an allied Pixie follower enters the field, deal 1 damage to the enemy leader.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare summons exactly one Fairy; Pixie enter deals 1 to enemy leader", () => {
      setupTurn(R6, { hand: [BATTLEDORe], pp: 5 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(1);
      expect(getHP(state, "second")).toBe(19);
    });

    it("Evolve replicates Fanfare and summons a second Fairy", () => {
      setupTurn(R6, { hand: [BATTLEDORe], pp: 5, evo: 2 });
      whenPlayCard("first", 0);
      const maiden = findOnBoard("first", "Battledore Woodsmaiden")!;
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(1);
      onEvolve(maiden, "first", "normal", { spendPoint: true });
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(2);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Fairy Beastwhisperer (10512120)", () => {
    const printed = "Rush\nBane\nDrain";

    it("has Rush, Bane, and Drain on play", () => {
      setupTurn(R6, { hand: [FAIRY_BEAST], pp: 5 });
      whenPlayCard("first", 0);
      const beast = findOnBoard("first", "Fairy Beastwhisperer")!;
      expect(beast.hasRush).toBe(true);
      expect(beast.hasBane).toBe(true);
      expect(beast.hasDrain).toBe(true);
      expect(printed).toContain("Rush");
    });
  });

  describe("Floral Offering (10612310)", () => {
    const printed =
      "Activates in hand. Whenever an allied follower evolves, reduce the cost of this card by 1.\nDraw 2 cards.";

    it("when allied follower evolves: reduces in-hand cost by 1", () => {
      setupTurn(R7, {
        hand: [FLORAL, FILLER],
        pp: 5,
        evo: 2,
        deck: [DRAW_TOP],
      });
      const floral = getHand(state, "first").find((c) => c.id === FLORAL)!;
      expect(getEffectiveCost(floral)).toBe(5);
      const ally = allyFollower(2, 2, "EvoTarget");
      onEvolve(ally, "first", "normal", { spendPoint: true });
      expect(getEffectiveCost(floral)).toBe(4);
    });

    it("when no ally evolves: cost unchanged", () => {
      setupTurn(R7, { hand: [FLORAL], pp: 5, deck: [DRAW_TOP, DRAW_DEEP] });
      const floral = getHand(state, "first")[0]!;
      expect(getEffectiveCost(floral)).toBe(5);
    });

    it("on play draws 2 stacked deck cards", () => {
      setupTurn(R7, {
        hand: [FLORAL],
        pp: 5,
        deck: [DRAW_TOP, DRAW_DEEP],
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_DEEP);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(DRAW_DEEP);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Hawkeyed Tactician (10712120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 4 damage. Increase your Combo by 1.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare deals 4 to selected enemy and increases Combo by 1", () => {
      setupTurn(R6, { hand: [HAWKEYED], pp: 5 });
      state.players.first.playsThisTurn = 0;
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(8);
      expect(getPlaysThisTurn(state, "first")).toBe(2);
      expect(printed).toContain("Increase your Combo by 1");
    });

    it("Evolve replicates Fanfare for another 4 damage", () => {
      setupTurn(R6, { hand: [HAWKEYED], pp: 5, evo: 2 });
      const target = enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const tactician = findOnBoard("first", "Hawkeyed Tactician")!;
      onEvolve(tactician, "first", "normal", { spendPoint: true });
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(0);
    });
  });

  describe("Yuel & Societte, Dancing Duo (10414120)", () => {
    const printed =
      "Fanfare: Do this 2 times: Deal 4 damage to a random enemy follower.\nSuper-Evolve: Gain Crest: Yuel & Societte, Dancing Duo.";
    const crestPrinted =
      "Countdown (4). Once on each of your turns, when you play a follower, evolve it.";

    it("Fanfare deals 8 total damage across enemy followers (2×4)", () => {
      setupTurn(R8, { hand: [YUEL], pp: 5 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      whenPlayCard("first", 0);
      const totalDef = Number(a.defense) + Number(b.defense);
      expect(12 - totalDef).toBe(8);
    });

    it("Super-Evolve gains crest with Countdown (4)", () => {
      setupTurn(R8, { hand: [YUEL], pp: 5 });
      whenPlayCard("first", 0);
      const yuel = findOnBoard("first", "Yuel & Societte, Dancing Duo")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      onEvolve(yuel, "first", "super");
      const crest = getCrests(state, "first").find((c) =>
        c.name.includes("Yuel"),
      );
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(4);
    });

    it("crest: first follower each turn evolves without spending EP", () => {
      setupTurn(R8, { hand: [YUEL], pp: 5 });
      whenPlayCard("first", 0);
      const yuel = findOnBoard("first", "Yuel & Societte, Dancing Duo")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      onEvolve(yuel, "first", "super");
      state.players.first.hand = [
        createCard(FAIRY, "hand", "first"),
        createCard(FAIRY, "hand", "first"),
      ];
      state.players.first.pp = 10;
      const evoBefore = state.players.first.evoCharges;
      whenPlayCard("first", 0);
      const firstFairy = findOnBoard("first", "Fairy")!;
      expect(firstFairy.hasEvolved).toBe(true);
      expect(state.players.first.evoCharges).toBe(evoBefore);
      whenPlayCard("first", 0);
      const fairies = thenBoard("first").filter((c) => c.name === "Fairy");
      expect(fairies.filter((c) => c.hasEvolved).length).toBe(1);
      expect(fairies.filter((c) => !c.hasEvolved).length).toBe(1);
      expect(crestPrinted).toContain("evolve it");
    });

    it("crest: opponent playing a follower does not evolve it", () => {
      setupTurn(R8, { hand: [YUEL], pp: 5 });
      whenPlayCard("first", 0);
      const yuel = findOnBoard("first", "Yuel & Societte, Dancing Duo")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      onEvolve(yuel, "first", "super");
      whenEndTurn();
      state.players.second.hand = [createCard(FAIRY, "hand", "second")];
      state.players.second.pp = 10;
      state.activePlayer = "second";
      whenPlayCard("second", 0);
      expect(findOnBoard("second", "Fairy")!.hasEvolved).toBeFalsy();
    });
  });

  describe("Howling Wolfman (10612120)", () => {
    const printed = "Storm";

    it("has Storm on play", () => {
      setupTurn(R6, { hand: [HOWLING], pp: 6 });
      whenPlayCard("first", 0);
      const wolf = findOnBoard("first", "Howling Wolfman")!;
      expect(wolf.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Advent of the Eld Lance (10611310)", () => {
    const printed =
      "Deal 4 damage to all enemy followers. Summon 2 copies of Springbloom Fairy.";

    it("deals 4 to all enemy followers and summons exactly 2 Springbloom Fairy", () => {
      setupTurn(R8, { hand: [ADVENT], pp: 7 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(boardIds().filter((id) => id === SPRINGBLOOM)).toHaveLength(2);
      expect(printed).toContain("Springbloom Fairy");
    });
  });

  describe("Jungle Youth (10911120)", () => {
    const printed = "Intimidate";

    it("has Intimidate on play", () => {
      setupTurn(R8, { hand: [JUNGLE], pp: 7 });
      whenPlayCard("first", 0);
      const youth = findOnBoard("first", "Jungle Youth")!;
      expect(youth.hasIntimidate || youth.keywordState?.hasIntimidate).toBe(
        true,
      );
    });
  });

  describe("Kou & You, Love and Hatred (10411110)", () => {
    const printed =
      "Can attack 2 times per turn.\nStrike: Restore 3 defense to all allies.";

    it("has attacks_per_turn 2", () => {
      setupTurn(R8, { hand: [KOU_YOU], pp: 7 });
      whenPlayCard("first", 0);
      const kou = findOnBoard("first", "Kou & You, Love and Hatred")!;
      expect(kou.attacks_per_turn).toBe(2);
    });

    it("Strike restores 3 defense to all allies including leader", () => {
      setupTurn(R8, { hand: [KOU_YOU], pp: 7, hp: 15 });
      const ally = allyFollower(3, 1, "Ally");
      ally.peak_defense = 10;
      const enemy = enemyFollower(0, 5, "Dummy");
      whenPlayCard("first", 0);
      const kou = findOnBoard("first", "Kou & You, Love and Hatred")!;
      kou.justPlayed = false;
      kou.can_attack = true;
      kou.can_attack_followers = true;
      kou.attacks_left = 2;
      applyKeywordsFromList(kou);
      const atkIdx = getBoard(state, "first").indexOf(kou);
      attackFollower(atkIdx, 0, "first", "second");
      expect(getHP(state, "first")).toBe(18);
      expect(Number(ally.defense)).toBe(4);
      expect(printed).toContain("Restore 3 defense to all allies");
    });
  });

  describe("Marlone, Scales of the Past (10811110)", () => {
    const printed =
      "Fanfare: Destroy X random enemy followers. X is the number of enemy followers on the field minus the number of allied followers on the field.";

    it("destroys enemy_count minus ally_count random enemy followers", () => {
      setupTurn(R8, { hand: [MARLONE], pp: 7 });
      enemyFollower(2, 5, "E1");
      enemyFollower(2, 5, "E2");
      enemyFollower(2, 5, "E3");
      whenPlayCard("first", 0);
      const marlone = findOnBoard("first", "Marlone, Scales of the Past")!;
      const enemiesAfter = thenBoard("second").length;
      expect(enemiesAfter).toBe(1);
      expect(marlone).toBeTruthy();
      expect(3 - enemiesAfter).toBe(2);
    });
  });

  describe("Selwyn, Sonic Archer (10012120)", () => {
    const printed =
      "Storm\nSuper-Evolve: Select an enemy follower on the field and return it to hand.";

    it("has Storm on play", () => {
      setupTurn(R8, { hand: [SELWYN], pp: 7 });
      whenPlayCard("first", 0);
      const selwyn = findOnBoard("first", "Selwyn, Sonic Archer")!;
      expect(selwyn.hasStorm).toBe(true);
    });

    it("Super-Evolve returns exactly one selected enemy follower to hand", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";
      state.players.first.superEvoCharges = 2;
      const selwyn = createCard(SELWYN, "board", "first");
      applyKeywordsFromList(selwyn);
      selwyn.peak_defense = selwyn.defense;
      state.players.first.board = [selwyn];
      const a = createCard(
        { name: "EnemyA", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      a.uid = "enemy_a";
      const b = createCard(
        { name: "EnemyB", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      b.uid = "enemy_b";
      state.players.second.board = [a, b];
      onEvolve(selwyn, "first", "super");
      expect(state.pendingTargetEffect).toBeDefined();
      resolvePendingTarget("enemy_a");
      expect(getBoard(state, "second")).toHaveLength(1);
      expect(getBoard(state, "second")[0]!.uid).toBe("enemy_b");
      expect(getHand(state, "second").some((c) => c.name === "EnemyA")).toBe(
        true,
      );
      expect(printed).toContain("return it to hand");
    });
  });

  describe("Macrobear (10711110)", () => {
    const printed =
      "Fanfare: Summon an exact copy of this card.\nRush\nWard\nCan't take more than 3 damage at a time.";

    it("Fanfare summons exactly one copy; both have Rush and Ward", () => {
      setupTurn(R8, { hand: [MACROBEAR], pp: 8 });
      whenPlayCard("first", 0);
      const bears = thenBoard("first").filter((c) => c.name === "Macrobear");
      expect(bears).toHaveLength(2);
      expect(bears[0]!.hasRush).toBe(true);
      expect(bears[0]!.hasWard).toBe(true);
      expect(bears[1]!.hasRush).toBe(true);
      expect(bears[1]!.hasWard).toBe(true);
    });

    it("can't take more than 3 damage at a time", () => {
      setupTurn(R8, { hand: [MACROBEAR], pp: 8 });
      whenPlayCard("first", 0);
      const bear = findOnBoard("first", "Macrobear")!;
      expect(bear.keywordState?.maxDamageCap ?? 0).toBe(3);
      dealDamage(bear, 5);
      expect(Number(bear.defense)).toBe(3);
      dealDamage(bear, 4);
      expect(Number(bear.defense)).toBe(0);
      expect(printed).toContain("3 damage");
    });
  });
});
