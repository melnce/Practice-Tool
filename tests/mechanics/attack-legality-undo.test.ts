/**
 * Attack eligibility follows current keywords; can_attack must match deriveCanAttack.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  resetUidCounter,
  whenPlayCard,
  whenRunEffects,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import {
  redo,
  resetHistory,
  setHistoryEnabled,
  undo,
} from "../../src/core/history.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  getLegalSoakActions,
  canonicalJson,
} from "../../src/bench/soakEnv.js";
import { deriveCanAttack } from "../../src/logic/core/combat.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

const IMARI = "10574120";
const IMARI_BUDDIES = "90074140";
const FILLER = "10111310";
const SPELL_1A = "10571310";
const ARA = "10534120";
const BRAZEN_BROADCASTER = "10773110";
const ANALYZING_ARTIFACT = "90071130";

const RUSH_FOLLOWER = {
  name: "RushFollower",
  type: "Follower" as const,
  cost: 2,
  attack: 2,
  defense: 2,
  hasRush: true,
};

function captureAttackLegality(): string {
  return canonicalJson(
    getLegalSoakActions()
      .filter((a) => a.type === "ATTACK")
      .map((a) => ({
        type: "ATTACK" as const,
        player: a.player,
        attackerUid: a.attackerUid,
        defender: a.defender,
      }))
      .sort((a, b) =>
        `${a.attackerUid}:${JSON.stringify(a.defender)}`.localeCompare(
          `${b.attackerUid}:${JSON.stringify(b.defender)}`,
        ),
      ),
  );
}

function setupRushPlayTest(seed: number) {
  givenGameState({ seed, activePlayer: "first", roundCount: 6 })
    .withFirstPP(6, 6)
    .withSecondPP(6, 6)
    .withFirstHand([RUSH_FOLLOWER])
    .withSecondBoard([
      { name: "Wall", type: "Follower", cost: 2, attack: 1, defense: 5 },
    ])
    .build();
  state.gameStarted = true;
  state.phase = "main";
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("attack eligibility follows current keywords", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    installSoakAdapter({ interactiveModes: false });
  });

  it("silence on a Rush follower played this turn removes it from legal ATTACK (undo/redo stable)", () => {
    setupRushPlayTest(77);
    whenPlayCard("first", 0);
    const rush = findOnBoard("first", "RushFollower")!;
    expect(rush.justPlayed).toBe(true);
    expect(rush.hasRush).toBe(true);
    expect(captureAttackLegality()).toContain(rush.uid);

    whenRunEffects(
      [{ op: "keyword", action: "silence", target: "ally:follower" }],
      "first",
    );

    expect(rush.hasRush).toBe(false);
    expect(rush.can_attack).toBe(false);
    expect(deriveCanAttack(rush)).toBe(false);
    const legalAfterSilence = captureAttackLegality();
    expect(legalAfterSilence).not.toContain(rush.uid);

    engineDispatch(state, { type: "END_TURN", player: "first" });
    const legalAfterEnd = captureAttackLegality();

    undo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterSilence);
    redo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterEnd);
  });

  it("keyword remove rush on a follower played this turn removes it from legal ATTACK (undo/redo stable)", () => {
    setupRushPlayTest(88);
    whenPlayCard("first", 0);
    const rush = findOnBoard("first", "RushFollower")!;
    expect(captureAttackLegality()).toContain(rush.uid);

    whenRunEffects(
      [
        {
          op: "keyword",
          action: "remove",
          target: "ally:follower",
          keywords: ["Rush"],
        },
      ],
      "first",
    );

    expect(rush.hasRush).toBe(false);
    expect(rush.can_attack).toBe(false);
    const legalAfterRemove = captureAttackLegality();
    expect(legalAfterRemove).not.toContain(rush.uid);

    engineDispatch(state, { type: "END_TURN", player: "first" });
    const legalAfterEnd = captureAttackLegality();

    undo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterRemove);
    redo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterEnd);
  });

  it("attacks_per_turn after a leader attack restores legal ATTACK (undo/redo stable)", () => {
    givenGameState({ seed: 301, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstBoard([
        {
          name: "Attacker",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
          justPlayed: false,
          can_attack: true,
          attacks_left: 1,
          attacks_per_turn: 1,
          hasAttacked: false,
        },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const attacker = findOnBoard("first", "Attacker")!;
    expect(captureAttackLegality()).toContain(attacker.uid);

    engineDispatch(state, {
      type: "ATTACK",
      player: "first",
      attackerUid: attacker.uid,
      defender: { type: "leader", player: "second" },
    });

    expect(attacker.attacks_left).toBe(0);
    expect(attacker.hasAttacked).toBe(true);
    const legalAfterAttack = captureAttackLegality();
    expect(legalAfterAttack).not.toContain(attacker.uid);

    whenRunEffects([{ op: "attacks_per_turn", value: 2 }], "first", attacker);

    expect(attacker.attacks_left).toBe(1);
    expect(attacker.hasAttacked).toBe(false);
    expect(attacker.can_attack).toBe(true);
    expect(deriveCanAttack(attacker)).toBe(true);
    const legalAfterGrant = captureAttackLegality();
    expect(legalAfterGrant).toContain(attacker.uid);

    engineDispatch(state, { type: "END_TURN", player: "first" });
    const legalAfterEnd = captureAttackLegality();

    undo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterGrant);
    redo({ autoRender: false });
    expect(captureAttackLegality()).toBe(legalAfterEnd);
  });

  it("evolved Imari spell-summoned Rush token (90074140) is in legal ATTACK same turn", () => {
    givenGameState({ seed: 90074140, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstHand([IMARI, FILLER, SPELL_1A])
      .withFirstDeck([
        FILLER,
        SPELL_1A,
        ...Array.from({ length: 23 }, () => FILLER),
      ])
      .withSecondBoard([
        { name: "Wall", type: "Follower", cost: 2, attack: 1, defense: 5 },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.players.first.evoPoints = 2;
    state.players.first.evoCharges = 2;

    whenPlayCard("first", 0);
    resolvePendingTarget(
      getHand(state, "first").find((c) => c.id === FILLER)!.uid,
    );
    const imari = findOnBoard("first", "Imari, Dewdrop")!;
    whenEvolve(imari, "first");
    const spellIdx = getHand(state, "first").findIndex(
      (c) => c.id === SPELL_1A,
    );
    whenPlayCard("first", spellIdx);

    const token = findOnBoard("first", "Imari's Little Buddies")!;
    expect(token.hasRush).toBe(true);
    expect(token.justPlayed).toBe(true);
    expect(token.can_attack).toBe(true);
    expect(deriveCanAttack(token)).toBe(true);
    expect(captureAttackLegality()).toContain(token.uid);
  });

  it("Ara evolve transform into Regal Falcon (Storm) is in legal ATTACK same turn", () => {
    givenGameState({ seed: 90061130, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .withFirstHand([ARA])
      .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
      .withSecondBoard([
        { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
      ])
      .withFirstBoard([
        {
          name: "TransformTarget",
          type: "Follower",
          cost: 2,
          attack: 3,
          defense: 3,
        },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.players.first.evoPoints = 2;
    state.players.first.evoCharges = 2;

    whenPlayCard("first", 0);
    resolvePendingTarget(getBoard(state, "second")[0]!.uid);
    const ara = findOnBoard("first", "Ara, Dawnblossom")!;
    const target = getBoard(state, "first").find(
      (c) => c.name === "TransformTarget",
    )!;
    whenEvolve(ara, "first");

    const falcon = getBoard(state, "first").find((c) => c.uid === target.uid)!;
    expect(falcon.hasStorm).toBe(true);
    expect(falcon.justPlayed).toBe(true);
    expect(falcon.can_attack).toBe(true);
    expect(deriveCanAttack(falcon)).toBe(true);
    expect(captureAttackLegality()).toContain(falcon.uid);
  });

  it("Brazen Broadcaster fanfare Analyzing Artifact (Rush granted on enter) is in legal ATTACK same turn", () => {
    givenGameState({ seed: 90071130, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstHand([BRAZEN_BROADCASTER])
      .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
      .withSecondBoard([
        { name: "Wall", type: "Follower", cost: 2, attack: 1, defense: 5 },
      ])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);
    const analyzing = findOnBoard("first", "Analyzing Artifact")!;
    expect(analyzing.hasRush).toBe(true);
    expect(analyzing.justPlayed).toBe(true);
    expect(analyzing.can_attack).toBe(true);
    expect(deriveCanAttack(analyzing)).toBe(true);
    expect(captureAttackLegality()).toContain(analyzing.uid);
  });
});

describe("attack-flags soak fixture pin", () => {
  it("silence on just-played Rush follower keeps can_attack aligned with deriveCanAttack", () => {
    setupRushPlayTest(4242);
    whenPlayCard("first", 0);
    const onBoard = findOnBoard("first", "RushFollower")!;
    whenRunEffects(
      [{ op: "keyword", action: "silence", target: "ally:follower" }],
      "first",
    );
    expect(onBoard.can_attack).toBe(deriveCanAttack(onBoard));
    expect(onBoard.can_attack).toBe(false);
    expect(getBoard(state, "first")).toContain(onBoard);
  });
});
