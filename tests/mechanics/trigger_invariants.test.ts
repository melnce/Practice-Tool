/**
 * Trigger module invariants — ordering, dedupe, condition bypass rules.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireTrigger,
  registerRunEffects,
} from "../../src/logic/core/triggers.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import type { CardInstance } from "../../src/core/types/index.js";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));
vi.mock("../../src/logic/core/logger.js", () => ({ logEvent: vi.fn() }));

describe("Trigger module invariants", () => {
  let effectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetGameState(1);
    state.players.first.board = [];
    state.players.second.board = [];
    state.players.first.hand = [];
    state.players.second.hand = [];
    state.players.first.crests = [];
    state.players.second.crests = [];
    (state as any).turnNumber = 1;
    state.activePlayer = "first";

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
    triggers: object[],
  ): CardInstance {
    return {
      uid: id,
      id,
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

  it("execution order: hand → crest → active board → reactive board", () => {
    const event = "TEST_EVENT";
    state.players.first.crests = [
      {
        name: "Crest",
        triggers: [{ event, effects: [{ type: "log", value: "CREST" }] }],
      },
    ] as any;
    state.players.first.board = [
      createCard(1, "first", "board", [
        {
          event,
          effects: [{ type: "log", value: "BLUE_BOARD" }],
          source: "board",
        },
      ]),
    ];
    state.players.second.board = [
      createCard(2, "second", "board", [
        {
          event,
          effects: [{ type: "log", value: "RED_BOARD" }],
          source: "board",
        },
      ]),
    ];
    state.players.first.hand = [
      createCard(3, "first", "hand", [
        {
          event,
          effects: [{ type: "log", value: "BLUE_HAND" }],
          source: "hand",
        },
      ]),
    ];

    fireTrigger(event, "first", {});

    expect(effectSpy).toHaveBeenCalledTimes(4);
    const calls = effectSpy.mock.calls.map((c: any) => c[0][0].value);
    expect(calls).toEqual(["BLUE_HAND", "CREST", "BLUE_BOARD", "RED_BOARD"]);
  });

  it("loot_fused: dedupes once per turn per initiator", () => {
    const initiator = createCard(99, "first", "hand", []);
    const recipient = createCard(10, "first", "board", [
      { event: "loot_fused", effects: [{ type: "ping" }], source: "board" },
    ]);
    state.players.first.board = [recipient];

    fireTrigger("loot_fused", "first", { initiator });
    expect(effectSpy).toHaveBeenCalledTimes(1);

    fireTrigger("loot_fused", "first", { initiator });
    expect(effectSpy).toHaveBeenCalledTimes(1);

    (state as any).turnNumber = 2;
    fireTrigger("loot_fused", "first", { initiator });
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  it("once_per_turn: generic trigger fires only once per turn", () => {
    const event = "OPT_TEST";
    state.players.first.board = [
      createCard(100, "first", "board", [
        {
          event,
          effects: [{ type: "e" }],
          once_per_turn: true,
          source: "board",
        },
      ]),
    ];

    fireTrigger(event, "first", {});
    expect(effectSpy).toHaveBeenCalledTimes(1);

    fireTrigger(event, "first", {});
    expect(effectSpy).toHaveBeenCalledTimes(1);

    (state as any).turnNumber = 2;
    fireTrigger(event, "first", {});
    expect(effectSpy).toHaveBeenCalledTimes(2);
  });

  it("clash: ignores standard conditions (legacy bypass)", () => {
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

    fireTrigger("clash", "first", {
      attacker: c1,
      defender: createCard(201, "second", "board", []),
    });

    expect(effectSpy).toHaveBeenCalledTimes(1);
  });

  it("ally_follower_played: respects name condition (no bypass)", () => {
    const c1 = createCard(300, "first", "board", [
      {
        event: "ally_follower_played",
        condition: { name: "Bob" },
        effects: [{ type: "ok" }],
        source: "board",
      },
    ]);
    state.players.first.board = [c1];

    fireTrigger("ally_follower_played", "first", {
      playedCard: { ...c1, name: "Alice", type: "Follower" } as any,
    });
    expect(effectSpy).toHaveBeenCalledTimes(0);

    fireTrigger("ally_follower_played", "first", {
      playedCard: { ...c1, name: "Bob", type: "Follower" } as any,
    });
    expect(effectSpy).toHaveBeenCalledTimes(1);
  });
});
