/**
 * Regression: targeted stat resume must route through the shared buff applier.
 *
 * The pending-target resume handler for op:"stat" must fire self_buffed_up,
 * emit buff logs, honour duration/attacks_per_turn, and not double-fire
 * enemy_follower_defense_down.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  whenEndTurn,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHP,
  thenBoard,
} from "../harness/builders.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { state } from "../../src/core/gameState.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { flushDeferredDeathBatch } from "../../src/logic/core/cleanup.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const RUFLET = "10812110";
const IAN = "10121110";
const KNIGHT = "10361120";
const FAIRY = "90011110";
const KRULLE = "10314110";
const R6 = 6;
const PAD_DECK = Array.from({ length: 20 }, () => "10111310");

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[]; hp?: number } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(pp, max)
    .withFirstDeck(opts.deck ?? PAD_DECK)
    .withSecondDeck(PAD_DECK);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function allyFollower(atk: number, name = "Bystander", def = atk) {
  const c = createCard(
    { name, type: "Follower", cost: 1, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function buffLogsFor(uid: string) {
  return getLogs().filter(
    (e) => e.type === "buff" && String(e.details?.uid) === uid,
  );
}

describe("stat targeted resume — shared applier contract", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
    (globalThis as any).HEADLESS = false;
  });

  describe("self_buffed_up on chosen target", () => {
    it("Ruflet + Ian Lovebound Knight summons exactly one Fairy", () => {
      setupTurn(R6, { hand: [IAN], pp: 3 });
      const ruflet = createCard(RUFLET, "board", "first");
      ruflet.peak_defense = Number(ruflet.defense);
      applyKeywordsFromList(ruflet);
      state.players.first.board = [ruflet];

      whenPlayCard("first", 0);
      resolvePendingTarget(String(ruflet.uid));

      const fairies = thenBoard("first").filter((c) => c.id === FAIRY);
      expect(fairies).toHaveLength(1);
    }, 60_000);

    it("Knight of the Holy Order restores exactly 1 leader defense when buffed via select", () => {
      setupTurn(R6, { hp: 18 });
      const knight = createCard(KNIGHT, "board", "first");
      knight.peak_defense = Number(knight.defense);
      applyKeywordsFromList(knight);
      state.players.first.board = [knight];

      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "ally:follower",
            select: 1,
            attack: 1,
            defense: 1,
          },
        ],
        "first",
      );
      resolvePendingTarget(String(knight.uid));

      expect(thenHP("first")).toBe(19);
    }, 60_000);
  });

  describe("buff log event", () => {
    it("emits buff log with pooled-route shape after targeted resume", () => {
      setupTurn(R6);
      const ally = allyFollower(2, "Ally", 2);

      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "ally:follower",
            select: 1,
            attack: 2,
            defense: 1,
          },
        ],
        "first",
      );
      resolvePendingTarget(String(ally.uid));

      const logs = buffLogsFor(String(ally.uid));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.details).toMatchObject({
        owner: "first",
        target: "Ally",
        uid: ally.uid,
        a: 2,
        d: 1,
        mode: "all",
      });
    }, 60_000);
  });

  describe("until_end_of_turn on chosen target", () => {
    it("temporary buff from targeted resume expires at end of turn", () => {
      setupTurn(R6);
      const ally = allyFollower(2, "TempAlly", 2);

      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "ally:follower",
            select: 1,
            attack: 3,
            until_end_of_turn: true,
          },
        ],
        "first",
      );
      resolvePendingTarget(String(ally.uid));

      expect(Number(ally.attack)).toBe(5);
      expect(ally.temporaryBuffs?.length).toBeGreaterThan(0);
      runEndOfTurnBoundary("first");
      expect(Number(ally.attack)).toBe(2);
      expect(ally.temporaryBuffs?.length ?? 0).toBe(0);
    }, 60_000);
  });

  describe("attacks_per_turn on chosen target", () => {
    it("applies attacks_per_turn from targeted resume", () => {
      setupTurn(R6);
      const ally = allyFollower(2, "MultiAtk", 2);

      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "ally:follower",
            select: 1,
            attack: 0,
            attacks_per_turn: 2,
          },
        ],
        "first",
      );
      resolvePendingTarget(String(ally.uid));

      expect(ally.attacks_per_turn).toBe(2);
      const logs = getLogs().filter(
        (e) => e.type === "attacksPerTurn" && e.details?.owner === "first",
      );
      expect(logs).toHaveLength(1);
      expect(logs[0]!.details).toMatchObject({
        owner: "first",
        target: "MultiAtk",
        uid: ally.uid,
        value: 2,
      });
    }, 60_000);
  });

  describe("enemy_follower_defense_down — single fire", () => {
    it("targeted debuff fires enemy_follower_defense_down exactly once (Krulle)", () => {
      setupTurn(R6, { hp: 18 });
      const krulle = createCard(KRULLE, "board", "first");
      krulle.peak_defense = Number(krulle.defense);
      applyKeywordsFromList(krulle);
      state.players.first.board = [krulle];
      const victim = enemyFollower(2, 4, "Victim");

      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "enemy:follower",
            select: 1,
            defense: -2,
          },
        ],
        "first",
      );
      resolvePendingTarget(String(victim.uid));
      flushDeferredDeathBatch();

      expect(thenHP("first")).toBe(19);
    }, 60_000);
  });

  describe("internal attack may go negative (rulebook L611)", () => {
    it("targeted-resume debuff stores negative attack; combat deals 0; +3 buff yields 1", () => {
      setupTurn(R6);
      const card = createCard(
        { name: "Debuff", type: "Follower", cost: 2, attack: 5, defense: 5 },
        "board",
        "first",
      );
      card.peak_defense = 5;
      const foe = createCard(
        { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 10 },
        "board",
        "second",
      );
      foe.peak_defense = 10;
      state.players.first.board = [card];
      state.players.second.board = [foe];

      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "ally:follower",
            select: 1,
            attack: -7,
          },
        ],
        "first",
      );
      resolvePendingTarget(String(card.uid));
      expect(Number(card.attack)).toBe(-2);

      card.can_attack = true;
      attackFollower(0, 0, "first", "second");
      expect(Number(foe.defense)).toBe(10);

      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "ally:follower",
            select: 1,
            attack: 3,
          },
        ],
        "first",
      );
      resolvePendingTarget(String(card.uid));
      expect(Number(card.attack)).toBe(1);
    }, 60_000);
  });
});
