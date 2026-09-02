/**
 * Enhance semantics unify — real-card proofs through the play path.
 *
 * Covers migration buckets (flag-added / dup-stripped / follower-unchanged),
 * Phalanx replace, Drake Whelp additive, Noel IV multi-tier (owner 2026-08-15),
 * and concatenated-list resume for a base select → Enhance tail.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import {
  getBoard,
  getHand,
  getPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

function setupTurn(
  round: number,
  opts: {
    hand?: Array<string | ReturnType<typeof createCard>>;
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
  if (opts.hand?.length) b = b.withFirstHand(opts.hand as string[]);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
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
  expect(pending).toBeTruthy();
  expect(pending!.poolUids?.length ?? pending!.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

describe("Enhance semantics unify", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  // --- Migration bucket: flag added (instead spells) ---

  describe("10921310 Phalanx — enhance_replaces_base", () => {
    it("base (2 PP): summons exactly 1 Steelclad Knight with Ward", () => {
      setupTurn(6, { hand: ["10921310"], pp: 2 });
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter(
        (c) => c.name === "Steelclad Knight",
      );
      expect(knights).toHaveLength(1);
      expect(knights[0]!.hasWard).toBe(true);
    });

    it("Enhance (6): summons exactly 5 Steelclad Knights with Ward", () => {
      // Board cap is 5, so additive 1+5 and replace 5 both end at 5 knights.
      // Replace-vs-additive for the flag-added bucket is guarded by L'Age d'Or
      // / Splendor / Band of Battle below (not by a JSON flag read here).
      setupTurn(6, { hand: ["10921310"], pp: 6 });
      state.players.first.board = [];
      whenPlayCard("first", 0);
      const knights = thenBoard("first").filter(
        (c) => c.name === "Steelclad Knight",
      );
      expect(knights).toHaveLength(5);
      expect(knights.filter((k) => k.hasWard === true)).toHaveLength(5);
    });
  });

  describe("10923310 L'Age d'Or — flag-added instead (not cap-maskable)", () => {
    it("base (4 PP): summons exactly 1 Flag; deals 2 to all enemy followers", () => {
      setupTurn(6, { hand: ["10923310"], pp: 4 });
      const foe = enemyFollower(2, 6, "Wall");
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Dread Pirate's Flag"),
      ).toHaveLength(1);
      expect(Number(foe.defense)).toBe(4);
    });

    it("Enhance (6): summons exactly 2 Flags; deals 4 once (not 2+4)", () => {
      // Replace → 2 flags, foe 6→2. Additive would be 3 flags and 6→0.
      setupTurn(6, { hand: ["10923310"], pp: 6 });
      const foe = enemyFollower(2, 6, "Wall");
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Dread Pirate's Flag"),
      ).toHaveLength(2);
      expect(Number(foe.defense)).toBe(2);
    });
  });

  describe("10523310 Splendor of the Goldbloom — flag-added instead (hand count)", () => {
    it("base (3 PP): adds exactly 2 Glittering Gold to hand", () => {
      setupTurn(6, { hand: ["10523310"], pp: 3 });
      whenPlayCard("first", 0);
      expect(
        thenHand("first").filter((c) => c.name === "Glittering Gold"),
      ).toHaveLength(2);
    });

    it("Enhance (5): adds exactly 4 Glittering Gold (not 2+4=6)", () => {
      // Spell leaves hand on play; start with only this card so MAX_HAND (9)
      // cannot mask 4 vs 6.
      setupTurn(6, { hand: ["10523310"], pp: 5 });
      whenPlayCard("first", 0);
      expect(
        thenHand("first").filter((c) => c.name === "Glittering Gold"),
      ).toHaveLength(4);
      expect(thenHand("first")).toHaveLength(4);
    });
  });

  // --- Migration bucket: duplication stripped (additive spells) ---

  describe("10941310 Drake Whelp's Tantrum — additive after strip", () => {
    it("base (1 PP): summons exactly 1 Fire Drake Whelp, no damage", () => {
      setupTurn(6, { hand: ["10941310"], pp: 1 });
      const foe = enemyFollower(2, 5, "Wall");
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Fire Drake Whelp"),
      ).toHaveLength(1);
      expect(Number(foe.defense)).toBe(5);
    });

    it("Enhance (3): summons exactly 1 Whelp and deals 3 to a random enemy follower", () => {
      setupTurn(6, { hand: ["10941310"], pp: 3 });
      const foe = enemyFollower(2, 5, "Wall");
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Fire Drake Whelp"),
      ).toHaveLength(1);
      expect(Number(foe.defense)).toBe(2);
    });
  });

  describe("10622310 Majestic Conquest — additive after strip", () => {
    it("base (1 PP): gains crest with countdown 2", () => {
      setupTurn(6, { hand: ["10622310"], pp: 1 });
      whenPlayCard("first", 0);
      const crest = (getCrests(state, "first") || []).find(
        (c) => c.name === "Majestic Conquest",
      );
      expect(crest).toBeTruthy();
      expect(crest!.countdown).toBe(2);
    });

    it("Enhance (3): gains crest then delays by 2 → countdown 4", () => {
      setupTurn(6, { hand: ["10622310"], pp: 3 });
      whenPlayCard("first", 0);
      const crest = (getCrests(state, "first") || []).find(
        (c) => c.name === "Majestic Conquest",
      );
      expect(crest).toBeTruthy();
      expect(crest!.countdown).toBe(4);
    });
  });

  // --- Migration bucket: follower unchanged (additive was already the default) ---
  // Noel IV is load-bearing: base + multiple Enhance tiers in one play.
  // Owner ruling 2026-08-15: "Enhance never suppresses Fanfare unless a card
  // explicitly says so." At 8 PP from hand, Fanfare + Enhance(7) + Enhance(8)
  // all fire → three Fearless Soldiers (Bane, Drain, Storm).

  describe("10624110 Noel IV — follower additive + multi-tier ruling", () => {
    it("base (6 PP): Fanfare only — exactly 1 Fearless Soldier with Bane", () => {
      setupTurn(6, { hand: ["10624110"], pp: 6 });
      whenPlayCard("first", 0);
      const soldiers = getBoard(state, "first").filter(
        (c) => c.name === "Fearless Soldier",
      );
      expect(soldiers).toHaveLength(1);
      expect(soldiers.filter((c) => c.hasBane === true)).toHaveLength(1);
      expect(soldiers.filter((c) => c.hasDrain === true)).toHaveLength(0);
      expect(soldiers.filter((c) => c.hasStorm === true)).toHaveLength(0);
    });

    it("at 7 PP: Fanfare Bane + Enhance(7) Drain — exactly 2 soldiers", () => {
      setupTurn(7, { hand: ["10624110"], pp: 7 });
      whenPlayCard("first", 0);
      const soldiers = getBoard(state, "first").filter(
        (c) => c.name === "Fearless Soldier",
      );
      expect(soldiers).toHaveLength(2);
      expect(soldiers.filter((c) => c.hasBane === true)).toHaveLength(1);
      expect(soldiers.filter((c) => c.hasDrain === true)).toHaveLength(1);
      expect(soldiers.filter((c) => c.hasStorm === true)).toHaveLength(0);
    });

    it("at 8 PP from hand: Fanfare Bane + Enhance(7) Drain + Enhance(8) Storm — exactly 3", () => {
      // Owner 2026-08-15: both Enhance tiers activate; Fanfare also activates
      // when played from hand. Three soldiers, not two.
      setupTurn(8, { hand: ["10624110"], pp: 8 });
      whenPlayCard("first", 0);
      const soldiers = getBoard(state, "first").filter(
        (c) => c.name === "Fearless Soldier",
      );
      expect(soldiers).toHaveLength(3);
      expect(soldiers.filter((c) => c.hasBane === true)).toHaveLength(1);
      expect(soldiers.filter((c) => c.hasDrain === true)).toHaveLength(1);
      expect(soldiers.filter((c) => c.hasStorm === true)).toHaveLength(1);
    });
  });

  // --- Concatenated-list resume (spell path) ---

  describe("spell concatenated list resumes after base select", () => {
    /**
     * No pool Enhance spell has a choosing base clause plus an additive
     * Enhance tail (the closest pool cards — Lingering Threat / L'Age d'Or —
     * say "instead" and therefore replace). Compromise: drive a synthetic
     * spell through the real playCard path with base select-damage then an
     * Enhance draw, proving one runEffects queue resumes across the pause.
     */
    it("base damage select pauses; after resolve, Enhance draw still runs", () => {
      const deckPad = Array.from({ length: 5 }, (_, i) => ({
        name: `Pad${i}`,
        type: "Follower" as const,
        cost: 1,
        attack: 1,
        defense: 1,
      }));
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
        .withFirstPP(5, 5)
        .withFirstDeck(deckPad as any)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const foe = enemyFollower(2, 4, "Target");
      const deckBefore = state.players.first.deck.length;

      const spell = createCard(
        {
          name: "ResumeProbe",
          type: "Spell",
          cost: 2,
          spell: [
            {
              op: "damage",
              target: "enemy:follower",
              amount: 2,
              select: 1,
            },
          ],
          keywords: [
            {
              name: "Enhance",
              cost: 5,
              effects: [
                {
                  op: "draw",
                  source: "deck",
                  count: 1,
                },
              ],
            },
          ],
          // additive — no enhance_replaces_base
        } as any,
        "hand",
        "first",
      );
      state.players.first.hand = [spell];

      const outcome = playCardNoRender(getHand(state, "first"), "first", 0);
      expect(outcome.kind).toBe("paused");
      expect(state.pendingTargetEffect).toBeTruthy();
      // Enhance draw must not have run yet.
      expect(getHand(state, "first").length).toBe(0);
      expect(state.players.first.deck.length).toBe(deckBefore);

      resolveFirstPending();
      expect(Number(foe.defense)).toBe(2);
      // After resume, the concatenated Enhance draw ran.
      expect(getHand(state, "first").length).toBe(1);
      expect(state.players.first.deck.length).toBe(deckBefore - 1);
      expect(getPP(state, "first")).toBe(0); // paid Enhance 5
    });
  });

  // --- Spot-check another flag-added spell at both costs ---

  describe("10222310 Band of Battle Princesses — flag-added instead", () => {
    it("base (2 PP): deals 4 to exactly 1 random enemy follower", () => {
      setupTurn(6, { hand: ["10222310"], pp: 2 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      whenPlayCard("first", 0);
      const damaged = [a, b].filter((c) => Number(c.defense) === 2);
      const untouched = [a, b].filter((c) => Number(c.defense) === 6);
      expect(damaged).toHaveLength(1);
      expect(untouched).toHaveLength(1);
    });

    it("Enhance (4): deals 4 to exactly 3 distinct random enemy followers (not 4)", () => {
      // Four foes: replace hits 3; additive (base+tier) would hit all four.
      setupTurn(6, { hand: ["10222310"], pp: 4 });
      const foes = [
        enemyFollower(2, 6, "A"),
        enemyFollower(2, 6, "B"),
        enemyFollower(2, 6, "C"),
        enemyFollower(2, 6, "D"),
      ];
      whenPlayCard("first", 0);
      const damaged = foes.filter((c) => Number(c.defense) === 2);
      const untouched = foes.filter((c) => Number(c.defense) === 6);
      expect(damaged).toHaveLength(3);
      expect(untouched).toHaveLength(1);
    });
  });
});
