/**
 * Reactive trigger timing matrix — raising context × reactive event.
 * Each cell asserts: watcher fires exactly once, queue drained, history round-trips.
 * Observable: watcher card counters.earth via counter op (nothing else touches it).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "../audit/setup.js";
import { state } from "../../src/core/gameState.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import {
  createCard,
  givenGameState,
  resetUidCounter,
} from "../harness/builders.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import {
  buildMatrixCells,
  runMatrixCell,
  assertReactiveInvariants,
  skipReason,
  makeMatrixWatcher,
  watcherEarth,
  type RaisingContext,
  type ReactiveEvent,
} from "../harness/reactiveTimingMatrix.js";
import "../../src/logic/core/effects/index.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

/**
 * Engine gaps only — harness/setup bugs are fixed in reactiveTimingMatrix.ts.
 * Each entry: message, engine code path, and observed assertion.
 */
const KNOWN_FAILURES: Partial<
  Record<string, { msg: string; engine: string; assertion: string }>
> = {
  "C6_target_resume|ally_follower_enter": {
    msg: "undo/redo snapshot drift after target resume (enter)",
    engine:
      "captureSnapshot / history.ts — post-CHOOSE_TARGET resume tail does not round-trip",
    assertion: "undo/redo canonical snapshot mismatch",
  },
  "C6_target_resume|ally_follower_leaves_field": {
    msg: "undo/redo snapshot drift after target resume (leaves)",
    engine:
      "captureSnapshot / history.ts — post-CHOOSE_TARGET resume tail does not round-trip",
    assertion: "undo/redo canonical snapshot mismatch",
  },
  "C6_target_resume|ally_draw": {
    msg: "undo/redo snapshot drift after target resume (draw)",
    engine:
      "captureSnapshot / history.ts — post-CHOOSE_TARGET resume tail does not round-trip",
    assertion: "undo/redo canonical snapshot mismatch",
  },
  "C6_target_resume|leader_damaged": {
    msg: "undo/redo snapshot drift after target resume (leader_damaged counter)",
    engine:
      "captureSnapshot / history.ts — watcher counters.earth not restored on redo after CHOOSE_TARGET resume",
    assertion: "undo/redo canonical snapshot mismatch (counters.earth 1 vs 0)",
  },
  "C6_target_resume|leading_gate": {
    msg: "undo/redo drift with leading-gate watcher after resume",
    engine:
      "captureSnapshot / history.ts — gated watcher state does not round-trip after target resume",
    assertion: "undo/redo canonical snapshot mismatch",
  },
};

function cellKey(context: RaisingContext, event: ReactiveEvent): string {
  return `${context}|${event}`;
}

describe("Reactive trigger timing matrix", () => {
  const matrixCells = buildMatrixCells();

  it(`matrix has at least 80 cells (got ${matrixCells.length})`, () => {
    expect(matrixCells.length).toBeGreaterThanOrEqual(80);
  });

  describe.each(matrixCells)("$label", ({ context, event, label }) => {
    const fail = KNOWN_FAILURES[cellKey(context, event)];
    const skip = skipReason(context, event);

    const body = () => {
      const run = runMatrixCell({ context, event });
      assertReactiveInvariants(run.watcherUid, run.watcherOwner, {
        pendingPrompt: run.pendingPrompt,
        event,
        context,
      });
    };

    if (skip) {
      it.skip(`${label} — ${skip}`, body);
    } else if (fail) {
      it.fails(`${label}: ${fail.msg}`, body);
    } else {
      it(label, body);
    }
  });
});

describe("Reactive trigger timing matrix — leading gate at enqueue", () => {
  const gateContexts: RaisingContext[] = [
    "C1_fanfare",
    "C2_spell",
    "C3_engage",
    "C4_evolve",
    "C5_target_handler",
    "C6_target_resume",
    "C7_deferred_lw",
    "C9_strike",
    "C10_eot",
    "C11_sot",
    "C12_crest",
    "C13_mode",
    "C14_enhance",
  ];

  describe.each(gateContexts.map((c) => ({ context: c })))(
    "$context leading gate on ally_follower_enter",
    ({ context }) => {
      const fail = KNOWN_FAILURES[`${context}|leading_gate`];
      const body = () => {
        const reason = skipReason(context, "ally_follower_enter");
        if (reason) return;
        const run = runMatrixCell({
          context,
          event: "ally_follower_enter",
          leadingGate: true,
        });
        assertReactiveInvariants(run.watcherUid, run.watcherOwner, {
          pendingPrompt: run.pendingPrompt,
          leadingGate: true,
          event: "ally_follower_enter",
          context,
        });
      };
      if (fail) {
        it.fails(`gate true at enqueue fires watcher once: ${fail.msg}`, body);
      } else {
        it("gate true at enqueue fires watcher once", body);
      }
    },
  );
});

describe("Reactive trigger timing matrix — batch ordering (documentation)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 88, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("C10 EOT: enter watcher resolves after whole end-of-turn batch (rulebook L194)", () => {
    const watcher = makeMatrixWatcher("ally_follower_enter", "first");
    getBoard(state, "first").push(watcher);

    const leftSummoner = createCard(
      {
        name: "LeftEot",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [
              { op: "summon", source: "named", name: "Goblin", count: 1 },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    leftSummoner.insertionTs = 1;
    applyKeywordsFromList(leftSummoner);

    const boardReader = createCard(
      {
        name: "BoardReader",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        triggers: [
          {
            type: "end_of_turn_own",
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
    boardReader.insertionTs = 2;
    applyKeywordsFromList(boardReader);

    state.players.first.board = [leftSummoner, watcher, boardReader];

    engineDispatch(state, { type: "END_TURN" });

    expect(watcherEarth("first", watcher.uid)).toBe(1);
    expect(getBoard(state, "first").some((c) => c?.name === "Goblin")).toBe(
      true,
    );
    expect(Number(boardReader.attack)).toBe(9);
    expect(getResolutionQueue().length).toBe(0);
  });

  it.fails(
    "C8 combat LW: enter watcher drains after death-trigger batch before main phase resumes — ally_follower_enter not raised mid-combat LW batch",
    () => {
      const watcher = makeMatrixWatcher("ally_follower_enter", "first");
      getBoard(state, "first").push(watcher);

      const defender = createCard(
        { name: "Blocker", type: "Follower", cost: 2, attack: 3, defense: 3 },
        "board",
        "second",
      );
      defender.peak_defense = 3;
      applyKeywordsFromList(defender);

      const attacker = createCard(
        {
          name: "LwAttacker",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 1,
          justPlayed: false,
          can_attack: true,
          can_attack_followers: true,
          attacks_left: 1,
          keywords: [
            {
              name: "LastWords",
              effects: [
                { op: "summon", source: "named", name: "LwToken", count: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(attacker);
      attacker.peak_defense = 1;
      state.players.first.board.push(attacker);
      state.players.second.board.push(defender);

      engineDispatch(state, {
        type: "ATTACK",
        player: "first",
        attackerUid: attacker.uid,
        defender: { type: "card", uid: defender.uid },
      });

      expect(watcherEarth("first", watcher.uid)).toBe(1);
      expect(getResolutionQueue().length).toBe(0);
      expect((state as any)._drainingResolutionQueue).toBeFalsy();
      expect(state.pendingTargetEffect).toBeUndefined();
    },
  );
});

describe("Reactive trigger timing matrix — C15 nesting", () => {
  it("W1 on enter raises draw; W2 on draw — nested watcher fires once", () => {
    const run = runMatrixCell({
      context: "C15_nesting",
      event: "ally_draw",
    });
    const drawWatcher = getBoard(state, "first").find((c) =>
      c.name?.startsWith("Watcher:ally_draw"),
    );
    expect(drawWatcher).toBeDefined();
    assertReactiveInvariants(run.watcherUid, run.watcherOwner, {
      pendingPrompt: run.pendingPrompt,
      event: "ally_draw",
      context: "C15_nesting",
    });
  });
});

describe("Reactive trigger timing matrix — sabotage proof", () => {
  it("counter amount 2 would fail the exactly-once assertion", () => {
    resetUidCounter();
    givenGameState({ seed: 77, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const watcher = makeMatrixWatcher("ally_draw", "first");
    getBoard(state, "first").push(watcher);
    const raiser = createCard(
      {
        name: "DoubleTick",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
        fanfare: [
          { op: "draw", source: "deck", count: 1 },
          { op: "draw", source: "deck", count: 1 },
        ],
      },
      "hand",
      "first",
    );
    state.players.first.hand.push(raiser);
    state.players.first.deck.unshift(
      createCard({ name: "Pad1", type: "Spell", cost: 1 }, "deck", "first"),
    );
    state.players.first.deck.unshift(
      createCard({ name: "Pad2", type: "Spell", cost: 1 }, "deck", "first"),
    );

    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: raiser.uid,
    });

    expect(watcherEarth("first", watcher.uid)).toBe(2);
  });
});
