// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { state, resetGameState } from "../../../src/core/gameState.js";
import {
  applyLeaderDamage,
  handleModifyLeaderDamageReceived,
} from "../../../src/logic/effects/leader.js";
import * as fs from "fs";
import * as path from "path";

describe("Card: Beelzebub, Supreme King", () => {
  beforeEach(() => {
    resetGameState(1);
  });

  describe("Core Logic: Leader Damage Bonus", () => {
    it("should correctly store the damage bonus in state", () => {
      handleModifyLeaderDamageReceived({ amount: 1 } as any, "second");
      expect(state.players.second.leaderDamageTakenBonus).toBe(1);
      expect(state.players.first.leaderDamageTakenBonus).toBe(0);

      handleModifyLeaderDamageReceived({ amount: 1 } as any, "second");
      expect(state.players.second.leaderDamageTakenBonus).toBe(2); // Stacking
    });

    it("should apply the bonus when taking damage", () => {
      state.players.second.leaderDamageTakenBonus = 1;
      state.players.second.hp = 20;

      // Damage 2 + 1 = 3
      applyLeaderDamage("second", 2);
      expect(state.players.second.hp).toBe(17);

      // Peristent: Damage 1 + 1 = 2
      applyLeaderDamage("second", 1);
      expect(state.players.second.hp).toBe(15);
    });

    // Owner ruling 2026-08-31: a 0-attack follower still produces a damage
    // *event* that deals 0, so +N makes it N. Healing (amount < 0) is not a
    // damage event and must not take the bonus.
    it("applies the bonus to a 0-damage event (owner ruling 2026-08-31)", () => {
      state.players.second.leaderDamageTakenBonus = 5;
      state.players.second.hp = 20;

      applyLeaderDamage("second", 0);
      expect(state.players.second.hp).toBe(15);
    });

    it("does not apply the bonus to healing", () => {
      state.players.second.leaderDamageTakenBonus = 5;
      state.players.second.hp = 20;

      applyLeaderDamage("second", -5);
      expect(state.players.second.hp).toBe(20);
    });

    it("should respect resetGameState", () => {
      state.players.second.leaderDamageTakenBonus = 5;
      resetGameState(1);
      expect(state.players.second.leaderDamageTakenBonus).toBe(0);
    });
  });

  describe("Card Definition (JSON)", () => {
    it("should have correct Fanfare definition matching requirements", () => {
      const filePath = path.resolve(
        __dirname,
        "../../../cards/sets/10004_skybound-dragons.json",
      );
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const card = content.find(
        (c: any) => c.name === "Beelzebub, Supreme King",
      );

      expect(card).toBeDefined();

      const fanfare = card.fanfare;
      expect(fanfare).toHaveLength(2);

      // 1. Select 2 enemies, silence, damage 9
      const selOp = fanfare[0];
      expect(selOp.op).toBe("select");
      expect(selOp.count).toBe(2);
      expect(selOp.target).toBe("enemy:follower");

      const subEffects = selOp.effects;
      expect(subEffects).toHaveLength(2);
      expect(subEffects[0].op).toBe("keyword");
      expect(subEffects[0].action).toBe("silence");
      expect(subEffects[1].op).toBe("damage");
      expect(subEffects[1].amount).toBe(9);

      // 2. Add Leader Damage Bonus (Vulnerable keyword)
      const bonusOp = fanfare[1];
      expect(bonusOp.op).toBe("keyword");
      expect(bonusOp.target).toBe("enemy:leader");
      expect(bonusOp.keywords).toContainEqual(
        expect.objectContaining({ name: "Vulnerable", value: 1 }),
      );
    });
  });
});
