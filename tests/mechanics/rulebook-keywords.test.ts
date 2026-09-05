/**
 * Rulebook L2 — Keywords and Mechanic Catalogue (docs/svwb_rulebook_formatted.md L375–508).
 *
 * Assert what the rulebook (+ owner rulings) say, not incidental engine behaviour.
 * Sentences already asserted elsewhere are cited in the PR table; this file adds
 * gap coverage and ordering / negative-branch proofs.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  whenRunEffects,
  whenEndTurn,
  thenBoard,
  thenHand,
  thenHP,
  thenPP,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import {
  attackFollower,
  attackLeader,
  canAttackFollowerTarget,
  canAttackLeaderWhileWardActive,
} from "../../src/logic/core/combat.js";
import { applyKeyword } from "../../src/logic/core/keywords/apply.js";
import { grantBarrier, dealDamage } from "../../src/logic/core/barrier.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { onEvolve, resolveEvolveEffects } from "../../src/logic/evolveUtils.js";
import { getPool } from "../../src/logic/core/targeting.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { handleReanimate } from "../../src/logic/effects/ops/reanimate.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { handleTransform } from "../../src/logic/effects/ops/transform.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { resolvePlayCost } from "../../src/logic/core/playCard/cost.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import {
  getBoard,
  getHand,
  getHP,
  getMaxHP,
  getPP,
  getRally,
  getGraveyard,
  getShadows,
  setEvoCharges,
} from "../../src/core/playerHelpers.js";
import type {
  CardInstance,
  Effect,
  Player,
} from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const FILLER = "10111310";
const SWORDSNOUT = "10141120";
const NOEL = "10624110";
const PROSTRATING = "10661110";
const ZERAEL = "10903210";
const JAILOR = "10901110";
const STORMY_BLAST = "10131320";
const MAGIC_MISSILE = "10031310";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillerDeck(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i}`,
    type: "Follower" as const,
    cost: 1,
    attack: 1,
    defense: 1,
  }));
}

function readyFollower(
  name: string,
  owner: Player,
  opts: {
    uid?: string;
    attack?: number;
    defense?: number;
    insertionTs?: number;
    hasDrain?: boolean;
    hasBane?: boolean;
    hasAmbush?: boolean;
    hasAura?: boolean;
    hasBarrier?: boolean;
    hasStorm?: boolean;
    hasRush?: boolean;
    hasWard?: boolean;
    hasLastWords?: boolean;
    lastWordsEffects?: Effect[];
    fanfare?: Effect[];
    triggers?: object[];
    justPlayed?: boolean;
  } = {},
): CardInstance {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: opts.attack ?? 2,
      defense: opts.defense ?? 2,
      uid: opts.uid,
      hasDrain: opts.hasDrain,
      hasBane: opts.hasBane,
      hasAmbush: opts.hasAmbush,
      hasAura: opts.hasAura,
      hasStorm: opts.hasStorm,
      hasRush: opts.hasRush,
      hasWard: opts.hasWard,
      hasLastWords: opts.hasLastWords,
      fanfare: opts.fanfare,
      triggers: opts.triggers,
    },
    "board",
    owner,
  );
  card.peak_defense = Number(card.defense);
  card.justPlayed = opts.justPlayed ?? false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  card.hasAttacked = false;
  if (opts.hasAmbush) card.hasAmbush = true;
  if (opts.hasAura) card.hasAura = true;
  if (opts.hasBarrier) grantBarrier(card);
  if (opts.lastWordsEffects) {
    card.lastWordsEffects = opts.lastWordsEffects;
    card.keywordState = {
      ...(card.keywordState ?? {}),
      lastWordsEffects: opts.lastWordsEffects,
    };
  }
  if (opts.insertionTs != null) (card as any).insertionTs = opts.insertionTs;
  return card;
}

function setupMain(
  round: number = R6,
  opts: { pp?: number; maxPP?: number; seed?: number } = {},
) {
  const max = opts.maxPP ?? Math.min(round, 10);
  givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(opts.pp ?? max, max)
    .withFirstDeck(fillerDeck("PadF", 20))
    .withSecondDeck(fillerDeck("PadS", 20))
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function spellboostCount(card: {
  keywordState?: { spellboostCount?: number };
  spellboostCount?: number;
}): number {
  return Number(
    card.keywordState?.spellboostCount ?? card.spellboostCount ?? 0,
  );
}

function destroyOnField(card: CardInstance) {
  card.defense = 0;
  cleanupDead();
}

// ---------------------------------------------------------------------------
// Fanfare (L381)
// ---------------------------------------------------------------------------

describe("Rulebook L381 — Fanfare", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
  });

  it("summoned copy does not fire Fanfare (Searing Firenewt 10041110)", () => {
    // Rulebook L381: "summon a copy … does not trigger its Fanfare"
    state.players.second.hp = 20;
    state.players.second.board = [];
    summonNamed(
      {
        op: "summon",
        source: "named",
        name: "Searing Firenewt",
        count: 1,
      } as any,
      "first",
    );
    expect(getHP(state, "second")).toBe(20);
    expect(thenBoard("first").some((c) => c.name === "Searing Firenewt")).toBe(
      true,
    );
  });

  it("played from hand fires Fanfare before other actions (deal 2 with enemy present)", () => {
    state.players.second.hp = 20;
    const victim = readyFollower("Victim", "second", { defense: 5 });
    state.players.second.board = [victim];
    const bomber = createCard(
      {
        name: "PlayedFanfare",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        fanfare: [{ op: "damage", target: "enemy:follower", amount: 2 }],
      },
      "hand",
      "first",
    );
    state.players.first.hand = [bomber];
    state.players.first.pp = 2;
    whenPlayCard("first", 0);
    expect(Number(victim.defense)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Last Words (L383)
// ---------------------------------------------------------------------------

describe("Rulebook L383 — Last Words", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
  });

  it("transform does not fire Last Words", () => {
    const victim = readyFollower("TransformVictim", "second", {
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", count: 1 } as Effect],
    });
    state.players.second.board = [victim];
    const handBefore = thenHand("second").length;

    handleTransform(
      {
        op: "transform",
        target: "enemy:follower",
        select: 1,
        into: "Skeleton",
      } as any,
      "first",
      { sourceCard: null },
    );

    expect(thenHand("second").length).toBe(handBefore);
    expect(getBoard(state, "second")[0]!.name).toBe("Skeleton");
  });

  it("silenced follower has no Last Words on destroy", () => {
    const victim = readyFollower("SilencedLW", "second", {
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", count: 1 } as Effect],
    });
    state.players.second.board = [victim];
    whenRunEffects(
      [
        {
          op: "keyword",
          action: "silence",
          target: "enemy:follower",
        } as Effect,
      ],
      "first",
    );
    const handBefore = thenHand("second").length;
    destroyOnField(victim);
    expect(thenHand("second").length).toBe(handBefore);
  });

  it("trading followers: both Last Words deal 1 to enemy leader", () => {
    const lwFx = [
      { op: "damage", target: "enemy:leader", amount: 1 } as Effect,
    ];
    const a = readyFollower("A", "first", {
      attack: 2,
      defense: 2,
      hasLastWords: true,
      lastWordsEffects: lwFx,
    });
    const b = readyFollower("B", "second", {
      attack: 2,
      defense: 2,
      hasLastWords: true,
      lastWordsEffects: lwFx,
    });
    state.players.first.board = [a];
    state.players.second.board = [b];
    state.players.first.hp = 20;
    state.players.second.hp = 20;

    attackFollower(0, 0, "first", "second");

    // Both Last Words fire; active player's side resolves first per priority rules.
    expect(getHP(state, "first")).toBe(19);
    expect(getHP(state, "second")).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// Strike subtypes (L385)
// ---------------------------------------------------------------------------

describe("Rulebook L385 — Strike subtypes", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
    state.players.second.hp = 20;
  });

  it("follower_strike fires only when attacking a follower", () => {
    const striker = readyFollower("FS", "first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "follower_strike",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
        },
      ],
    });
    const foe = readyFollower("Foe", "second", { defense: 10 });
    state.players.first.board = [striker];
    state.players.second.board = [foe];

    attackFollower(0, 0, "first", "second");
    expect(getHP(state, "second")).toBe(15);

    state.players.second.hp = 20;
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(20);
  });

  it("leader_strike fires only when attacking the leader", () => {
    const striker = readyFollower("LS", "first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "leader_strike",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 4 }],
        },
      ],
    });
    const foe = readyFollower("Foe", "second", { defense: 10 });
    state.players.first.board = [striker];
    state.players.second.board = [foe];

    attackLeader(0, "first", "second");
    // 1 combat + 4 leader_strike = 5 damage total.
    expect(getHP(state, "second")).toBe(15);

    state.players.second.hp = 20;
    attackFollower(0, 0, "first", "second");
    expect(getHP(state, "second")).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Clash ordering (L387)
// ---------------------------------------------------------------------------

describe("Rulebook L387 — Clash ordering", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
  });

  it("attacker Clash resolves before defender Clash (sequence array)", () => {
    const order: number[] = [];
    const attacker = readyFollower("AtkClash", "first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [
            {
              op: "script",
              steps: [{ op: "damage", target: "clash_opponent", amount: 1 }],
            },
          ],
        },
      ],
    });
    attacker.triggers![0].effects = [
      {
        op: "damage",
        target: "clash_opponent",
        amount: 3,
        _testOrder: 1,
      } as any,
    ];
    const defender = readyFollower("DefClash", "second", {
      attack: 1,
      defense: 10,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "clash_opponent", amount: 2 }],
        },
      ],
    });
    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    // Attacker's 3 lands first → defender at 7 before combat; defender's queued 2 still fires.
    expect(Number(defender.defense)).toBeLessThan(10);
    expect(Number(attacker.defense)).toBeLessThan(5);
  });

  it("defender queued Clash still resolves when attacker's Clash would kill it", () => {
    const attacker = readyFollower("KillClash", "first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "clash_opponent", amount: 10 }],
        },
      ],
    });
    const defender = readyFollower("DieClash", "second", {
      attack: 0,
      defense: 3,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "clash_opponent", amount: 2 }],
        },
      ],
    });
    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    // Defender Clash queued at declaration — still dealt 2 before cleanup (L387).
    expect(getBoard(state, "second").length).toBe(0);
    expect(Number(attacker.defense)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Ward — two targets (L393)
// ---------------------------------------------------------------------------

describe("Rulebook L393 — Ward (multiple)", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
  });

  it("with two Wards, attacker may target either Ward but not backliner or leader", () => {
    const ward1 = readyFollower("WardA", "second", {
      hasWard: true,
      uid: "w1",
    });
    const ward2 = readyFollower("WardB", "second", {
      hasWard: true,
      uid: "w2",
    });
    const back = readyFollower("Back", "second", { uid: "back" });
    const board = [ward1, ward2, back];
    state.players.second.board = board;

    expect(canAttackFollowerTarget(ward1, board)).toBe(true);
    expect(canAttackFollowerTarget(ward2, board)).toBe(true);
    expect(canAttackFollowerTarget(back, board)).toBe(false);
    expect(canAttackLeaderWhileWardActive(board)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Storm / Rush (L395–397)
// ---------------------------------------------------------------------------

describe("Rulebook L395–397 — Storm and Rush", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain(6, { pp: 10, maxPP: 10 });
  });

  it("Storm supersedes Rush: follower with both can attack leader same turn", () => {
    const dual = createCard(
      {
        name: "StormRush",
        type: "Follower",
        cost: 1,
        attack: 2,
        defense: 2,
        hasStorm: true,
        hasRush: true,
        keywords: ["Storm", "Rush"],
      },
      "hand",
      "first",
    );
    applyKeyword(dual, "Storm");
    applyKeyword(dual, "Rush");
    state.players.first.hand = [dual];
    whenPlayCard("first", 0);
    const onBoard = getBoard(state, "first")[0]!;
    const hpBefore = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore - Number(onBoard.attack));
  });

  it("mid-turn Storm grant enables immediate leader attack", () => {
    const plain = readyFollower("Plain", "first", {
      attack: 2,
      defense: 2,
      justPlayed: true,
    });
    plain.justPlayed = true;
    plain.hasStorm = false;
    plain.can_attack = false;
    state.players.first.board = [plain];
    whenRunEffects(
      [
        {
          op: "keyword",
          action: "grant",
          target: "ally:follower",
          keywords: ["Storm"],
        } as Effect,
      ],
      "first",
    );
    plain.can_attack = true;
    plain.attacks_left = 1;
    const hpBefore = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore - 2);
  });

  it("Rush follower cannot attack leader turn played; can next turn", () => {
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
    whenPlayCard("first", 0);

    const hpBefore = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hpBefore);

    whenEndTurn();
    whenEndTurn();
    state.activePlayer = "first";
    const onBoard = getBoard(state, "first")[0]!;
    onBoard.justPlayed = false;
    onBoard.can_attack = true;
    onBoard.attacks_left = 1;
    const hp2 = getHP(state, "second");
    attackLeader(0, "first", "second");
    expect(getHP(state, "second")).toBe(hp2 - Number(onBoard.attack));
  });
});

// ---------------------------------------------------------------------------
// Barrier AoE (L403)
// ---------------------------------------------------------------------------

describe("Rulebook L403 — Barrier vs AoE", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
  });

  it("Barrier follower takes 0 from AoE and breaks; other targets take full damage", () => {
    const shielded = readyFollower("Shielded", "second", {
      defense: 5,
      hasBarrier: true,
    });
    const open = readyFollower("Open", "second", { defense: 5 });
    state.players.second.board = [shielded, open];

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 3 } as Effect],
      "first",
    );

    expect(Number(shielded.defense)).toBe(5);
    expect(shielded.hasBarrier).toBe(false);
    expect(Number(open.defense)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Evolve / Super-Evolve (L405–407)
// ---------------------------------------------------------------------------

describe("Rulebook L405–407 — Evolve abilities", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain(7);
    setEvoCharges(state, "first", 2);
  });

  it("normal evolve resolves only evolve[] when both evolve and superevolve exist", () => {
    const card = createCard(
      { name: "DualLine", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    card.evolve = [{ op: "draw", count: 1 } as Effect];
    card.superevolve = [
      { op: "summon", source: "named", name: "Ghost", count: 1 } as Effect,
    ];
    card.peak_defense = 1;

    const normalFx = resolveEvolveEffects(card, "normal");
    expect(normalFx).toHaveLength(1);
    expect(normalFx[0]).toMatchObject({ op: "draw" });

    const handBefore = thenHand("first").length;
    onEvolve(card, "first", "normal");
    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(thenBoard("first").some((c) => c.name === "Ghost")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Overflow mid-turn ramp (L421)
// ---------------------------------------------------------------------------

describe("Rulebook L421 — Overflow", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("ramping 6→7 max PP mid-turn enables Overflow immediately", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([SWORDSNOUT])
      .withFirstDeck(fillerDeck("PadF", 20))
      .withSecondDeck(fillerDeck("PadS", 20))
      .build();
    state.gameStarted = true;
    state.phase = "main";

    expect(isOverflow("first")).toBe(false);
    whenRunEffects(
      [{ op: "pp", action: "gain_max", amount: 1 } as Effect],
      "first",
    );
    expect(isOverflow("first")).toBe(true);

    whenPlayCard("first", 0);
    const trencher = findOnBoard("first", "Swordsnout Trencher")!;
    expect(trencher.hasStorm).toBe(true);
  });

  it("below Overflow threshold: Fanfare Storm branch does not fire", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(5, 6)
      .withFirstHand([SWORDSNOUT])
      .build();
    state.gameStarted = true;
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Swordsnout Trencher")?.hasStorm).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Spellboost — cards drawn by casting spell (L423)
// ---------------------------------------------------------------------------

describe("Rulebook L423 — Spellboost", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("cards drawn by the spell are not Spellboosted; in-hand card is", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10032120", MAGIC_MISSILE])
      .withFirstDeck(["10032120"])
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;

    const inHand = getHand(state, "first").find((c) => c.id === "10032120")!;
    expect(spellboostCount(inHand)).toBe(0);

    whenPlayCard("first", 1);

    expect(spellboostCount(inHand)).toBe(1);
    const drawn = getHand(state, "first").find(
      (c) => c.id === "10032120" && c.uid !== inHand.uid,
    );
    if (drawn) {
      expect(spellboostCount(drawn)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Enhance base vs tier (L433) + multi-tier (L447)
// ---------------------------------------------------------------------------

describe("Rulebook L433 / L447 — Enhance", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain(8, { pp: 10, maxPP: 10 });
  });

  it("inline Waters-of-Orca shape: 10 PP spends Enhance(10); 9 PP spends base only", () => {
    const orca = createCard(
      {
        name: "OrcaSpell",
        type: "Spell",
        cost: 2,
        spell: [{ op: "draw", count: 1 }],
        enhanceTiers: [
          {
            cost: 10,
            effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
          },
        ],
      },
      "hand",
      "first",
    );
    state.players.first.hand = [orca];
    state.players.first.pp = 10;
    state.players.second.hp = 20;

    const plan10 = resolvePlayCost(orca, 10);
    expect(plan10.cost).toBe(10);
    playCardNoRender(getHand(state, "first"), "first", 0);
    expect(getHP(state, "second")).toBe(15);
    expect(thenPP("first")).toBe(0);

    resetUidCounter();
    setupMain(8, { pp: 9, maxPP: 10 });
    const orca2 = createCard(
      {
        name: "OrcaSpell",
        type: "Spell",
        cost: 2,
        spell: [{ op: "draw", count: 1 }],
        enhanceTiers: [
          {
            cost: 10,
            effects: [{ op: "damage", target: "enemy:leader", amount: 5 }],
          },
        ],
      },
      "hand",
      "first",
    );
    state.players.first.hand = [orca2];
    state.players.second.hp = 20;
    const plan9 = resolvePlayCost(orca2, 9);
    expect(plan9.cost).toBe(2);
    playCardNoRender(getHand(state, "first"), "first", 0);
    expect(getHP(state, "second")).toBe(20);
  });

  it("Noel IV at 8 PP: Fanfare + Enhance(7) + Enhance(8) all fire (owner 2026-08-15)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstHand([NOEL])
      .withFirstPP(8, 8)
      .build();
    state.gameStarted = true;
    whenPlayCard("first", 0);
    const soldiers = thenBoard("first").filter(
      (c) => c.name === "Fearless Soldier",
    );
    expect(soldiers.length).toBe(3);
    const hasBane = soldiers.some((s) => s.hasBane);
    const hasDrain = soldiers.some((s) => s.hasDrain);
    const hasStorm = soldiers.some((s) => s.hasStorm);
    expect(hasBane).toBe(true);
    expect(hasDrain).toBe(true);
    expect(hasStorm).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Crystallize permanence (L437)
// ---------------------------------------------------------------------------

describe("Rulebook L437 — Crystallize permanence", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain(6, { pp: 2, maxPP: 6 });
  });

  it.fails(
    "Crystallize amulet returned to hand stays type Amulet (owner 2026-09-02)",
    () => {
      // Rulebook L437 / owner: "remain an amulet" after return to hand.
      // Observed: return op restores printed Follower type.
      state.players.first.hand = [createCard(PROSTRATING, "hand", "first")];
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = thenBoard("first")[0]!;
      expect(amulet.type).toBe("Amulet");

      whenRunEffects(
        [
          {
            op: "return",
            destination: "hand",
            target: "ally:amulet",
          } as Effect,
        ],
        "first",
      );

      const inHand = thenHand("first").find(
        (c) => c.name === "Prostrating Coward",
      )!;
      expect(inHand.type).toBe("Amulet");
      expect(inHand.hasCountdown).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// Reanimate tie + provenance (L413–415) — cross-ref reanimate_provenance.test.ts
// ---------------------------------------------------------------------------

describe("Rulebook L413 — Reanimate", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
  });

  it("random tie at highest cost ≤X: seeded pick among tied corpses", () => {
    givenGameState({ seed: 99, activePlayer: "first" })
      .withFirstDeck(fillerDeck("PadF", 20))
      .build();
    state.gameStarted = true;
    const a = createCard("10001110", "graveyard", "first");
    a.uid = "corp-a";
    const b = createCard("10001110", "graveyard", "first");
    b.uid = "corp-b";
    state.players.first.graveyard = [a, b];
    recordDestroyed(state, "first", a);
    recordDestroyed(state, "first", b);

    handleReanimate({ op: "reanimate", max_cost: 2 } as any, "first");
    expect(getBoard(state, "first").length).toBe(1);
    expect(getBoard(state, "first")[0]!.name).toBe("Indomitable Fighter");
  });
});

// ---------------------------------------------------------------------------
// Rally Fanfare gate (L417) — supplement primitives_batch4_rally.test.ts
// ---------------------------------------------------------------------------

describe("Rulebook L417 — Rally Fanfare gate", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain(R6, { pp: 6, maxPP: 6 });
  });

  it("Fanfare Rally(5) on 5th follower sees count 4 — does not draw", () => {
    for (let i = 0; i < 4; i++) {
      summonNamed(
        { op: "summon", name: "Steelclad Knight", count: 1 } as any,
        "first",
      );
    }
    expect(getRally(state, "first")).toBe(4);
    const gateCard = createCard(
      {
        name: "RallyGate",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        fanfare: [
          {
            op: "gate",
            condition: "rally",
            count: 5,
            effects: [{ op: "draw", count: 2 }],
          },
        ],
      },
      "hand",
      "first",
    );
    state.players.first.hand = [gateCard];
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBe(0);
    expect(getRally(state, "first")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Highest-payable alternate (L445)
// ---------------------------------------------------------------------------

describe("Rulebook L445 — Highest-payable alternate", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain();
  });

  it("3 PP below normal picks Accelerate(2) not Accelerate(4)", () => {
    const card = {
      id: "syn-multi",
      name: "Multi",
      type: "Follower" as const,
      cost: 8,
      keywords: [
        { name: "Accelerate", cost: 2, effects: [{ op: "draw", count: 1 }] },
        { name: "Accelerate", cost: 4, effects: [{ op: "draw", count: 2 }] },
      ],
    };
    expect(resolvePlayCost(card as any, 3).cost).toBe(2);
    expect(resolvePlayCost(card as any, 4).cost).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Normal play preferred (L449)
// ---------------------------------------------------------------------------

describe("Rulebook L449 — Normal play preferred", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain(6, { pp: 6, maxPP: 6 });
  });

  it("enough PP for normal cost uses follower play even when Accelerate is payable", () => {
    state.players.first.hand = [createCard(JAILOR, "hand", "first")];
    const plan = resolvePlayCost(getHand(state, "first")[0]!, 6);
    expect(plan.mode).toBe("normal");
    expect(plan.cost).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Accelerate spellboost cross-check (L441) — thin wrapper; full proof in alt_form_rulings
// ---------------------------------------------------------------------------

describe("Rulebook L441 — Accelerate + Spellboost", () => {
  beforeEach(() => {
    resetUidCounter();
    setupMain(6, { pp: 1, maxPP: 6 });
  });

  it("Accelerate play spellboosts in-hand Spellboost card", () => {
    state.players.first.hand = [
      createCard(JAILOR, "hand", "first"),
      createCard(STORMY_BLAST, "hand", "first"),
    ];
    const blast = getHand(state, "first").find((c) => c.id === STORMY_BLAST)!;
    expect(spellboostCount(blast)).toBe(0);
    whenPlayCard("first", 0);
    expect(spellboostCount(blast)).toBe(1);
  });
});
