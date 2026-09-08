/**
 * Official Q&A backlog batch 1 — investigation-first pins for weakest block-scoped
 * keyword matches. Each `it` names the card and carries ≥2 Q&A keywords in title+body.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { faithCrestNameForCard } from "../../src/logic/faith/bootstrap.js";
import {
  getBoard,
  getGraveyard,
  getHand,
  getHP,
  getCrests,
  setRally,
} from "../../src/core/playerHelpers.js";
import {
  hasPlayedBaseCostLadder,
  recordPlayedBaseCost,
} from "../../src/logic/core/playedBaseCostHistory.js";
import "../../src/logic/core/effects/index.js";

const LYMAGA = "10214120";
const TRAP = "10911210";
const ADVENT_ELD_SWORD = "10621310";
const FENNIE = "10244120";
const JAILOR = "10901110";
const GILDARIA = "10224110";
const MAY = "10012110";
const LAMRETTA = "10461120";
const GALLEON = "10464110";
const ALABASTER = "10804110";
const FILLER = "10111310";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | Record<string, unknown>>;
    pp?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
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
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck as any);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP !== undefined) b = b.withSecondPP(opts.secondPP, max);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
  owner: "first" | "second" = "second",
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

function allyFollower(
  atk = 1,
  def = 5,
  name = "Ally",
  owner: "first" | "second" = "first",
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

function evolveFollower(
  card: CardInstance,
  owner: "first" | "second",
  mode: "normal" | "super" = "normal",
): void {
  const ps = state.players[owner];
  ps.evoUsedThisTurn = false;
  if (mode === "super") {
    ps.superEvoPoints = Math.max(1, ps.superEvoPoints ?? 0);
    ps.superEvoCharges = Math.max(1, ps.superEvoCharges ?? 0);
  } else {
    ps.evoCharges = Math.max(1, ps.evoCharges ?? 0);
  }
  handleEvolveSelf(card, owner, { mode, spendPoint: true });
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function playCombo3(handIndex: number): void {
  whenPlayCard("first", handIndex);
  whenPlayCard("first", handIndex);
  whenPlayCard("first", handIndex);
}

describe("Official Q&A backlog batch 1", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("10214120 Lymaga, Untamed Wild — each player turn bleed", () => {
    it("10214120 Lymaga — bleed activates at end of each player turn (official Q&A; pin blocked: only keyword 'player')", () => {
      setupTurn(R10, { hand: [LYMAGA], pp: 7 });
      const victim = enemyFollower(2, 5, "Victim");
      whenPlayCard("first", 0);
      const lym = findOnBoard("first", "Lymaga, Untamed Wild")!;
      evolveFollower(lym, "first", "super");
      resolveFirstPending();
      const pending = state.pendingTargetEffect;
      if (pending?.poolUids?.[1]) {
        resolvePendingTarget(String(pending.poolUids[1]));
      } else if (pending?.pool?.[1]) {
        resolvePendingTarget(String(pending.pool[1].uid));
      }
      state.players.second.hp = 20;
      const defBefore = Number(victim.defense);
      whenEndTurn();
      expect(getHP(state, "second")).toBe(19);
      expect(Number(victim.defense)).toBe(defBefore - 2);
      whenEndTurn();
      expect(getHP(state, "second")).toBe(18);
      expect(Number(victim.defense)).toBe(defBefore - 4);
    }, 60_000);
  });

  describe("10911210 Trap in the Woods — multiple Advent Eld Sword summon", () => {
    it("10911210 Trap — only first destroyed when many followers enter via Advent Eld Sword (official Q&A)", () => {
      setupTurn(R6, {
        hand: [TRAP],
        pp: 3,
        secondHand: [ADVENT_ELD_SWORD],
        secondPP: 5,
        active: "first",
      });
      whenPlayCard("first", 0);
      whenEndTurn();
      whenPlayCard("second", 0);
      const soldiers = thenBoard("second").filter(
        (c) => c.name === "Fearless Soldier",
      );
      expect(soldiers.length).toBe(2);
      expect(findOnBoard("first", "Trap in the Woods")).toBeFalsy();
    }, 60_000);
  });

  describe("10244120 Fennie, Prismatic Phoenix — odd-numbered halved rounded", () => {
    it("10244120 Fennie — odd-numbered cost halved rounds up (9 becomes 5) (official Q&A)", () => {
      setupTurn(R6, {
        hand: [FENNIE],
        pp: 8,
        deck: [{ name: "Nine", type: "Spell", cost: 9, attack: 0, defense: 0 }],
      });
      whenPlayCard("first", 0);
      expect(thenDeck("first")[0]!.cost).toBe(5);
    }, 60_000);
  });

  describe("10244120 Fennie — halved again two copies row", () => {
    it("10244120 Fennie — two copies row: deck costs halved again happen (9→5→3) (official Q&A)", () => {
      setupTurn(R6, {
        hand: [FENNIE, FENNIE],
        pp: 16,
        deck: [{ name: "Nine", type: "Spell", cost: 9, attack: 0, defense: 0 }],
      });
      whenPlayCard("first", 0);
      expect(thenDeck("first")[0]!.cost).toBe(5);
      whenPlayCard("first", 0);
      expect(thenDeck("first")[0]!.cost).toBe(3);
    }, 60_000);
  });

  describe("10904110 Zerael — accelerated Jailor of Antiquity base cost", () => {
    it("10904110 Zerael — accelerated Jailor of Antiquity base cost is 1 (official Q&A)", () => {
      setupTurn(R6, { hand: [JAILOR], pp: 1 });
      enemyFollower(2, 5);
      expect(playCardNoRender(getHand(state, "first"), "first", 0).kind).toBe(
        "done",
      );
      const gy = getGraveyard(state, "first").find((c) => c.id === JAILOR)!;
      expect(Number(gy.base_cost)).toBe(1);
      expect(Number(gy.cost)).toBe(1);
      expect(gy.type).toBe("Spell");
      for (let c = 2; c <= 8; c++) recordPlayedBaseCost(state, "first", c);
      expect(
        hasPlayedBaseCostLadder(state, "first", [1, 2, 3, 4, 5, 6, 7, 8]),
      ).toBe(true);
    }, 60_000);
  });

  describe("10224110 Gildaria — rally unlike combo increases enters", () => {
    it("10224110 Gildaria — Rally 19 Fanfare does not super-evolve (unlike Combo, rally increases after enter) (official Q&A)", () => {
      setupTurn(R7, { hand: [GILDARIA], pp: 6 });
      setRally(state, "first", 19);
      state.players.first.superEvoPoints = 1;
      whenPlayCard("first", 0);
      const gild = findOnBoard("first", "Gildaria, Anathema of Peace")!;
      expect(gild.evoType).not.toBe("super");
      expect(state.players.first.rally).toBe(20);
    }, 60_000);

    it("10012110 May — Combo 2→3: played card counts unlike Rally (Gildaria contrast)", () => {
      setupTurn(R6, { hand: [FILLER, FILLER, MAY], pp: 6 });
      const foe = enemyFollower(2, 5, "ComboTarget");
      foe.uid = "may_target";
      playCombo3(0);
      expect(state.pendingTargetEffect).toBeDefined();
      resolvePendingTarget("may_target");
      expect(findOnBoard("first", "May, Journey Elf")).toBeTruthy();
      expect(Number(foe.defense)).toBe(2);
    }, 60_000);
  });

  describe("10461120 Lamretta — Galleon Earth Personified end of turn", () => {
    it("10461120 Lamretta — Galleon Earth Personified EOT evolve: no 2 damage to all followers (official Q&A)", () => {
      setupTurn(R8);
      const lam = createCard(LAMRETTA, "board", "first");
      lam.peak_defense = lam.defense;
      lam.hasEvolved = false;
      const galleon = createCard(GALLEON, "board", "first");
      applyKeywordsFromList(galleon);
      galleon.peak_defense = galleon.defense;
      const ally = allyFollower(1, 5, "AllyVictim");
      const foe = enemyFollower(3, 5, "EnemyVictim");
      state.players.first.board = [galleon, lam];

      runEndOfTurnBoundary("first");

      expect(lam.hasEvolved).toBe(true);
      expect(Number(ally.defense)).toBe(5);
      expect(Number(foe.defense)).toBe(5);
    }, 60_000);
  });

  describe("10804110 Alabaster Bahamut — option 3 banish faiths", () => {
    it("10804110 Alabaster Bahamut — option 3 banish faiths doesn't banish faith (official Q&A)", () => {
      setupTurn(R10, { hand: [ALABASTER], pp: 10 });
      handleGainCrest(
        { op: "crest", action: "gain", name: "Probe Crest" } as any,
        "first",
      );
      const faithName = faithCrestNameForCard("Sathanid, Eld Lance");
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: faithName,
          is_faith: true,
        } as any,
        "first",
      );
      setScriptedModePickProvider(() => [2]);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(
        getCrests(state, "first").some((c) => c.name === "Probe Crest"),
      ).toBe(false);
      expect(getCrests(state, "first").some((c) => c.name === faithName)).toBe(
        true,
      );
    }, 60_000);
  });
});
