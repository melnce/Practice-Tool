/**
 * Proof: flat destroy pool ≡ nested select pool for Lyanthoth (10664120).
 * Flattening is safe only when (a) pools match and (b) self is excluded,
 * including on the fanfare play path where sourceCard must be populated.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  createCard,
  resetUidCounter,
  givenGameState,
  whenPlayCard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleSelect } from "../../src/logic/core/targeting.js";
import { handleDestroy } from "../../src/logic/effects/ops/destroy/unified.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return (pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [])
    .slice()
    .sort();
}

function poolNames(): string[] {
  return (state.pendingTargetEffect?.pool ?? [])
    .map((c) => String(c.name))
    .sort();
}

describe("Lyanthoth pool equivalence — nested select vs flat destroy", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 9 }).build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("direct handlers: flat pool matches nested pool and excludes self", () => {
    const lyanthoth = createCard(
      {
        name: "Lyanthoth, Eld Tome",
        type: "Follower",
        cost: 9,
        attack: 9,
        defense: 9,
        id: "10664120",
      },
      "board",
      "first",
    );
    const allyF = createCard(
      { name: "AllyF", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const allyA = createCard(
      { name: "AllyA", type: "Amulet", cost: 1, attack: 0, defense: 0 },
      "board",
      "first",
    );
    const enemyF = createCard(
      { name: "EnemyF", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    const enemyA = createCard(
      { name: "EnemyA", type: "Amulet", cost: 1, attack: 0, defense: 0 },
      "board",
      "second",
    );
    state.players.first.board = [lyanthoth, allyF, allyA];
    state.players.second.board = [enemyF, enemyA];

    handleSelect(
      {
        op: "select",
        target: "any:any",
        select: 3,
        condition: { not_self: true },
        effects: [{ op: "destroy", target: "selected" }],
      } as any,
      "first",
      lyanthoth,
      [],
    );
    const nestedUids = poolUids();
    const nestedNames = poolNames();
    (state as any).pendingTargetEffect = null;

    handleDestroy(
      {
        op: "destroy",
        target: "any:any",
        select: 3,
        condition: { not_self: true },
      } as any,
      "first",
      [],
      { owner: "first", sourceCard: lyanthoth },
    );
    const flatUids = poolUids();
    const flatNames = poolNames();

    expect(nestedNames).toEqual(["AllyA", "AllyF", "EnemyA", "EnemyF"]);
    expect(flatNames).toEqual(nestedNames);
    expect(flatUids).toEqual(nestedUids);
    expect(flatUids).not.toContain(String(lyanthoth.uid));
  });

  it("play path (flat form): pending pool excludes Lyanthoth", () => {
    const def = getCardById("10664120");
    expect(def).toBeTruthy();
    const ff = def!.fanfare![0] as any;
    expect(ff.op).toBe("destroy");
    expect(ff.select).toBe(3);
    expect(ff.condition?.not_self).toBe(true);

    state.players.first.pp = 9;
    state.players.first.maxPp = 9;
    const handCard = createCard(def!, "hand", "first");
    state.players.first.hand = [handCard];

    const allyF = createCard(
      { name: "AllyF", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    const allyA = createCard(
      { name: "AllyA", type: "Amulet", cost: 1, attack: 0, defense: 0 },
      "board",
      "first",
    );
    const enemyF = createCard(
      { name: "EnemyF", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    state.players.first.board = [allyF, allyA];
    state.players.second.board = [enemyF];

    whenPlayCard("first", 0);
    const source = findOnBoard("first", "Lyanthoth, Eld Tome")!;
    expect(source).toBeTruthy();
    const uids = poolUids();
    expect(uids).not.toContain(String(source.uid));
    expect(poolNames()).toEqual(["AllyA", "AllyF", "EnemyF"]);
  });
});
