/**
 * Reactive trigger timing matrix v2 — enemy-side, hand, turn ownership,
 * nesting, zone-change pins, remaining events.
 */
import { describe, it, expect, vi } from "vitest";
import "../audit/setup.js";
import { state } from "../../src/core/gameState.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import {
  getResolutionQueue,
  MAX_RESOLUTION_QUEUE_LENGTH,
} from "../../src/logic/core/triggers/queue.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import {
  createCard,
  givenGameState,
  resetUidCounter,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { changeFollowerControl } from "../../src/logic/effects/ops/changeControl.js";
import { transformTarget } from "../../src/logic/effects/ops/transform.js";

import {
  buildV2EnemyEnterCells,
  buildV2EnemyLeaveCells,
  buildV2EnemyDefenseCells,
  buildV2HandCells,
  buildV2TurnCells,
  buildV2RemainingCells,
  buildV2NestingCells,
  runV2MatrixCell,
  runV2NestingCell,
  assertV2ReactiveInvariants,
  expectedTurnOwnershipFire,
  v2HandSkipReason,
  v2EnemyEnterSkipReason,
  v2EnemyLeaveSkipReason,
  v2RemainingSkipReason,
  HAND_EVENTS_WITH_CARD_POOL_SOURCE,
  watcherEarth,
  enemyWatcherOwner,
  type V2HandEvent,
  type V2RemainingEvent,
  type RaisingContext,
} from "../harness/reactiveTimingMatrix.js";
import "../../src/logic/core/effects/index.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

const KNOWN_FAILURES: Partial<
  Record<string, { msg: string; engine: string; assertion: string }>
> = {};

function cellKey(parts: string[]): string {
  return parts.join("|");
}

describe("Reactive trigger timing matrix v2", () => {
  const enemyEnterCells = buildV2EnemyEnterCells();
  const enemyLeaveCells = buildV2EnemyLeaveCells();
  const enemyDefenseCells = buildV2EnemyDefenseCells();
  const handCells = buildV2HandCells();
  const turnCells = buildV2TurnCells();
  const remainingCells = buildV2RemainingCells();
  const nestingCells = buildV2NestingCells();

  const totalNewCells =
    enemyEnterCells.length +
    enemyLeaveCells.length +
    enemyDefenseCells.length +
    1 +
    handCells.length +
    turnCells.length +
    remainingCells.length +
    nestingCells.length +
    3; // zone pins + termination (self-destruct, krulle)

  it(`v2 matrix has at least 120 new cells (got ${totalNewCells} scheduled)`, () => {
    expect(totalNewCells).toBeGreaterThanOrEqual(120);
  });

  describe("Axis A — enemy-side listeners (enter)", () => {
    describe.each(enemyEnterCells)("$label", ({ context, label }) => {
      const skip = v2EnemyEnterSkipReason(context);
      const fail = KNOWN_FAILURES[cellKey(["enemy_enter", context])];
      const body = () => {
        const run = runV2MatrixCell({
          context,
          event: "enemy_follower_enter",
          axis: "enemy_enter",
        });
        assertV2ReactiveInvariants(run, {
          event: "enemy_follower_enter",
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

  describe("Axis A — enemy_follower_leaves_field", () => {
    describe.each(enemyLeaveCells)(
      "$label",
      ({ context, leaveMode, label }) => {
        const skip = v2EnemyLeaveSkipReason(leaveMode);
        const fail =
          KNOWN_FAILURES[cellKey(["enemy_leave", context, leaveMode])];
        const body = () => {
          const run = runV2MatrixCell({
            context,
            event: "enemy_follower_leaves_field",
            axis: "enemy_leave",
            leaveMode,
          });
          assertV2ReactiveInvariants(run, {
            event: "enemy_follower_leaves_field",
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
      },
    );
  });

  describe("Axis A — enemy_super_evolve (hand watcher)", () => {
    it("C4_super_evolve × enemy_super_evolve fires once from opponent hand", () => {
      const run = runV2MatrixCell({
        context: "C4_super_evolve",
        event: "enemy_super_evolve",
        axis: "enemy_super",
      });
      assertV2ReactiveInvariants(run, {
        event: "enemy_super_evolve",
        context: "C4_super_evolve",
      });
    });
  });

  describe("Axis A — enemy_follower_defense_down", () => {
    describe.each(enemyDefenseCells)("$label", ({ context, label }) => {
      const body = () => {
        const run = runV2MatrixCell({
          context,
          event: "enemy_follower_defense_down",
          axis: "enemy_defense",
        });
        assertV2ReactiveInvariants(run, {
          event: "enemy_follower_defense_down",
          context,
        });
      };
      it(label, body);
    });
  });

  describe("Axis B — hand listeners", () => {
    describe.each(handCells)("$label", ({ context, event, label }) => {
      const skip = v2HandSkipReason(event, context);
      const fail = KNOWN_FAILURES[cellKey(["hand", context, event])];
      const body = () => {
        const run = runV2MatrixCell({
          context,
          event,
          axis: "hand",
        });
        assertV2ReactiveInvariants(run, { event, context });
      };
      if (skip) {
        it.skip(`${label} — ${skip}`, body);
      } else if (fail) {
        it.fails(
          `${label}: ${fail.msg} (${HAND_EVENTS_WITH_CARD_POOL_SOURCE[event]?.join(", ") ?? "pool"})`,
          body,
        );
      } else {
        it(label, body);
      }
    });
  });

  describe("Axis C — turn ownership", () => {
    describe.each(turnCells)(
      "$label",
      ({ context, event, whoseTurn, onOwnerTurn, label }) => {
        const expectFired = expectedTurnOwnershipFire(
          context,
          event,
          whoseTurn,
          onOwnerTurn,
        );
        const body = () => {
          const run = runV2MatrixCell({
            context,
            event,
            axis: "turn",
            whoseTurn,
            onOwnerTurn,
            expectFired,
          });
          assertV2ReactiveInvariants(run, { event, context });
        };
        it(`${label} → ${expectFired ? "fires" : "silent"}`, body);
      },
    );
  });

  describe("Axis D — nesting and termination", () => {
    describe.each(nestingCells)("$label", ({ context, depth, label }) => {
      it(label, () => {
        const run = runV2NestingCell({ context, depth });
        assertV2ReactiveInvariants(run, { context });
      });
    });

    it("self-destruct watcher fires once and leaves no null board slot", () => {
      resetUidCounter();
      givenGameState({ seed: 91, activePlayer: "first", roundCount: 6 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const watcher = createCard(
        {
          name: "SelfDestructWatcher",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_draw",
              source: "board",
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
                { op: "destroy", target: "self" },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(watcher);
      getBoard(state, "first").push(watcher);
      state.players.first.deck.unshift(
        createCard(
          { name: "DrawPad", type: "Spell", cost: 1 },
          "deck",
          "first",
        ),
      );

      const raiser = createCard(
        {
          name: "DrawRaiser",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          fanfare: [{ op: "draw", source: "deck", count: 1 }],
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(raiser);
      engineDispatch(state, {
        type: "PLAY_CARD",
        player: "first",
        cardUid: raiser.uid,
      });

      expect(watcherEarth("first", watcher.uid)).toBe(1);
      expect(getBoard(state, "first").some((c) => c?.uid === watcher.uid)).toBe(
        false,
      );
      expect(getBoard(state, "first").every((c) => c != null)).toBe(true);
      expect(getResolutionQueue().length).toBe(0);
    });

    it("Krulle-style re-enter loop terminates via queue guard within 5s", () => {
      resetUidCounter();
      givenGameState({ seed: 92, activePlayer: "first", roundCount: 6 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      getBoard(state, "first").push(
        createCard(
          {
            name: "KrulleWatcher",
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 5,
            counters: { earth: 0 },
            triggers: [
              {
                event: "ally_follower_enter",
                source: "board",
                condition: { name: "Goblin" },
                effects: [
                  {
                    op: "stat",
                    action: "give",
                    target: "allies",
                    attack: -1,
                    defense: -1,
                  },
                ],
              },
            ],
          },
          "board",
          "first",
        ),
      );

      const raiser = createCard(
        {
          name: "LoopSeed",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          fanfare: [
            {
              op: "summon",
              source: "named",
              name: "Goblin",
              count: 1,
            },
          ],
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
        "hand",
        "first",
      );
      state.players.first.hand.push(raiser);

      const start = Date.now();
      let threw = false;
      try {
        engineDispatch(state, {
          type: "PLAY_CARD",
          player: "first",
          cardUid: raiser.uid,
        });
      } catch (e) {
        threw = String(e).includes(String(MAX_RESOLUTION_QUEUE_LENGTH));
      }
      expect(Date.now() - start).toBeLessThan(5000);
      expect(threw || getResolutionQueue().length === 0).toBe(true);
    });
  });

  describe("Axis E — zone-change pins", () => {
    it("transform: board follower does not raise ally_follower_enter or leaves_field (rulebook: no enter/leave on transform)", () => {
      resetUidCounter();
      givenGameState({ seed: 80, activePlayer: "first", roundCount: 6 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const enterWatcher = createCard(
        {
          name: "EnterPin",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_follower_enter",
              source: "board",
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      const leaveWatcher = createCard(
        {
          name: "LeavePin",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_follower_leaves_field",
              source: "board",
              condition: { name: "TransformVictim" },
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(enterWatcher);
      applyKeywordsFromList(leaveWatcher);
      getBoard(state, "first").push(enterWatcher, leaveWatcher);

      const victim = createCard(
        {
          name: "TransformVictim",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
        "board",
        "first",
      );
      applyKeywordsFromList(victim);
      victim.peak_defense = 2;
      getBoard(state, "first").push(victim);

      transformTarget(victim, "Goblin");

      expect(watcherEarth("first", enterWatcher.uid)).toBe(0);
      expect(watcherEarth("first", leaveWatcher.uid)).toBe(0);
      expect(getBoard(state, "first").some((c) => c?.name === "Goblin")).toBe(
        true,
      );
    });

    it("changeFollowerControl: stolen follower does not enter/leave (changeControl.ts provisional)", () => {
      resetUidCounter();
      givenGameState({
        seed: 81,
        activePlayer: "first",
        roundCount: 6,
      }).build();
      state.gameStarted = true;
      state.phase = "main";

      const enterWatcher = createCard(
        {
          name: "EnterPin2",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_follower_enter",
              source: "board",
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "second",
      );
      applyKeywordsFromList(enterWatcher);
      getBoard(state, "second").push(enterWatcher);

      const stolen = createCard(
        {
          name: "StealMe",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
        },
        "board",
        "first",
      );
      applyKeywordsFromList(stolen);
      getBoard(state, "first").push(stolen);

      expect(changeFollowerControl(stolen, "second")).toBe(true);
      expect(watcherEarth("second", enterWatcher.uid)).toBe(0);
      expect(getBoard(state, "second").some((c) => c?.uid === stolen.uid)).toBe(
        true,
      );
    });

    it("evolve raises ally_evolve but not ally_follower_enter", () => {
      resetUidCounter();
      givenGameState({ seed: 82, activePlayer: "first", roundCount: 6 })
        .withFirstPP(10, 10)
        .withFirstEvo(2)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const enterWatcher = createCard(
        {
          name: "EnterPin3",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_follower_enter",
              source: "board",
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      const evoWatcher = createCard(
        {
          name: "EvoPin",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_evolve",
              source: "board",
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(enterWatcher);
      applyKeywordsFromList(evoWatcher);
      getBoard(state, "first").push(enterWatcher, evoWatcher);

      const evoTarget = createCard(
        {
          name: "EvoTarget",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
          canEvolve: true,
          hasEvolved: false,
        },
        "board",
        "first",
      );
      applyKeywordsFromList(evoTarget);
      evoTarget.peak_defense = 2;
      getBoard(state, "first").push(evoTarget);

      whenEvolve(evoTarget, "first");

      expect(watcherEarth("first", evoWatcher.uid)).toBe(1);
      expect(watcherEarth("first", enterWatcher.uid)).toBe(0);
    });

    it("return-to-deck from hand does not raise board leaves_field (return/unified.ts deck path)", () => {
      resetUidCounter();
      givenGameState({ seed: 85, activePlayer: "first", roundCount: 6 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const watcher = createCard(
        {
          name: "ReturnPin",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_follower_leaves_field",
              source: "board",
              condition: { name: "ReturnVictim" },
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(watcher);
      getBoard(state, "first").push(watcher);

      const handFollower = createCard(
        {
          name: "ReturnVictim",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(handFollower);
      state.players.first.deck.push(
        createCard(
          { name: "DeckPad", type: "Spell", cost: 1 },
          "deck",
          "first",
        ),
      );

      const returnSpell = createCard(
        {
          name: "ReturnRaiser",
          type: "Spell",
          cost: 1,
          spell: [
            {
              op: "return",
              destination: "deck",
              target: "ally:follower",
              filter: { name: "ReturnVictim" },
            },
          ],
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(returnSpell);

      engineDispatch(state, {
        type: "PLAY_CARD",
        player: "first",
        cardUid: returnSpell.uid,
      });

      expect(watcherEarth("first", watcher.uid)).toBe(0);
    });

    it.skip("Crystallize alternate form: headless PLAY_CARD mode=crystallize not wired in harness", () => {
      resetUidCounter();
      givenGameState({ seed: 83, activePlayer: "first", roundCount: 6 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const watcher = createCard(
        {
          name: "CrystPin",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_follower_enter",
              source: "board",
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(watcher);
      getBoard(state, "first").push(watcher);

      const crystallize = createCard(
        {
          name: "CrystallizeProbe",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          alternateForms: [
            {
              kind: "crystallize",
              type: "Amulet",
              cost: 2,
              countdown: 2,
            },
          ],
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(crystallize);
      engineDispatch(state, {
        type: "PLAY_CARD",
        player: "first",
        cardUid: crystallize.uid,
        mode: "crystallize",
      });

      expect(watcherEarth("first", watcher.uid)).toBe(0);
      expect(getBoard(state, "first").some((c) => c?.type === "Amulet")).toBe(
        true,
      );
    });

    it.skip("Accelerate alternate form: headless PLAY_CARD mode=accelerate not wired in harness", () => {
      resetUidCounter();
      givenGameState({ seed: 84, activePlayer: "first", roundCount: 6 })
        .withFirstPP(10, 10)
        .build();
      state.gameStarted = true;
      state.phase = "main";

      const watcher = createCard(
        {
          name: "AccelPin",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          triggers: [
            {
              event: "ally_follower_enter",
              source: "board",
              effects: [
                { op: "counter", action: "add", key: "earth", amount: 1 },
              ],
            },
          ],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(watcher);
      getBoard(state, "first").push(watcher);

      const accel = createCard(
        {
          name: "AccelProbe",
          type: "Follower",
          cost: 5,
          attack: 3,
          defense: 3,
          alternateForms: [
            {
              kind: "accelerate",
              type: "Spell",
              cost: 1,
              spell: [{ op: "draw", source: "deck", count: 1 }],
            },
          ],
        },
        "hand",
        "first",
      );
      state.players.first.deck.unshift(
        createCard(
          { name: "AccelPad", type: "Spell", cost: 1 },
          "deck",
          "first",
        ),
      );
      state.players.first.hand.push(accel);
      engineDispatch(state, {
        type: "PLAY_CARD",
        player: "first",
        cardUid: accel.uid,
        mode: "accelerate",
      });

      expect(watcherEarth("first", watcher.uid)).toBe(0);
    });
  });

  describe("Axis F — remaining events", () => {
    describe.each(remainingCells)("$label", ({ context, event, label }) => {
      const skip = v2RemainingSkipReason(context, event);
      const fail = KNOWN_FAILURES[cellKey(["remaining", context, event])];
      const body = () => {
        const run = runV2MatrixCell({
          context,
          event,
          axis: "remaining",
        });
        assertV2ReactiveInvariants(run, { event, context });
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
});
