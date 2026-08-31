// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../src/core/gameState.js";
import { handleReturnHandToDeck } from "../../src/logic/effects/ops/returnHandToDeck.js";
import { handleReturnToHand } from "../../src/logic/effects/ops/bounce.js";
import {
  getPendingTarget,
  clearPendingTarget,
} from "../../src/logic/core/pendingTarget/index.js";
import { getHand, getDeck, getBoard } from "../../src/core/playerHelpers.js";

function mkCard(uid: string) {
  return {
    uid,
    id: "x",
    name: "Filler " + uid,
    cost: 1,
    type: "Spell",
  } as any;
}

function mkFollower(uid: string) {
  return {
    uid,
    id: "x",
    name: "Follower " + uid,
    cost: 1,
    type: "Follower",
    attack: 1,
    defense: 1,
  } as any;
}

describe("op:return destination:deck honours the canonical `select` spelling", () => {
  beforeEach(() => {
    clearPendingTarget();
    const hand = getHand(state as any, "first");
    hand.length = 0;
    for (let i = 0; i < 5; i++) hand.push(mkCard("h" + i));
    getDeck(state as any, "first").length = 0;
  });

  it("Cognitive Shift 10711310: text says 'Select 2 cards' → selectCount must be 2", () => {
    const eff: any = {
      op: "return",
      destination: "deck",
      select: 2,
      target: "ally:hand",
    };
    expect(handleReturnHandToDeck(eff, "first" as any, [])).toBe("pending");
    expect((getPendingTarget() as any).selectCount).toBe(2);
  });

  it("select:'all' still returns the whole hand", () => {
    const eff: any = {
      op: "return",
      destination: "deck",
      select: "all",
      target: "ally:hand",
    };
    expect(handleReturnHandToDeck(eff, "first" as any, [])).toBe("done");
    expect(getHand(state as any, "first").length).toBe(0);
    expect(getDeck(state as any, "first").length).toBe(5);
  });

  it("select_mode:'random' with select:2 still returns 2", () => {
    const eff: any = {
      op: "return",
      destination: "deck",
      select: 2,
      select_mode: "random",
      target: "ally:hand",
    };
    expect(handleReturnHandToDeck(eff, "first" as any, [])).toBe("done");
    expect(getDeck(state as any, "first").length).toBe(2);
  });
});

describe("op:return destination:hand honours the canonical `select` spelling", () => {
  beforeEach(() => {
    clearPendingTarget();
    const board = getBoard(state as any, "second");
    board.length = 0;
    for (let i = 0; i < 3; i++) board.push(mkFollower("b" + i));
  });

  it("select:2 yields selectCount 2 (bounce / return-to-hand path)", () => {
    const eff: any = {
      op: "return",
      destination: "hand",
      select: 2,
      target: "enemy:board",
    };
    expect(handleReturnToHand(eff, "first" as any, null, [] as any, {})).toBe(
      "pending",
    );
    expect((getPendingTarget() as any).selectCount).toBe(2);
  });
});
