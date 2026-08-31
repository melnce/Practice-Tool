/**
 * Flat transform + into_source:"enemy:deck" + select — pending hand selection.
 * Encroached World (10602210) after Family 3 flatten.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { getBoard, getDeck, getHand } from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { clearLogs, setConsoleMirroring } from "../../src/core/logger.js";
import "../../src/logic/core/effects/index.js";

setConsoleMirroring(false);

const ENCROACHED = "10602210";

function setup(seed = 1, round = 4): void {
  givenGameState({ seed, activePlayer: "first", roundCount: round })
    .withFirstPP(Math.min(round, 10), Math.min(round, 10))
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function playAndEngageEncroached(): number {
  state.players.first.hand = [createCard(ENCROACHED, "hand", "first")];
  whenPlayCard("first", 0);
  const amuletIdx = getBoard(state, "first").findIndex(
    (c) => c.name === "Encroached World",
  );
  expect(amuletIdx).toBeGreaterThanOrEqual(0);
  return amuletIdx;
}

describe("flat transform into_source enemy:deck + select", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
  });

  it("authored flat form on Encroached World (10602210)", () => {
    const card = getCardById(ENCROACHED)!;
    const engage = card.keywords?.find((k: any) => k.name === "Engage");
    expect(engage?.effects).toEqual([
      {
        op: "transform",
        target: "ally:hand",
        select: 1,
        into_source: "enemy:deck",
      },
    ]);
  });

  it("Engage opens pending selection over hand; nothing transforms until pick", () => {
    setup(1, 4);
    const amuletIdx = playAndEngageEncroached();

    const first = createCard(
      { name: "First", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    const second = createCard(
      { name: "Second", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "hand",
      "first",
    );
    const third = createCard(
      { name: "Third", type: "Spell", cost: 3 },
      "hand",
      "first",
    );
    state.players.first.hand = [first, second, third];

    const stolen = createCard(
      { name: "Stolen", type: "Follower", cost: 6, attack: 4, defense: 4 },
      "deck",
      "second",
    );
    state.players.second.deck = [stolen];

    engageAmulet("first", amuletIdx);

    const pending = state.pendingTargetEffect;
    expect(pending).toBeTruthy();
    expect(pending!.selectCount).toBe(1);
    expect(pending!.pool!.map((c) => c.name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(pending!.pool!.map((c) => c.uid)).toEqual([
      first.uid,
      second.uid,
      third.uid,
    ]);

    // Nothing transformed yet
    expect(thenHand("first").map((c) => c.name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(getDeck(state, "second").length).toBe(1);
  });

  it("resume: chosen hand card (not first) becomes exact copy of enemy deck card", () => {
    setup(42, 4);
    const amuletIdx = playAndEngageEncroached();

    const first = createCard(
      { name: "KeepMe", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    const chosen = createCard(
      { name: "Victim", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "hand",
      "first",
    );
    state.players.first.hand = [first, chosen];

    const src = createCard(
      { name: "Prize", type: "Follower", cost: 5, attack: 3, defense: 3 },
      "deck",
      "second",
    );
    src.buffs = { attack: 7, defense: 2 };
    src.attack = 10;
    src.defense = 5;
    state.players.second.deck = [src];

    engageAmulet("first", amuletIdx);
    expect(state.pendingTargetEffect).toBeTruthy();

    resolvePendingTarget(chosen.uid);

    const hand = getHand(state, "first");
    expect(hand.length).toBe(2);
    expect(hand.find((c) => c.uid === first.uid)!.name).toBe("KeepMe");
    const transformed = hand.find((c) => c.uid === chosen.uid)!;
    expect(transformed.name).toBe("Prize");
    expect(Number(transformed.attack)).toBe(10);
    expect(transformed.buffs?.attack).toBe(7);
    expect(getDeck(state, "second").length).toBe(1);
    expect(state.pendingTargetEffect).toBeFalsy();
  });

  it("selectN === 0 transforms whole hand pool with no pending prompt", () => {
    setup(7, 4);
    const a = createCard(
      { name: "A", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    const b = createCard(
      { name: "B", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "hand",
      "first",
    );
    state.players.first.hand = [a, b];

    const src = createCard(
      { name: "Clone", type: "Follower", cost: 4, attack: 4, defense: 4 },
      "deck",
      "second",
    );
    state.players.second.deck = [src];

    whenRunEffects(
      [
        {
          op: "transform",
          target: "ally:hand",
          into_source: "enemy:deck",
        } as any,
      ],
      "first",
    );

    expect(state.pendingTargetEffect).toBeFalsy();
    const hand = getHand(state, "first");
    expect(hand.length).toBe(2);
    expect(hand.every((c) => c.name === "Clone")).toBe(true);
    expect(hand.map((c) => c.uid).sort()).toEqual([a.uid, b.uid].sort());
  });
});
