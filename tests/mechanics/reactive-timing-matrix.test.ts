/**
 * Reactive trigger timing matrix — raising context × reactive event.
 * Each cell asserts: watcher fires exactly once, queue drained, history round-trips.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "../audit/setup.js";
import { state } from "../../src/core/gameState.js";
import { getShadows, getBoard } from "../../src/core/playerHelpers.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import {
  createCard,
  givenGameState,
  resetUidCounter,
} from "../harness/builders.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import {
  ALL_CONTEXTS,
  CORE_EVENTS,
  REACTIVE_EVENTS,
  buildMatrixCells,
  runMatrixCell,
  assertReactiveInvariants,
  skipReason,
  makeShadowWatcher,
  type RaisingContext,
  type ReactiveEvent,
} from "../harness/reactiveTimingMatrix.js";
import "../../src/logic/core/effects/index.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

/** Observed failures — reviewer turns each into a fix brief. */
const KNOWN_FAILURES: Partial<Record<string, string>> = {
  "C4_super_evolve|ally_follower_enter":
    "super-evolve body effects do not run in matrix setup",
  "C4_super_evolve|ally_follower_leaves_field":
    "super-evolve body effects do not run",
  "C4_super_evolve|ally_draw": "super-evolve body effects do not run",
  "C4_super_evolve|leader_damaged": "super-evolve body effects do not run",
  "C5_target_handler|ally_follower_enter":
    "undo/redo snapshot drift after CHOOSE_TARGET handler drain",
  "C5_target_handler|ally_follower_leaves_field":
    "undo/redo snapshot drift after CHOOSE_TARGET handler drain",
  "C5_target_handler|ally_draw":
    "undo/redo snapshot drift after CHOOSE_TARGET handler drain",
  "C5_target_handler|leader_damaged":
    "undo/redo snapshot drift after CHOOSE_TARGET handler drain",
  "C6_target_resume|ally_follower_enter":
    "queued enter fires twice (fanfare summon + played follower enter)",
  "C6_target_resume|ally_follower_leaves_field":
    "shadow delta mismatch in resume tail",
  "C6_target_resume|ally_draw": "watcher not fired once after resume tail",
  "C6_target_resume|leader_damaged":
    "undo/redo snapshot drift after target resume",
  "C7_deferred_lw|leader_damaged": "watcher not fired inside deferred LW batch",
  "C7_deferred_lw|enemy_follower_enter":
    "enemy enter from LW not observed by watcher",
  "C7_deferred_lw|enemy_follower_leaves_field":
    "enemy leaves from LW body not observed",
  "C7_deferred_lw|ally_ward_destroyed":
    "shadow delta mismatch in deferred LW batch",
  "C7_deferred_lw|when_drawn": "when_drawn not raised from LW body",
  "C7_deferred_lw|ally_amulet_destroyed":
    "shadow delta mismatch in deferred LW batch",
  "C7_deferred_lw|self_damaged": "self_damaged watcher not fired from LW body",
  "C8_combat_lw|ally_follower_enter":
    "resolution queue not empty after combat LW (1 item)",
  "C9_strike|ally_follower_enter": "queued enter not drained after strike body",
  "C9_strike|ally_follower_leaves_field":
    "shadow delta mismatch when blocker dies in strike",
  "C9_strike|ally_draw": "queued draw not drained after strike body",
  "C9_strike|leader_damaged": "watcher not fired from strike body",
  "C11_sot|ally_follower_enter":
    "start_of_turn raiser on second not firing at END_TURN handoff",
  "C11_sot|ally_follower_leaves_field":
    "start_of_turn raiser on second not firing",
  "C11_sot|ally_draw": "start_of_turn raiser on second not firing",
  "C12_crest|ally_draw": "watcher not isolated from spell+draw shadows",
  "C12_crest|leader_damaged":
    "crest trigger body damage not raising leader_damaged watcher",
  "C1_fanfare|enemy_follower_enter": "enemy enter watcher on second not fired",
  "C1_fanfare|enemy_follower_leaves_field":
    "watcher not fired once for enemy leaves",
  "C1_fanfare|when_drawn":
    "when_drawn watcher in hand not triggered by fanfare draw",
  "C2_spell|leader_damaged": "watcher not fired from spell body",
  "C15_nesting|ally_draw": "nested draw watcher shadow delta mismatch",
  "C5_target_handler|leading_gate":
    "undo/redo drift with leading-gate watcher after CHOOSE_TARGET",
  "C6_target_resume|leading_gate":
    "undo/redo drift with leading-gate watcher after resume",
  "C9_strike|leading_gate":
    "queued enter not drained after strike with leading-gate watcher",
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
    const failMsg = KNOWN_FAILURES[cellKey(context, event)];
    const skip = skipReason(context, event);

    const body = () => {
      const run = runMatrixCell({ context, event });
      assertReactiveInvariants(run.watcherOwner, run.shadowsBefore, {
        pendingPrompt: run.pendingPrompt,
        event,
        context,
      });
    };

    if (skip) {
      it.skip(`${label} — ${skip}`, body);
    } else if (failMsg) {
      it.fails(`${label}: ${failMsg}`, body);
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
      const failMsg = KNOWN_FAILURES[`${context}|leading_gate`];
      const body = () => {
        const reason = skipReason(context, "ally_follower_enter");
        if (reason) return;
        const run = runMatrixCell({
          context,
          event: "ally_follower_enter",
          leadingGate: true,
        });
        assertReactiveInvariants(run.watcherOwner, run.shadowsBefore, {
          pendingPrompt: run.pendingPrompt,
          leadingGate: true,
          event: "ally_follower_enter",
          context,
        });
      };
      if (failMsg) {
        it.fails(`gate true at enqueue fires watcher once: ${failMsg}`, body);
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
    const watcher = makeShadowWatcher("ally_follower_enter", "first");
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

    expect(getShadows(state, "first")).toBe(1);
    expect(getBoard(state, "first").some((c) => c?.name === "Goblin")).toBe(
      true,
    );
    expect(Number(boardReader.attack)).toBe(9);
    expect(getResolutionQueue().length).toBe(0);
  });

  it("C8 combat LW: enter watcher drains after death-trigger batch before main phase resumes", () => {
    const watcher = makeShadowWatcher("ally_follower_enter", "first");
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

    const shadowsBefore = getShadows(state, "first");
    engineDispatch(state, {
      type: "ATTACK",
      player: "first",
      attackerUid: attacker.uid,
      defender: { type: "card", uid: defender.uid },
    });

    expect(getShadows(state, "first")).toBe(shadowsBefore + 1);
    expect(getResolutionQueue().length).toBe(0);
    expect((state as any)._drainingResolutionQueue).toBeFalsy();
    expect(state.pendingTargetEffect).toBeUndefined();
  });
});

describe("Reactive trigger timing matrix — C15 nesting", () => {
  it.fails(
    "W1 on enter raises draw; W2 on draw — nested watcher shadow delta mismatch",
    () => {
      const run = runMatrixCell({
        context: "C15_nesting",
        event: "ally_draw",
      });
      const drawWatcher = getBoard(state, "first").find((c) =>
        c.name?.startsWith("Watcher:ally_draw"),
      );
      expect(drawWatcher).toBeDefined();
      assertReactiveInvariants("first", run.shadowsBefore, {
        pendingPrompt: run.pendingPrompt,
        event: "ally_draw",
        context: "C15_nesting",
      });
    },
  );
});
