// @vitest-environment node
/**
 * RNG Cursor Contract Tests
 *
 * Verifies that RNG snapshot/restore semantics are correct:
 * - Restoring a snapshot returns RNG to exact same position
 * - Same sequence of floats is produced after restore
 * - uidCounter is preserved and restored correctly
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../../src/core/rng.js";

describe("RNG Cursor Contract", () => {
    it("should restore to exact cursor position and produce identical floats", () => {
        const SEED = 42;
        const N = 10; // Draw N floats before snapshot
        const K = 20; // Draw K floats after snapshot

        const rng = createRng(SEED);

        // Draw N floats (advance cursor)
        const beforeSnapshot: number[] = [];
        for (let i = 0; i < N; i++) {
            beforeSnapshot.push(rng.nextFloat());
        }

        // Take snapshot at cursor position N
        const snapshot = rng.snapshot();
        expect(snapshot.cursor).toBe(N);

        // Draw next K floats into array B
        const B: number[] = [];
        for (let i = 0; i < K; i++) {
            B.push(rng.nextFloat());
        }

        // Cursor should now be at N + K
        expect(rng.cursor).toBe(N + K);

        // Restore snapshot (back to position N)
        rng.restore(snapshot);
        expect(rng.cursor).toBe(N);

        // Draw next K floats into array C
        const C: number[] = [];
        for (let i = 0; i < K; i++) {
            C.push(rng.nextFloat());
        }

        // B and C must be identical
        expect(C).toEqual(B);
        expect(C.length).toBe(K);
    });

    it("should preserve uidCounter across snapshot/restore", () => {
        const SEED = 123;
        const rng = createRng(SEED);

        // Generate some UIDs to advance counter
        const uid1 = rng.makeUid("test_");
        const uid2 = rng.makeUid("test_");
        const uid3 = rng.makeUid("test_");

        // Take snapshot (uidCounter should be 3)
        const snapshot = rng.snapshot();
        expect(snapshot.uidCounter).toBe(3);

        // Generate more UIDs
        const uidAfterSnapshot1 = rng.makeUid("after_");
        const uidAfterSnapshot2 = rng.makeUid("after_");

        // uidCounter should be 5
        expect(rng.snapshot().uidCounter).toBe(5);

        // Restore snapshot (uidCounter back to 3)
        rng.restore(snapshot);
        expect(rng.snapshot().uidCounter).toBe(3);

        // Re-generate UIDs - should produce identical strings
        const uidReplay1 = rng.makeUid("after_");
        const uidReplay2 = rng.makeUid("after_");

        expect(uidReplay1).toBe(uidAfterSnapshot1);
        expect(uidReplay2).toBe(uidAfterSnapshot2);
    });

    it("should not change uidCounter unless makeUid is called", () => {
        const SEED = 456;
        const rng = createRng(SEED);

        // Initial uidCounter should be 0
        expect(rng.snapshot().uidCounter).toBe(0);

        // Draw floats - uidCounter should remain 0
        for (let i = 0; i < 100; i++) {
            rng.nextFloat();
        }
        expect(rng.snapshot().uidCounter).toBe(0);

        // Draw ints - uidCounter should remain 0
        for (let i = 0; i < 50; i++) {
            rng.nextInt(10);
        }
        expect(rng.snapshot().uidCounter).toBe(0);

        // Shuffle - uidCounter should remain 0
        rng.shuffle([1, 2, 3, 4, 5]);
        expect(rng.snapshot().uidCounter).toBe(0);

        // Pick - uidCounter should remain 0
        rng.pick([1, 2, 3]);
        expect(rng.snapshot().uidCounter).toBe(0);

        // Only makeUid should increment uidCounter
        rng.makeUid("test_");
        expect(rng.snapshot().uidCounter).toBe(1);

        rng.makeUid("test_");
        expect(rng.snapshot().uidCounter).toBe(2);
    });

    it("should maintain determinism with seed and cursor", () => {
        const SEED = 789;

        // Create two RNGs with same seed
        const rng1 = createRng(SEED);
        const rng2 = createRng(SEED);

        // They should produce identical sequences
        for (let i = 0; i < 50; i++) {
            expect(rng1.nextFloat()).toBe(rng2.nextFloat());
        }

        // Advance rng1 further
        for (let i = 0; i < 30; i++) {
            rng1.nextFloat();
        }

        // Snapshot rng1's position
        const snapshot = rng1.snapshot();

        // Restore rng2 to rng1's position
        rng2.restore(snapshot);

        // Now they should produce identical sequences again
        for (let i = 0; i < 20; i++) {
            expect(rng1.nextFloat()).toBe(rng2.nextFloat());
        }
    });

    it("should handle restore to earlier cursor position correctly", () => {
        const SEED = 999;
        const rng = createRng(SEED);

        // Take multiple snapshots at different positions
        const snapshot0 = rng.snapshot();
        expect(snapshot0.cursor).toBe(0);

        for (let i = 0; i < 10; i++) rng.nextFloat();
        const snapshot10 = rng.snapshot();
        expect(snapshot10.cursor).toBe(10);

        for (let i = 0; i < 20; i++) rng.nextFloat();
        const snapshot30 = rng.snapshot();
        expect(snapshot30.cursor).toBe(30);

        // Jump back to cursor 10
        rng.restore(snapshot10);
        expect(rng.cursor).toBe(10);

        // Collect next 20 floats
        const fromPos10: number[] = [];
        for (let i = 0; i < 20; i++) {
            fromPos10.push(rng.nextFloat());
        }

        // Jump back to cursor 10 again
        rng.restore(snapshot10);

        // Should produce same 20 floats
        for (let i = 0; i < 20; i++) {
            expect(rng.nextFloat()).toBe(fromPos10[i]);
        }
    });
});
