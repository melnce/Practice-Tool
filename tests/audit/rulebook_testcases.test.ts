/**
 * Rulebook "_Test case:" paragraphs from docs/svwb_rulebook_formatted.md.
 *
 * Focused coverage for cases that were missing or only incidental in other
 * suites. Cite the rulebook section in each describe. Prefer fixing engine
 * logic over weakening assertions. Mark AMBIGUOUS cases with it.skip.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  whenRunEffects,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import {
  getBoard,
  getHP,
  getMaxHP,
  getShadows,
  getBanish,
  getWinner,
  setEvoCharges,
  setSuperEvoCharges,
  setEvoUsedThisTurn,
} from "../../src/core/playerHelpers.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { applyKeyword } from "../../src/logic/core/keywords/apply.js";
import { grantBarrier } from "../../src/logic/core/barrier.js";
import { grantLeaderBarrier } from "../../src/logic/effects/leader.js";
import { canEvolve } from "../../src/logic/evolveUtils.js";
import { getPool } from "../../src/logic/core/targeting.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import "../../src/logic/core/effects/index.js";

function readyFollower(
  name: string,
  owner: "first" | "second",
  opts: {
    attack?: number;
    defense?: number;
    hasDrain?: boolean;
    hasBane?: boolean;
    hasAmbush?: boolean;
    hasAura?: boolean;
    hasBarrier?: boolean;
    hasStorm?: boolean;
    hasRush?: boolean;
    triggers?: object[];
  } = {},
) {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: opts.attack ?? 2,
      defense: opts.defense ?? 5,
      hasDrain: opts.hasDrain,
      hasBane: opts.hasBane,
      hasAmbush: opts.hasAmbush,
      hasAura: opts.hasAura,
      hasBarrier: opts.hasBarrier,
      hasStorm: opts.hasStorm,
      hasRush: opts.hasRush,
      triggers: opts.triggers,
    },
    "board",
    owner,
  );
  card.peak_defense = Number(card.defense);
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  card.hasAttacked = false;
  if (opts.hasAmbush) card.hasAmbush = true;
  if (opts.hasAura) card.hasAura = true;
  if (opts.hasBarrier) grantBarrier(card);
  return card;
}

describe("Rulebook §63 — Field full: excess summons are skipped", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
  });

  it("summon 2 followers with only 1 empty slot fills one and skips the second", () => {
    // Fill 4/5 slots with placeholders
    state.players.first.board = [
      readyFollower("A", "first"),
      readyFollower("B", "first"),
      readyFollower("C", "first"),
      readyFollower("D", "first"),
    ];
    expect(getBoard(state, "first")).toHaveLength(4);

    summonNamed({ op: "summon", name: "Goblin", count: 2 } as any, "first");

    const board = getBoard(state, "first");
    expect(board).toHaveLength(5);
    // Token Goblin (90001110) — only one of the two summons fits.
    expect(board.filter((c) => c.name === "Goblin")).toHaveLength(1);
  });
});

describe("Rulebook §76 — Sequential random destroy does not double-pick", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 42, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("destroy two random enemy followers against 3 removes exactly 2 distinct", () => {
    const a = readyFollower("R1", "second", { defense: 3 });
    const b = readyFollower("R2", "second", { defense: 3 });
    const c = readyFollower("R3", "second", { defense: 3 });
    a.uid = "r1";
    b.uid = "r2";
    c.uid = "r3";
    state.players.second.board = [a, b, c];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "enemy:follower",
          distribution: "random",
          count: 2,
        },
      ] as any,
      "first",
    );

    const remaining = getBoard(state, "second");
    expect(remaining).toHaveLength(1);
    expect(["r1", "r2", "r3"]).toContain(remaining[0]!.uid);
  });
});

describe("Rulebook §163 — EP locked until threshold turn", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
  });

  it("first player cannot evolve before turn 5 even with EP; unlocked on turn 5", () => {
    const card = readyFollower("EvoGate", "first");
    state.players.first.board = [card];
    setEvoCharges(state, "first", 2);
    setEvoUsedThisTurn(state, "first", false);

    state.roundCount = 4;
    expect(canEvolve("first", card, "normal")).toBe(false);

    state.roundCount = 5;
    expect(canEvolve("first", card, "normal")).toBe(true);
  });

  it("second player unlocks normal evolve on turn 4", () => {
    const card = readyFollower("EvoGate2", "second");
    state.players.second.board = [card];
    setEvoCharges(state, "second", 2);
    setEvoUsedThisTurn(state, "second", false);

    state.roundCount = 3;
    expect(canEvolve("second", card, "normal")).toBe(false);

    state.roundCount = 4;
    expect(canEvolve("second", card, "normal")).toBe(true);
  });
});

describe("Rulebook §164 — SEP cannot upgrade already-evolved; auto-evolve skips EP", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, roundCount: 7 }).build();
    state.gameStarted = true;
    state.roundCount = 7;
  });

  it("using SEP on a follower already evolved with EP is rejected", () => {
    const card = readyFollower("AlreadyEvo", "first");
    card.hasEvolved = true;
    card.evoType = "normal";
    state.players.first.board = [card];
    setSuperEvoCharges(state, "first", 2);
    setEvoUsedThisTurn(state, "first", false);

    expect(canEvolve("first", card, "super")).toBe(false);
  });

  it("auto-evolve (spendPoint false) sets evolved state without consuming EP", () => {
    const card = readyFollower("AutoEvo", "first");
    state.players.first.board = [card];
    setEvoCharges(state, "first", 2);

    whenEffectEvolve(card, "first", "normal");

    expect(card.hasEvolved).toBe(true);
    expect(state.players.first.evoCharges).toBe(2);
    expect(canEvolve("first", card, "normal")).toBe(false);
  });
});

describe("Rulebook §338 — Fanfare fizzles with no valid target; card still plays", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Searing Firenewt plays with empty enemy board; Fanfare select does not block play", () => {
    // Card text: Fanfare select + deal 1. Rulebook: still playable; Fanfare fizzles.
    const newt = createCard("10041110", "hand", "first");
    state.players.first.hand = [newt];
    state.players.second.board = [];

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).not.toBe("blocked");
    expect(findBoardName("first", "Searing Firenewt")).toBeTruthy();
    // No pending target when pool is empty — Fanfare simply does nothing.
    expect(state.pendingTargetEffect).toBeFalsy();
  });
});

describe("Rulebook §340 — Banished follower's Last Words do not fire", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "ShouldNotDraw", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;
  });

  it("banish removes follower without Last Words draw", () => {
    const victim = readyFollower("LWVictim", "second");
    victim.hasLastWords = true;
    const lw = [{ op: "draw", count: 1 } as any];
    victim.keywordState = { lastWordsEffects: lw };
    victim.lastWordsEffects = lw;
    state.players.second.board = [victim];

    const handBefore = state.players.second.hand.length;
    whenRunEffects(
      [{ op: "banish", target: "enemy:follower", distribution: "all" } as any],
      "first",
    );

    expect(getBoard(state, "second")).toHaveLength(0);
    expect(getBanish(state, "second").some((c) => c.name === "LWVictim")).toBe(
      true,
    );
    expect(state.players.second.hand.length).toBe(handBefore);
  });
});

describe("Rulebook §342 — Strike damage can bring the leader to 0 before combat damage", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.players.second.hp = 2;
  });

  it("Strike: deal 2 to enemy leader while attacking a follower drops leader to 0", () => {
    const attacker = readyFollower("StrikeLethal", "first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "strike",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
        },
      ],
    });
    const defender = readyFollower("Tank", "second", {
      attack: 1,
      defense: 10,
    });
    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    expect(getHP(state, "second")).toBe(0);
    expect(getWinner(state)).toBe("first");
  });
});

describe("Rulebook §348 — Drain restores only as attacker on combat damage", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("(1) attacking the leader for 5 restores 5, never above max", () => {
    state.players.first.hp = 15;
    const drain = readyFollower("Drainer", "first", {
      attack: 5,
      defense: 5,
      hasDrain: true,
    });
    state.players.first.board = [drain];

    attackLeader(0, "first", "second");

    expect(getHP(state, "first")).toBe(20);
    expect(getHP(state, "first")).toBeLessThanOrEqual(getMaxHP(state, "first"));
  });

  it("(2) Drain as defender restores nothing from counter-damage", () => {
    state.players.second.hp = 10;
    const attacker = readyFollower("Atk", "first", { attack: 5, defense: 5 });
    const defender = readyFollower("DrainDef", "second", {
      attack: 5,
      defense: 5,
      hasDrain: true,
    });
    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    expect(getHP(state, "second")).toBe(10);
  });

  it("(3) Clash / effect damage from a Drain follower restores nothing", () => {
    state.players.first.hp = 10;
    const drain = readyFollower("ClashDrain", "first", {
      attack: 1,
      defense: 5,
      hasDrain: true,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "clash_opponent", amount: 3 }],
        },
      ],
    });
    const foe = readyFollower("Foe", "second", { attack: 1, defense: 10 });
    state.players.first.board = [drain];
    state.players.second.board = [foe];

    attackFollower(0, 0, "first", "second");

    // Only combat attack damage (1) should Drain-heal; Clash's 3 must not.
    expect(getHP(state, "first")).toBe(11);
  });
});

describe("Rulebook §352 / §354 — Storm and Rush attack permissions", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Storm follower can attack the leader the turn it is played", () => {
    const storm = createCard(
      {
        name: "Stormer",
        type: "Follower",
        cost: 1,
        attack: 2,
        defense: 2,
        hasStorm: true,
        keywords: ["Storm"],
      },
      "hand",
      "first",
    );
    applyKeyword(storm, "Storm");
    state.players.first.hand = [storm];

    whenPlayCard("first", 0);
    const onBoard = getBoard(state, "first")[0]!;
    expect(onBoard.hasStorm || onBoard.isStorm).toBeTruthy();
    expect(onBoard.can_attack).toBe(true);

    const hpBefore = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore - Number(onBoard.attack));
  });

  it("Rush follower can attack a follower but not the leader the turn it is played", () => {
    const rush = createCard(
      {
        name: "Rusher",
        type: "Follower",
        cost: 1,
        attack: 2,
        defense: 2,
        hasRush: true,
        keywords: ["Rush"],
      },
      "hand",
      "first",
    );
    applyKeyword(rush, "Rush");
    state.players.first.hand = [rush];
    const foe = readyFollower("Foe", "second", { defense: 5 });
    state.players.second.board = [foe];

    whenPlayCard("first", 0);
    const onBoard = getBoard(state, "first")[0]!;
    expect(onBoard.can_attack).toBe(true);

    const hpBefore = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore);

    const defBefore = Number(foe.defense);
    attackFollower(0, 0, "first", "second");
    expect(Number(foe.defense)).toBeLessThan(defBefore);
  });

  it("evolving a non-Storm follower grants follower attacks only, not leader (Rush-like)", () => {
    state.players.first.evoCharges = 2;
    state.roundCount = 5;
    const sick = createCard(
      {
        name: "Sick",
        type: "Follower",
        cost: 1,
        attack: 2,
        defense: 3,
      },
      "hand",
      "first",
    );
    state.players.first.hand = [sick];
    const foe = readyFollower("Foe", "second", { defense: 8 });
    state.players.second.board = [foe];

    whenPlayCard("first", 0);
    const onBoard = getBoard(state, "first")[0]!;
    handleEvolveSelf(onBoard, "first", {
      mode: "normal",
      spendPoint: true,
      runEvoEffects: false,
    });

    const hpBefore = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore);

    const defBefore = Number(foe.defense);
    attackFollower(0, 0, "first", "second");
    expect(Number(foe.defense)).toBeLessThan(defBefore);
  });
});

describe("Rulebook §356 — Ambush: ST blocked, AoE hits and keeps Ambush, attack strips it", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("single-target enemy selection cannot pick an Ambush follower", () => {
    const ambush = readyFollower("Ambusher", "second", { hasAmbush: true });
    state.players.second.board = [ambush];

    const pool = getPool("enemy:follower", "first", null, undefined, {
      isTargetedEffect: true,
    });
    expect(pool.some((c) => c.uid === ambush.uid)).toBe(false);
  });

  it('"deal 2 to all enemies" hits Ambush and it remains Ambushed', () => {
    const ambush = readyFollower("Ambusher", "second", {
      defense: 5,
      hasAmbush: true,
    });
    state.players.second.board = [ambush];

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 2 } as any],
      "first",
    );

    expect(Number(ambush.defense)).toBe(3);
    expect(ambush.hasAmbush).toBe(true);
  });

  it("attacking the leader strips Ambush so it becomes targetable", () => {
    const ambush = readyFollower("Ambusher", "second", {
      attack: 2,
      defense: 5,
      hasAmbush: true,
      hasStorm: true,
    });
    applyKeyword(ambush, "Storm");
    ambush.can_attack = true;
    state.players.second.board = [ambush];
    state.activePlayer = "second";

    attackLeader(0, "second", "first");
    expect(ambush.hasAmbush).toBe(false);

    const pool = getPool("enemy:follower", "first", null, undefined, {
      isTargetedEffect: true,
    });
    expect(pool.some((c) => c.uid === ambush.uid)).toBe(true);
  });
});

describe("Rulebook §358 — Aura: cannot select, can attack, random can hit", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("select-destroy pool excludes Aura followers", () => {
    const aura = readyFollower("AuraUnit", "second", { hasAura: true });
    const plain = readyFollower("Plain", "second");
    state.players.second.board = [aura, plain];

    const pool = getPool("enemy:follower", "first", null, undefined, {
      isTargetedEffect: true,
    });
    expect(pool.some((c) => c.uid === aura.uid)).toBe(false);
    expect(pool.some((c) => c.uid === plain.uid)).toBe(true);
  });

  it("Aura follower can still be attacked", () => {
    const aura = readyFollower("AuraUnit", "second", {
      defense: 5,
      hasAura: true,
    });
    const atk = readyFollower("Atk", "first", { attack: 2 });
    state.players.second.board = [aura];
    state.players.first.board = [atk];

    attackFollower(0, 0, "first", "second");
    expect(Number(aura.defense)).toBe(3);
  });

  it("random destroy can still hit an Aura follower", () => {
    const aura = readyFollower("AuraUnit", "second", { hasAura: true });
    aura.uid = "aura-only";
    state.players.second.board = [aura];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "enemy:follower",
          distribution: "random",
          count: 1,
        },
      ] as any,
      "first",
    );

    expect(getBoard(state, "second")).toHaveLength(0);
  });
});

describe("Rulebook §360 — Barrier absorbs one damage instance then breaks", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it('effect "deal 3" deals 0 and breaks Barrier; a second hit lands', () => {
    const tank = readyFollower("Tank", "second", {
      defense: 5,
      hasBarrier: true,
    });
    state.players.second.board = [tank];

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 3 } as any],
      "first",
    );
    expect(Number(tank.defense)).toBe(5);
    expect(tank.hasBarrier).toBeFalsy();

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 3 } as any],
      "first",
    );
    expect(Number(tank.defense)).toBe(2);
  });

  it("Barrier follower in combat takes 0 from the hit, breaks, and still deals damage back", () => {
    const barrier = readyFollower("BarrierDef", "second", {
      attack: 3,
      defense: 5,
      hasBarrier: true,
    });
    const atk = readyFollower("Atk", "first", { attack: 4, defense: 5 });
    state.players.second.board = [barrier];
    state.players.first.board = [atk];

    attackFollower(0, 0, "first", "second");

    expect(Number(barrier.defense)).toBe(5);
    expect(barrier.hasBarrier).toBeFalsy();
    expect(Number(atk.defense)).toBe(2);
  });

  it("leader Barrier soaks the next attack packet then breaks", () => {
    grantLeaderBarrier("second");
    const atk = readyFollower("Atk", "first", { attack: 4 });
    state.players.first.board = [atk];

    const hpBefore = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore);
    expect(state.players.second.leaderBarrier).toBe(0);

    atk.attacks_left = 1;
    atk.can_attack = true;
    atk.hasAttacked = false;
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore - 4);
  });
});

describe("Rulebook §368 — Necromancy spends shadows only when affordable", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Devious Lesser Mummy: 4 shadows → Storm; 3 shadows → no Storm", () => {
    // With 4 shadows
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstPP(10, 10)
      .withFirstShadows(4)
      .build();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.players.first.hand = [createCard("10051130", "hand", "first")];
    whenPlayCard("first", 0);
    const withStorm = findBoardName("first", "Devious Lesser Mummy")!;
    expect(withStorm.hasStorm || withStorm.isStorm).toBeTruthy();
    expect(getShadows(state, "first")).toBe(0);

    // With 3 shadows
    givenGameState({ seed: 2, activePlayer: "first" })
      .withFirstPP(10, 10)
      .withFirstShadows(3)
      .build();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.players.first.hand = [createCard("10051130", "hand", "first")];
    whenPlayCard("first", 0);
    const noStorm = findBoardName("first", "Devious Lesser Mummy")!;
    expect(noStorm.hasStorm || noStorm.isStorm).toBeFalsy();
    expect(getShadows(state, "first")).toBe(3);
  });
});

function findBoardName(owner: "first" | "second", name: string) {
  return getBoard(state, owner).find((c) => c.name === name);
}
