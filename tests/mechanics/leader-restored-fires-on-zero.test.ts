/**
 * @file Mechanic Contract: leader_restored fires on 0 net restore (official Q&A 10144110)
 *
 * Crest: Burnite, Anathema of Flame — "Once on each of your turns, when your leader's
 * defense is restored, deal 1 damage to it" activates even when restore heals 0 (full HP).
 *
 * Sabotage: reverting `restoreLeaderHP` to `if (healed > 0)` before firing leaves HP at 20
 * in the zero-restore and positive-control cases below.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { getHP } from "../../src/core/playerHelpers.js";
import { createCard } from "../harness/builders.js";
import "../../src/logic/core/effects/index.js";

const BURNITE = "10144110";
const DARKHAVEN_GRACE = "10162210";
const DOSE_OF_HOLINESS = "10162220";
const BURNITE_FLAME_CREST = "Burnite, Anathema of Flame";

function findCrestGain(card: Record<string, unknown>): unknown {
  let found: unknown;
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const rec = obj as Record<string, unknown>;
    if (rec.op === "crest" && rec.action === "gain") found = rec;
    if (Array.isArray(obj)) obj.forEach(walk);
    else Object.values(rec).forEach(walk);
  }
  walk(card);
  return found;
}

function gainBurniteCrestToSecond(): void {
  const card = getCardById(BURNITE);
  expect(card).toBeDefined();
  const gain = findCrestGain(card as Record<string, unknown>);
  expect(gain).toBeDefined();
  handleGainCrest(gain as any, "first");
}

function setupSecondAtFullWithGrace(
  hasCrest: boolean,
): ReturnType<typeof createCard> {
  givenGameState({ seed: 42, activePlayer: "second", roundCount: 6 })
    .withSecondPP(2, 6)
    .withSecondHP(20)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "second";
  if (hasCrest) gainBurniteCrestToSecond();

  const grace = createCard(DARKHAVEN_GRACE, "board", "second");
  applyKeywordsFromList(grace);
  const ally = createCard(
    { name: "EngageAlly", type: "Follower", cost: 1, attack: 1, defense: 1 },
    "board",
    "second",
  );
  ally.peak_defense = 1;
  state.players.second.board = [grace, ally];
  return ally;
}

describe("Mechanic Contract: leader_restored on 0 restore", () => {
  beforeEach(() => {
    resetUidCounter();
    state.players.first.crests = [];
    state.players.second.crests = [];
  });

  it("Burnite crest deals 1 when restore at full HP heals 0 (Darkhaven Grace Engage)", () => {
    const ally = setupSecondAtFullWithGrace(true);
    engageAmulet("second", 0);
    resolvePendingTarget(ally.uid);
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);

  it("Burnite crest fires only once per turn on multiple restores", () => {
    const ally = setupSecondAtFullWithGrace(true);
    const dose = createCard(DOSE_OF_HOLINESS, "board", "second");
    applyKeywordsFromList(dose);
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    enemy.peak_defense = 2;
    state.players.first.board = [enemy];
    state.players.second.board.push(dose);

    engageAmulet("second", 0);
    resolvePendingTarget(ally.uid);
    expect(getHP(state, "second")).toBe(19);

    engageAmulet("second", 1);
    resolvePendingTarget(enemy.uid);
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);

  it("Burnite crest still fires exactly once when restore actually heals", () => {
    givenGameState({ seed: 42, activePlayer: "second", roundCount: 6 })
      .withSecondPP(2, 6)
      .withSecondHP(18)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "second";
    gainBurniteCrestToSecond();

    const grace = createCard(DARKHAVEN_GRACE, "board", "second");
    applyKeywordsFromList(grace);
    const ally = createCard(
      { name: "EngageAlly", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "second",
    );
    ally.peak_defense = 1;
    state.players.second.board = [grace, ally];

    engageAmulet("second", 0);
    resolvePendingTarget(ally.uid);
    expect(getHP(state, "second")).toBe(18);
  }, 60_000);

  it("positive control: no crest means full-HP restore does not damage leader", () => {
    setupSecondAtFullWithGrace(false);
    engageAmulet("second", 0);
    expect(getHP(state, "second")).toBe(20);
  }, 60_000);
});
