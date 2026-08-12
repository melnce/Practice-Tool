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
  getPP,
  getShadows,
  getCrests,
} from "../../src/core/playerHelpers.js";
import { drawCard } from "../../src/core/utils.js";
import { consumeEarthSigils } from "../../src/logic/effects/ops/earth.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { evaluateCondition } from "../../src/logic/effects/gates/conditions.js";
import {
  recordDestroyed,
  type DestroyedRecord,
} from "../../src/logic/core/destroyedHistory.js";
import { applyKeyword } from "../../src/logic/core/keywords/apply.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

function setup(seed = 13): void {
  givenGameState({ seed, activePlayer: "first", roundCount: 5 })
    .withFirstPP(0, 5)
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

const AUTHORED = [
  "10501110",
  "10521110",
  "10521310",
  "10522110",
  "10532310",
  "10541310",
  "10542310",
  "10544120",
  "10552310",
  "10553110",
  "10553310",
  "10561120",
  "10561310",
  "10562120",
  "10562210",
  "10563210",
  "10572310",
  "10573110",
  "10603110",
  "10603210",
  "10604110",
  "10622310",
  "10634110",
  "10641310",
  "10643310",
  "10654110",
  "10704110",
  "10731310",
  "10733310",
  "10741310",
  "10761210",
  "10762210",
  "10763210",
  "10803110",
  "10804110",
  "10811110",
  "10822310",
  "10823310",
  "10832320",
  "10851110",
  "10871130",
] as const;

describe("Unblock round 3 — general engine capabilities", () => {
  beforeEach(() => {
    resetUidCounter();
    setup();
  });

  it("resolves random mode picks deterministically from the game seed", () => {
    const effect = {
      op: "mode",
      pick: "random",
      select_count: 2,
      options: [1, 10, 100].map((amount) => ({
        label: String(amount),
        effects: [{ op: "add_shadows", amount }],
      })),
    } as any;

    runEffects([effect], "first", null);
    const firstResult = getShadows(state, "first");
    expect(state.pendingTargetEffect).toBeUndefined();

    setup();
    runEffects([effect], "first", null);
    expect(getShadows(state, "first")).toBe(firstResult);
    expect([11, 101, 110]).toContain(firstResult);
  });

  it("fires ally_draw on board listeners and when_drawn on the drawn hand card", () => {
    const listener = createCard(
      {
        name: "Draw Listener",
        triggers: [
          {
            event: "ally_draw",
            effects: [{ op: "add_shadows", amount: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    const drawn = createCard(
      {
        name: "Drawn Trigger",
        type: "Spell",
        cost: 5,
        triggers: [
          {
            event: "when_drawn",
            source: "hand",
            effects: [
              {
                op: "cost",
                mode: "reduce",
                target: "self",
                amount: 2,
              },
            ],
          },
        ],
      },
      "deck",
      "first",
    );
    getBoard(state, "first").push(listener);
    state.players.first.deck.push(drawn);

    expect(
      drawCard(state.players.first.hand, state.players.first.deck, "first"),
    ).toBe(true);

    expect(getShadows(state, "first")).toBe(1);
    expect(getHand(state, "first")[0]?.cost).toBe(3);
  });

  it("fires ally_earth_rite for cost reduction triggers in hand", () => {
    const sigil = createCard(
      {
        name: "Earth Sigil",
        type: "Amulet",
        counters: { earth: 2 },
      },
      "board",
      "first",
    );
    const listener = createCard(
      {
        name: "Earth Rite Listener",
        type: "Spell",
        cost: 4,
        triggers: [
          {
            event: "ally_earth_rite",
            source: "hand",
            effects: [
              {
                op: "cost",
                mode: "reduce",
                target: "self",
                amount: 1,
              },
            ],
          },
        ],
      },
      "hand",
      "first",
    );
    getBoard(state, "first").push(sigil);
    getHand(state, "first").push(listener);

    expect(consumeEarthSigils("first")).toBe(true);
    expect(listener.cost).toBe(3);
  });

  it("damages the leader with the lowest current defense", () => {
    state.players.first.hp = 10;
    state.players.second.hp = 15;

    runEffects(
      [
        {
          op: "damage",
          target: "all:leader",
          amount: 2,
          distribution: "by_stat",
          stat: "defense",
          rank: "lowest",
        },
      ],
      "first",
      null,
    );

    expect(getHP(state, "first")).toBe(8);
    expect(getHP(state, "second")).toBe(15);
  });

  it("uses seeded random choice among followers tied for highest attack", () => {
    const enemies = [5, 5, 3].map((attack, index) =>
      createCard(
        {
          name: `Enemy ${index}`,
          attack,
          defense: 5,
        },
        "board",
        "second",
      ),
    );
    getBoard(state, "second").push(...enemies);

    runEffects(
      [
        {
          op: "damage",
          target: "enemy:follower",
          amount: 1,
          distribution: "by_stat",
          stat: "attack",
          pick: "random",
        },
      ],
      "first",
      null,
    );
    expect(enemies.filter((card) => card.defense === 4)).toHaveLength(1);
    expect(enemies[2]?.defense).toBe(5);

    runEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "enemy:follower",
          attack: 1,
          defense: 0,
          distribution: "highest",
          stat: "attack",
          select: 1,
        },
      ],
      "first",
      null,
    );
    expect(enemies.filter((card) => card.attack === 6)).toHaveLength(1);
    expect(enemies[2]?.attack).toBe(3);
  });

  it("field_matches counts both boards and can exclude the source", () => {
    const source = createCard({ name: "Source" }, "board", "first");
    const enemy = createCard({ name: "Enemy" }, "board", "second");
    getBoard(state, "first").push(source);
    getBoard(state, "second").push(enemy);

    expect(
      evaluateCondition(
        {
          op: "gate",
          condition: "field_matches",
          type: "Card",
          count: 1,
          exclude_self: true,
        },
        "first",
        source,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        {
          op: "gate",
          condition: "field_matches",
          type: "Card",
          count: 2,
          exclude_self: true,
        },
        "first",
        source,
      ),
    ).toBe(false);
  });

  it("recovers PP from the number of other allied followers", () => {
    const source = createCard({ name: "Source" }, "board", "first");
    getBoard(state, "first").push(
      source,
      createCard({ name: "Ally 1" }, "board", "first"),
      createCard({ name: "Ally 2" }, "board", "first"),
      createCard({ name: "Amulet", type: "Amulet" }, "board", "first"),
    );

    runEffects(
      [
        {
          op: "pp",
          action: "recover",
          amount_source: "other_allies",
        },
      ],
      "first",
      source,
    );

    expect(getPP(state, "first")).toBe(2);
  });
});

describe("Unblock round 3 — destroyed history / ignores Ward", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("adds seeded random fresh cards matching destroyed history", () => {
    const run = (seed: number): string[] => {
      givenGameState({ seed, activePlayer: "first" }).build();
      state.gameStarted = true;
      state.phase = "main";

      const destroyed = [
        createCard("90071130", "graveyard", "first"),
        createCard("90071140", "graveyard", "first"),
        createCard("90071150", "graveyard", "first"),
        createCard("90071130", "graveyard", "first"),
      ];
      for (const card of destroyed) recordDestroyed(state, "first", card);

      const history = state.players.first.destroyedHistory;
      expect(history[0]).toMatchObject({
        id: "90071130",
        cardId: "90071130",
        baseCost: 1,
        tribes: ["Artifact"],
        hasLastWords: false,
      } satisfies Partial<DestroyedRecord>);

      whenRunEffects(
        [
          {
            op: "add_to_hand",
            source: "destroyed_match",
            count: 2,
            filter: {
              type: "Follower",
              tribe: "Artifact",
              base_cost_lte: 3,
            },
            distinct_by: "name",
            distribution: "random",
          },
        ],
        "first",
      );

      const hand = getHand(state, "first");
      expect(hand).toHaveLength(2);
      expect(new Set(hand.map((card) => card.name)).size).toBe(2);
      expect(
        hand.every((card) => !destroyed.some((old) => old.uid === card.uid)),
      ).toBe(true);
      return hand.map((card) => card.name);
    };

    expect(run(73)).toEqual(run(73));
  });

  it("ignores Ward when attacking a non-Ward follower", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstBoard([
        {
          name: "Wardbreaker",
          type: "Follower",
          cost: 2,
          attack: 3,
          defense: 3,
          can_attack: true,
          attacks_left: 1,
          justPlayed: false,
        },
      ])
      .withSecondBoard([
        {
          name: "Ward",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 5,
          hasWard: true,
        },
        {
          name: "Backliner",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 5,
        },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const attacker = getBoard(state, "first")[0]!;
    applyKeyword(attacker, "Ignores Ward");
    expect(attacker.ignoresWard).toBe(true);

    attackFollower(0, 1, "first", "second");

    expect(getBoard(state, "second")[0]?.name).toBe("Ward");
    expect(getBoard(state, "second")[1]?.defense).toBe(2);
    expect(attacker.attacks_left).toBe(0);
  });
});

describe("Unblock round 3 — authored cards", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("newly authored cards classify as ops_present", () => {
    for (const id of AUTHORED) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!), id).toBe("ops_present");
    }
  });

  it("Engage Haven amulets are Amulets with Engage", () => {
    for (const id of [
      "10562210",
      "10563210",
      "10761210",
      "10762210",
      "10763210",
    ]) {
      const card = getCardById(id)!;
      expect(card.type).toBe("Amulet");
      const kw = (card.keywords || []).some((k) =>
        (typeof k === "string" ? k : (k as any)?.name || "")
          .toLowerCase()
          .includes("engage"),
      );
      expect(kw, id).toBe(true);
    }
  });

  it("Rigor crest gains on play", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstPP(5, 5)
      .withFirstHand(["10553310"])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name.includes("Rigor")),
    ).toBe(true);
  });

  it("Anisage has Ignores Ward", () => {
    const card = getCardById("10851110")!;
    expect(JSON.stringify(card.keywords)).toMatch(/Ignores Ward/i);
  });
});
