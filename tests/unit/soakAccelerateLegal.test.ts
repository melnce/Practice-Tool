/**
 * Soak enumerator — Accelerate/Crystallize plays when printed cost exceeds PP.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { getGlobalCardIndex } from "../../src/data/cardIndex.js";
import { makeCardFromDB } from "../../src/logic/effects/ops/summon_ops/core.js";
import { state } from "../../src/core/gameState.js";
import { givenGameState } from "../harness/builders.js";
import {
  getLegalSoakActions,
  applySoakActionWithOutcome,
  prepareSoakReplay,
} from "../../src/bench/soakEnv.js";
import { getLegalNeutralActions } from "../../src/bench/trace/neutralAction.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";

const LUMIORE_ID = "10844120";

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  process.env.DISABLE_HISTORY = "1";
  await initCardDatabaseNode();
});

function lumioreInHand(): ReturnType<typeof makeCardFromDB> {
  const tpl = getGlobalCardIndex()?.byId.get(LUMIORE_ID);
  if (!tpl) throw new Error(`missing card ${LUMIORE_ID}`);
  return makeCardFromDB(tpl, "first");
}

describe("soak Accelerate/Crystallize enumeration", () => {
  it("offers Accelerate play at 3 PP when printed cost is 8", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: false });
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const lumiore = lumioreInHand();
    state.players.first.pp = 3;
    state.players.first.maxPP = 3;
    state.players.first.hand = [lumiore];

    const soakLegal = getLegalSoakActions();
    expect(
      soakLegal.some(
        (a) => a.type === "PLAY_CARD" && a.cardUid === lumiore.uid,
      ),
    ).toBe(true);

    const neutralLegal = getLegalNeutralActions(state);
    expect(
      neutralLegal.some(
        (a) =>
          "play" in a &&
          a.play.card === LUMIORE_ID &&
          a.play.hand_pos === 0 &&
          a.play.player === "a",
      ),
    ).toBe(true);
  });

  it("Accelerate resolves as a spell (not on field); normal play at 8 PP", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: false });
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const lumiore = lumioreInHand();
    state.players.first.pp = 3;
    state.players.first.maxPP = 3;
    state.players.first.hand = [lumiore];

    applySoakActionWithOutcome({
      type: "PLAY_CARD",
      player: "first",
      cardUid: lumiore.uid,
    });
    expect(getHand(state, "first")).toHaveLength(0);
    expect(getBoard(state, "first")).toHaveLength(0);
    expect(state.players.first.pp).toBe(0);

    const lumiore2 = lumioreInHand();
    state.players.first.pp = 8;
    state.players.first.maxPP = 8;
    state.players.first.hand = [lumiore2];

    applySoakActionWithOutcome({
      type: "PLAY_CARD",
      player: "first",
      cardUid: lumiore2.uid,
    });
    expect(getHand(state, "first")).toHaveLength(0);
    expect(getBoard(state, "first")).toHaveLength(1);
    expect(getBoard(state, "first")[0]?.id).toBe(LUMIORE_ID);
    expect(state.players.first.pp).toBe(0);
  });
});
