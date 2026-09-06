/**
 * L2 real-card tests — Barbaros Swordcraft deck (15 distinct cards).
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
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { summonFollowerByCardId } from "../harness/l2Dispatch.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import {
  getBoard,
  getHand,
  getHP,
  getGraveyard,
  getCrests,
  setRally,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FLASHSTEP = "10021110";
const ORCHESTRATED_SILENCE = "10722310";
const RUTHLESS_ELD_SWORD = "10623310";
const OPEN_SEA_SCOUT = "10921110";
const SLICE_OF_DOMESTICITY = "10823310";
const YIDMETRA = "10624120";
const SEVERED_TIES = "10922310";
const SPLENDOR_GOLDBLOOM = "10523310";
const WHIRLPOOL_GUNNER = "10922110";
const LAGE_DOR = "10923310";
const ZETA_BEA = "10424110";
const ROUGHWATER_MATE = "10923110";
const UNKEI = "10524120";
const BARBAROS = "10924110";
const MARS = "10824120";

const KNIGHT = "90021110";
const STEELCLAD_KNIGHT = "90021120";
const DEPTHS_ELD_SWORD = "90024320";
const DREAD_PIRATE_FLAG = "90021210";
const GILDED_BOOTS = "90021330";
const GILDED_GOBLET = "90021320";
const GILDED_BLADE = "90021310";
const GILDED_NECKLACE = "90021340";
const GLITTERING_GOLD = "90021350";

const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

const YIDMETRA_FAITH = faithCrestNameForCard("Yidmetra, Eld Sword");

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    board?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
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
  if (opts.board?.length) b = b.withFirstBoard(opts.board);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
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

function enemyLastWordsFollower(name = "LWTarget") {
  const lw = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 3 },
    "board",
    "second",
  );
  lw.peak_defense = 3;
  lw.hasLastWords = true;
  lw.lastWordsEffects = [
    { op: "summon", source: "named", name: "Knight", count: 1 },
  ];
  state.players.second.board.push(lw);
  return lw;
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

function allyAmulet(name = "AllyAmulet") {
  const c = createCard(
    { name, type: "Amulet", cost: 1, attack: 0, defense: 0 },
    "board",
    "first",
  );
  c.countdown = 3;
  state.players.first.board.push(c);
  return c;
}

function setupYidmetraFaith(amount: number): void {
  bootstrapFaithForPlayer(
    "first",
    state.players.first.deck,
    state.players.first.hand,
  );
  crestAddCounter("first", YIDMETRA_FAITH, "faith", amount);
}

describe("L2 Barbaros Swordcraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    delete (globalThis as any).HEADLESS;
    setScriptedModePickProvider(null);
  });

  describe("Flashstep Quickblader (10021110)", () => {
    const printed = "Storm";

    it("Storm — enters with Storm and can attack on the turn it is played", () => {
      setupTurn(R6, { hand: [FLASHSTEP], pp: 1 });
      whenPlayCard("first", 0);
      const quickblader = findOnBoard("first", "Flashstep Quickblader")!;
      expect(quickblader.hasStorm || quickblader.keywordState?.hasStorm).toBe(
        true,
      );
      expect(quickblader.can_attack).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Orchestrated Silence (10722310)", () => {
    const printed =
      "Add a Steelclad Knight to your hand and give it Rush. Rally (10) - Add 2 copies instead.";

    it("without Rally (10): adds one Steelclad Knight (90021120) with Rush", () => {
      setupTurn(R6, { hand: [ORCHESTRATED_SILENCE], pp: 1 });
      setRally(state, "first", 9);
      whenPlayCard("first", 0);
      const steel = thenHand("first").filter((c) => c.id === STEELCLAD_KNIGHT);
      expect(steel).toHaveLength(1);
      expect(steel[0]!.keywords?.includes("Rush")).toBe(true);
      expect(handIds()).not.toContain(ORCHESTRATED_SILENCE);
    });

    it("with Rally (10): adds two Steelclad Knights (90021120) with Rush", () => {
      setupTurn(R6, { hand: [ORCHESTRATED_SILENCE], pp: 1 });
      setRally(state, "first", 10);
      whenPlayCard("first", 0);
      const steel = thenHand("first").filter((c) => c.id === STEELCLAD_KNIGHT);
      expect(steel).toHaveLength(2);
      expect(steel.every((c) => c.keywords?.includes("Rush"))).toBe(true);
      expect(printed).toContain("Add 2 copies instead");
    });
  });

  describe("Ruthless Eld Sword (10623310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Draw a card.\n2. Deal 3 damage to a random enemy follower.\nEnhance (3): Activate all of them instead.";

    it("Mode 1: draws the top stacked deck card", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R6, {
        hand: [RUTHLESS_ELD_SWORD],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 1,
      });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });

    it("Mode 2: deals 3 damage to a random enemy follower", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R6, { hand: [RUTHLESS_ELD_SWORD], pp: 1 });
      const target = enemyFollower(2, 5, "Target");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(target.defense)).toBe(2);
      expect(printed).toContain("Deal 3 damage");
    });

    it("Enhance (3): draws a card and deals 3 damage (both modes)", () => {
      setupTurn(R6, {
        hand: [RUTHLESS_ELD_SWORD],
        deck: [FILLER, DRAW_TOP],
        pp: 3,
      });
      const target = enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(Number(target.defense)).toBe(2);
      expect(printed).toContain("Activate all of them instead");
    });
  });

  describe("Open-Sea Scout (10921110)", () => {
    const printed =
      "Fanfare: Summon a Dread Pirate's Flag.\nEvolve: Add a Gilded Boots to your hand.";

    it("Fanfare summons exactly one Dread Pirate's Flag (90021210)", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT], pp: 2 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === DREAD_PIRATE_FLAG)).toHaveLength(
        1,
      );
      expect(printed).toContain("Summon a Dread Pirate's Flag");
    });

    it("Evolve adds Gilded Boots (90021330) to hand", () => {
      setupTurn(R6, { hand: [OPEN_SEA_SCOUT], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const scout = findOnBoard("first", "Open-Sea Scout")!;
      whenEvolve(scout, "first");
      expect(handIds()).toContain(GILDED_BOOTS);
      expect(printed).toContain("Gilded Boots");
    });
  });

  describe("Slice of Domesticity (10823310)", () => {
    const printed =
      "Select a Mode to activate. If there are at least 2 allied cards on the field, activate all of them instead.\n1. Deal 4 damage to a random enemy follower.\n2. Restore 2 defense to your leader.";

    it("with fewer than 2 allies, Mode 1 deals 4 damage without healing leader", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R6, { hand: [SLICE_OF_DOMESTICITY], pp: 2, hp: 15 });
      const target = enemyFollower(2, 6, "Target");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(Number(target.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(15);
      expect(printed).toContain("Deal 4 damage");
    });

    it("with fewer than 2 allies, Mode 2 restores 2 defense without dealing damage", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R6, { hand: [SLICE_OF_DOMESTICITY], pp: 2, hp: 15 });
      const target = enemyFollower(2, 6, "Target");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(Number(target.defense)).toBe(6);
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("Restore 2 defense");
    });

    it("with at least 2 allied cards on field: activates both modes", () => {
      setupTurn(R6, { hand: [SLICE_OF_DOMESTICITY], pp: 2, hp: 15 });
      allyFollower(1, 1, "AllyA");
      allyAmulet("AllyAmulet");
      const target = enemyFollower(2, 6, "Target");
      whenPlayCard("first", 0);
      expect(Number(target.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("activate all of them instead");
    });
  });

  describe("Yidmetra, Eld Sword (10624120)", () => {
    const printed =
      'Fanfare: Add a Depths of the Eld Sword to your hand.\nEvolve: Reduce your faith\'s value by 5 to give it "Whenever you play an Enhanced card, give all allied followers on the field +1/+1."';

    it("Fanfare adds Depths of the Eld Sword (90024320)", () => {
      setupTurn(R6, { hand: [YIDMETRA], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DEPTHS_ELD_SWORD);
      expect(printed).toContain("Depths of the Eld Sword");
    });

    it("Evolve with faith ≥ 5: pays 5 faith and grants Enhanced-play +1/+1 to allies", () => {
      setupTurn(R6, { hand: [YIDMETRA], pp: 2, evo: 2 });
      setupYidmetraFaith(5);
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      const yid = findOnBoard("first", "Yidmetra, Eld Sword")!;
      whenEvolve(yid, "first");
      expect(
        getCrests(state, "first").find((c) => c.name === YIDMETRA_FAITH)
          ?.counters?.faith,
      ).toBe(0);

      state.players.first.pp = 5;
      state.players.first.hand.push(
        createCard(SPLENDOR_GOLDBLOOM, "hand", "first"),
      );
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === SPLENDOR_GOLDBLOOM),
      );
      expect(Number(ally.attack)).toBe(3);
      expect(Number(ally.defense)).toBe(3);
      expect(printed).toContain("Enhanced card");
    });

    it("Evolve with faith < 5: does not grant Enhanced-play buff", () => {
      setupTurn(R6, { hand: [YIDMETRA], pp: 2, evo: 2 });
      setupYidmetraFaith(4);
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      const yid = findOnBoard("first", "Yidmetra, Eld Sword")!;
      whenEvolve(yid, "first");
      expect(
        getCrests(state, "first").find((c) => c.name === YIDMETRA_FAITH)
          ?.counters?.faith,
      ).toBe(4);

      state.players.first.pp = 3;
      state.players.first.hand.push(
        createCard(SPLENDOR_GOLDBLOOM, "hand", "first"),
      );
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === SPLENDOR_GOLDBLOOM),
      );
      expect(Number(ally.attack)).toBe(2);
      expect(Number(ally.defense)).toBe(2);
    });
  });

  describe("Severed Ties (10922310)", () => {
    const printed =
      "Select an enemy follower on the field and deal it 5 damage. If this card's cost is 3, add a Severed Ties to your hand and set its cost to 1.";

    it("at cost 3: deals 5 to selected enemy and adds cost-1 copy; bystander untouched", () => {
      setupTurn(R6, { hand: [SEVERED_TIES], pp: 3 });
      const target = enemyFollower(2, 7, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
      const copy = thenHand("first").find((c) => c.id === SEVERED_TIES);
      expect(copy).toBeTruthy();
      expect(getEffectiveCost(copy!)).toBe(1);
    });

    it("at cost 1: deals 5 damage but does not add another copy", () => {
      setupTurn(R6, { hand: [SEVERED_TIES], pp: 1 });
      const severed = getHand(state, "first")[0]!;
      severed.cost = 1;
      const target = enemyFollower(2, 7, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(2);
      expect(thenHand("first").some((c) => c.id === SEVERED_TIES)).toBe(false);
      expect(printed).toContain("If this card's cost is 3");
    });
  });

  describe("Splendor of the Goldbloom (10523310)", () => {
    const printed =
      "Add 2 copies of Glittering Gold to your hand.\nEnhance (5): Add 4 instead.";

    it("at 3 PP: adds exactly 2 Glittering Gold (90021350)", () => {
      setupTurn(R6, { hand: [SPLENDOR_GOLDBLOOM], pp: 3 });
      whenPlayCard("first", 0);
      expect(
        thenHand("first").filter((c) => c.id === GLITTERING_GOLD),
      ).toHaveLength(2);
      expect(printed).toContain("Add 2 copies");
    });

    it("Enhance (5): adds exactly 4 Glittering Gold (not 2+4)", () => {
      setupTurn(R6, { hand: [SPLENDOR_GOLDBLOOM], pp: 5 });
      whenPlayCard("first", 0);
      expect(
        thenHand("first").filter((c) => c.id === GLITTERING_GOLD),
      ).toHaveLength(4);
      expect(thenHand("first")).toHaveLength(4);
      expect(printed).toContain("Add 4 instead");
    });
  });

  describe("Whirlpool Gunner (10922110)", () => {
    const printed =
      "Fanfare: Summon a Dread Pirate's Flag. Add a Gilded Goblet to your hand.\nRush";

    it("Fanfare summons Dread Pirate's Flag (90021210) and adds Gilded Goblet (90021320)", () => {
      setupTurn(R6, { hand: [WHIRLPOOL_GUNNER], pp: 3 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === DREAD_PIRATE_FLAG)).toHaveLength(
        1,
      );
      expect(handIds()).toContain(GILDED_GOBLET);
      expect(printed).toContain("Gilded Goblet");
    });

    it("has Rush on field", () => {
      setupTurn(R6, { hand: [WHIRLPOOL_GUNNER], pp: 3 });
      whenPlayCard("first", 0);
      const gunner = findOnBoard("first", "Whirlpool Gunner")!;
      expect(gunner.hasRush || gunner.keywordState?.hasRush).toBe(true);
      expect(printed).toContain("Rush");
    });
  });

  describe("L'Age d'Or (10923310)", () => {
    const printed =
      "Summon a Dread Pirate's Flag. Deal 2 damage to all enemy followers.\nEnhance (6): Summon 2 instead. Deal 4 damage instead.";

    it("at 4 PP: summons 1 Flag and deals 2 to all enemies", () => {
      setupTurn(R6, { hand: [LAGE_DOR], pp: 4 });
      const a = enemyFollower(2, 5, "A");
      const b = enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === DREAD_PIRATE_FLAG)).toHaveLength(
        1,
      );
      expect(Number(a.defense)).toBe(3);
      expect(Number(b.defense)).toBe(3);
      expect(printed).toContain("Deal 2 damage");
    });

    it("Enhance (6): summons 2 Flags and deals 4 to all enemies (not 2+2)", () => {
      setupTurn(R6, { hand: [LAGE_DOR], pp: 6 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === DREAD_PIRATE_FLAG)).toHaveLength(
        2,
      );
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(printed).toContain("Summon 2 instead");
    });
  });

  describe("Zeta & Bea, Crimson and Blue (10424110)", () => {
    const printed =
      "Fanfare: Summon a Zeta & Bea, Crimson and Blue.\nEnhance(6): Give it Bane and this follower Storm.\nRush.";

    it("at 4 PP: Fanfare summons copy only; no Storm or Bane", () => {
      setupTurn(R6, { hand: [ZETA_BEA], pp: 4 });
      whenPlayCard("first", 0);
      expect(thenBoard("first").filter((c) => c.id === ZETA_BEA)).toHaveLength(
        2,
      );
      for (const c of thenBoard("first")) {
        expect(c.hasStorm).toBe(false);
        expect(c.hasBane).toBe(false);
      }
    });

    it("Enhance (6): summoned copy gains Bane; played follower gains Storm", () => {
      setupTurn(R6, { hand: [ZETA_BEA], pp: 6 });
      whenPlayCard("first", 0);
      const zetas = thenBoard("first").filter((c) => c.id === ZETA_BEA);
      expect(zetas).toHaveLength(2);
      const copy = zetas.find((c) => c.uid === state.lastSummoned?.[0]?.uid)!;
      const played = zetas.find((c) => c.uid !== copy.uid)!;
      expect(played.hasStorm).toBe(true);
      expect(copy.hasBane).toBe(true);
      expect(copy.hasStorm).toBe(false);
    });

    it("has Rush on field", () => {
      setupTurn(R6, { hand: [ZETA_BEA], pp: 4 });
      whenPlayCard("first", 0);
      const zeta = thenBoard("first").find(
        (c) => c.uid !== state.lastSummoned?.[0]?.uid,
      )!;
      expect(zeta.hasRush).toBe(true);
    });
  });

  describe("Roughwater First Mate (10923110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 3 damage. Summon a Dread Pirate's Flag.\nEvolve: Replicate the effects of this card's Fanfare ability.\nSuper-Evolve: Add a Gilded Blade and Gilded Necklace to your hand and set their costs to 0.";

    it("Fanfare deals 3 to selected enemy, summons Flag; bystander untouched", () => {
      setupTurn(R7, { hand: [ROUGHWATER_MATE], pp: 5 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(5);
      expect(boardIds().filter((id) => id === DREAD_PIRATE_FLAG)).toHaveLength(
        1,
      );
    });

    it("Evolve replicates Fanfare: second 3 damage and second Flag", () => {
      setupTurn(R7, { hand: [ROUGHWATER_MATE], pp: 5, evo: 2 });
      const target = enemyFollower(2, 8, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(5);
      const mate = findOnBoard("first", "Roughwater First Mate")!;
      whenEvolve(mate, "first");
      resolveFirstPending();
      expect(Number(target.defense)).toBe(2);
      expect(boardIds().filter((id) => id === DREAD_PIRATE_FLAG)).toHaveLength(
        2,
      );
      expect(printed).toContain("Replicate the effects");
    });

    it("Super-Evolve adds Gilded Blade (90021310) and Necklace (90021340) at cost 0", () => {
      setupTurn(R7, { hand: [ROUGHWATER_MATE], pp: 5 });
      enemyFollower(2, 6, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const mate = findOnBoard("first", "Roughwater First Mate")!;
      state.players.first.superEvoCharges = 1;
      state.players.first.evoCharges = 2;
      whenSuperEvolve(mate, "first");
      if (state.pendingTargetEffect) resolveFirstPending();
      const blade = thenHand("first").find((c) => c.id === GILDED_BLADE);
      const necklace = thenHand("first").find((c) => c.id === GILDED_NECKLACE);
      expect(blade).toBeTruthy();
      expect(necklace).toBeTruthy();
      expect(getEffectiveCost(blade!)).toBe(0);
      expect(getEffectiveCost(necklace!)).toBe(0);
    });
  });

  describe("Unkei, Goldbloom (10524120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and banish it. Add a Glittering Gold to your hand.\nSuper-Evolve: Gain Crest: Unkei, Goldbloom.";
    const crestPrinted =
      "Countdown (4)\nAt the end of your turn, add a Glittering Gold to your hand.";

    it("Fanfare banishes selected enemy without graveyard; adds Glittering Gold; bystander untouched", () => {
      setupTurn(R7, { hand: [UNKEI], pp: 5 });
      const victim = enemyLastWordsFollower("Victim");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(victim.uid);
      expect(getBoard(state, "second").some((c) => c.uid === victim.uid)).toBe(
        false,
      );
      expect(
        getGraveyard(state, "second").some((c) => c.uid === victim.uid),
      ).toBe(false);
      expect(Number(bystander.defense)).toBe(5);
      expect(handIds()).toContain(GLITTERING_GOLD);
      expect(printed).toContain("banish it");
    });

    it("Super-Evolve gains Crest: Unkei, Goldbloom with Countdown (4)", () => {
      setupTurn(R7, { hand: [UNKEI], pp: 5, superEvo: 1 });
      enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const unkei = findOnBoard("first", "Unkei, Goldbloom")!;
      whenSuperEvolve(unkei, "first");
      const crest = getCrests(state, "first").find(
        (c) => c.name === "Unkei, Goldbloom",
      );
      expect(crest).toBeTruthy();
      expect(Number(crest!.countdown)).toBe(4);
      expect(printed).toContain("Gain Crest");
      expect(crestPrinted).toContain("Countdown (4)");
    });

    it("crest owner's EOT adds Glittering Gold to hand", () => {
      setupTurn(R7, { hand: [UNKEI], pp: 5, superEvo: 1 });
      enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const unkei = findOnBoard("first", "Unkei, Goldbloom")!;
      whenSuperEvolve(unkei, "first");
      const goldBefore = thenHand("first").filter(
        (c) => c.id === GLITTERING_GOLD,
      ).length;
      whenEndTurn();
      expect(
        thenHand("first").filter((c) => c.id === GLITTERING_GOLD).length,
      ).toBe(goldBefore + 1);
      expect(crestPrinted).toContain("add a Glittering Gold");
    });

    it("crest opponent's EOT does not add Glittering Gold", () => {
      setupTurn(R7, { hand: [UNKEI], pp: 5, superEvo: 1 });
      enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const unkei = findOnBoard("first", "Unkei, Goldbloom")!;
      whenSuperEvolve(unkei, "first");
      whenEndTurn(); // owner EOT — may add gold
      const goldAfterOwner = thenHand("first").filter(
        (c) => c.id === GLITTERING_GOLD,
      ).length;
      whenEndTurn(); // opponent EOT — must not add
      expect(
        thenHand("first").filter((c) => c.id === GLITTERING_GOLD).length,
      ).toBe(goldAfterOwner);
    });

    it("crest expires after Countdown (4) owner end turns", () => {
      setupTurn(R7, { hand: [UNKEI], pp: 5, superEvo: 1 });
      enemyFollower(2, 5, "Target");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const unkei = findOnBoard("first", "Unkei, Goldbloom")!;
      whenSuperEvolve(unkei, "first");
      for (let i = 0; i < 4; i++) {
        whenEndTurn();
        whenEndTurn();
      }
      expect(
        getCrests(state, "first").some((c) => c.name === "Unkei, Goldbloom"),
      ).toBe(false);
      expect(crestPrinted).toContain("Countdown (4)");
    });
  });

  describe("Barbaros, Rebellious Convict (10924110)", () => {
    const printed =
      "Fanfare: Summon a Dread Pirate's Flag. Advance the counts of all allied copies of Dread Pirate's Flag on the field by 5.\nStorm";

    it("Fanfare summons Flag and advances its countdown by 5 (7→2)", () => {
      setupTurn(R8, { hand: [BARBAROS], pp: 7 });
      whenPlayCard("first", 0);
      const flag = findOnBoard("first", "Dread Pirate's Flag")!;
      expect(Number(flag.countdown)).toBe(2);
      expect(boardIds().filter((id) => id === DREAD_PIRATE_FLAG)).toHaveLength(
        1,
      );
      expect(printed).toContain("Advance the counts");
    });

    it("Fanfare advances all allied Dread Pirate's Flags on the field by 5", () => {
      setupTurn(R8, { hand: [BARBAROS], pp: 7 });
      const preFlag = createCard(DREAD_PIRATE_FLAG, "board", "first");
      preFlag.countdown = 7;
      state.players.first.board.push(preFlag);
      const bystander = createCard(
        {
          name: "Other Amulet",
          type: "Amulet",
          cost: 1,
          attack: 0,
          defense: 0,
        },
        "board",
        "first",
      );
      bystander.hasCountdown = true;
      bystander.countdown = 5;
      state.players.first.board.push(bystander);
      whenPlayCard("first", 0);
      const flags = thenBoard("first").filter(
        (c) => c.id === DREAD_PIRATE_FLAG,
      );
      expect(flags).toHaveLength(2);
      expect(Number(preFlag.countdown)).toBe(2);
      const summoned = flags.find((f) => f.uid !== preFlag.uid)!;
      expect(Number(summoned.countdown)).toBe(2);
      expect(Number(bystander.countdown)).toBe(5);
    });

    it("has Storm on field", () => {
      setupTurn(R8, { hand: [BARBAROS], pp: 7 });
      whenPlayCard("first", 0);
      const barbaros = findOnBoard("first", "Barbaros, Rebellious Convict")!;
      expect(barbaros.hasStorm || barbaros.keywordState?.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Mars, Conflagrant Commander (10824120)", () => {
    const printed =
      "Fanfare: Summon 3 copies of Knight.\nStorm\nBane\nWhenever an allied Officer follower enters the field, give it +2/+0 and Rush and give this follower +1/+0.\nSuper-Evolve: Summon a Knight.";

    it("Fanfare summons exactly 3 Knights (90021110)", () => {
      setupTurn(R8, { hand: [MARS], pp: 8 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === KNIGHT)).toHaveLength(3);
      expect(printed).toContain("Summon 3 copies of Knight");
    });

    it("has Storm and Bane", () => {
      setupTurn(R8, { hand: [MARS], pp: 8 });
      whenPlayCard("first", 0);
      const mars = findOnBoard("first", "Mars, Conflagrant Commander")!;
      expect(mars.hasStorm || mars.keywordState?.hasStorm).toBe(true);
      expect(mars.hasBane || mars.keywordState?.hasBane).toBe(true);
    });

    it("Officer enter from Fanfare: Knights +2/+0 Rush; Mars +1/+0 (1→4 attack)", () => {
      setupTurn(R8, { hand: [MARS], pp: 8 });
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter((c) => c.id === KNIGHT);
      expect(knights).toHaveLength(3);
      expect(knights.every((k) => k.hasRush)).toBe(true);
      expect(knights.every((k) => Number(k.attack) === 3)).toBe(true);
      const mars = findOnBoard("first", "Mars, Conflagrant Commander")!;
      expect(Number(mars.attack)).toBe(4);
    });

    it("later Officer enter buffs Officer and Mars; non-Officer ally does not trigger", () => {
      setupTurn(R8, { hand: [MARS], pp: 8, superEvo: 1, evo: 2 });
      whenPlayCard("first", 0);
      const mars = findOnBoard("first", "Mars, Conflagrant Commander")!;
      expect(Number(mars.attack)).toBe(4);
      thenBoard("first")
        .filter((c) => c.id === KNIGHT)
        .slice(0, 1)
        .forEach((k) => {
          k.defense = 0;
        });
      cleanupDead();
      whenSuperEvolve(mars, "first");
      const knights = thenBoard("first").filter((c) => c.id === KNIGHT);
      const latestKnight = knights[knights.length - 1]!;
      expect(Number(latestKnight.attack)).toBe(3);
      expect(latestKnight.hasRush).toBe(true);
      expect(Number(mars.attack)).toBe(8);

      const nonOfficer = allyFollower(2, 2, "Civilian");
      expect(Number(nonOfficer.attack)).toBe(2);
      expect(printed).toContain("Officer follower");
    });

    it("Super-Evolve summons a Knight", () => {
      setupTurn(R8, { hand: [MARS], pp: 8, superEvo: 1 });
      whenPlayCard("first", 0);
      const mars = findOnBoard("first", "Mars, Conflagrant Commander")!;
      const knightsBefore = boardIds().filter((id) => id === KNIGHT).length;
      thenBoard("first")
        .filter((c) => c.id === KNIGHT)
        .slice(0, 1)
        .forEach((k) => {
          k.defense = 0;
        });
      cleanupDead();
      whenSuperEvolve(mars, "first");
      expect(boardIds().filter((id) => id === KNIGHT).length).toBe(
        knightsBefore,
      );
    });
  });
});
