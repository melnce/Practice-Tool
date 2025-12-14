
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../src/core/gameState";
import { runEffects } from "../../src/logic/core/effects";
import { makeUid } from "../../src/core/rng";
import { vanillaFollower } from "../fixtures/utils/testCards";

describe("Reanimate Mechanics", () => {
    beforeEach(() => {
        resetGameState();
    });

    it("should reanimate a follower from the graveyard", () => {
        const unit = { ...vanillaFollower, uid: makeUid(), owner: "blue", cost: 2, name: "Target Unit" };
        // Populate graveyard (simulate death)
        state.blueGraveyard = [unit];

        // Helper to ensure 'burial' logic didn't wipe stats if we just push raw.
        // Reanimate usually looks for largest cost <= X.

        const reanimateEff = {
            op: "reanimate",
            x: 2
        };

        runEffects([reanimateEff], "blue", null);

        expect(state.blueBoard.length).toBe(1);
        expect(state.blueBoard[0].name).toBe("Target Unit");
        // Should create a COPY (new UID)
        expect(state.blueBoard[0].uid).not.toBe(unit.uid);
    });

    it("should fail to reanimate if cost exceeds X", () => {
        const unit = { ...vanillaFollower, uid: makeUid(), owner: "blue", cost: 5, name: "Big Unit" };
        state.blueGraveyard = [unit];

        const reanimateEff = {
            op: "reanimate",
            x: 4
        };

        runEffects([reanimateEff], "blue", null);

        expect(state.blueBoard.length).toBe(0);
    });
});


