/**
 * "During your turn, whenever …" — owner-turn scope on real cards.
 *
 * Each card: trigger fires on owner's turn, does not fire on opponent's turn.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { invalidateZoneCandidatesCache } from "../../src/logic/core/triggers/utils.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { drawCard } from "../../src/core/utils.js";
import { getHP, getHand } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const GHOST = "90051130";

function setupTurn(active: "first" | "second" = "first", round = 8) {
  resetUidCounter();
  givenGameState({ seed: 1, activePlayer: active, roundCount: round })
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  invalidateZoneCandidatesCache();
}

function allyEntering(name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 2 },
    "board",
    "first",
  );
  c.peak_defense = c.defense;
  return c;
}

describe("During your turn scope — Macmillan (10754120)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: Departed enter gains +1/+0, Rush, Ward and deals 1 to enemy leader", () => {
    const mac = createCard("10754120", "board", "first");
    mac.peak_defense = mac.defense;
    state.players.first.board = [mac];
    const ghost = createCard(GHOST, "board", "first");
    ghost.peak_defense = ghost.defense;
    const hpBefore = getHP(state, "second");
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: ghost,
      enteringOwner: "first",
    });
    expect(Number(ghost.attack)).toBe(2);
    expect(ghost.hasRush).toBe(true);
    expect(ghost.hasWard).toBe(true);
    expect(getHP(state, "second")).toBe(hpBefore - 1);
  });

  it("opponent's turn: Departed enter does not buff or damage leader", () => {
    setupTurn("second");
    const mac = createCard("10754120", "board", "first");
    mac.peak_defense = mac.defense;
    state.players.first.board = [mac];
    const ghost = createCard(GHOST, "board", "first");
    ghost.peak_defense = ghost.defense;
    const hpBefore = getHP(state, "second");
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: ghost,
      enteringOwner: "first",
    });
    expect(Number(ghost.attack)).toBe(1);
    expect(ghost.hasRush).toBeFalsy();
    expect(ghost.hasWard).toBeFalsy();
    expect(getHP(state, "second")).toBe(hpBefore);
  });
});

describe("During your turn scope — Gildaria (10724110)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: another allied follower entering gains Rush", () => {
    const gild = createCard("10724110", "board", "first");
    gild.peak_defense = gild.defense;
    const entering = allyEntering("Steelclad Ally");
    state.players.first.board = [gild, entering];
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: entering,
      enteringOwner: "first",
    });
    expect(entering.hasRush).toBe(true);
    expect(gild.hasRush).toBeFalsy();
  });

  it("opponent's turn: another allied follower entering does not gain Rush", () => {
    setupTurn("second");
    const gild = createCard("10724110", "board", "first");
    gild.peak_defense = gild.defense;
    state.players.first.board = [gild];
    const entering = allyEntering("Steelclad Ally");
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: entering,
      enteringOwner: "first",
    });
    expect(entering.hasRush).toBeFalsy();
  });
});

describe("During your turn scope — Bouquet Believer (10561120)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: drawing a card grants this follower Rush", () => {
    const bouquet = createCard("10561120", "board", "first");
    bouquet.peak_defense = bouquet.defense;
    state.players.first.board = [bouquet];
    const drawn = createCard(
      { name: "Drawn", type: "Spell", cost: 1 },
      "deck",
      "first",
    );
    state.players.first.deck = [drawn];
    drawCard(state.players.first.hand, state.players.first.deck, "first");
    expect(bouquet.hasRush).toBe(true);
  });

  it("opponent's turn: drawing a card does not grant Rush", () => {
    setupTurn("second");
    const bouquet = createCard("10561120", "board", "first");
    bouquet.peak_defense = bouquet.defense;
    state.players.first.board = [bouquet];
    const drawn = createCard(
      { name: "Drawn", type: "Spell", cost: 1 },
      "deck",
      "first",
    );
    state.players.first.deck = [drawn];
    drawCard(state.players.first.hand, state.players.first.deck, "first");
    expect(bouquet.hasRush).toBeFalsy();
  });
});

describe("During your turn scope — Desperate Shrinemouse (10562120)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: drawing a card deals 1 damage to all enemy followers", () => {
    const mouse = createCard("10562120", "board", "first");
    mouse.peak_defense = mouse.defense;
    state.players.first.board = [mouse];
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 3 },
      "board",
      "second",
    );
    enemy.peak_defense = 3;
    state.players.second.board = [enemy];
    const drawn = createCard(
      { name: "Drawn", type: "Spell", cost: 1 },
      "deck",
      "first",
    );
    state.players.first.deck = [drawn];
    drawCard(state.players.first.hand, state.players.first.deck, "first");
    expect(Number(enemy.defense)).toBe(2);
  });

  it("opponent's turn: drawing a card does not damage enemy followers", () => {
    setupTurn("second");
    const mouse = createCard("10562120", "board", "first");
    mouse.peak_defense = mouse.defense;
    state.players.first.board = [mouse];
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 3 },
      "board",
      "second",
    );
    enemy.peak_defense = 3;
    state.players.second.board = [enemy];
    const drawn = createCard(
      { name: "Drawn", type: "Spell", cost: 1 },
      "deck",
      "first",
    );
    state.players.first.deck = [drawn];
    drawCard(state.players.first.hand, state.players.first.deck, "first");
    expect(Number(enemy.defense)).toBe(3);
  });
});

describe("During your turn scope — Devotee of Disdain (10341110)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: non-lethal damage draws a Dragoncraft follower", () => {
    const devotee = createCard("10341110", "board", "first");
    devotee.peak_defense = devotee.defense;
    state.players.first.board = [devotee];
    const dcFollower = createCard(
      {
        name: "DCFollower",
        type: "Follower",
        class: "Dragoncraft",
        cost: 2,
        attack: 1,
        defense: 1,
      },
      "deck",
      "first",
    );
    state.players.first.deck = [dcFollower];
    dealDamage(devotee, 1, "first");
    expect(getHand(state, "first").some((c) => c.name === "DCFollower")).toBe(
      true,
    );
  });

  it("opponent's turn: non-lethal damage does not draw", () => {
    setupTurn("second");
    const devotee = createCard("10341110", "board", "first");
    devotee.peak_defense = devotee.defense;
    state.players.first.board = [devotee];
    const dcFollower = createCard(
      {
        name: "DCFollower",
        type: "Follower",
        class: "Dragoncraft",
        cost: 2,
        attack: 1,
        defense: 1,
      },
      "deck",
      "first",
    );
    state.players.first.deck = [dcFollower];
    dealDamage(devotee, 1, "first");
    expect(getHand(state, "first").some((c) => c.name === "DCFollower")).toBe(
      false,
    );
  });
});

describe("During your turn scope — Azurifrit (10344110)", () => {
  beforeEach(() => setupTurn("first"));

  it("owner's turn: non-lethal damage deals 1 to enemy leader", () => {
    const az = createCard("10344110", "board", "first");
    az.peak_defense = az.defense;
    state.players.first.board = [az];
    state.players.second.hp = 20;
    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(19);
  });

  it("opponent's turn: non-lethal damage does not hit enemy leader", () => {
    setupTurn("second");
    const az = createCard("10344110", "board", "first");
    az.peak_defense = az.defense;
    state.players.first.board = [az];
    state.players.second.hp = 20;
    dealDamage(az, 1, "first");
    expect(getHP(state, "second")).toBe(20);
  });
});
