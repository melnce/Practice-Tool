/**
 * Set 10009 — Revenants batch A (8 cards).
 * Jailor, Ripper-Clawed Thief, High-Spirited Marauder, Antemaria,
 * Void Colonel Crystallize, Miraculous Al-mi'raj Crystallize,
 * Cutthroat, Istyndet vs. Mitilykket.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenBoard,
  thenHand,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getGraveyard,
  getDeck,
  getCrests,
} from "../../src/core/playerHelpers.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[] | Array<{ name: string; type: string; cost?: number }>;
    active?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
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

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function stormRaider(name = "Raider") {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      hasStorm: true,
      can_attack: true,
      attacks_left: 1,
      justPlayed: false,
      hasAttacked: false,
    },
    "board",
    "first",
  );
  state.players.first.board.push(c);
  return c;
}

function setupTurnAfterAllyLeaderAttack(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[] | Array<{ name: string; type: string; cost?: number }>;
    active?: "first" | "second";
  } = {},
) {
  setupTurn(round, opts);
  stormRaider();
  attackLeader(0, "first", "second");
  endTurnBlue();
  endTurnRed();
}

describe("Set 10009 batch A — C1 Jailor of Antiquity", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: selected enemy takes 6; exactly one other enemy takes 2 (not the selected)", () => {
    setupTurn(R6, { hand: ["10901110"], pp: 6 });
    const primary = enemyFollower(1, 10, "Primary");
    const splashA = enemyFollower(1, 10, "SplashA");
    const splashB = enemyFollower(1, 10, "SplashB");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(primary.defense)).toBe(4);
    const others = [splashA, splashB];
    const damaged = others.filter((c) => Number(c.defense) === 8);
    expect(damaged.length).toBe(1);
    expect(Number(primary.defense)).toBe(4);
  });
});

describe("Set 10009 batch A — C2 Ripper-Clawed Thief", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare grants Storm after ally attacked leader last turn", () => {
    setupTurnAfterAllyLeaderAttack(R6, { hand: ["10941110"], pp: 1 });
    whenPlayCard("first", 0);
    const thief = findOnBoard("first", "Ripper-Clawed Thief")!;
    expect(thief.hasStorm).toBe(true);
  });

  it("Fanfare does not grant Storm without ally leader attack last turn", () => {
    setupTurn(R6, { hand: ["10941110"], pp: 1 });
    whenPlayCard("first", 0);
    const thief = findOnBoard("first", "Ripper-Clawed Thief")!;
    expect(thief.hasStorm).toBeFalsy();
  });

  it("Last Words adds copy to hand without Last Words; second death adds nothing", () => {
    setupTurn(R6, { hand: ["10941110"], pp: 1 });
    whenPlayCard("first", 0);
    const thief = findOnBoard("first", "Ripper-Clawed Thief")!;
    thief.defense = 0;
    cleanupDead();
    const copy = thenHand("first").find((c) => c.name === "Ripper-Clawed Thief");
    expect(copy).toBeTruthy();
    expect(copy!.hasLastWords).toBeFalsy();
    const copyIdx = getHand(state, "first").findIndex(
      (c) => c.name === "Ripper-Clawed Thief",
    );
    state.players.first.pp = 1;
    whenPlayCard("first", copyIdx);
    const copyOnBoard = findOnBoard("first", "Ripper-Clawed Thief")!;
    const handBeforeSecondDeath = getHand(state, "first").length;
    copyOnBoard.defense = 0;
    cleanupDead();
    expect(getHand(state, "first").length).toBe(handBeforeSecondDeath);
  });
});

describe("Set 10009 batch A — C3 High-Spirited Marauder", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Strike buff is live before combat damage — kills a 2-defense follower", () => {
    setupTurnAfterAllyLeaderAttack(R6, { hand: ["10942110"], pp: 2 });
    const foe = enemyFollower(1, 2, "Victim");
    whenPlayCard("first", 0);
    const marauder = findOnBoard("first", "High-Spirited Marauder")!;
    marauder.hasStorm = true;
    marauder.can_attack = true;
    marauder.attacks_left = 1;
    marauder.justPlayed = false;
    attackFollower(0, 0, "first", "second");
    expect(getBoard(state, "second").length).toBe(0);
  });
});

describe("Set 10009 batch A — C4 Antemaria, Piercing Convict", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare grants Storm when condition met; Rush always present", () => {
    setupTurnAfterAllyLeaderAttack(R10, { hand: ["10944110"], pp: 7 });
    whenPlayCard("first", 0);
    const ant = findOnBoard("first", "Antemaria, Piercing Convict")!;
    expect(ant.hasStorm).toBe(true);
    expect(ant.hasRush).toBe(true);
  });

  it("Fanfare skips Storm when condition not met; Rush remains", () => {
    setupTurn(R10, { hand: ["10944110"], pp: 7 });
    whenPlayCard("first", 0);
    const ant = findOnBoard("first", "Antemaria, Piercing Convict")!;
    expect(ant.hasStorm).toBeFalsy();
    expect(ant.hasRush).toBe(true);
  });
});

describe("Set 10009 batch A — C5 Void Colonel Crystallize", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Crystallize (2) places countdown 4 amulet; expiry summons Ward + Last Words follower", () => {
    setupTurn(R6, { hand: ["10952110"], pp: 2 });
    playCardNoRender(getHand(state, "first"), "first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Void Colonel" && c.type === "Follower"),
    ).toBe(false);
    const amulet = findOnBoard("first", "Void Colonel")!;
    expect(amulet.type).toBe("Amulet");
    expect(Number(amulet.countdown)).toBe(4);

    amulet.countdown = 0;
    cleanupDead();

    const colonel = findOnBoard("first", "Void Colonel")!;
    expect(colonel.type).toBe("Follower");
    expect(colonel.hasWard).toBe(true);
    expect(colonel.hasLastWords).toBe(true);
  });
});

describe("Set 10009 batch A — C6 Miraculous Al-mi'raj Crystallize", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Crystallize + Engage advances countdown; summon has Storm; Engage blocked at 0 PP", () => {
    setupTurn(R6, { hand: ["10962120"], pp: 2 });
    playCardNoRender(getHand(state, "first"), "first", 0);
    const amulet = findOnBoard("first", "Miraculous Al-mi'raj")!;
    expect(amulet.type).toBe("Amulet");
    expect(Number(amulet.countdown)).toBe(3);

    const idx = getBoard(state, "first").indexOf(amulet);
    engageAmulet("first", idx);
    expect(Number(amulet.countdown)).toBe(2);
    expect(getPP(state, "first")).toBe(0);

    whenEndTurn();
    whenEndTurn();
    expect(Number(amulet.countdown)).toBe(1);

    state.players.first.pp = 1;
    engageAmulet("first", idx);
    cleanupDead();
    expect(Number(amulet.countdown)).toBe(0);

    const raj = findOnBoard("first", "Miraculous Al-mi'raj")!;
    expect(raj.type).toBe("Follower");
    expect(raj.hasStorm).toBe(true);

    resetUidCounter();
    setupTurn(R6, { hand: ["10962120"], pp: 1 });
    playCardNoRender(getHand(state, "first"), "first", 0);
    const amulet2 = findOnBoard("first", "Miraculous Al-mi'raj")!;
    const idx2 = getBoard(state, "first").indexOf(amulet2);
    engageAmulet("first", idx2);
    engageAmulet("first", idx2);
    expect(amulet2.countdown).toBe(3);
  });
});

describe("Set 10009 batch A — C7 Cutthroat, Fluxblade Convict", () => {
  const HIGHLANDER_FILLER = [
    { name: "SingletonA", type: "Follower" as const, cost: 1 },
    { name: "SingletonB", type: "Spell" as const, cost: 2 },
    { name: "SingletonC", type: "Follower" as const, cost: 3 },
  ];

  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve banishes deck copies then gains crest when deck becomes singleton", () => {
    setupTurn(R6, {
      hand: ["10974110"],
      pp: 2,
      deck: [
        { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
        { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
        ...HIGHLANDER_FILLER,
      ],
    });
    whenPlayCard("first", 0);
    const cut = findOnBoard("first", "Cutthroat, Fluxblade Convict")!;
    state.players.first.evoCharges = 2;
    onEvolve(cut, "first", "normal");
    expect(
      getDeck(state, "first").filter(
        (c) => c.name === "Cutthroat, Fluxblade Convict",
      ).length,
    ).toBe(0);
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Cutthroat, Fluxblade Convict",
      ),
    ).toBe(true);
  });

  it("Evolve does not gain crest when duplicates remain after banish", () => {
    setupTurn(R6, {
      hand: ["10974110"],
      pp: 2,
      deck: [
        { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
        { name: "Cutthroat, Fluxblade Convict", type: "Follower", cost: 2 },
        { name: "DupFodder", type: "Follower", cost: 1 },
        { name: "DupFodder", type: "Follower", cost: 1 },
      ],
    });
    whenPlayCard("first", 0);
    const cut = findOnBoard("first", "Cutthroat, Fluxblade Convict")!;
    state.players.first.evoCharges = 2;
    onEvolve(cut, "first", "normal");
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Cutthroat, Fluxblade Convict",
      ),
    ).toBe(false);
  });

  it("Crest auto-evolves first follower played each turn only once", () => {
    setupTurn(R6, {
      hand: ["10974110", "90011110", "90011110"],
      pp: 6,
      deck: HIGHLANDER_FILLER,
    });
    state.players.first.evoCharges = 2;
    whenPlayCard("first", 0);
    const cut = findOnBoard("first", "Cutthroat, Fluxblade Convict")!;
    onEvolve(cut, "first", "normal");

    whenPlayCard("first", 0);
    const firstFairy = findOnBoard("first", "Fairy")!;
    expect(firstFairy.hasEvolved).toBe(true);

    whenPlayCard("first", 0);
    const fairies = thenBoard("first").filter((c) => c.name === "Fairy");
    const unevolved = fairies.filter((c) => !c.hasEvolved);
    expect(unevolved.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Set 10009 batch A — C8 Istyndet vs. Mitilykket", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare: 3 reanimates from graveyard then 2 damage to all enemy followers (not leader)", () => {
    setupTurn(R10, { hand: ["10954110"], pp: 7 });
    const cheap = [
      createCard("90011110", "graveyard", "first"),
      createCard("90011120", "graveyard", "first"),
      createCard("90031130", "graveyard", "first"),
    ];
    getGraveyard(state, "first").push(...cheap);
    const foeA = enemyFollower(2, 5, "FoeA");
    const foeB = enemyFollower(2, 5, "FoeB");
    const hpBefore = getHP(state, "second");
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.type === "Follower").length,
    ).toBeGreaterThanOrEqual(3);
    expect(Number(foeA.defense)).toBe(3);
    expect(Number(foeB.defense)).toBe(3);
    expect(getHP(state, "second")).toBe(hpBefore);
  });

  it("Fanfare with empty graveyard still damages enemy followers", () => {
    setupTurn(R10, { hand: ["10954110"], pp: 7 });
    const foe = enemyFollower(2, 5, "FoeOnly");
    whenPlayCard("first", 0);
    expect(Number(foe.defense)).toBe(3);
  });

  it("Crest end of turn destroys LW ally and one enemy follower when LW ally present", () => {
    setupTurn(R10, { hand: ["10954110"], pp: 7 });
    state.players.first.superEvoCharges = 1;
    whenPlayCard("first", 0);
    const isty = findOnBoard("first", "Istyndet vs. Mitilykket")!;
    onEvolve(isty, "first", "super");

    const lwAlly = createCard(
      {
        name: "LWAlly",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 3,
        hasLastWords: true,
        lastWordsEffects: [{ op: "draw", source: "deck", count: 1 }],
      },
      "board",
      "first",
    );
    lwAlly.peak_defense = 3;
    state.players.first.board.push(lwAlly);
    enemyFollower(2, 4, "Foe1");
    enemyFollower(2, 4, "Foe2");

    whenEndTurn();
    expect(findOnBoard("first", "LWAlly")).toBeUndefined();
    expect(getBoard(state, "second").length).toBe(1);
  });

  it("Crest end of turn does nothing without allied Last Words", () => {
    setupTurn(R10, { hand: ["10954110"], pp: 7 });
    state.players.first.superEvoCharges = 1;
    whenPlayCard("first", 0);
    const isty = findOnBoard("first", "Istyndet vs. Mitilykket")!;
    onEvolve(isty, "first", "super");

    const plain = createCard(
      { name: "Plain", type: "Follower", cost: 2, attack: 2, defense: 3 },
      "board",
      "first",
    );
    state.players.first.board.push(plain);
    enemyFollower(2, 4, "Foe1");
    enemyFollower(2, 4, "Foe2");

    whenEndTurn();
    expect(findOnBoard("first", "Plain")).toBeTruthy();
    expect(getBoard(state, "second").length).toBe(2);
  });
});
