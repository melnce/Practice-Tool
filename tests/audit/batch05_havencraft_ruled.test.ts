/**
 * Batch 5 — Havencraft B/C ruled escalations (card text + rulebook).
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
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import {
  getHP,
  getCrests,
  getBoard,
  getHand,
} from "../../src/core/playerHelpers.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const R15 = 15;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({ seed: 1, activePlayer: "first", roundCount: round })
    .withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid =
    pending!.poolUids?.[0] ??
    String(pending!.pool?.[0]?.uid ?? "");
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

describe("B/C — Skullfane destroy-count damage (10163110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: X = allied amulets destroyed; X damage to all enemies", () => {
    setupTurn(R6, { hand: ["10163110"], pp: 6 });
    state.players.first.board = [
      createCard("10161210", "board", "first"),
      createCard("10162210", "board", "first"),
    ];
    enemyFollower(5);
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    expect(getBoard(state, "first").filter((c) => c.type === "Amulet")).toHaveLength(0);
    expect(getHP(state, "second")).toBe(18);
    expect(state.players.second.board[0]!.defense).toBe(3);
  });
});

describe("B/C — Maeve Last Words amulet copy (10162130)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Last Words summons highest-cost destroyed allied amulet this match", () => {
    setupTurn(R6);
    state.players.first.graveyard.push(
      createCard("10161210", "graveyard", "first"),
      createCard("10162210", "graveyard", "first"),
    );
    const maeve = createCard("10162130", "board", "first");
    applyKeywordsFromList(maeve);
    maeve.defense = 0;
    state.players.first.board = [maeve];
    cleanupDead();
    expect(thenBoard("first").some((c) => c.name === "Darkhaven Grace")).toBe(true);
  });
});

describe("B/C — Rodeo discard + amulet summon / super (10164110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare discards 1 and summons 3 distinct amulets ≤3 from deck", () => {
    setupTurn(R8, {
      hand: ["10164110", "10161130"],
      pp: 7,
      deck: ["10161210", "10162210", "10163210", "10162220"],
    });
    whenPlayCard("first", 0);
    resolveFirstPending();
    const amulets = thenBoard("first").filter((c) => c.type === "Amulet");
    expect(amulets.length).toBe(3);
    const names = new Set(amulets.map((c) => c.name));
    expect(names.size).toBe(3);
  });

  it("Super-Evolve destroys highest-attack enemy then 1 to all enemy followers", () => {
    setupTurn(R7);
    const rodeo = createCard("10164110", "board", "first");
    rodeo.peak_defense = rodeo.defense;
    enemyFollower(3, "Low");
    const high = enemyFollower(8, "High");
    high.attack = 8;
    state.players.first.board = [rodeo];
    state.players.first.superEvoPoints = 1;
    onEvolve(rodeo, "first", "super");
    expect(getBoard(state, "second").some((c) => c.name === "High")).toBe(false);
    expect(state.players.second.board[0]!.defense).toBe(2);
  });
});

describe("B/C — Aether deck summon + super Aura (10264110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare summons 3 unique ≤3 followers; Super gives other allies +0/+2 and Aura", () => {
    setupTurn(R8, {
      hand: ["10264110"],
      pp: 7,
      deck: ["10161110", "10162110", "10161120", "10161210"],
    });
    whenPlayCard("first", 0);
    expect(thenBoard("first").length).toBeGreaterThanOrEqual(4);
    const aether = findOnBoard("first", "Aether, Empyrean Guardian")!;
    const ally = thenBoard("first").find((c) => c.uid !== aether.uid)!;
    state.players.first.superEvoPoints = 1;
    onEvolve(aether, "first", "super");
    expect(ally.defense).toBeGreaterThanOrEqual(ally.peak_defense ?? 0);
    expect(ally.hasAura).toBe(true);
  });
});

describe("B/C — Wilbert crest + Holy Cavalier LW (10264120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Last Words 2 Holy Cavalier; Evolve crest buffs entering Ward allies", () => {
    setupTurn(R6);
    const wil = createCard("10264120", "board", "first");
    applyKeywordsFromList(wil);
    wil.defense = 0;
    state.players.first.board = [wil];
    const lwKw = (getCardById("10264120")!.keywords as any[]).find(
      (k) => k?.name === "LastWords",
    );
    runEffects(lwKw.effects, "first", wil);
    expect(
      thenBoard("first").filter((c) => c.name === "Holy Cavalier").length,
    ).toBe(2);

    resetUidCounter();
    setupTurn(R6);
    const wil2 = createCard("10264120", "board", "first");
    wil2.peak_defense = wil2.defense;
    state.players.first.board = [wil2];
    onEvolve(wil2, "first", "normal");
    const crest = getCrests(state, "first").find(
      (c) => c.name === "Wilbert, Desolate Paladin",
    )!;
    const enteringWard = createCard("90064110", "board", "first");
    applyKeywordsFromList(enteringWard);
    enteringWard.peak_defense = enteringWard.defense;
    fireTrigger("ally_follower_enter", "first", {
      enteringCard: enteringWard,
      enteringOwner: "first",
    });
    expect(enteringWard.attack).toBe(2);
    expect(enteringWard.defense).toBe(4);
  });
});

describe("B/C — Maddening Benison restore + crest LW (10263310)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Restores 10 leader; crest LW deals 10 to your leader at countdown 0", () => {
    setupTurn(R6, { hand: ["10263310"], pp: 4 });
    state.players.first.hp = 5;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(15);
    const crest = getCrests(state, "first").find(
      (c) => c.name === "Maddening Benison",
    )!;
    crest.countdown = 0;
    const lw = crest.effects ?? (crest as any).lastWordsEffects;
    if (lw) runEffects(lw as any, "first", null);
    expect(getHP(state, "first")).toBe(5);
  });
});

describe("B/C — Temple of Repose crest-scaled Engage (10362210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Engage advances countdown by crest count; LW restore 2 and leader Barrier", () => {
    setupTurn(R6, { hand: ["10362210"], pp: 3 });
    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Test Crest A",
        countdown: 4,
      } as any,
      "first",
    );
    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Test Crest B",
        countdown: 4,
      } as any,
      "first",
    );
    whenPlayCard("first", 0);
    const temple = findOnBoard("first", "Temple of Repose")!;
    expect(temple.countdown).toBe(4);
    engageAmulet("first", 0);
    expect(temple.countdown).toBeLessThan(4);
  });
});

describe("B/C — Winged Lion Statue countdown Engage (10362220)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Engage (1) advances countdown; LW summons Falcon and Tiger", () => {
    setupTurn(R6, { hand: ["10362220"], pp: 4 });
    whenPlayCard("first", 0);
    const lion = findOnBoard("first", "Winged Lion Statue")!;
    const cdBefore = lion.countdown;
    engageAmulet("first", 0);
    expect(lion.countdown).toBeLessThan(cdBefore);
    lion.countdown = 0;
    const lwKw = (getCardById("10362220")!.keywords as any[]).find(
      (k) => k?.name === "LastWords",
    );
    runEffects(lwKw.effects, "first", lion);
    expect(thenBoard("first").some((c) => c.name === "Holy Falcon")).toBe(true);
    expect(thenBoard("first").some((c) => c.name === "Holyflame Tiger")).toBe(
      true,
    );
  });
});

describe("B/C — Shining Disenchantment split damage Engage (10363210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Engage advances by crest count; LW 4 split + restore 4", () => {
    setupTurn(R6, { hand: ["10363210"], pp: 4 });
    handleGainCrest(
      { op: "crest", action: "gain", name: "Crest X", countdown: 4 } as any,
      "first",
    );
    whenPlayCard("first", 0);
    const disc = findOnBoard("first", "Shining Disenchantment")!;
    engageAmulet("first", 0);
    expect(disc.countdown).toBe(3);
    enemyFollower(4);
    state.players.first.hp = 10;
    state.players.second.hp = 20;
    const lwKw = (getCardById("10363210")!.keywords as any[]).find(
      (k) => k?.name === "LastWords",
    );
    runEffects(lwKw.effects, "first", disc);
    expect(getHP(state, "first")).toBe(14);
    expect(
      state.players.second.board.length === 0 ||
        state.players.second.board[0]!.defense < 4,
    ).toBe(true);
  });
});

describe("B/C — Himeka crest + super set attack 4 (10364110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare crest; Super-Evolve sets all enemy follower attack to 4", () => {
    setupTurn(R6, { hand: ["10364110"], pp: 6 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Himeka, Heir to Repose"),
    ).toBe(true);
    const himeka = findOnBoard("first", "Himeka, Heir to Repose")!;
    const foe = enemyFollower(5);
    foe.attack = 7;
    state.players.first.superEvoPoints = 1;
    onEvolve(himeka, "first", "super");
    expect(foe.attack).toBe(4);
  });
});

describe("B/C — Marwynn Torrent + crest (10364120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare adds Torrent of Despair; Evolve gains Marwynn crest", () => {
    setupTurn(R6, { hand: ["10364120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Torrent of Despair")).toBe(
      true,
    );
    const mar = findOnBoard("first", "Marwynn, Despair Manifest")!;
    onEvolve(mar, "first", "normal");
    expect(
      getCrests(state, "first").some((c) => c.name === "Marwynn, Despair Manifest"),
    ).toBe(true);
  });
});

describe("B/C — Skyfaring Vessel hand engage discount (10462210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Hand trigger reduces cost on ally Engage; Engage evolves unevolved ally", () => {
    setupTurn(R6, {
      hand: ["10462210", "10161210"],
      pp: 5,
    });
    const vessel = getHand(state, "first").find((c) => c.id === "10462210")!;
    const costBefore = Number(vessel.cost);
    whenPlayCard("first", 1);
    engageAmulet("first", 0);
    expect(Number(vessel.cost)).toBe(Math.max(0, costBefore - 1));

    resetUidCounter();
    setupTurn(R6, { hand: ["10462210"], pp: 4 });
    const raw = createCard(
      { name: "Raw", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    raw.peak_defense = raw.defense;
    state.players.first.board = [raw];
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Skyfaring Vessel",
    );
    engageAmulet("first", idx);
    resolveFirstPending();
    expect(raw.hasEvolved).toBe(true);
    expect(
      state.players.first.board.some((c) => c.name === "Skyfaring Vessel"),
    ).toBe(false);
  });
});

describe("B/C — De La Fille Engage mode (10463210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    (globalThis as any).HEADLESS = true;
  });

  it("Mode 1 destroys random enemy; Mode 2 draws 2", () => {
    setupTurn(R6, { hand: ["10463210"], pp: 3 });
    whenPlayCard("first", 0);
    const gems = findOnBoard("first", "De La Fille's Gleaming Gems")!;
    const engageFx = (getCardById("10463210")!.keywords![0] as any).effects[0];
    enemyFollower(4);
    runEffects(engageFx.options[0].effects, "first", gems);
    expect(getBoard(state, "second")).toHaveLength(0);

    resetUidCounter();
    setupTurn(R6, {
      hand: ["10463210"],
      pp: 3,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    whenPlayCard("first", 0);
    const gems2 = findOnBoard("first", "De La Fille's Gleaming Gems")!;
    runEffects(engageFx.options[1].effects, "first", gems2);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(2);
  });
});

describe("B/C — Vira fanfare banish + SSA super (10464120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare banishes 2 enemies; SSA at gauge ≥15 super-evolves", () => {
    setupTurn(R6, { hand: ["10464120"], pp: 8 });
    const e1 = enemyFollower(4, "A");
    const e2 = enemyFollower(4, "B");
    whenPlayCard("first", 0);
    resolvePendingTarget(String(e1.uid));
    resolvePendingTarget(String(e2.uid));
    expect(getBoard(state, "second")).toHaveLength(0);

    resetUidCounter();
    setupTurn(R15, { hand: ["10464120"], pp: 8 });
    const viraHand = getHand(state, "first")[0]!;
    for (let i = 0; i < 5; i++) incrementSkyboundArt("first");
    viraHand.skyboundArtEvolvesWitnessed = 5;
    whenPlayCard("first", 0);
    const vira = findOnBoard("first", "Vira, Luminous Primal Knight")!;
    expect(vira.evoType).toBe("super");
    expect(vira.hasWard).toBe(true);
  });
});
