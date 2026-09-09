/**
 * Sincerity of the Dewdrop: first card to transform an amulet into a follower on board.
 * Verifies pool inclusion, result stats, fresh turn state, board bookkeeping, and no spurious leave events.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  deriveCanAttack,
  recomputeAttackFlags,
} from "../../src/logic/core/combat.js";
import { watcherEarth } from "../harness/reactiveTimingMatrix.js";
import "../../src/logic/core/effects/index.js";

const SINCERITY = "10573310";

function allyAmulet(name: string) {
  const c = createCard(
    {
      name,
      type: "Amulet",
      cost: 2,
      hasCountdown: true,
      countdown: 2,
      keywords: [{ name: "Engage", cost: 1, effects: [] }],
    },
    "board",
    "first",
  );
  c.justPlayed = false;
  c.keywordState = { engagedThisTurn: true };
  getBoard(state, "first").push(c);
  return c;
}

function setupBase() {
  resetUidCounter();
  givenGameState({ seed: 10573310, activePlayer: "first", roundCount: 6 })
    .withFirstPP(6, 6)
    .withSecondPP(6, 6)
    .withFirstHand([SINCERITY])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("transform amulet to follower (Sincerity)", () => {
  beforeEach(() => {
    setupBase();
  });

  it("amulet → Imari's Little Buddies: stats, fresh turn state, board slot intact", () => {
    const amulet = allyAmulet("CountdownAmulet");
    const uid = amulet.uid;
    const boardIdx = getBoard(state, "first").indexOf(amulet);
    expect(boardIdx).toBeGreaterThanOrEqual(0);

    whenPlayCard("first", 0);
    resolvePendingTarget(amulet.uid);

    const board = getBoard(state, "first");
    expect(board.length).toBe(1);
    expect(board.every((c) => c != null)).toBe(true);
    const result = board[boardIdx]!;
    expect(result.uid).toBe(uid);
    expect(result.name).toBe("Imari's Little Buddies");
    expect(result.type).toBe("Follower");
    expect(Number(result.attack)).toBe(3);
    expect(Number(result.defense)).toBe(3);
    expect(result.peak_defense).toBe(3);
    expect(result.hasRush).toBe(true);
    expect(result.justPlayed).toBe(true);
    expect(result.hasAttacked).toBe(false);
    expect(result.attacks_left).toBe(1);
    expect(result.hasCountdown).toBeFalsy();
    expect(result.countdown).toBeUndefined();
    expect(result.keywordState?.engagedThisTurn).toBeFalsy();
    recomputeAttackFlags(result);
    expect(result.can_attack).toBe(deriveCanAttack(result));
    expect(result.can_attack).toBe(true);
  }, 60_000);

  it("amulet → follower: no ally_follower_leaves_field or ally_amulet_destroyed", () => {
    const leaveWatcher = createCard(
      {
        name: "LeavePin",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        counters: { earth: 0 },
        triggers: [
          {
            event: "ally_follower_leaves_field",
            source: "board",
            condition: { name: "CountdownAmulet" },
            effects: [
              { op: "counter", action: "add", key: "earth", amount: 1 },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    const amuletWatcher = createCard(
      {
        name: "AmuletPin",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        counters: { earth: 0 },
        triggers: [
          {
            event: "ally_amulet_destroyed",
            source: "board",
            condition: { name: "CountdownAmulet" },
            effects: [
              { op: "counter", action: "add", key: "earth", amount: 1 },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    const amulet = allyAmulet("CountdownAmulet");

    whenPlayCard("first", 0);
    resolvePendingTarget(amulet.uid);

    expect(watcherEarth("first", leaveWatcher.uid)).toBe(0);
    expect(watcherEarth("first", amuletWatcher.uid)).toBe(0);
    expect(
      getBoard(state, "first").find((c) => c.uid === amulet.uid)?.type,
    ).toBe("Follower");
  }, 60_000);
});
