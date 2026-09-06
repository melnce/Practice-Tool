/**
 * Soak adapter exercises modal mode resolution (not HEADLESS AI heuristic).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  whenPlayCard,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHP } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  getLegalSoakActions,
  applySoakActionWithOutcome,
  getPendingSoakModeChoice,
  clearPendingSoakModeChoice,
} from "../../src/bench/soakEnv.js";
import { onHistoryEvent } from "../../src/core/history.js";

const ILSA = "10472120";

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
});

describe("soak interactive mode prompts", () => {
  beforeEach(() => {
    resetUidCounter();
    clearPendingSoakModeChoice();
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = true;
    givenGameState({ seed: 99, activePlayer: "first", roundCount: 10 })
      .withFirstPP(7, 10)
      .withFirstHand([ILSA])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    installSoakAdapter({ interactiveModes: true });
  });

  it("mode spell requires CHOOSE_MODE; Confirm Choice appears in history", () => {
    const commits: string[] = [];
    const unsub = onHistoryEvent((ev) => {
      if (ev.type === "commit") commits.push(ev.name);
    });

    const hp0 = getHP(state, "second");
    whenPlayCard("first", 0);

    expect(getPendingSoakModeChoice()).not.toBeNull();
    const legal = getLegalSoakActions();
    expect(legal.every((a) => a.type === "CHOOSE_MODE")).toBe(true);
    expect(legal.some((a) => a.type === "CHOOSE_MODE")).toBe(true);

    const modePick = legal.find(
      (a) => a.type === "CHOOSE_MODE" && a.indices[0] === 1,
    );
    expect(modePick).toBeDefined();
    applySoakActionWithOutcome(modePick!, "engine");

    expect(getPendingSoakModeChoice()).toBeNull();
    expect(getHP(state, "second")).toBe(hp0 - 4);
    expect(commits).toContain("Confirm Choice");

    unsub();
  });

  it("HEADLESS without opt-out uses AI path (no modal CHOOSE_MODE required)", () => {
    clearPendingSoakModeChoice();
    (globalThis as any).__SVWB_INTERACTIVE_MODES__ = false;

    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 6 },
      "board",
      "second",
    );
    enemy.peak_defense = 6;
    state.players.second.board = [enemy];

    whenPlayCard("first", 0);

    expect(getPendingSoakModeChoice()).toBeNull();
    const legal = getLegalSoakActions();
    expect(legal.some((a) => a.type === "CHOOSE_MODE")).toBe(false);
    expect(Number(enemy.defense)).toBeLessThan(6);
  });
});
