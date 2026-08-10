/**
 * Follower Strike + only_if_damaged destroy (Rosé, Princess Knight and similar).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { isDamaged } from "../../src/logic/core/combat/damageState.js";
import { handleDestroy } from "../../src/logic/effects/ops/destroy/unified.js";
import { normalizeToUnifiedSpec } from "../../src/logic/effects/ops/destroy/types.js";
import type { CardInstance } from "../../src/core/types/index.js";

function roseStrikeEffect() {
  return getCardById("10223110")!.triggers![0]!.effects![0]!;
}

describe("follower_strike only_if_damaged destroy", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  describe("normalizeToUnifiedSpec", () => {
    it("parses only_if_damaged and scope from card JSON", () => {
      const spec = normalizeToUnifiedSpec(roseStrikeEffect() as any);
      expect(spec.scope).toBe("defender");
      expect(spec.only_if_damaged).toBe(true);
    });
  });

  describe("isDamaged", () => {
    it("full HP follower is not damaged", () => {
      const c: CardInstance = {
        uid: "a",
        name: "X",
        type: "Follower",
        cost: 1,
        attack: 2,
        defense: 3,
        peak_defense: 3,
      };
      expect(isDamaged(c)).toBe(false);
    });

    it("chipped follower is damaged", () => {
      const c: CardInstance = {
        uid: "b",
        name: "Y",
        type: "Follower",
        cost: 1,
        attack: 2,
        defense: 1,
        peak_defense: 3,
      };
      expect(isDamaged(c)).toBe(true);
    });

    it("healed back to peak is not damaged", () => {
      const c: CardInstance = {
        uid: "c",
        name: "Z",
        type: "Follower",
        cost: 1,
        attack: 2,
        defense: 3,
        peak_defense: 3,
      };
      expect(isDamaged(c)).toBe(false);
    });
  });

  describe("Rosé — attackFollower integration", () => {
    function setupRoseVsEnemy(enemyDefense: number, enemyPeak: number) {
      givenGameState({ seed: 1, activePlayer: "first", phase: "main" }).build();

      const roseTemplate = getCardById("10223110")!;
      const rose: CardInstance = {
        ...roseTemplate,
        uid: "rose",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 2,
        can_attack: true,
        hasRush: true,
        peak_defense: 2,
      };

      const enemy: CardInstance = {
        uid: "enemy",
        name: "Training Dummy",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: enemyDefense,
        peak_defense: enemyPeak,
        can_attack: false,
      };

      state.players.first.board = [rose];
      state.players.second.board = [enemy];
      state.gameStarted = true;

      return { rose, enemy };
    }

    it("destroys an already-damaged opposing follower before combat damage", () => {
      setupRoseVsEnemy(1, 2);

      attackFollower(0, 0, "first", "second");

      const stillThere = getBoard(state, "second").find(
        (c) => c.uid === "enemy",
      );
      expect(stillThere).toBeUndefined();
    });

    it("does not destroy a full-health opposing follower via strike", () => {
      const { rose } = setupRoseVsEnemy(5, 5);
      rose.attack = 0;
      state.players.first.board[0]!.attack = 0;

      attackFollower(0, 0, "first", "second");

      const stillThere = findOnBoard("second", "Training Dummy");
      expect(stillThere).toBeDefined();
      expect(Number(stillThere!.defense)).toBe(5);
      expect(isDamaged(stillThere!)).toBe(false);
    });

    it("does not destroy a follower at full health (healed baseline)", () => {
      const { rose } = setupRoseVsEnemy(4, 4);
      rose.attack = 0;
      state.players.first.board[0]!.attack = 0;

      attackFollower(0, 0, "first", "second");

      const stillThere = findOnBoard("second", "Training Dummy");
      expect(stillThere).toBeDefined();
      expect(Number(stillThere!.defense)).toBe(4);
      expect(isDamaged(stillThere!)).toBe(false);
    });
  });

  describe("handleDestroy defender scope", () => {
    it("receives defender from trigger context", () => {
      givenGameState({ seed: 1 }).build();

      const defender: CardInstance = {
        uid: "def",
        name: "Target",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        peak_defense: 2,
      };
      state.players.second.board = [defender];

      const eff = roseStrikeEffect();
      const destroyed = handleDestroy(eff as any, "first", [], {
        owner: "first",
        sourceCard: null,
        attacker: { uid: "atk" } as CardInstance,
        defender,
      });

      expect(destroyed).toBe(1);
      expect(getBoard(state, "second")).toHaveLength(0);
    });
  });
});
