/**
 * Regression: dual-zone board+graveyard after countdown LW cleanup.
 * Mechanism (soak seed 20260815 game 277): cleanupDead collected a stale board
 * index, then ally_amulet_destroyed triggers compacted/reordered the board.
 * Nulling the stale index left the dying amulet seated while sendToGrave ran
 * → same instance in board + graveyard.
 *
 * Fix discipline: detach by identity before triggers; sendToGrave re-detaches.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetGameState, state } from "../../src/core/gameState.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { checkSoakInvariants } from "../../src/bench/soakInvariants.js";
import { getBoard, getGraveyard } from "../../src/core/playerHelpers.js";

describe("zone identity: cleanup detach-before-triggers", () => {
  beforeEach(() => {
    resetGameState(20260815);
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("dying amulet is off the board even if destroy triggers reorder slots", () => {
    const watcher = {
      uid: "watcher",
      name: "Board Watcher",
      type: "Follower",
      attack: 1,
      defense: 1,
      owner: "first",
      zone: "board",
      keywords: [],
      // When an allied amulet dies, destroy this watcher — board indices shift.
      triggers: [
        {
          event: "ally_amulet_destroyed",
          effects: [{ op: "destroy", target: "self" }],
        },
      ],
    } as any;

    const ahead = {
      uid: "ahead",
      name: "Ahead Amulet",
      type: "Amulet",
      owner: "first",
      zone: "board",
      keywords: [],
      triggers: [],
    } as any;

    const pact = {
      uid: "pact_uid",
      id: "10163210",
      name: "Pact of the Beast Princess",
      type: "Amulet",
      owner: "first",
      zone: "board",
      hasCountdown: true,
      countdown: 0,
      hasLastWords: true,
      lastWordsEffects: [{ op: "draw", count: 1 }],
      keywords: [],
      triggers: [],
    } as any;

    // Indices at collection: 0 watcher, 1 ahead, 2 pact.
    // Destroy triggers may remove watcher (def→0) before the stale index write.
    state.players.first.board = [watcher, ahead, pact];
    state.players.first.graveyard = [];
    state.players.first.deck = [
      {
        uid: "deck1",
        name: "Draw Fodder",
        type: "Follower",
        cost: 1,
        owner: "first",
        zone: "deck",
      } as any,
    ];
    state.players.first.hand = [];

    cleanupDead();

    const board = getBoard(state, "first").filter(Boolean);
    const grave = getGraveyard(state, "first");

    expect(board.includes(pact)).toBe(false);
    expect(grave.includes(pact)).toBe(true);
    expect(pact.zone).toBe("graveyard");

    const findings = checkSoakInvariants(state);
    expect(
      findings.filter((f) => /two zones|Duplicate UID/i.test(f.message)),
    ).toEqual([]);
  });

  it("amulet without LW still leaves the board for the graveyard only", () => {
    const amulet = {
      uid: "stuck",
      id: "stuck",
      name: "Pact of the Beast Princess",
      type: "Amulet",
      owner: "first",
      zone: "board",
      hasCountdown: true,
      countdown: 0,
      hasLastWords: false,
      keywords: [],
      triggers: [],
    } as any;

    state.players.first.board = [amulet];
    state.players.first.graveyard = [];

    cleanupDead();

    expect(getBoard(state, "first").includes(amulet)).toBe(false);
    expect(getGraveyard(state, "first").includes(amulet)).toBe(true);
    expect(checkSoakInvariants(state)).toEqual([]);
  });
});
