/**
 * L2 real-card tests — Runecraft tokens (16 tokens).
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
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import {
  faithCrestNameForCard,
  bootstrapFaithForPlayer,
} from "../../src/logic/faith/bootstrap.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
} from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

// Tokens under test
const GUARDIAN_GOLEM = "90031120";
const DELTA_CANNON = "90034340";
const MYSTERIAN_MISSILE = "90031310";
const SEND_EM_PACKING = "90034350";
const ANNES_SUMMONING = "90034130";
const CELESTIAL_SHIKIGAMI = "90034110";
const CLAY_GOLEM = "90031110";
const DEMONIC_SHIKIGAMI = "90031140";
const NOBLE_SHIKIGAMI = "90034120";
const ONION_PATCH = "90032110";
const PAPER_SHIKIGAMI = "90031130";
const ARS_MAGNA = "90034320";
const DEPTHS_ELD_CRYSTALS = "90034330";
const ERSATZ_ELIMINATION = "90034310";
const LOOKING_SMART = "90033310";
const MAGIC_SEDIMENT = "90031210";

// Generators (meta-deck first)
const GINGER = "10834120";
const TETRA = "10834110";
const POPPY = "10831120";
const ANNE_GREA = "10134120";
const KUON = "10134110";
const TRUTH_SUMMONS = "10031320";
const DEMONIC_CALL = "10133320";
const BERGENT = "10232110";
const CAGLIOSTRO = "10434120";
const CALGE_DANTHLA = "10634120";
const HOMEWORK_TIME = "10133310";
const RAIO = "10334120";
const APPRENTICE_ASTROLOGER = "10131120";

const FILLER = "10111310";
const FORESIGHT = "10031310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const BLAZE_DESTROYER = "10032120";
const CRYSTALSPAWN = "10631110";

const CALGE_FAITH = faithCrestNameForCard("Calge-Danthla, Eld Crystals");

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
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
    secondDeck?: string[];
    seed?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 42,
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
  else b = b.withSecondDeck(Array(10).fill(FILLER));
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

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
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

function sbCount(card: {
  keywordState?: { spellboostCount?: number };
  spellboostCount?: number;
}): number {
  return (
    card.keywordState?.spellboostCount ??
    (card as { spellboostCount?: number }).spellboostCount ??
    0
  );
}

function boostCard(card: { uid: string; id?: string }, n: number): void {
  spellboostHand("first", n, card as Parameters<typeof spellboostHand>[2]);
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

function earthSigilStack(player: "first" | "second" = "first"): number {
  return thenBoard(player)
    .filter((c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0)
    .reduce((sum, c) => sum + (c.counters?.earth ?? 0), 0);
}

function hasKeyword(
  card: CardInstance | undefined | null,
  kw: string,
): boolean {
  if (!card) return false;
  const flag = `has${kw}` as keyof CardInstance;
  if ((card as any)[flag]) return true;
  if (
    card.keywords?.some(
      (k) => (typeof k === "string" ? k : (k as any)?.name) === kw,
    )
  )
    return true;
  return !!(card as any).keywordState?.[`has${kw}`];
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

function setupCalgeFaith(amount: number): void {
  bootstrapFaithForPlayer(
    "first",
    state.players.first.deck,
    state.players.first.hand,
  );
  crestAddCounter("first", CALGE_FAITH, "faith", amount);
}

describe("L2 — Runecraft tokens", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {});

  describe("Guardian Golem (90031120)", () => {
    const printed = "Ward";

    it("real path via Ginger Fanfare: summons Guardian Golem by uid", () => {
      setupTurn(R8, { hand: [GINGER], pp: 7 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", GUARDIAN_GOLEM);
      expect(summoned).toHaveLength(2);
      expect(Number(summoned[0]!.cost)).toBe(3);
      expect(Number(summoned[0]!.attack)).toBe(3);
      expect(Number(summoned[0]!.defense)).toBe(3);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Runecraft");
      expect(summoned[0]!.tribes).toContain("Golem");
    });

    it("Ward: has Ward keyword on board", () => {
      setupTurn(R6, { hand: [GUARDIAN_GOLEM], pp: 3 });
      whenPlayCard("first", 0);
      const golem = findOnBoard("first", "Guardian Golem")!;
      applyKeywordsFromList(golem);
      expect(hasKeyword(golem, "Ward")).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Ward: enemy cannot attack non-Ward follower while Guardian Golem is on board", () => {
      setupTurn(R6, { hand: [GUARDIAN_GOLEM], pp: 3 });
      whenPlayCard("first", 0);
      const golem = findOnBoard("first", "Guardian Golem")!;
      applyKeywordsFromList(golem);
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
      state.activePlayer = "second";
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(golem),
        "second",
        "first",
      );
      expect(Number(golem.defense)).toBe(0);
    });
  });

  describe("Delta Cannon (90034340)", () => {
    const printed = "Deal 5 damage to all enemy followers.";

    it("real path via Tetra Fanfare (X >= 10): adds Delta Cannon by uid", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 10);
      const uidsBefore = handUids();
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      const added = newHandCards(uidsBefore, "first", DELTA_CANNON);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Runecraft");
    });

    it("on play: deals 5 damage to each enemy follower; allied bystander untouched", () => {
      setupTurn(R6, { hand: [DELTA_CANNON], pp: 1 });
      const e1 = enemyFollower(2, 6, "E1");
      const e2 = enemyFollower(2, 4, "E2");
      const ally = allyFollower(2, 5, "Ally");
      whenPlayCard("first", 0);
      expect(Number(e1.defense)).toBe(1);
      expect(Number(e2.defense)).toBe(0);
      expect(Number(ally.defense)).toBe(5);
      expect(printed).toContain("Deal 5 damage to all enemy followers");
    });
  });

  describe("Mysterian Missile (90031310)", () => {
    const printed = "Deal 3 damage to a random enemy follower.";

    it("real path via Poppy Fanfare: adds Mysterian Missile by uid", () => {
      setupTurn(R6, { hand: [POPPY], pp: 2 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(uidsBefore, "first", MYSTERIAN_MISSILE);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Runecraft");
      expect(added[0]!.tribes).toContain("Mysteria");
    });

    it("with one enemy follower: deals exactly 3 damage to it", () => {
      setupTurn(R6, { hand: [MYSTERIAN_MISSILE], pp: 1 });
      const only = enemyFollower(2, 7, "Only");
      whenPlayCard("first", 0);
      expect(Number(only.defense)).toBe(4);
      expect(printed).toContain("Deal 3 damage");
    });

    it("with two enemies (seed 42): deals 3 to one random enemy; the other untouched", () => {
      setupTurn(R6, { hand: [MYSTERIAN_MISSILE], pp: 1, seed: 42 });
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      whenPlayCard("first", 0);
      const damaged =
        Number(e1.defense) === 2 ? e1 : Number(e2.defense) === 2 ? e2 : null;
      const untouched = damaged === e1 ? e2 : damaged === e2 ? e1 : null;
      expect(damaged).not.toBeNull();
      expect(Number(damaged!.defense)).toBe(2);
      expect(Number(untouched!.defense)).toBe(5);
    });

    it("with no enemy followers: playing Mysterian Missile leaves enemy leader HP unchanged", () => {
      setupTurn(R6, { hand: [MYSTERIAN_MISSILE], pp: 1 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Send 'Em Packing (90034350)", () => {
    const printed =
      'Select an allied follower on the field and give it "Can attack 2 times per turn."';

    it("real path via Tetra Fanfare (X >= 20): adds Send 'Em Packing by uid", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 20);
      const uidsBefore = handUids();
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      const added = newHandCards(uidsBefore, "first", SEND_EM_PACKING);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Runecraft");
    });

    it("on play: selected ally gains attacks_per_turn 2", () => {
      setupTurn(R6, { hand: [SEND_EM_PACKING], pp: 1 });
      const target = allyFollower(2, 3, "Target");
      const bystander = allyFollower(2, 3, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(
        Number(
          target.attacks_per_turn ?? target.keywordState?.attacks_per_turn,
        ),
      ).toBe(2);
      expect(bystander.attacks_per_turn ?? 1).toBe(1);
      expect(printed).toContain("Can attack 2 times per turn");
    });
  });

  describe("Anne's Summoning (90034130)", () => {
    const printed =
      "Rush\nWard\nAt the end of your opponent's turn, destroy this card.";

    it("real path via Anne & Grea Fanfare: summons Anne's Summoning by uid", () => {
      setupTurn(R7, { hand: [ANNE_GREA], pp: 5 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", ANNES_SUMMONING);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(3);
      expect(Number(summoned[0]!.attack)).toBe(5);
      expect(Number(summoned[0]!.defense)).toBe(5);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Runecraft");
      expect(summoned[0]!.tribes).toContain("Mysteria");
    });

    it("Rush: can attack enemy follower the turn it enters", () => {
      setupTurn(R6, { hand: [ANNES_SUMMONING], pp: 3 });
      const foe = enemyFollower(1, 6, "Foe");
      whenPlayCard("first", 0);
      const anne = findOnBoard("first", "Anne's Summoning")!;
      applyKeywordsFromList(anne);
      expect(anne.hasRush).toBe(true);
      readyAttacker(anne);
      attackFollower(
        getBoard(state, "first").indexOf(anne),
        0,
        "first",
        "second",
      );
      expect(Number(foe.defense)).toBe(1);
      expect(printed).toContain("Rush");
    });

    it("Rush: cannot attack enemy leader the turn it is played", () => {
      setupTurn(R6, { hand: [ANNES_SUMMONING], pp: 3 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const anne = findOnBoard("first", "Anne's Summoning")!;
      applyKeywordsFromList(anne);
      anne.can_attack = true;
      anne.attacks_left = 1;
      attackLeader(getBoard(state, "first").indexOf(anne), "first", "second");
      expect(getHP(state, "second")).toBe(20);
    });

    it("Ward: has Ward keyword on play", () => {
      setupTurn(R6, { hand: [ANNES_SUMMONING], pp: 3 });
      whenPlayCard("first", 0);
      const anne = findOnBoard("first", "Anne's Summoning")!;
      applyKeywordsFromList(anne);
      expect(hasKeyword(anne, "Ward")).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("opponent's EOT: destroys Anne's Summoning", () => {
      setupTurn(R6, {
        active: "second",
        secondHand: [FILLER],
        secondPP: 1,
        secondDeck: [DRAW_TOP, DRAW_SECOND],
      });
      const anne = createCard(ANNES_SUMMONING, "board", "first");
      anne.peak_defense = anne.defense;
      state.players.first.board.push(anne);
      runEndOfTurnBoundary("second");
      expect(thenBoard("first").some((c) => c.uid === anne.uid)).toBe(false);
      expect(printed).toContain("opponent's turn, destroy this card");
    });

    it("owner's EOT: Anne's Summoning remains on board", () => {
      setupTurn(R6, {
        hand: [FILLER],
        pp: 0,
        deck: [DRAW_TOP, DRAW_SECOND],
      });
      const anne = createCard(ANNES_SUMMONING, "board", "first");
      anne.peak_defense = anne.defense;
      state.players.first.board.push(anne);
      runEndOfTurnBoundary("first");
      expect(thenBoard("first").some((c) => c.uid === anne.uid)).toBe(true);
    });
  });

  describe("Celestial Shikigami (90034110)", () => {
    const printed = "Ward\nLast Words: Spellboost your hand 3 times.";

    it("real path via Kuon Fanfare: summons Celestial Shikigami by uid", () => {
      setupTurn(R10, { hand: [KUON], pp: 7 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", CELESTIAL_SHIKIGAMI);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(4);
      expect(Number(summoned[0]!.attack)).toBe(4);
      expect(Number(summoned[0]!.defense)).toBe(5);
      expect(summoned[0]!.tribes).toContain("Shikigami");
    });

    it("Ward: has Ward keyword on board", () => {
      setupTurn(R6, { hand: [CELESTIAL_SHIKIGAMI], pp: 4 });
      whenPlayCard("first", 0);
      const celestial = findOnBoard("first", "Celestial Shikigami")!;
      applyKeywordsFromList(celestial);
      expect(hasKeyword(celestial, "Ward")).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Last Words: spellboosts On Spellboost hand card exactly 3 times; non-Spellboost card untouched", () => {
      setupTurn(R6, {
        hand: [CELESTIAL_SHIKIGAMI, BLAZE_DESTROYER, FILLER],
        pp: 4,
      });
      whenPlayCard("first", 0);
      const sbCard = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const plain = thenHand("first").find((c) => c.id === FILLER)!;
      const sb0 = sbCount(sbCard);
      const plain0 = sbCount(plain);
      const celestial = findOnBoard("first", "Celestial Shikigami")!;
      celestial.defense = 0;
      cleanupDead();
      expect(sbCount(sbCard)).toBe(sb0 + 3);
      expect(sbCount(plain)).toBe(plain0);
      expect(printed).toContain("Spellboost your hand 3 times");
    });
  });

  describe("Clay Golem (90031110)", () => {
    it("real path via Truth Summons: summons Clay Golem by uid with exact stats", () => {
      setupTurn(R6, { hand: [TRUTH_SUMMONS], pp: 2 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", CLAY_GOLEM);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(2);
      expect(Number(summoned[0]!.defense)).toBe(2);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Runecraft");
      expect(summoned[0]!.tribes).toContain("Golem");
      applyKeywordsFromList(summoned[0]!);
      expect(summoned[0]!.hasRush).toBeFalsy();
      expect(summoned[0]!.hasWard).toBeFalsy();
      expect(summoned[0]!.hasStorm).toBeFalsy();
    });
  });

  describe("Demonic Shikigami (90031140)", () => {
    const printed = "Rush\nLast Words: Spellboost your hand.";

    it("real path via Demonic Call: summons Demonic Shikigami by uid", () => {
      setupTurn(R10, { hand: [DEMONIC_CALL], pp: 7 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", DEMONIC_SHIKIGAMI);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(3);
      expect(Number(summoned[0]!.attack)).toBe(3);
      expect(Number(summoned[0]!.defense)).toBe(3);
      expect(summoned[0]!.tribes).toContain("Shikigami");
    });

    it("Rush: can attack enemy follower the turn it is summoned", () => {
      setupTurn(R6, { hand: [DEMONIC_SHIKIGAMI], pp: 3 });
      const foe = enemyFollower(1, 5, "Foe");
      whenPlayCard("first", 0);
      const demonic = findOnBoard("first", "Demonic Shikigami")!;
      applyKeywordsFromList(demonic);
      readyAttacker(demonic);
      attackFollower(
        getBoard(state, "first").indexOf(demonic),
        0,
        "first",
        "second",
      );
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("Rush");
    });

    it("Rush: cannot attack enemy leader the turn it is played", () => {
      setupTurn(R6, { hand: [DEMONIC_SHIKIGAMI], pp: 3 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const demonic = findOnBoard("first", "Demonic Shikigami")!;
      applyKeywordsFromList(demonic);
      demonic.can_attack = true;
      demonic.attacks_left = 1;
      attackLeader(
        getBoard(state, "first").indexOf(demonic),
        "first",
        "second",
      );
      expect(getHP(state, "second")).toBe(20);
    });

    it("Last Words: spellboosts On Spellboost hand card once", () => {
      setupTurn(R6, {
        hand: [DEMONIC_SHIKIGAMI, BLAZE_DESTROYER],
        pp: 3,
      });
      whenPlayCard("first", 0);
      const sbCard = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const sb0 = sbCount(sbCard);
      const demonic = findOnBoard("first", "Demonic Shikigami")!;
      demonic.defense = 0;
      cleanupDead();
      expect(sbCount(sbCard)).toBe(sb0 + 1);
      expect(printed).toContain("Spellboost your hand");
    });
  });

  describe("Noble Shikigami (90034120)", () => {
    const printed =
      "When this follower enters the field, give it +X/+Y. X/Y is the total base attack/defense of allied Shikigami followers destroyed this turn.\nWard\nAura";

    it("real path via Kuon Enhance (10): summons Noble Shikigami by uid", () => {
      setupTurn(R10, { hand: [KUON], pp: 10 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", NOBLE_SHIKIGAMI);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(10);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Runecraft");
      expect(
        thenBoard("first").filter((c) => c.id === CELESTIAL_SHIKIGAMI),
      ).toHaveLength(0);
      expect(
        thenBoard("first").filter((c) => c.id === DEMONIC_SHIKIGAMI),
      ).toHaveLength(0);
      expect(
        thenBoard("first").filter((c) => c.id === PAPER_SHIKIGAMI),
      ).toHaveLength(0);
    });

    it("with allied Shikigami deaths this turn: enters with +X/+Y from their base stats", () => {
      setupTurn(R10, { hand: [NOBLE_SHIKIGAMI], pp: 10 });
      state.players.first.shikigamiDeathsThisTurn = [
        { base_attack: 2, base_defense: 1, attack: 2, defense: 1 },
        { base_attack: 3, base_defense: 3, attack: 3, defense: 3 },
      ];
      whenPlayCard("first", 0);
      const noble = findOnBoard("first", "Noble Shikigami")!;
      expect(Number(noble.attack)).toBe(6);
      expect(Number(noble.defense)).toBe(5);
      expect(printed).toContain("Shikigami followers destroyed this turn");
    });

    it("without Shikigami deaths this turn: enters at 1/1", () => {
      setupTurn(R10, { hand: [NOBLE_SHIKIGAMI], pp: 10 });
      state.players.first.shikigamiDeathsThisTurn = [];
      whenPlayCard("first", 0);
      const noble = findOnBoard("first", "Noble Shikigami")!;
      expect(Number(noble.attack)).toBe(1);
      expect(Number(noble.defense)).toBe(1);
    });

    it("Ward: has Ward keyword on board", () => {
      setupTurn(R10, { hand: [NOBLE_SHIKIGAMI], pp: 10 });
      whenPlayCard("first", 0);
      const noble = findOnBoard("first", "Noble Shikigami")!;
      applyKeywordsFromList(noble);
      expect(hasKeyword(noble, "Ward")).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Aura: has Aura keyword on board", () => {
      setupTurn(R10, { hand: [NOBLE_SHIKIGAMI], pp: 10 });
      whenPlayCard("first", 0);
      const noble = findOnBoard("first", "Noble Shikigami")!;
      applyKeywordsFromList(noble);
      expect(hasKeyword(noble, "Aura")).toBe(true);
      expect(printed).toContain("Aura");
    });
  });

  describe("Onion Patch (90032110)", () => {
    const printed = "Rush\nStrike: Spellboost your hand.";

    it("real path via Bergent Fanfare: summons 2 Onion Patch copies by uid", () => {
      setupTurn(R6, { hand: [BERGENT], pp: 5 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", ONION_PATCH);
      expect(summoned).toHaveLength(2);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(1);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Runecraft");
    });

    it("Rush: can attack enemy follower the turn it is summoned", () => {
      setupTurn(R6, { hand: [ONION_PATCH], pp: 1 });
      const foe = enemyFollower(1, 4, "Foe");
      whenPlayCard("first", 0);
      const onion = findOnBoard("first", "Onion Patch")!;
      applyKeywordsFromList(onion);
      readyAttacker(onion);
      attackFollower(
        getBoard(state, "first").indexOf(onion),
        0,
        "first",
        "second",
      );
      expect(Number(foe.defense)).toBe(3);
      expect(printed).toContain("Rush");
    });

    it("Strike: spellboosts On Spellboost hand card once when attacking", () => {
      setupTurn(R6, { hand: [ONION_PATCH, BLAZE_DESTROYER], pp: 1 });
      const foe = enemyFollower(1, 5, "Foe");
      whenPlayCard("first", 0);
      const sbCard = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const sb0 = sbCount(sbCard);
      const onion = findOnBoard("first", "Onion Patch")!;
      readyAttacker(onion);
      attackFollower(
        getBoard(state, "first").indexOf(onion),
        0,
        "first",
        "second",
      );
      expect(sbCount(sbCard)).toBe(sb0 + 1);
      expect(printed).toContain("Strike: Spellboost your hand");
    });

    it("without striking: hand spellboost count unchanged", () => {
      setupTurn(R6, { hand: [ONION_PATCH, BLAZE_DESTROYER], pp: 1 });
      whenPlayCard("first", 0);
      const sbCard = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const sb0 = sbCount(sbCard);
      expect(sbCount(sbCard)).toBe(sb0);
    });
  });

  describe("Paper Shikigami (90031130)", () => {
    const printed = "Rush\nLast Words: Spellboost your hand.";

    it("real path via Kuon Fanfare: summons Paper Shikigami by uid", () => {
      setupTurn(R10, { hand: [KUON], pp: 7 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", PAPER_SHIKIGAMI);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(2);
      expect(Number(summoned[0]!.attack)).toBe(2);
      expect(Number(summoned[0]!.defense)).toBe(1);
      expect(summoned[0]!.tribes).toContain("Shikigami");
    });

    it("Rush: can attack enemy follower the turn it is summoned", () => {
      setupTurn(R6, { hand: [PAPER_SHIKIGAMI], pp: 2 });
      const foe = enemyFollower(1, 4, "Foe");
      whenPlayCard("first", 0);
      const paper = findOnBoard("first", "Paper Shikigami")!;
      applyKeywordsFromList(paper);
      readyAttacker(paper);
      attackFollower(
        getBoard(state, "first").indexOf(paper),
        0,
        "first",
        "second",
      );
      expect(Number(foe.defense)).toBe(2);
      expect(printed).toContain("Rush");
    });

    it("Last Words: spellboosts On Spellboost hand card once", () => {
      setupTurn(R6, {
        hand: [PAPER_SHIKIGAMI, BLAZE_DESTROYER],
        pp: 2,
      });
      whenPlayCard("first", 0);
      const sbCard = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
      const sb0 = sbCount(sbCard);
      const paper = findOnBoard("first", "Paper Shikigami")!;
      paper.defense = 0;
      cleanupDead();
      expect(sbCount(sbCard)).toBe(sb0 + 1);
      expect(printed).toContain("Spellboost your hand");
    });
  });

  describe("Ars Magna (90034320)", () => {
    const printed =
      "Select an enemy and deal it 2 damage. Restore 1 defense to your leader.";

    it("real path via Cagliostro Fanfare: adds Ars Magna by uid", () => {
      setupTurn(R6, { hand: [CAGLIOSTRO], pp: 4 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(uidsBefore, "first", ARS_MAGNA);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Runecraft");
    });

    it("on play: deals 2 damage to selected enemy follower and restores 1 leader defense; bystander untouched", () => {
      setupTurn(R6, { hand: [ARS_MAGNA], pp: 1, hp: 18 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(6);
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("deal it 2 damage");
      expect(printed).toContain("Restore 1 defense");
    });

    it("on play: selecting enemy leader deals 2 damage and restores 1 leader defense", () => {
      setupTurn(R6, { hand: [ARS_MAGNA], pp: 1, hp: 18 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid("leader");
      expect(getHP(state, "second")).toBe(18);
      expect(getHP(state, "first")).toBe(19);
      expect(printed).toContain("deal it 2 damage");
      expect(printed).toContain("Restore 1 defense");
    });

    it("on play: empty enemy board hits leader via fallback_leader and restores 1 leader defense once", () => {
      setupTurn(R6, { hand: [ARS_MAGNA], pp: 1, hp: 18 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(state.pendingTargetEffect?.canTargetLeader).toBe(true);
      resolvePendingByUid("leader");
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(getHP(state, "second")).toBe(18);
      expect(getHP(state, "first")).toBe(19);
    });
  });

  describe("Depths of the Eld Crystals (90034330)", () => {
    const printed =
      "Summon a Crystalspawn and give it +X/+X. Restore Y defense to your leader. Deal Z damage to the enemy leader. X, Y, and Z are determined randomly and add up to your faith's value.";

    it("real path via Calge-Danthla Evolve: adds Depths by uid", () => {
      setupTurn(R10, { hand: [CALGE_DANTHLA], pp: 10, evo: 2 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const calge = findOnBoard("first", "Calge-Danthla, Eld Crystals")!;
      onEvolve(calge, "first", "normal", { spendPoint: true });
      const added = newHandCards(uidsBefore, "first", DEPTHS_ELD_CRYSTALS);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(6);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Runecraft");
      expect(added[0]!.tribes).toContain("Encroacher");
    });

    it.fails(
      "on play: summons a Crystalspawn — token 90034330 un-encoded (spell: []); faith 5 yields 0 Crystalspawn on board",
      () => {
        setupTurn(R10, { hand: [DEPTHS_ELD_CRYSTALS], pp: 6 });
        setupCalgeFaith(5);
        whenPlayCard("first", 0);
        expect(
          thenBoard("first").filter((c) => c.id === CRYSTALSPAWN),
        ).toHaveLength(1);
      },
    );

    it.fails(
      "on play: restores Y defense to your leader — token 90034330 un-encoded (spell: []); faith 5 at 15 HP stays 15",
      () => {
        setupTurn(R10, { hand: [DEPTHS_ELD_CRYSTALS], pp: 6, hp: 15 });
        setupCalgeFaith(5);
        whenPlayCard("first", 0);
        expect(getHP(state, "first")).toBe(16);
      },
    );

    it.fails(
      "on play: deals Z damage to the enemy leader — token 90034330 un-encoded (spell: []); faith 5 leaves enemy leader at 15 not 20",
      () => {
        setupTurn(R10, { hand: [DEPTHS_ELD_CRYSTALS], pp: 6 });
        setupCalgeFaith(5);
        state.players.second.hp = 20;
        whenPlayCard("first", 0);
        expect(getHP(state, "second")).toBe(15);
      },
    );
  });

  describe("Ersatz Elimination (90034310)", () => {
    const printed =
      "Increase the cost of all followers in your hand by 1. Destroy all enemy followers.";

    it("real path via Raio Fanfare: transforms spell into Ersatz Elimination by uid", () => {
      setupTurn(R10, { hand: [RAIO, FORESIGHT], pp: 9 });
      const foresightUid = thenHand("first").find(
        (c) => c.id === FORESIGHT,
      )!.uid;
      whenPlayCard("first", 0);
      const transformed = thenHand("first").find(
        (c) => c.uid === foresightUid,
      )!;
      expect(String(transformed.id)).toBe(ERSATZ_ELIMINATION);
      expect(transformed.name).toBe("Ersatz Elimination");
      expect(Number(transformed.cost)).toBe(0);
    });

    it("on play: increases follower hand cost by 1; spell in hand unchanged", () => {
      setupTurn(R6, {
        hand: [ERSATZ_ELIMINATION, "10031110", FORESIGHT],
        pp: 4,
      });
      const follower = thenHand("first").find((c) => c.id === "10031110")!;
      const spell = thenHand("first").find((c) => c.id === FORESIGHT)!;
      const followerCost0 = getEffectiveCost(follower);
      const spellCost0 = getEffectiveCost(spell);
      whenPlayCard("first", 0);
      expect(getEffectiveCost(follower)).toBe(followerCost0 + 1);
      expect(getEffectiveCost(spell)).toBe(spellCost0);
      expect(printed).toContain("followers in your hand");
    });

    it("on play: destroys all enemy followers; allied bystander untouched", () => {
      setupTurn(R6, { hand: [ERSATZ_ELIMINATION], pp: 4 });
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      const ally = allyFollower(2, 5, "Ally");
      whenPlayCard("first", 0);
      expect(thenBoard("second")).toHaveLength(0);
      expect(thenBoard("first").some((c) => c.uid === ally.uid)).toBe(true);
      expect(Number(ally.defense)).toBe(5);
      expect(printed).toContain("Destroy all enemy followers");
    });
  });

  describe("Looking Smart! (90033310)", () => {
    const printed = "Draw 2 cards. Deal 2 damage to a random enemy follower.";

    it("real path via Homework Time transform: becomes Looking Smart! by uid", () => {
      setupTurn(R6, { hand: [HOMEWORK_TIME], pp: 3 });
      const homework = thenHand("first").find((c) => c.id === HOMEWORK_TIME)!;
      const uid = homework.uid;
      spellboostHand("first", 5, homework);
      const transformed = thenHand("first").find((c) => c.uid === uid)!;
      expect(String(transformed.id)).toBe(LOOKING_SMART);
      expect(transformed.name).toBe("Looking Smart!");
      expect(Number(transformed.cost)).toBe(1);
      expect(transformed.type).toBe("Spell");
      expect(transformed.class).toBe("Runecraft");
    });

    it("on play: draws exactly the top 2 stacked deck cards", () => {
      setupTurn(R6, {
        hand: [LOOKING_SMART],
        pp: 1,
        deck: [FILLER, DRAW_TOP, DRAW_SECOND],
      });
      state.players.first.deck = [
        ...state.players.first.deck.filter((c) => c.id === FILLER),
        createCard(DRAW_TOP, "deck", "first"),
        createCard(DRAW_SECOND, "deck", "first"),
      ];
      whenPlayCard("first", 0);
      const ids = thenHand("first").map((c) => String(c.id));
      expect(ids).toContain(DRAW_TOP);
      expect(ids).toContain(DRAW_SECOND);
      expect(printed).toContain("Draw 2 cards");
    });

    it("on play: deals 2 damage to a random enemy follower (seed 42)", () => {
      setupTurn(R6, { hand: [LOOKING_SMART], pp: 1, seed: 42 });
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      whenPlayCard("first", 0);
      const damagedCount =
        (Number(e1.defense) === 3 ? 1 : 0) + (Number(e2.defense) === 3 ? 1 : 0);
      expect(damagedCount).toBe(1);
      expect(printed).toContain("Deal 2 damage");
    });
  });

  describe("Magic Sediment (90031210)", () => {
    const printed = "Earth Sigil\nEngage (1): Gain an earth sigil.";

    it("real path via Apprentice Astrologer Fanfare: summons Magic Sediment by uid", () => {
      setupTurn(R6, { hand: [APPRENTICE_ASTROLOGER, FILLER], pp: 2 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      if (state.pendingTargetEffect) {
        resolvePendingByUid(
          thenHand("first").find((c) => c.id === FILLER)!.uid,
        );
      }
      const summoned = newBoardCards(uidsBefore, "first", MAGIC_SEDIMENT);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(summoned[0]!.type).toBe("Amulet");
      expect(summoned[0]!.class).toBe("Runecraft");
      expect(summoned[0]!.tribes).toContain("Earth Sigil");
    });

    it("Earth Sigil: enters with 1 earth sigil on the stack", () => {
      setupTurn(R6, { hand: [MAGIC_SEDIMENT], pp: 1 });
      whenPlayCard("first", 0);
      expect(earthSigilStack()).toBe(1);
      expect(printed).toContain("Earth Sigil");
    });

    it("Engage (1): spending 1 PP adds 1 earth sigil to the stack", () => {
      setupTurn(R6, { hand: [MAGIC_SEDIMENT], pp: 2 });
      const ppBefore = getPP(state, "first");
      whenPlayCard("first", 0);
      expect(earthSigilStack()).toBe(1);
      engageAmulet("first", 0);
      expect(earthSigilStack()).toBe(2);
      expect(getPP(state, "first")).toBe(ppBefore - 2);
      expect(printed).toContain("Engage (1)");
    });
  });
});
