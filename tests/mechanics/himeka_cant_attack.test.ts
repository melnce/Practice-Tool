/**
 * Himeka crest "Can't attack" lifecycle (rulebook Main Phase attacking §138–140;
 * card text: Crest Himeka, Heir to Repose).
 *
 * Crest text: at end of your turn, if allied Himeka is on the field, give X random
 * enemy followers with ≤4 attack "Can't attack followers or leaders" until
 * opponent's end of turn, then banish them (X = crest count).
 *
 * Attack-permission primitives exercised here:
 * - Temporary "Can't Attack" must block swings while active
 * - After "until opponent's end of turn" expires, the follower may attack again
 *   on its next turn (unless banished / summoning-sick / no Rush|Storm on play turn)
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getCrests, getBoard } from "../../src/core/playerHelpers.js";
import { endTurnBlue, endTurnRed } from "../../src/logic/core/turns.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { applyKeyword } from "../../src/logic/core/keywords/apply.js";
import { getKS } from "../../src/logic/core/keywords/internal.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { getBanish } from "../../src/core/playerHelpers.js";

function setupLateGame() {
  givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: 7,
  })
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .build();
  state.gameStarted = true;
  state.activePlayer = "first";
}

describe("Himeka can't-attack crest / temporary lock", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("Himeka Fanfare gains crest; crest EOT locks ≤4-ATK enemies so they cannot attack", () => {
    setupLateGame();
    const himeka = createCard("10364110", "hand", "first");
    state.players.first.hand = [himeka];
    // Enemy already in play (no summoning sickness next turn)
    const foe = createCard(
      {
        name: "LockedFoe",
        type: "Follower",
        cost: 2,
        attack: 3,
        defense: 5,
      },
      "board",
      "second",
    );
    foe.justPlayed = false;
    foe.peak_defense = 5;
    state.players.second.board = [foe];

    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Himeka, Heir to Repose",
      ),
    ).toBe(true);
    expect(findOnBoard("first", "Himeka, Heir to Repose")).toBeTruthy();

    // Crest fires at P1 EOT → lock foe
    endTurnBlue();
    expect(state.activePlayer).toBe("second");

    const locked = getBoard(state, "second").find(
      (c) => c.name === "LockedFoe",
    );
    expect(locked).toBeTruthy();
    // Single source of truth: keywordState (not root mirrors)
    expect(getKS(locked!).cantAttack).toBe(true);
    expect(getKS(locked!).cantAttackUntilOpponentEOT).toBe(true);

    // Place a P1 target and attempt attack — must be blocked (rulebook §138)
    const bait = createCard(
      {
        name: "Bait",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 5,
      },
      "board",
      "first",
    );
    bait.peak_defense = 5;
    state.players.first.board.push(bait);
    const baitDefBefore = Number(bait.defense);

    attackFollower(0, state.players.first.board.length - 1, "second", "first");
    expect(Number(bait.defense)).toBe(baitDefBefore);
    expect(locked!.hasAttacked).toBeFalsy();
  });

  it("temporary Can't Attack until opponent EOT blocks the turn, then expires so the follower can attack again", () => {
    // Isolates the duration primitive Himeka's crest uses (without the banish tail).
    // Bible: ready followers may attack once per turn (§138); a text lock overrides that
    // only while active; after expiry, normal attack permissions resume.
    setupLateGame();

    const ally = createCard(
      {
        name: "CasterAlly",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 3,
      },
      "board",
      "first",
    );
    ally.peak_defense = 3;
    ally.justPlayed = false;
    state.players.first.board = [ally];

    const foe = createCard(
      {
        name: "TempLocked",
        type: "Follower",
        cost: 2,
        attack: 4,
        defense: 5,
      },
      "board",
      "second",
    );
    foe.peak_defense = 5;
    foe.justPlayed = false;
    foe.attacks_left = 1;
    foe.can_attack = true;
    state.players.second.board = [foe];

    // Apply the same duration Himeka crest uses: until opponent's end of turn
    applyKeyword(foe, "Can't Attack", {
      until_opponent_eot: true,
      request_owner: "first",
    });
    expect(getKS(foe).cantAttack).toBe(true);
    expect(getKS(foe).cantAttackUntilOpponentEOT).toBe(true);

    // P1 ends → P2 turn starts; refresh must keep the lock (cannot attack)
    endTurnBlue();
    expect(state.activePlayer).toBe("second");
    const onP2Turn = getBoard(state, "second")[0]!;
    expect(onP2Turn.can_attack).toBe(false);

    const defBefore = Number(ally.defense);
    attackFollower(0, 0, "second", "first");
    expect(Number(ally.defense)).toBe(defBefore);

    // P2 ends → lock should expire (until opponent's EOT has elapsed)
    endTurnRed();
    expect(state.activePlayer).toBe("first");
    expect(getKS(onP2Turn).cantAttack).toBeFalsy();
    expect(getKS(onP2Turn).cantAttackUntilOpponentEOT).toBeFalsy();

    // P1 ends → P2's next turn: follower must be able to attack again
    endTurnBlue();
    expect(state.activePlayer).toBe("second");
    const refreshed = getBoard(state, "second")[0]!;
    expect(refreshed.justPlayed).toBeFalsy();
    expect(refreshed.can_attack).toBe(true);

    attackFollower(0, 0, "second", "first");
    expect(Number(ally.defense)).toBeLessThan(defBefore);
  });

  it("crest EOT lock then banishes the locked enemy at their end of turn (card text banish tail)", () => {
    // Crest text: give Can't Attack until opponent's EOT, then banish them.
    // Engine models the banish as grant_trigger end_of_turn_own on the locked
    // follower (fires when that follower's owner ends their turn).
    setupLateGame();
    const himeka = createCard("10364110", "hand", "first");
    state.players.first.hand = [himeka];

    const foe = createCard(
      {
        name: "BanishFoe",
        type: "Follower",
        cost: 2,
        attack: 3,
        defense: 5,
      },
      "board",
      "second",
    );
    foe.justPlayed = false;
    foe.peak_defense = 5;
    foe.uid = "banish-foe";
    state.players.second.board = [foe];

    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Himeka, Heir to Repose",
      ),
    ).toBe(true);

    // P1 EOT → crest locks the ≤4-ATK enemy and grants delayed banish
    endTurnBlue();
    expect(state.activePlayer).toBe("second");
    const locked = getBoard(state, "second").find(
      (c) => c.uid === "banish-foe",
    );
    expect(locked).toBeTruthy();
    // Single source of truth: keywordState (not root mirrors)
    expect(getKS(locked!).cantAttack).toBe(true);
    expect(getKS(locked!).cantAttackUntilOpponentEOT).toBe(true);
    expect(
      (locked!.triggers || []).some(
        (t: any) =>
          t?.type === "end_of_turn_own" &&
          JSON.stringify(t.effects || []).includes('"banish"'),
      ),
    ).toBe(true);

    // P2 EOT → delayed banish must fire (not merely clear the lock)
    endTurnRed();
    expect(state.activePlayer).toBe("first");
    expect(getBoard(state, "second").some((c) => c.uid === "banish-foe")).toBe(
      false,
    );
    expect(getBanish(state, "second").some((c) => c.uid === "banish-foe")).toBe(
      true,
    );
  });

  it("evolving grants Rush-like follower attacks but not leader (rulebook §145) — sanity for Himeka herself", () => {
    // Himeka has no Rush/Storm; after play she is summoning-sick. Evolving
    // (or super-evolving) must allow follower attacks only, not the leader.
    setupLateGame();
    state.players.first.evoCharges = 2;
    state.players.first.evoPoints = 2;
    const himeka = createCard("10364110", "hand", "first");
    state.players.first.hand = [himeka];
    const foe = createCard(
      {
        name: "EvoTarget",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 8,
      },
      "board",
      "second",
    );
    foe.peak_defense = 8;
    state.players.second.board = [foe];

    whenPlayCard("first", 0);
    const onBoard = findOnBoard("first", "Himeka, Heir to Repose")!;
    expect(onBoard.justPlayed).toBe(true);
    expect(onBoard.can_attack).toBeFalsy();

    // Player evolve path (stats + Rush-like permission + script)
    handleEvolveSelf(onBoard, "first", {
      mode: "normal",
      spendPoint: true,
      runEvoEffects: true,
    });
    expect(onBoard.hasEvolved || onBoard.evoType).toBeTruthy();
    expect(onBoard.can_attack).toBe(true);
    expect(onBoard.hasRush || onBoard.isRush).toBeTruthy();

    const foeDef = Number(foe.defense);
    attackFollower(0, 0, "first", "second");
    expect(Number(foe.defense)).toBeLessThan(foeDef);

    const hpBefore = state.players.second.hp;
    attackLeader(0, "first", "second");
    // Without Storm, evolve must not enable leader attack on play turn (§145 / §352)
    expect(state.players.second.hp).toBe(hpBefore);
  });
});
