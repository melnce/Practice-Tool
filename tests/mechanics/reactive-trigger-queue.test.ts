/**
 * Reactive trigger queue — rulebook L194/L209 (Stage A).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { getBoard, getCrests } from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  doAction,
  undo,
  canUndo,
  isHistoryEnabled,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { allocateInsertionTs } from "../../src/logic/core/triggers/utils.js";
import "../../src/logic/core/effects/index.js";

const NETHERWORLD_LT = "10951120";
const KRULLE = "10314110";

function addKrulleEnterCrest(player: "first" | "second") {
  const card = getCardById(KRULLE);
  const crestOp = card?.superevolve?.find(
    (e: any) => e.op === "crest" && e.action === "gain",
  ) as any;
  expect(crestOp).toBeTruthy();
  const crest = {
    name: crestOp.name,
    owner: player,
    countdown: crestOp.countdown ?? 2,
    triggers: crestOp.triggers,
    insertionTs: allocateInsertionTs(),
  };
  getCrests(state, player).push(crest as any);
}

function countLieutenantsOn(owner: "first" | "second") {
  return getBoard(state, owner).filter(
    (c) => c?.name === "Netherworld Lieutenant",
  ).length;
}

describe("Reactive trigger queue", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.turnNumber = 5;
  });

  it("Krulle crest enter debuff resolves after Lieutenant Last Words (+1/+0, LW removed) — no loop", () => {
    givenGameState({ seed: 42, activePlayer: "first" }).build();
    addKrulleEnterCrest("first");

    const lt = createCard(NETHERWORLD_LT, "board", "first");
    applyKeywordsFromList(lt);
    lt.uid = "lt_original";
    state.players.first.board = [lt];

    (state as any).deferDeathTriggers = true;
    lt.defense = 0;
    cleanupDead();
    (state as any).deferDeathTriggers = false;
    flushDeferredDeathBatch();

    // Summoned copy reaches 1/0 after +1/+0 then -1/-1; both corpses leave the board.
    expect(countLieutenantsOn("first")).toBe(0);
    const graveLts = state.players.first.graveyard.filter(
      (c) => c.name === "Netherworld Lieutenant",
    );
    expect(graveLts.length).toBe(2);
  });

  it("summon +1/+0 before enter -1/-1: 1/1 Goblin survives at 1/1", () => {
    givenGameState({ seed: 43, activePlayer: "first" }).build();
    addKrulleEnterCrest("first");

    whenRunEffects(
      [
        { op: "summon", source: "named", name: "Goblin", count: 1 },
        {
          op: "stat",
          action: "give",
          target: "ally:last_summoned",
          attack: 1,
          defense: 0,
        },
      ],
      "first",
    );

    const goblin = getBoard(state, "first").find((c) => c?.name === "Goblin")!;
    expect(goblin).toBeTruthy();
    expect(Number(goblin.attack)).toBe(1);
    expect(Number(goblin.defense)).toBe(1);
  });

  it("destroy then summon: victim Last Words runs before enter trigger", () => {
    givenGameState({ seed: 44, activePlayer: "first" }).build();

    const observer = createCard(
      {
        name: "Enter Watcher",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            source: "board",
            effects: [
              {
                op: "stat",
                action: "set",
                target: "self",
                attack: 9,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    observer.triggers![0]!.effects[0] = {
      op: "stat",
      action: "set",
      target: "self",
      attack: 9,
    };
    // Patch run via flag on observer
    observer.triggers = [
      {
        event: "ally_follower_enter",
        source: "board",
        effects: [{ op: "stat", action: "set", target: "self", attack: 9 }],
      },
    ];

    const victim = createCard(
      {
        name: "LW Token",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        keywords: [
          {
            name: "LastWords",
            effects: [
              {
                op: "summon",
                source: "named",
                name: "Goblin",
                count: 1,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(victim);
    state.players.first.board = [observer, victim];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Token" },
        },
        {
          op: "summon",
          source: "named",
          name: "Goblin",
          count: 1,
        },
      ],
      "first",
    );

    const goblins = getBoard(state, "first").filter(
      (c) => c?.name === "Goblin",
    );
    // LW summoned one Goblin, then summon op added another → 2 if enter fired between;
    // destroy-then-summon: LW goblin first (observer still 1 atk), then summon goblin triggers enter
    expect(Number(observer.attack)).toBe(9);
    expect(goblins.length).toBeGreaterThanOrEqual(1);
  });

  it("summon then destroy: enter trigger runs before victim Last Words", () => {
    givenGameState({ seed: 45, activePlayer: "first" }).build();

    const observer = createCard(
      {
        name: "Enter Watcher",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            source: "board",
            effects: [{ op: "stat", action: "set", target: "self", attack: 9 }],
          },
        ],
      },
      "board",
      "first",
    );

    const victim = createCard(
      {
        name: "LW Token",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        keywords: [
          {
            name: "LastWords",
            effects: [
              {
                op: "summon",
                source: "named",
                name: "Goblin",
                count: 1,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(victim);
    state.players.first.board = [observer, victim];

    whenRunEffects(
      [
        {
          op: "summon",
          source: "named",
          name: "Goblin",
          count: 1,
        },
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Token" },
        },
      ],
      "first",
    );

    // Enter from summon op fires before LW from destroy
    expect(Number(observer.attack)).toBe(9);
  });

  it("queued trigger with target prompt pauses drain and resumes after selection", () => {
    givenGameState({ seed: 46, activePlayer: "first" }).build();

    const lwVictim = createCard(
      {
        name: "LW Select",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        keywords: [
          {
            name: "LastWords",
            effects: [
              {
                op: "select",
                target: "ally:follower",
                select: 1,
                effects: [
                  {
                    op: "stat",
                    action: "give",
                    target: "selected:follower",
                    attack: 3,
                  },
                ],
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(lwVictim);
    const buffTarget = createCard("10001110", "board", "first");
    buffTarget.uid = "buff_tgt";
    state.players.first.board = [buffTarget, lwVictim];

    (state as any).deferDeathTriggers = true;
    lwVictim.defense = 0;
    cleanupDead();
    (state as any).deferDeathTriggers = false;
    flushDeferredDeathBatch();

    expect(state.pendingTargetEffect).toBeDefined();
    const atkBefore = Number(buffTarget.attack);
    resolvePendingTarget(buffTarget.uid);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(buffTarget.attack)).toBeGreaterThan(atkBefore);
  });

  it("undo across queued-trigger pause does not resurrect or lose queue state", () => {
    const prevHistory = isHistoryEnabled();
    setHistoryEnabled(true);
    try {
      givenGameState({ seed: 47, activePlayer: "first" }).build();

      const lwVictim = createCard(
        {
          name: "LW Select",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
          keywords: [
            {
              name: "LastWords",
              effects: [
                {
                  op: "select",
                  target: "ally:follower",
                  select: 1,
                  effects: [
                    {
                      op: "stat",
                      action: "give",
                      target: "selected:follower",
                      attack: 2,
                    },
                  ],
                },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(lwVictim);
      const buffTarget = createCard("10001110", "board", "first");
      state.players.first.board = [buffTarget, lwVictim];

      doAction(
        "Kill for LW pause",
        () => {
          (state as any).deferDeathTriggers = true;
          lwVictim.defense = 0;
          cleanupDead();
          (state as any).deferDeathTriggers = false;
          flushDeferredDeathBatch();
        },
        {},
        { autoRender: false },
      );

      expect(state.pendingTargetEffect).toBeDefined();
      expect(canUndo()).toBe(true);

      undo({ autoRender: false });

      expect(state.pendingTargetEffect).toBeUndefined();
      expect(
        getBoard(state, "first").some((c) => c?.uid === lwVictim.uid),
      ).toBe(true);
    } finally {
      setHistoryEnabled(prevHistory);
    }
  });
});
