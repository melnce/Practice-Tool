/**
 * Reactive trigger queue — rulebook L194/L209 (Stage A/B).
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
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import {
  getBoard,
  getCrests,
  getGraveyard,
  getHand,
  getHP,
  setHP,
} from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { whenPlayCard } from "../harness/builders.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  doAction,
  undo,
  redo,
  canUndo,
  canRedo,
  isHistoryEnabled,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { allocateInsertionTs } from "../../src/logic/core/triggers/utils.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { replaySoakTrace } from "../../src/bench/soakEnv.js";
import "../../src/logic/core/effects/index.js";

const SOAK_FIXTURE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/soak",
);

function loadSoakFixture(name: string) {
  return JSON.parse(
    readFileSync(resolve(SOAK_FIXTURE_DIR, name), "utf8"),
  ) as { seed: number; gameIndex: number; trace: unknown[] };
}

const NETHERWORLD_LT = "10951120";
const KRULLE = "10314110";
const OTS = "Obsessed Test Subject";
const SEPHIE_ID = "10934110";

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
    // Krulle SE gives crest to opponent; LT on crest owner's board so ally_follower_enter fires.
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstDeck([
        { name: "Filler", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .withSecondDeck([
        { name: "Filler", type: "Follower", cost: 1, attack: 1, defense: 1 },
      ])
      .build();
    addKrulleEnterCrest("second");

    const lt = createCard(NETHERWORLD_LT, "board", "second");
    applyKeywordsFromList(lt);
    lt.uid = "lt_original";
    state.players.second.board = [lt];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "enemy:follower",
          filter: { name: "Netherworld Lieutenant" },
        },
      ],
      "first",
    );

    expect(countLieutenantsOn("second")).toBe(0);
    const graveLts = getGraveyard(state, "second").filter(
      (c) => c.name === "Netherworld Lieutenant",
    );
    expect(graveLts.length).toBe(2);
  });

  it.fails(
    "soak seed 20260913 game 123 — Reaper's Due exact-copy encoding loops until printed-copy PR",
    async () => {
      const fixture = loadSoakFixture(
        "seed20260913_game123_reapers_due_loop.json",
      );
      const result = await replaySoakTrace(
        fixture.seed,
        fixture.gameIndex,
        fixture.trace as any,
      );
      expect(result.error).toBeUndefined();
    },
  );

  it("Sephie Fanfare at 4 prior OTS — first summoned 2/2, second 5/5", () => {
    givenGameState({ seed: 48, activePlayer: "first", roundCount: 8 })
      .withFirstPP(20, 20)
      .build();

    const isBuffed = (c: { attack: unknown; defense: unknown }) =>
      Number(c.attack) === 5 && Number(c.defense) === 5;

    for (let i = 0; i < 4; i++) {
      summonNamed(
        { op: "summon", source: "named", name: OTS, count: 1 },
        "first",
      );
      state.players.first.board = [];
    }

    state.players.first.hand.push(createCard(SEPHIE_ID, "hand", "first"));
    whenPlayCard("first", getHand(state, "first").length - 1);

    const summoned = getBoard(state, "first").filter((c) => c?.name === OTS);
    expect(summoned.length).toBe(2);
    expect(isBuffed(summoned[0]!)).toBe(false);
    expect(isBuffed(summoned[1]!)).toBe(true);
  });

  it("leading gate true at enqueue, false at drain — reactive trigger still fires", () => {
    givenGameState({ seed: 49, activePlayer: "first" }).build();
    setHP(state, "first", 12);

    const observer = createCard(
      {
        name: "Gate Watcher",
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
                op: "gate",
                condition: "leader_defense_lte",
                count: 15,
                effects: [
                  { op: "stat", action: "set", target: "self", attack: 9 },
                ],
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    state.players.first.board = [observer];

    whenRunEffects(
      [
        { op: "summon", source: "named", name: "Goblin", count: 1 },
        { op: "restore", target: "leader", amount: 10 },
      ],
      "first",
    );

    expect(Number(observer.attack)).toBe(9);
    expect(getHP(state, "first")).toBeGreaterThan(15);
  });

  it("leading gate false at enqueue, true at drain — reactive trigger does not fire", () => {
    givenGameState({ seed: 50, activePlayer: "first" }).build();
    setHP(state, "first", 20);

    const observer = createCard(
      {
        name: "Gate Watcher",
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
                op: "gate",
                condition: "leader_defense_lte",
                count: 15,
                effects: [
                  { op: "stat", action: "set", target: "self", attack: 9 },
                ],
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    state.players.first.board = [observer];

    whenRunEffects(
      [
        { op: "summon", source: "named", name: "Goblin", count: 1 },
        { op: "damage", target: "leader", amount: 10 },
      ],
      "first",
    );

    expect(Number(observer.attack)).toBe(1);
    expect(getHP(state, "first")).toBeLessThanOrEqual(15);
  });

  it("summon +1/+0 before enter -1/-1: 1/1 Goblin survives at 1/1", () => {
    givenGameState({ seed: 43, activePlayer: "first" }).build();
    addKrulleEnterCrest("second");

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
      "second",
    );

    const goblin = getBoard(state, "second").find((c) => c?.name === "Goblin")!;
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

    expect(Number(observer.attack)).toBe(9);
    const goblins = getBoard(state, "first").filter(
      (c) => c?.name === "Goblin",
    );
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

  it("undo across queued-trigger pause resolves against live board instances after redo", () => {
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
      buffTarget.uid = "buff_tgt";
      const victimUid = lwVictim.uid;
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
      const liveVictim = getBoard(state, "first").find(
        (c) => c?.uid === victimUid,
      );
      expect(liveVictim).toBeTruthy();
      expect(getBoard(state, "first").includes(liveVictim!)).toBe(true);

      redo({ autoRender: false });
      expect(state.pendingTargetEffect).toBeDefined();

      const liveBuff = getBoard(state, "first").find(
        (c) => c?.uid === buffTarget.uid,
      );
      expect(liveBuff).toBeTruthy();
      expect(getBoard(state, "first").includes(liveBuff!)).toBe(true);

      const atkBefore = Number(liveBuff!.attack);
      resolvePendingTarget(liveBuff!.uid);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(Number(liveBuff!.attack)).toBeGreaterThan(atkBefore);
      expect(getBoard(state, "first").some((c) => c?.uid === victimUid)).toBe(
        false,
      );
      expect(canRedo()).toBe(false);
    } finally {
      setHistoryEnabled(prevHistory);
    }
  });
});
