import { describe, it, expect, beforeEach } from "vitest";
import { state, createInitialState } from "../../../src/core/gameState";
import { handleBothMaxPPGate } from "../../../src/logic/effects/gates/gates";
import { computeHandGlow } from "../../../src/ui/helpers/glow";
import { CardInstance } from "../../../src/core/types";

describe("Gilnelise Logic", () => {
  beforeEach(() => {
    Object.assign(state, createInitialState(1));
  });

  describe("handleBothMaxPPGate", () => {
    it("should handle effectsQueue correctly when both players have max PP", () => {
      state.players.first.maxPP = 10;
      state.players.second.maxPP = 10;

      const eff = {
        op: "gate",
        effects: [{ op: "heal", amount: 5 }],
      };
      const queue: any[] = [];

      // Should push effects to queue
      handleBothMaxPPGate(eff as any, queue);
      expect(queue.length).toBe(1);
      expect(queue[0].op).toBe("heal");
    });

    it("should safely handle non-array queue (prevent crash)", () => {
      state.players.first.maxPP = 10;
      state.players.second.maxPP = 10;

      const eff = {
        op: "gate",
        effects: [{ op: "heal", amount: 5 }],
      };

      // @ts-ignore - simulate runtime error condition
      const result = handleBothMaxPPGate(eff as any, undefined);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Glow Logic", () => {
    it("should return enhance-ready glow when both max PP >= 10", () => {
      state.players.first.maxPP = 10;
      state.players.second.maxPP = 10;

      const card: CardInstance = {
        id: "123",
        name: "Gilnelise, Voracity Manifest",
        cost: 2,
        type: "Follower",
        fanfare: [{ op: "gate", condition: "both_max_pp", effects: [] }],
        uid: "999",
      };

      const ctx = {
        state,
        owner: "first",
        isPlayersTurn: true,
        availablePP: 10,
        isSpell: false,
      };

      const result = computeHandGlow(card, ctx);
      expect(result.glowClass).toBe("enhance-ready");
    });

    it("should return playable-glow when condition not met", () => {
      state.players.first.maxPP = 5;
      state.players.second.maxPP = 10;

      const card: CardInstance = {
        id: "123",
        name: "Gilnelise, Voracity Manifest",
        cost: 2,
        type: "Follower",
        fanfare: [{ op: "gate", condition: "both_max_pp", effects: [] }],
        uid: "999",
      };

      const ctx = {
        state,
        owner: "first",
        isPlayersTurn: true,
        availablePP: 10,
        isSpell: false,
      };

      const result = computeHandGlow(card, ctx);
      expect(result.glowClass).toBe("playable-glow");
    });
  });
});






