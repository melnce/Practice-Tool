/**
 * Golden Invariant: PendingTarget Lifecycle
 * 
 * Asserts state transitions for pending target selection:
 * set → pause check → resolve/clear
 */
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import {
    setPendingTarget,
    clearPendingTarget,
    isPendingTarget,
    getPendingTarget,
} from "../../src/logic/core/pendingTarget";
import { CardInstance, Effect } from "../../src/core/types";

function makeCard(id: string): CardInstance {
    return {
        uid: id,
        name: `Card_${id}`,
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
    } as CardInstance;
}

describe("Golden: PendingTarget Lifecycle", () => {
    beforeEach(() => {
        resetGameState();
    });

    it("initially no pending target", () => {
        expect(isPendingTarget()).toBe(false);
        expect(getPendingTarget()).toBeNull();
    });

    it("setPendingTarget creates pending state", () => {
        const eff: Effect = { op: "damage", amount: 1 };
        const pool = [makeCard("t1"), makeCard("t2")];

        setPendingTarget({
            eff,
            owner: "blue",
            sourceCard: null,
            pool,
            targets: [],
            selectCount: 1,
        });

        expect(isPendingTarget()).toBe(true);
        const pending = getPendingTarget();
        expect(pending).toBeDefined();
        expect(pending?.selectCount).toBe(1);
        expect(pending?.pool.length).toBe(2);
    });

    it("clearPendingTarget removes pending state", () => {
        setPendingTarget({
            eff: { op: "buff" },
            owner: "red",
            sourceCard: null,
            pool: [makeCard("x")],
            targets: [],
            selectCount: 1,
        });

        expect(isPendingTarget()).toBe(true);

        clearPendingTarget();

        expect(isPendingTarget()).toBe(false);
        expect(getPendingTarget()).toBeNull();
    });

    it("targets can be accumulated before resolution", () => {
        const t1 = makeCard("t1");
        const t2 = makeCard("t2");

        setPendingTarget({
            eff: { op: "destroy" },
            owner: "blue",
            sourceCard: null,
            pool: [t1, t2],
            targets: [],
            selectCount: 2,
        });

        const pending = getPendingTarget();
        expect(pending?.targets.length).toBe(0);

        // Simulate selection
        pending?.targets.push(t1);
        expect(pending?.targets.length).toBe(1);
    });
});
