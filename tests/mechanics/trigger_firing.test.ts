/**
 * Trigger firing — behavioral contracts (damage, buffs, once-per-turn).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  thenHP,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";

describe("Mechanic Contract: trigger firing", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("start_of_turn: deals 1 damage to enemy leader", () => {
    givenGameState({ seed: 1 })
      .withSecondHP(20)
      .withFirstBoard([
        {
          name: "DamageOnTurnStart",
          type: "Follower",
          attack: 1,
          defense: 1,
          triggers: [
            {
              event: "start_of_turn",
              source: "board",
              effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
            },
          ],
        },
      ])
      .build();

    const hpBefore = thenHP("second");
    fireTrigger("start_of_turn", "first", {});
    expect(thenHP("second")).toBe(hpBefore - 1);
  });

  it("ally_follower_enter: buffs other allies +1 ATK", () => {
    givenGameState({ seed: 1 })
      .withFirstBoard([
        {
          name: "BuffOnEnter",
          type: "Follower",
          attack: 2,
          defense: 2,
          triggers: [
            {
              event: "ally_follower_enter",
              source: "board",
              effects: [
                {
                  op: "stat",
                  action: "give",
                  target: "ally:follower",
                  attack: 1,
                  defense: 1,
                },
              ],
            },
          ],
        },
        {
          name: "AllyFollower",
          type: "Follower",
          attack: 3,
          defense: 3,
        },
      ])
      .build();

    const allyBefore = thenBoard("first").find(
      (c) => c.name === "AllyFollower",
    );
    const attackBefore = allyBefore!.attack;

    const enteringCard = {
      uid: "new_ally",
      name: "NewAlly",
      type: "Follower",
      owner: "first",
      zone: "board",
    };

    fireTrigger("ally_follower_enter", "first", {
      enteringCard: enteringCard as any,
      enteringOwner: "first",
    });

    const allyAfter = thenBoard("first").find((c) => c.name === "AllyFollower");
    expect(allyAfter!.attack).toBe((attackBefore as number) + 1);
  });

  it("once_per_turn: fires only once per turn", () => {
    givenGameState({ seed: 1 })
      .withSecondHP(20)
      .withFirstBoard([
        {
          name: "OncePerTurnCard",
          type: "Follower",
          attack: 1,
          defense: 1,
          triggers: [
            {
              event: "ally_spell_played",
              source: "board",
              once_per_turn: true,
              effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
            },
          ],
        },
      ])
      .build();

    const hpBefore = thenHP("second");
    fireTrigger("ally_spell_played", "first", {});
    const hpAfterFirst = thenHP("second");
    fireTrigger("ally_spell_played", "first", {});
    const hpAfterSecond = thenHP("second");

    expect(hpAfterFirst).toBe(hpBefore - 2);
    expect(hpAfterSecond).toBe(hpAfterFirst);
  });

  it("once_per_turn: resets on new turn", () => {
    givenGameState({ seed: 1, turn: 1 })
      .withSecondHP(20)
      .withFirstBoard([
        {
          name: "OncePerTurnCard",
          type: "Follower",
          attack: 1,
          defense: 1,
          triggers: [
            {
              event: "ally_spell_played",
              source: "board",
              once_per_turn: true,
              effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
            },
          ],
        },
      ])
      .build();

    fireTrigger("ally_spell_played", "first", {});
    const hpAfterTurn1 = thenHP("second");

    state.turnNumber = 2;
    fireTrigger("ally_spell_played", "first", {});
    const hpAfterTurn2 = thenHP("second");

    expect(hpAfterTurn2).toBe(hpAfterTurn1 - 2);
  });

  it("strike: deals 1 damage to enemy leader", () => {
    givenGameState({ seed: 1 })
      .withSecondHP(20)
      .withFirstBoard([
        {
          name: "StrikeCard",
          type: "Follower",
          attack: 3,
          defense: 3,
          triggers: [
            {
              event: "strike",
              source: "self",
              effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
            },
          ],
        },
      ])
      .build();

    const attacker = thenBoard("first")[0];
    const hpBefore = thenHP("second");

    fireTrigger("strike", "first", { attackerUid: attacker.uid, attacker });

    expect(thenHP("second")).toBe(hpBefore - 1);
  });

  it("clash: gives self +2 ATK", () => {
    givenGameState({ seed: 1 })
      .withFirstBoard([
        {
          name: "ClashCard",
          type: "Follower",
          attack: 2,
          defense: 4,
          triggers: [
            {
              event: "clash",
              source: "self",
              effects: [
                { op: "stat", action: "give", target: "self", attack: 2 },
              ],
            },
          ],
        },
      ])
      .withSecondBoard([
        { name: "Defender", type: "Follower", attack: 1, defense: 3 },
      ])
      .build();

    const clashCard = thenBoard("first")[0];
    const attackBefore = clashCard.attack;

    fireTrigger("clash", "first", {
      attackerUid: clashCard.uid,
      attacker: clashCard,
    });

    const clashCardAfter = thenBoard("first").find(
      (c) => c.name === "ClashCard",
    );
    expect(clashCardAfter!.attack).toBe((attackBefore as number) + 2);
  });
});
