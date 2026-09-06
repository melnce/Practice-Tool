/**
 * Mode prompt pauses resolution like a target prompt: no commit assert, queue drains after choice.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getShadows } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  getLegalSoakActions,
  applySoakActionWithOutcome,
  clearPendingSoakModeChoice,
} from "../../src/bench/soakEnv.js";
import { onHistoryEvent, setHistoryEnabled } from "../../src/core/history.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { playCard } from "../../src/logic/core/playCard/index.js";

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("mode prompt resolution queue", () => {
  beforeEach(() => {
    resetUidCounter();
    clearPendingSoakModeChoice();
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
    setHistoryEnabled(true);
    givenGameState({ seed: 77, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    installSoakAdapter({ interactiveModes: true });
  });

  it("mode summon with enter reaction — no commit assert; queue empty at every commit", () => {
    const watcher = createCard(
      {
        name: "Enter Watcher",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        triggers: [
          {
            type: "ally_follower_enter",
            effects: [{ op: "add_shadows", amount: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    watcher.uid = "watcher";
    applyKeywordsFromList(watcher);
    state.players.first.board = [watcher];

    const modeSpell = createCard(
      {
        name: "Mode Summon Test",
        type: "Spell",
        cost: 2,
        spell: [
          {
            op: "mode",
            select: 1,
            options: [
              {
                label: "Summon token",
                effects: [
                  {
                    op: "summon",
                    name: "Goblin",
                    count: 1,
                    source: "named",
                  },
                ],
              },
              {
                label: "Draw",
                effects: [{ op: "draw", count: 1 }],
              },
            ],
          },
        ],
      },
      "hand",
      "first",
    );
    modeSpell.uid = "mode_spell";
    applyKeywordsFromList(modeSpell);
    state.players.first.hand = [modeSpell];

    const queueAtCommits: number[] = [];
    const commitNames: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") {
        queueAtCommits.push(getResolutionQueue().length);
        commitNames.push(ev.name);
      }
    });

    playCard(state.players.first.hand, "first", 0);

    expect(state.pendingModeChoice).toBeDefined();
    const legal = getLegalSoakActions();
    expect(legal.every((a) => a.type === "CHOOSE_MODE")).toBe(true);

    const modePick = legal.find(
      (a) => a.type === "CHOOSE_MODE" && a.indices[0] === 0,
    );
    expect(modePick).toBeDefined();
    applySoakActionWithOutcome(modePick!, "engine");

    unsub();

    expect(commitNames).toContain("Play Card");
    expect(commitNames).toContain("Confirm Choice");
    for (const len of queueAtCommits) {
      expect(len).toBe(0);
    }
    expect(getResolutionQueue()).toHaveLength(0);
    expect(getShadows(state, "first")).toBeGreaterThan(0);
    expect(state.players.first.board.length).toBeGreaterThan(1);
  });
});
