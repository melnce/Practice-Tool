/**
 * Trace runner — content-addressed card choice canonicalization (R7 O).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { state } from "../../src/core/gameState.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
} from "../harness/builders.js";
import {
  applySoakActionWithOutcome,
  prepareSoakReplay,
} from "../../src/bench/soakEnv.js";
import { canonicalizeTraceAction } from "../../src/bench/trace/traceCanonicalize.js";
import { toCanonicalState } from "../../src/bench/trace/canonicalState.js";
import { getHand } from "../../src/core/playerHelpers.js";

const ERNTZ = "10544110";
const RESOLUTE_DRAGONEWT = "10641110";

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  process.env.DISABLE_HISTORY = "1";
  await initCardDatabaseNode();
});

describe("trace content choice canonicalization", () => {
  it("maps duplicate hand choice to the lowest-position copy", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: true });
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const low = createCard(ERNTZ, "hand", "first");
    const high = createCard(ERNTZ, "hand", "first");
    state.players.first.hand = [low, high];

    const picked = {
      type: "CHOOSE_TARGET" as const,
      player: "first" as const,
      target: { type: "card" as const, uid: high.uid },
    };
    const canonical = canonicalizeTraceAction(picked, state);
    expect(canonical).toMatchObject({
      target: { type: "card", uid: low.uid },
    });
  });

  it("discarding remaps policy pick to match lowest-position replayer", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: true });
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand([RESOLUTE_DRAGONEWT, ERNTZ, ERNTZ])
      .withFirstPP(10, 10)
      .build();

    whenPlayCard("first", 0);
    const [low, high] = getHand(state, "first");
    expect(low).toBeTruthy();
    expect(high).toBeTruthy();
    expect(String(low!.id)).toBe(ERNTZ);
    expect(String(high!.id)).toBe(ERNTZ);
    expect(low!.uid).not.toBe(high!.uid);

    const canonical = canonicalizeTraceAction(
      {
        type: "CHOOSE_TARGET",
        player: "first",
        target: { type: "card", uid: high!.uid },
      },
      state,
    );
    applySoakActionWithOutcome(canonical);
    applySoakActionWithOutcome({ type: "CONFIRM_TARGETS" });

    const engineHand = toCanonicalState(state).players.a.hand.map(
      (h) => h.card,
    );

    const replayerHand = [low!, high!];
    replayerHand.splice(0, 1);
    const replayerCanon = replayerHand.map((c) => String(c.id));

    expect(engineHand).toEqual(replayerCanon);
  });
});
