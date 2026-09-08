import { beforeEach, describe, expect, it } from "vitest";
import "./setup.js";
import {
  createCard,
  givenGameState,
  resetUidCounter,
  whenRunEffects,
  whenPlayCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
  getDeck,
  getBanish,
  getShadows,
} from "../../src/core/playerHelpers.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { playerHasCrestPassive } from "../../src/logic/effects/crest.js";
import "../../src/logic/core/effects/index.js";

function setup(seed = 13): void {
  givenGameState({ seed, activePlayer: "first", roundCount: 5 })
    .withFirstPP(0, 10)
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

const AUTHORED = [
  "10503210",
  "10533310",
  "10543110",
  "10554110",
  "10554120",
  "10564120",
  "10574120",
  "10663210",
  "10664110",
  "10703210",
] as const;

describe("Unblock round 4 — general engine capabilities", () => {
  beforeEach(() => {
    resetUidCounter();
    setup();
  });

  it("marks all ten target cards as ops_present", () => {
    for (const id of AUTHORED) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!)).toBe("ops_present");
    }
  });

  it("summons from destroyed_match with Last Words + base_cost_lte + distinct names", () => {
    const a = createCard("10062210", "graveyard", "first"); // Winged Statue
    const b = createCard("10161210", "graveyard", "first"); // Serene Sanctuary
    for (const c of [a, b]) {
      c.hasLastWords = true;
      recordDestroyed(state, "first", c);
    }
    // Duplicate name must not yield a third distinct pick
    const dup = createCard("10062210", "graveyard", "first");
    dup.hasLastWords = true;
    recordDestroyed(state, "first", dup);

    whenRunEffects(
      [
        {
          op: "summon",
          source: "destroyed_match",
          count: 2,
          filter: {
            type: "Amulet",
            hasLastWords: true,
            base_cost_lte: 2,
          },
          distinct_by: "name",
          distribution: "random",
        } as any,
      ],
      "first",
    );

    const names = getBoard(state, "first")
      .filter((c) => c.type === "Amulet")
      .map((c) => c.name);
    expect(new Set(names).size).toBe(2);
  });

  it("draws filtered spells and respects distinct_by name", () => {
    const deck = getDeck(state, "first");
    deck.length = 0;
    const s1 = createCard("10012310", "deck", "first"); // Bug Alert
    const s2 = createCard("10031310", "deck", "first"); // Foresight
    const s1b = createCard("10012310", "deck", "first");
    const f = createCard("10001110", "deck", "first");
    deck.push(s1, s2, s1b, f);

    whenRunEffects(
      [
        {
          op: "draw",
          source: "deck",
          count: 2,
          filters: { type: "Spell", cost_eq: 1 },
          distinct_by: "name",
        } as any,
      ],
      "first",
    );

    const hand = getHand(state, "first").filter((c) => c.type === "Spell");
    expect(hand).toHaveLength(2);
    expect(new Set(hand.map((c) => c.name)).size).toBe(2);
  });

  it("transforms each ally with an independent deck RNG roll", () => {
    let sawDifference = false;
    for (let seed = 1; seed <= 50 && !sawDifference; seed++) {
      resetUidCounter();
      setup(seed);
      const deck = getDeck(state, "first");
      deck.length = 0;
      deck.push(
        createCard("10001110", "deck", "first"),
        createCard("10001120", "deck", "first"),
      );
      getBoard(state, "first").push(
        createCard("10001130", "board", "first"),
        createCard("10002110", "board", "first"),
      );

      whenRunEffects(
        [
          {
            op: "transform",
            target: "ally:follower",
            distribution: "all",
            into_source: {
              zone: "ally:deck",
              filter: { type: "Follower" },
              pick: "random",
              per_target: true,
            },
          } as any,
        ],
        "first",
      );

      const names = getBoard(state, "first")
        .filter((c) => c.type === "Follower")
        .map((c) => c.name);
      expect(names).toHaveLength(2);
      if (new Set(names).size > 1) sawDifference = true;
    }
    expect(sawDifference).toBe(true);
  });

  it("banishes odd-cost deck cards and stores count for split damage", () => {
    const deck = getDeck(state, "first");
    deck.length = 0;
    for (const cost of [1, 2, 3, 4, 5]) {
      const c = createCard("10001110", "deck", "first");
      c.cost = cost;
      c.name = `C${cost}`;
      deck.push(c);
    }
    const e1 = createCard("10001120", "board", "second");
    e1.defense = 10;
    e1.attack = 1;
    const e2 = createCard("10001130", "board", "second");
    e2.defense = 10;
    e2.attack = 1;
    getBoard(state, "second").push(e1, e2);

    whenRunEffects(
      [
        {
          op: "banish",
          target: "ally:deck",
          distribution: "all",
          filters: { cost_in: [1, 3, 5, 7, 9] },
          store_count_as: "banish_count",
        } as any,
        {
          op: "damage",
          target: "enemy:follower",
          distribution: "split_sequential",
          amount_source: "context.banish_count",
        } as any,
      ],
      "first",
    );

    expect(getBanish(state, "first")).toHaveLength(3);
    expect(deck.map((c) => Number(c.cost)).sort()).toEqual([2, 4]);
    const totalDef = getBoard(state, "second")
      .filter((c) => c.type === "Follower")
      .reduce((sum, c) => sum + (Number(c.defense) || 0), 0);
    expect(totalDef).toBe(17);
  });

  it("stores lastReturnedCount and draws that many via {last_returned}", () => {
    const hand = getHand(state, "first");
    hand.length = 0;
    for (let i = 0; i < 3; i++) {
      hand.push(createCard("10001110", "hand", "first"));
    }
    const deck = getDeck(state, "first");
    deck.length = 0;
    for (let i = 0; i < 5; i++) {
      deck.push(createCard("10001120", "deck", "first"));
    }

    whenRunEffects(
      [
        {
          op: "return",
          destination: "deck",
          select: "all",
        } as any,
        { op: "draw", source: "deck", count: "{last_returned}" } as any,
      ],
      "first",
    );

    expect((state as any).lastReturnedCount).toBe(3);
    expect(getHand(state, "first")).toHaveLength(3);
  });

  it("repeat_effect with fixed count expands the payload N times", () => {
    whenRunEffects(
      [
        {
          op: "repeat_effect",
          count: 2,
          effects: [{ op: "add_shadows", amount: 3 }],
        } as any,
      ],
      "first",
    );
    expect(getShadows(state, "first")).toBe(6);
  });

  it("sequence advances sticky ability index across calls", () => {
    const amulet = createCard("10703210", "board", "first");
    getBoard(state, "first").push(amulet);

    const enemy = createCard("10001110", "board", "second");
    enemy.defense = 5;
    enemy.attack = 1;
    getBoard(state, "second").push(enemy);

    state.players.first.hp = 10;

    const steps = [
      {
        effects: [
          {
            op: "damage",
            target: "enemy:follower",
            amount: 2,
            count: 1,
            distribution: "random_hits",
          },
        ],
      },
      {
        effects: [
          {
            op: "restore",
            target: "leader",
            player: "self",
            amount: 2,
          },
        ],
      },
      {
        effects: [
          { op: "damage", target: "enemy:leader", amount: 2 },
          { op: "destroy", scope: "self" },
        ],
      },
    ];

    whenRunEffects(
      [{ op: "sequence", key: "babelon", steps } as any],
      "first",
      amulet,
    );
    expect(amulet.counters?.babelon).toBe(1);
    expect(Number(enemy.defense)).toBe(3);

    whenRunEffects(
      [{ op: "sequence", key: "babelon", steps } as any],
      "first",
      amulet,
    );
    expect(amulet.counters?.babelon).toBe(2);
    expect(getHP(state, "first")).toBe(12);
  });

  it("crest passives suppress fanfare/enhance and expose helper", () => {
    whenRunEffects(
      [
        {
          op: "crest",
          action: "gain",
          name: "Test Suppress Crest",
          passives: ["suppress_fanfare_enhance"],
          triggers: [],
        } as any,
      ],
      "first",
    );
    expect(playerHasCrestPassive("first", "suppress_fanfare_enhance")).toBe(
      true,
    );
    expect(
      getCrests(state, "first").some((c) => c.name === "Test Suppress Crest"),
    ).toBe(true);
  });

  it("advances countdown when another field card shares the played card base cost", () => {
    resetUidCounter();
    givenGameState({ seed: 7, activePlayer: "first", roundCount: 5 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const games = createCard("10503210", "board", "first");
    games.hasCountdown = true;
    games.countdown = 5;
    getBoard(state, "first").push(games);

    const onField = createCard("10001110", "board", "first");
    onField.cost = 3;
    (onField as any).base_cost = 3;
    getBoard(state, "first").push(onField);

    const played = createCard("10001120", "hand", "first");
    played.cost = 3;
    (played as any).base_cost = 3;
    getHand(state, "first").push(played);

    whenPlayCard("first", 0);
    expect(Number(games.countdown)).toBe(4);
  });
});
