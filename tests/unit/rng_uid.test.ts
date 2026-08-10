// tests/unit/rng_uid.test.ts
// Test for UID counter determinism with snapshot/restore

import { describe, it, expect, beforeEach } from "vitest";
import { createRng, RNG } from "../../src/core/rng";

describe("RNG UID Counter", () => {
  let rng: RNG;

  beforeEach(() => {
    rng = createRng(12345);
  });

  describe("makeUid", () => {
    it("should generate monotonically increasing UIDs", () => {
      const uid1 = rng.makeUid();
      const uid2 = rng.makeUid();
      const uid3 = rng.makeUid();

      expect(uid1).toBe("uid_1");
      expect(uid2).toBe("uid_2");
      expect(uid3).toBe("uid_3");
    });

    it("should use custom prefix", () => {
      const uid = rng.makeUid("card_");
      expect(uid).toBe("card_1");
    });
  });

  describe("snapshot/restore with UID counter", () => {
    it("should include uidCounter in snapshot", () => {
      rng.makeUid();
      rng.makeUid();
      const snap = rng.snapshot();

      expect((snap as any).uidCounter).toBe(2);
    });

    it("should restore uidCounter correctly", () => {
      // Generate some UIDs
      rng.makeUid(); // 1
      rng.makeUid(); // 2
      const snap = rng.snapshot();

      // Generate more UIDs
      rng.makeUid(); // 3
      rng.makeUid(); // 4
      rng.makeUid(); // 5

      // Restore
      rng.restore(snap);

      // Next UID should be 3 again (same as before restore)
      expect(rng.makeUid()).toBe("uid_3");
    });

    it("should produce identical UIDs after restore (undo/redo determinism)", () => {
      // Simulate action that allocates UIDs
      const uid1 = rng.makeUid("action_");
      const uid2 = rng.makeUid("action_");

      // Take snapshot after actions
      const afterAction = rng.snapshot();

      // Simulate more work
      rng.makeUid("later_");
      rng.makeUid("later_");

      // "Undo" by restoring to earlier state
      rng.restore(afterAction);

      // Next UIDs should continue from where afterAction left off
      const uid3 = rng.makeUid("action_");
      expect(uid3).toBe("action_3"); // Not reusing uid1/uid2
    });

    it("should reset uidCounter on fresh RNG creation", () => {
      rng.makeUid();
      rng.makeUid();
      rng.makeUid();

      // Create fresh RNG with same seed
      const freshRng = createRng(12345);
      expect(freshRng.makeUid()).toBe("uid_1");
    });

    it("should handle restore with missing uidCounter (backward compat)", () => {
      rng.makeUid();
      rng.makeUid();

      // Simulate old snapshot without uidCounter
      const oldSnapshot = { seed: 12345, cursor: 0 };
      rng.restore(oldSnapshot as any);

      // Should default to 0, so next UID is 1
      expect(rng.makeUid()).toBe("uid_1");
    });
  });
});
