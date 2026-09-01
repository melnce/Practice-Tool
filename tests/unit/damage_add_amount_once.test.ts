/**
 * Stormy Blast — add_amount must apply once on the select→resume path.
 *
 * Spec (printed text): X starts at 2; On Spellboost increase X by 1;
 * select an enemy follower and deal it X damage. Damage = 2 + N.
 *
 * Root cause: handleSelection bakes primary+add into `amount` but still
 * spreads `add_amount` onto pendingTargetEffect.eff; the targeted damage
 * handler then resolveAmountWithOverflow's again → 2+2N.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { resolveAmountWithOverflow } from "../../src/logic/effects/ops/damage/index.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import "../../src/logic/core/effects/index.js";

/** Foresight — draw 1; used to Spellboost Stormy Blast in hand. */
const FILLER = "10031310";
const STORMY_BLAST_IDS = ["10131320", "10831310"] as const;
const ENEMY_DEF = 20;
const R6 = 6;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
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
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function enemyFollower(def: number) {
  const c = createCard(
    { name: "Wall", type: "Follower", cost: 2, attack: 1, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function spellboostCount(card: {
  keywordState?: { spellboostCount?: number };
  spellboostCount?: number;
}) {
  return (
    card.keywordState?.spellboostCount ??
    (card as { spellboostCount?: number }).spellboostCount ??
    0
  );
}

/**
 * Play N× Foresight then Stormy Blast against a 20-def wall.
 */
function playStormyBlastWithBoosts(
  blastId: string,
  n: number,
): { dealt: number; expected: number } {
  const hand = [...Array(n).fill(FILLER), blastId];
  const deck = Array(Math.max(n + 2, 4)).fill(FILLER);
  setupTurn(R6, { hand, pp: 6, deck });
  const wall = enemyFollower(ENEMY_DEF);

  for (let i = 0; i < n; i++) {
    whenPlayCard("first", 0);
  }

  const blast = thenHand("first").find((c) => c.id === blastId)!;
  expect(spellboostCount(blast)).toBe(n);

  whenPlayCard(
    "first",
    thenHand("first").findIndex((c) => c.id === blastId),
  );
  resolveFirstPending();

  const dealt = ENEMY_DEF - Number(wall.defense);
  return { dealt, expected: 2 + n };
}

describe("Stormy Blast — add_amount applied once (2+N)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  for (const blastId of STORMY_BLAST_IDS) {
    describe(`id ${blastId}`, () => {
      for (const n of [0, 1, 2, 3] as const) {
        it(`N=${n}: deals exactly ${2 + n} (not ${2 + 2 * n})`, () => {
          const { dealt, expected } = playStormyBlastWithBoosts(blastId, n);
          expect(dealt).toBe(expected);
        });
      }
    });
  }
});

describe("pending damage bake invariant — add_amount must not ride along", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("after selectable damage opens, stored eff has baked amount and no re-addable add_amount", () => {
    setupTurn(R6, { hand: [FILLER], pp: 6, deck: [FILLER] });
    enemyFollower(ENEMY_DEF);

    // Synthetic selectable damage: amount 2 + add_amount 3 → baked total 5.
    // No card id: pins the handleSelection property directly.
    const source = createCard(
      { name: "Src", type: "Spell", cost: 1 },
      "hand",
      "first",
    );
    runEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          select: 1,
          amount: 2,
          add_amount: 3,
        } as any,
      ],
      "first",
      source,
    );

    const pending = state.pendingTargetEffect;
    expect(pending).toBeTruthy();
    const stored = pending!.eff as {
      amount?: number;
      add_amount?: unknown;
    };

    // Amount already holds the full resolved total.
    expect(Number(stored.amount)).toBe(5);

    // Property: add_amount must not be present to be added again on resume.
    expect(stored.add_amount).toBeUndefined();

    // Resume-path resolver must not inflate past the baked amount.
    expect(
      resolveAmountWithOverflow(stored as any, "first", {
        sourceCard: source,
      }),
    ).toBe(5);
  });

  it("Stormy Blast N=2: pending eff amount is 4 and add_amount is stripped", () => {
    setupTurn(R6, {
      hand: [FILLER, FILLER, "10131320"],
      pp: 6,
      deck: [FILLER, FILLER, FILLER],
    });
    enemyFollower(ENEMY_DEF);

    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const blast = thenHand("first").find((c) => c.id === "10131320")!;
    expect(spellboostCount(blast)).toBe(2);

    whenPlayCard(
      "first",
      thenHand("first").findIndex((c) => c.id === "10131320"),
    );

    const pending = state.pendingTargetEffect;
    expect(pending).toBeTruthy();
    const stored = pending!.eff as {
      amount?: number;
      add_amount?: unknown;
    };
    expect(Number(stored.amount)).toBe(4);
    expect(stored.add_amount).toBeUndefined();
    expect(
      resolveAmountWithOverflow(stored as any, "first", {
        sourceCard: pending!.sourceCard,
      }),
    ).toBe(4);
  });
});
