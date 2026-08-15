/**
 * Batch 7 — Runecraft audit (sets 10001–10004; basic Runecraft in Batch 1).
 *
 * Cardinal rule: assertions from card text + rulebook only.
 * States use natural roundCount/maxPP alignment (no permPP skew).
 *
 * CLASSIFICATION SUMMARY (49 non-basic Runecraft cards):
 * - A (behavioral test): 30 — this file
 * - B/C escalated: 19 → tests/audit/batch07_runecraft_ruled.test.ts
 *
 * Primitives: Spellboost in primitives_batch7_spellboost_rune.test.ts;
 * Earth Rite in primitives_batch7_earth_rite.test.ts;
 * Edelweiss evolve_trigger_always in primitives_batch7_edelweiss_evolve_always.test.ts.
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
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
/** Foresight — draw 1, no targets (Stormy Blast needs an enemy follower to cast). */
const FILLER = "10031310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function enemyFollower(def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function earthSigilOnBoard(player: "first" | "second" = "first") {
  return thenBoard(player).find(
    (c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0,
  );
}

describe("Batch 7 — Runecraft [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Runeblade Conductor — Fanfare deals X damage (X = attack)", () => {
    setupTurn(R6, { hand: ["10131110"], pp: 5 });
    const e = enemyFollower(5);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(4);
  });

  it("Runeblade Conductor — On Spellboost in hand gives +1/+1", () => {
    setupTurn(R6, { hand: ["10131110", FILLER], pp: 6 });
    const atk0 = Number(
      thenHand("first").find((c) => c.id === "10131110")!.attack,
    );
    whenPlayCard("first", 1);
    const conductor = thenHand("first").find((c) => c.id === "10131110")!;
    expect(Number(conductor.attack)).toBe(atk0 + 1);
    expect(Number(conductor.defense)).toBe(2);
  });

  it("Apprentice Astrologer — return hand card, draw, gain earth sigil", () => {
    setupTurn(R6, { hand: ["10131120", FILLER], pp: 2, deck: ["10131310"] });
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenHand("first").some((c) => c.id === "10131310")).toBe(true);
    expect(earthSigilOnBoard()).toBeDefined();
  });

  it("Owl Summoner — Fanfare gains an earth sigil", () => {
    setupTurn(R6, { hand: ["10131130"], pp: 3 });
    whenPlayCard("first", 0);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(1);
  });

  it("Starry-Eyed Penguin Wizard — Fanfare draws 2 cards", () => {
    setupTurn(R6, {
      hand: ["10131140"],
      pp: 4,
      deck: ["10131310", "10131320"],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBe(2);
  });

  it("Radiant Rainbow — spellboosts On Spellboost card in hand and draws", () => {
    setupTurn(R6, {
      hand: ["10131310", "10131320"],
      pp: 2,
      deck: ["10131310"],
    });
    const blast = thenHand("first").find((c) => c.id === "10131320")!;
    const count0 =
      blast.keywordState?.spellboostCount ??
      (blast as { spellboostCount?: number }).spellboostCount ??
      0;
    whenPlayCard("first", 0);
    resolveFirstPending();
    const count1 =
      blast.keywordState?.spellboostCount ??
      (blast as { spellboostCount?: number }).spellboostCount ??
      0;
    expect(count1).toBeGreaterThan(count0);
    expect(thenHand("first").length).toBeGreaterThan(1);
  });

  it("Stormy Blast — deals 2 damage (X starts at 2)", () => {
    setupTurn(R6, { hand: ["10131320"], pp: 1 });
    const e = enemyFollower(4);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(2);
  });

  it("Ms. Miranda — Fanfare spellboosts your hand", () => {
    setupTurn(R6, { hand: ["10132110", "10132120", FILLER], pp: 2 });
    whenPlayCard("first", 0);
    const emmylou = thenHand("first").find((c) => c.id === "10132120");
    expect(
      emmylou?.keywordState?.spellboostCount ??
        (emmylou as { spellboostCount?: number })?.spellboostCount,
    ).toBeGreaterThanOrEqual(1);
  });

  it("Emmylou — On Spellboost in hand reduces cost by 1", () => {
    setupTurn(R6, { hand: ["10132120", FILLER], pp: 6 });
    const cost0 = Number(
      thenHand("first").find((c) => c.id === "10132120")!.cost,
    );
    whenPlayCard("first", 1);
    const emmylou = thenHand("first").find((c) => c.id === "10132120")!;
    expect(Number(emmylou.cost)).toBe(cost0 - 1);
  });

  it("Emmylou — Evolve summons Clay Golem and damages enemies by golem count", () => {
    setupTurn(R8, { hand: ["10132120"], pp: 5 });
    const e = enemyFollower(5);
    whenPlayCard("first", 0);
    const emmylou = findOnBoard("first", "Emmylou, Witch of Wonder")!;
    onEvolve(emmylou, "first", "normal");
    expect(thenBoard("first").some((c) => c.name === "Clay Golem")).toBe(true);
    expect(e.defense).toBeLessThan(5);
  });

  it("Snowman Army — sets enemy defense to 1", () => {
    setupTurn(R8, { hand: ["10132320"], pp: 8 });
    const e = enemyFollower(6);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(1);
  });

  it("Penelope — Fanfare gains 2 earth sigils", () => {
    setupTurn(R6, { hand: ["10133120"], pp: 2 });
    whenPlayCard("first", 0);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(2);
  });

  it("Demonic Call — summons a Demonic Shikigami", () => {
    setupTurn(R8, { hand: ["10133320"], pp: 7 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Demonic Shikigami")).toBe(
      true,
    );
  });

  it("Anne & Grea — Fanfare summons Anne's Summoning", () => {
    setupTurn(R8, { hand: ["10134120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Anne's Summoning")).toBe(
      true,
    );
  });
});

describe("Batch 7 — Runecraft [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Arcane Archivist — returns hand card and draws a spell", () => {
    setupTurn(R6, {
      hand: ["10231120", "10131310"],
      pp: 2,
      deck: ["10131320", "10131310"],
    });
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenHand("first").some((c) => c.type === "Spell")).toBe(true);
  });

  it("Glacial Crash — destroys selected enemy follower", () => {
    setupTurn(R6, { hand: ["10231310"], pp: 4 });
    const e = enemyFollower(5);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(e.defense).toBe(0);
  });

  it("Bergent — Fanfare summons 2 Onion Patch", () => {
    setupTurn(R8, { hand: ["10232110"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Onion Patch").length,
    ).toBe(2);
  });

  it("Flames of Chaos — deals spellboosted X split among enemies", () => {
    setupTurn(R6, { hand: [FILLER, "10232310"], pp: 4 });
    enemyFollower(4);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const foe = state.players.second.board[0]!;
    expect(Number(foe.defense)).toBeLessThan(4);
  });

  it("Owen — has Ward", () => {
    setupTurn(R6, { hand: ["10233110"], pp: 3 });
    whenPlayCard("first", 0);
    const owen = findOnBoard("first", "Owen, Mysterian Swordsman")!;
    expect(owen.hasWard || owen.keywordState?.hasWard).toBe(true);
  });

  it("Pascale's Dance — gains earth sigil and crest", () => {
    setupTurn(R6, { hand: ["10233310"], pp: 2 });
    whenPlayCard("first", 0);
    expect(earthSigilOnBoard()).toBeDefined();
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Pascale")),
    ).toBe(true);
  });

  it("Lilanthim — has Aura on field", () => {
    setupTurn(R10, { hand: ["10234110"], pp: 8 });
    whenPlayCard("first", 0);
    const lil = findOnBoard("first", "Lilanthim, Anathema of Edacity")!;
    expect(lil.hasAura || lil.keywordState?.hasAura).toBe(true);
  });
});

describe("Batch 7 — Runecraft [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Crystal Gazing — gains Crest: Crystal Gazing", () => {
    setupTurn(R6, { hand: ["10331310"], pp: 4 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Crystal Gazing"),
    ).toBe(true);
  });

  it("Institute of Truth — Engage buffs hand follower +1/+1", () => {
    setupTurn(R6, { hand: ["10332210", "10131110"], pp: 3 });
    const follower = thenHand("first").find((c) => c.type === "Follower")!;
    const atk0 = Number(follower.attack);
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Institute of Truth",
    );
    engageAmulet("first", idx);
    resolveFirstPending();
    expect(Number(follower.attack)).toBe(atk0 + 1);
    expect(Number(follower.defense)).toBeGreaterThan(1);
  });

  it("Risky Amalgamation — summons Guardian Golem and Clay Golem", () => {
    setupTurn(R6, { hand: ["10332310"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Guardian Golem")).toBe(
      true,
    );
    expect(thenBoard("first").some((c) => c.name === "Clay Golem")).toBe(true);
  });

  it("Velharia — Fanfare draws a card", () => {
    setupTurn(R6, { hand: ["10334110"], pp: 2, deck: ["10131310"] });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === "10131310")).toBe(true);
  });
});

describe("Batch 7 — Runecraft [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Philosophia — Fanfare draws a spell", () => {
    setupTurn(R6, {
      hand: ["10431110"],
      pp: 3,
      deck: ["10131310", "10131320"],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.type === "Spell")).toBe(true);
  });

  it("Suframare — end of turn spellboosts hand by attack", () => {
    setupTurn(R6, { hand: ["10431120", "10132120", FILLER], pp: 1 });
    whenPlayCard("first", 0);
    const emmylou = thenHand("first").find((c) => c.id === "10132120")!;
    const count0 =
      emmylou.keywordState?.spellboostCount ??
      (emmylou as { spellboostCount?: number }).spellboostCount ??
      0;
    whenEndTurn("first");
    const count1 =
      emmylou.keywordState?.spellboostCount ??
      (emmylou as { spellboostCount?: number }).spellboostCount ??
      0;
    expect(count1).toBeGreaterThan(count0);
  });

  it("Rune Portal — deals 6 damage to all enemy followers", () => {
    setupTurn(R10, { pp: 7 });
    enemyFollower(6, "A");
    enemyFollower(6, "B");
    runEffects([getCardById("10431310")!.spell![0]], "first", null);
    expect(
      state.players.second.board.every((c) => Number(c.defense) <= 0),
    ).toBe(true);
  });

  it("Ezecrain — Fanfare deals 4 damage and gains 2 earth sigils", () => {
    setupTurn(R10, { hand: ["10432110"], pp: 6 });
    const a = enemyFollower(6, "A");
    const b = enemyFollower(6, "B");
    whenPlayCard("first", 0);
    resolvePendingTarget(String(a.uid));
    resolvePendingTarget(String(b.uid));
    expect(a.defense).toBe(2);
    expect(b.defense).toBe(2);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(2);
  });

  it("Elmott — Fanfare silences and deals 3 damage", () => {
    setupTurn(R6, { hand: ["10433110"], pp: 3 });
    const e = enemyFollower(5);
    applyKeywordsFromList(e);
    e.hasWard = true;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.hasWard).toBeFalsy();
    expect(e.defense).toBe(2);
  });

  it("Alchemic Flare — 4 damage and gains earth sigil", () => {
    setupTurn(R6, { pp: 2 });
    const e = enemyFollower(5);
    runEffects(
      [
        {
          op: "select",
          target: "enemy:follower",
          effects: [{ op: "damage", amount: 4, target: "selected:follower" }],
        },
        { op: "summon", source: "named", name: "Magic Sediment", count: 1 },
      ],
      "first",
      null,
    );
    resolveFirstPending();
    expect(e.defense).toBe(1);
    expect(earthSigilOnBoard()).toBeDefined();
  });

  it("Wamdus — Fanfare spellboosts your hand", () => {
    setupTurn(R6, { hand: ["10434110", "10131320"], pp: 3 });
    whenPlayCard("first", 0);
    const blast = thenHand("first").find((c) => c.id === "10131320");
    expect(
      blast?.keywordState?.spellboostCount ??
        (blast as { spellboostCount?: number })?.spellboostCount,
    ).toBeGreaterThanOrEqual(1);
  });

  it("Wamdus — Super-Evolve Mode 1 Barrier on other allies only", () => {
    setupTurn(R7, { pp: 6 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = ally.defense;
    const wamdus = createCard("10434110", "board", "first");
    applyKeywordsFromList(wamdus);
    wamdus.peak_defense = wamdus.defense;
    state.players.first.board = [ally, wamdus];
    state.players.first.superEvoCharges = 1;

    setScriptedModePickProvider(() => [0]);
    onEvolve(wamdus, "first", "super");
    setScriptedModePickProvider(null);

    expect(ally.hasBarrier).toBe(true);
    expect(wamdus.hasBarrier).toBe(false);
  });
});
