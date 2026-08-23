/**
 * Honest playable glow + blocked-play history integrity.
 * Reproduces owner report: Spilling Red glowing green vs Aura-only board.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { computeHandGlow } from "../../src/ui/helpers/glow.js";
import {
  getCachedCanPlay,
  resetGlowPreflightCache,
} from "../../src/ui/helpers/glowPreflightCache.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { playCard } from "../../src/logic/core/playCard/index.js";
import {
  canUndo,
  undo,
  resetHistory,
  isInAction,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { getHand, getPP } from "../../src/core/playerHelpers.js";
import { previewHandStats } from "../../src/helpers/enhance.js";
import "../../src/logic/core/effects/index.js";

const SPILLING_RED_SPEC = {
  id: "10642310",
  name: "Spilling Red",
  type: "Spell" as const,
  cost: 1,
  spell: [
    { op: "discard", mode: "select", count: 1 },
    { op: "destroy", target: "enemy:follower", select: 1 },
  ],
};

const FILLER_SPEC = {
  name: "Filler Follower",
  type: "Follower" as const,
  cost: 1,
  attack: 1,
  defense: 1,
};

function auraEnemyFollower() {
  return createCard(
    {
      id: "10644110",
      name: "Sagatsumatsu, Fair Beheader",
      type: "Follower",
      cost: 7,
      attack: 5,
      defense: 4,
      hasAura: true,
    },
    "board",
    "second",
  );
}

function glowCtx(
  card: ReturnType<typeof createCard>,
  owner: "first" | "second" = "first",
) {
  const availablePP =
    owner === "first" ? state.players.first.pp : state.players.second.pp;
  const preview = previewHandStats(card, availablePP);
  return {
    state,
    owner,
    isPlayersTurn: state.activePlayer === owner,
    availablePP,
    isSpell: card.type === "Spell",
    tier: preview.tier,
    alternate: preview.alternate,
    shownCost: preview.shownCost,
  };
}

function setupSpillingRedBoard(opts: {
  enemyHasAura?: boolean;
  extraEnemy?: boolean;
  pp?: number;
}) {
  resetUidCounter();
  resetHistory();
  resetGlowPreflightCache();
  setHistoryEnabled(true);

  givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
    .withFirstHand([SPILLING_RED_SPEC, FILLER_SPEC])
    .withFirstPP(opts.pp ?? 10, 10)
    .build();

  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";

  const enemy = auraEnemyFollower();
  if (opts.enemyHasAura === false) {
    enemy.hasAura = false;
  }
  state.players.second.board = [enemy];

  if (opts.extraEnemy) {
    const plain = createCard(FILLER_SPEC, "board", "second");
    plain.hasAura = false;
    state.players.second.board.push(plain);
  }
}

describe("Honest playable glow — Spilling Red vs Aura", () => {
  beforeEach(() => {
    resetGlowPreflightCache();
  });

  it("only Aura enemy: no green glow, preflight blocked, play refused with reason", () => {
    setupSpillingRedBoard({ enemyHasAura: true });
    const spilling = getHand(state, "first").find((c) => c.id === "10642310")!;

    const preflight = canPlayCard(spilling, "first");
    expect(preflight.ok).toBe(false);
    if (!preflight.ok) {
      expect(preflight.reason).toMatch(/target/i);
    }

    const glow = computeHandGlow(spilling, glowCtx(spilling));
    expect(glow.glowClass).toBeNull();
    expect(glow.blockedReason).toMatch(/target/i);

    const outcome = whenPlayCard(
      "first",
      getHand(state, "first").indexOf(spilling),
    );
    expect(outcome.kind).toBe("blocked");
    if (outcome.kind === "blocked") {
      expect(outcome.reason).toMatch(/target/i);
    }
  });

  it("non-Aura enemy present: green glow and play proceeds", () => {
    setupSpillingRedBoard({ enemyHasAura: true, extraEnemy: true });
    const spilling = getHand(state, "first").find((c) => c.id === "10642310")!;

    expect(canPlayCard(spilling, "first").ok).toBe(true);

    const glow = computeHandGlow(spilling, glowCtx(spilling));
    expect(glow.glowClass).toBe("playable-glow");
    expect(glow.blockedReason).toBeUndefined();

    const outcome = whenPlayCard(
      "first",
      getHand(state, "first").indexOf(spilling),
    );
    expect(outcome.kind === "paused" || outcome.kind === "done").toBe(true);
  });

  it("unaffordable card: no glow, blocked reason mentions PP", () => {
    setupSpillingRedBoard({ enemyHasAura: true, extraEnemy: true, pp: 0 });
    const spilling = getHand(state, "first").find((c) => c.id === "10642310")!;

    const glow = computeHandGlow(spilling, glowCtx(spilling));
    expect(glow.glowClass).toBeNull();
    expect(glow.blockedReason).toMatch(/pp/i);
  });
});

describe("Blocked plays must not corrupt undo history", () => {
  beforeEach(() => {
    setHistoryEnabled(true);
    resetHistory();
    resetGlowPreflightCache();
  });

  it("20 illegal Spilling Red attempts: history unchanged, one undo after legal play", () => {
    setupSpillingRedBoard({ enemyHasAura: true });

    const hand = getHand(state, "first");
    const fillerIdx = hand.findIndex((c) => c.name === "Filler Follower");
    const handLenBefore = hand.length;

    const ppBefore = getPP(state, "first");

    const legal = playCard(hand, "first", fillerIdx);
    expect(legal.kind === "done" || legal.kind === "paused").toBe(true);
    expect(canUndo()).toBe(true);
    expect(isInAction()).toBe(false);

    const ppAfterLegal = getPP(state, "first");
    const handLenAfterLegal = getHand(state, "first").length;
    expect(handLenAfterLegal).toBe(handLenBefore - 1);

    const handAfterLegal = getHand(state, "first");
    const spillingIndex = handAfterLegal.findIndex((c) => c.id === "10642310");
    for (let i = 0; i < 20; i++) {
      const outcome = playCard(handAfterLegal, "first", spillingIndex);
      expect(outcome.kind).toBe("blocked");
      expect(state.pendingTargetEffect ?? null).toBeNull();
      expect(isInAction()).toBe(false);
    }

    expect(getPP(state, "first")).toBe(ppAfterLegal);
    expect(getHand(state, "first").length).toBe(handLenAfterLegal);
    expect(canUndo()).toBe(true);

    const undone = undo({ autoRender: false });
    expect(undone).toBe(true);
    expect(getPP(state, "first")).toBe(ppBefore);
    expect(getHand(state, "first").length).toBe(handLenBefore);
    expect(canUndo()).toBe(false);
  });
});

describe("Glow preflight cache performance", () => {
  it("10-card hand: cached preflight is fast enough for per-render use", () => {
    resetUidCounter();
    resetGlowPreflightCache();
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(
        Array.from({ length: 10 }, (_, i) =>
          i % 2 === 0 ? SPILLING_RED_SPEC : FILLER_SPEC,
        ),
      )
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const hand = getHand(state, "first");

    const iterations = 200;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      resetGlowPreflightCache();
      for (const card of hand) {
        getCachedCanPlay(card, "first");
      }
    }
    const uncachedMs = performance.now() - start;

    const startCached = performance.now();
    for (let i = 0; i < iterations; i++) {
      resetGlowPreflightCache();
      for (const card of hand) {
        getCachedCanPlay(card, "first");
      }
      for (const card of hand) {
        getCachedCanPlay(card, "first");
      }
    }
    const cachedMs = performance.now() - startCached;

    console.log(
      `[glow-preflight-bench] 10-card hand x${iterations}: uncached=${uncachedMs.toFixed(1)}ms cached-2pass=${cachedMs.toFixed(1)}ms`,
    );

    expect(cachedMs).toBeLessThan(50);
    const perPassMs = cachedMs / iterations / 2;
    expect(perPassMs).toBeLessThan(5);
  });
});
