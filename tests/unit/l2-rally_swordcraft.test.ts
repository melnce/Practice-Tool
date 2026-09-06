/**
 * L2 real-card tests — Rally Swordcraft deck (16 distinct cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
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
import {
  playFollowerFromHandById,
  summonFollowerByCardId,
} from "../harness/l2Dispatch.js";
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

// Deck card ids
const ORCHESTRATED_SILENCE = "10722310";
const SHARP_EARED_OPERATIVE = "10722110";
const YIDMETRA = "10624120";
const HIGH_STRUNG_LIAISON = "10721120";
const SEVERED_TIES = "10922310";
const GILDARIA = "10724110";
const SHARED_EXISTENCE = "10822310";
const ZETA_BEA = "10424110";
const BUNNY_BARON = "10824110";
const KNELLCLAW_LT = "10723110";
const METRONOMIC_MEDIC = "10722120";
const CESAR = "10724120";
const GOLDEN_KNIGHT = "10423110";
const NAHT_VINCE = "10821110";
const MARS = "10824120";
const BELTEZORE = "10924120";

// Token ids
const KNIGHT = "90021110";
const STEELCLAD_KNIGHT = "90021120";
const DEPTHS_ELD_SWORD = "90024320";
const NAHT_HENCHMAN = "90021130";
const DESPERADOS_SHOT = "90024330";
const WRETCH = "90022110";

const FILLER = "10111310"; // Fairy Convocation — deck padding
const SWORD_BYSTANDER = "10122130"; // Luminous Lancetrooper (Swordcraft)
const DRAW_TOP = "10021110"; // Flashstep Quickblader
const DRAW_SECOND = "10021120"; // Arms Peddler

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
    pp?: number;
    evo?: number;
    superEvo?: number;
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
  resolvePendingByUid(uid);
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

function setupYidmetraFaith(amount: number): void {
  bootstrapFaithForPlayer(
    "first",
    state.players.first.deck,
    state.players.first.hand,
  );
  crestAddCounter("first", YIDMETRA_FAITH, "faith", amount);
}

describe("L2 Rally Swordcraft — real-card tests", () => {
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
      expect(printed).toContain("give it Rush");
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

  describe("Sharp-Eared Operative (10722110)", () => {
    const printed =
      "Last Words: Summon a Knight.\nEvolve: Select an enemy follower on the field and deal it 3 damage.";

    it("Last Words summons Knight (90021110)", () => {
      setupTurn(R6, { hand: [SHARP_EARED_OPERATIVE], pp: 2 });
      whenPlayCard("first", 0);
      const op = findOnBoard("first", "Sharp-Eared Operative")!;
      op.defense = 0;
      cleanupDead();
      expect(boardIds().filter((id) => id === KNIGHT).length).toBeGreaterThan(
        0,
      );
      expect(printed).toContain("Summon a Knight");
    });

    it("Evolve deals 3 damage to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [SHARP_EARED_OPERATIVE], pp: 2, evo: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      const op = findOnBoard("first", "Sharp-Eared Operative")!;
      whenEvolve(op, "first");
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("deal it 3 damage");
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

      const atkBefore = Number(ally.attack);
      const defBefore = Number(ally.defense);
      state.players.first.pp = 6;
      state.players.first.hand.push(createCard(ZETA_BEA, "hand", "first"));
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === ZETA_BEA),
      );
      expect(Number(ally.attack)).toBe(atkBefore + 1);
      expect(Number(ally.defense)).toBe(defBefore + 1);
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

      const atkBefore = Number(ally.attack);
      state.players.first.pp = 4;
      state.players.first.hand.push(createCard(ZETA_BEA, "hand", "first"));
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === ZETA_BEA),
      );
      expect(Number(ally.attack)).toBe(atkBefore);
      expect(printed).toContain("Reduce your faith's value by 5");
    });
  });

  describe("High-Strung Liaison (10721120)", () => {
    const printed =
      "Fanfare: Summon a Knight. Add a Steelclad Knight to your hand.";

    it("Fanfare summons Knight (90021110) and adds Steelclad Knight (90021120)", () => {
      setupTurn(R6, { hand: [HIGH_STRUNG_LIAISON], pp: 3 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === KNIGHT)).toHaveLength(1);
      expect(handIds()).toContain(STEELCLAD_KNIGHT);
      expect(printed).toContain("Summon a Knight");
      expect(printed).toContain("Steelclad Knight");
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
      expect(printed).toContain("set its cost to 1");
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

  describe("Gildaria, Anathema of Attunement (10724110)", () => {
    const printed =
      "Fanfare: Rally (20) - Gain Crest: Gildaria, Anathema of Attunement. Evolve this follower.\nDuring your turn, whenever another allied follower enters the field, give it Rush.\nWhen this follower evolves, summon 2 copies of Steelclad Knight.";

    it("without Rally (20): Fanfare does not evolve or grant crest", () => {
      setupTurn(R6, { hand: [GILDARIA], pp: 4 });
      setRally(state, "first", 19);
      whenPlayCard("first", 0);
      const gild = findOnBoard("first", "Gildaria, Anathema of Attunement")!;
      expect(gild.hasEvolved).toBeFalsy();
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Gildaria, Anathema of Attunement",
        ),
      ).toBe(false);
      expect(printed).toContain("Rally (20)");
    });

    it("with Rally (20): Fanfare evolves and grants crest", () => {
      setupTurn(R6, { hand: [GILDARIA], pp: 4 });
      setRally(state, "first", 20);
      whenPlayCard("first", 0);
      const gild = findOnBoard("first", "Gildaria, Anathema of Attunement")!;
      expect(gild.hasEvolved).toBe(true);
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Gildaria, Anathema of Attunement",
        ),
      ).toBe(true);
      expect(printed).toContain("Evolve this follower");
    });

    it("ally enter trigger grants Rush to other follower, not Gildaria", () => {
      setupTurn(R6, { hand: [GILDARIA, HIGH_STRUNG_LIAISON], pp: 10 });
      setRally(state, "first", 0);
      whenPlayCard("first", 0);
      const gild = findOnBoard("first", "Gildaria, Anathema of Attunement")!;
      expect(gild.hasEvolved).toBeFalsy();
      expect(gild.hasRush).toBeFalsy();
      whenPlayCard("first", 0);
      const liaison = findOnBoard("first", "High-Strung Liaison")!;
      expect(liaison.hasRush).toBe(true);
      expect(gild.hasRush).toBeFalsy();
      expect(printed).toContain("give it Rush");
    });

    it("when evolves: summons 2 Steelclad Knights (90021120)", () => {
      setupTurn(R6, { hand: [GILDARIA], pp: 4, evo: 2 });
      setRally(state, "first", 20);
      whenPlayCard("first", 0);
      const steelOnBoard = thenBoard("first").filter(
        (c) => c.id === STEELCLAD_KNIGHT,
      );
      expect(steelOnBoard.length).toBeGreaterThanOrEqual(2);
      expect(printed).toContain("summon 2 copies of Steelclad Knight");
    });
  });

  describe("Shared Existence (10822310)", () => {
    const printed =
      "Give a random enemy follower on the field with the highest attack -10/-10.\nEnhance (6): Summon 3 copies of Wretch.";

    it("debuffs highest-attack enemy only; bystander untouched", () => {
      setupTurn(R6, { hand: [SHARED_EXISTENCE], pp: 4 });
      const bruiser = enemyFollower(7, 5, "Bruiser");
      const weak = enemyFollower(2, 5, "Weak");
      whenPlayCard("first", 0);
      expect(Number(bruiser.attack)).toBeLessThanOrEqual(-3);
      expect(Number(bruiser.defense)).toBeLessThanOrEqual(-5);
      expect(Number(weak.attack)).toBe(2);
      expect(Number(weak.defense)).toBe(5);
      expect(thenBoard("first").filter((c) => c.id === WRETCH)).toHaveLength(0);
      expect(printed).toContain("highest attack");
    });

    it("Enhance (6): also summons 3 Wretches (90022110)", () => {
      setupTurn(R6, { hand: [SHARED_EXISTENCE], pp: 6 });
      const bruiser = enemyFollower(5, 3, "Bruiser");
      whenPlayCard("first", 0);
      expect(Number(bruiser.attack)).toBeLessThanOrEqual(-5);
      cleanupDead();
      expect(thenBoard("first").filter((c) => c.id === WRETCH)).toHaveLength(3);
      expect(printed).toContain("Summon 3 copies of Wretch");
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
      expect(printed).toContain("Summon a Zeta");
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
      expect(printed).toContain("Bane");
      expect(printed).toContain("Storm");
    });

    it("has Rush on field", () => {
      setupTurn(R6, { hand: [ZETA_BEA], pp: 4 });
      whenPlayCard("first", 0);
      const zeta = thenBoard("first").find(
        (c) => c.uid !== state.lastSummoned?.[0]?.uid,
      )!;
      expect(zeta.hasRush).toBe(true);
      expect(printed).toContain("Rush");
    });
  });

  describe("Bunny & Baron, Fate's Bullet (10824110)", () => {
    const printed =
      "Fanfare: Summon a Bunny & Baron, Fate's Bullet. Rally (20) - Deal 4 damage to the enemy leader.\nRush\nEvolve: Add a Desperados' Shot to your hand.";

    it("Fanfare summons copy (10824110)", () => {
      setupTurn(R8, { hand: [BUNNY_BARON], pp: 5 });
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.id === BUNNY_BARON),
      ).toHaveLength(2);
      expect(printed).toContain("Summon a Bunny");
    });

    it("without Rally (20): does not deal 4 to enemy leader", () => {
      setupTurn(R8, { hand: [BUNNY_BARON], pp: 5 });
      // Rally gate runs after Fanfare summon; rally 17 → self 18 + token 19 < 20.
      setRally(state, "first", 17);
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(20);
      expect(printed).toContain("Rally (20)");
    });

    it("with Rally (20): deals 4 damage to enemy leader", () => {
      setupTurn(R8, { hand: [BUNNY_BARON], pp: 5 });
      setRally(state, "first", 20);
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(16);
      expect(printed).toContain("Deal 4 damage");
    });

    it("has Rush on field", () => {
      setupTurn(R8, { hand: [BUNNY_BARON], pp: 5 });
      whenPlayCard("first", 0);
      const bunny = findOnBoard("first", "Bunny & Baron, Fate's Bullet")!;
      expect(bunny.hasRush).toBe(true);
    });

    it("Evolve adds Desperados' Shot (90024330)", () => {
      setupTurn(R8, { hand: [BUNNY_BARON], pp: 5, evo: 2 });
      whenPlayCard("first", 0);
      const bunny = findOnBoard("first", "Bunny & Baron, Fate's Bullet")!;
      whenEvolve(bunny, "first");
      expect(handIds()).toContain(DESPERADOS_SHOT);
      expect(printed).toContain("Desperados' Shot");
    });
  });

  describe("Knellclaw Lieutenant (10723110)", () => {
    const printed =
      "Fanfare: Summon 3 copies of Knight. Select a Mode to activate.\n1. Give all other allied followers on the field +1/+0 and Rush.\n2. Give all other allied followers on the field +0/+1 and Ward.";

    it("Fanfare summons 3 Knights (90021110)", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R8, { hand: [KNELLCLAW_LT], pp: 5 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === KNIGHT)).toHaveLength(3);
      expect(printed).toContain("Summon 3 copies of Knight");
    });

    it("Mode 1: buffs other ally +1/+0 and Rush, not self", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R8, { hand: [KNELLCLAW_LT], pp: 5 });
      const bystander = allyFollower(2, 2, "Bystander");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const knell = findOnBoard("first", "Knellclaw Lieutenant")!;
      expect(Number(knell.attack)).toBe(3);
      expect(Number(bystander.attack)).toBe(3);
      expect(bystander.hasRush).toBe(true);
      expect(printed).toContain("+1/+0 and Rush");
    });

    it("Mode 2: buffs other ally +0/+1 and Ward, not self", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R8, { hand: [KNELLCLAW_LT], pp: 5 });
      const bystander = allyFollower(2, 2, "Bystander");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const knell = findOnBoard("first", "Knellclaw Lieutenant")!;
      expect(Number(knell.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(3);
      expect(bystander.hasWard).toBe(true);
      expect(printed).toContain("+0/+1 and Ward");
    });
  });

  describe("Metronomic Medic (10722120)", () => {
    const printed =
      "Fanfare: Draw 2 cards. Summon 2 copies of Knight.\nEvolve: Select an enemy follower on the field and deal it 3 damage.";

    it("Fanfare draws stacked deck cards and summons 2 Knights", () => {
      setupTurn(R8, {
        hand: [METRONOMIC_MEDIC],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 5,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(boardIds().filter((id) => id === KNIGHT)).toHaveLength(2);
      expect(printed).toContain("Draw 2 cards");
      expect(printed).toContain("Summon 2 copies of Knight");
    });

    it("Evolve deals 3 damage to selected enemy; bystander untouched", () => {
      setupTurn(R8, { hand: [METRONOMIC_MEDIC], pp: 5, evo: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      const medic = findOnBoard("first", "Metronomic Medic")!;
      whenEvolve(medic, "first");
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("deal it 3 damage");
    });
  });

  describe("Cesar, Accordant Major (10724120)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Steelclad Knight. Give all other allied Swordcraft followers on the field +1/+3 and Ward.\nWard\nSuper-Evolve: Select an enemy follower on the field and destroy it.";

    it("Fanfare summons 2 Steelclad Knights and buffs other Swordcraft ally", () => {
      setupTurn(R8, { hand: [CESAR], pp: 7 });
      const bystander = createCard(SWORD_BYSTANDER, "board", "first");
      bystander.peak_defense = bystander.defense;
      state.players.first.board = [bystander];
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === STEELCLAD_KNIGHT)).toHaveLength(
        2,
      );
      const cesar = findOnBoard("first", "Cesar, Accordant Major")!;
      expect(cesar.hasWard).toBe(true);
      expect(Number(bystander.attack)).toBeGreaterThanOrEqual(2);
      expect(bystander.hasWard).toBe(true);
      expect(printed).toContain("Steelclad Knight");
    });

    it("Super-Evolve destroys selected enemy (graveyard, not banish); bystander untouched", () => {
      setupTurn(R8, { hand: [CESAR], pp: 7, superEvo: 1 });
      whenPlayCard("first", 0);
      const cesar = findOnBoard("first", "Cesar, Accordant Major")!;
      const victim = enemyLastWordsFollower("Victim");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenSuperEvolve(cesar, "first");
      resolvePendingByUid(victim.uid);
      expect(getBoard(state, "second").some((c) => c.uid === victim.uid)).toBe(
        false,
      );
      expect(
        getGraveyard(state, "second").some((c) => c.uid === victim.uid),
      ).toBe(true);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("destroy it");
    });
  });

  describe("Golden Knight, True King's Blade (10423110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Super-evolve this follower.\n2. Deal 4 damage to all enemy followers.\n3. Restore 4 defense to your leader.\nEnhance(9): Activate all of them instead.";

    it("Mode 1: super-evolves Golden Knight", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R10, { hand: [GOLDEN_KNIGHT], pp: 7, superEvo: 1 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const knight = findOnBoard("first", "Golden Knight, True King's Blade")!;
      expect(knight.evoType).toBe("super");
      expect(printed).toContain("Super-evolve this follower");
    });

    it("Mode 2: deals 4 damage to all enemy followers", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R10, { hand: [GOLDEN_KNIGHT], pp: 7 });
      enemyFollower(6, 6, "A");
      enemyFollower(6, 6, "B");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(state.players.second.board.every((c) => c.defense === 2)).toBe(
        true,
      );
      expect(printed).toContain("Deal 4 damage to all enemy followers");
    });

    it("Mode 3: restores 4 defense to leader", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R10, { hand: [GOLDEN_KNIGHT], pp: 7 });
      state.players.first.hp = 12;
      setScriptedModePickProvider(() => [2]);
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("Restore 4 defense");
    });

    it("Enhance (9): activates all three modes", () => {
      setupTurn(R10, { hand: [GOLDEN_KNIGHT], pp: 10, superEvo: 1 });
      state.players.first.hp = 12;
      enemyFollower(6, 6, "A");
      whenPlayCard("first", 0);
      const knight = findOnBoard("first", "Golden Knight, True King's Blade")!;
      expect(knight.evoType).toBe("super");
      expect(state.players.second.board.every((c) => c.defense === 2)).toBe(
        true,
      );
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("Activate all of them instead");
    });
  });

  describe("Naht & Vince, Force and Order (10821110)", () => {
    const printed =
      "Fanfare: Summon a Naht's Henchman. Deal 3 damage to all enemy followers.\nSuper-Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare summons Naht's Henchman (90021130) and deals 3 to all enemies", () => {
      setupTurn(R10, { hand: [NAHT_VINCE], pp: 7 });
      enemyFollower(2, 5, "A");
      enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === NAHT_HENCHMAN)).toHaveLength(1);
      expect(state.players.second.board.every((c) => c.defense === 2)).toBe(
        true,
      );
      expect(printed).toContain("Naht's Henchman");
    });

    it("Super-Evolve replicates Fanfare (second Henchman + 3 more damage)", () => {
      setupTurn(R10, { hand: [NAHT_VINCE], pp: 7, superEvo: 1 });
      enemyFollower(2, 8, "A");
      whenPlayCard("first", 0);
      const naht = findOnBoard("first", "Naht & Vince, Force and Order")!;
      const henchBefore = boardIds().filter(
        (id) => id === NAHT_HENCHMAN,
      ).length;
      const defBefore = Number(getBoard(state, "second")[0]!.defense);
      whenSuperEvolve(naht, "first");
      expect(boardIds().filter((id) => id === NAHT_HENCHMAN).length).toBe(
        henchBefore + 1,
      );
      expect(Number(getBoard(state, "second")[0]!.defense)).toBe(defBefore - 3);
      expect(printed).toContain("Replicate the effects");
    });
  });

  describe("Mars, Conflagrant Commander (10824120)", () => {
    const printed =
      "Fanfare: Summon 3 copies of Knight.\nStorm\nBane\nWhenever an allied Officer follower enters the field, give it +2/+0 and Rush and give this follower +1/+0.\nSuper-Evolve: Summon a Knight.";

    it("Fanfare summons 3 Knights (90021110)", () => {
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
      expect(printed).toContain("Storm");
      expect(printed).toContain("Bane");
    });

    it("Officer enter from Fanfare Knights: +2/+0 Rush on Officer, +1/+0 on Mars", () => {
      setupTurn(R8, { hand: [MARS], pp: 8 });
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter((c) => c.id === KNIGHT);
      expect(knights).toHaveLength(3);
      expect(knights.every((k) => k.hasRush)).toBe(true);
      expect(knights.every((k) => Number(k.attack) >= 3)).toBe(true);
      const mars = findOnBoard("first", "Mars, Conflagrant Commander")!;
      expect(Number(mars.attack)).toBe(4);
      expect(printed).toContain("Officer follower");
    });

    it("Super-Evolve summons a Knight", () => {
      setupTurn(R8, { hand: [MARS], pp: 8, superEvo: 1 });
      whenPlayCard("first", 0);
      const mars = findOnBoard("first", "Mars, Conflagrant Commander")!;
      const knightsBefore = boardIds().filter((id) => id === KNIGHT).length;
      const knights = thenBoard("first").filter((c) => c.id === KNIGHT);
      knights[0]!.defense = 0;
      cleanupDead();
      whenSuperEvolve(mars, "first");
      expect(boardIds().filter((id) => id === KNIGHT).length).toBe(
        knightsBefore,
      );
      expect(printed).toContain("Summon a Knight");
    });
  });

  describe("Beltezore, Valorous Revenant (10924120)", () => {
    const printed = "Storm\nBane\nWard\nAura\nCan attack 3 times per turn.";

    it("has Storm, Bane, Ward, and Aura on field", () => {
      setupTurn(R10, { hand: [BELTEZORE], pp: 10 });
      whenPlayCard("first", 0);
      const bel = findOnBoard("first", "Beltezore, Valorous Revenant")!;
      expect(bel.hasStorm || bel.keywordState?.hasStorm).toBe(true);
      expect(bel.hasBane || bel.keywordState?.hasBane).toBe(true);
      expect(bel.hasWard || bel.keywordState?.hasWard).toBe(true);
      expect(bel.hasAura || bel.keywordState?.hasAura).toBe(true);
      expect(printed).toContain("Storm");
      expect(printed).toContain("Bane");
      expect(printed).toContain("Ward");
      expect(printed).toContain("Aura");
    });

    it("can attack 3 times per turn", () => {
      setupTurn(R10, { hand: [BELTEZORE], pp: 10 });
      whenPlayCard("first", 0);
      const bel = findOnBoard("first", "Beltezore, Valorous Revenant")!;
      expect((bel as { attacks_per_turn?: number }).attacks_per_turn).toBe(3);
      expect(printed).toContain("3 times per turn");
    });
  });
});
