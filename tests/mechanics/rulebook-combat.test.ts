/**
 * Rulebook L2 — combat, damage, destruction and enter-play order.
 *
 * Oracle: docs/svwb_rulebook_formatted.md L254–296, L509–578 (+ owner rulings).
 * Assert what the rulebook says, not incidental engine behaviour.
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
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { playFollower } from "../../src/logic/core/playCard/follower.js";
import { dealDamage, grantBarrier } from "../../src/logic/core/barrier.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { isDamaged } from "../../src/logic/core/combat/damageState.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import {
  applyStatBuff,
  setStatsBuff,
} from "../../src/logic/effects/ops/stat/core.js";
import {
  getBoard,
  getHP,
  getShadows,
  getBanish,
  getGraveyard,
  setLeaderDamageTakenBonus,
} from "../../src/core/playerHelpers.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { handleRestore } from "../../src/logic/effects/ops/restore/index.js";
import type {
  CardInstance,
  Effect,
  Player,
} from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

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
    hasBane?: boolean;
    hasDrain?: boolean;
    hasBarrier?: boolean;
    hasStorm?: boolean;
    hasRush?: boolean;
    hasLastWords?: boolean;
    lastWordsEffects?: Effect[];
    triggers?: object[];
    fanfare?: Effect[];
    enter?: Effect[];
    evoType?: string;
    hasEvolved?: boolean;
    keywordState?: Record<string, unknown>;
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
      hasBane: opts.hasBane,
      hasDrain: opts.hasDrain,
      hasStorm: opts.hasStorm,
      hasRush: opts.hasRush,
      triggers: opts.triggers,
      fanfare: opts.fanfare,
      enter: opts.enter,
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
  if (opts.insertionTs != null) (card as any).insertionTs = opts.insertionTs;
  if (opts.hasBarrier) grantBarrier(card);
  if (opts.hasLastWords) {
    card.hasLastWords = true;
    const lw = opts.lastWordsEffects ?? [];
    card.lastWordsEffects = lw;
    card.keywordState = { ...(card.keywordState ?? {}), lastWordsEffects: lw };
  }
  if (opts.keywordState) {
    card.keywordState = { ...(card.keywordState ?? {}), ...opts.keywordState };
  }
  if (opts.evoType) {
    card.evoType = opts.evoType;
    card.hasEvolved = opts.hasEvolved ?? true;
  }
  applyKeywordsFromList(card);
  return card;
}

function combatAttacker(
  owner: Player,
  opts: Parameters<typeof readyFollower>[2] = {},
) {
  const c = readyFollower("Attacker", owner, opts);
  c.can_attack = true;
  c.can_attack_followers = true;
  c.attacks_left = 1;
  c.justPlayed = false;
  return c;
}

function lwFollower(
  owner: Player,
  name: string,
  insertionTs: number,
  summonName: string,
): CardInstance {
  const lw = [
    { op: "summon", source: "named", name: summonName, count: 1 } as Effect,
  ];
  return readyFollower(name, owner, {
    defense: 0,
    insertionTs,
    hasLastWords: true,
    lastWordsEffects: lw,
  });
}

// ---------------------------------------------------------------------------
// §254–273 Combat Timing Specifics
// ---------------------------------------------------------------------------

describe("Rulebook L254–273 — Combat timing specifics", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 7, activePlayer: "first" })
      .withFirstDeck(fillerDeck("PadF", 20))
      .withSecondDeck(fillerDeck("PadS", 20))
      .build();
    state.gameStarted = true;
    state.players.second.hp = 20;
  });

  it("L258–264: Strike then Clash then damage — rulebook combat test case (L273)", () => {
    // Rulebook L273: Strike 1 to leader, Clash 2 to attacker, combat damage, Bane at 0 ATK.
    const attacker = combatAttacker("first", {
      attack: 1,
      defense: 2,
      hasBane: true,
      triggers: [
        {
          event: "strike",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
        },
      ],
    });
    const defender = readyFollower("Defender", "second", {
      attack: 3,
      defense: 5,
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

    expect(state.players.second.hp).toBe(19);
    expect(Number(attacker.defense)).toBe(0);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L260: attacker Strike and Clash both resolve before combat damage (card-text order)", () => {
    // If Clash ran only after damage, the +2 Strike buff below would not apply to combat.
    const attacker = combatAttacker("first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "strike",
          source: "board",
          effects: [
            {
              op: "stat",
              action: "give",
              target: "self",
              attack: 2,
              defense: 0,
            },
          ],
        },
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
        },
      ],
    });
    const defender = readyFollower("Wall", "second", {
      attack: 0,
      defense: 10,
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    expect(state.players.second.hp).toBe(19);
    expect(Number(defender.defense)).toBe(7);
  });

  it("L261: defender Clash resolves after attacker's pre-damage triggers", () => {
    const attacker = combatAttacker("first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "strike",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
        },
      ],
    });
    const defender = readyFollower("Defender", "second", {
      attack: 0,
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

    expect(state.players.second.hp).toBe(19);
    expect(Number(attacker.defense)).toBe(3);
    expect(Number(defender.defense)).toBe(9);
  });

  it("L262: ally_follower_attacked crest fires on attack (leader/crest before board — see audit C5)", () => {
    state.players.first.crests = [
      {
        name: "Attack Watch Crest",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_follower_attacked",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
    ] as any;

    const attacker = combatAttacker("first", { attack: 2, defense: 2 });
    const defender = readyFollower("Dummy", "second", {
      attack: 1,
      defense: 5,
    });
    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    const handBefore = thenHand("first").length;
    attackFollower(0, 0, "first", "second");
    expect(thenHand("first").length).toBe(handBefore + 1);
  });

  it("L263–265: follower vs follower deals simultaneous combat damage (L541)", () => {
    const attacker = combatAttacker("first", { attack: 4, defense: 5 });
    const defender = readyFollower("Defender", "second", {
      attack: 3,
      defense: 6,
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    expect(Number(defender.defense)).toBe(2);
    expect(Number(attacker.defense)).toBe(2);
  });

  it("L265 / L542: follower vs leader — leader takes damage and does not strike back", () => {
    const attacker = combatAttacker("first", {
      attack: 4,
      defense: 5,
      hasStorm: true,
    });
    state.players.first.board = [attacker];
    state.players.second.hp = 20;

    attackLeader(0, "first", "second");

    expect(state.players.second.hp).toBe(16);
    expect(state.players.first.hp).toBe(20);
  });

  it("L266: simultaneous destruction — both combatants at 0 die together", () => {
    const attacker = combatAttacker("first", { attack: 3, defense: 3 });
    const defender = readyFollower("Defender", "second", {
      attack: 3,
      defense: 3,
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "first").length).toBe(0);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L266: dying follower does not trigger its own leave observer (survivors only)", () => {
    givenGameState({ seed: 3, activePlayer: "first" })
      .withFirstDeck(fillerDeck("D", 10))
      .withSecondDeck(fillerDeck("E", 10))
      .build();
    state.gameStarted = true;

    const watcher = readyFollower("Watcher", "first", {
      defense: 1,
      triggers: [
        {
          event: "enemy_follower_leaves_field",
          source: "board",
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    });
    const victimA = readyFollower("A", "second", { defense: 1 });
    const victimB = readyFollower("B", "second", { defense: 1 });

    state.players.first.board = [watcher];
    state.players.second.board = [victimA, victimB];

    const handBefore = thenHand("first").length;
    whenRunEffects(
      [{ op: "damage", target: "all:follower", amount: 5 } as Effect],
      "first",
    );

    // Watcher dies in the same event — must not draw for its own death (0 triggers).
    expect(thenHand("first").length).toBe(handBefore);
  });

  it("L352 cross-ref: destroy 2 enemies at once — enemy-leave observer fires twice", () => {
    const observer = readyFollower("Observer", "first", {
      defense: 10,
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
      readyFollower("E1", "second", { defense: 1 }),
      readyFollower("E2", "second", { defense: 1 }),
    ];

    const handBefore = thenHand("first").length;
    whenRunEffects(
      [
        {
          op: "destroy",
          target: "enemy:follower",
          distribution: "all",
        } as Effect,
      ],
      "first",
    );

    expect(thenHand("first").length).toBe(handBefore + 2);
  });

  it("L267: super-evolution knockback hits leader before destroyed follower's Last Words", () => {
    // Rulebook L267: knockback −1 before defender LW restore +5 → leader ends at 20.
    state.players.second.hp = 20;
    const attacker = combatAttacker("first", {
      attack: 5,
      defense: 5,
      evoType: "super",
      hasEvolved: true,
    });
    const defender = readyFollower("Fodder", "second", {
      attack: 0,
      defense: 2,
      hasLastWords: true,
      lastWordsEffects: [
        {
          op: "restore",
          target: "leader",
          player: "self",
          amount: 5,
        } as Effect,
      ],
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    expect(state.players.second.hp).toBe(20);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L267: knockback resolves before Last Words that damage the enemy leader", () => {
    const prevHeadless = (globalThis as any).HEADLESS;
    (globalThis as any).HEADLESS = false;
    clearLogs();
    state.players.second.hp = 20;
    const attacker = combatAttacker("first", {
      attack: 5,
      defense: 5,
      evoType: "super",
      hasEvolved: true,
    });
    const defender = readyFollower("Fodder", "second", {
      attack: 0,
      defense: 2,
      hasLastWords: true,
      lastWordsEffects: [
        {
          op: "damage",
          target: "enemy:leader",
          amount: 1,
        } as Effect,
      ],
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");
    (globalThis as any).HEADLESS = prevHeadless;

    const logs = getLogs();
    const piercingIdx = logs.findIndex((e) => e.type === "piercingPing");
    const lwDamageIdx = logs.findIndex(
      (e, i) =>
        i > piercingIdx &&
        e.type === "leaderDamage" &&
        e.details?.owner === "first",
    );
    expect(piercingIdx).toBeGreaterThanOrEqual(0);
    expect(lwDamageIdx).toBeGreaterThan(piercingIdx);
    expect(state.players.first.hp).toBe(19);
    expect(state.players.second.hp).toBe(19);
  });

  it("L267 negative: non-super-evolved attacker deals no knockback on kill", () => {
    const prevHeadless = (globalThis as any).HEADLESS;
    (globalThis as any).HEADLESS = false;
    clearLogs();
    state.players.second.hp = 20;
    const attacker = combatAttacker("first", {
      attack: 5,
      defense: 5,
    });
    const defender = readyFollower("Fodder", "second", {
      attack: 0,
      defense: 2,
      hasLastWords: true,
      lastWordsEffects: [
        {
          op: "restore",
          target: "leader",
          player: "self",
          amount: 5,
        } as Effect,
      ],
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");
    (globalThis as any).HEADLESS = prevHeadless;

    expect(state.players.second.hp).toBe(20);
    expect(getLogs().some((e) => e.type === "piercingPing")).toBe(false);
  });

  it("L267: follower-strike kill applies knockback before destroyed follower's Last Words", () => {
    state.players.second.hp = 20;
    const attacker = combatAttacker("first", {
      attack: 1,
      defense: 5,
      evoType: "super",
      hasEvolved: true,
      triggers: [
        {
          event: "follower_strike",
          source: "board",
          effects: [
            {
              op: "destroy",
              target: "enemy:follower",
            } as Effect,
          ],
        },
      ],
    });
    const defender = readyFollower("Fodder", "second", {
      attack: 0,
      defense: 2,
      hasLastWords: true,
      lastWordsEffects: [
        {
          op: "restore",
          target: "leader",
          player: "self",
          amount: 5,
        } as Effect,
      ],
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    expect(state.players.second.hp).toBe(20);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L268–269: cross-side Last Words — active player's batch resolves first", () => {
    state.players.first.board = [lwFollower("first", "ActiveLW", 1, "Bat")];
    state.players.second.board = [
      lwFollower("second", "ReactiveLW", 1, "Knight"),
    ];

    cleanupDead();

    const bat = getBoard(state, "first").find((c) => c.name === "Bat");
    const knight = getBoard(state, "second").find((c) => c.name === "Knight");
    expect(bat).toBeDefined();
    expect(knight).toBeDefined();
    expect((bat as any).insertionTs).toBeLessThan((knight as any).insertionTs);
  });

  it("L269: same-side simultaneous Last Words resolve oldest-first (entry order)", () => {
    state.players.first.board = [
      lwFollower("first", "YoungLW", 2, "Knight"),
      lwFollower("first", "OldLW", 1, "Bat"),
    ];

    cleanupDead();

    const bat = getBoard(state, "first").find((c) => c.name === "Bat");
    const knight = getBoard(state, "first").find((c) => c.name === "Knight");
    expect(bat).toBeDefined();
    expect(knight).toBeDefined();
    expect((bat as any).insertionTs).toBeLessThan((knight as any).insertionTs);
  });
});

// ---------------------------------------------------------------------------
// §275–292 Fanfare and enter-play trigger order
// ---------------------------------------------------------------------------

describe("Rulebook L275–292 — Fanfare and enter-play order", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 11, activePlayer: "first" })
      .withFirstPP(10, 10)
      .withFirstDeck(fillerDeck("PadF", 20))
      .withSecondDeck(fillerDeck("PadS", 20))
      .build();
    state.gameStarted = true;
  });

  it("L279–280: Fanfare resolves before play-reactive crest (step 1 before 2)", () => {
    state.players.first.crests = [
      {
        name: "Play Crest",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_card_played",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
    ] as any;

    const card = createCard(
      {
        name: "EnterProbe",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        fanfare: [{ op: "damage", target: "enemy:leader", amount: 1 }],
      },
      "hand",
      "first",
    );
    applyKeywordsFromList(card);
    card.peak_defense = card.defense;
    state.players.second.hp = 20;

    const handBefore = thenHand("first").length;
    playFollower(card, "first", null);

    expect(state.players.second.hp).toBe(19);
    expect(thenHand("first").length).toBe(handBefore + 1);
  });

  it("L289: Fanfare-granted Ward is not present at the instant of entering", () => {
    state.players.first.crests = [
      {
        name: "Ward Enter Crest",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            condition: { has_keyword: "Ward", not_self: true },
            effects: [
              {
                op: "stat",
                action: "give",
                target: "entering_follower",
                attack: 3,
                defense: 3,
              },
            ],
          },
        ],
      },
    ] as any;

    const card = createCard(
      {
        name: "Fanfare Ward",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        fanfare: [
          {
            op: "keyword",
            action: "grant",
            target: "self",
            keywords: ["Ward"],
          },
        ],
      },
      "hand",
      "first",
    );
    applyKeywordsFromList(card);
    card.peak_defense = card.defense;

    playFollower(card, "first", null);

    expect(card.hasWard).toBe(true);
    expect(Number(card.attack)).toBe(1);
    expect(Number(card.defense)).toBe(1);
  });

  it("L290: overflowed summons never entered — enter triggers do not fire", () => {
    state.players.first.board = [
      readyFollower("B1", "first", { defense: 1 }),
      readyFollower("B2", "first", { defense: 1 }),
      readyFollower("B3", "first", { defense: 1 }),
    ];

    state.players.first.crests = [
      {
        name: "Enter Counter",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
    ] as any;

    const card = createCard(
      {
        name: "Overflow Summoner",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        fanfare: [{ op: "summon", source: "named", name: "Goblin", count: 2 }],
      },
      "hand",
      "first",
    );
    applyKeywordsFromList(card);
    card.peak_defense = card.defense;

    const handBefore = thenHand("first").length;
    playFollower(card, "first", null);

    // Played card + one Goblin entered; second Goblin overflowed → two draws, not three.
    expect(thenHand("first").length).toBe(handBefore + 2);
    expect(thenBoard("first").filter((c) => c.name === "Goblin").length).toBe(
      1,
    );
  });

  it("L291: once-per-turn enter trigger reacts only to the first of simultaneous entries", () => {
    state.players.first.crests = [
      {
        name: "Once Enter",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            once_per_turn: true,
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
    ] as any;

    const handBefore = thenHand("first").length;
    whenRunEffects(
      [{ op: "summon", source: "named", name: "Goblin", count: 2 }] as Effect[],
      "first",
    );

    expect(thenHand("first").length).toBe(handBefore + 1);
  });

  it("L292 owner: named_enter_count enter-route excludes self (6th copy buffs at 5 others)", () => {
    state.players.first.followerEnterHistory = Array.from(
      { length: 5 },
      (_, i) => ({
        name: "Obsessed Test Subject",
        uid: `hist_${i}`,
        insertionTs: i,
      }),
    ) as any;
    state.players.first.hand = [createCard("10931110", "hand", "first")];
    state.players.first.pp = 10;

    whenPlayCard("first", 0);

    const subj = findOnBoard("first", "Obsessed Test Subject");
    expect(subj).toBeDefined();
    expect(Number(subj!.attack)).toBe(5);
    expect(Number(subj!.defense)).toBe(5);
  });

  it("L292 owner negative branch: 5th copy does not buff (only 4 other enters)", () => {
    state.players.first.followerEnterHistory = Array.from(
      { length: 4 },
      (_, i) => ({
        name: "Obsessed Test Subject",
        uid: `hist_${i}`,
        insertionTs: i,
      }),
    ) as any;
    state.players.first.hand = [createCard("10931110", "hand", "first")];
    state.players.first.pp = 10;

    whenPlayCard("first", 0);

    const subj = findOnBoard("first", "Obsessed Test Subject");
    expect(Number(subj!.attack)).toBe(2);
    expect(Number(subj!.defense)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §509–531 Damage events (general)
// ---------------------------------------------------------------------------

describe("Rulebook L509–531 — Damage events (general)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 5, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("L511–512: split_sequential allocates oldest-first and spills when spill_to_leader", () => {
    state.players.second.board = [
      readyFollower("Old", "second", { defense: 2, insertionTs: 1 }),
      readyFollower("Young", "second", { defense: 5, insertionTs: 2 }),
    ];
    state.players.second.hp = 20;

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 4,
          distribution: "split_sequential",
          spill_to_leader: true,
        },
      ] as Effect[],
      "first",
    );

    expect(findOnBoard("second", "Old")).toBeUndefined();
    expect(findOnBoard("second", "Young")?.defense).toBe(3);
  });

  it("L513–517 owner: Barrier consumes full split allocation (10 pool → 1/6 Barrier then 1/1 behind)", () => {
    state.players.second.hp = 20;
    const oldest = readyFollower("OldestBarrier", "second", {
      attack: 1,
      defense: 6,
      insertionTs: 1,
      hasBarrier: true,
    });
    const next = readyFollower("Next", "second", {
      attack: 1,
      defense: 5,
      insertionTs: 2,
    });
    state.players.second.board = [oldest, next];

    whenRunEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 10,
          distribution: "split_sequential",
          spill_to_leader: false,
        },
      ] as Effect[],
      "first",
    );

    expect(oldest.hasBarrier).toBe(false);
    expect(Number(oldest.defense)).toBe(6);
    expect(Number(next.defense)).toBe(1);
    expect(state.players.second.hp).toBe(20);
  });

  it("L519: 0 damage still counts as taking damage for self_damaged triggers", () => {
    state.players.second.hp = 20;
    const target = readyFollower("Target", "first", {
      defense: 5,
      triggers: [
        {
          event: "self_damaged",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
        },
      ],
    });
    state.players.first.board = [target];

    dealDamage(target, 0, null);

    expect(state.players.second.hp).toBe(19);
    expect(Number(target.defense)).toBe(5);
  });

  it("L521–525 owner: super-evolve protection still emits self_damaged on 0-damage hit (own turn)", () => {
    state.activePlayer = "first";
    state.players.second.hp = 20;
    const superDef = readyFollower("SuperDef", "first", {
      attack: 2,
      defense: 5,
      evoType: "super",
      hasEvolved: true,
      triggers: [
        {
          event: "self_damaged",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
        },
      ],
    });
    state.players.first.board = [superDef];

    dealDamage(superDef, 4, null);

    expect(Number(superDef.defense)).toBe(5);
    expect(state.players.second.hp).toBe(19);
  });

  it("L527–530 owner: takes-N-more-damage applies to a 0-damage event; healing does not", () => {
    state.players.second.hp = 20;
    setLeaderDamageTakenBonus(state, "second", 1);

    applyLeaderDamage("second", 0);
    expect(state.players.second.hp).toBe(19);

    state.players.second.hp = 10;
    handleRestore(
      { op: "restore", target: "leader", player: "self", amount: 0 },
      "second",
      [],
      { owner: "second" },
    );
    expect(state.players.second.hp).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// §539–548 Combat procedure recap
// ---------------------------------------------------------------------------

describe("Rulebook L539–548 — Combat procedure recap", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 9, activePlayer: "first" })
      .withFirstDeck(fillerDeck("F", 20))
      .withSecondDeck(fillerDeck("S", 20))
      .build();
    state.gameStarted = true;
  });

  it("L544–545: damage persists across turns until restored", () => {
    const card = readyFollower("Scarred", "first", { attack: 5, defense: 5 });
    state.players.first.board = [card];
    dealDamage(card, 3, null);
    expect(Number(card.defense)).toBe(2);

    whenEndTurn();
    whenEndTurn();

    expect(Number(card.defense)).toBe(2);
  });

  it("L545: lethal at exactly 0 defense — no negative tracking", () => {
    const card = readyFollower("Victim", "second", { defense: 3 });
    state.players.second.board = [card];
    dealDamage(card, 3, null);
    cleanupDead();
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L546: destroy bypasses Barrier and does not count as damage", () => {
    const card = readyFollower("Target", "second", {
      defense: 10,
      hasBarrier: true,
    });
    state.players.second.board = [card];

    whenRunEffects(
      [{ op: "destroy", target: "enemy:follower" } as Effect],
      "first",
    );

    expect(getBoard(state, "second").length).toBe(0);
    expect(card.hasBarrier).toBe(true);
  });

  it("L548: damage modifiers apply before set cap (+1 then cap 3 on 5 → 3 dealt)", () => {
    state.players.second.hp = 20;
    state.players.second.leaderMaxDamageCap = 3;
    setLeaderDamageTakenBonus(state, "second", 1);

    applyLeaderDamage("second", 5);

    expect(state.players.second.hp).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// §550–558 Barrier
// ---------------------------------------------------------------------------

describe("Rulebook L550–558 — Barrier", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 2, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("L552: Barrier absorbs one damage instance including bookkeeping, then breaks", () => {
    const tank = readyFollower("Tank", "second", {
      defense: 5,
      hasBarrier: true,
    });
    state.players.second.board = [tank];

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 3 } as Effect],
      "first",
    );
    expect(Number(tank.defense)).toBe(5);
    expect(tank.hasBarrier).toBeFalsy();

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 3 } as Effect],
      "first",
    );
    expect(Number(tank.defense)).toBe(2);
  });

  it("L552: Barrier does not stack — second grant while active is ignored", () => {
    const tank = readyFollower("Tank", "second", {
      defense: 5,
      hasBarrier: true,
    });
    grantBarrier(tank);
    state.players.second.board = [tank];

    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 4 } as Effect],
      "first",
    );
    expect(Number(tank.defense)).toBe(5);
    expect(tank.hasBarrier).toBeFalsy();
  });

  it("L552: Barrier does not stop destroy", () => {
    const tank = readyFollower("Tank", "second", {
      defense: 5,
      hasBarrier: true,
    });
    state.players.second.board = [tank];
    whenRunEffects(
      [{ op: "destroy", target: "enemy:follower" } as Effect],
      "first",
    );
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L552: Barrier does not save from Bane combat kill", () => {
    const bane = combatAttacker("first", {
      attack: 0,
      defense: 5,
      hasBane: true,
    });
    const barrier = readyFollower("BarrierDef", "second", {
      attack: 0,
      defense: 10,
      hasBarrier: true,
    });
    state.players.first.board = [bane];
    state.players.second.board = [barrier];

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L555–558: -N defense is not damage — Barrier unchanged, not damaged state", () => {
    const card = readyFollower("Target", "first", { defense: 5 });
    grantBarrier(card);
    state.players.first.board = [card];

    applyStatBuff(card, 0, -2, "first");

    expect(Number(card.defense)).toBe(3);
    expect(card.hasBarrier).toBe(true);
    expect(isDamaged(card)).toBe(false);
  });

  it("L553–554: setting defense overwrites damage (set to 1 → full 1/1)", () => {
    const card = readyFollower("Target", "first", {
      defense: 5,
      peak_defense: 5,
    });
    dealDamage(card, 3, null);
    setStatsBuff(card, null, 1, "first");
    expect(Number(card.defense)).toBe(1);
    expect(isDamaged(card)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §560–565 Bane, Drain, AoE, self-damage
// ---------------------------------------------------------------------------

describe("Rulebook L560–565 — Bane, Drain, and special combat damage", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 4, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.players.first.hp = 20;
    state.players.second.hp = 20;
  });

  it("L562: 1/1 Bane into 10/10 — both die (Bane after damage exchange)", () => {
    const bane = combatAttacker("first", {
      attack: 1,
      defense: 1,
      hasBane: true,
    });
    const wall = readyFollower("Wall", "second", { attack: 10, defense: 10 });
    state.players.first.board = [bane];
    state.players.second.board = [wall];

    attackFollower(0, 0, "first", "second");

    expect(getBoard(state, "first").length).toBe(0);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L562 negative: cannot be destroyed by abilities survives Bane above 0 def", () => {
    const bane = combatAttacker("first", {
      attack: 1,
      defense: 1,
      hasBane: true,
    });
    const wall = readyFollower("Wall", "second", {
      attack: 10,
      defense: 10,
      keywordState: { cannotBeDestroyed: true },
    });
    state.players.first.board = [bane];
    state.players.second.board = [wall];

    attackFollower(0, 0, "first", "second");

    expect(findOnBoard("second", "Wall")).toBeDefined();
    expect(Number(wall.defense)).toBe(9);
  });

  it("L563: Drain restores only as attacker on combat damage to leader", () => {
    state.players.first.hp = 15;
    const drainer = combatAttacker("first", {
      attack: 5,
      defense: 5,
      hasDrain: true,
      hasStorm: true,
    });
    state.players.first.board = [drainer];

    attackLeader(0, "first", "second");

    expect(state.players.first.hp).toBe(20);
  });

  it("L563 negative: defending Drain follower restores nothing from counter-damage", () => {
    state.players.second.hp = 10;
    const atk = combatAttacker("first", { attack: 5, defense: 5 });
    const def = readyFollower("DrainDef", "second", {
      attack: 5,
      defense: 5,
      hasDrain: true,
    });
    state.players.first.board = [atk];
    state.players.second.board = [def];

    attackFollower(0, 0, "first", "second");

    expect(state.players.second.hp).toBe(10);
  });

  it("L563 negative: Clash damage from Drain follower does not Drain-heal", () => {
    state.players.first.hp = 10;
    const drain = combatAttacker("first", {
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

    expect(state.players.first.hp).toBe(11);
  });

  it("L564: AoE damage then simultaneous destruction", () => {
    state.players.second.board = [
      readyFollower("A", "second", { defense: 2 }),
      readyFollower("B", "second", { defense: 2 }),
    ];
    whenRunEffects(
      [{ op: "damage", target: "enemy:follower", amount: 2 } as Effect],
      "first",
    );
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L543: followers attack once per turn normally (attacks_left spent)", () => {
    const attacker = combatAttacker("first", {
      attack: 3,
      defense: 3,
      hasStorm: true,
    });
    state.players.first.board = [attacker];
    state.players.second.hp = 20;

    attackLeader(0, "first", "second");
    expect(attacker.attacks_left).toBe(0);
    expect(attacker.can_attack).toBe(false);

    const hpAfterFirst = state.players.second.hp;
    attackLeader(0, "first", "second");
    expect(state.players.second.hp).toBe(hpAfterFirst);
  });

  it("L564: simultaneous leader damage — active player's side resolves first (both at 0 → active loses)", () => {
    state.players.first.hp = 1;
    state.players.second.hp = 1;
    state.players.first.board = [
      readyFollower("AoE", "first", {
        defense: 1,
        triggers: [
          {
            event: "last_words",
            source: "board",
            effects: [{ op: "damage", target: "all:leader", amount: 2 }],
          },
        ],
        hasLastWords: true,
        lastWordsEffects: [
          { op: "damage", target: "all:leader", amount: 2 } as Effect,
        ],
      }),
    ];
    whenRunEffects(
      [{ op: "damage", target: "all:leader", amount: 2 } as Effect],
      "first",
    );
    expect(state.players.first.hp).toBe(0);
  });

  it("L565: self-damage to own leader at 0 loses the game", () => {
    state.players.first.hp = 3;
    whenRunEffects(
      [{ op: "damage", target: "ally:leader", amount: 5 } as Effect],
      "first",
    );
    expect(state.players.first.hp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §567–577 Destruction vs other removal
// ---------------------------------------------------------------------------

describe("Rulebook L567–577 — Destruction vs other removal", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 6, activePlayer: "first" })
      .withFirstDeck(fillerDeck("F", 10))
      .withSecondDeck(fillerDeck("S", 10))
      .build();
    state.gameStarted = true;
  });

  it("L571: destroy → cemetery, shadow, Last Words fire", () => {
    const victim = readyFollower("LW", "second", {
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", source: "deck", count: 1 } as Effect],
    });
    state.players.second.board = [victim];
    const handBefore = thenHand("second").length;
    const shadowsBefore = getShadows(state, "second");

    whenRunEffects(
      [{ op: "destroy", target: "enemy:follower" } as Effect],
      "first",
    );

    expect(getBoard(state, "second").length).toBe(0);
    expect(getGraveyard(state, "second").some((c) => c.name === "LW")).toBe(
      true,
    );
    expect(getShadows(state, "second")).toBe(shadowsBefore + 1);
    expect(thenHand("second").length).toBe(handBefore + 1);
  });

  it("L572: banish — no shadow, no Last Words", () => {
    const victim = readyFollower("LW", "second", {
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", source: "deck", count: 1 } as Effect],
    });
    state.players.second.board = [victim];
    const handBefore = thenHand("second").length;
    const shadowsBefore = getShadows(state, "second");

    whenRunEffects(
      [
        {
          op: "banish",
          target: "enemy:follower",
          distribution: "all",
        } as Effect,
      ],
      "first",
    );

    expect(getShadows(state, "second")).toBe(shadowsBefore);
    expect(thenHand("second").length).toBe(handBefore);
    expect(getBanish(state, "second").some((c) => c.name === "LW")).toBe(true);
  });

  it("L573: transform — no Last Words, no shadow; new card unrelated", () => {
    const original = readyFollower("Original", "second", {
      attack: 2,
      defense: 2,
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", source: "deck", count: 1 } as Effect],
    });
    original.uid = "transform-victim";
    state.players.second.board = [original];
    const handBefore = thenHand("second").length;
    const shadowsBefore = getShadows(state, "second");

    whenRunEffects(
      [
        {
          op: "transform",
          target: "enemy:follower",
          into: "Bat",
        },
      ] as Effect[],
      "first",
    );

    const onBoard = getBoard(state, "second")[0]!;
    expect(onBoard.name).toBe("Bat");
    expect(getShadows(state, "second")).toBe(shadowsBefore);
    expect(thenHand("second").length).toBe(handBefore);
  });

  it("L574: return to hand — not destroy; no shadow; leaves play", () => {
    const victim = readyFollower("BounceMe", "second", {
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", source: "deck", count: 1 } as Effect],
    });
    state.players.second.board = [victim];
    const handBefore = thenHand("second").length;
    const shadowsBefore = getShadows(state, "second");

    whenRunEffects(
      [
        {
          op: "return",
          destination: "hand",
          target: "enemy:follower",
        } as Effect,
      ],
      "first",
    );

    expect(thenHand("second").length).toBe(handBefore + 1);
    expect(getShadows(state, "second")).toBe(shadowsBefore);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("L574: bounce into full hand burns overflow (9 cards → shadow, not 10 hand)", () => {
    state.players.first.hand = fillerDeck("H", 9).map((s, i) =>
      createCard({ ...s, uid: `h${i}` }, "hand", "first"),
    );
    const onBoard = readyFollower("BounceMe", "first", { defense: 2 });
    state.players.first.board = [onBoard];
    const shadowsBefore = getShadows(state, "first");

    whenRunEffects(
      [
        {
          op: "return",
          destination: "hand",
          target: "ally:follower",
        } as Effect,
      ],
      "first",
    );

    expect(thenHand("first").length).toBe(9);
    expect(getShadows(state, "first")).toBe(shadowsBefore + 1);
  });

  it("L575: return to deck from hand is not destruction (no shadow)", () => {
    const card = createCard(
      { name: "RetreatMe", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "hand",
      "first",
    );
    state.players.first.hand = [card];
    const shadowsBefore = getShadows(state, "first");
    const deckBefore = thenHand("first").length;

    whenRunEffects(
      [
        {
          op: "return",
          destination: "deck",
          target: "ally:hand",
        },
      ] as Effect[],
      "first",
    );

    expect(thenHand("first").length).toBe(deckBefore - 1);
    expect(state.players.first.deck.some((c) => c.name === "RetreatMe")).toBe(
      true,
    );
    expect(getShadows(state, "first")).toBe(shadowsBefore);
  });

  it("L576: leaves-play vs destroyed — bounce is not destroy history", () => {
    const victim = readyFollower("Leave", "second", { defense: 2 });
    state.players.second.board = [victim];
    whenRunEffects(
      [
        {
          op: "return",
          destination: "hand",
          target: "enemy:follower",
        } as Effect,
      ],
      "first",
    );
    expect(state.players.second.destroyedHistory?.length ?? 0).toBe(0);
  });

  it("L576: Last Words summon after board wipe survives (enters afterward)", () => {
    state.players.first.board = [
      readyFollower("Doom", "first", {
        defense: 1,
        hasLastWords: true,
        lastWordsEffects: [
          { op: "summon", source: "named", name: "Bat", count: 1 } as Effect,
        ],
      }),
      readyFollower("Fodder", "first", { defense: 1 }),
    ];
    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          distribution: "all",
        } as Effect,
      ],
      "first",
    );
    expect(getBoard(state, "first").some((c) => c.name === "Bat")).toBe(true);
  });

  it("L576: destroy adds to destroyed history; banish does not", () => {
    state.players.second.board = [
      readyFollower("D1", "second", { defense: 1 }),
    ];
    whenRunEffects(
      [{ op: "destroy", target: "enemy:follower" } as Effect],
      "first",
    );
    expect((state.players.second.destroyedHistory?.length ?? 0) >= 1).toBe(
      true,
    );

    resetUidCounter();
    givenGameState({ seed: 8 }).build();
    state.gameStarted = true;
    state.players.second.board = [
      readyFollower("B1", "second", { defense: 1 }),
    ];
    whenRunEffects(
      [
        {
          op: "banish",
          target: "enemy:follower",
          distribution: "all",
        } as Effect,
      ],
      "first",
    );
    expect(state.players.second.destroyedHistory?.length ?? 0).toBe(0);
  });
});
