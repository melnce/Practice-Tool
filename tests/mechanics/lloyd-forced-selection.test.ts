/**
 * Lloyd (90074120): forced first pick only when Lloyd is in the filtered pool.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";
import { pickRandomTargets } from "../../src/logic/core/targeting/selectHelpers.js";
import { getForcedFirstPicks } from "../../src/logic/core/targeting/forcedPicks.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { createRng } from "../../src/core/rng.js";
import {
  captureSnapshot,
  doAction,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";

const LLOYD = "90074120";
const ADVENT_ELD_AXE = "10671310";
const CLERIC = "10261110";
const DARK_SIDE = "10201310";
const SYLVIA = "10173120";
const SOUL_TUNING = "10751310";
const ARA = "10534120";
const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 25 }, () => FILLER);

function placeLloyd(owner: "first" | "second" = "first", uid = "lloyd_1") {
  const lloyd = createCard(LLOYD, "board", owner);
  lloyd.uid = uid;
  lloyd.peak_defense = Number(lloyd.defense);
  applyKeywordsFromList(lloyd);
  getBoard(state, owner).push(lloyd);
  return lloyd;
}

function placeFollower(
  atk: number,
  def: number,
  owner: "first" | "second",
  name: string,
  uid: string,
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    owner,
  );
  c.uid = uid;
  c.peak_defense = def;
  getBoard(state, owner).push(c);
  return c;
}

function setupMain(
  round: number,
  opts: {
    active?: "first" | "second";
    firstHand?: string[];
    secondHand?: string[];
    pp?: number;
    evo?: number;
    superEvo?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 20260910,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  })
    .withFirstPP(pp, max)
    .withFirstDeck(PAD_DECK)
    .withSecondDeck(PAD_DECK)
    .withSecondPP(pp, max);
  if (opts.firstHand?.length) b = b.withFirstHand(opts.firstHand);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function chooseTarget(uid: string) {
  engineDispatch(state, {
    type: "CHOOSE_TARGET",
    target: { type: "card", uid },
  });
}

function isSelectable(uid: string): boolean {
  for (const p of ["first", "second"] as const) {
    for (const c of getBoard(state, p)) {
      if (c?.uid === uid) return !!c.__uiSelectable;
    }
  }
  return false;
}

describe("Lloyd forced first pick (pool-derived)", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    injectAdapter({
      render: () => {},
      showChoiceModal: () => {},
      showTargetConfirmationButton: () => {},
      hideTargetConfirmation: () => {},
      triggerConfirmButtonClick: () => {},
    });
  });

  it("(a) filtered choose: Lloyd fails condition — legal target selectable and resolves", () => {
    setupMain(6, { active: "second", pp: 6 });
    state.players.second.evoCharges = 1;
    state.players.second.maxPP = 6;
    const lloyd = placeLloyd("first");
    const superEnemy = placeFollower(4, 4, "first", "Orchis", "orchis_1", {
      hasSuperEvolved: true,
      evoType: "super",
    });
    const cleric = createCard(CLERIC, "board", "second");
    cleric.uid = "cleric_1";
    cleric.peak_defense = Number(cleric.defense);
    applyKeywordsFromList(cleric);
    state.players.second.board = [cleric];

    engineDispatch(state, {
      type: "EVOLVE",
      player: "second",
      cardUid: cleric.uid,
    });

    const pending = state.pendingTargetEffect!;
    expect(pending.pool?.some((c) => c.uid === superEnemy.uid)).toBe(true);
    expect(pending.pool?.some((c) => c.uid === lloyd.uid)).toBe(false);
    expect(getForcedFirstPicks(pending)).toEqual([]);

    expect(isSelectable(superEnemy.uid)).toBe(true);
    expect(isSelectable(lloyd.uid)).toBe(false);
    expect(validateTargetSelection(state, pending, superEnemy.uid).ok).toBe(
      true,
    );
    expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(false);

    chooseTarget(superEnemy.uid);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(thenBoard("first").some((c) => c.uid === superEnemy.uid)).toBe(
      false,
    );
  });

  it("(b) unfiltered enemy choose: only Lloyd selectable; buddy click refused", () => {
    setupMain(6, { active: "second", secondHand: [ADVENT_ELD_AXE], pp: 2 });
    state.players.second.maxPP = 6;
    const lloyd = placeLloyd("first");
    const buddy = placeFollower(4, 4, "first", "Buddy", "buddy_1");

    whenPlayCard("second", 0);
    const pending = state.pendingTargetEffect!;

    expect(isSelectable(lloyd.uid)).toBe(true);
    expect(isSelectable(buddy.uid)).toBe(false);
    expect(pending.pool?.some((c) => c.uid === buddy.uid)).toBe(false);
    expect(validateTargetSelection(state, pending, buddy.uid).ok).toBe(false);
    expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);

    chooseTarget(lloyd.uid);
    expect(Number(lloyd.defense)).toBe(2);
    expect(Number(buddy.defense)).toBe(4);
  });

  it("(c) either-side choose: enemy Lloyd blocks allied followers (Dark Side)", () => {
    setupMain(6, { active: "second", secondHand: [DARK_SIDE], pp: 2 });
    state.players.second.maxPP = 6;
    const lloyd = placeLloyd("first");
    const ally = placeFollower(2, 2, "second", "Ally", "ally_1");

    whenPlayCard("second", 0);

    const pending = state.pendingTargetEffect!;
    expect(isSelectable(lloyd.uid)).toBe(true);
    expect(isSelectable(ally.uid)).toBe(false);
    expect(validateTargetSelection(state, pending, ally.uid)).toEqual({
      ok: false,
      reason: "Lloyd: only Lloyd can be targeted.",
    });
    expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
  });

  it("(d) select 2 enemy followers: first must be Lloyd, second free", () => {
    setupMain(8, {
      firstHand: [SYLVIA],
      pp: 8,
      superEvo: 1,
      evo: 1,
    });
    const lloyd = placeLloyd("second");
    const buddy = placeFollower(4, 4, "second", "Buddy", "buddy_se");
    setScriptedModePickProvider(() => 0);
    whenPlayCard("first", 0);
    const sylvia = findOnBoard("first", "Sylvia, Garden Executioner")!;

    engineDispatch(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: sylvia.uid,
      mode: "super",
    });

    const pending = state.pendingTargetEffect!;
    expect(pending.selectCount).toBe(2);
    expect(validateTargetSelection(state, pending, buddy.uid)).toEqual({
      ok: false,
      reason: "Lloyd: you must select a Lloyd first.",
    });

    chooseTarget(lloyd.uid);
    expect(state.pendingTargetEffect).toBeDefined();
    const pending2 = state.pendingTargetEffect!;
    expect(validateTargetSelection(state, pending2, buddy.uid).ok).toBe(true);

    chooseTarget(buddy.uid);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(thenBoard("second").length).toBe(0);
  });

  it("(e) two Lloyds: either may be the first pick", () => {
    setupMain(6, { active: "second", secondHand: [ADVENT_ELD_AXE], pp: 2 });
    state.players.second.maxPP = 6;
    const lloydA = placeLloyd("first", "lloyd_a");
    const lloydB = placeLloyd("first", "lloyd_b");

    whenPlayCard("second", 0);
    const pending = state.pendingTargetEffect!;
    expect(getForcedFirstPicks(pending).sort()).toEqual(
      [lloydA.uid, lloydB.uid].sort(),
    );
    expect(validateTargetSelection(state, pending, lloydA.uid).ok).toBe(true);
    expect(validateTargetSelection(state, pending, lloydB.uid).ok).toBe(true);
  });

  it("(f) auto-select path picks Lloyd first when in pool", () => {
    const lloyd = createCard(LLOYD, "board", "first");
    lloyd.uid = "lloyd_auto";
    applyKeywordsFromList(lloyd);
    const buddy = createCard(
      { name: "Buddy", type: "Follower", attack: 4, defense: 4 },
      "board",
      "first",
    );
    buddy.uid = "buddy_auto";
    const pool = [buddy, lloyd];
    const picks = pickRandomTargets(
      pool,
      1,
      createRng(1),
      getForcedFirstPicks({ pool, owner: "second" }),
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]!.uid).toBe(lloyd.uid);
  });

  it("(g) no Lloyd on board: unchanged control", () => {
    setupMain(6, { active: "second", secondHand: [ADVENT_ELD_AXE], pp: 2 });
    state.players.second.maxPP = 6;
    const buddy = placeFollower(4, 4, "first", "Buddy", "buddy_ctrl");

    whenPlayCard("second", 0);
    const pending = state.pendingTargetEffect!;
    expect(getForcedFirstPicks(pending)).toEqual([]);
    expect(validateTargetSelection(state, pending, buddy.uid).ok).toBe(true);
    expect(isSelectable(buddy.uid)).toBe(true);

    chooseTarget(buddy.uid);
    expect(Number(buddy.defense)).toBe(0);
  });

  it("(h) undo → redo across (d) keeps the picks", () => {
    setupMain(8, {
      firstHand: [SYLVIA],
      pp: 8,
      superEvo: 1,
      evo: 1,
    });
    const lloyd = placeLloyd("second");
    const buddy = placeFollower(4, 4, "second", "Buddy", "buddy_hist");
    setScriptedModePickProvider(() => 0);
    whenPlayCard("first", 0);
    const sylvia = findOnBoard("first", "Sylvia, Garden Executioner")!;

    doAction(
      "Super evolve Sylvia",
      () => {
        engineDispatch(state, {
          type: "EVOLVE",
          player: "first",
          cardUid: sylvia.uid,
          mode: "super",
        });
      },
      { op: "super_evolve" },
      { autoRender: false },
    );

    doAction(
      "Pick Lloyd",
      () => chooseTarget(lloyd.uid),
      { op: "choose_target" },
      { autoRender: false },
    );
    doAction(
      "Pick buddy",
      () => chooseTarget(buddy.uid),
      { op: "choose_target" },
      { autoRender: false },
    );

    const afterHash = captureSnapshot();
    expect(thenBoard("second").length).toBe(0);

    engineDispatch(state, { type: "UNDO" });
    engineDispatch(state, { type: "UNDO" });
    engineDispatch(state, { type: "UNDO" });
    expect(state.pendingTargetEffect?.targetUids ?? []).toEqual([]);

    engineDispatch(state, { type: "REDO" });
    engineDispatch(state, { type: "REDO" });
    chooseTarget(lloyd.uid);
    chooseTarget(buddy.uid);
    expect(captureSnapshot()).toEqual(afterHash);
  });

  it("(i) own Lloyd on board: any:follower select does not force own Lloyd or allies", () => {
    setupMain(6, { firstHand: [DARK_SIDE], pp: 2 });
    const ownLloyd = placeLloyd("first", "own_lloyd_i");
    const ally = placeFollower(4, 4, "first", "Ally", "ally_i");
    const enemy = placeFollower(3, 3, "second", "Enemy", "enemy_i");

    whenPlayCard("first", 0);
    const pending = state.pendingTargetEffect!;
    expect(getForcedFirstPicks(pending)).toEqual([]);
    expect(isSelectable(ally.uid)).toBe(true);
    expect(isSelectable(enemy.uid)).toBe(true);
    expect(isSelectable(ownLloyd.uid)).toBe(true);
    expect(validateTargetSelection(state, pending, ally.uid).ok).toBe(true);
    expect(validateTargetSelection(state, pending, enemy.uid).ok).toBe(true);
  });

  it("(ii) own Lloyd on board: ally:follower select (Soul Tuning) does not force", () => {
    setupMain(6, { firstHand: [SOUL_TUNING], pp: 1 });
    const ownLloyd = placeLloyd("first", "own_lloyd_ii");
    const buddy = placeFollower(2, 2, "first", "Buddy", "buddy_ii");

    whenPlayCard("first", 0);
    const pending = state.pendingTargetEffect!;
    expect(getForcedFirstPicks(pending)).toEqual([]);
    expect(isSelectable(ownLloyd.uid)).toBe(true);
    expect(isSelectable(buddy.uid)).toBe(true);
    expect(validateTargetSelection(state, pending, buddy.uid).ok).toBe(true);
    expect(validateTargetSelection(state, pending, ownLloyd.uid).ok).toBe(true);
  });

  it("(iii) both sides Lloyd: any:follower select forces enemy Lloyd only", () => {
    setupMain(6, { firstHand: [DARK_SIDE], pp: 2 });
    const ownLloyd = placeLloyd("first", "own_lloyd_iii");
    const enemyLloyd = placeLloyd("second", "enemy_lloyd_iii");
    placeFollower(3, 3, "second", "Enemy", "enemy_iii");

    whenPlayCard("first", 0);
    const pending = state.pendingTargetEffect!;
    expect(getForcedFirstPicks(pending)).toEqual([enemyLloyd.uid]);
    expect(isSelectable(enemyLloyd.uid)).toBe(true);
    expect(isSelectable(ownLloyd.uid)).toBe(false);
    expect(validateTargetSelection(state, pending, ownLloyd.uid)).toEqual({
      ok: false,
      reason: "Lloyd: only Lloyd can be targeted.",
    });
    expect(validateTargetSelection(state, pending, enemyLloyd.uid).ok).toBe(
      true,
    );
  });
});
