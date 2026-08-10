/**
 * C5 — Combat trigger order (rulebook §228–240).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.ts";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

function combatFollower(
  name: string,
  owner: "first" | "second",
  opts: {
    attack?: number;
    defense?: number;
    triggers?: object[];
    hasBane?: boolean;
  } = {},
) {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: opts.attack ?? 2,
      defense: opts.defense ?? 2,
      triggers: opts.triggers,
      hasBane: opts.hasBane,
    },
    "board",
    owner,
  );
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  card.hasAttacked = false;
  card.justPlayed = false;
  return card;
}

describe("C5 — Strike/Clash order before damage (§228–240)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstDeck([
        { name: "Drawn", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
    state.players.second.hp = 20;
  });

  it("Strike+Bane attacker vs Clash defender: Strike → defender Clash → damage → Bane", () => {
    const attacker = combatFollower("Striker", "first", {
      attack: 2,
      defense: 2,
      hasBane: true,
      triggers: [
        {
          event: "strike",
          source: "board",
          effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
        },
      ],
    });
    const defender = combatFollower("Clasher", "second", {
      attack: 3,
      defense: 3,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "clash_opponent", amount: 2 }],
        },
      ],
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    // Strike hit leader before combat damage on the defender.
    expect(state.players.second.hp).toBe(19);
    // Defender Clash reduced attacker to 0 DEF but combat damage still exchanged.
    expect(Number(attacker.defense)).toBe(0);
    // Bane destroyed defender after damage was dealt.
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("defender Clash still fires when attacker's Clash would kill it first", () => {
    const attacker = combatFollower("HeavyClash", "first", {
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "clash_opponent", amount: 10 }],
        },
      ],
    });
    const defender = combatFollower("Retaliator", "second", {
      attack: 0,
      defense: 3,
      triggers: [
        {
          event: "clash",
          source: "board",
          effects: [{ op: "damage", target: "clash_opponent", amount: 2 }],
        },
      ],
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    attackFollower(0, 0, "first", "second");

    // Defender Clash queued at declaration — still dealt 2 before cleanup.
    expect(Number(attacker.defense)).toBe(3);
    expect(Number(defender.defense)).toBeLessThanOrEqual(0);
  });

  it("ally_follower_attacked crest fires via C2 ordered path", () => {
    state.players.first.crests = [
      {
        name: "Attack Watch Crest",
        owner: "first",
        insertionTs: 1,
        triggers: [
          {
            event: "ally_follower_attacked",
            effects: [{ op: "draw", source: "deck", count: 1 }],
          },
        ],
      },
    ] as any;

    const attacker = combatFollower("Raider", "first", {
      attack: 2,
      defense: 2,
    });
    const defender = combatFollower("Dummy", "second", {
      attack: 1,
      defense: 5,
    });

    state.players.first.board = [attacker];
    state.players.second.board = [defender];

    const handBefore = thenHand("first").length;
    attackFollower(0, 0, "first", "second");
    expect(thenHand("first").length).toBe(handBefore + 1);
  });
});
