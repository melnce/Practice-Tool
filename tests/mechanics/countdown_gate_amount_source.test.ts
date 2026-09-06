/**
 * Countdown amount_source + gate is_ally — Temple of Repose, Shining Disenchantment,
 * Sublime Eld Tome, Kandima.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { dispatch } from "../../src/engine.js";

import { handleCountdown } from "../../src/logic/effects/ops/countdown/unified.js";
import {
  getPP,
  getHP,
  getBoard,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
): void {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function gainCrests(owner: "first" | "second", n: number): void {
  for (let i = 0; i < n; i++) {
    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: `Test Crest ${i + 1}`,
        countdown: 4,
      } as any,
      owner,
    );
  }
}

function chooseTarget(uid: string): void {
  dispatch(state, { type: "CHOOSE_TARGET", target: { type: "card", uid } });
  expect(state.pendingTargetEffect).toBeUndefined();
}

function allyAmulet(name = "Allied Amulet"): ReturnType<typeof createCard> {
  const c = createCard(
    { name, type: "Amulet", cost: 2, hasCountdown: true, countdown: 3 },
    "board",
    "first",
  );
  state.players.first.board.push(c);
  return c;
}

function enemyAmulet(name = "Enemy Amulet"): ReturnType<typeof createCard> {
  const c = createCard(
    { name, type: "Amulet", cost: 2, hasCountdown: true, countdown: 3 },
    "board",
    "second",
  );
  state.players.second.board.push(c);
  return c;
}

function enemyFollower(def = 5, name = "Enemy Follower") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("countdown amount_source: crest_count", () => {
  beforeEach(() => {
    resetUidCounter();
    state.activePlayer = "first";
  });

  it("Temple of Repose (10362210) Engage advances by crest count (3 crests → −3)", () => {
    setupTurn(R6, { hand: ["10362210"], pp: 3 });
    gainCrests("first", 3);
    whenPlayCard("first", 0);
    const temple = findOnBoard("first", "Temple of Repose")!;
    expect(temple.countdown).toBe(4);

    engageAmulet("first", state.players.first.board.indexOf(temple));
    expect(temple.countdown).toBe(1);
  });

  it("Temple of Repose (10362210) with 0 crests advances by 0 (no-op)", () => {
    setupTurn(R6, { hand: ["10362210"], pp: 3 });
    expect(getCrests(state, "first")).toHaveLength(0);
    whenPlayCard("first", 0);
    const temple = findOnBoard("first", "Temple of Repose")!;
    expect(temple.countdown).toBe(4);

    engageAmulet("first", state.players.first.board.indexOf(temple));
    expect(temple.countdown).toBe(4);
  });

  it("Shining Disenchantment (10363210) Engage advances by crest count (3 crests → −3)", () => {
    setupTurn(R6, { hand: ["10363210"], pp: 4 });
    gainCrests("first", 3);
    whenPlayCard("first", 0);
    const disc = findOnBoard("first", "Shining Disenchantment")!;
    expect(disc.countdown).toBe(4);

    engageAmulet("first", state.players.first.board.indexOf(disc));
    expect(disc.countdown).toBe(1);
  });

  it("literal amount countdown still advances by fixed amount", () => {
    resetUidCounter();
    state.phase = "main";
    state.activePlayer = "first";
    const amulet = createCard(
      {
        name: "Fixed Advance",
        type: "Amulet",
        hasCountdown: true,
        countdown: 5,
      },
      "board",
      "first",
    );
    state.players.first.board.push(amulet);

    handleCountdown({ op: "countdown", action: "advance", amount: 2 } as any, {
      owner: "first",
      source: amulet,
    });
    expect(amulet.countdown).toBe(3);
  });
});

describe("gate is_ally on selected_matches", () => {
  beforeEach(() => {
    resetUidCounter();
    state.activePlayer = "first";
  });

  it("Sublime Eld Tome (10663210) does not recover PP when destroying enemy amulet", () => {
    setupTurn(R6, { hand: ["10663210"], pp: 4 });
    const foe = enemyAmulet();
    whenPlayCard("first", 0);
    chooseTarget(foe.uid);
    expect(getPP(state, "first")).toBe(0);
  });

  it("Sublime Eld Tome (10663210) recovers 2 PP when destroying allied amulet", () => {
    setupTurn(R6, { hand: ["10663210"], pp: 4 });
    const ally = allyAmulet();
    whenPlayCard("first", 0);
    chooseTarget(ally.uid);
    expect(getPP(state, "first")).toBe(2);
  });

  it("Kandima (10664110) super-evolve does not damage followers when destroying enemy amulet", () => {
    setupTurn(R6, { hand: ["10664110"], pp: 4 });
    const foeAmulet = enemyAmulet();
    const foe = enemyFollower(6);
    whenPlayCard("first", 0);
    const kandima = findOnBoard("first", "Kandima, Sublime Hatred")!;
    state.players.first.superEvoPoints = 1;
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(kandima, "first");
    chooseTarget(foeAmulet.uid);
    expect(foe.defense).toBe(6);
  });

  it("Kandima (10664110) super-evolve deals 3 to all enemy followers when destroying allied amulet", () => {
    setupTurn(R6, { hand: ["10664110"], pp: 4 });
    const ally = allyAmulet();
    const foe = enemyFollower(6);
    whenPlayCard("first", 0);
    const kandima = findOnBoard("first", "Kandima, Sublime Hatred")!;
    state.players.first.superEvoPoints = 1;
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(kandima, "first");
    chooseTarget(ally.uid);
    expect(state.__lastSelected?.uid).toBe(ally.uid);
    expect(foe.defense).toBe(3);
  });

  it("selected_matches without is_ally still passes for enemy amulet type match", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstPP(5, 10)
      .build();
    state.gameStarted = true;
    const foe = enemyAmulet("Gate Target");
    state.__lastSelected = foe;
    whenRunEffects(
      [
        {
          op: "gate",
          condition: "selected_matches",
          type: "Amulet",
          effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
        } as any,
      ],
      "first",
    );
    expect(getHP(state, "second")).toBe(19);
  });
});
