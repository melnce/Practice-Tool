/**
 * Official Cygames Q&A — optional hand-select with empty pool, Burnite crest
 * zero-restore, and simultaneous-lethal ties (7 rulings).
 *
 * Inverse of tests/unit/official-qa-empty-pool.test.ts cluster A NO: play IS legal,
 * optional select is a no-op, remainder resolves with X = 0.
 *
 * Rulings are authoritative; engine disagreements → it.fails titled by expected behaviour.
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
  thenBoard,
  thenPP,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import type { CardInstance, PlayerSlot } from "../../src/core/types/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getWinner,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const RODEO = "10164110";
const BURNITE = "10144110";
const CASSIUS = "10473110";
const BALTO = "10153140";
const ARAGAVY = "10154130";
const TYRANNICAL_FISTS = "10552310";

const AMULET_A = "10161210";
const AMULET_B = "10162210";
const AMULET_C = "10163210";
const AMULET_D = "10162220";
const STRIKER_ARTIFACT = "90072110";
const DARKHAVEN_GRACE = "10162210";
const FILLER = "10111310";

const R5 = 5;
const R6 = 6;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    secondPp?: number;
    hp?: number;
    secondHp?: number;
    evo?: number;
    seed?: number;
    active?: "first" | "second";
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
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHp !== undefined) b = b.withSecondHP(opts.secondHp);
  if (opts.secondPp !== undefined) b = b.withSecondPP(opts.secondPp, max);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = opts.active ?? "first";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

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

function enemyFollower(atk = 2, def = 2, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
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
  handleGainCrest(gain as any, owner);
}

function assertPlayLegalAtBoundary(
  cardId: string,
  ppBefore: number,
  ppCost: number,
): CardInstance {
  const hand = getHand(state, "first");
  const card = hand.find((c) => c.id === cardId)!;
  const idx = hand.indexOf(card);
  expect(canPlayCard(card, "first").ok).toBe(true);
  const outcome = playCardNoRender(hand, "first", idx);
  expect(outcome.kind).not.toBe("blocked");
  expect(thenPP("first")).toBe(ppBefore - ppCost);
  expect(thenHand("first").some((c) => c.id === cardId)).toBe(false);
  return card;
}

/** Active player's own effect lethal on both leaders → active player loses. */
function expectActivePlayerLosesSimultaneousLethal(): void {
  expect(getHP(state, "first")).toBe(0);
  expect(getHP(state, "second")).toBe(0);
  expect(state.phase).toBe("gameover");
  expect(state.winner ?? getWinner(state)).toBe("second");
}

describe("official Q&A — optional select empty pool and simultaneous ties", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  describe("cluster A — optional hand-select with empty pool (play legal, X = 0)", () => {
    it("10164110 Rodeo, Anathema of Judgment — only card in hand: Fanfare summons 3 differently named amulets cost 3 or less (official Q&A: Yes)", () => {
      setupTurn(R8, {
        hand: [RODEO],
        deck: [AMULET_A, AMULET_B, AMULET_C, AMULET_D, FILLER],
        pp: 7,
      });
      const ppBefore = thenPP("first");
      assertPlayLegalAtBoundary(RODEO, ppBefore, 7);
      const amulets = thenBoard("first").filter((c) => c.type === "Amulet");
      expect(amulets.length).toBe(3);
      const names = new Set(amulets.map((c) => c.name));
      expect(names.size).toBe(3);
      expect(amulets.every((c) => Number(c.cost) <= 3)).toBe(true);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10144110 Burnite, Anathema of Flame — only card in hand: Fanfare deals 0 without discarding (official Q&A: Yes)", () => {
      setupTurn(R6, { hand: [BURNITE], pp: 7 });
      const foe = enemyFollower(4, 6);
      const defBefore = Number(foe.defense);
      const ppBefore = thenPP("first");
      assertPlayLegalAtBoundary(BURNITE, ppBefore, 7);
      expect(Number(foe.defense)).toBe(defBefore);
      expect(thenHand("first").length).toBe(0);
      expect(findOnBoard("first", "Burnite, Anathema of Flame")).toBeTruthy();
      expect(state.pendingTargetEffect).toBeFalsy();

      resetUidCounter();
      setupTurn(R6, { hand: [BURNITE, FILLER], pp: 7 });
      const foe2 = enemyFollower(4, 6);
      const filler = getHand(state, "first").find((c) => c.id === FILLER)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(filler.uid);
      expect(Number(foe2.defense)).toBeLessThan(6);
      expect(thenHand("first").some((c) => c.id === FILLER)).toBe(false);
    }, 60_000);

    it("10473110 Cassius, Sky-Yearning Arrival — without Artifact followers in hand Fanfare deals 0; with Artifact X equals attack (official Q&A: Yes)", () => {
      setupTurn(R6, { hand: [CASSIUS], pp: 5 });
      const foe = enemyFollower(2, 6, "Foe");
      const defBefore = Number(foe.defense);
      const ppBefore = thenPP("first");
      assertPlayLegalAtBoundary(CASSIUS, ppBefore, 5);
      expect(Number(foe.defense)).toBe(defBefore);
      expect(state.pendingTargetEffect).toBeFalsy();

      resetUidCounter();
      setupTurn(R6, { hand: [CASSIUS, STRIKER_ARTIFACT], pp: 5 });
      const artifact = getHand(state, "first").find(
        (c) => c.id === STRIKER_ARTIFACT,
      )!;
      const atk = Number(artifact.attack);
      const foe2 = enemyFollower(2, 6, "Foe2");
      whenPlayCard("first", 0);
      resolvePendingByUid(artifact.uid);
      expect(Number(foe2.defense)).toBe(6 - atk);
    }, 60_000);
  });

  describe("cluster B — Burnite crest zero restore", () => {
    it("10144110 Burnite, Anathema of Flame — crest leader_restored fires when defense restored by 0 (official Q&A: Yes, it will)", () => {
      // Mechanic detail: tests/mechanics/leader-restored-fires-on-zero.test.ts
      setupTurn(R6, { secondPp: 2, active: "second" });
      state.players.second.hp = 20;
      state.players.second.maxHP = 20;
      gainCardCrest(BURNITE, "first");

      const grace = createCard(DARKHAVEN_GRACE, "board", "second");
      applyKeywordsFromList(grace);
      const ally = createCard(
        {
          name: "EngageAlly",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        "board",
        "second",
      );
      ally.peak_defense = 1;
      state.players.second.board = [grace, ally];
      state.activePlayer = "second";

      engageAmulet("second", 0);
      resolvePendingByUid(ally.uid);
      expect(getHP(state, "second")).toBe(19);
    }, 60_000);
  });

  describe("cluster C — simultaneous lethal ties (active player loses)", () => {
    it("10153140 Balto, Dusk Bounty Hunter — Crest both leaders at 1 defense: opponent wins game at end of your turn (official Q&A)", () => {
      setupTurn(R6, { hand: [BALTO], pp: 4, hp: 1, secondHp: 1 });
      whenPlayCard("first", 0);
      whenEndTurn();
      expectActivePlayerLosesSimultaneousLethal();
    }, 60_000);

    it("10154130 Aragavy, Eternal Hunter — Evolve both leaders at 3 defense: opponent wins game (official Q&A)", () => {
      setupTurn(R6, { hand: [ARAGAVY], pp: 6, hp: 3, secondHp: 3, evo: 1 });
      whenPlayCard("first", 0);
      const arag = findOnBoard("first", "Aragavy, Eternal Hunter")!;
      whenEvolveSelf(arag, "first", "normal");
      expectActivePlayerLosesSimultaneousLethal();
    }, 60_000);

    it("10552310 Tyrannical Fists — whose leader has lowest defense: both leaders tied 20/20 take 3; unequal 19/20 only yours (official Q&A)", () => {
      setupTurn(R5, {
        hand: [TYRANNICAL_FISTS],
        pp: 2,
        hp: 20,
        secondHp: 20,
      });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(17);
      expect(getHP(state, "second")).toBe(17);

      resetUidCounter();
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
  });
});
