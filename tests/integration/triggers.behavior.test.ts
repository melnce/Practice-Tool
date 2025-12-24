import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireTrigger,
  registerRunEffects,
} from "../../src/logic/core/triggers.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { CardInstance } from "../../src/core/types.js";

// Mock minimal dependencies
vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../src/logic/core/logger.js", () => ({ logEvent: vi.fn() }));

describe("Trigger Module Invariants", () => {
  let effectSpy: any;

  beforeEach(() => {
    // Reset state using nested player structure
    resetGameState(1);
    state.players.first.board = [];
    state.players.second.board = [];
    state.players.first.hand = [];
    state.players.second.hand = [];
    state.players.first.crests = [];
    state.players.second.crests = [];
    (state as any).turnNumber = 1;
    state.isFirstPlayerTurn = true;

    effectSpy = vi.fn();
    registerRunEffects(effectSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createCard(
    id: number,
    owner: string,
    zone: string,
    triggers: any[],
  ): CardInstance {
    return {
      uid: id,
      id: id,
      name: `Card ${id}`,
      triggers,
      keywordState: { triggers: [] },
      type: "Follower",
      attack: 1,
      defense: 1,
      cost: 1,
      owner: owner as any,
    } as unknown as CardInstance;
  }

  it("Invariant: Execution Order (Crests -> Board -> Hand)", () => {
    const event = "TEST_EVENT";
    const crest = {
      name: "Crest",
      triggers: [{ event, effects: [{ type: "log", value: "CREST" }] }],
    };
    state.players.first.crests = [crest] as any;
    const c1 = createCard(1, "first", "board", [
      {
        event,
        effects: [{ type: "log", value: "BLUE_BOARD" }],
        source: "board",
      },
    ]);
    state.players.first.board = [c1];
    const c2 = createCard(2, "second", "board", [
      {
        event,
        effects: [{ type: "log", value: "RED_BOARD" }],
        source: "board",
      },
    ]);
    state.players.second.board = [c2];
    const c3 = createCard(3, "first", "hand", [
      { event, effects: [{ type: "log", value: "BLUE_HAND" }], source: "hand" },
    ]);
    state.players.first.hand = [c3];

    fireTrigger(event, "first", {});

    expect(effectSpy).toHaveBeenCalledTimes(4);
    const calls = effectSpy.mock.calls.map((c: any) => c[0][0].value);
    expect(calls).toEqual(["CREST", "BLUE_BOARD", "RED_BOARD", "BLUE_HAND"]);
  });

  it("Invariant: Loot Fused Dedupe (Once per turn per initiator)", () => {
    const initiator = createCard(99, "first", "hand", []);

    const recipient = createCard(10, "first", "board", [
      { event: "loot_fused", effects: [{ type: "ping" }], source: "board" },
    ]);
    state.players.first.board = [recipient];

    // Fire 1
    fireTrigger("loot_fused", "first", { initiator });
    expect(effectSpy).toHaveBeenCalledTimes(1);

    // Fire 2 (Same turn)
    fireTrigger("loot_fused", "first", { initiator });
    expect(effectSpy).toHaveBeenCalledTimes(1);

    // Fire 3 (New turn)
    (state as any).turnNumber = 2;
    fireTrigger("loot_fused", "first", { initiator });
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  it("Invariant: Once Per Turn (Generic)", () => {
    const event = "OPT_TEST";
    const c1 = createCard(100, "first", "board", [
      { event, effects: [{ type: "e" }], once_per_turn: true, source: "board" },
    ]);
    state.players.first.board = [c1];

    // Fire 1
    fireTrigger(event, "first", {});
    expect(effectSpy).toHaveBeenCalledTimes(1);

    // Fire 2
    fireTrigger(event, "first", {});
    expect(effectSpy).toHaveBeenCalledTimes(1);

    // Reset turn
    (state as any).turnNumber = 2;
    fireTrigger(event, "first", {});
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  it("Invariant: Legacy Bypass (Clash ignores standard conditions)", () => {
    const c1 = createCard(200, "first", "board", [
      {
        event: "clash",
        effects: [{ type: "clash_effect" }],
        condition: { attack_lte: 0 },
        source: "board",
      },
    ]);
    c1.attack = 5;
    state.players.first.board = [c1];
    const context = {
      attacker: c1,
      defender: createCard(201, "second", "board", []),
    };
    fireTrigger("clash", "first", context);
    expect(effectSpy).toHaveBeenCalledTimes(1);
  });

  it("Invariant: Strict Play Logic (No bypass for ally_follower_played check)", () => {
    const c1 = createCard(300, "first", "board", [
      {
        event: "ally_follower_played",
        condition: { name: "Bob" },
        effects: [{ type: "ok" }],
        source: "board",
      },
    ]);
    state.players.first.board = [c1];

    // Play Alice
    fireTrigger("ally_follower_played", "first", {
      playedCard: { ...c1, name: "Alice", type: "Follower" } as any,
    });
    expect(effectSpy).toHaveBeenCalledTimes(0);

    // Play Bob
    fireTrigger("ally_follower_played", "first", {
      playedCard: { ...c1, name: "Bob", type: "Follower" } as any,
    });
    expect(effectSpy).toHaveBeenCalledTimes(1);
  });
});
