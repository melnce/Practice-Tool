/**
 * Set 10009 batch B — Artiglio, Barren-Earth Tyrant, Initiation of Rebirth,
 * Azvaldt, Penitentiary of Chaos.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenBoard,
  thenHand,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { attackLeader } from "../../src/logic/core/combat.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { recordPlayedBaseCost } from "../../src/logic/core/playedBaseCostHistory.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R5 = 5;
const R8 = 8;
const R10 = 10;
const FILLER = "10111310";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[] | Array<{ name: string; type: string; cost?: number }>;
    seed?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
): ReturnType<typeof createCard> {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function alliedFollower(
  atk: number,
  def: number,
  name = "Ally",
): ReturnType<typeof createCard> {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function setAllyAttackedLeaderLastTurn(): void {
  const raider = createCard(
    {
      name: "Raider",
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      hasStorm: true,
      can_attack: true,
      attacks_left: 1,
      attacks_per_turn: 1,
      justPlayed: false,
      hasAttacked: false,
    },
    "board",
    "first",
  );
  state.players.first.board = [raider];
  attackLeader(0, "first", "second");
  whenEndTurn();
  whenEndTurn();
  expect(state.activePlayer).toBe("first");
}

function totalEnemyDefense(): number {
  return thenBoard("second").reduce(
    (sum, c) => sum + (Number(c.defense) || 0),
    0,
  );
}

describe("split_sequential — oldest-first spill (owner-pinned contract)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
  });

  it("deals to oldest follower first and spills remainder after death", () => {
    givenGameState({ seed: 1 })
      .withSecondBoard([
        { name: "Oldest", type: "Follower", defense: 2, attack: 1 },
        { name: "Newest", type: "Follower", defense: 5, attack: 1 },
      ])
      .build();

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 4,
          distribution: "split_sequential",
        },
      ],
      "first",
    );

    expect(findOnBoard("second", "Oldest")).toBeUndefined();
    expect(findOnBoard("second", "Newest")?.defense).toBe(3);
  });

  it("keeps oldest-first order after an intervening follower dies and is removed", () => {
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
    const oldest = enemyFollower(1, 2, "Oldest");
    const middle = enemyFollower(1, 1, "Middle");
    const newest = enemyFollower(1, 5, "Newest");
    expect(state.players.second.board.indexOf(oldest)).toBe(0);
    expect(state.players.second.board.indexOf(newest)).toBe(2);

    middle.defense = 0;
    cleanupDead();
    expect(state.players.second.board.map((c) => c.name)).toEqual([
      "Oldest",
      "Newest",
    ]);

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 4,
          distribution: "split_sequential",
        },
      ],
      "first",
    );

    // Oldest-first: Oldest dies (2), Newest takes 2 → 3 def.
    // Newest-first would leave Oldest at 2 and Newest at 1.
    expect(findOnBoard("second", "Oldest")).toBeUndefined();
    expect(findOnBoard("second", "Newest")?.defense).toBe(3);
  });

  it("Shining Disenchantment LW (10363210): leader takes leftover only after followers", () => {
    const lwKw = (getCardById("10363210")!.keywords as any[]).find(
      (k) => k?.name === "LastWords",
    );
    const splitLw = lwKw.effects[0];

    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
    state.players.second.hp = 20;
    enemyFollower(1, 4, "Soaker");
    runEffects([splitLw], "first", null);
    expect(getHP(state, "second")).toBe(20);
    expect(thenBoard("second")).toHaveLength(0);

    resetUidCounter();
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
    state.players.second.hp = 20;
    enemyFollower(1, 2, "Partial");
    runEffects([splitLw], "first", null);
    expect(getHP(state, "second")).toBe(18);
    expect(findOnBoard("second", "Partial")).toBeUndefined();
  });

  /**
   * OWNER QUESTIONS — Barrier in split path (do not "fix" without owner sign-off):
   * When a follower in the split path has Barrier, applySplitSpillover still
   * subtracts min(remaining, its defense) from the pool even though dealDamage
   * pops Barrier for 0 actual damage. This test pins current engine behaviour.
   */
  it("pins current engine: Barrier follower soaks full defense from split pool", () => {
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
    const ward = enemyFollower(1, 10, "BarrierWall");
    ward.hasBarrier = true;
    const behind = enemyFollower(1, 5, "Behind");
    state.players.second.hp = 20;

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 12,
          distribution: "split_sequential",
        },
      ],
      "first",
    );

    expect(ward.hasBarrier).toBe(false);
    expect(ward.defense).toBe(10);
    expect(behind.defense).toBe(3);
  });
});

describe("10943310 Artiglio", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("without gate: 3 damage split oldest-first across deaths", () => {
    setupTurn(R5, { hand: ["10943310"], pp: 2 });
    enemyFollower(1, 2, "Old");
    enemyFollower(1, 5, "Young");
    const defBefore = totalEnemyDefense();
    whenPlayCard("first", 0);
    expect(defBefore - totalEnemyDefense()).toBe(3);
    expect(findOnBoard("second", "Old")).toBeUndefined();
    expect(findOnBoard("second", "Young")?.defense).toBe(4);
  });

  it("with gate: 6 damage split instead of 3", () => {
    setupTurn(R5, { hand: ["10943310"], pp: 2 });
    setAllyAttackedLeaderLastTurn();
    enemyFollower(1, 2, "Old");
    enemyFollower(1, 5, "Young");
    const defBefore = totalEnemyDefense();
    whenPlayCard("first", 0);
    expect(defBefore - totalEnemyDefense()).toBe(6);
    expect(findOnBoard("second", "Old")).toBeUndefined();
    expect(findOnBoard("second", "Young")?.defense).toBe(1);
  });

  it("empty enemy board: spell is still playable and does nothing", () => {
    setupTurn(R5, { hand: ["10943310"], pp: 2, deck: [FILLER] });
    const spell = thenHand("first")[0]!;
    expect(canPlayCard(spell, "first").ok).toBe(true);
    const ppBefore = state.players.first.pp;
    whenPlayCard("first", 0);
    expect(state.players.first.pp).toBe(ppBefore - 2);
    expect(thenBoard("second")).toHaveLength(0);
  });
});

describe("10943110 Barren-Earth Tyrant", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare without gate: one random hit for 4 total board damage", () => {
    setupTurn(R5, { hand: ["10943110"], pp: 5 });
    enemyFollower(1, 6, "Only");
    const defBefore = Number(findOnBoard("second", "Only")!.defense);
    whenPlayCard("first", 0);
    expect(defBefore - Number(findOnBoard("second", "Only")!.defense)).toBe(4);
  });

  it("Fanfare with gate: two hits on sole enemy for 8 total (random_hits)", () => {
    setupTurn(R5, { hand: ["10943110"], pp: 5 });
    setAllyAttackedLeaderLastTurn();
    enemyFollower(1, 10, "Solo");
    whenPlayCard("first", 0);
    expect(Number(findOnBoard("second", "Solo")!.defense)).toBe(2);
  });

  it("Evolve summons High-Spirited Marauder", () => {
    setupTurn(R5, { hand: ["10943110"], pp: 5 });
    whenPlayCard("first", 0);
    const tyrant = findOnBoard("first", "Barren-Earth Tyrant")!;
    state.players.first.evoCharges = 2;
    onEvolve(tyrant, "first", "normal");
    const marauder = findOnBoard("first", "High-Spirited Marauder");
    expect(marauder).toBeTruthy();
    expect(marauder!.attack).toBe(1);
    expect(marauder!.defense).toBe(2);
  });
});

describe("10901310 Initiation of Rebirth", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("adds highest-base-cost destroyed follower (tie broken randomly), then draws", () => {
    setupTurn(R5, { hand: ["10901310"], pp: 2, deck: [FILLER, FILLER] });
    const cheap = createCard("10001110", "board", "first");
    const priceyA = createCard("10042120", "board", "first");
    const priceyB = createCard("10072120", "board", "first");
    recordDestroyed(state, "first", cheap);
    recordDestroyed(state, "first", priceyA);
    recordDestroyed(state, "first", priceyB);

    const deckBefore = thenDeck("first").length;
    const handBefore = thenHand("first").length;
    whenPlayCard("first", 0);

    expect(thenDeck("first").length).toBe(deckBefore);
    expect(thenHand("first").length).toBe(handBefore);
    const addedName = thenDeck("first")
      .concat(thenHand("first"))
      .find((c) => c.name === priceyA.name || c.name === priceyB.name)?.name;
    expect(addedName).toBeTruthy();
    expect(
      thenDeck("first")
        .concat(thenHand("first"))
        .some((c) => c.name === cheap.name),
    ).toBe(false);
  });

  it("empty destroyed history: no deck add, draw still happens", () => {
    setupTurn(R5, { hand: ["10901310"], pp: 2, deck: [FILLER] });
    const deckBefore = thenDeck("first").length;
    const handBefore = thenHand("first").length;
    whenPlayCard("first", 0);
    expect(thenDeck("first").length).toBe(deckBefore - 1);
    expect(thenHand("first").length).toBe(handBefore);
  });

  it("added copy is fresh base template, not buffed destroyed instance", () => {
    setupTurn(R5, {
      hand: ["10901310"],
      pp: 2,
      deck: [FILLER, FILLER, FILLER],
    });
    const buffed = createCard("10042120", "board", "first");
    buffed.attack = 9;
    buffed.defense = 9;
    recordDestroyed(state, "first", buffed);
    whenPlayCard("first", 0);
    const copy = thenDeck("first")
      .concat(thenHand("first"))
      .find((c) => c.name === buffed.name);
    expect(copy).toBeTruthy();
    expect(copy!.attack).toBe(5);
    expect(copy!.defense).toBe(5);
  });

  it("deterministic under fixed seed (replay-safe RNG)", () => {
    function runOnce(seed: number): string | null {
      resetUidCounter();
      setupTurn(R5, {
        hand: ["10901310"],
        pp: 2,
        deck: [FILLER, FILLER],
        seed,
      });
      const a = createCard("10042120", "board", "first");
      const b = createCard("10072120", "board", "first");
      recordDestroyed(state, "first", a);
      recordDestroyed(state, "first", b);
      whenPlayCard("first", 0);
      return (
        thenDeck("first")
          .concat(thenHand("first"))
          .find((c) => c.name === a.name || c.name === b.name)?.name ?? null
      );
    }
    expect(runOnce(42)).toBe(runOnce(42));
    expect(runOnce(42)).not.toBeNull();
  });
});

describe("10903210 Azvaldt, Penitentiary of Chaos", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("survives end of turn when cost ladder is incomplete", () => {
    setupTurn(R10, { hand: ["10903210"], pp: 8, deck: [FILLER] });
    for (let c = 2; c <= 8; c++) recordPlayedBaseCost(state, "first", c);
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(findOnBoard("first", "Azvaldt, Penitentiary of Chaos")).toBeTruthy();
  });

  it("playing Azvaldt fills the 8 slot and self-destroys at end of turn with Last Words", () => {
    setupTurn(R10, { hand: ["10903210"], pp: 8, deck: [FILLER] });
    for (let c = 1; c <= 7; c++) recordPlayedBaseCost(state, "first", c);
    whenPlayCard("first", 0);
    whenEndTurn();
    expect(
      findOnBoard("first", "Azvaldt, Penitentiary of Chaos"),
    ).toBeUndefined();
  });

  it("Last Words summons up to 4 differently named destroyed followers", () => {
    setupTurn(R10, { hand: ["10903210"], pp: 8, deck: [FILLER] });
    const ids = ["10001110", "10001120", "10002110", "10002120"] as const;
    for (const id of ids) {
      recordDestroyed(state, "first", createCard(id, "graveyard", "first"));
      recordDestroyed(state, "first", createCard(id, "graveyard", "first"));
    }
    for (let c = 1; c <= 7; c++) recordPlayedBaseCost(state, "first", c);
    whenPlayCard("first", 0);
    whenEndTurn();
    const summoned = thenBoard("first").filter((c) =>
      ids.some((id) => c.id === id),
    );
    expect(summoned).toHaveLength(4);
    expect(new Set(summoned.map((c) => c.name)).size).toBe(4);
  });

  it("Last Words summons only available distinct names when fewer than 4", () => {
    setupTurn(R10, { hand: ["10903210"], pp: 8, deck: [FILLER] });
    recordDestroyed(
      state,
      "first",
      createCard("10001110", "graveyard", "first"),
    );
    recordDestroyed(
      state,
      "first",
      createCard("10001120", "graveyard", "first"),
    );
    for (let c = 1; c <= 7; c++) recordPlayedBaseCost(state, "first", c);
    whenPlayCard("first", 0);
    whenEndTurn();
    const revived = thenBoard("first").filter(
      (c) => c.id === "10001110" || c.id === "10001120",
    );
    expect(revived).toHaveLength(2);
  });

  it("Last Words buffs pre-existing and freshly summoned allies +3/+3", () => {
    setupTurn(R10, { hand: ["10903210"], pp: 8, deck: [FILLER] });
    const veteran = alliedFollower(2, 2, "Veteran");
    recordDestroyed(
      state,
      "first",
      createCard("10042120", "graveyard", "first"),
    );
    for (let c = 1; c <= 7; c++) recordPlayedBaseCost(state, "first", c);
    whenPlayCard("first", 0);
    whenEndTurn();
    cleanupDead();
    expect(veteran.attack).toBe(5);
    expect(veteran.defense).toBe(5);
    const revived = findOnBoard("first", "Battleforged Dragon Keeper");
    expect(revived).toBeTruthy();
    expect(revived!.attack).toBe(8);
    expect(revived!.defense).toBe(8);
  });
});
