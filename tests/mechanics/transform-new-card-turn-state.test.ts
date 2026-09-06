/**
 * Transform is a new card — turn/action state does not carry over (owner ruling 2026-09-06).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { resetHistory, setHistoryEnabled } from "../../src/core/history.js";
import { getBoard, getHand, getHP } from "../../src/core/playerHelpers.js";
import {
  installSoakAdapter,
  getLegalSoakActions,
  canonicalJson,
} from "../../src/bench/soakEnv.js";
import {
  deriveCanAttack,
  recomputeAttackFlags,
} from "../../src/logic/core/combat.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { injectAdapter } from "../../src/core/adapter.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import "../../src/logic/core/effects/index.js";

const SINCERITY = "10573310";
const ARA = "10534120";
const LIFESTEALER = "10553110";
const TITANIA = "10214110";
const AWED_INSPIRED = "10461210";
const FILLER = "10111310";
const DRAW_TOP = "10021110";

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

function allyFollower(
  name: string,
  atk: number,
  def: number,
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "first",
  );
  c.peak_defense = def;
  c.justPlayed = false;
  c.attacks_per_turn = 1;
  c.attacks_left = 1;
  c.attacks_used_this_turn = 0;
  c.hasAttacked = false;
  recomputeAttackFlags(c);
  getBoard(state, "first").push(c);
  return c;
}

function enemyFollower(name: string, atk: number, def: number) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  c.justPlayed = false;
  recomputeAttackFlags(c);
  getBoard(state, "second").push(c);
  return c;
}

function dispatchAttackFollower(
  attacker: { uid: string },
  defender: { uid: string; defense?: number | string },
): boolean {
  const defBefore = Number(defender.defense);
  engineDispatch(state, {
    type: "ATTACK",
    player: "first",
    attackerUid: attacker.uid,
    defender: { type: "follower", uid: defender.uid },
  });
  return Number(defender.defense) < defBefore;
}

function dispatchAttackLeader(attacker: { uid: string }): boolean {
  const hpBefore = getHP(state, "second");
  engineDispatch(state, {
    type: "ATTACK",
    player: "first",
    attackerUid: attacker.uid,
    defender: { type: "leader", player: "second" },
  });
  return getHP(state, "second") < hpBefore;
}

function amuletIndex(name: string): number {
  return state.players.first.board.findIndex((c) => c.name === name);
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("transform new card — fresh turn state (owner ruling 2026-09-06)", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    resetHistory();
    installSoakAdapter({ interactiveModes: false });
  });

  it("(a) Sincerity: allied follower attacked then transformed to Imari's Little Buddies can Rush-attack follower not leader", () => {
    givenGameState({ seed: 10573310, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstHand([SINCERITY])
      .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const ally = allyFollower("Ally", 3, 3);
    const wall = enemyFollower("Wall", 1, 5);
    enemyFollower("Bystander", 2, 5);

    expect(dispatchAttackFollower(ally, wall)).toBe(true);
    expect(ally.hasAttacked).toBe(true);
    expect(ally.attacks_left).toBe(0);

    const spellIdx = getHand(state, "first").findIndex(
      (c) => c.id === SINCERITY,
    );
    whenPlayCard("first", spellIdx);
    resolvePendingTarget(ally.uid);

    const buddies = getBoard(state, "first").find((c) => c.uid === ally.uid)!;
    expect(buddies.name).toBe("Imari's Little Buddies");
    expect(buddies.hasRush).toBe(true);
    expect(buddies.justPlayed).toBe(true);
    expect(buddies.hasAttacked).toBe(false);
    expect(buddies.can_attack).toBe(true);
    expect(deriveCanAttack(buddies)).toBe(true);

    const legal = captureAttackLegality();
    expect(legal).toContain(buddies.uid);
    expect(dispatchAttackFollower(buddies, getBoard(state, "second")[1]!)).toBe(
      true,
    );
    expect(dispatchAttackLeader(buddies)).toBe(false);
  });

  it("(b) Ara evolve: ally that already attacked becomes Regal Falcon (Storm) and can attack leader", () => {
    givenGameState({ seed: 90061130, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .withFirstHand([ARA])
      .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.players.first.evoPoints = 2;
    state.players.first.evoCharges = 2;

    const ally = allyFollower("Ally", 3, 3);
    const wall = enemyFollower("Wall", 2, 5);
    expect(dispatchAttackFollower(ally, wall)).toBe(true);

    whenPlayCard("first", 0);
    resolvePendingTarget(getBoard(state, "second")[0]!.uid);
    const ara = findOnBoard("first", "Ara, Dawnblossom")!;
    whenEvolve(ara, "first");
    resolvePendingTarget(ally.uid);

    const falcon = getBoard(state, "first").find((c) => c.uid === ally.uid)!;
    expect(falcon.name).toBe("Regal Falcon");
    expect(falcon.hasStorm).toBe(true);
    expect(falcon.justPlayed).toBe(true);
    expect(falcon.hasAttacked).toBe(false);
    expect(falcon.can_attack).toBe(true);
    expect(deriveCanAttack(falcon)).toBe(true);
    expect(captureAttackLegality()).toContain(falcon.uid);
    expect(dispatchAttackLeader(falcon)).toBe(true);
  });

  it("(c) new-card rule: Lifestealer fanfare turns untouched ally into Skeleton — cannot attack this turn (owner unsure)", () => {
    givenGameState({ seed: 10553110, activePlayer: "first", roundCount: 10 })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .withFirstHand([LIFESTEALER])
      .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const ally = allyFollower("Ally", 3, 3);
    enemyFollower("Foe", 2, 5);

    whenPlayCard("first", 0);
    const skel = getBoard(state, "first").find((c) => c.uid === ally.uid)!;
    expect(skel.name).toBe("Skeleton");
    expect(skel.justPlayed).toBe(true);
    expect(skel.hasStorm).toBeFalsy();
    expect(skel.hasRush).toBeFalsy();
    expect(skel.can_attack).toBe(false);
    expect(deriveCanAttack(skel)).toBe(false);
    expect(captureAttackLegality()).not.toContain(skel.uid);
  });

  it("(d) Titania evolve: enemy transformed to Fairy can attack on opponent next turn", () => {
    givenGameState({ seed: 10214110, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstHand([TITANIA])
      .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.players.first.evoPoints = 2;
    state.players.first.evoCharges = 2;

    const foe = enemyFollower("Foe", 2, 5);
    whenPlayCard("first", 0);
    const titania = findOnBoard("first", "Titania, Queen of Fairies")!;
    whenEvolve(titania, "first");
    resolvePendingTarget(foe.uid);

    const fairy = getBoard(state, "second").find((c) => c.uid === foe.uid)!;
    expect(fairy.name).toBe("Fairy");
    expect(fairy.justPlayed).toBe(true);
    expect(fairy.hasRush).toBe(true);

    whenEndTurn();
    expect(state.activePlayer).toBe("second");
    expect(fairy.justPlayed).toBe(false);
    expect(fairy.can_attack).toBe(true);
    expect(deriveCanAttack(fairy)).toBe(true);
  });

  it("(e) Awed and Inspired: transformed amulet result can Engage this turn when PP allows", () => {
    givenGameState({ seed: 10461210, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstHand([AWED_INSPIRED])
      .withFirstDeck([DRAW_TOP, ...Array.from({ length: 24 }, () => FILLER)])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const ally1 = allyFollower("TransformTarget", 2, 2);
    const ally2 = allyFollower("SecondTarget", 2, 2);
    whenPlayCard("first", 0);
    engageAmulet("first", amuletIndex("Awed and Inspired"));
    resolvePendingTarget(ally1.uid);

    const resultIdx = amuletIndex("Awed and Inspired");
    expect(resultIdx).toBeGreaterThanOrEqual(0);
    const result = state.players.first.board[resultIdx]!;
    expect(result.uid).toBe(ally1.uid);
    expect(result.keywordState?.engagedThisTurn).toBeFalsy();

    engageAmulet("first", resultIdx);
    resolvePendingTarget(ally2.uid);
    expect(
      state.players.first.board.some(
        (c) => c.name === "Awed and Inspired" && c.uid === ally2.uid,
      ),
    ).toBe(true);
  });

  it("(f) undo/redo across (a) keeps legal ATTACK list identical", () => {
    injectAdapter({
      render: () => {},
      showChoiceModal: () => {},
      showTargetConfirmationButton: () => {},
      hideTargetConfirmation: () => {},
    });

    givenGameState({ seed: 10573311, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstHand([SINCERITY])
      .withFirstDeck(Array.from({ length: 25 }, () => FILLER))
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const ally = allyFollower("Ally", 3, 3);
    const wall = enemyFollower("Wall", 1, 5);
    enemyFollower("Bystander", 2, 5);
    dispatchAttackFollower(ally, wall);

    const spell = getHand(state, "first").find((c) => c.id === SINCERITY)!;
    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: spell.uid,
    });
    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: ally.uid },
    });

    const buddies = getBoard(state, "first").find((c) => c.uid === ally.uid)!;
    expect(buddies.name).toBe("Imari's Little Buddies");
    expect(buddies.can_attack).toBe(true);
    expect(state.pendingTargetEffect).toBeUndefined();

    const legalAfterTransform = captureAttackLegality();
    expect(legalAfterTransform).not.toBe("[]");

    engineDispatch(state, { type: "UNDO" });
    installSoakAdapter({ interactiveModes: false });
    const legalAfterUndo = captureAttackLegality();

    engineDispatch(state, { type: "REDO" });
    installSoakAdapter({ interactiveModes: false });
    const legalAfterRedo = captureAttackLegality();

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(legalAfterRedo).toBe(legalAfterTransform);
    expect(legalAfterUndo).not.toBe(legalAfterTransform);
  });

  it("(g) attack-flags: transform reset keeps can_attack aligned with deriveCanAttack", () => {
    givenGameState({ seed: 4243, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withSecondPP(6, 6)
      .withFirstHand([SINCERITY])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const ally = allyFollower("Ally", 3, 3);
    dispatchAttackFollower(ally, enemyFollower("Wall", 1, 5));

    const spellIdx = getHand(state, "first").findIndex(
      (c) => c.id === SINCERITY,
    );
    whenPlayCard("first", spellIdx);
    resolvePendingTarget(ally.uid);

    const buddies = getBoard(state, "first").find((c) => c.uid === ally.uid)!;
    expect(buddies.can_attack).toBe(deriveCanAttack(buddies));
    expect(buddies.can_attack).toBe(true);
  });
});
