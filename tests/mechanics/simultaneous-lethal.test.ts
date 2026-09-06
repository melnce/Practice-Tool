/**
 * Official Q&A — simultaneous lethal when both leaders are hit by one instruction.
 * Balto crest, Aragavy Evolve, Rage of Serpents, Chains of the Past, single-lethal control.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  whenRunEffects,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import {
  getHP,
  getWinner,
  getBoard,
  opponentOf,
} from "../../src/core/playerHelpers.js";
import type { PlayerSlot } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const BALTO = "10153140";
const RAGE = "10153310";
const ARAGAVY = "10154130";
const CHAINS = "10952310";
const FILLER = "90001110";

function enemyFollower(active: PlayerSlot, def = 3, name = "Enemy") {
  const enemy = opponentOf(active);
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    enemy,
  );
  c.peak_defense = def;
  getBoard(state, enemy).push(c);
  return c;
}

function setupActive(active: PlayerSlot, hp: number) {
  givenGameState({ seed: 42, activePlayer: active, roundCount: 8 })
    .withFirstHP(hp)
    .withSecondHP(hp)
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .withFirstDeck(Array(15).fill(FILLER))
    .withSecondDeck(Array(15).fill(FILLER))
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

function expectSimultaneousLoss(active: PlayerSlot) {
  expect(getHP(state, "first")).toBe(0);
  expect(getHP(state, "second")).toBe(0);
  expect(state.phase).toBe("gameover");
  expect(getWinner(state)).toBe(opponentOf(active));
  expect((state as any).gameOverReason).toBe("simultaneous");
}

describe("Simultaneous lethal — official Q&A", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  describe.each(["first", "second"] as const)("active player %s", (active) => {
    it("Balto crest EOT — both at 1 → both 0, active player loses", () => {
      setupActive(active, 1);
      state.players[active].hand = [createCard(BALTO, "hand", active)];
      whenPlayCard(active, 0);
      whenEndTurn();
      expectSimultaneousLoss(active);
    });

    it("Aragavy Evolve — both at 3 → both 0, active player loses", () => {
      setupActive(active, 3);
      const arag = createCard(ARAGAVY, "board", active);
      arag.peak_defense = arag.defense;
      state.players[active].board = [arag];
      state.players[active].evoCharges = 2;
      handleEvolveSelf(arag, active, { spendPoint: true, mode: "normal" });
      expectSimultaneousLoss(active);
    });

    it("Rage of Serpents — both at 2, enemy leader selected → enemy 0, you stay 2, you win", () => {
      setupActive(active, 2);
      enemyFollower(active, 5);
      state.players[active].hand = [createCard(RAGE, "hand", active)];
      whenPlayCard(active, 0);
      resolvePendingTarget("leader");
      expect(getHP(state, opponentOf(active))).toBe(0);
      expect(getHP(state, active)).toBe(2);
      expect(getWinner(state)).toBe(active);
      expect(state.phase).toBe("gameover");
    });

    it("Rage of Serpents — both at 2, enemy follower selected → you go to 0 and lose", () => {
      setupActive(active, 2);
      const foe = enemyFollower(active, 3);
      state.players[active].hand = [createCard(RAGE, "hand", active)];
      whenPlayCard(active, 0);
      resolvePendingTarget(foe.uid);
      expect(foe.defense).toBe(0);
      expect(getHP(state, active)).toBe(0);
      expect(getHP(state, opponentOf(active))).toBe(2);
      expect(getWinner(state)).toBe(opponentOf(active));
      expect(state.phase).toBe("gameover");
    });

    it("Chains of the Past — both at 10 → both take 1, no game over", () => {
      setupActive(active, 10);
      state.players[active].pp = 2;
      state.players[active].maxPP = 2;
      enemyFollower(active, 5);
      state.players[active].hand = [createCard(CHAINS, "hand", active)];
      whenPlayCard(active, 0);
      expect(getHP(state, "first")).toBe(9);
      expect(getHP(state, "second")).toBe(9);
      expect(state.phase).toBe("main");
      expect(getWinner(state)).toBeNull();
    });

    it("single-leader lethal — enemy at 1, you win", () => {
      setupActive(active, 20);
      state.players[opponentOf(active)].hp = 1;
      whenRunEffects(
        [{ op: "damage", target: "enemy:leader", amount: 1 }],
        active,
      );
      expect(getHP(state, opponentOf(active))).toBe(0);
      expect(getHP(state, active)).toBe(20);
      expect(getWinner(state)).toBe(active);
      expect(state.phase).toBe("gameover");
      expect((state as any).gameOverReason).toBe("lethal");
    });
  });
});
