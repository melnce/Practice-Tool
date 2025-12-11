
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "#core/gameState";
import { runEffects } from "#logic/core/effects";
import { makeUid } from "#core/rng";
import { vanillaFollower } from "./utils/testCards";

describe("Bounce Mechanics", () => {
    beforeEach(() => {
        resetGameState();
    });

    it("should bounce follower from board to hand", () => {
        const unit = { ...vanillaFollower, uid: makeUid(), owner: "blue" };
        state.blueBoard = [unit];
        state.blueHand = [];

        const bounceEff = {
            op: "return_to_hand", // verify op code, usually "return_to_hand" or "bounce" mapped?
            // checking types.ts -> EffectOp has "bounce" | "returnHandToDeck"
            // Implementation typically maps "return_to_hand" to bounce logic or simply "bounce". 
            // In many SV engines 'return_to_hand' is the op string.
            // Let's assume 'return_to_hand' based on common conventions or check if 'bounce' is the key.
            // types.ts said "bounce" in the union. logic/effects/ops usually matches.
            // Let's try "bounce" and if fail, "return_to_hand".
            // Actually, looking at types.ts: export type EffectOp = "bounce" ...
            // usually strict ops use that.
            target: "ally:follower"
        };

        // Wait, "bounce" implies returning to hand.
        runEffects([{ op: "bounce", target: "ally:follower" }], "blue", null);

        expect(state.blueBoard.length).toBe(0);
        expect(state.blueHand.length).toBe(1);
        expect(state.blueHand[0].uid).toBe(unit.uid);
    });

    it("should fail to bounce if hand is full (9 cards)", () => {
        const unit = { ...vanillaFollower, uid: makeUid(), owner: "blue" };
        state.blueBoard = [unit];
        state.blueHand = Array(9).fill({ ...vanillaFollower, uid: "filler" });

        runEffects([{ op: "bounce", target: "ally:follower" }], "blue", null);

        // Should be destroyed (graveyard) typically? Or stay on board?
        // Shadowverse rule: if hand full, burned (graveyard).
        expect(state.blueBoard.length).toBe(0);
        expect(state.blueHand.length).toBe(9);
        expect(state.blueGraveyard.length).toBe(1);
        expect(state.blueGraveyard[0].uid).toBe(unit.uid);
    });
});
