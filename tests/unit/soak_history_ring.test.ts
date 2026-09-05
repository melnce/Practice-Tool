/**
 * Deep-undo ring accounting — every history commit (including nested) is counted.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import {
  applySoakActionWithOutcome,
  canonicalJson,
  installSoakAdapter,
  type HistoryRingEntry,
  type SoakAction,
} from "../../src/bench/soakEnv.js";
import { dispatch } from "../../src/engine.js";
import { state } from "../../src/core/gameState.js";
import {
  captureSnapshot,
  onHistoryEvent,
  setHistoryEnabled,
} from "../../src/core/history.js";
import { givenGameState, createCard } from "../harness/builders.js";
import "../audit/setup.ts";

function measureCommits(action: SoakAction): number {
  let commits = 0;
  const unsub = onHistoryEvent((ev) => {
    if (ev.type === "commit") commits++;
    if (ev.type === "reset") commits = 0;
  });
  applySoakActionWithOutcome(action, "engine");
  unsub();
  return commits;
}

function recordRingStep(
  ring: HistoryRingEntry[],
  action: SoakAction,
): { commits: number; before: string; after: string } {
  const before = canonicalJson(captureSnapshot());
  const commits = measureCommits(action);
  const after = canonicalJson(captureSnapshot());
  if (commits >= 1) {
    ring.push({ action, commits, before, after });
  }
  return { commits, before, after };
}

describe("soak deep history ring accounting", () => {
  beforeAll(async () => {
    (globalThis as any).HEADLESS = true;
    await initCardDatabaseNode();
  });

  beforeEach(() => {
    setHistoryEnabled(true);
    installSoakAdapter();
  });

  it("play → choose (0 commits) → confirm with nested commit: ring counts and deep chain lands on before", () => {
    givenGameState({ seed: 4242, activePlayer: "first", roundCount: 6 })
      .withFirstBoard([
        {
          name: "Board Follower",
          type: "Follower",
          cost: 5,
          base_cost: 5,
          attack: 5,
          defense: 5,
        },
      ])
      .withFirstDeck(["10111310", "10111310", "10111310", "10111310"])
      .withFirstPP(5, 5)
      .build();

    const source = state.players.first.board[0]!;
    state.pendingTargetEffect = {
      eff: {
        op: "nested_effects",
        effects: [{ op: "draw", source: "deck", count: 1 }],
      },
      owner: "first",
      sourceCard: source,
      sourceCardUid: source.uid,
      pool: [source],
      poolUids: [source.uid],
      targetUids: [],
      selectCount: 1,
      requiresConfirmation: true,
    };

    const ring: HistoryRingEntry[] = [];

    const choose = recordRingStep(ring, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: source.uid },
    });
    expect(choose.commits).toBe(0);
    expect(ring).toHaveLength(0);
    expect(state.pendingTargetEffect?.targetUids).toContain(source.uid);

    const confirm = recordRingStep(ring, { type: "CONFIRM_TARGETS" });
    expect(confirm.commits).toBe(1);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.commits).toBe(1);

    for (let u = 0; u < ring[0]!.commits; u++) {
      dispatch(state, { type: "UNDO" });
    }
    expect(canonicalJson(captureSnapshot())).toBe(ring[0]!.before);
  });

  it("CHOOSE_TARGET with nested_effects commit is counted in the ring", () => {
    givenGameState({ seed: 9002, activePlayer: "first", roundCount: 5 })
      .withFirstBoard([
        {
          name: "Board Follower",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ])
      .withFirstDeck(["10111310", "10111310", "10111310"])
      .withFirstPP(5, 5)
      .build();

    const source = state.players.first.board[0]!;
    state.pendingTargetEffect = {
      eff: {
        op: "nested_effects",
        effects: [{ op: "draw", source: "deck", count: 1 }],
      },
      owner: "first",
      sourceCard: source,
      sourceCardUid: source.uid,
      pool: [source],
      poolUids: [source.uid],
      targetUids: [],
      selectCount: 1,
    };

    const ring: HistoryRingEntry[] = [];
    const step = recordRingStep(ring, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: source.uid },
    });
    expect(step.commits).toBe(1);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.commits).toBe(1);
  });
});
