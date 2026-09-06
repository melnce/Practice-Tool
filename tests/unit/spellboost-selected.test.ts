/**
 * Spellboost target:"selected" — Radiant Rainbow / Key Spirit real-card coverage
 * plus ally:hand / self / empty-selected regressions for the unified handler.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleSpellboost } from "../../src/logic/effects/ops/spellboost/unified.js";
import { getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";
import type { CardInstance } from "../../src/core/types/index.js";

const R6 = 6;
const R8 = 8;
/** Foresight — draw 1, no targets. */
const FILLER = "10031310";
/** Stormy Blast — On Spellboost spell. */
const STORMY_BLAST = "10131320";
/** Radiant Rainbow */
const RADIANT_RAINBOW = "10131310";
/** Key Spirit */
const KEY_SPIRIT = "10931120";
/** Ms. Miranda — Fanfare: spellboost ally:hand once */
const MS_MIRANDA = "10132110";
/** Emmylou — On Spellboost follower */
const EMMYLOU = "10132120";

function sbCount(card: CardInstance | undefined | null): number {
  if (!card) return 0;
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
    pp?: number;
    deck?: string[];
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
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

describe("Radiant Rainbow 10131310 — spellboost selected + draw", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("casts, spellboosts the chosen On-Spellboost card by 1, and draws", () => {
    // Two On-Spellboost cards: casting a spell auto-boosts both (+1 each);
    // Radiant's select effect must add one more to the chosen card only.
    setupTurn(R6, {
      hand: [RADIANT_RAINBOW, STORMY_BLAST, EMMYLOU],
      pp: 2,
      deck: [FILLER],
    });

    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const emmylou = thenHand("first").find((c) => c.id === EMMYLOU)!;
    const blast0 = sbCount(blast);
    const emmylou0 = sbCount(emmylou);
    const deckBefore = thenDeck("first").length;

    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeTruthy();
    resolvePendingTarget(blast.uid);

    expect(sbCount(blast)).toBe(blast0 + 2); // play trigger + Radiant effect
    expect(sbCount(emmylou)).toBe(emmylou0 + 1); // play trigger only
    expect(sbCount(blast) - sbCount(emmylou)).toBe(1); // effect contribution
    expect(thenDeck("first").length).toBe(deckBefore - 1);
    expect(thenHand("first").some((c) => c.id === RADIANT_RAINBOW)).toBe(false);
    expect(thenHand("first").some((c) => c.id === STORMY_BLAST)).toBe(true);
  });
});

describe("Key Spirit 10931120 — Evolve spellboosts selected 4 times", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("evolve: selected On-Spellboost card gains +4; other hand cards unchanged", () => {
    setupTurn(R8, {
      hand: [KEY_SPIRIT, STORMY_BLAST, FILLER],
      pp: 7,
    });

    // Play Key Spirit (Fanfare needs an enemy follower target).
    const foe = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 10 },
      "board",
      "second",
    );
    state.players.second.board = [foe];
    whenPlayCard("first", 0);
    resolveFirstPending();

    const spirit = findOnBoard("first", "Key Spirit")!;
    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const filler = thenHand("first").find((c) => c.id === FILLER)!;
    const blast0 = sbCount(blast);
    const filler0 = sbCount(filler);

    state.players.first.evoCharges = 2;
    whenEvolve(spirit, "first");
    expect(state.pendingTargetEffect).toBeTruthy();
    resolvePendingTarget(blast.uid);

    expect(sbCount(blast)).toBe(blast0 + 4);
    expect(sbCount(filler)).toBe(filler0);
  });
});

describe("spellboost target selected — empty / regressions", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("target:selected with no targetUids boosts nothing (not hand, not source)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand([STORMY_BLAST, FILLER])
      .withFirstPP(6, 6)
      .build();

    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const filler = thenHand("first").find((c) => c.id === FILLER)!;
    const blast0 = sbCount(blast);
    const filler0 = sbCount(filler);

    // Source with Spellboost so a mistaken self/hand fallback would be visible.
    const source = createCard(STORMY_BLAST, "board", "first");
    applyKeywordsFromList(source);
    const source0 = sbCount(source);

    handleSpellboost(
      { op: "spellboost", target: "selected", count: 4 } as any,
      "first",
      source,
      {},
    );

    expect(sbCount(blast)).toBe(blast0);
    expect(sbCount(filler)).toBe(filler0);
    expect(sbCount(source)).toBe(source0);

    handleSpellboost(
      { op: "spellboost", target: "selected", count: 4 } as any,
      "first",
      source,
      { targetUids: [] },
    );

    expect(sbCount(blast)).toBe(blast0);
    expect(sbCount(filler)).toBe(filler0);
    expect(sbCount(source)).toBe(source0);
  });

  it("target:ally:hand still boosts the whole hand (Ms. Miranda)", () => {
    setupTurn(R6, {
      hand: [MS_MIRANDA, STORMY_BLAST, EMMYLOU],
      pp: 2,
    });

    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const emmylou = thenHand("first").find((c) => c.id === EMMYLOU)!;
    const blast0 = sbCount(blast);
    const emmylou0 = sbCount(emmylou);

    whenPlayCard("first", 0);

    expect(sbCount(blast)).toBe(blast0 + 1);
    expect(sbCount(emmylou)).toBe(emmylou0 + 1);
  });

  it("target:self still boosts the source card and honours count", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 }).build();

    const source = createCard(STORMY_BLAST, "hand", "first");
    applyKeywordsFromList(source);
    getHand(state, "first").push(source);

    const other = createCard(EMMYLOU, "hand", "first");
    applyKeywordsFromList(other);
    getHand(state, "first").push(other);

    const source0 = sbCount(source);
    const other0 = sbCount(other);

    handleSpellboost(
      { op: "spellboost", target: "self", count: 3 } as any,
      "first",
      source,
      {},
    );

    expect(sbCount(source)).toBe(source0 + 3);
    expect(sbCount(other)).toBe(other0);
  });
});
