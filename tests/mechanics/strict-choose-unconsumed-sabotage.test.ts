/**
 * Sabotage proofs for assertAllCommandsUsed + invalid-target throw.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import { createCard } from "../harness/builders.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { assertAllCommandsUsedAfterTest } from "../harness/strictChooseGate.js";
import {
  formatInvalidTargetStrictChooseFailed,
  resolvePendingTarget,
} from "../../src/logic/core/resolveTarget.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";

describe("strict-choose unconsumed commands sabotage proofs", () => {
  beforeEach(() => {
    resetGameState(99);
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("PRE: invalid uid on open prompt throws invalidTargetStrictChooseFailed with pool diagnostics", () => {
    const legal = createCard("10001110", "board", "second");
    legal.uid = "legal_target";
    state.players.second.board = [legal];
    state.pendingTargetEffect = {
      eff: { op: "destroy" } as any,
      owner: "first",
      sourceCard: null,
      resumeEffects: [],
      pool: [legal],
      targets: [],
      targetUids: [],
      poolUids: [legal.uid],
      selectCount: 1,
    };
    const pending = state.pendingTargetEffect!;

    let message = "";
    try {
      resolvePendingTarget("illegal_uid");
    } catch (error) {
      message = (error as Error).message;
    } finally {
      state.pendingTargetEffect = undefined;
    }

    expect(message).toContain("invalidTargetStrictChooseFailed:");
    expect(message).toContain("uid clicked: illegal_uid");
    expect(message).toContain("op: destroy");
    expect(message).toContain("pool size: 1");
    expect(message).toContain("legal targets: legal_target");
    expect(validateTargetSelection(state, pending, "illegal_uid").ok).toBe(
      false,
    );
  });

  it("PRE: formatInvalidTargetStrictChooseFailed matches thrown shape", () => {
    const pending = {
      eff: { op: "select" },
      owner: "first",
      pool: [{ uid: "only_one" } as any],
      selectCount: 1,
    };
    const formatted = formatInvalidTargetStrictChooseFailed(
      "bogus",
      pending as any,
      "Clicked card is not in the valid target pool.",
    );
    expect(formatted).toContain("uid clicked: bogus");
    expect(formatted).toContain("legal targets: only_one");
  });

  it("SABOTAGE PRE: unconsumed no-prompt exit triggers gate diagnostic", () => {
    expect(() =>
      assertAllCommandsUsedAfterTest(
        "tests/mechanics/example.test.ts",
        "example > stray resolvePendingTarget",
        [
          {
            uid: "orphan_uid",
            callerTestFile: "tests/mechanics/example.test.ts",
          },
        ],
      ),
    ).toThrow(/unconsumedCommandFailed:/);
  });
});
