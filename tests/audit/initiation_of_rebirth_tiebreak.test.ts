/**
 * Owner ruling 2026-09-02 — Initiation of Rebirth (`10901310`) highest-base-cost ties.
 *
 * Printed: "Add a copy of a random allied follower destroyed this match with the
 * highest base cost …". Owner: "it says random highest cost so that means if some
 * are tied pick randomly between them."
 *
 * Pins the real play path (not pickDestroyedMatchHighestBaseCost directly):
 *   1. Never the cheaper corpse — every seed picks one of the two tied names.
 *   2. Both tied candidates are reachable — exact seed→name map measured below.
 *
 * Seeds chosen empirically (probe 0..79 via this same harness path, 2026-09-02):
 *   seed 0 → Battleforged Dragon Keeper (10042120)
 *   seed 1 → Battleforged Dragon Keeper (10042120)
 *   seed 5 → Mecha Cavalier (10072120)
 *   seed 8 → Mecha Cavalier (10072120)
 * Hard-coded because the harness RNG is seeded; the list is measured, not hopeful.
 *
 * Sabotage (red-before / green-after), 2026-09-02:
 *   Replace `top[state.rng.nextInt(top.length)]` with `top[0]` in
 *   pickDestroyedMatchHighestBaseCost → assertion 2 FAILED (seed 5 expected
 *   Mecha Cavalier, received Battleforged Dragon Keeper); assertion 1 stayed
 *   green (still never the cheap corpse). Restored with
 *   `git checkout -- src/logic/core/destroyedHistory.ts`; porcelain clean for
 *   that path.
 *
 * Gates (measured after docs+tests landed; no engine changes):
 *   npm run check — Success (audit 1037 passed / 1 skipped; unit 773 passed;
 *     eslint 0 errors / 21 pre-existing warnings).
 *   npm run cards:verify — OK, zero movement vs baseline (did not run baseline).
 *   npm run test:all — 24 failed | 1905 passed | 1 skipped (known-red still 24).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenDeck,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import "../../src/logic/core/effects/index.js";

const REBIRTH = "10901310";
const CHEAP = "10001110"; // Indomitable Fighter — base cost 2
const TIED_A = "10042120"; // Battleforged Dragon Keeper — base cost 5
const TIED_B = "10072120"; // Mecha Cavalier — base cost 5
const FILLER = "10111310";

const TIED_A_NAME = "Battleforged Dragon Keeper";
const TIED_B_NAME = "Mecha Cavalier";
const CHEAP_NAME = "Indomitable Fighter";

/** Measured seed → expected tied name (see file header). */
const SEED_EXPECTATIONS: ReadonlyArray<{ seed: number; name: string }> = [
  { seed: 0, name: TIED_A_NAME },
  { seed: 1, name: TIED_A_NAME },
  { seed: 5, name: TIED_B_NAME },
  { seed: 8, name: TIED_B_NAME },
];

function playRebirthWithTiedHistory(seed: number): {
  addedName: string;
  cheapCount: number;
} {
  resetUidCounter();
  givenGameState({ seed, activePlayer: "first", roundCount: 5 })
    .withFirstPP(2, 5)
    .withFirstHand([REBIRTH])
    .withFirstDeck([FILLER, FILLER, FILLER])
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";

  const cheap = createCard(CHEAP, "board", "first");
  const tiedA = createCard(TIED_A, "board", "first");
  const tiedB = createCard(TIED_B, "board", "first");
  recordDestroyed(state, "first", cheap);
  recordDestroyed(state, "first", tiedA);
  recordDestroyed(state, "first", tiedB);

  const outcome = whenPlayCard("first", 0);
  expect(outcome.kind).toBe("done");

  const zones = thenDeck("first").concat(thenHand("first"));
  const cheapCount = zones.filter((c) => c.name === CHEAP_NAME).length;
  const tiedCopies = zones.filter(
    (c) => c.name === TIED_A_NAME || c.name === TIED_B_NAME,
  );
  expect(tiedCopies.length).toBe(1);
  return {
    addedName: tiedCopies[0]!.name,
    cheapCount,
  };
}

describe("Owner ruling 2026-09-02 — Initiation of Rebirth highest-base-cost ties", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("never adds the cheaper destroyed follower (across measured seeds)", () => {
    for (const { seed } of SEED_EXPECTATIONS) {
      const { addedName, cheapCount } = playRebirthWithTiedHistory(seed);
      expect(cheapCount).toBe(0);
      // Membership without pinning which tied name (that is the next test).
      if (addedName !== TIED_A_NAME) {
        expect(addedName).toBe(TIED_B_NAME);
      } else {
        expect(addedName).toBe(TIED_A_NAME);
      }
    }
  });

  it("both tied highest-cost candidates are reachable (exact seed→name map)", () => {
    const picks: string[] = [];
    for (const { seed, name } of SEED_EXPECTATIONS) {
      const { addedName } = playRebirthWithTiedHistory(seed);
      expect(addedName).toBe(name);
      picks.push(addedName);
    }
    // Exact coverage counts from the measured four-seed list (2 + 2).
    expect(picks.filter((n) => n === TIED_A_NAME).length).toBe(2);
    expect(picks.filter((n) => n === TIED_B_NAME).length).toBe(2);
  });
});
