/**
 * Rulebook L2 — effect resolution, targeting, randomness, copies and continuous effects.
 * Spec: docs/svwb_rulebook_formatted.md lines 296–374, 579–619.
 * Owner rulings: docs/owner-rulings.md (override printed text where noted).
 *
 * Assert what the rulebook says, not what the engine happens to do.
 * Engine mismatches → it.fails with rulebook quote in the test comment.
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
  findOnBoard,
  thenHand,
  thenBoard,
  thenDeck,
  thenHP,
  thenPP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { undo, resetHistory } from "../../src/core/history.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { getPool } from "../../src/logic/core/targeting.js";
import {
  attackFollower,
  canAttackFollowerTarget,
} from "../../src/logic/core/combat.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { playCard } from "../../src/logic/core/playCard/index.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { changeFollowerControl } from "../../src/logic/effects/ops/changeControl.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import {
  applyStatBuff,
  setStatsBuff,
} from "../../src/logic/effects/ops/stat/core.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import {
  getBoard,
  getHand,
  getHP,
  getShadows,
  getWinner,
  getGraveyard,
} from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;

function setupMain(
  round: number,
  opts: {
    hand?: (string | object)[];
    pp?: number;
    deck?: (string | object)[];
    secondDeck?: (string | object)[];
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
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function readyFollower(
  name: string,
  owner: "first" | "second",
  opts: {
    attack?: number;
    defense?: number;
    hasAura?: boolean;
    hasAmbush?: boolean;
    hasIntimidate?: boolean;
    hasWard?: boolean;
    hasBane?: boolean;
    hasLastWords?: boolean;
    lastWordsEffects?: object[];
    triggers?: object[];
    uid?: string;
  } = {},
): CardInstance {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: opts.attack ?? 2,
      defense: opts.defense ?? 2,
      hasAura: opts.hasAura,
      hasAmbush: opts.hasAmbush,
      hasIntimidate: opts.hasIntimidate,
      hasWard: opts.hasWard,
      hasBane: opts.hasBane,
      hasLastWords: opts.hasLastWords,
      lastWordsEffects: opts.lastWordsEffects,
      triggers: opts.triggers,
    },
    "board",
    owner,
  );
  if (opts.uid) card.uid = opts.uid;
  card.peak_defense = Number(card.defense);
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  return card;
}

function enemyFollower(def: number, name = "Enemy", attack = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

// =============================================================================
// §304–305 Playing cards — costs and target declaration
// =============================================================================

describe("Rulebook L305 — pay costs and declare targets", () => {
  beforeEach(() => resetUidCounter());

  it("cannot play a spell when PP is below its cost (illegal play)", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand([
        {
          name: "Costly",
          type: "Spell",
          cost: 5,
          spell: [{ op: "draw", source: "deck", count: 1 }],
        },
      ])
      .withFirstPP(2, 6)
      .build();
    state.gameStarted = true;
    const spell = thenHand("first")[0]!;
    const ppBefore = thenPP("first");
    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("blocked");
    if (outcome.kind === "blocked") {
      expect(outcome.reason).toMatch(/pp/i);
    }
    expect(thenPP("first")).toBe(ppBefore);
    expect(thenHand("first").length).toBe(1);
  });

  it("mandatory-select spell is unplayable with no legal target (SVWB blocks)", () => {
    setupMain(R6, { hand: ["10131320"], pp: 1 });
    const blast = thenHand("first")[0]!;
    expect(canPlayCard(blast, "first").ok).toBe(false);
    const ppBefore = thenPP("first");
    whenPlayCard("first", 0);
    expect(thenPP("first")).toBe(ppBefore);
    expect(thenHand("first").some((c) => c.id === "10131320")).toBe(true);
  });

  it("random-target spell is playable with zero valid targets and does nothing (10943310)", () => {
    setupMain(R6, { hand: ["10943310"], pp: 2, deck: ["10031310"] });
    const spell = thenHand("first")[0]!;
    expect(canPlayCard(spell, "first").ok).toBe(true);
    const ppBefore = thenPP("first");
    const deckBefore = thenDeck("first").length;
    whenPlayCard("first", 0);
    expect(thenPP("first")).toBe(ppBefore - 2);
    expect(thenBoard("second")).toHaveLength(0);
    expect(thenDeck("first").length).toBe(deckBefore);
  });

  it("random-target spell is playable with one valid target and hits it", () => {
    setupMain(R6, { hand: ["10943310"], pp: 2 });
    const foe = enemyFollower(5);
    whenPlayCard("first", 0);
    expect(Number(foe.defense)).toBe(2);
  });
});

// =============================================================================
// §305–318 Resolution order within a card's text
// =============================================================================

describe("Rulebook L313–317 — atomic resolution and text order", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("destroy-all then leader damage: Last Words wait until spell finishes", () => {
    const victim = readyFollower("LW", "second", {
      hasLastWords: true,
      lastWordsEffects: [
        { op: "summon", source: "named", name: "Bat", count: 1 } as any,
      ],
    });
    state.players.second.board = [victim];

    whenRunEffects(
      [
        { op: "destroy", target: "enemy:follower", distribution: "all" },
        { op: "damage", target: "enemy:leader", amount: 2 },
      ] as any,
      "first",
    );

    expect(thenHP("second")).toBe(18);
    const bat = thenBoard("second").find((c) => c.name === "Bat");
    expect(bat).toBeDefined();
    expect(Number(bat!.defense)).toBe(1);
  });

  it("deal 3 to enemy leader then 2 to own leader: enemy lethal lands first", () => {
    state.players.second.hp = 3;
    state.players.first.hp = 3;

    const events: string[] = [];
    const origSecond = state.players.second.hp;
    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:leader",
          amount: 3,
        },
        {
          op: "damage",
          target: "ally:leader",
          amount: 2,
        },
      ] as any,
      "first",
    );
    events.push(`enemy:${thenHP("second")}`);
    events.push(`ally:${thenHP("first")}`);
    events.push(`winner:${getWinner(state) ?? "none"}`);

    expect(events).toEqual(["enemy:0", "ally:3", "winner:first"]);
  });

  it("add three cards to hand in text order: first two fit, third burns to shadow", () => {
    givenGameState({ seed: 1 })
      .withFirstHand([
        { name: "H1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H2", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H3", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H4", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H5", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H6", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H7", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;

    const shadowsBefore = getShadows(state, "first");
    whenRunEffects(
      [
        { op: "add_to_hand", name: "Fairy", count: 1 },
        { op: "add_to_hand", name: "Fairy", count: 1 },
        { op: "add_to_hand", name: "Fairy", count: 1 },
      ] as any,
      "first",
    );

    expect(thenHand("first").length).toBe(9);
    const fairyCount = thenHand("first").filter(
      (c) => c.name === "Fairy",
    ).length;
    expect(fairyCount).toBe(2);
    expect(getShadows(state, "first")).toBe(shadowsBefore + 1);
  });

  it("draw 2 then opponent draw 1: self deck-out should lose before opponent draw (L317)", () => {
    setupMain(R6, {
      hand: ["10221310"],
      pp: 2,
      deck: [
        { name: "Only", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ],
      secondDeck: [
        {
          name: "OppCard",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ],
    });
    const secondHandBefore = thenHand("second").length;
    whenPlayCard("first", 0);

    expect(thenHand("first").length).toBe(1);
    expect(getWinner(state)).toBe("second");
    expect(state.phase).toBe("gameover");
    expect(thenHand("second").length).toBe(secondHandBefore);
  });

  it("lethal mid-effect halts remaining draws in the same spell", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "D1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D2", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;
    state.players.second.hp = 3;
    const deckBefore = thenDeck("first").length;

    whenRunEffects(
      [
        { op: "damage", target: "enemy:leader", amount: 3 },
        { op: "draw", source: "deck", count: 2 },
      ] as any,
      "first",
    );

    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("first");
    expect(thenDeck("first").length).toBe(deckBefore);
  });

  it("deal 3 then draw 2 still draws when enemy leader survives", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "D1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "D2", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;
    state.players.second.hp = 4;
    const deckBefore = thenDeck("first").length;

    whenRunEffects(
      [
        { op: "damage", target: "enemy:leader", amount: 3 },
        { op: "draw", source: "deck", count: 2 },
      ] as any,
      "first",
    );

    expect(state.phase).not.toBe("gameover");
    expect(thenHP("second")).toBe(1);
    expect(thenDeck("first").length).toBe(deckBefore - 2);
  });

  it("turn-boundary lethal trigger stops later queued triggers in the same boundary", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstDeck([
        { name: "DeckCard", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;
    state.players.second.hp = 3;

    const killer = createCard(
      {
        name: "Killer",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        can_attack: false,
        triggers: [
          {
            event: "end_of_turn",
            effects: [{ op: "damage", target: "enemy:leader", amount: 3 }],
          },
        ],
      },
      "board",
      "first",
    );
    const drawer = createCard(
      {
        name: "Drawer",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        can_attack: false,
        triggers: [
          {
            event: "end_of_turn",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    state.players.first.board = [killer, drawer];
    const deckBefore = thenDeck("first").length;

    runEndOfTurnBoundary("first");

    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("first");
    expect(thenDeck("first").length).toBe(deckBefore);
  });

  it("undo after deck-out loss restores main phase without stale halt state", () => {
    resetHistory();
    setupMain(R6, {
      hand: ["10221310"],
      pp: 2,
      deck: [
        { name: "Only", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ],
      secondDeck: [
        {
          name: "OppCard",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ],
    });
    const secondHandBefore = thenHand("second").length;

    playCard(getHand(state, "first"), "first", 0);
    expect(state.phase).toBe("gameover");
    expect(getWinner(state)).toBe("second");
    expect(thenHand("second").length).toBe(secondHandBefore);

    undo({ autoRender: false });

    expect(state.phase).toBe("main");
    expect(getWinner(state)).toBeNull();
    expect(state.players.first.defeated).toBe(false);
    expect(thenHand("second").length).toBe(secondHandBefore);
  });

  it("destroy enemy follower then draw still draws (kill-then-draw, 10913310)", () => {
    setupMain(R6, {
      hand: ["10913310"],
      pp: 4,
      deck: [
        { name: "Drawn", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ],
    });
    const foe = enemyFollower(3);
    const deckBefore = thenDeck("first").length;
    whenPlayCard("first", 0);
    resolvePendingTarget(foe.uid);
    expect(thenBoard("second")).toHaveLength(0);
    expect(thenDeck("first").length).toBe(deckBefore - 1);
    expect(thenHand("first").some((c) => c.name === "Drawn")).toBe(true);
  });
});

// =============================================================================
// §320 Partial resolution, no retargeting, last-known information
// =============================================================================

describe("Rulebook L320 — partial resolution and last-known values", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("invalidated select target: later step referencing it does nothing; spell continues", () => {
    const victim = readyFollower("Victim", "second", { attack: 4, defense: 3 });
    const bystander = readyFollower("Bystander", "second", { defense: 5 });
    state.players.second.board = [victim, bystander];
    state.__lastSelected = victim;

    destroyTarget(victim, "first", "effect");
    cleanupDead();
    expect(thenBoard("second")).toHaveLength(1);

    whenRunEffects(
      [{ op: "damage", target: "selected", amount: 5 }] as any,
      "first",
    );
    expect(Number(bystander.defense)).toBe(5);
  });

  it("multi-target damage: remaining valid target still takes damage when one is gone", () => {
    const a = readyFollower("A", "second", { defense: 10 });
    const b = readyFollower("B", "second", { defense: 10 });
    state.players.second.board = [a, b];
    state.__lastSelected = a;

    destroyTarget(a, "first", "effect");
    cleanupDead();

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 3 }] as any,
      "first",
    );

    expect(findOnBoard("second", "A")).toBeUndefined();
    expect(Number(findOnBoard("second", "B")!.defense)).toBe(7);
  });

  it("last-known attack: destroy follower then deal damage equal to its attack", () => {
    const big = readyFollower("Big", "second", { attack: 7, defense: 2 });
    state.players.second.board = [big];
    state.__lastSelected = big;
    state.players.second.hp = 20;

    destroyTarget(big, "first", "effect");
    cleanupDead();

    whenRunEffects(
      [
        { op: "damage", target: "enemy:leader", amount: "{selected.attack}" },
      ] as any,
      "first",
    );

    expect(thenBoard("second")).toHaveLength(0);
    expect(thenHP("second")).toBe(13);
  });
});

// =============================================================================
// §326–338 Targeting restrictions — Aura, Ambush, Intimidate, Ward
// =============================================================================

describe("Rulebook L333–336 — Aura, Ambush, Intimidate, Ward targeting", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("Aura follower excluded from opponent select pool; spell blocked when only Aura present", () => {
    const aura = readyFollower("AuraUnit", "second", { hasAura: true });
    state.players.second.board = [aura];
    const pool = getPool("enemy:follower", "first", null, undefined, {
      isTargetedEffect: true,
    });
    expect(pool.some((c) => c.uid === aura.uid)).toBe(false);

    setupMain(R6, { hand: ["10131320"], pp: 1 });
    expect(canPlayCard(thenHand("first")[0]!, "first").ok).toBe(false);
  });

  it("follower with Aura-only Fanfare select still plays; Fanfare fizzles (10041110)", () => {
    setupMain(R6, { hand: ["10041110"], pp: 2 });
    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).not.toBe("blocked");
    expect(findOnBoard("first", "Searing Firenewt")).toBeDefined();
    expect(state.pendingTargetEffect).toBeFalsy();
  });

  it("global damage still hits Aura follower", () => {
    const aura = readyFollower("AuraUnit", "second", {
      defense: 5,
      hasAura: true,
    });
    state.players.second.board = [aura];
    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 2 }] as any,
      "first",
    );
    expect(Number(aura.defense)).toBe(3);
  });

  it("Ambush follower excluded from opponent select pool", () => {
    const ambush = readyFollower("Ambusher", "second", { hasAmbush: true });
    state.players.second.board = [ambush];
    const pool = getPool("enemy:follower", "first", null, undefined, {
      isTargetedEffect: true,
    });
    expect(pool.some((c) => c.uid === ambush.uid)).toBe(false);
  });

  it("Intimidate follower can be spell-targeted but not attacked by enemy followers", () => {
    const intimidate = readyFollower("Scary", "second", {
      hasIntimidate: true,
      defense: 5,
    });
    const atk = readyFollower("Atk", "first", { attack: 3 });
    state.players.second.board = [intimidate];
    state.players.first.board = [atk];

    const pool = getPool("enemy:follower", "first", null, undefined, {
      isTargetedEffect: true,
    });
    expect(pool.some((c) => c.uid === intimidate.uid)).toBe(true);
    expect(
      canAttackFollowerTarget(intimidate, state.players.second.board, atk),
    ).toBe(false);
  });

  it("Ward restricts combat targeting only — global spell damage still hits Ward", () => {
    const ward = readyFollower("Ward", "second", { hasWard: true, defense: 5 });
    const plain = readyFollower("Plain", "second", { defense: 5 });
    state.players.second.board = [ward, plain];

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 2 }] as any,
      "first",
    );
    expect(Number(plain.defense)).toBe(3);
    expect(Number(ward.defense)).toBe(3);
  });
});

// =============================================================================
// §340 Multi-target partial return / summon overflow
// =============================================================================

describe("Rulebook L340 — multi-target partial resolution", () => {
  beforeEach(() => resetUidCounter());

  it("return all allied followers with hand room for 3: oldest three return, fourth becomes shadow", () => {
    givenGameState({ seed: 1 })
      .withFirstHand([
        { name: "H1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H2", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H3", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H4", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H5", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "H6", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;

    const f1 = readyFollower("F1", "first", { uid: "f1" });
    const f2 = readyFollower("F2", "first", { uid: "f2" });
    const f3 = readyFollower("F3", "first", { uid: "f3" });
    const f4 = readyFollower("F4", "first", { uid: "f4" });
    state.players.first.board = [f1, f2, f3, f4];

    const shadowsBefore = getShadows(state, "first");
    whenRunEffects(
      [
        {
          op: "return",
          destination: "hand",
          target: "ally:follower",
          select: "all",
        },
      ] as any,
      "first",
    );

    const returnedNames = thenHand("first")
      .filter((c) => ["F1", "F2", "F3", "F4"].includes(c.name))
      .map((c) => c.name);
    expect(returnedNames).toEqual(["F1", "F2", "F3"]);
    expect(thenBoard("first")).toHaveLength(0);
    expect(thenHand("first").length).toBe(9);
    expect(getShadows(state, "first")).toBe(shadowsBefore + 1);
  });

  it("summon beyond field limit fills empty slots and ignores the rest", () => {
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
    state.players.first.board = [
      readyFollower("A", "first"),
      readyFollower("B", "first"),
      readyFollower("C", "first"),
      readyFollower("D", "first"),
    ];

    summonNamed({ op: "summon", name: "Goblin", count: 2 } as any, "first");
    expect(thenBoard("first").length).toBe(5);
    expect(thenBoard("first").filter((c) => c.name === "Goblin").length).toBe(
      1,
    );
  });
});

// =============================================================================
// §344–352 Resolution queue
// =============================================================================

describe("Rulebook L344–352 — trigger queue and death batches", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;
  });

  it("Ambush follower destroyed by global effect still fires Last Words", () => {
    const ambush = readyFollower("AmbushLW", "second", {
      hasAmbush: true,
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", source: "deck", count: 1 }] as any,
    });
    state.players.second.board = [ambush];
    const handBefore = thenHand("second").length;

    whenRunEffects(
      [{ op: "destroy", target: "enemy:follower", distribution: "all" }] as any,
      "first",
    );
    expect(thenHand("second").length).toBe(handBefore + 1);
  });

  it("control change: Last Words resolve for the controller at death", () => {
    const stolen = readyFollower("Stolen", "second", {
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", source: "deck", count: 1 }] as any,
    });
    state.players.second.board = [stolen];
    state.players.first.deck = [
      createCard(
        { name: "FirstDraw", type: "Follower", attack: 1, defense: 1 },
        "deck",
        "first",
      ),
    ];
    changeFollowerControl(stolen, "first");
    expect(stolen.owner).toBe("first");

    const handBefore = thenHand("first").length;
    whenRunEffects(
      [{ op: "destroy", target: "ally:follower", distribution: "all" }] as any,
      "first",
    );
    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(thenHand("first").some((c) => c.name === "FirstDraw")).toBe(true);
  });

  it("destroy 2 enemy followers at once: observer draws twice (§352 test case)", () => {
    const observer = readyFollower("Observer", "first", {
      triggers: [
        {
          event: "enemy_follower_leaves_field",
          source: "board",
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    });
    state.players.first.board = [observer];
    state.players.second.board = [
      readyFollower("E1", "second"),
      readyFollower("E2", "second"),
    ];

    const handBefore = thenHand("first").length;
    whenRunEffects(
      [{ op: "destroy", target: "enemy:follower", distribution: "all" }] as any,
      "first",
    );
    expect(thenHand("first").length).toBe(handBefore + 2);
  });

  it("follower that dies in the same batch does not count its own leave event", () => {
    const selfWatcher = readyFollower("SelfWatcher", "second", {
      triggers: [
        {
          event: "enemy_follower_leaves_field",
          source: "board",
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    });
    state.players.second.board = [selfWatcher];
    const handBefore = thenHand("second").length;

    whenRunEffects(
      [{ op: "destroy", target: "enemy:follower", distribution: "all" }] as any,
      "first",
    );
    expect(thenHand("second").length).toBe(handBefore);
  });
});

// =============================================================================
// §356–371 Randomness
// =============================================================================

describe("Rulebook L358–371 — randomness and distinct vs repeat rolls", () => {
  beforeEach(() => resetUidCounter());

  it("same seed and play sequence yields identical random_hits target", () => {
    const results: string[] = [];
    for (let run = 0; run < 2; run++) {
      resetUidCounter();
      givenGameState({ seed: 42 })
        .withSecondBoard([
          { name: "A", type: "Follower", defense: 5, attack: 1 },
          { name: "B", type: "Follower", defense: 5, attack: 1 },
          { name: "C", type: "Follower", defense: 5, attack: 1 },
        ])
        .build();
      state.gameStarted = true;
      whenRunEffects(
        [
          {
            op: "damage",
            target: "enemy:follower",
            amount: 3,
            distribution: "random_hits",
            count: 1,
          },
        ] as any,
        "first",
      );
      const hit = thenBoard("second").find((c) => Number(c.defense) === 2);
      results.push(hit?.name ?? "none");
    }
    expect(results[0]).toBe(results[1]);
  });

  it("random_hits (do this N times): same follower can be hit twice", () => {
    givenGameState({ seed: 2, activePlayer: "first" }).build();
    state.gameStarted = true;
    const tank = readyFollower("Tank", "second", { defense: 20 });
    state.players.second.board = [tank];

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 4,
          distribution: "random_hits",
          count: 2,
        },
      ] as any,
      "first",
    );
    expect(Number(tank.defense)).toBe(12);
  });

  it("random_distinct (N random followers): at most one hit per follower", () => {
    givenGameState({ seed: 42, activePlayer: "first" }).build();
    state.gameStarted = true;
    const fragile = readyFollower("Fragile", "second", { defense: 3 });
    const tank = readyFollower("Tank", "second", { defense: 10 });
    state.players.second.board = [fragile, tank];

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 5,
          count: 2,
          distribution: "random_distinct",
        },
      ] as any,
      "first",
    );

    expect(findOnBoard("second", "Fragile")).toBeUndefined();
    expect(Number(findOnBoard("second", "Tank")!.defense)).toBe(5);
  });

  it("random_distinct with fewer candidates than N: surplus picks do nothing", () => {
    givenGameState({ seed: 7, activePlayer: "first" }).build();
    state.gameStarted = true;
    const only = readyFollower("Only", "second", { defense: 10 });
    state.players.second.board = [only];

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 3,
          count: 3,
          distribution: "random_distinct",
        },
      ] as any,
      "first",
    );
    expect(Number(only.defense)).toBe(7);
  });

  it("first random_distinct kill removes candidate; second pick uses survivors only", () => {
    givenGameState({ seed: 42, activePlayer: "first" }).build();
    state.gameStarted = true;
    const fragile = readyFollower("Fragile", "second", { defense: 3 });
    const tank = readyFollower("Tank", "second", { defense: 10 });
    state.players.second.board = [fragile, tank];

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 5,
          count: 2,
          distribution: "random_distinct",
        },
      ] as any,
      "first",
    );

    expect(thenBoard("second")).toHaveLength(1);
    expect(findOnBoard("second", "Fragile")).toBeUndefined();
    expect(Number(findOnBoard("second", "Tank")!.defense)).toBe(5);
  });
});

// =============================================================================
// §583–598 Continuous effects and stat hierarchy
// =============================================================================

describe("Rulebook L585–598 — stat modification hierarchy", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
  });

  it("permanent buff persists on board across turns", () => {
    const card = readyFollower("Buffed", "first", { attack: 2, defense: 2 });
    state.players.first.board = [card];
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          attack: 2,
          defense: 1,
        },
      ] as any,
      "first",
    );
    expect(Number(card.attack)).toBe(4);
    whenEndTurn();
    whenEndTurn();
    expect(Number(card.attack)).toBe(4);
  });

  it("until_end_of_turn buff wears off at end-of-turn cleanup", () => {
    const card = readyFollower("Temp", "first", { attack: 2, defense: 2 });
    state.players.first.board = [card];
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          attack: 3,
          until_end_of_turn: true,
        },
      ] as any,
      "first",
    );
    expect(Number(card.attack)).toBe(5);
    runEndOfTurnBoundary("first");
    expect(Number(card.attack)).toBe(2);
  });

  it("until_eot alias wears off at end-of-turn cleanup (same as until_end_of_turn)", () => {
    const card = readyFollower("TempEot", "first", { attack: 2, defense: 2 });
    state.players.first.board = [card];
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          defense: 2,
          until_eot: true,
        },
      ] as any,
      "first",
    );
    expect(Number(card.defense)).toBe(4);
    runEndOfTurnBoundary("first");
    expect(Number(card.defense)).toBe(2);
  });

  it("set defense to 1 then +0/+2 buff yields 3 defense; heal capped at new max", () => {
    const card = readyFollower("SetThenBuff", "first", {
      attack: 2,
      defense: 5,
    });
    state.players.first.board = [card];
    setStatsBuff(card, null, 1, "first");
    applyStatBuff(card, 0, 2, "first");
    expect(Number(card.defense)).toBe(3);
    card.defense = 1;
    whenRunEffects(
      [{ op: "restore", target: "ally:follower", amount: 5 }] as any,
      "first",
    );
    expect(Number(card.defense)).toBe(3);
  });

  it("evolve +2/+2 stacks on current stats, then buff adds on top", () => {
    const card = readyFollower("EvoBuff", "first", { attack: 2, defense: 2 });
    state.players.first.board = [card];
    handleEvolveSelf(card, "first", { spendPoint: false });
    expect(Number(card.attack)).toBe(4);
    expect(Number(card.defense)).toBe(4);
    applyStatBuff(card, 1, 1, "first");
    expect(Number(card.attack)).toBe(5);
    expect(Number(card.defense)).toBe(5);
  });

  it("attack debuff floors dealt damage at 0; internal attack may go negative then buff", () => {
    const card = readyFollower("Debuff", "first", { attack: 5, defense: 5 });
    const foe = readyFollower("Foe", "second", { defense: 10 });
    state.players.first.board = [card];
    state.players.second.board = [foe];
    applyStatBuff(card, -7, 0, "first");
    expect(Number(card.attack)).toBe(-2);

    card.can_attack = true;
    attackFollower(0, 0, "first", "second");
    expect(Number(foe.defense)).toBe(10);

    applyStatBuff(card, 3, 0, "first");
    expect(Number(card.attack)).toBe(1);
  });

  it("0-attack follower with Bane still destroys combat target", () => {
    const bane = readyFollower("BaneZero", "first", {
      attack: 0,
      defense: 5,
      hasBane: true,
    });
    const foe = readyFollower("Foe", "second", { defense: 3 });
    state.players.first.board = [bane];
    state.players.second.board = [foe];
    bane.can_attack = true;
    attackFollower(0, 0, "first", "second");
    expect(thenBoard("second")).toHaveLength(0);
  });

  it("cannot attack restriction wins over can attack twice", () => {
    const locked = readyFollower("Locked", "first", { attack: 3, defense: 3 });
    locked.attacks_per_turn = 2;
    locked.attacks_left = 2;
    locked.can_attack = true;
    locked.keywordState = { cantAttack: true };
    state.players.first.board = [locked];
    const foe = readyFollower("Foe", "second");
    state.players.second.board = [foe];

    const foeDefBefore = Number(foe.defense);
    attackFollower(0, 0, "first", "second");
    expect(Number(foe.defense)).toBe(foeDefBefore);
    expect(locked.attacks_left).toBe(2);
  });
});

// =============================================================================
// §602–610 Hidden information (practice-tool exception)
// =============================================================================

describe("Rulebook L602–610 — hidden information (practice-tool exception)", () => {
  beforeEach(() => resetUidCounter());

  it("owner ruling: without revealing does not hide copies — enemy hand card identity readable", () => {
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
    const secret = createCard(
      { name: "Secret", type: "Follower", cost: 3, attack: 2, defense: 2 },
      "hand",
      "second",
    );
    state.players.second.hand = [secret];

    whenRunEffects(
      [
        {
          op: "add_to_hand",
          source: "copy",
          from: "enemy:hand",
          distribution: "random",
          count: 1,
        },
      ] as any,
      "first",
    );

    const copied = thenHand("first").find((c) => c.name === "Secret");
    expect(copied).toBeDefined();
    expect(Number(copied!.attack)).toBe(2);
    expect(copied!.zone).toBe("hand");
  });

  it("draw adds to acting player's hand only (opponent hand size unchanged for ally draw)", () => {
    givenGameState({ seed: 1 })
      .withFirstDeck([
        { name: "Mine", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;
    const firstBefore = thenHand("first").length;
    const secondBefore = thenHand("second").length;
    whenRunEffects([{ op: "draw", source: "deck", count: 1 }] as any, "first");
    expect(thenHand("first").length).toBe(firstBefore + 1);
    expect(thenHand("second").length).toBe(secondBefore);
  });
});

// =============================================================================
// §612–619 Copy semantics
// =============================================================================

describe("Rulebook L612–619 — exact copy vs base copy", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1 }).build();
    state.gameStarted = true;
  });

  it("exact copy (source:copy from enemy hand) keeps current stat modifications", () => {
    const buffed = createCard(
      { name: "Buffed", type: "Follower", cost: 4, attack: 2, defense: 2 },
      "hand",
      "second",
    );
    buffed.buffs = { attack: 4, defense: 0 };
    buffed.attack = 6;
    state.players.second.hand = [buffed];

    whenRunEffects(
      [
        {
          op: "add_to_hand",
          source: "copy",
          from: "enemy:hand",
          distribution: "random",
          count: 1,
        },
      ] as any,
      "first",
    );

    const exact = thenHand("first").find((c) => c.name === "Buffed")!;
    expect(Number(exact.attack)).toBe(6);
    expect(exact.buffs?.attack).toBe(4);
  });

  it("a copy via destroyed_match uses fresh base template, not instance mods", () => {
    const fairy = createCard("90011110", "board", "first");
    fairy.attack = 99;
    fairy.buffs = { attack: 98, defense: 0 };
    recordDestroyed(state, "first", fairy);
    const before = thenHand("first").length;

    whenRunEffects(
      [
        {
          op: "add_to_hand",
          source: "destroyed_match",
          count: 1,
          filter: { type: "Follower" },
          distribution: "random",
        },
      ] as any,
      "first",
    );

    expect(thenHand("first").length).toBe(before + 1);
    const added = thenHand("first")[before];
    expect(added.name).toBe("Fairy");
    expect(Number(added.attack)).toBe(1);
  });

  it("summon named copies use base printed stats (Summon 2 copies of Fairy)", () => {
    whenRunEffects(
      [{ op: "summon", source: "named", name: "Fairy", count: 2 }] as any,
      "first",
    );
    const fairies = thenBoard("first").filter((c) => c.name === "Fairy");
    expect(fairies.length).toBe(2);
    const base = getCardById("90011110");
    expect(Number(fairies[0].attack)).toBe(Number(base?.attack ?? 1));
    expect(Number(fairies[1].attack)).toBe(Number(base?.attack ?? 1));
    expect(fairies[0].uid).not.toBe(fairies[1].uid);
  });
});

// =============================================================================
// Owner ruling — Select is forced while legal target exists
// =============================================================================

describe("Owner ruling L78–84 — Select is forced", () => {
  beforeEach(() => resetUidCounter());

  it("mandatory hand select pauses play; cannot complete without choosing (10372120)", () => {
    setupMain(R6, {
      hand: [
        "10372120",
        { name: "Keep", type: "Spell", cost: 1 },
        { name: "DiscardMe", type: "Spell", cost: 1 },
      ],
      pp: 5,
      deck: [
        { name: "Draw1", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ],
    });
    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("paused");
    expect(state.pendingTargetEffect).toBeDefined();
    const discard = thenHand("first").find((c) => c.name === "DiscardMe")!;
    resolvePendingTarget(discard.uid);
    expect(thenHand("first").some((c) => c.name === "DiscardMe")).toBe(false);
    expect(thenHand("first").some((c) => c.name === "Draw1")).toBe(true);
  });

  it("empty hand: Field Scientist plays; discard clause fizzles", () => {
    setupMain(R6, { hand: ["10372120"], pp: 5 });
    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("done");
    expect(state.pendingTargetEffect).toBeFalsy();
    expect(findOnBoard("first", "Field Scientist")).toBeDefined();
  });
});
