/**
 * L2 real-card tests — Sephie Runecraft deck (15 distinct cards).
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

import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  playFollowerFromHandById,
  summonFollowerByCardId,
} from "../harness/l2Dispatch.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import { forceCompleteOrFizzlePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getHP, getPP, getCrests } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";
import type { CardInstance } from "../../src/core/types/index.js";

const FORESIGHT = "10031310";
const TRUTH_SUMMONS = "10031320";
const MISCALCULATED = "10931310";
const STORMY_BLAST = "10831310";
const LYRIA = "10403120";
const METAMORPHOSIS = "10531310";
const TEST_SUBJECT = "10931110";
const WILLS_UNITED = "10803310";
const AMETHYST_NAPTIME = "10833310";
const HUMANE_LOVE = "10932310";
const RESEARCHER = "10932110";
const SCHOLAR = "10933110";
const FATE_OF_WORLD = "10503310";
const OBSIDIAN_RAVEN = "10933310";
const TETRA = "10834110";
const SEPHIE = "10934110";

const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const DRAW_THIRD = "10011110";
const BIG_FOLLOWER = "10002120"; // Caravan Mammoth — cost 7
const DELTA_CANNON = "90034340";
const SEND_EM_PACKING = "90034350";
const REANIMATE_CORPSE = "10201110";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

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

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    hp?: number;
    secondDeck?: string[];
    active?: "first" | "second";
    evo?: number;
    superEvo?: number;
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
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  else b = b.withSecondDeck(Array(10).fill(FILLER));
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

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
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

function playForesights(n: number): void {
  for (let i = 0; i < n; i++) {
    whenPlayCard("first", 0);
  }
}

function boostCard(card: { uid: string; id?: string }, n: number): void {
  spellboostHand("first", n, card as Parameters<typeof spellboostHand>[2]);
}

function fuseToInitiator(initiatorUid: string, partnerUid: string): void {
  startFuseFromHand("first", initiatorUid);
  resolvePendingTarget(partnerUid);
  if (state.pendingTargetEffect) {
    forceCompleteOrFizzlePendingTarget();
  }
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

function countOnBoardById(
  id: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.id === id).length;
}

function setEnterHistory(count: number): void {
  state.players.first.followerEnterHistory = Array.from(
    { length: count },
    () => ({
      name: "Obsessed Test Subject",
      tribes: [],
      cardId: TEST_SUBJECT,
    }),
  );
}

describe("L2 Sephie Runecraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Foresight (10031310)", () => {
    const printed = "Draw a card.";

    it("draws the top stacked deck card into hand", () => {
      setupTurn(R6, {
        hand: [FORESIGHT],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 1,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).not.toContain(FORESIGHT);
      expect(deckIds()).toContain(DRAW_SECOND);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });
  });

  describe("Miscalculated Experiment (10931310)", () => {
    const printed = "Add 3 copies of Truth Summons to your hand.";

    it("adds exactly 3 copies of Truth Summons (10031320) to hand", () => {
      setupTurn(R6, { hand: [MISCALCULATED], pp: 1 });
      whenPlayCard("first", 0);
      const truths = thenHand("first").filter((c) => c.id === TRUTH_SUMMONS);
      expect(truths).toHaveLength(3);
      expect(handIds()).not.toContain(MISCALCULATED);
      expect(printed).toContain("Truth Summons");
    });
  });

  describe("Stormy Blast (10831310)", () => {
    const printed =
      "X starts at 2. / On Spellboost: Increase X by 1. / Select an enemy follower on the field and deal it X damage.";

    it("with X=2 (no spellboost): deals 2 to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [STORMY_BLAST], pp: 1 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(5);
      expect(printed).toContain("X starts at 2");
    });

    it("On Spellboost increases X: after 2 spellboosts deals 4 to selected enemy", () => {
      setupTurn(R6, {
        hand: [FORESIGHT, FORESIGHT, STORMY_BLAST],
        deck: Array(6).fill(FORESIGHT),
        pp: 3,
      });
      const wall = enemyFollower(1, 10, "Wall");
      playForesights(2);
      const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
      expect(sbCount(blast)).toBe(2);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === STORMY_BLAST),
      );
      resolvePendingByUid(wall.uid);
      expect(10 - Number(wall.defense)).toBe(4);
      expect(printed).toContain("Increase X by 1");
    });
  });

  describe("Lyria, Skydestined (10403120)", () => {
    const printed =
      "Enhance(8): Draw a follower that costs 7 or more. Recover 7 play points\nBarrier";

    it("without Enhance(8): plays as 2-cost follower with Barrier, no big draw", () => {
      setupTurn(R6, {
        hand: [LYRIA],
        pp: 2,
        deck: [BIG_FOLLOWER, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      const lyria = findOnBoard("first", "Lyria, Skydestined")!;
      expect(lyria.hasBarrier || lyria.keywordState?.hasBarrier).toBe(true);
      expect(handIds()).not.toContain(BIG_FOLLOWER);
      expect(deckIds()).toContain(BIG_FOLLOWER);
      expect(getPP(state, "first")).toBe(0);
      expect(printed).toContain("Barrier");
    });

    it("Enhance(8): draws cost ≥7 follower and recovers 7 PP", () => {
      setupTurn(R10, {
        hand: [LYRIA],
        pp: 8,
        deck: [BIG_FOLLOWER, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(BIG_FOLLOWER);
      expect(deckIds()).not.toContain(BIG_FOLLOWER);
      expect(getPP(state, "first")).toBe(7);
      expect(findOnBoard("first", "Lyria, Skydestined")).toBeDefined();
      expect(printed).toContain("Recover 7 play points");
    });
  });

  describe("Metamorphosis of the Dawnblossom (10531310)", () => {
    const printed = "Select a card in your hand and discard it. Draw 2 cards.";

    it("discards the selected hand card and draws 2 stacked deck cards", () => {
      setupTurn(R6, {
        hand: [METAMORPHOSIS, DRAW_TOP],
        deck: [FORESIGHT, DRAW_SECOND, DRAW_THIRD],
        pp: 2,
      });
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(handIds()).not.toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(handIds()).toContain(DRAW_THIRD);
      expect(handIds()).not.toContain(METAMORPHOSIS);
      expect(printed).toContain("Draw 2 cards");
    });
  });

  describe("Obsessed Test Subject (10931110)", () => {
    const printed =
      "When this follower enters the field, if at least 5 other allied copies of Obsessed Test Subject have entered the field this match, give it +3/+3.\nRush";

    it("with fewer than 5 prior enters: enters 2/2 without +3/+3 buff", () => {
      setupTurn(R5, { hand: [TEST_SUBJECT], pp: 2 });
      setEnterHistory(4);
      whenPlayCard("first", 0);
      const subj = findOnBoard("first", "Obsessed Test Subject")!;
      expect(Number(subj.attack)).toBe(2);
      expect(Number(subj.defense)).toBe(2);
      expect(printed).toContain("at least 5 other");
    });

    it("with 5+ prior enters: enters 5/5 (+3/+3)", () => {
      setupTurn(R5, { hand: [TEST_SUBJECT], pp: 2 });
      setEnterHistory(5);
      whenPlayCard("first", 0);
      const subj = findOnBoard("first", "Obsessed Test Subject")!;
      expect(Number(subj.attack)).toBe(5);
      expect(Number(subj.defense)).toBe(5);
    });

    it("has Rush on field", () => {
      setupTurn(R5, { hand: [TEST_SUBJECT], pp: 2 });
      whenPlayCard("first", 0);
      const subj = findOnBoard("first", "Obsessed Test Subject")!;
      expect(subj.hasRush || subj.keywordState?.hasRush).toBe(true);
      expect(printed).toContain("Rush");
    });
  });

  describe("Wills United (10803310)", () => {
    const printed =
      "Select a Mode to activate. / 1. Deal 3 damage to a random enemy follower. / 2. Reanimate (2). / 3. Give all allied followers on the field +1/+0.";

    it("Mode 1: deals 3 damage to a random enemy follower (seed 1)", () => {
      setupTurn(R6, { hand: [WILLS_UNITED], pp: 2 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const totalDamage =
        5 - Number(target.defense) + (5 - Number(bystander.defense));
      expect(totalDamage).toBe(3);
      expect(printed).toContain("Deal 3 damage");
    });

    it("Mode 2: Reanimate (2) summons a destroyed cost-1 follower from graveyard", () => {
      setupTurn(R6, { hand: [WILLS_UNITED], pp: 2 });
      const corpse = createCard(REANIMATE_CORPSE, "board", "first");
      corpse.peak_defense = Number(corpse.defense) || 1;
      state.players.first.board.push(corpse);
      corpse.defense = 0;
      cleanupDead();
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(thenBoard("first").some((c) => c.id === REANIMATE_CORPSE)).toBe(
        true,
      );
      expect(printed).toContain("Reanimate (2)");
    });

    it("Mode 3: gives all allied followers on the field +1/+0", () => {
      setupTurn(R6, { hand: [WILLS_UNITED], pp: 2 });
      const allyA = allyFollower(2, 2, "AllyA");
      const allyB = allyFollower(3, 3, "AllyB");
      setScriptedModePickProvider(() => [2]);
      whenPlayCard("first", 0);
      expect(Number(allyA.attack)).toBe(3);
      expect(Number(allyB.attack)).toBe(4);
      expect(Number(allyA.defense)).toBe(2);
      expect(Number(allyB.defense)).toBe(3);
      expect(printed).toContain("+1/+0");
    });
  });

  describe("Amethyst's Naptime (10833310)", () => {
    const printed =
      "X starts at 0. / On Spellboost: Increase X by 1. / Draw 2 cards. If X is at least 5, restore 2 defense to your leader and recover 2 play points.";

    it("always draws 2 stacked cards", () => {
      setupTurn(R6, {
        hand: [AMETHYST_NAPTIME],
        deck: [FORESIGHT, DRAW_SECOND, DRAW_TOP],
        pp: 3,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(printed).toContain("Draw 2 cards");
    });

    it("On Spellboost in hand: increases X before play", () => {
      setupTurn(R6, {
        hand: [FORESIGHT, AMETHYST_NAPTIME],
        pp: 2,
      });
      whenPlayCard("first", 0);
      const nap = thenHand("first").find((c) => c.id === AMETHYST_NAPTIME)!;
      expect(sbCount(nap)).toBe(1);
      expect(printed).toContain("Increase X by 1");
    });

    it("when X < 5: does not restore leader or recover bonus PP", () => {
      setupTurn(R10, {
        hand: [...Array(4).fill(FORESIGHT), AMETHYST_NAPTIME],
        deck: Array(10).fill(FORESIGHT),
        pp: 10,
        hp: 15,
      });
      playForesights(4);
      const nap = thenHand("first").find((c) => c.id === AMETHYST_NAPTIME)!;
      expect(sbCount(nap)).toBe(4);
      const hpBefore = getHP(state, "first");
      const ppBefore = getPP(state, "first");
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === AMETHYST_NAPTIME),
      );
      expect(getHP(state, "first")).toBe(hpBefore);
      expect(getPP(state, "first")).toBe(ppBefore - 3);
      expect(printed).toContain("If X is at least 5");
    });

    it("when X >= 5: restores 2 defense and recovers 2 PP", () => {
      setupTurn(R10, {
        hand: [...Array(5).fill(FORESIGHT), AMETHYST_NAPTIME],
        deck: Array(12).fill(FORESIGHT),
        pp: 10,
        hp: 15,
      });
      playForesights(5);
      const nap = thenHand("first").find((c) => c.id === AMETHYST_NAPTIME)!;
      expect(sbCount(nap)).toBe(5);
      const hpBefore = getHP(state, "first");
      const ppBefore = getPP(state, "first");
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === AMETHYST_NAPTIME),
      );
      expect(getHP(state, "first")).toBe(hpBefore + 2);
      expect(getPP(state, "first")).toBe(ppBefore - 3 + 2);
    });
  });

  describe("Humane Love (10932310)", () => {
    const printed =
      "Summon an Obsessed Test Subject and give it +1/+0. Add an Obsessed Test Subject to your hand and give it +1/+0.";

    it("summons exactly one Obsessed Test Subject (10931110) at 3/2 on board", () => {
      setupTurn(R6, { hand: [HUMANE_LOVE], pp: 3 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(TEST_SUBJECT)).toBe(1);
      const onBoard = thenBoard("first").find((c) => c.id === TEST_SUBJECT)!;
      expect(Number(onBoard.attack)).toBe(3);
      expect(Number(onBoard.defense)).toBe(2);
      expect(printed).toContain("Summon an Obsessed Test Subject");
    });

    it("adds exactly one Obsessed Test Subject (10931110) at 3/2 to hand", () => {
      setupTurn(R6, { hand: [HUMANE_LOVE], pp: 3 });
      whenPlayCard("first", 0);
      const inHand = thenHand("first").filter((c) => c.id === TEST_SUBJECT);
      expect(inHand).toHaveLength(1);
      expect(Number(inHand[0]!.attack)).toBe(3);
      expect(Number(inHand[0]!.defense)).toBe(2);
      expect(printed).toContain("Add an Obsessed Test Subject");
    });
  });

  describe("Enamored Researcher (10932110)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Obsessed Test Subject.\nEnhance (8): Summon 3 copies instead and give them Ward.\nEvolve: Select an allied Obsessed Test Subject on the field and give it Bane.";

    it("Fanfare at 4 PP: summons exactly 2 Obsessed Test Subject without Ward", () => {
      setupTurn(R7, { hand: [RESEARCHER], pp: 4 });
      whenPlayCard("first", 0);
      const subjects = thenBoard("first").filter((c) => c.id === TEST_SUBJECT);
      expect(subjects).toHaveLength(2);
      expect(subjects.every((c) => !c.hasWard)).toBe(true);
      expect(printed).toContain("Summon 2 copies");
    });

    it("Enhance (8): summons exactly 3 Obsessed Test Subject with Ward instead of 2", () => {
      setupTurn(R8, { hand: [RESEARCHER], pp: 8 });
      whenPlayCard("first", 0);
      const subjects = thenBoard("first").filter((c) => c.id === TEST_SUBJECT);
      expect(subjects).toHaveLength(3);
      expect(subjects.every((c) => c.hasWard === true)).toBe(true);
      expect(
        thenBoard("first").filter((c) => c.id === RESEARCHER),
      ).toHaveLength(1);
      expect(printed).toContain("Summon 3 copies instead");
    });

    it("Evolve: gives Bane to selected Obsessed Test Subject only", () => {
      setupTurn(R7, { hand: [RESEARCHER], pp: 4 });
      whenPlayCard("first", 0);
      const unrelated = allyFollower(1, 3, "Unrelated Ally");
      const subject = thenBoard("first").find((c) => c.id === TEST_SUBJECT)!;
      const researcher = findOnBoard("first", "Enamored Researcher")!;
      state.players.first.evoCharges = 2;
      whenEvolve(researcher, "first");
      resolvePendingByUid(subject.uid);
      expect(hasKeyword(subject, "Bane")).toBe(true);
      expect(hasKeyword(unrelated, "Bane")).toBe(false);
      expect(printed).toContain("give it Bane");
    });

    it("Evolve with no Obsessed Test Subject on board: gives Bane to nothing", () => {
      setupTurn(R7, { hand: [RESEARCHER], pp: 4 });
      const researcher = createCard(RESEARCHER, "board", "first");
      researcher.peak_defense = Number(researcher.defense) || 1;
      state.players.first.board = [researcher];
      const unrelated = allyFollower(1, 3, "Unrelated Ally");
      state.players.first.evoCharges = 2;
      whenEvolve(researcher, "first");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(hasKeyword(unrelated, "Bane")).toBe(false);
      expect(thenBoard("first").some((c) => hasKeyword(c, "Bane"))).toBe(false);
    });
  });

  describe("Ecstatic Scholar (10933110)", () => {
    const printed =
      "Fuse: Cards\nFanfare: Draw 2 cards. Summon an Obsessed Test Subject.\nSuper-Evolve: If you've Fused to this card, select an allied Obsessed Test Subject on the field and give it Drain.";

    it("Fanfare: draws 2 stacked deck cards and summons exactly one Obsessed Test Subject", () => {
      setupTurn(R7, {
        hand: [SCHOLAR],
        deck: [FORESIGHT, DRAW_SECOND, DRAW_TOP],
        pp: 5,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(countOnBoardById(TEST_SUBJECT)).toBe(1);
      expect(printed).toContain("Draw 2 cards");
    });

    it("Super-Evolve without fuse: does not offer Drain selection", () => {
      setupTurn(R7, { hand: [SCHOLAR], pp: 5, deck: [FILLER, FILLER] });
      whenPlayCard("first", 0);
      const subject = thenBoard("first").find((c) => c.id === TEST_SUBJECT)!;
      const scholar = findOnBoard("first", "Ecstatic Scholar")!;
      scholar.peak_defense = Number(scholar.defense);
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(scholar, "first");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(hasKeyword(subject, "Drain")).toBe(false);
      expect(printed).toContain("If you've Fused");
    });

    it("Super-Evolve after fuse: gives Drain to selected Obsessed Test Subject only", () => {
      setupTurn(R7, {
        hand: [SCHOLAR, FILLER],
        pp: 6,
        deck: [FILLER, FILLER, FILLER],
      });
      const scholar = thenHand("first").find((c) => c.id === SCHOLAR)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      fuseToInitiator(scholar.uid, material.uid);
      expect(scholar.isFused).toBe(true);

      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.uid === scholar.uid),
      );
      const unrelated = allyFollower(1, 3, "Unrelated Ally");
      const subject = thenBoard("first").find((c) => c.id === TEST_SUBJECT)!;
      const onBoard = findOnBoard("first", "Ecstatic Scholar")!;
      onBoard.peak_defense = Number(onBoard.defense);
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(onBoard, "first");
      resolvePendingByUid(subject.uid);
      expect(hasKeyword(subject, "Drain")).toBe(true);
      expect(hasKeyword(unrelated, "Drain")).toBe(false);
      expect(printed).toContain("Fuse: Cards");
    });
  });

  describe("Fate of the World (10503310)", () => {
    const printed =
      "Draw 2 cards. Destroy a random enemy follower with the highest attack.\nEnhance (10): Deal 4 damage to all enemies.";

    it("without Enhance(10): draws 2 stacked cards and destroys highest-attack enemy only", () => {
      setupTurn(R6, {
        hand: [FATE_OF_WORLD],
        pp: 5,
        deck: [FORESIGHT, DRAW_SECOND, DRAW_TOP],
      });
      const low = enemyFollower(2, 5, "Low");
      const high = enemyFollower(5, 3, "High");
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(findOnBoard("second", "High")).toBeFalsy();
      expect(findOnBoard("second", "Low")).toBeTruthy();
      expect(Number(low.defense)).toBe(5);
      expect(getHP(state, "second")).toBe(hpBefore);
      expect(printed).toContain("highest attack");
    });

    it("Enhance (10): also deals 4 damage to all enemies", () => {
      setupTurn(R10, {
        hand: [FATE_OF_WORLD],
        pp: 10,
        deck: [FORESIGHT, DRAW_SECOND, DRAW_TOP],
      });
      const low = enemyFollower(2, 5, "Low");
      const high = enemyFollower(5, 8, "High");
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(hpBefore - 4);
      expect(Number(low.defense)).toBe(1);
      expect(findOnBoard("second", "High")).toBeFalsy();
      expect(printed).toContain("Deal 4 damage to all enemies");
    });

    it("at 5 PP without Enhance(10): does not deal AoE damage to enemy leader", () => {
      setupTurn(R6, {
        hand: [FATE_OF_WORLD],
        pp: 5,
        deck: [FORESIGHT, DRAW_SECOND, DRAW_TOP],
      });
      enemyFollower(2, 5, "Foe");
      const hpBefore = getHP(state, "second");
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(hpBefore);
    });
  });

  describe("Obsidian Raven (10933310)", () => {
    const printed =
      'Summon an Obsessed Test Subject. Do this 2 times: "Deal 7 damage to a random enemy follower."';

    it("summons exactly one Obsessed Test Subject (10931110)", () => {
      setupTurn(R7, { hand: [OBSIDIAN_RAVEN], pp: 5, seed: 1 });
      enemyFollower(2, 20, "Wall");
      whenPlayCard("first", 0);
      expect(countOnBoardById(TEST_SUBJECT)).toBe(1);
      expect(printed).toContain("Summon an Obsessed Test Subject");
    });

    it("deals 7 damage twice to random enemy followers (seed 1 → 14 total)", () => {
      setupTurn(R7, { hand: [OBSIDIAN_RAVEN], pp: 5, seed: 1 });
      const a = enemyFollower(1, 10, "A");
      const b = enemyFollower(1, 10, "B");
      whenPlayCard("first", 0);
      const totalDamage = 10 - Number(a.defense) + (10 - Number(b.defense));
      expect(totalDamage).toBe(14);
      expect(printed).toContain("2 times");
    });
  });

  describe("Tetra & Ladica, Forest BFFs (10834110)", () => {
    const printed =
      "X starts at 0. / On Spellboost: Increase X by 1. / Fanfare: If X is at least 10, add a Delta Cannon to your hand. If X is at least 20, add a Send 'Em Packing to your hand. / Storm";

    it("has Storm on field", () => {
      setupTurn(R8, { hand: [TETRA], pp: 6 });
      whenPlayCard("first", 0);
      const tetra = findOnBoard("first", "Tetra & Ladica, Forest BFFs")!;
      expect(tetra.hasStorm || tetra.keywordState?.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });

    it("when X < 10: Fanfare adds neither Delta Cannon nor Send 'Em Packing", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 9);
      expect(sbCount(tetra)).toBe(9);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      expect(handIds()).not.toContain(DELTA_CANNON);
      expect(handIds()).not.toContain(SEND_EM_PACKING);
      expect(printed).toContain("at least 10");
    });

    it("when X >= 10 and X < 20: adds Delta Cannon only", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 10);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      expect(handIds()).toContain(DELTA_CANNON);
      expect(handIds()).not.toContain(SEND_EM_PACKING);
    });

    it("when X >= 20: adds Delta Cannon and Send 'Em Packing", () => {
      setupTurn(R10, { hand: [TETRA], pp: 6 });
      const tetra = thenHand("first").find((c) => c.id === TETRA)!;
      boostCard(tetra, 20);
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === TETRA),
      );
      expect(handIds()).toContain(DELTA_CANNON);
      expect(handIds()).toContain(SEND_EM_PACKING);
      expect(printed).toContain("at least 20");
    });
  });

  describe("Sephie, Maven Convict (10934110)", () => {
    const printed =
      "Fuse: Cards\nWhenever you Fuse to this card, spend 2 play points to summon an Obsessed Test Subject.\nFanfare: Summon 2 copies of Obsessed Test Subject.\nSuper-Evolve: Gain Crest: Sephie, Maven Convict.";
    const crestPrinted =
      "Once on each of your turns, when an allied Obsessed Test Subject enters the field, give it Storm.";

    it("Fanfare: summons exactly 2 Obsessed Test Subject (10931110)", () => {
      setupTurn(R8, { hand: [SEPHIE], pp: 7 });
      whenPlayCard("first", 0);
      expect(countOnBoardById(TEST_SUBJECT)).toBe(2);
      expect(printed).toContain("Summon 2 copies");
    });

    it("when fusing with 2+ PP: spends exactly 2 PP and summons one Obsessed Test Subject", () => {
      setupTurn(R8, { hand: [SEPHIE, FILLER], pp: 4 });
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");
      fuseToInitiator(sephie.uid, material.uid);
      expect(sephie.isFused).toBe(true);
      expect(countOnBoardById(TEST_SUBJECT)).toBe(1);
      expect(getPP(state, "first")).toBe(ppBefore - 2);
      expect(printed).toContain("spend 2 play points");
    });

    it("when fusing with fewer than 2 PP: consumes material but summons nothing", () => {
      setupTurn(R8, { hand: [SEPHIE, FILLER], pp: 1 });
      const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
      const material = thenHand("first").find((c) => c.id === FILLER)!;
      const ppBefore = getPP(state, "first");
      fuseToInitiator(sephie.uid, material.uid);
      expect(sephie.isFused).toBe(true);
      expect(countOnBoardById(TEST_SUBJECT)).toBe(0);
      expect(getPP(state, "first")).toBe(ppBefore);
    });

    it("Super-Evolve: gains Crest: Sephie, Maven Convict", () => {
      setupTurn(R8, { hand: [SEPHIE], pp: 7, superEvo: 1 });
      whenPlayCard("first", 0);
      const sephie = findOnBoard("first", "Sephie, Maven Convict")!;
      whenSuperEvolve(sephie, "first");
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Sephie, Maven Convict",
        ),
      ).toBe(true);
      expect(printed).toContain("Gain Crest");
    });

    it("crest: first Obsessed Test Subject entering each turn gains Storm", () => {
      setupTurn(R8, {
        hand: [SEPHIE, HUMANE_LOVE],
        pp: 10,
        superEvo: 1,
        deck: Array(10).fill(FILLER),
      });
      whenPlayCard("first", 0);
      const sephie = findOnBoard("first", "Sephie, Maven Convict")!;
      whenSuperEvolve(sephie, "first");
      // Fanfare left 2 subjects without Storm from crest (entered before crest).
      state.players.first.board = state.players.first.board.filter(
        (c) => c.id !== TEST_SUBJECT,
      );
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === HUMANE_LOVE),
      );
      const first = thenBoard("first").find((c) => c.id === TEST_SUBJECT)!;
      expect(hasKeyword(first, "Storm")).toBe(true);
      expect(crestPrinted).toContain("give it Storm");
    });

    it("crest: second Obsessed Test Subject same turn does not gain Storm", () => {
      setupTurn(R8, {
        hand: [SEPHIE, HUMANE_LOVE],
        pp: 10,
        superEvo: 1,
        deck: Array(10).fill(FILLER),
      });
      whenPlayCard("first", 0);
      const sephie = findOnBoard("first", "Sephie, Maven Convict")!;
      whenSuperEvolve(sephie, "first");
      state.players.first.board = state.players.first.board.filter(
        (c) => c.id !== TEST_SUBJECT,
      );
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === HUMANE_LOVE),
      );
      const first = thenBoard("first").find((c) => c.id === TEST_SUBJECT)!;
      expect(hasKeyword(first, "Storm")).toBe(true);
      const second = summonFollowerByCardId(TEST_SUBJECT, "first");
      const subjects = thenBoard("first").filter((c) => c.id === TEST_SUBJECT);
      expect(subjects).toHaveLength(2);
      const stormCount = subjects.filter((c) => hasKeyword(c, "Storm")).length;
      expect(stormCount).toBe(1);
      expect(hasKeyword(second, "Storm")).toBe(false);
      expect(crestPrinted).toContain("Once on each of your turns");
    });

    it("crest: after a new turn, Obsessed Test Subject entering gains Storm again", () => {
      setupTurn(R8, {
        hand: [SEPHIE, HUMANE_LOVE],
        pp: 10,
        superEvo: 1,
        deck: Array(10).fill(FILLER),
      });
      whenPlayCard("first", 0);
      const sephie = findOnBoard("first", "Sephie, Maven Convict")!;
      whenSuperEvolve(sephie, "first");
      state.players.first.board = [];
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === HUMANE_LOVE),
      );
      const firstTurnSubject = thenBoard("first").find(
        (c) => c.id === TEST_SUBJECT,
      )!;
      expect(hasKeyword(firstTurnSubject, "Storm")).toBe(true);
      state.players.first.board = [];
      whenEndTurn();
      whenEndTurn();
      state.players.first.hand.push(createCard(HUMANE_LOVE, "hand", "first"));
      whenPlayCard(
        "first",
        thenHand("first").findIndex((c) => c.id === HUMANE_LOVE),
      );
      const nextTurnSubject = thenBoard("first").find(
        (c) => c.id === TEST_SUBJECT,
      )!;
      expect(hasKeyword(nextTurnSubject, "Storm")).toBe(true);
    });

    it.fails(
      "Sephie crest grants Storm on opponent turn when Obsessed Test Subject enters — crest turn scope?",
      () => {
        setupTurn(R8, { pp: 7, superEvo: 1, active: "second" });
        const sephie = createCard(SEPHIE, "board", "first");
        sephie.peak_defense = Number(sephie.defense) || 1;
        state.players.first.board = [sephie];
        whenSuperEvolve(sephie, "first");
        const subject = summonFollowerByCardId(TEST_SUBJECT, "first");
        expect(hasKeyword(subject, "Storm")).toBe(false);
        expect(crestPrinted).toContain("your turns");
      },
    );
  });
});
