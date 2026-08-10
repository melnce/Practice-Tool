/**
 * C2 — Rulebook trigger priority (8-source ordered candidate list).
 * @see docs/svwb_rulebook_formatted.md trigger resolution order
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireTrigger,
  registerRunEffects,
} from "../../src/logic/core/triggers.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import {
  givenGameState,
  resetUidCounter,
  createCard,
} from "../harness/builders.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { handleReanimate } from "../../src/logic/effects/ops/reanimate.js";
import "./setup.ts";

vi.mock("../../src/ui/render.js", () => ({ logEvent: vi.fn() }));

describe("C2 — trigger priority (8-source tiers)", () => {
  let effectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetGameState(1);
    resetUidCounter();
    state.gameStarted = true;
    state.players.first.board = [];
    state.players.second.board = [];
    state.players.first.hand = [];
    state.players.second.hand = [];
    state.players.first.deck = [];
    state.players.second.deck = [];
    state.players.first.crests = [];
    state.players.second.crests = [];
    state.activePlayer = "first";
    (state as any).turnNumber = 1;

    effectSpy = vi.fn();
    registerRunEffects(effectSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubCard(
    id: number,
    owner: "first" | "second",
    zone: "board" | "hand" | "deck",
    marker: string,
    triggers: object[],
  ): CardInstance {
    return {
      uid: `uid-${id}`,
      id,
      name: marker,
      triggers,
      keywordState: { triggers: [] },
      type: "Follower",
      attack: 1,
      defense: 1,
      cost: 1,
      owner,
      zone,
    } as unknown as CardInstance;
  }

  const SYNTH = "SYNTH_PRIORITY_EVENT";

  it("reactive crest fires on an opponent-turn event (active=reactive crest tiers)", () => {
    state.players.second.crests = [
      {
        name: "Reactive Crest",
        owner: "second",
        insertionTs: 1,
        triggers: [
          { event: SYNTH, effects: [{ op: "noop", tag: "REACTIVE_CREST" }] },
        ],
      },
    ] as any;

    fireTrigger(SYNTH as any, "first", {});

    expect(effectSpy).toHaveBeenCalledTimes(1);
    expect(effectSpy.mock.calls[0][0][0]).toMatchObject({
      tag: "REACTIVE_CREST",
    });
  });

  it("cross-zone simultaneous triggers resolve hand-before-board (active side)", () => {
    const handCard = stubCard(1, "first", "hand", "HAND", [
      { event: SYNTH, effects: [{ op: "noop", tag: "HAND" }], source: "hand" },
    ]);
    const boardCard = stubCard(2, "first", "board", "BOARD", [
      {
        event: SYNTH,
        effects: [{ op: "noop", tag: "BOARD" }],
        source: "board",
      },
    ]);
    (boardCard as any).insertionTs = 1;

    state.players.first.hand = [handCard];
    state.players.first.board = [boardCard];

    fireTrigger(SYNTH as any, "first", {});

    expect(effectSpy).toHaveBeenCalledTimes(2);
    const tags = effectSpy.mock.calls.map((c) => c[0][0].tag);
    expect(tags).toEqual(["HAND", "BOARD"]);
  });

  it("active board tier resolves insertionTs ascending (oldest first)", () => {
    const old = stubCard(10, "first", "board", "OLD", [
      { event: SYNTH, effects: [{ op: "noop", tag: "OLD" }], source: "board" },
    ]);
    const young = stubCard(11, "first", "board", "YOUNG", [
      {
        event: SYNTH,
        effects: [{ op: "noop", tag: "YOUNG" }],
        source: "board",
      },
    ]);
    (old as any).insertionTs = 1;
    (young as any).insertionTs = 2;

    state.players.first.board = [young, old];

    fireTrigger(SYNTH as any, "first", {});

    const tags = effectSpy.mock.calls.map((c) => c[0][0].tag);
    expect(tags).toEqual(["OLD", "YOUNG"]);
  });

  it("full 8-tier ordering: active hand → reactive hand → crests → boards → decks", () => {
    state.players.first.hand = [
      stubCard(1, "first", "hand", "A_HAND", [
        {
          event: SYNTH,
          effects: [{ op: "noop", tag: "A_HAND" }],
          source: "hand",
        },
      ]),
    ];
    state.players.second.hand = [
      stubCard(2, "second", "hand", "R_HAND", [
        {
          event: SYNTH,
          effects: [{ op: "noop", tag: "R_HAND" }],
          source: "hand",
        },
      ]),
    ];
    state.players.first.crests = [
      {
        name: "A Crest",
        owner: "first",
        insertionTs: 1,
        triggers: [{ event: SYNTH, effects: [{ op: "noop", tag: "A_CREST" }] }],
      },
    ] as any;
    state.players.second.crests = [
      {
        name: "R Crest",
        owner: "second",
        insertionTs: 1,
        triggers: [{ event: SYNTH, effects: [{ op: "noop", tag: "R_CREST" }] }],
      },
    ] as any;
    state.players.first.board = [
      Object.assign(
        stubCard(3, "first", "board", "A_BOARD", [
          {
            event: SYNTH,
            effects: [{ op: "noop", tag: "A_BOARD" }],
            source: "board",
          },
        ]),
        { insertionTs: 1 },
      ),
    ];
    state.players.second.board = [
      Object.assign(
        stubCard(4, "second", "board", "R_BOARD", [
          {
            event: SYNTH,
            effects: [{ op: "noop", tag: "R_BOARD" }],
            source: "board",
          },
        ]),
        { insertionTs: 1 },
      ),
    ];
    state.players.first.deck = [
      stubCard(5, "first", "deck", "A_DECK", [
        {
          event: SYNTH,
          effects: [{ op: "noop", tag: "A_DECK" }],
          source: "deck",
        },
      ]),
    ];
    state.players.second.deck = [
      stubCard(6, "second", "deck", "R_DECK", [
        {
          event: SYNTH,
          effects: [{ op: "noop", tag: "R_DECK" }],
          source: "deck",
        },
      ]),
    ];

    fireTrigger(SYNTH as any, "first", {});

    const tags = effectSpy.mock.calls.map((c) => c[0][0].tag);
    expect(tags).toEqual([
      "A_HAND",
      "R_HAND",
      "A_CREST",
      "A_BOARD",
      "R_CREST",
      "R_BOARD",
      "A_DECK",
      "R_DECK",
    ]);
  });
});

describe("C2 — insertionTs on every board entry path", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.board = [];
    state.gameTick = 10;
  });

  it("reanimate assigns insertionTs via pushToBoard", () => {
    state.players.first.graveyard = [
      createCard("10001110", "graveyard", "first"),
    ];

    handleReanimate({ op: "reanimate", max_cost: 4 } as any, "first");

    const board = getBoard(state, "first");
    expect(board).toHaveLength(1);
    expect((board[0] as any).insertionTs).toBeDefined();
  });

  it("Last Words summon assigns insertionTs", () => {
    const lw = createCard(
      { name: "LW", type: "Follower", cost: 2, attack: 2, defense: 0 },
      "board",
      "first",
    );
    lw.hasLastWords = true;
    const lwFx = [
      { op: "summon", source: "named", name: "Bat", count: 1 } as any,
    ];
    lw.keywordState = { lastWordsEffects: lwFx };
    lw.lastWordsEffects = lwFx;
    state.players.first.board = [lw];

    cleanupDead();

    const bat = getBoard(state, "first").find((c) => c.name === "Bat");
    expect(bat).toBeDefined();
    expect((bat as any).insertionTs).toBeDefined();
  });
});

describe("C2 — insertionTs monotonic on same-tick multi-summon", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.players.first.board = [];
    state.gameTick = 10;
  });

  it("two summons in one effect batch get strictly increasing insertionTs", () => {
    runEffects(
      [
        { op: "summon", source: "named", name: "Bat", count: 1 },
        { op: "summon", source: "named", name: "Knight", count: 1 },
      ] as any,
      "first",
      null,
      {},
    );

    const board = getBoard(state, "first");
    expect(board).toHaveLength(2);
    const bat = board.find((c) => c.name === "Bat");
    const knight = board.find((c) => c.name === "Knight");
    expect(bat).toBeDefined();
    expect(knight).toBeDefined();
    expect((bat as any).insertionTs).toBeLessThan((knight as any).insertionTs);
  });
});
