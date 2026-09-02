/**
 * Owner rulings 2026-09-02:
 * 1. Fused cards are banished (not cemetery).
 * 2. Reanimate only sees followers that were destroyed on the field.
 *
 * Owner report (verbatim): fused Lyria reanimated by Wills United —
 * "she was never even on the field. not even discarded cards can get
 * reanimated. so its extra preposterous that a fused card got renanimated"
 *
 * Reanimate summons via DB lookup (`getCardDetails`), so destroyed
 * corpses in these tests must be real card IDs — not inline stubs.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import {
  resolvePendingTarget,
  forceCompleteOrFizzlePendingTarget,
} from "../../src/logic/core/resolveTarget.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  getGraveyard,
  getBanish,
  getShadows,
  getHand,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const SEPHIE = "10934110";
const LYRIA = "10403120"; // cost 2 Neutral Follower
const WILLS_UNITED = "10803310"; // mode 2 = Reanimate (2)
const FIELD_SCIENTIST = "10372120"; // Select hand card → discard
const COST1 = "10201110"; // Twinblade Goblin (cost 1) — legal ≤2 corpse
const COST2 = "10001110"; // Indomitable Fighter (cost 2)
const FILLER = "10111310";

function setupTurn(
  opts: {
    hand?: string[];
    pp?: number;
    round?: number;
    seed?: number;
  } = {},
) {
  const round = opts.round ?? 6;
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(pp, max)
    .withFirstHand(opts.hand ?? [])
    .withFirstDeck([FILLER, FILLER, FILLER, FILLER, FILLER, FILLER])
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function fusePartner(initiatorUid: string, partnerUid: string) {
  startFuseFromHand("first", initiatorUid);
  resolvePendingTarget(partnerUid);
  if (state.pendingTargetEffect) {
    forceCompleteOrFizzlePendingTarget();
  }
}

/** Put a real follower on the field and destroy it via death cleanup. */
function destroyFollowerOnField(cardId: string, uid: string) {
  const corpse = createCard(cardId, "board", "first");
  corpse.uid = uid;
  corpse.peak_defense = Number(corpse.defense) || 1;
  state.players.first.board.push(corpse);
  corpse.defense = 0;
  cleanupDead();
  return corpse;
}

function playWillsUnitedMode2() {
  setScriptedModePickProvider(() => [1]); // mode 2 = Reanimate (2)
  const hand = thenHand("first");
  const idx = hand.findIndex((c) => c.id === WILLS_UNITED);
  expect(hand[idx]!.id).toBe(WILLS_UNITED);
  whenPlayCard("first", idx);
}

describe("Owner ruling — Reanimate provenance + fuse banishes", () => {
  beforeEach(() => {
    resetUidCounter();
    setScriptedModePickProvider(null);
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  it("fused Lyria is banished (not cemetery) and is not reanimated; destroyed cost-1 is", () => {
    // Owner repro: fuse Lyria into Sephie (legal at 0 PP), then Wills United mode 2.
    // Destroyed cost-1 corpse must be the one Reanimate summons — otherwise the
    // test could pass merely because Reanimate found nothing.
    // Cost ceiling: Lyria is cost 2, Twinblade is cost 1 → current buggy engine
    // prefers Lyria (highest ≤2); after fix only Twinblade is eligible.
    setupTurn({
      hand: [SEPHIE, LYRIA, WILLS_UNITED],
      pp: 0,
      round: 6,
    });

    const destroyed = destroyFollowerOnField(COST1, "field_dead_cost1");
    expect(destroyed.id).toBe(COST1);
    expect(destroyed.name).toBe("Twinblade Goblin");
    expect(getGraveyard(state, "first").map((c) => c.uid)).toEqual([
      "field_dead_cost1",
    ]);
    expect(state.players.first.destroyedHistory.map((r) => r.uid)).toEqual([
      "field_dead_cost1",
    ]);

    const sephie = thenHand("first").find((c) => c.id === SEPHIE)!;
    const lyria = thenHand("first").find((c) => c.id === LYRIA)!;
    const lyriaUid = lyria.uid;
    const shadowsBeforeFuse = getShadows(state, "first");

    fusePartner(sephie.uid, lyriaUid);

    // Ruling 1: fused partner is banished, not in cemetery; no shadow from fuse.
    expect(getGraveyard(state, "first").map((c) => c.uid)).toEqual([
      "field_dead_cost1",
    ]);
    expect(getGraveyard(state, "first").map((c) => c.name)).toEqual([
      "Twinblade Goblin",
    ]);
    const banished = getBanish(state, "first");
    expect(banished.map((c) => c.uid)).toEqual([lyriaUid]);
    expect(banished[0]!.zone).toBe("banished");
    expect(banished[0]!.id).toBe(LYRIA);
    expect(banished[0]!.name).toBe("Lyria, Skydestined");
    expect(getShadows(state, "first")).toBe(shadowsBeforeFuse);

    // Give PP to play Wills United (cost 2)
    state.players.first.pp = 2;
    playWillsUnitedMode2();

    expect(thenBoard("first").map((c) => c.name)).toEqual(["Twinblade Goblin"]);
    expect(thenBoard("first").map((c) => c.id)).toEqual([COST1]);
  });

  it("discarded cost-2 follower is not reanimatable; destroyed cost-1 is", () => {
    setupTurn({
      hand: [FIELD_SCIENTIST, LYRIA, WILLS_UNITED],
      pp: 6,
      round: 6,
    });

    destroyFollowerOnField(COST1, "field_dead_for_discard_case");
    const shadowsBeforeDiscard = getShadows(state, "first");

    const fsIdx = thenHand("first").findIndex((c) => c.id === FIELD_SCIENTIST);
    expect(thenHand("first")[fsIdx]!.id).toBe(FIELD_SCIENTIST);
    whenPlayCard("first", fsIdx);
    const lyriaInPool = state.pendingTargetEffect!.pool!.find(
      (c) => c.id === LYRIA,
    )!;
    expect(lyriaInPool.id).toBe(LYRIA);
    const lyriaUid = lyriaInPool.uid;
    resolvePendingTarget(lyriaUid);

    expect(getGraveyard(state, "first").map((c) => c.uid)).toEqual([
      "field_dead_for_discard_case",
      lyriaUid,
    ]);
    expect(getGraveyard(state, "first").map((c) => c.id)).toEqual([
      COST1,
      LYRIA,
    ]);
    // Exact: destroyedHistory still only the field death
    expect(state.players.first.destroyedHistory.map((r) => r.uid)).toEqual([
      "field_dead_for_discard_case",
    ]);
    // Discard still generates shadows (unchanged by this ruling).
    expect(getShadows(state, "first")).toBe(shadowsBeforeDiscard + 1);

    state.players.first.pp = Math.max(Number(state.players.first.pp) || 0, 2);
    let willsIdx = thenHand("first").findIndex((c) => c.id === WILLS_UNITED);
    if (willsIdx < 0) {
      getHand(state, "first").push(createCard(WILLS_UNITED, "hand", "first"));
      willsIdx = thenHand("first").length - 1;
    }
    expect(thenHand("first")[willsIdx]!.id).toBe(WILLS_UNITED);
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", willsIdx);

    // Field Scientist remains on board; Reanimate must add Twinblade, not Lyria.
    expect(thenBoard("first").map((c) => c.name)).toEqual([
      "Field Scientist",
      "Twinblade Goblin",
    ]);
    expect(thenBoard("first").map((c) => c.id)).toEqual([
      FIELD_SCIENTIST,
      COST1,
    ]);
  });

  it("destruction still works: field-destroyed cost-2 follower is reanimated", () => {
    setupTurn({
      hand: [WILLS_UNITED],
      pp: 2,
      round: 6,
    });

    destroyFollowerOnField(COST2, "field_dead_cost2_regression");
    expect(getGraveyard(state, "first").map((c) => c.uid)).toEqual([
      "field_dead_cost2_regression",
    ]);
    expect(getGraveyard(state, "first").map((c) => c.name)).toEqual([
      "Indomitable Fighter",
    ]);
    expect(state.players.first.destroyedHistory.map((r) => r.uid)).toEqual([
      "field_dead_cost2_regression",
    ]);

    playWillsUnitedMode2();

    expect(thenBoard("first").map((c) => c.name)).toEqual([
      "Indomitable Fighter",
    ]);
    expect(thenBoard("first").map((c) => c.id)).toEqual([COST2]);
    // Reanimate copies — original remains in cemetery; spent spell joins it.
    expect(getGraveyard(state, "first").map((c) => c.name)).toEqual([
      "Indomitable Fighter",
      "Wills United",
    ]);
    expect(getGraveyard(state, "first")[0]!.uid).toBe(
      "field_dead_cost2_regression",
    );
  });
});
