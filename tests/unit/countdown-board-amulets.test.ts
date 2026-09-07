/**
 * Board-amulet countdown targeting: no select → entire matching pool;
 * select / random select → subset behaviour (Rodeo evolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { resetGameState, state } from "../../src/core/gameState.js";
import { handleCountdown } from "../../src/logic/effects/ops/countdown/unified.js";

import "../../src/logic/core/effects/index.js";

const DREAD_PIRATE_FLAG = "90021210";
const RINGS_OF_MOONLIGHT = "90064210";
const BARBAROS = "10924110";
const RODEO = "10764110";

function flagAmulet(countdown: number, name = "Dread Pirate's Flag") {
  const c = createCard(DREAD_PIRATE_FLAG, "board", "first");
  c.name = name;
  c.hasCountdown = true;
  c.countdown = countdown;
  state.players.first.board.push(c);
  return c;
}

function ringsAmulet(countdown: number) {
  const c = createCard(RINGS_OF_MOONLIGHT, "board", "first");
  c.hasCountdown = true;
  c.countdown = countdown;
  state.players.first.board.push(c);
  return c;
}

function otherCountdownAmulet(countdown: number) {
  const c = createCard(
    {
      name: "Bystander Amulet",
      type: "Amulet",
      cost: 1,
      attack: 0,
      defense: 0,
    },
    "board",
    "first",
  );
  c.hasCountdown = true;
  c.countdown = countdown;
  state.players.first.board.push(c);
  return c;
}

describe("board-amulet countdown op", () => {
  beforeEach(() => {
    resetUidCounter();
    resetGameState(1);
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("without select advances every matching amulet in the pool", () => {
    const a = flagAmulet(7);
    const b = flagAmulet(7);
    const bystander = otherCountdownAmulet(4);

    handleCountdown(
      {
        op: "countdown",
        action: "advance",
        target: "ally:amulet",
        filter: { name: "Dread Pirate's Flag" },
        amount: 5,
      } as any,
      { owner: "first" },
    );

    expect(a.countdown).toBe(2);
    expect(b.countdown).toBe(2);
    expect(bystander.countdown).toBe(4);
  });

  it("with select:1 advances exactly one matching amulet (first in pool)", () => {
    const a = flagAmulet(7);
    const b = flagAmulet(7);

    handleCountdown(
      {
        op: "countdown",
        action: "advance",
        target: "ally:amulet",
        filter: { name: "Dread Pirate's Flag" },
        select: 1,
        amount: 5,
      } as any,
      { owner: "first" },
    );

    expect(a.countdown).toBe(2);
    expect(b.countdown).toBe(7);
  });

  it("with select:1 and select_mode random advances exactly one (seeded)", () => {
    resetGameState(1);
    const a = ringsAmulet(3);
    const b = ringsAmulet(3);

    handleCountdown(
      {
        op: "countdown",
        action: "delay",
        board_name: "Rings of Moonlight",
        select: 1,
        select_mode: "random",
        amount: 1,
      } as any,
      { owner: "first" },
    );

    const changed = [a, b].filter((c) => c.countdown === 4);
    const unchanged = [a, b].filter((c) => c.countdown === 3);
    expect(changed).toHaveLength(1);
    expect(unchanged).toHaveLength(1);
  });

  it("name filter excludes non-matching countdown amulets", () => {
    const flag = flagAmulet(7);
    const rings = ringsAmulet(2);
    const bystander = otherCountdownAmulet(6);

    handleCountdown(
      {
        op: "countdown",
        action: "advance",
        target: "ally:amulet",
        filter: { name: "Dread Pirate's Flag" },
        amount: 5,
      } as any,
      { owner: "first" },
    );

    expect(flag.countdown).toBe(2);
    expect(rings.countdown).toBe(2);
    expect(bystander.countdown).toBe(6);
  });

  it("Rodeo evolve delays one random Rings of Moonlight, leaving the other unchanged", () => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstPP(8, 8)
      .withFirstHand([RODEO])
      .withFirstEvo(2)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const ringA = ringsAmulet(1);
    const ringB = ringsAmulet(1);
    whenPlayCard("first", 0);
    const rodeo = findOnBoard("first", "Rodeo, Anathema of Adjudication")!;
    whenEvolve(rodeo, "first");

    const rings = thenBoard("first").filter((c) => c.id === RINGS_OF_MOONLIGHT);
    expect(rings).toHaveLength(3);
    const delayed = rings.filter((c) => Number(c.countdown) === 2);
    const untouched = rings.filter((c) => Number(c.countdown) === 1);
    expect(delayed).toHaveLength(1);
    expect(untouched).toHaveLength(2);
    expect([ringA, ringB].filter((c) => c.countdown === 2)).toHaveLength(1);
  });

  it("Barbaros fanfare advances every Dread Pirate's Flag including the summon", () => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstPP(7, 8)
      .withFirstHand([BARBAROS])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const preFlag = flagAmulet(7);
    whenPlayCard("first", 0);
    const flags = thenBoard("first").filter((c) => c.id === DREAD_PIRATE_FLAG);
    expect(flags).toHaveLength(2);
    expect(preFlag.countdown).toBe(2);
    const summoned = flags.find((f) => f.uid !== preFlag.uid)!;
    expect(summoned.countdown).toBe(2);
  });
});
