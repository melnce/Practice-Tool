/**
 * Batch 7 — Runecraft B/C ruled escalations (card text + rulebook).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
  thenBoard,
  whenEndTurn,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import {
  getHP,
  getCrests,
  getBoard,
  getPP,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const FILLER = "10131320";

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
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

describe("B/C — Sagelight Teachings mode (10132310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Mode 1 gains 4 earth sigils", () => {
    setupTurn(R6, { hand: ["10132310"], pp: 3 });
    const mode1 = (
      getCardById("10132310")!.spell![0] as {
        options: { effects: unknown[] }[];
      }
    ).options[0].effects;
    runEffects(mode1, "first", null);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(4);
  });

  it("Mode 2 restores 4 defense to your leader", () => {
    setupTurn(R6, { hand: ["10132310"], pp: 3 });
    state.players.first.hp = 10;
    const mode2 = (
      getCardById("10132310")!.spell![0] as {
        options: { effects: unknown[] }[];
      }
    ).options[1].effects;
    runEffects(mode2, "first", null);
    expect(getHP(state, "first")).toBe(14);
  });
});

describe("B/C — William spellboost AoE (10132130)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: X damage to all enemies after spellboosts in hand", () => {
    setupTurn(R8, { hand: ["10132130"], pp: 6 });
    enemyFollower(4, "A");
    enemyFollower(4, "B");
    const william = thenHand("first")[0]!;
    spellboostHand("first", 2, william);
    whenPlayCard("first", 0);
    const totalDef = state.players.second.board.reduce(
      (s, c) => s + Number(c.defense),
      0,
    );
    expect(totalDef).toBeLessThan(8);
  });
});

describe("B/C — Juno earth sigil damage (10133110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: X damage equals earth sigil stack", () => {
    setupTurn(R8, { hand: ["10133110"], pp: 5 });
    const sigil = createCard(
      { name: "Sediment", type: "Amulet", cost: 1 },
      "board",
      "first",
    );
    sigil.counters = { earth: 3 };
    state.players.first.board = [sigil];
    const e = enemyFollower(6);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(3);
  });
});

describe("B/C — Edelweiss Earth Rite evolve (10133130)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare Earth Rite (2) evolves and runs 4 damage + 2 PP recover", () => {
    setupTurn(R6, { hand: ["10133130"], pp: 4 });
    const enemy = enemyFollower(5);
    const sigil = createCard(
      { name: "Sediment", type: "Amulet", cost: 1 },
      "board",
      "first",
    );
    sigil.counters = { earth: 2 };
    state.players.first.board = [sigil];
    whenPlayCard("first", 0);
    const ed = state.players.first.board.find((c) =>
      c.name?.includes("Edelweiss"),
    );
    expect(ed?.hasEvolved).toBe(true);
    expect(enemy.defense).toBe(1);
    expect(getPP(state, "first")).toBe(2);
  });
});

describe("B/C — Homework Time transform at 5 boost (10133310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("After 5 spellboosts in hand, transforms to Looking Smart!", () => {
    setupTurn(R6, {
      hand: ["10133310"],
      pp: 3,
      deck: ["10131310", "10131310"],
    });
    const homework = thenHand("first")[0]!;
    spellboostHand("first", 5, homework);
    expect(thenHand("first").some((c) => c.name === "Looking Smart!")).toBe(
      true,
    );
  });
});

describe("B/C — Kuon three shikigami (10134110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare summons Celestial, Demonic, and Paper Shikigami", () => {
    setupTurn(R10, { hand: ["10134110"], pp: 7 });
    whenPlayCard("first", 0);
    const names = thenBoard("first").map((c) => c.name);
    expect(names).toContain("Celestial Shikigami");
    expect(names).toContain("Demonic Shikigami");
    expect(names).toContain("Paper Shikigami");
  });
});

describe("B/C — Dimension Climb spellboost cost (10134310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("On Spellboost in hand reduces cost by 1", () => {
    setupTurn(R10, { hand: ["10134310"], pp: 10 });
    const climb = thenHand("first").find((c) => c.id === "10134310")!;
    const cost0 = Number(climb.cost);
    spellboostHand("first", 1, climb);
    expect(Number(climb.cost)).toBe(cost0 - 1);
  });
});

describe("B/C — Melvie brew + super-evolved gate (10231110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("With super-evolved ally, Fanfare gains 2 earth sigils", () => {
    setupTurn(R6, { hand: ["10231110"], pp: 2 });
    const ally = createCard("10133130", "board", "first");
    ally.evoType = "super";
    ally.hasEvolved = true;
    ally.peak_defense = ally.defense;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Witch's New Brew")).toBe(
      true,
    );
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(2);
  });

  it("Without super-evolved ally, Fanfare adds brew only", () => {
    setupTurn(R6, { hand: ["10231110"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Witch's New Brew")).toBe(
      true,
    );
    expect(earthSigilOnBoard()).toBeUndefined();
  });
});

describe("B/C — Enchanting Perfumer replicate (10232120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve replicates Fanfare damage and earth sigil", () => {
    setupTurn(R6, { hand: ["10232120"], pp: 4 });
    const e = enemyFollower(5);
    const def0 = Number(e.defense);
    whenPlayCard("first", 0);
    resolveFirstPending();
    const perf = findOnBoard("first", "Enchanting Perfumer")!;
    const sigilsBefore = earthSigilOnBoard()?.counters?.earth ?? 0;
    onEvolve(perf, "first", "normal");
    resolveFirstPending();
    expect(Number(e.defense)).toBeLessThan(def0);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThan(sigilsBefore);
  });
});

describe("B/C — Norman mode + replicate (10234120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve replicates Fanfare (Guardian Golem with Earth Rite)", () => {
    setupTurn(R10, { hand: ["10234120"], pp: 6 });
    const sigil = createCard(
      { name: "Sediment", type: "Amulet", cost: 1 },
      "board",
      "first",
    );
    sigil.counters = { earth: 2 };
    state.players.first.board = [sigil];
    whenPlayCard("first", 0);
    if (state.pendingModeChoice) state.pendingModeChoice.selectedIndex = 0;
    const golemsAfterFanfare = thenBoard("first").filter(
      (c) => c.name === "Guardian Golem",
    ).length;
    const norman = findOnBoard("first", "Norman, Adamant Alchemist")!;
    onEvolve(norman, "first", "normal");
    if (state.pendingModeChoice) state.pendingModeChoice.selectedIndex = 0;
    expect(
      thenBoard("first").filter((c) => c.name === "Guardian Golem").length,
    ).toBeGreaterThan(golemsAfterFanfare);
  });
});

describe("B/C — restore leader default (engine scope)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("target leader without player heals self; enemy:leader heals opponent", () => {
    setupTurn(R6);
    state.players.first.hp = 10;
    state.players.second.hp = 10;
    runEffects([{ op: "restore", target: "leader", amount: 2 }], "first", null);
    expect(getHP(state, "first")).toBe(12);
    expect(getHP(state, "second")).toBe(10);

    runEffects(
      [{ op: "restore", target: "enemy:leader", amount: 3 }],
      "first",
      null,
    );
    expect(getHP(state, "first")).toBe(12);
    expect(getHP(state, "second")).toBe(13);
  });
});

describe("B/C — Devotee cost gate (10331110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("At printed cost 2, Fanfare does not restore leader", () => {
    setupTurn(R6, { hand: ["10331110"], pp: 2 });
    state.players.first.hp = 14;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(14);
  });

  it("When effective cost is not 2, Fanfare restores 3 leader defense", () => {
    setupTurn(R6, { hand: ["10331110"], pp: 1 });
    state.players.first.hp = 14;
    const dev = thenHand("first")[0]!;
    dev.cost = 1;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(17);
  });
});

describe("B/C — Supplicant cost gate (10332110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("If cost isn't 5, Fanfare draws 2 after damaging others", () => {
    setupTurn(R8, {
      hand: ["10332110"],
      pp: 4,
      deck: ["10131310", "10131320"],
    });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 4 },
      "board",
      "first",
    );
    ally.peak_defense = 4;
    state.players.first.board = [ally];
    const sup = thenHand("first")[0]!;
    sup.cost = 4;
    whenPlayCard("first", 0);
    expect(ally.defense).toBe(1);
    expect(thenHand("first").length).toBe(2);
  });

  it("At printed cost 5, Fanfare does not draw 2", () => {
    setupTurn(R8, {
      hand: ["10332110"],
      pp: 5,
      deck: ["10131310", "10131320"],
    });
    const deckBefore = state.players.first.deck.length;
    whenPlayCard("first", 0);
    expect(state.players.first.deck.length).toBe(deckBefore);
  });
});

describe("B/C — Congregant copies (10333110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("If cost isn't 3, Fanfare summons 2 exact copies", () => {
    setupTurn(R6);
    const cong = createCard("10333110", "hand", "first");
    applyKeywordsFromList(cong);
    cong.cost = 4;
    state.players.first.hand = [cong];
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Congregant of Truth").length,
    ).toBe(3);
  });

  it("At printed cost 3, Fanfare does not summon extra copies", () => {
    setupTurn(R6, { hand: ["10333110"], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Congregant of Truth").length,
    ).toBe(1);
  });
});

describe("B/C — Ascetic replicate shikigami (10331120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve replicates Fanfare Paper Shikigami summon", () => {
    setupTurn(R6, { hand: ["10331120"], pp: 4 });
    whenPlayCard("first", 0);
    const asc = findOnBoard("first", "Ascetic of Wuxing")!;
    const countBefore = thenBoard("first").filter(
      (c) => c.name === "Paper Shikigami",
    ).length;
    onEvolve(asc, "first", "normal");
    expect(
      thenBoard("first").filter((c) => c.name === "Paper Shikigami").length,
    ).toBeGreaterThan(countBefore);
  });
});

describe("B/C — Institute cost-changed trigger (10332210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Playing a follower whose cost was changed draws and advances countdown", () => {
    setupTurn(R6, {
      hand: ["10332210", "10331110"],
      pp: 5,
      deck: ["10131310", "10131320", "10131310"],
    });
    whenPlayCard("first", 0);
    const institute = findOnBoard("first", "Institute of Truth")!;
    const cd0 = Number(institute.countdown);
    const deck0 = state.players.first.deck.length;

    const dev = thenHand("first").find((c) => c.id === "10331110")!;
    dev.base_cost = 2;
    dev.cost = 1;

    whenPlayCard("first", 0);
    expect(state.players.first.deck.length).toBe(deck0 - 1);
    expect(Number(institute.countdown)).toBe(cd0 - 1);
  });
});

describe("B/C — Illusory Conjuration (10333310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Spell: +1 cost on selected hand follower and destroys random enemy", () => {
    setupTurn(R6, { hand: ["10333310", "10331110"], pp: 2 });
    enemyFollower(4);
    const dev = thenHand("first").find((c) => c.type === "Follower")!;
    const cost0 = getEffectiveCost(dev);
    whenPlayCard("first", 0);
    // Drive hand-follower selection explicitly (same nested_effects path as Institute Engage cost)
    const pending = state.pendingTargetEffect;
    expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(
      0,
    );
    resolvePendingTarget(String(dev.uid));
    expect(getEffectiveCost(dev)).toBe(cost0 + 1);
    expect(getBoard(state, "second")).toHaveLength(0);
  });
});

describe("B/C — Raio hand transform (10334120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare transforms a random spell in hand into Ersatz Elimination", () => {
    setupTurn(R10, { hand: ["10334120", "10131310", "10131320"], pp: 9 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Ersatz Elimination")).toBe(
      true,
    );
  });

  it("transformed Ersatz Elimination costs 0 until end of turn", () => {
    setupTurn(R10, { hand: ["10334120", "10131310", "10131320"], pp: 9 });
    whenPlayCard("first", 0);
    const ersatz = thenHand("first").find(
      (c) => c.name === "Ersatz Elimination",
    )!;
    expect(getEffectiveCost(ersatz)).toBe(0);
    expect((ersatz as any).temp_cost_set_until_eot).toBe(true);
    whenEndTurn();
    // After own EOT, clearTempHandCostMods restores base cost
    const after = thenHand("first").find(
      (c) => c.name === "Ersatz Elimination",
    );
    if (after) {
      expect(getEffectiveCost(after)).toBe(4);
    }
  });
});

describe("B/C — Unleashed mode (10432310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Mode 1 draws and deals 4 to a random enemy follower", () => {
    setupTurn(R6, { hand: ["10432310"], pp: 4, deck: ["10131310"] });
    enemyFollower(5);
    whenPlayCard("first", 0);
    if (state.pendingModeChoice) state.pendingModeChoice.selectedIndex = 0;
    expect(thenHand("first").length).toBeGreaterThan(0);
    const foe = state.players.second.board[0];
    expect(foe == null || Number(foe.defense) < 5).toBe(true);
  });
});

describe("B/C — Mireille Earth Rite evolve (10432120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare summons token; Earth Rite (2) evolves both", () => {
    setupTurn(R8, { hand: ["10432120"], pp: 5 });
    const sigil = createCard(
      { name: "Sediment", type: "Amulet", cost: 1 },
      "board",
      "first",
    );
    sigil.counters = { earth: 2 };
    state.players.first.board = [sigil];
    whenPlayCard("first", 0);
    const duo = thenBoard("first").filter((c) => c.name?.includes("Mireille"));
    expect(duo.some((c) => c.hasEvolved)).toBe(true);
  });
});

describe("B/C — Cagliostro earth + brew (10434120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare gains 2 earth sigils and adds Ars Magna to hand", () => {
    setupTurn(R6, { hand: ["10434120"], pp: 4 });
    whenPlayCard("first", 0);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(2);
    expect(thenHand("first").some((c) => c.name === "Ars Magna")).toBe(true);
  });
});
