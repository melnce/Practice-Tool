/**
 * Set 10005 — Blossoming Fate: behavioral tests for newly authored cards.
 *
 * Covers non-trivial targeting, triggers, gates, modes, crests, enhance,
 * and class-mechanic interactions. Stubbed / blocked cards are not tested.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { getHP, getCrests, getPP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: Array<string | Record<string, unknown>>;
    pp?: number;
    deck?: Array<string | Record<string, unknown>>;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand as any);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck as any);
  b.build();
  state.gameStarted = true;
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("Set 10005 — Blossoming Fate", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fate of the World — draw 2 and destroy highest-attack enemy follower", () => {
    setupTurn(R6, {
      hand: ["10503310"],
      pp: 5,
      deck: [
        { name: "D1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D2", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ],
    });
    enemyFollower(2, 5, "Low");
    enemyFollower(5, 3, "High");
    whenPlayCard("first", 0);
    expect(
      thenHand("first").some((c) => c.name === "D1" || c.name === "D2"),
    ).toBe(true);
    expect(thenBoard("second").some((c) => c.name === "High")).toBe(false);
    expect(thenBoard("second").some((c) => c.name === "Low")).toBe(true);
  });

  it("Battledore Woodsmaiden — Fanfare Fairy; Pixie enter damages enemy leader", () => {
    setupTurn(R6, { hand: ["10511120"], pp: 5 });
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Fairy")).toBe(true);
    expect(getHP(state, "second")).toBe(19);
  });

  it("Flight of the Swarmpetal — split 3 damage and add Fairy", () => {
    setupTurn(R6, { hand: ["10511310"], pp: 2 });
    const a = enemyFollower(1, 2, "A");
    const b = enemyFollower(1, 2, "B");
    whenPlayCard("first", 0);
    const dmg =
      2 -
      Number(a.defense) +
      (2 - Number(b.defense)) +
      thenBoard("second")
        .filter((c) => c.defense <= 0)
        .reduce((s, c) => s + 0, 0);
    // Total damage dealt across the board should be 3 (split)
    const remaining =
      thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      ) + (Number(a.defense) <= 0 ? 0 : 0);
    const startDef = 4;
    const endDef = thenBoard("second").reduce(
      (s, c) => s + Math.max(0, Number(c.defense)),
      0,
    );
    expect(startDef - endDef).toBe(3);
    expect(thenHand("first").some((c) => c.name === "Fairy")).toBe(true);
  });

  it("Quiet Encouragement — Combo (3) deals 2 to all enemies instead of 1", () => {
    setupTurn(R6, {
      hand: ["10111310", "10111310", "10512310"],
      pp: 5,
    });
    state.players.second.hp = 20;
    enemyFollower(1, 3, "E");
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(18);
    expect(Number(thenBoard("second")[0]!.defense)).toBe(1);
  });

  it("Grace of the Swarmpetal — draw X = Combo", () => {
    setupTurn(R6, {
      hand: ["10111310", "10111310", "10513310"],
      pp: 5,
      deck: [
        { name: "A", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "B", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "C", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ],
    });
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const handBefore = thenHand("first").length;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(handBefore - 1 + 2);
  });

  it("Miroku — Mode 2 recovers 2 PP", () => {
    (globalThis as any).HEADLESS = false;
    injectAdapter({
      showChoiceModal: (_opts: unknown, cb: (i: number) => void) => cb(1),
    });
    setupTurn(R6, { hand: ["10514120"], pp: 3 });
    whenPlayCard("first", 0);
    expect(getPP(state, "first")).toBe(2); // spent 3, recovered 2 → 2 if max 6? wait
    // Play cost 3 from pp 3 → 0, then recover 2 → 2
    expect(getPP(state, "first")).toBe(2);
  });

  it("Serenity's Shield — Enhance (4) summons 4 Knights", () => {
    setupTurn(R6, { hand: ["10522310"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Knight").length).toBe(
      4,
    );
  });

  it("Unmoving Tactician — EOT summons Steelclad Knight", () => {
    setupTurn(R6, { hand: ["10523110"], pp: 4 });
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(thenBoard("first").some((c) => c.name === "Steelclad Knight")).toBe(
      true,
    );
  });

  it("Insomniac Witch — Fanfare crest; Evolve destroys it", () => {
    setupTurn(R7, { hand: ["10532110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Insomniac Witch"),
    ).toBe(true);
    const witch = findOnBoard("first", "Insomniac Witch")!;
    onEvolve(witch, "first", "normal");
    expect(
      getCrests(state, "first").some((c) => c.name === "Insomniac Witch"),
    ).toBe(false);
  });

  it("Terraforming Wizard — Fanfare gains 2 earth sigils (merged Magic Sediment)", () => {
    setupTurn(R6, { hand: ["10531110"], pp: 3 });
    whenPlayCard("first", 0);
    const sediments = thenBoard("first").filter(
      (c) => c.name === "Magic Sediment",
    );
    expect(sediments.length).toBe(1);
    expect(Number(sediments[0]!.counters?.earth ?? 0)).toBe(2);
  });

  it("Springwell Steward — Evolve deals 5 to selected enemy", () => {
    setupTurn(R7, { hand: ["10541110"], pp: 2 });
    whenPlayCard("first", 0);
    const e1 = enemyFollower(1, 6, "E1");
    const steward = findOnBoard("first", "Springwell Steward")!;
    onEvolve(steward, "first", "normal");
    resolveFirstPending();
    expect(Number(e1.defense)).toBe(1);
  });

  it("Jellyfish Dancer — Marine enter grants Rush and Bane", () => {
    setupTurn(R6, { hand: ["10542120"], pp: 2 });
    whenPlayCard("first", 0);
    const jelly = findOnBoard("first", "Jellyfish Dancer")!;
    const marine = createCard(
      {
        name: "Majestic Megalorca",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        tribes: ["Marine"],
      },
      "board",
      "first",
    );
    state.players.first.board.push(marine);
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: marine,
      enteringOwner: "first",
    });
    expect(
      !!(jelly.hasRush || jelly.keywordState?.hasRush) &&
        !!(jelly.hasBane || jelly.keywordState?.hasBane),
    ).toBe(true);
  });

  it("Sloth of the Crestpetal — Overflow also hits enemy leader", () => {
    setupTurn(R8, { hand: ["10543310"], pp: 2 });
    // Overflow typically maxPP >= 7
    state.players.first.maxPP = 7;
    state.players.second.hp = 20;
    enemyFollower(1, 5, "E");
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(18);
  });

  it("Erntz — Evolve removes Ward and gives Intimidate", () => {
    setupTurn(R10, { hand: ["10544110"], pp: 10 });
    whenPlayCard("first", 0);
    const erntz = findOnBoard("first", "Erntz, Governing Justice")!;
    expect(erntz.hasWard || erntz.keywordState?.hasWard).toBeTruthy();
    onEvolve(erntz, "first", "normal");
    expect(erntz.hasWard || erntz.keywordState?.hasWard).toBeFalsy();
    expect(
      erntz.hasIntimidate || erntz.keywordState?.hasIntimidate,
    ).toBeTruthy();
  });

  it("Crimson Soulmancer — Fanfare Reanimate (2); Evolve replicates", () => {
    setupTurn(R6, { hand: ["10551120"], pp: 4 });
    state.players.first.graveyard.push(
      createCard("90051110", "graveyard", "first"),
    );
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Skeleton")).toBe(true);
    const necro = findOnBoard("first", "Crimson Soulmancer")!;
    const before = thenBoard("first").length;
    state.players.first.graveyard.push(
      createCard("90051110", "graveyard", "first"),
    );
    onEvolve(necro, "first", "normal");
    expect(thenBoard("first").length).toBeGreaterThan(before);
  });

  it("Friendly Blue Ogre — gives Can't Attack until opponent turn end", () => {
    setupTurn(R6, { hand: ["10552120"], pp: 5 });
    const e = enemyFollower(3, 3, "Target");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.keywordState?.cantAttack).toBe(true);
  });

  it("Prescient Priestess — Fanfare damage; Evolve replicates", () => {
    setupTurn(R6, { hand: ["10561110"], pp: 3 });
    const e = enemyFollower(1, 4, "E");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(e.defense)).toBe(2);
    const priest = findOnBoard("first", "Prescient Priestess")!;
    const e2 = enemyFollower(1, 4, "E2");
    onEvolve(priest, "first", "normal");
    resolveFirstPending();
    expect(Number(e2.defense) === 2 || Number(e.defense) === 0).toBe(true);
  });

  it("Saint of Rehabilitation — leader restore summons Fox of Purity", () => {
    setupTurn(R6, { hand: ["10563110"], pp: 5 });
    state.players.first.hp = 15;
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Fox of Purity")).toBe(
      true,
    );
  });

  it("Marionette Master — Fanfare summons Enhanced Puppet and Puppet", () => {
    setupTurn(R6, { hand: ["10571110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Enhanced Puppet")).toBe(
      true,
    );
    expect(thenBoard("first").some((c) => c.name === "Puppet")).toBe(true);
  });

  it("New-Age Cartographer — Fanfare adds Ominous Artifact β", () => {
    setupTurn(R6, { hand: ["10572110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Ominous Artifact β")).toBe(
      true,
    );
  });

  it("Support Wolf — Enhance (6) grants +0/+6, Bane, Barrier", () => {
    setupTurn(R6, { hand: ["10551110"], pp: 6 });
    whenPlayCard("first", 0);
    const wolf = findOnBoard("first", "Support Wolf")!;
    expect(Number(wolf.defense)).toBeGreaterThanOrEqual(8);
    expect(wolf.hasBane || wolf.keywordState?.hasBane).toBeTruthy();
    expect(wolf.hasBarrier || wolf.keywordState?.hasBarrier).toBeTruthy();
  });

  it("Flowering Friendship — Combo (5) summons a copy and evolves both", () => {
    setupTurn(R6, {
      hand: ["10111310", "10111310", "10111310", "10111310", "10512110"],
      pp: 6,
    });
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const friends = thenBoard("first").filter(
      (c) => c.name === "Flowering Friendship",
    );
    expect(friends.length).toBe(2);
    expect(friends.every((c) => c.hasEvolved)).toBe(true);
  });

  it("Metamorphosis of the Dawnblossom — discard then draw 2", () => {
    setupTurn(R6, {
      hand: ["10531310", { name: "Trash", type: "Spell", cost: 1 }],
      pp: 2,
      deck: [
        { name: "D1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D2", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ],
    });
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenHand("first").some((c) => c.name === "Trash")).toBe(false);
    expect(
      thenHand("first").some((c) => c.name === "D1" || c.name === "D2"),
    ).toBe(true);
  });
});
