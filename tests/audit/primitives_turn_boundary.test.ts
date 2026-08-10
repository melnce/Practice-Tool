/**
 * C1 — Two-phase turn boundary queue → resolve (rulebook §188–213).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

describe("C1 — Grimnir EOT: LW deferred until step batch resolves (§217)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstDeck([{ name: "CastleDraw", type: "Spell", cost: 0 }])
      .build();
    state.players.second.deck = [
      createCard(
        { name: "CastleDraw", type: "Spell", cost: 0 },
        "deck",
        "second",
      ),
    ];

    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Grimnir, Heavenly Gale",
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "gate",
                condition: "super_evolved_allied",
                effects: [
                  {
                    op: "damage",
                    target: "enemy:follower",
                    amount: 2,
                    distribution: "all",
                  },
                ],
              },
            ],
          },
        ],
      } as any,
      "first",
    );

    const celes = createCard(
      {
        name: "Celes",
        type: "Follower",
        cost: 5,
        attack: 4,
        defense: 4,
        evoType: "super",
        hasEvolved: true,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "keyword",
                action: "grant",
                target: "self",
                keywords: ["Barrier"],
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    (celes as any).insertionTs = 2;

    const funikar = createCard(
      {
        name: "Funikar & Yavnhar",
        type: "Follower",
        cost: 3,
        attack: 2,
        defense: 2,
        hasEvolved: true,
        hasLastWords: true,
        keywordState: {
          lastWordsEffects: [
            {
              op: "damage",
              target: "enemy:follower",
              amount: 2,
              distribution: "all",
            },
          ],
        },
        lastWordsEffects: [
          {
            op: "damage",
            target: "enemy:follower",
            amount: 2,
            distribution: "all",
          },
        ],
      },
      "board",
      "second",
    );
    (funikar as any).insertionTs = 1;

    const castle = createCard(
      {
        name: "Castle Artifact",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        hasLastWords: true,
        keywordState: {
          lastWordsEffects: [{ op: "draw", source: "deck", count: 1 }],
        },
        lastWordsEffects: [{ op: "draw", source: "deck", count: 1 }],
        triggers: [
          {
            event: "end_of_turn",
            source: "board",
            condition: { whose_turn: "opponent" },
            effects: [{ op: "destroy", scope: "self" }],
          },
        ],
      },
      "board",
      "second",
    );
    (castle as any).insertionTs = 2;

    state.players.first.board = [celes];
    state.players.second.board = [funikar, castle];
  });

  it("Grimnir → Celes Barrier → Castle LW: Funikar LW pops Barrier, Celes survives", () => {
    const celes = getBoard(state, "first").find((c) => c.name === "Celes")!;
    const defBefore = Number(celes.defense);
    const handBefore = thenHand("second").length;

    whenEndTurn();

    const celesAfter = getBoard(state, "first").find(
      (c) => c.name === "Celes",
    )!;
    expect(
      getBoard(state, "second").find((c) => c.name === "Funikar & Yavnhar"),
    ).toBeUndefined();
    expect(
      celesAfter.keywordState?.hasBarrier || (celesAfter as any).hasBarrier,
    ).toBeFalsy();
    expect(Number(celesAfter.defense)).toBe(defBefore);
    expect(thenHand("second").length).toBe(handBefore + 1);
  });
});

describe("C1 — condition snapshot at queue time (§221)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "SnapDraw", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
  });

  it("enemy_follower_count_gte checked at queue: 1 enemy does not queue draw", () => {
    state.players.first.crests = [
      {
        name: "SnapshotObserver",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            condition: { enemy_follower_count_gte: 2 },
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
    ] as any;
    state.players.second.board = [
      createCard(
        { name: "Lone", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      ),
    ];

    const handBefore = thenHand("first").length;
    whenEndTurn();
    expect(thenHand("first").length).toBe(handBefore);
  });

  it("queued when count met at queue still resolves after Grimnir kills enemies", () => {
    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Grimnir (test)",
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              {
                op: "damage",
                target: "enemy:follower",
                amount: 5,
                distribution: "all",
              },
            ],
          },
        ],
      } as any,
      "first",
    );
    state.players.first.crests.push({
      name: "SnapshotObserver",
      owner: "first",
      insertionTs: 2,
      triggers: [
        {
          type: "end_of_turn_own",
          condition: { enemy_follower_count_gte: 2 },
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    } as any);
    state.players.second.board = [
      createCard(
        { name: "E1", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      ),
      createCard(
        { name: "E2", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      ),
    ];

    const handBefore = thenHand("first").length;
    whenEndTurn();
    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(getBoard(state, "second").length).toBe(0);
  });
});

describe("C1 — bare end_of_turn fires on both players' turn ends (§213)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstDeck([
        { name: "BareDraw1", type: "Follower", attack: 1, defense: 1 },
        { name: "BareDraw2", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
  });

  it("bare end_of_turn observer draws once per turn end (both turns)", () => {
    const watcher = createCard(
      {
        name: "BareWatcher",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "end_of_turn",
            source: "board",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    state.players.first.board = [watcher];

    const handBefore = thenHand("first").length;
    whenEndTurn(); // first ends
    expect(thenHand("first").length).toBe(handBefore + 1);

    whenEndTurn(); // second ends — bare fires again for first's watcher
    expect(thenHand("first").length).toBe(handBefore + 2);
  });
});
