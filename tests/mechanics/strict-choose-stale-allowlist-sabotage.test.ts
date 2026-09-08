/**
 * Sabotage: stale (A) row must fail bidirectional gate.
 */
import { describe, it, expect } from "vitest";
import { assertAllCommandsUsedAfterTest } from "../harness/strictChooseGate.js";

describe("strict-choose stale allowlist sabotage", () => {
  it("SABOTAGE PRE: stale unconsumed-command (A) row throws", () => {
    expect(() =>
      assertAllCommandsUsedAfterTest(
        "tests/mechanics/board-cap.test.ts",
        "board field cap > soak repro seed20260913 game391 — replaySoakTrace stays at ≤5 field",
        [],
      ),
    ).toThrow(/allowlist entry no longer reproduces/);
  });
});
