/**
 * Regression: enemy_follower_defense_down must route fireTrigger() with the
 * debuffed follower's owner (conditions.ts:157-160), not the debuffer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import {
  flushReactiveQueueOnly,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { dispatchTargetedOp } from "../../src/logic/effects/ops/targeted/index.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const KRULLE = "10314110";
const PAD_DECK = Array.from({ length: 20 }, () => "10111310");

function setupMain(activePlayer: "first" | "second" = "first", hp = 18) {
  givenGameState({
    seed: 42,
    activePlayer,
    roundCount: 6,
  })
    .withFirstHP(hp)
    .withFirstPP(6, 6)
    .withSecondPP(6, 6)
    .withFirstDeck(PAD_DECK)
    .withSecondDeck(PAD_DECK)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = activePlayer;
}

function krulleOnBoard(player: "first" | "second" = "first") {
  const krulle = createCard(KRULLE, "board", player);
  krulle.peak_defense = Number(krulle.defense);
  applyKeywordsFromList(krulle);
  state.players[player].board.push(krulle);
  return krulle;
}

function boardFollower(
  player: "first" | "second",
  def: number,
  name = "Follower",
): CardInstance {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    player,
  );
  c.peak_defense = def;
  state.players[player].board.push(c);
  return c;
}

function debuffEnemyViaStat(debuffer: "first" | "second", amount = -2) {
  whenRunEffects(
    [
      {
        op: "stat",
        action: "give",
        target: "enemy:follower",
        defense: amount,
      },
    ],
    debuffer,
  );
  flushReactiveQueueOnly();
}

function debuffViaTargetedStat(
  debuffer: "first" | "second",
  target: CardInstance,
  amount = -2,
) {
  dispatchTargetedOp({
    eff: { op: "stat", action: "give", attack: 0, defense: amount },
    owner: debuffer,
    sourceCard: null,
    targetUids: [target.uid],
  });
  // Targeted ops queue reactives; drain like resolveTarget orchestrator (not flushReactiveQueueOnly).
  flushDeferredDeathBatch();
}

describe("enemy_follower_defense_down routing (Krulle 10314110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("once_per_turn: two enemy debuffs same turn restore leader once (18 → 19)", () => {
    setupMain("first", 18);
    krulleOnBoard("first");
    boardFollower("second", 4, "VictimA");
    boardFollower("second", 4, "VictimB");

    debuffEnemyViaStat("first", -2);
    expect(thenHP("first")).toBe(19);

    debuffEnemyViaStat("first", -2);
    expect(thenHP("first")).toBe(19);
  }, 60_000);

  it("once_per_turn refreshes on the owner's next turn (18 → 19 → 20)", () => {
    setupMain("first", 18);
    krulleOnBoard("first");
    boardFollower("second", 4, "Victim");

    debuffEnemyViaStat("first", -2);
    expect(thenHP("first")).toBe(19);

    whenEndTurn();
    whenEndTurn();
    expect(state.activePlayer).toBe("first");

    boardFollower("second", 4, "Victim2");
    debuffEnemyViaStat("first", -2);
    expect(thenHP("first")).toBe(20);
  }, 60_000);

  it("whose_turn owner: enemy -defense on opponent's turn does not restore", () => {
    setupMain("second", 18);
    krulleOnBoard("first");
    boardFollower("second", 4, "Victim");

    debuffEnemyViaStat("second", -2);
    expect(thenHP("first")).toBe(18);
  }, 60_000);

  it("self-debuff: debuffing own follower does not restore own Krulle listener", () => {
    setupMain("first", 18);
    krulleOnBoard("first");
    boardFollower("first", 4, "OwnFollower");

    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          defense: -2,
        },
      ],
      "first",
    );
    flushReactiveQueueOnly();
    expect(thenHP("first")).toBe(18);
  }, 60_000);

  it("targeted stat route restores leader when enemy follower defense drops", () => {
    setupMain("first", 18);
    krulleOnBoard("first");
    const foe = boardFollower("second", 4, "TargetedVictim");

    debuffViaTargetedStat("first", foe, -2);
    expect(Number(foe.defense)).toBe(2);
    expect(thenHP("first")).toBe(19);
  }, 60_000);

  it("restore caps at leader max HP (19 → 20, not 21)", () => {
    setupMain("first", 19);
    krulleOnBoard("first");
    boardFollower("second", 4, "Victim");

    debuffEnemyViaStat("first", -2);
    expect(thenHP("first")).toBe(20);
  }, 60_000);
});
