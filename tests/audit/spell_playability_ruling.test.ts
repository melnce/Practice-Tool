/**
 * Owner ruling (2026-08-16): A spell with a mandatory "Select …" clause requires at
 * least one legal target to be playable — no target means the spell cannot be played
 * (dead card in hand). Followers and amulets with such clauses stay playable; the
 * clause fizzles. Named example: Radiant Rainbow (10131310) is unplayable without
 * an On-Spellboost card in hand.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
  thenDeck,
  thenPP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getHand } from "../../src/core/playerHelpers.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
/** Foresight — draw 1, no Spellboost keyword. */
const NON_SPELLBOOST_FILLER = "10031310";

function setupTurn(
  round: number,
  opts: {
    hand?: (string | object)[];
    pp?: number;
    deck?: (string | object)[];
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
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function enemyFollower(def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function rainbowInHand() {
  return thenHand("first").find((c) => c.id === "10131310")!;
}

describe("Owner ruling — spell playability vs follower/amulet select fizzle", () => {
  beforeEach(() => resetUidCounter());

  describe("Radiant Rainbow (10131310) — dead without On-Spellboost hand target", () => {
    it("with a non-Spellboost card only: preflight blocked, play blocked, card stays in hand, PP unspent", () => {
      setupTurn(R6, { hand: ["10131310", NON_SPELLBOOST_FILLER], pp: 2 });
      const rainbow = rainbowInHand();
      const ppBefore = thenPP("first");

      const preflight = canPlayCard(rainbow, "first");
      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.reason).toMatch(/spellboost/i);
      }

      const outcome = whenPlayCard(
        "first",
        getHand(state, "first").indexOf(rainbow),
      );
      expect(outcome.kind).toBe("blocked");
      if (outcome.kind === "blocked") {
        expect(outcome.reason).toMatch(/spellboost/i);
      }
      expect(thenHand("first").some((c) => c.id === "10131310")).toBe(true);
      expect(thenPP("first")).toBe(ppBefore);
    });

    it("two Radiant Rainbows and nothing else: still blocked (Rainbow lacks Spellboost keyword)", () => {
      setupTurn(R6, { hand: ["10131310", "10131310"], pp: 4 });
      const rainbow = rainbowInHand();
      const ppBefore = thenPP("first");

      const preflight = canPlayCard(rainbow, "first");
      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.reason).toMatch(/spellboost/i);
      }

      const outcome = whenPlayCard(
        "first",
        getHand(state, "first").indexOf(rainbow),
      );
      expect(outcome.kind).toBe("blocked");
      expect(thenHand("first").filter((c) => c.id === "10131310").length).toBe(
        2,
      );
      expect(thenPP("first")).toBe(ppBefore);
    });
  });

  describe("Radiant Rainbow (10131310) — live with On-Spellboost target", () => {
    it("with Stormy Blast in hand: playable, mandatory select, spellboosts target and draws 1", () => {
      setupTurn(R6, {
        hand: ["10131310", "10131320"],
        pp: 2,
        deck: ["10031310"],
      });
      const rainbow = rainbowInHand();
      const blast = thenHand("first").find((c) => c.id === "10131320")!;
      const count0 =
        blast.keywordState?.spellboostCount ??
        (blast as { spellboostCount?: number }).spellboostCount ??
        0;
      const deckBefore = thenDeck("first").length;

      expect(canPlayCard(rainbow, "first").ok).toBe(true);

      const outcome = whenPlayCard(
        "first",
        getHand(state, "first").indexOf(rainbow),
      );
      expect(outcome.kind).toBe("paused");
      expect(state.pendingTargetEffect).toBeTruthy();

      resolveFirstPending();

      const count1 =
        blast.keywordState?.spellboostCount ??
        (blast as { spellboostCount?: number }).spellboostCount ??
        0;
      expect(count1).toBeGreaterThan(count0);
      expect(thenDeck("first").length).toBe(deckBefore - 1);
      expect(thenHand("first").some((c) => c.id === "10131320")).toBe(true);
      expect(thenHand("first").some((c) => c.id === "10131310")).toBe(false);
    });
  });

  describe("Stormy Blast (10131320) — generic field-select spell", () => {
    it("empty enemy board: blocked at preflight and play, PP unspent", () => {
      setupTurn(R6, { hand: ["10131320"], pp: 1 });
      const blast = thenHand("first").find((c) => c.id === "10131320")!;
      const ppBefore = thenPP("first");

      const preflight = canPlayCard(blast, "first");
      expect(preflight.ok).toBe(false);
      if (!preflight.ok) {
        expect(preflight.reason).toMatch(/target/i);
      }

      const outcome = whenPlayCard(
        "first",
        getHand(state, "first").indexOf(blast),
      );
      expect(outcome.kind).toBe("blocked");
      if (outcome.kind === "blocked") {
        expect(outcome.reason).toMatch(/target/i);
      }
      expect(thenHand("first").some((c) => c.id === "10131320")).toBe(true);
      expect(thenPP("first")).toBe(ppBefore);
    });

    it("with an enemy follower: plays and deals 2 damage (X starts at 2)", () => {
      setupTurn(R6, { hand: ["10131320"], pp: 1 });
      const blast = thenHand("first").find((c) => c.id === "10131320")!;
      const foe = enemyFollower(4);

      expect(canPlayCard(blast, "first").ok).toBe(true);
      whenPlayCard("first", getHand(state, "first").indexOf(blast));
      resolveFirstPending();
      expect(foe.defense).toBe(2);
      expect(thenHand("first").some((c) => c.id === "10131320")).toBe(false);
    });
  });

  describe("Supplicant of Destruction (10372110) — follower contrast", () => {
    it("no other allied card: plays successfully; destroy/damage chain fizzles", () => {
      setupTurn(R6, { hand: ["10372110"], pp: 2 });
      const foe = enemyFollower(5);
      const ppBefore = thenPP("first");

      expect(canPlayCard(getHand(state, "first")[0]!, "first").ok).toBe(true);

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("done");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Supplicant of Destruction")).toBeDefined();
      expect(thenPP("first")).toBe(ppBefore - 2);
      expect(Number(foe.defense)).toBe(5);
    });
  });

  // Wasteland of Destruction (10372210) no-target fizzle: select_forced_ruling.test.ts
  describe("Amulet contrast — select fizzles on play, spell would be blocked", () => {
    it("Earrings of Sunlight (10761210) alone in hand: plays; hand return fizzles, still draws 1", () => {
      setupTurn(R6, {
        hand: ["10761210"],
        pp: 1,
        deck: [
          { name: "Drawn", type: "Follower", cost: 1, attack: 1, defense: 1 },
        ],
      });
      const deckBefore = thenDeck("first").length;

      expect(canPlayCard(getHand(state, "first")[0]!, "first").ok).toBe(true);

      const outcome = whenPlayCard("first", 0);
      expect(outcome.kind).toBe("done");
      expect(state.pendingTargetEffect).toBeFalsy();
      expect(findOnBoard("first", "Earrings of Sunlight")).toBeDefined();
      expect(thenDeck("first").length).toBe(deckBefore - 1);
      expect(thenHand("first").some((c) => c.name === "Drawn")).toBe(true);
    });
  });

  describe("Accelerate-as-spell scan", () => {
    it.skip("no Accelerate in card pool has mandatory select on spell-form effects (scanned cards/all.json)", () => {
      // Pool scan (2026-08-16): 7 Accelerate cards; none have select/select_count on
      // Accelerate keyword effects. Case 6 skipped — see PR description.
    });
  });
});
