/**
 * Official Cygames Q&A regression tests — Abysscraft batch 4.
 * Assertions follow official answers; owner rulings override when noted in docs/owner-rulings.md.
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
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import type { CardInstance, PlayerSlot } from "../../src/core/types/index.js";
import {
  getBoard,
  getHP,
  getPP,
  getShadows,
  getCrests,
  getModeBonus,
  getWinner,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const CHAOS_CYCLONE = "10051310";
const SOUL_PREDATION = "10052310";
const TYRANNICAL_FISTS = "10552310";
const MILTEO = "10554110";
const MINO = "10152110";
const VLAD = "10152140";
const ORTHRUS = "10153120";
const MUKAN = "10153130";
const GHOST_JUGGLER = "10151140";
const BALTO = "10153140";
const RAGE_OF_SERPENTS = "10153310";
const MEDUSA = "10154120";
const ARAGAVY = "10154130";
const VUELLA = "10252110";
const SHAM_NACHA = "10354110";
const SCREAMING_LOATHING = "10353310";
const OLIVIA = "10104110";
const ARRIET = "10002110";
const ROTTING_ZOMBIE = "90051140";
const MIMI = "90054110";
const COCO = "90054120";
const OMINOUS_GAMMA = "90073130";
const REANIMATE_COST2 = "10151120"; // cost 2 — legal Reanimate (2) target
const DEPARTED_CORPSE = "10151130"; // Little Miss Bonemancer — positive control without Bane

const FAITH_CREST = "Faith: Sham-Nacha, Heir to Entwining";
const FILLER = "10151110";
const DRAW_TOP = "10051120";
const DRAW_SECOND = "10051110";

const R5 = 5;
const R6 = 6;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    evo?: number;
    hp?: number;
    secondHp?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
    board?: string[];
    shadows?: number;
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
  if (opts.board?.length) b = b.withFirstBoard(opts.board);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHp !== undefined) b = b.withSecondHP(opts.secondHp);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  b.build();
  if (opts.shadows !== undefined) state.players.first.shadows = opts.shadows;
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

/** Real EVOLVE / SUPER-EVOLVE path (stats + script); not `onEvolve` from evolveUtils. */
function whenEvolveSelf(
  card: CardInstance,
  owner: PlayerSlot,
  mode: "normal" | "super" = "normal",
): void {
  if (mode === "super") {
    state.players[owner].superEvoCharges = Math.max(
      1,
      state.players[owner].superEvoCharges,
    );
    state.players[owner].superEvoPoints = Math.max(
      1,
      state.players[owner].superEvoPoints ?? 0,
    );
  } else {
    state.players[owner].evoCharges = Math.max(
      1,
      state.players[owner].evoCharges,
    );
  }
  state.players[owner].evoUsedThisTurn = false;
  handleEvolveSelf(card, owner, { mode, spendPoint: true });
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

function readyAttacker(
  card: ReturnType<typeof createCard>,
  owner: "first" | "second" = "first",
): number {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
  return getBoard(state, owner).indexOf(card);
}

function putDestroyedCorpse(id: string, owner: "first" | "second" = "first") {
  const c = createCard(id, "board", owner);
  c.peak_defense = Number(c.defense) || 1;
  state.players[owner].board.push(c);
  c.defense = 0;
  cleanupDead();
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function bootstrapFaithCrest(initialFaith = 0) {
  handleGainCrest(
    {
      op: "crest",
      action: "gain",
      name: FAITH_CREST,
      counters: { faith: initialFaith },
      triggers: [
        {
          event: "select_mode",
          condition: { own_turn: true },
          effects: [
            {
              op: "crest",
              action: "add_counter",
              crest: FAITH_CREST,
              counter: "faith",
              amount: 1,
            },
          ],
        },
      ],
    } as any,
    "first",
  );
}

function faithCount(): number {
  const c = getCrests(state, "first").find((x) => x.name === FAITH_CREST);
  return Number(c?.counters?.faith ?? 0);
}

function grantMilteoCrest() {
  setupTurn(R8, { hand: [MILTEO], pp: 7 });
  whenPlayCard("first", 0);
  const milteo = findOnBoard("first", "Milteo & Luzen")!;
  whenEvolveSelf(milteo, "first", "super");
  expect(getCrests(state, "first").some((c) => c.name.includes("Milteo"))).toBe(
    true,
  );
}

describe("official Q&A — Abysscraft batch 4", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
    (globalThis as any).HEADLESS = true;
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  it("10051310 Chaos Cyclone — Mode 2 legal with no Reanimate targets; nothing happens (official Q&A)", () => {
    setupTurn(R5, { hand: [CHAOS_CYCLONE], pp: 2 });
    const boardBefore = thenBoard("first").length;
    const handBefore = thenHand("first").length;
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    expect(thenBoard("first").length).toBe(boardBefore);
    expect(thenHand("first").length).toBe(handBefore - 1);

    resetUidCounter();
    setupTurn(R5, {
      hand: [CHAOS_CYCLONE],
      pp: 2,
      deck: [FILLER, REANIMATE_COST2],
    });
    putDestroyedCorpse(REANIMATE_COST2);
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.id === REANIMATE_COST2)).toBe(true);
  }, 60_000);

  it("10052310 Soul Predation — can target super-evolved ally; not destroyed but draws 2 (official Q&A)", () => {
    setupTurn(R8, {
      hand: [SOUL_PREDATION],
      deck: [FILLER, DRAW_SECOND, DRAW_TOP],
      pp: 2,
    });
    const target = allyFollower("SuperAlly", 3, 3);
    whenEvolveSelf(target, "first", "super");
    expect(target.evoType).toBe("super");
    const defBefore = Number(target.defense);
    whenPlayCard("first", 0);
    resolvePendingByUid(target.uid);
    expect(getBoard(state, "first").some((c) => c.uid === target.uid)).toBe(
      true,
    );
    expect(Number(target.defense)).toBe(defBefore);
    expect(handIds()).toContain(DRAW_TOP);
    expect(handIds()).toContain(DRAW_SECOND);

    resetUidCounter();
    setupTurn(R6, {
      hand: [SOUL_PREDATION],
      deck: [FILLER, DRAW_SECOND, DRAW_TOP],
      pp: 2,
    });
    const normal = allyFollower("NormalAlly", 2, 2);
    whenPlayCard("first", 0);
    resolvePendingByUid(normal.uid);
    expect(getBoard(state, "first").some((c) => c.uid === normal.uid)).toBe(
      false,
    );
  }, 60_000);

  it("10552310 Tyrannical Fists — your leader at 19 vs opponent 20 takes 3 (official Q&A)", () => {
    setupTurn(R5, {
      hand: [TYRANNICAL_FISTS],
      pp: 2,
      hp: 19,
      secondHp: 20,
    });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(16);
    expect(getHP(state, "second")).toBe(20);
  }, 60_000);

  it("10552310 Tyrannical Fists — tied lowest defense hits both leaders for 3 (official Q&A)", () => {
    setupTurn(R5, {
      hand: [TYRANNICAL_FISTS],
      pp: 2,
      hp: 20,
      secondHp: 20,
    });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(17);
    expect(getHP(state, "second")).toBe(17);
  }, 60_000);

  it("10554110 Milteo & Luzen — Mino Enhance (4) suppressed; 2 PP spent with 4 PP available (official Q&A)", () => {
    grantMilteoCrest();
    state.players.first.pp = 4;
    state.players.first.hand.push(createCard(MINO, "hand", "first"));
    whenPlayCard("first", 0);
    const mino = findOnBoard("first", "Mino, Shrewd Reaper")!;
    expect(getPP(state, "first")).toBe(2);
    expect(mino.hasBane).toBeFalsy();
    expect(mino.hasEvolved).toBe(true);

    resetUidCounter();
    setupTurn(R6, { hand: [MINO], pp: 4 });
    whenPlayCard("first", 0);
    const minoNormal = findOnBoard("first", "Mino, Shrewd Reaper")!;
    expect(getPP(state, "first")).toBe(0);
    expect(minoNormal.hasRush).toBe(true);
    expect(minoNormal.hasBane).toBe(true);
  }, 60_000);

  it("10152140 Vlad, Impaler — Fanfare restores 5 even with no enemy followers (official Q&A)", () => {
    setupTurn(R8, { hand: [VLAD], pp: 8, hp: 10 });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(15);

    resetUidCounter();
    setupTurn(R8, { hand: [VLAD], pp: 8, hp: 10 });
    const foe = enemyFollower(2, 5);
    whenPlayCard("first", 0);
    resolvePendingByUid(foe.uid);
    expect(Number(foe.defense)).toBe(0);
    expect(getHP(state, "first")).toBe(15);
  }, 60_000);

  it("10153120 Orthrus, Hellhound Blader — Evolve consumes 4 shadows with no enemy followers (official Q&A)", () => {
    setupTurn(R6, { hand: [ORTHRUS], pp: 3, shadows: 4 });
    whenPlayCard("first", 0);
    expect(getShadows(state, "first")).toBe(6);
    const orth = findOnBoard("first", "Orthrus, Hellhound Blader")!;
    whenEvolveSelf(orth, "first", "normal");
    expect(getShadows(state, "first")).toBe(2);
    expect(getBoard(state, "second")).toHaveLength(0);

    resetUidCounter();
    setupTurn(R6, { hand: [ORTHRUS], pp: 3, shadows: 4 });
    whenPlayCard("first", 0);
    enemyFollower(2, 5);
    const orth2 = findOnBoard("first", "Orthrus, Hellhound Blader")!;
    whenEvolveSelf(orth2, "first", "normal");
    expect(Number(getBoard(state, "second")[0]!.defense)).toBe(1);
  }, 60_000);

  it("10153130 Mukan, Shadowcrypt Ward — reanimated by Ghost Juggler gains Bane (official Q&A)", () => {
    setupTurn(R8, { hand: [GHOST_JUGGLER], pp: 7 });
    putDestroyedCorpse(MUKAN);
    whenPlayCard("first", 0);
    const mukan = findOnBoard("first", "Mukan, Shadowcrypt Ward")!;
    expect(mukan.hasBane).toBe(true);

    resetUidCounter();
    setupTurn(R8, { hand: [GHOST_JUGGLER], pp: 7 });
    putDestroyedCorpse(DEPARTED_CORPSE);
    whenPlayCard("first", 0);
    const bonemancer = findOnBoard("first", "Little Miss Bonemancer")!;
    expect(bonemancer.hasBane).toBeFalsy();
  }, 60_000);

  it.fails(
    "10153140 Balto, Dusk Bounty Hunter — both leaders at 1: opponent wins at end of your turn (official Q&A)",
    () => {
      setupTurn(R6, { hand: [BALTO], pp: 4, hp: 1, secondHp: 1 });
      whenPlayCard("first", 0);
      whenEndTurn();
      expect(getHP(state, "first")).toBe(0);
      expect(getHP(state, "second")).toBe(0);
      expect(getWinner(state)).toBe("second");
      expect(state.phase).toBe("gameover");
    },
    60_000,
  );

  it.fails(
    "10153310 Rage of Serpents — both leaders at 2, enemy leader selected: you win (official Q&A)",
    () => {
      setupTurn(R6, { hand: [RAGE_OF_SERPENTS], pp: 3, hp: 2, secondHp: 2 });
      enemyFollower(1, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid("leader");
      expect(getHP(state, "second")).toBe(0);
      expect(getHP(state, "first")).toBe(0);
      expect(getWinner(state)).toBe("first");
      expect(state.phase).toBe("gameover");
    },
    60_000,
  );

  it("10154120 Medusa, Venomfang Royalty — super-evolve destroy ping fires after Follower Strike kill (official Q&A)", () => {
    setupTurn(R8, { hand: [MEDUSA], pp: 8, secondHp: 20 });
    const foe = enemyFollower(1, 3);
    whenPlayCard("first", 0);
    const medusa = findOnBoard("first", "Medusa, Venomfang Royalty")!;
    whenEvolveSelf(medusa, "first", "super");
    const hpBefore = getHP(state, "second");
    const atkIdx = readyAttacker(medusa);
    attackFollower(atkIdx, 0, "first", "second");
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getHP(state, "second")).toBe(hpBefore - 1);

    resetUidCounter();
    setupTurn(R8, { hand: [MEDUSA], pp: 8, secondHp: 20 });
    enemyFollower(1, 3);
    whenPlayCard("first", 0);
    const medusaEvo = findOnBoard("first", "Medusa, Venomfang Royalty")!;
    whenEvolveSelf(medusaEvo, "first", "normal");
    const hpEvoBefore = getHP(state, "second");
    const idx = readyAttacker(medusaEvo);
    attackFollower(idx, 0, "first", "second");
    expect(getHP(state, "second")).toBe(hpEvoBefore);
  }, 60_000);

  it("10154130 Aragavy, Eternal Hunter — split 7 oldest-first: 3/3/2 defenses take 3, 3, 1 (official Q&A)", () => {
    setupTurn(R6, { hand: [ARAGAVY], pp: 6 });
    const oldest = enemyFollower(1, 3, "Oldest");
    const middle = enemyFollower(1, 3, "Middle");
    const newest = enemyFollower(1, 2, "Newest");
    whenPlayCard("first", 0);
    expect(Number(oldest.defense)).toBe(0);
    expect(Number(middle.defense)).toBe(0);
    expect(Number(newest.defense)).toBe(1);
    expect(getBoard(state, "second")).toHaveLength(1);
  }, 60_000);

  it.fails(
    "10154130 Aragavy, Eternal Hunter — Evolve at 3/3 leaders: opponent wins (official Q&A)",
    () => {
      setupTurn(R6, { hand: [ARAGAVY], pp: 6, hp: 3, secondHp: 3 });
      whenPlayCard("first", 0);
      const arag = findOnBoard("first", "Aragavy, Eternal Hunter")!;
      whenEvolveSelf(arag, "first", "normal");
      expect(getHP(state, "first")).toBe(0);
      expect(getHP(state, "second")).toBe(0);
      expect(getWinner(state)).toBe("second");
      expect(state.phase).toBe("gameover");
    },
    60_000,
  );

  it("10252110 Vuella, the Blastwing — Olivia super-evolves Arriet: Vuella 6, Olivia 9, Arriet 8 attack (official Q&A)", () => {
    setupTurn(R10, { hand: [OLIVIA], pp: 10 });
    const vuella = createCard(VUELLA, "board", "first");
    applyKeywordsFromList(vuella);
    vuella.peak_defense = vuella.defense;
    const arriet = createCard(ARRIET, "board", "first");
    applyKeywordsFromList(arriet);
    arriet.peak_defense = arriet.defense;
    state.players.first.board = [vuella, arriet];
    whenPlayCard("first", 0);
    const olivia = findOnBoard("first", "Olivia, Heroic Dark Angel")!;
    whenEvolveSelf(olivia, "first", "super");
    resolvePendingByUid(arriet.uid);
    expect(Number(vuella.attack)).toBe(6);
    expect(Number(olivia.attack)).toBe(9);
    expect(Number(arriet.attack)).toBe(8);
  }, 60_000);

  it("10354110 Sham-Nacha, Heir to Entwining — Fanfare twice increases selectable Modes by 2 (official Q&A)", () => {
    setupTurn(R6, { hand: [SHAM_NACHA, SHAM_NACHA], pp: 6 });
    bootstrapFaithCrest();
    getCrests(state, "first")[0]!.counters = { faith: 10 };
    whenPlayCard("first", 0);
    expect(faithCount()).toBe(0);
    expect(getModeBonus(state, "first")).toBe(1);
    getCrests(state, "first")[0]!.counters = { faith: 10 };
    whenPlayCard("first", 0);
    expect(faithCount()).toBe(0);
    expect(getModeBonus(state, "first")).toBe(2);
  }, 60_000);

  it("10354110 Sham-Nacha, Heir to Entwining — Screaming and Loathing 2 Modes adds only 1 faith (official Q&A)", () => {
    setupTurn(R6, { hand: [SCREAMING_LOATHING], pp: 3 });
    bootstrapFaithCrest();
    getCrests(state, "first")[0]!.counters = { faith: 0 };
    setScriptedModePickProvider(() => [0, 1]);
    whenPlayCard("first", 0);
    expect(faithCount()).toBe(1);

    resetUidCounter();
    setupTurn(R6, { hand: [SCREAMING_LOATHING], pp: 3 });
    bootstrapFaithCrest();
    getCrests(state, "first")[0]!.counters = { faith: 0 };
    setScriptedModePickProvider(() => [0]);
    whenPlayCard("first", 0);
    expect(faithCount()).toBe(1);
  }, 60_000);

  it("90051140 Rotting Zombie — twin Ominous Artifact γ EOT resolve before Last Words summon (official Q&A)", () => {
    setupTurn(R6, { hand: [ROTTING_ZOMBIE], pp: 3 });
    whenPlayCard("first", 0);
    const original = findOnBoard("first", "Rotting Zombie")!;
    const originalUid = original.uid;
    whenEndTurn();

    state.activePlayer = "second";
    state.players.second.hand.push(
      createCard(OMINOUS_GAMMA, "hand", "second"),
      createCard(OMINOUS_GAMMA, "hand", "second"),
    );
    state.players.second.pp = 10;
    whenPlayCard("second", 0);
    whenPlayCard("second", 0);
    whenEndTurn();

    const lwZombies = thenBoard("first").filter(
      (c) => c.id === ROTTING_ZOMBIE && c.uid !== originalUid,
    );
    expect(lwZombies).toHaveLength(1);
    expect(Number(lwZombies[0]!.defense)).toBe(2);
    expect(getBoard(state, "first").some((c) => c.uid === originalUid)).toBe(
      false,
    );

    resetUidCounter();
    setupTurn(R6, { hand: [ROTTING_ZOMBIE], pp: 3 });
    whenPlayCard("first", 0);
    const lone = findOnBoard("first", "Rotting Zombie")!;
    const gamma = createCard(OMINOUS_GAMMA, "board", "second");
    gamma.peak_defense = gamma.defense;
    state.players.second.board.push(gamma);
    lone.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter((c) => c.id === ROTTING_ZOMBIE),
    ).toHaveLength(1);
  }, 60_000);

  it("90054110 Mimi, Right Paw Hellhound — super-evolve kill at 1/1 leaders: you win (official Q&A)", () => {
    setupTurn(R6, {
      secondHand: [MIMI],
      secondPP: 6,
      pp: 6,
      hp: 1,
      secondHp: 1,
      active: "second",
    });
    whenPlayCard("second", 0);
    whenEndTurn();
    const attacker = allyFollower("SuperAttacker", 5, 5);
    whenEvolveSelf(attacker, "first", "super");
    const mimi = findOnBoard("second", "Mimi, Right Paw Hellhound")!;
    const atkIdx = readyAttacker(attacker);
    const mimiIdx = getBoard(state, "second").indexOf(mimi);
    attackFollower(atkIdx, mimiIdx, "first", "second");
    expect(getWinner(state)).toBe("first");
    expect(state.phase).toBe("gameover");

    resetUidCounter();
    setupTurn(R6, {
      secondHand: [MIMI],
      secondPP: 6,
      pp: 6,
      hp: 1,
      secondHp: 1,
      active: "second",
    });
    whenPlayCard("second", 0);
    whenEndTurn();
    const normal = allyFollower("NormalAttacker", 5, 5);
    whenEvolveSelf(normal, "first", "normal");
    const mimi2 = findOnBoard("second", "Mimi, Right Paw Hellhound")!;
    const idx = readyAttacker(normal);
    const mimiIdx2 = getBoard(state, "second").indexOf(mimi2);
    attackFollower(idx, mimiIdx2, "first", "second");
    expect(getWinner(state)).toBe("second");
    expect(getHP(state, "first")).toBe(0);
  }, 60_000);

  it("90054120 Coco, Left Paw Hellhound — super-evolve kill at enemy 1 HP: you win before Last Words heal (official Q&A)", () => {
    setupTurn(R6, {
      secondHand: [COCO],
      secondPP: 6,
      pp: 6,
      hp: 20,
      secondHp: 1,
      active: "second",
    });
    whenPlayCard("second", 0);
    whenEndTurn();
    const attacker = allyFollower("SuperAttacker", 5, 5);
    whenEvolveSelf(attacker, "first", "super");
    const coco = findOnBoard("second", "Coco, Left Paw Hellhound")!;
    const atkIdx = readyAttacker(attacker);
    const cocoIdx = getBoard(state, "second").indexOf(coco);
    attackFollower(atkIdx, cocoIdx, "first", "second");
    expect(getWinner(state)).toBe("first");
    expect(state.phase).toBe("gameover");
    expect(getHP(state, "second")).toBe(0);

    resetUidCounter();
    setupTurn(R6, {
      secondHand: [COCO],
      secondPP: 6,
      pp: 6,
      hp: 20,
      secondHp: 1,
      active: "second",
    });
    whenPlayCard("second", 0);
    whenEndTurn();
    const normal = allyFollower("NormalAttacker", 5, 5);
    whenEvolveSelf(normal, "first", "normal");
    const coco2 = findOnBoard("second", "Coco, Left Paw Hellhound")!;
    const idx = readyAttacker(normal);
    const cocoIdx2 = getBoard(state, "second").indexOf(coco2);
    attackFollower(idx, cocoIdx2, "first", "second");
    expect(getWinner(state)).toBeNull();
    expect(getHP(state, "second")).toBe(3);
  }, 60_000);
});
