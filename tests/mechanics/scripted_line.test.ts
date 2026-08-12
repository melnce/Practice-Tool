/**
 * Sparring-line determinism: same seed + same script → same final hash.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../fixtures/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resetHistory } from "../../src/core/history.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import {
  runWithReplay,
  computeStateHash,
} from "../../src/logic/core/replay.js";
import { parseScriptDocument } from "../../src/core/script/parse.js";
import { SCRIPT_SCHEMA_VERSION } from "../../src/core/script/types.js";
import { scriptStepToAction } from "../../src/logic/script/resolve.js";
import {
  clearScript,
  loadScriptForPlayback,
  advanceScriptPlayback,
} from "../../src/logic/script/runtime.js";
import { occurrenceOf } from "../../src/core/script/identity.js";

describe("script format", () => {
  it("parses a hand-writable line and rejects bad schema versions", () => {
    const doc = parseScriptDocument({
      schemaVersion: SCRIPT_SCHEMA_VERSION,
      name: "T4 play then pass",
      scriptedSide: "second",
      seed: 99,
      steps: [
        { op: "PLAY_CARD", card: { cardId: "10001110", occ: 0 } },
        {
          op: "EVOLVE",
          card: { cardId: "10001110", occ: 0 },
          mode: "normal",
        },
        {
          op: "ATTACK",
          attacker: { cardId: "10001110" },
          defender: { kind: "leader" },
        },
        { op: "END_TURN" },
      ],
    });
    expect(doc.steps).toHaveLength(4);
    expect(() => parseScriptDocument({ ...doc, schemaVersion: 999 })).toThrow(
      /schemaVersion/,
    );
  });

  it("occurrence index is stable for duplicate card ids", () => {
    const a = createCard({ id: "x", name: "A" }, "hand", "first");
    const b = createCard({ id: "x", name: "B" }, "hand", "first");
    const zone = [a, b];
    expect(occurrenceOf(zone, a.uid)).toEqual({ cardId: "x", occ: 0 });
    expect(occurrenceOf(zone, b.uid)).toEqual({ cardId: "x", occ: 1 });
  });
});

describe("scripted line determinism", () => {
  beforeEach(() => {
    resetUidCounter();
    resetHistory();
    clearScript();
    (globalThis as any).HEADLESS = true;
  });

  function buildBoard() {
    givenGameState({ seed: 4242, activePlayer: "second" }).build();
    state.gameStarted = true;
    state.phase = "main";
    state.roundCount = 4;
    state.players.second.pp = 5;
    state.players.second.maxPP = 5;
    const follower = createCard(
      {
        id: "script_atk_1",
        name: "Line Attacker",
        type: "Follower",
        cost: 2,
        attack: 3,
        defense: 2,
        hasStorm: true,
        justPlayed: false,
        can_attack: true,
        attacks_left: 1,
      },
      "board",
      "second",
    );
    state.players.second.board = [follower];
    return follower;
  }

  it("replaying the same script from the same seed yields the same hash", () => {
    const runOnce = () => {
      const follower = buildBoard();
      const script = parseScriptDocument({
        schemaVersion: SCRIPT_SCHEMA_VERSION,
        name: "attack-leader-pass",
        scriptedSide: "second",
        seed: 4242,
        steps: [
          {
            op: "ATTACK",
            attacker: { cardId: "script_atk_1", occ: 0 },
            defender: { kind: "leader" },
          },
          { op: "END_TURN" },
        ],
      });

      // Resolve to PlayerActions against live state, then runWithReplay-style apply
      const actions = script.steps.map((step, i) =>
        scriptStepToAction(state, "second", step, i),
      );
      // Apply via dispatchAction (headless)
      for (const a of actions) {
        // Re-resolve UIDs would be needed if we rebuilt state; here board is live.
        if (a.type === "ATTACK") {
          a.attackerUid = follower.uid;
        }
        dispatchAction(state, a);
      }
      return hashGameState(state);
    };

    const h1 = runOnce();
    const h2 = runOnce();
    expect(h1).toBe(h2);
    expect(state.players.first.hp).toBeLessThan(20);
  });

  it("runWithReplay capsule is identical across two runs of the same actions", () => {
    buildBoard();
    const followerUid = state.players.second.board[0]!.uid;
    const actions = [
      {
        type: "ATTACK" as const,
        player: "second" as const,
        attackerUid: followerUid,
        defender: { type: "leader" as const, player: "first" as const },
      },
      { type: "END_TURN" as const },
    ];

    const makeCapsule = () => {
      buildBoard();
      const uid = state.players.second.board[0]!.uid;
      const acts = [
        {
          type: "ATTACK" as const,
          player: "second" as const,
          attackerUid: uid,
          defender: { type: "leader" as const, player: "first" as const },
        },
        { type: "END_TURN" as const },
      ];
      return runWithReplay({
        version: "script-1",
        seed: 4242,
        actions: acts,
        init: () => {
          buildBoard();
          return state;
        },
        applyAction: (s, a) => dispatchAction(s, a),
      });
    };

    void actions;
    const c1 = makeCapsule();
    const c2 = makeCapsule();
    expect(c1.final.stateHash).toBe(c2.final.stateHash);
    expect(c1.initial.stateHash).toBe(c2.initial.stateHash);
  });

  it("halts loudly on divergence instead of inventing a play", () => {
    buildBoard();
    loadScriptForPlayback(
      parseScriptDocument({
        schemaVersion: SCRIPT_SCHEMA_VERSION,
        name: "missing-card",
        scriptedSide: "second",
        steps: [
          {
            op: "PLAY_CARD",
            card: { cardId: "does_not_exist", occ: 0 },
          },
        ],
      }),
    );
    const result = advanceScriptPlayback();
    expect(result.status).toBe("diverged");
    const snapHash = computeStateHash(state);
    // State unchanged enough that HP is still full (no invented attack)
    expect(state.players.first.hp).toBe(20);
    expect(snapHash).toBeTruthy();
  });
});
