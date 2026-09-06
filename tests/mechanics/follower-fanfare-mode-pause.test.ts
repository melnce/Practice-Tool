/**
 * #258 fix B: follower Fanfare mode prompt pauses playFollower like a target prompt.
 *
 * The spy on runEffects simulates a rebase regression where fanfare mode opens
 * pendingModeChoice but runEffects does not propagate "pending" — only
 * isEffectResolutionPaused() (not fanfarePaused alone) gates line 110.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
} from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHand, getShadows } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  getLegalSoakActions,
  clearPendingSoakModeChoice,
} from "../../src/bench/soakEnv.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { onHistoryEvent, setHistoryEnabled } from "../../src/core/history.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import * as effectsIndex from "../../src/logic/core/effects/index.js";

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("follower fanfare mode prompt pause (#258 fix B)", () => {
  let runEffectsSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    resetUidCounter();
    clearPendingSoakModeChoice();
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
    setHistoryEnabled(true);
    givenGameState({ seed: 258, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withFirstDeck(Array.from({ length: 25 }, () => "10111310"))
      .build();
    state.gameStarted = true;
    state.phase = "main";
    installSoakAdapter({ interactiveModes: true });
  });

  afterEach(() => {
    runEffectsSpy?.mockRestore();
    runEffectsSpy = undefined;
  });

  it("engineDispatch play pauses before enter/play triggers; CHOOSE_MODE resumes once", () => {
    const enterWatcher = createCard(
      {
        name: "Enter Watcher",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        triggers: [
          {
            event: "ally_follower_enter",
            effects: [{ op: "add_shadows", amount: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    enterWatcher.uid = "enter_watcher";
    applyKeywordsFromList(enterWatcher);

    const playWatcher = createCard(
      {
        name: "Play Watcher",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        triggers: [
          {
            event: "ally_follower_played",
            effects: [{ op: "draw", count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    playWatcher.uid = "play_watcher";
    applyKeywordsFromList(playWatcher);
    state.players.first.board = [enterWatcher, playWatcher];

    const modeFollower = createCard(
      {
        name: "Mode Fanfare Follower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        fanfare: [
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
    modeFollower.uid = "mode_follower";
    applyKeywordsFromList(modeFollower);
    state.players.first.hand = [modeFollower];

    const realRunEffects = effectsIndex.runEffects;
    runEffectsSpy = vi
      .spyOn(effectsIndex, "runEffects")
      .mockImplementation((effects, owner, source, ctx) => {
        const result = realRunEffects(effects, owner, source, ctx);
        const isFanfareMode =
          Array.isArray(effects) &&
          effects.length === 1 &&
          effects[0]?.op === "mode";
        if (isFanfareMode && state.pendingModeChoice && result === "pending") {
          // Rebase hazard: modal open but fanfarePaused would be false without #258.
          return undefined;
        }
        return result;
      });

    const queueAtCommits: number[] = [];
    const commitNames: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") {
        queueAtCommits.push(getResolutionQueue().length);
        commitNames.push(ev.name);
      }
    });

    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: modeFollower.uid,
    });

    expect(state.pendingModeChoice).toBeDefined();
    expect(getShadows(state, "first")).toBe(0);
    expect(getHand(state, "first").length).toBe(0);
    expect(state.players.first.board.some((c) => c.name === "Goblin")).toBe(
      false,
    );
    expect(
      state.players.first.board.some((c) => c.uid === modeFollower.uid),
    ).toBe(true);

    const legal = getLegalSoakActions();
    expect(legal.every((a) => a.type === "CHOOSE_MODE")).toBe(true);

    expect(commitNames).toContain("Play Card");
    for (const len of queueAtCommits) {
      expect(len).toBe(0);
    }

    engineDispatch(state, {
      type: "CHOOSE_MODE",
      player: "first",
      indices: [0],
    });

    unsub();

    expect(getShadows(state, "first")).toBeGreaterThan(0);
    expect(getHand(state, "first").length).toBeGreaterThan(0);
    expect(state.players.first.board.some((c) => c.name === "Goblin")).toBe(
      true,
    );
    expect(getResolutionQueue()).toHaveLength(0);
    expect(commitNames).toContain("Confirm Choice");
  });
});
