/**
 * fuse.partner_pos must list only consumed partners (banished), not UI toggles.
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import {
  givenGameState,
  resetUidCounter,
  createCard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { dispatch } from "../../src/engine.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { setHistoryEnabled } from "../../src/core/history.js";
import { getHand } from "../../src/core/playerHelpers.js";
import {
  banishUidSet,
  deriveFusePartnerPositions,
} from "../../src/bench/trace/fusePartnerDerive.js";

const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";
const OMINOUS_ALPHA = "90073110";
const OMINOUS_BETA = "90073120";
const OMINOUS_GAMMA = "90073130";

function mountAdapter() {
  injectAdapter({
    render: () => {},
    showChoiceModal: () => {},
    showTargetConfirmationButton: () => {},
    hideTargetConfirmation: () => {},
  });
}

function partnerPositionsAfterFuse(
  player: "first" | "second",
  hostUid: string,
  handUidsBefore: string[],
  banishBefore: Set<string>,
): number[] {
  const hostPos = handUidsBefore.findIndex((uid) => uid === hostUid);
  return deriveFusePartnerPositions(
    handUidsBefore,
    hostPos < 0 ? 0 : hostPos,
    banishBefore,
    banishUidSet(state.players[player].banish),
  );
}

beforeAll(async () => {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();
});

describe("deriveFusePartnerPositions", () => {
  it("lists only newly banished hand cards excluding host, ascending", () => {
    const hand = ["host", "a", "b", "c"];
    const before = new Set(["old"]);
    const after = new Set(["old", "a", "c"]);
    expect(deriveFusePartnerPositions(hand, 0, before, after)).toEqual([1, 3]);
  });
});

describe("fuse.partner_pos integration", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(true);
    mountAdapter();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("one partner fuse emits exactly that hand position", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([GEAR_AMBITION, GEAR_REMEMBRANCE])
      .build();
    const handBefore = getHand(state, "first");
    const handUidsBefore = handBefore.map((c) => c?.uid ?? "");
    const host = handBefore.find((c) => c.id === GEAR_AMBITION)!;
    const partner = handBefore.find((c) => c.id === GEAR_REMEMBRANCE)!;
    const banishBefore = banishUidSet(state.players.first.banish);

    dispatch(state, { type: "FUSE", player: "first", cardUid: host.uid });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: partner.uid },
    });
    dispatch(state, { type: "CONFIRM_TARGETS" });

    expect(
      partnerPositionsAfterFuse(
        "first",
        host.uid,
        handUidsBefore,
        banishBefore,
      ),
    ).toEqual([1]);
  });

  it("partner toggle-off is not recorded", () => {
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .withFirstHand([GEAR_AMBITION, GEAR_REMEMBRANCE, GEAR_REMEMBRANCE])
      .build();
    const handBefore = getHand(state, "first");
    const handUidsBefore = handBefore.map((c) => c?.uid ?? "");
    const host = handBefore.find((c) => c.id === GEAR_AMBITION)!;
    const decoy = handBefore.filter((c) => c.id === GEAR_REMEMBRANCE)[0]!;
    const partner = handBefore.filter((c) => c.id === GEAR_REMEMBRANCE)[1]!;
    const banishBefore = banishUidSet(state.players.first.banish);

    dispatch(state, { type: "FUSE", player: "first", cardUid: host.uid });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: decoy.uid },
    });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: decoy.uid },
    });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: partner.uid },
    });
    dispatch(state, { type: "CONFIRM_TARGETS" });

    expect(
      partnerPositionsAfterFuse(
        "first",
        host.uid,
        handUidsBefore,
        banishBefore,
      ),
    ).toEqual([2]);
  });

  it("two-partner fuse emits both positions ascending", () => {
    givenGameState({ seed: 3, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .build();
    const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
    const filler = createCard(GEAR_AMBITION, "hand", "first");
    const beta = createCard(OMINOUS_BETA, "hand", "first");
    const filler2 = createCard(GEAR_REMEMBRANCE, "hand", "first");
    const gamma = createCard(OMINOUS_GAMMA, "hand", "first");
    state.players.first.hand = [alpha, filler, beta, filler2, gamma];
    state.gameStarted = true;
    state.phase = "main";

    const handBefore = getHand(state, "first");
    const handUidsBefore = handBefore.map((c) => c?.uid ?? "");
    const banishBefore = banishUidSet(state.players.first.banish);

    dispatch(state, { type: "FUSE", player: "first", cardUid: alpha.uid });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: beta.uid },
    });
    dispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: gamma.uid },
    });
    dispatch(state, { type: "CONFIRM_TARGETS" });

    expect(
      partnerPositionsAfterFuse(
        "first",
        alpha.uid,
        handUidsBefore,
        banishBefore,
      ),
    ).toEqual([2, 4]);
  });
});
