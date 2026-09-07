/**
 * When this follower evolves — effect-granted vs EP-spent evolve scripts.
 * Olivia Q&A 10104110: "Evolve:" runs only on EP; "When this follower evolves"
 * runs on any evolve (evolve_trigger_always / on_any_evolve).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getBoard,
  getCrests,
  getShadows,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const MILTEO = "10554110";
const ORTHRUS = "10153120";
const IZMIR = "10442110";

function fillerFollowers(
  owner: "first" | "second",
  count: number,
  prefix: string,
): void {
  const board = getBoard(state, owner);
  for (let i = 0; i < count; i++) {
    const f = createCard(
      {
        name: `${prefix}${i}`,
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
      },
      "board",
      owner,
    );
    f.peak_defense = 1;
    board.push(f);
  }
}

function gainMilteoCrest(): void {
  const card = getCardById(MILTEO);
  const gain = (card?.superevolve as { op?: string }[] | undefined)?.find(
    (e) => e && typeof e === "object" && e.op === "crest",
  );
  expect(gain).toBeDefined();
  handleGainCrest(gain as Parameters<typeof handleGainCrest>[0], "first");
}

function boardFollowerCount(): number {
  return (
    getBoard(state, "first").filter((c) => c.type === "Follower").length +
    getBoard(state, "second").filter((c) => c.type === "Follower").length
  );
}

describe("When this follower evolves — Milteo, Orthrus, Izmir", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Milteo & Luzen — crest effect-evolve destroys 6 other random followers", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 8 })
      .withFirstPP(10, 10)
      .withFirstHand([MILTEO, MILTEO])
      .build();
    gainMilteoCrest();
    fillerFollowers("first", 4, "A");
    fillerFollowers("second", 5, "B");
    expect(boardFollowerCount()).toBe(9);

    whenPlayCard("first", 0);
    const milteo2 = findOnBoard("first", "Milteo & Luzen")!;
    expect(milteo2.hasEvolved).toBe(true);
    expect(boardFollowerCount()).toBe(4);
  });

  it("Milteo & Luzen — super-evolve via EP gains Crest: Milteo & Luzen", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 8 })
      .withFirstPP(10, 10)
      .withFirstEvo(0)
      .build();
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    state.players.first.evoUsedThisTurn = false;

    const milteo = createCard(MILTEO, "board", "first");
    milteo.peak_defense = milteo.defense;
    state.players.first.board = [milteo];

    handleEvolveSelf(milteo, "first", { mode: "super", spendPoint: true });
    expect(
      getCrests(state, "first").some((c) => c.name.includes("Milteo")),
    ).toBe(true);
  });

  it("Milteo & Luzen — player EP evolve destroys 6 other random followers", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstEvo(2)
      .build();
    fillerFollowers("first", 3, "A");
    fillerFollowers("second", 4, "B");
    const milteo = createCard(MILTEO, "board", "first");
    milteo.peak_defense = milteo.defense;
    state.players.first.board.push(milteo);
    const before = boardFollowerCount();

    handleEvolveSelf(milteo, "first", { mode: "normal", spendPoint: true });
    expect(milteo.hasEvolved).toBe(true);
    expect(boardFollowerCount()).toBe(before - 6);
  });

  it("Orthrus — effect-evolve does not fire Evolve: (no shadow spend)", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstEvo(2)
      .build();
    state.players.first.shadows = 6;
    const orth = createCard(ORTHRUS, "board", "first");
    orth.peak_defense = orth.defense;
    state.players.first.board = [orth];
    fillerFollowers("second", 1, "E");

    handleEvolveSelf(orth, "first", { mode: "normal", spendPoint: false });
    expect(orth.hasEvolved).toBe(true);
    expect(getShadows(state, "first")).toBe(6);
    expect(Number(getBoard(state, "second")[0]!.defense)).toBe(1);
  });

  it("Orthrus — EP evolve fires Evolve: (shadows consumed)", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstEvo(2)
      .build();
    state.players.first.shadows = 6;
    const orth = createCard(ORTHRUS, "board", "first");
    orth.peak_defense = orth.defense;
    state.players.first.board = [orth];
    fillerFollowers("second", 1, "E");

    handleEvolveSelf(orth, "first", { mode: "normal", spendPoint: true });
    expect(getShadows(state, "first")).toBe(2);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Izmir — fanfare effect-evolve runs When this follower evolves (3 AoE)", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
      .withFirstPP(5, 10)
      .withFirstHand([IZMIR])
      .build();

    const e1 = createCard(
      { name: "E1", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    e1.peak_defense = 5;
    const e2 = createCard(
      { name: "E2", type: "Follower", cost: 2, attack: 2, defense: 4 },
      "board",
      "second",
    );
    e2.peak_defense = 4;
    state.players.second.board = [e1, e2];

    whenPlayCard("first", 0);
    const iz = findOnBoard("first", "Izmir, Frigid Fate")!;
    expect(iz.hasEvolved).toBe(true);
    expect(Number(e1.defense)).toBe(2);
    expect(Number(e2.defense)).toBe(1);
  });
});
