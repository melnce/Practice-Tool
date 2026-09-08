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
import { restoreLeaderHP } from "../../src/logic/effects/ops/restore/primitives.js";
import "../../src/logic/core/effects/index.js";

const BURNITE_FLAME = "10144110";
const BURNITE_ASH = "10744110";
const DARKHAVEN_GRACE = "10162210";
const DOSE_OF_HOLINESS = "10162220";

function findCrestGain(
  card: Record<string, unknown>,
): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined;
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

function gainBurniteCrestToSecond(cardId: string): void {
  const card = getCardById(cardId);
  expect(card).toBeDefined();
  const gain = findCrestGain(card as Record<string, unknown>);
  expect(gain).toBeDefined();
  handleGainCrest(gain as any, "first");
}

function setupSecondAtFullWithGrace(
  cardId: string,
  hasCrest: boolean,
): ReturnType<typeof createCard> {
  givenGameState({ seed: 42, activePlayer: "second", roundCount: 6 })
    .withSecondPP(2, 6)
    .withSecondHP(20)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "second";
  if (hasCrest) gainBurniteCrestToSecond(cardId);

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

describe("Mechanic Contract: leader_restored on 0 restore — 10144110 Burnite, Anathema of Flame", () => {
  beforeEach(() => {
    resetUidCounter();
    state.players.first.crests = [];
    state.players.second.crests = [];
  });

  it("10144110 — crest deals 1 when restore at full HP heals 0 (Darkhaven Grace Engage)", () => {
    const ally = setupSecondAtFullWithGrace(BURNITE_FLAME, true);
    engageAmulet("second", 0);
    resolvePendingTarget(ally.uid);
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);

  it("10144110 — crest fires only once per turn on multiple restores", () => {
    const ally = setupSecondAtFullWithGrace(BURNITE_FLAME, true);
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

  it("10144110 — crest still fires exactly once when restore actually heals", () => {
    givenGameState({ seed: 42, activePlayer: "second", roundCount: 6 })
      .withSecondPP(2, 6)
      .withSecondHP(18)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "second";
    gainBurniteCrestToSecond(BURNITE_FLAME);

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

  it("10144110 — positive control: no crest means full-HP restore does not damage leader", () => {
    const ally = setupSecondAtFullWithGrace(BURNITE_FLAME, false);
    engageAmulet("second", 0);
    resolvePendingTarget(ally.uid);
    expect(getHP(state, "second")).toBe(20);
  }, 60_000);

  it("10144110 — leader restored on owner's turn pings; on opponent's turn does not", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHP(20)
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    gainBurniteCrestToSecond(BURNITE_FLAME);

    restoreLeaderHP("second", 1);
    expect(getHP(state, "second")).toBe(20);

    state.activePlayer = "second";
    restoreLeaderHP("second", 1);
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);
});

describe("Mechanic Contract: leader_restored on 0 restore — 10744110 Burnite, Anathema of Ash", () => {
  beforeEach(() => {
    resetUidCounter();
    state.players.first.crests = [];
    state.players.second.crests = [];
  });

  it("10744110 — crest deals 1 when restore at full HP heals 0 (Darkhaven Grace Engage)", () => {
    const ally = setupSecondAtFullWithGrace(BURNITE_ASH, true);
    engageAmulet("second", 0);
    resolvePendingTarget(ally.uid);
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);

  it("10744110 — crest fires only once per turn on multiple restores", () => {
    const ally = setupSecondAtFullWithGrace(BURNITE_ASH, true);
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

  it("10744110 — crest still fires exactly once when restore actually heals", () => {
    givenGameState({ seed: 42, activePlayer: "second", roundCount: 6 })
      .withSecondPP(2, 6)
      .withSecondHP(18)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "second";
    gainBurniteCrestToSecond(BURNITE_ASH);

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

  it("10744110 — positive control: no crest means full-HP restore does not damage leader", () => {
    const ally = setupSecondAtFullWithGrace(BURNITE_ASH, false);
    engageAmulet("second", 0);
    resolvePendingTarget(ally.uid);
    expect(getHP(state, "second")).toBe(20);
  }, 60_000);

  it("10744110 — leader restored on owner's turn pings; on opponent's turn does not", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHP(20)
      .withSecondHP(20)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    gainBurniteCrestToSecond(BURNITE_ASH);

    restoreLeaderHP("second", 1);
    expect(getHP(state, "second")).toBe(20);

    state.activePlayer = "second";
    restoreLeaderHP("second", 1);
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);
});
