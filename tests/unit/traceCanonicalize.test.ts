/**
 * Trace runner — content-addressed card choice canonicalization (R7 O / R10 Q).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { state } from "../../src/core/gameState.js";
import { dispatch } from "../../src/engine.js";
import { injectAdapter } from "../../src/core/adapter.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
} from "../harness/builders.js";
import {
  applySoakActionWithOutcome,
  getLegalSoakActions,
  prepareSoakReplay,
} from "../../src/bench/soakEnv.js";
import { canonicalizeTraceAction } from "../../src/bench/trace/traceCanonicalize.js";
import { toCanonicalState } from "../../src/bench/trace/canonicalState.js";
import { getHand } from "../../src/core/playerHelpers.js";

const ERNTZ = "10544110";
const RESOLUTE_DRAGONEWT = "10641110";
const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  process.env.DISABLE_HISTORY = "1";
  await initCardDatabaseNode();
});

describe("trace content choice canonicalization", () => {
  beforeEach(() => {
    injectAdapter({
      render: () => {},
      showChoiceModal: () => {},
      showTargetConfirmationButton: () => {},
      hideTargetConfirmation: () => {},
    });
  });

  it("maps duplicate hand choice to the lowest-position offered copy", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: true });
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const low = createCard(ERNTZ, "hand", "first");
    const high = createCard(ERNTZ, "hand", "first");
    state.players.first.hand = [low, high];
    state.pendingTargetEffect = {
      owner: "first",
      pool: [low, high],
      poolUids: [low.uid, high.uid],
      targetUids: [],
      selectCount: 1,
    };

    const legal = getLegalSoakActions();
    const picked = {
      type: "CHOOSE_TARGET" as const,
      player: "first" as const,
      target: { type: "card" as const, uid: high.uid },
    };
    const canonical = canonicalizeTraceAction(picked, state, {
      legalSoakActions: legal,
    });
    expect(canonical).toMatchObject({
      target: { type: "card", uid: low.uid },
    });
    state.pendingTargetEffect = undefined;
  });

  it("fuse partner remap ignores host when it is the lowest copy of that id", () => {
    prepareSoakReplay({ fuse: true, interactiveModes: true });
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([GEAR_AMBITION, GEAR_REMEMBRANCE])
      .build();
    state.gameStarted = true;
    state.phase = "main";

    const hand = getHand(state, "first");
    const host = hand.find((c) => c.id === GEAR_AMBITION)!;
    const partner = hand.find((c) => c.id === GEAR_REMEMBRANCE)!;
    const decoy = createCard(GEAR_AMBITION, "hand", "first");
    state.players.first.hand = [host, decoy, partner];

    dispatch(state, { type: "FUSE", player: "first", cardUid: host.uid });
    const legal = getLegalSoakActions();
    const picked = {
      type: "CHOOSE_TARGET" as const,
      player: "first" as const,
      target: { type: "card" as const, uid: partner.uid },
    };
    const canonical = canonicalizeTraceAction(picked, state, {
      legalSoakActions: legal,
    });
    expect(canonical.target).toEqual({ type: "card", uid: partner.uid });
    expect(canonical.target.uid).not.toBe(host.uid);
    expect(canonical.target.uid).not.toBe(decoy.uid);
    state.pendingTargetEffect = undefined;
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

    const legal = getLegalSoakActions();
    const canonical = canonicalizeTraceAction(
      {
        type: "CHOOSE_TARGET",
        player: "first",
        target: { type: "card", uid: high!.uid },
      },
      state,
      { legalSoakActions: legal },
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
