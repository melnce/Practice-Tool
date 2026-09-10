/**
 * Soak enumerator — attack legality matches combat module (evolve-on-play-turn).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { state } from "../../src/core/gameState.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
} from "../harness/builders.js";
import { whenEvolve } from "../harness/whenEvolve.js";
import {
  getLegalSoakActions,
  prepareSoakReplay,
} from "../../src/bench/soakEnv.js";
import { getLegalNeutralActions } from "../../src/bench/trace/neutralAction.js";
import { getBoard } from "../../src/core/playerHelpers.js";

const STRAY_BEASTMAN = "10011120";
const STORM_FOLLOWER = "10021110";

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  process.env.DISABLE_HISTORY = "1";
  await initCardDatabaseNode();
});

function attackActions(legal: ReturnType<typeof getLegalNeutralActions>) {
  return legal.filter((a) => "attack" in a);
}

describe("soak attack enumeration", () => {
  it("offers follower attacks but not leader after play + evolve same turn", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: false });
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstHand([STRAY_BEASTMAN])
      .withFirstPP(10, 10)
      .build();
    state.players.first.evoCharges = 2;

    const enemy = createCard(
      { name: "Dummy", type: "Follower", cost: 1, attack: 0, defense: 5 },
      "board",
      "second",
    );
    state.players.second.board = [enemy];

    whenPlayCard("first", 0);
    const beast = getBoard(state, "first").find(
      (c) => c?.id === STRAY_BEASTMAN,
    )!;
    whenEvolve(beast, "first");

    const soakLegal = getLegalSoakActions();
    expect(
      soakLegal.some(
        (a) =>
          a.type === "ATTACK" &&
          a.attackerUid === beast.uid &&
          a.defender.type === "card",
      ),
    ).toBe(true);
    expect(
      soakLegal.some(
        (a) =>
          a.type === "ATTACK" &&
          a.attackerUid === beast.uid &&
          a.defender.type === "leader",
      ),
    ).toBe(false);

    const neutralLegal = attackActions(getLegalNeutralActions(state));
    const beastSlot = getBoard(state, "first").indexOf(beast);
    expect(
      neutralLegal.some(
        (a) =>
          a.attack.attacker_slot === beastSlot &&
          typeof a.attack.target === "object" &&
          "slot" in a.attack.target,
      ),
    ).toBe(true);
    expect(
      neutralLegal.some(
        (a) =>
          a.attack.attacker_slot === beastSlot && a.attack.target === "leader",
      ),
    ).toBe(false);
  });

  it("offers leader attack on play turn for Storm", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: false });
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand([STORM_FOLLOWER])
      .withFirstPP(10, 10)
      .build();

    whenPlayCard("first", 0);
    const storm = getBoard(state, "first").find(
      (c) => c?.id === STORM_FOLLOWER,
    )!;

    const soakLegal = getLegalSoakActions();
    expect(
      soakLegal.some(
        (a) =>
          a.type === "ATTACK" &&
          a.attackerUid === storm.uid &&
          a.defender.type === "leader",
      ),
    ).toBe(true);

    const neutralLegal = attackActions(getLegalNeutralActions(state));
    const stormSlot = getBoard(state, "first").indexOf(storm);
    expect(
      neutralLegal.some(
        (a) =>
          a.attack.attacker_slot === stormSlot && a.attack.target === "leader",
      ),
    ).toBe(true);
  });
});
