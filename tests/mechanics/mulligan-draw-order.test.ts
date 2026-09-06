/**
 * Mulligan replacements must be drawn before swapped cards return to the deck.
 * Client behaviour: set aside → draw from remainder → shuffle swapped cards back.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "./setup.js";
import { state } from "../../src/core/gameState.js";
import { startNewGame, dispatch } from "../../src/engine.js";
import { createCard } from "../harness/builders.js";
import { getHand, getDeck } from "../../src/core/playerHelpers.js";
import type { CardInstance, PlayerSlot } from "../../src/core/types/index.js";

const SEED_COUNT = 200;
const BASE_SEED = 900_001;

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

function markMulliganSelectable(owner: PlayerSlot): void {
  getHand(state, owner).forEach((c) => {
    (c as any).__mulliganSelectable = true;
    (c as any).__mulliganSelected = false;
  });
  if (owner === "first") state.mulliganFirstSelected = new Set();
  else state.mulliganSecondSelected = new Set();
}

function installDistinctDeck(
  owner: PlayerSlot,
  count: number,
  prefix: string,
): CardInstance[] {
  const specs = Array.from({ length: count }, (_, i) => ({
    name: `${prefix}_name_${i}`,
    id: `${prefix}_id_${i}`,
    uid: `${prefix}_uid_${i}`,
    type: "Follower" as const,
    cost: 1,
    attack: 1,
    defense: 1,
  }));
  const hand = specs.slice(0, 4).map((s) => createCard(s, "hand", owner));
  const deck = specs.slice(4).map((s) => createCard(s, "deck", owner));
  state.players[owner].hand = hand;
  state.players[owner].deck = deck;
  markMulliganSelectable(owner);
  return hand;
}

async function startMulligan(seed: number): Promise<void> {
  await startNewGame({
    deckAId: "aggro_abysscraft",
    deckBId: "spell_runecraft",
    seed,
  });
  expect(state.phase).toBe("mulligan");
  expect(state.mulliganStage).toBe("first");
}

function toggle(dispatchUids: string[]) {
  for (const uid of dispatchUids) {
    dispatch(state, { type: "TOGGLE_MULLIGAN", player: "first", cardUid: uid });
  }
}

function confirmFirst() {
  dispatch(state, { type: "CONFIRM_MULLIGAN", player: "first" });
}

describe("mulligan draw order", () => {
  it("full four-card mulligan never redraws the same uid (40 distinct cards)", async () => {
    let gamesWithReturnedUid = 0;

    for (let i = 0; i < SEED_COUNT; i++) {
      const seed = BASE_SEED + i;
      await startMulligan(seed);
      const openingHand = installDistinctDeck("first", 40, `distinct_${seed}`);
      const swappedUids = openingHand.map((c) => c.uid);

      toggle(swappedUids);
      confirmFirst();

      const postUids = new Set(getHand(state, "first").map((c) => c.uid));
      if (swappedUids.some((uid) => postUids.has(uid))) {
        gamesWithReturnedUid++;
      }
    }

    expect(gamesWithReturnedUid).toBe(0);
  }, 60_000);

  it("duplicate name: swapped uid never returns; another copy can return", async () => {
    const TRIPLET_ID = "triplet_shared_id";
    const TRIPLET_NAME = "Triplet Shared Card";
    let swappedUidReturned = 0;
    let duplicateNameReturned = 0;

    for (let i = 0; i < SEED_COUNT; i++) {
      const seed = BASE_SEED + 10_000 + i;
      await startMulligan(seed);

      const tripletUids = ["tri_a", "tri_b"] as const;
      const tripletCopies = tripletUids.map((uid) =>
        createCard(
          {
            name: TRIPLET_NAME,
            id: TRIPLET_ID,
            uid,
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 1,
          },
          "deck",
          "first",
        ),
      );

      const fillers = Array.from({ length: 37 }, (_, j) =>
        createCard(
          {
            name: `Filler_${seed}_${j}`,
            id: `filler_${seed}_${j}`,
            uid: `filler_uid_${seed}_${j}`,
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 1,
          },
          "deck",
          "first",
        ),
      );

      const swappedCopy = createCard(
        {
          name: TRIPLET_NAME,
          id: TRIPLET_ID,
          uid: "tri_hand",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        "hand",
        "first",
      );

      state.players.first.hand = [
        swappedCopy,
        fillers[0]!,
        fillers[1]!,
        fillers[2]!,
      ].map((c) => ({ ...c, zone: "hand" as const }));
      // drawCard pops from the deck end (top); place triplet copies there.
      state.players.first.deck = [...fillers.slice(3), ...tripletCopies].map(
        (c) => ({ ...c, zone: "deck" as const }),
      );
      markMulliganSelectable("first");

      toggle([swappedCopy.uid]);
      confirmFirst();

      const postHand = getHand(state, "first");
      if (postHand.some((c) => c.uid === swappedCopy.uid)) swappedUidReturned++;
      if (
        postHand.some(
          (c) => c.name === TRIPLET_NAME && c.uid !== swappedCopy.uid,
        )
      ) {
        duplicateNameReturned++;
      }
    }

    expect(swappedUidReturned).toBe(0);
    expect(duplicateNameReturned).toBeGreaterThan(0);
  }, 60_000);

  it("keeping all four does not draw or shuffle the deck", async () => {
    await startMulligan(777001);
    installDistinctDeck("first", 40, "keep_all");
    const deckSnapshot = getDeck(state, "first").map((c) => c.uid);

    confirmFirst();

    expect(getDeck(state, "first").map((c) => c.uid)).toEqual(deckSnapshot);
    expect(getHand(state, "first")).toHaveLength(4);
    expect(state.mulliganStage).toBe("second");
  }, 60_000);

  it("swapping when the deck is smaller than the swap count draws what exists", async () => {
    await startMulligan(777002);
    installDistinctDeck("first", 6, "tiny_deck");
    const swappedUids = getHand(state, "first").map((c) => c.uid);

    toggle(swappedUids);
    confirmFirst();

    expect(getHand(state, "first")).toHaveLength(2);
    expect(
      swappedUids.every(
        (uid) => !getHand(state, "first").some((c) => c.uid === uid),
      ),
    ).toBe(true);
  }, 60_000);
});
