/**
 * Official Cygames Q&A — empty / exhausted selection pools (19 rulings).
 * Cluster A: play/engage legality when the selection pool is empty.
 * Cluster B: optional-target abilities that still resolve.
 * Cluster C: duplicate crest prevention.
 *
 * Rulings are authoritative; engine disagreements → it.fails titled by expected behaviour.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
  thenPP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { destroyCardForLastWords } from "../harness/l2Dispatch.js";
import type { CardInstance, PlayerSlot } from "../../src/core/types/index.js";
import {
  getBoard,
  getHand,
  getHP,
  getShadows,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Cluster A — YES (engage / play with empty pool)
const ADVENTURERS_GUILD = "10002210";
const SOUL_PREDATION = "10052310";
const LAMBENT_CAIRN = "10112210";
const GODWOOD_STAFF = "10113210";
const DOSE_OF_HOLINESS = "10162220";

// Cluster A — NO (illegal when pool empty)
const BULLET_BEYOND = "10071310";
const KNIGHTLY_RENDING = "10121310";
const RADIANT_RAINBOW = "10131310";
const STREAM_OF_LIFE = "10172310";
const DOOMWRIGHT_RESURGENCE = "10172320";
const DARK_SIDE = "10201310";
const SPILLING_RED = "10642310";

// Cluster B — ability still fires
const VLAD = "10152140";
const ORTHRUS = "10153120";
const DEMON_OF_PURGATORY = "90004130";

// Cluster C — duplicate crest
const ARIA = "10114110";
const JUNO = "10133110";
const LAPIS = "10163130";
const EUDIE = "10174110";

// Helpers / tokens
const BLAZE_DESTROYER = "10032120";
const RULER_COCYTUS = "10104120";
const LLOYD = "90074120";
const STRIKER_ARTIFACT = "90072110";
const FORTIFIER_ARTIFACT = "90072120";
const FILLER = "10111310";
const DRAW_TOP = "10051120";
const DRAW_SECOND = "10051110";

const ARIA_CREST = "Aria, Lady of the Woods";
const JUNO_CREST = "Juno, Visionary Alchemist";
const LAPIS_CREST = "Lapis, Shining Seraph";
const EUDIE_CREST = "Eudie, Maiden Reborn";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
    shadows?: number;
    seed?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.shadows !== undefined) state.players.first.shadows = opts.shadows;
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
}

function enemyFollower(atk = 2, def = 2, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function allyFollower(name = "Ally", atk = 2, def = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function whenEvolveSelf(
  card: CardInstance,
  owner: PlayerSlot,
  mode: "normal" | "super" = "normal",
): void {
  if (mode === "super") {
    state.players[owner].superEvoPoints = Math.max(
      1,
      state.players[owner].superEvoPoints ?? 0,
    );
    state.players[owner].superEvoCharges = Math.max(
      1,
      state.players[owner].superEvoCharges ?? 0,
    );
  } else {
    state.players[owner].evoCharges = Math.max(
      1,
      state.players[owner].evoCharges ?? 0,
    );
  }
  handleEvolveSelf(card, owner, { mode, spendPoint: true });
}

function engageOnBoard(cardId: string): void {
  const idx = getBoard(state, "first").findIndex((c) => c.id === cardId);
  expect(idx).toBeGreaterThanOrEqual(0);
  engageAmulet("first", idx);
}

function gainCrest(owner: "first" | "second", name: string): void {
  handleGainCrest({ op: "crest", action: "gain", name } as any, owner);
}

function crestCount(owner: "first" | "second", name: string): number {
  return getCrests(state, owner).filter((c) => c.name === name).length;
}

function assertSpellBlockedAtLegality(cardId: string, pp: number): void {
  const hand = getHand(state, "first");
  const spell = hand.find((c) => c.id === cardId)!;
  const idx = hand.indexOf(spell);
  const ppBefore = thenPP("first");
  expect(canPlayCard(spell, "first").ok).toBe(false);
  expect(playCardNoRender(hand, "first", idx).kind).toBe("blocked");
  expect(thenPP("first")).toBe(ppBefore);
  expect(thenHand("first").some((c) => c.id === cardId)).toBe(true);
}

describe("official Q&A — empty selection pools", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  describe("cluster A — YES: play/engage legal with empty pool", () => {
    it("10002210 Adventurers' Guild — must engage even with no allied followers and simply destroy (official Q&A: Yes. Doing so will simply destroy it.)", () => {
      setupTurn(R6, { hand: [ADVENTURERS_GUILD], pp: 3 });
      whenPlayCard("first", 0);
      engageOnBoard(ADVENTURERS_GUILD);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(findOnBoard("first", "Adventurers' Guild")).toBeFalsy();
    }, 60_000);

    it("10052310 Soul Predation — must target super-evolved ally without destroying it and draw 2 cards (official Q&A: Yes. The follower won't be destroyed, but you will draw 2 cards.)", () => {
      setupTurn(R8, {
        hand: [SOUL_PREDATION],
        deck: [FILLER, DRAW_SECOND, DRAW_TOP],
        pp: 2,
      });
      const target = allyFollower("SuperAlly", 3, 3);
      whenEvolveSelf(target, "first", "super");
      const defBefore = Number(target.defense);
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "first").some((c) => c.uid === target.uid)).toBe(
        true,
      );
      expect(Number(target.defense)).toBe(defBefore);
      expect(thenHand("first").map((c) => c.id)).toContain(DRAW_TOP);
      expect(thenHand("first").map((c) => c.id)).toContain(DRAW_SECOND);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10112210 Lambent Cairn — must engage even with no allied followers and simply destroy (official Q&A: Yes. Doing so will simply destroy it.)", () => {
      setupTurn(R6, { hand: [LAMBENT_CAIRN], pp: 2 });
      whenPlayCard("first", 0);
      engageOnBoard(LAMBENT_CAIRN);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(findOnBoard("first", "Lambent Cairn")).toBeFalsy();
    }, 60_000);

    it("10113210 Godwood Staff — must engage even with no allied followers and simply destroy (official Q&A: Yes. Doing so will simply destroy it.)", () => {
      setupTurn(R6, { hand: [GODWOOD_STAFF], pp: 3 });
      whenPlayCard("first", 0);
      engageOnBoard(GODWOOD_STAFF);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(findOnBoard("first", "Godwood Staff")).toBeFalsy();
    }, 60_000);

    it("10162220 Dose of Holiness — must engage even with no enemy followers, destroy self, and restore 1 leader defense (official Q&A: Yes. Doing so will destroy it and restore 1 defense to your leader.)", () => {
      setupTurn(R6, { hand: [DOSE_OF_HOLINESS], pp: 3, hp: 17 });
      whenPlayCard("first", 0);
      engageOnBoard(DOSE_OF_HOLINESS);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(getHP(state, "first")).toBe(18);
      expect(findOnBoard("first", "Dose of Holiness")).toBeFalsy();
    }, 60_000);
  });

  describe("cluster A — NO: illegal when selection pool is empty", () => {
    it("10071310 Bullet from Beyond — must refuse play even if there aren't any enemy followers (official Q&A: No, you can't.)", () => {
      setupTurn(R8, { hand: [BULLET_BEYOND], pp: 4 });
      assertSpellBlockedAtLegality(BULLET_BEYOND, 4);

      enemyFollower(2, 4, "Target");
      const spell = getHand(state, "first")[0]!;
      expect(canPlayCard(spell, "first").ok).toBe(true);
    }, 60_000);

    it("10121310 Knightly Rending — must refuse play even if there aren't any enemy followers (official Q&A: No, you can't.)", () => {
      setupTurn(R6, { hand: [KNIGHTLY_RENDING], pp: 4 });
      assertSpellBlockedAtLegality(KNIGHTLY_RENDING, 4);

      enemyFollower(3, 3, "Victim");
      const spell = getHand(state, "first")[0]!;
      expect(canPlayCard(spell, "first").ok).toBe(true);
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10131310 Radiant Rainbow — must refuse play even if there aren't spellboost cards in hand (official Q&A: No, you can't.)", () => {
      setupTurn(R6, { hand: [RADIANT_RAINBOW, FILLER], pp: 2 });
      assertSpellBlockedAtLegality(RADIANT_RAINBOW, 2);

      resetUidCounter();
      setupTurn(R6, { hand: [RADIANT_RAINBOW, BLAZE_DESTROYER], pp: 2 });
      const live = getHand(state, "first").find(
        (c) => c.id === RADIANT_RAINBOW,
      )!;
      expect(canPlayCard(live, "first").ok).toBe(true);
    }, 60_000);

    it("10172310 Stream of Life — must refuse play even if there aren't any enemy followers (official Q&A: No, you can't.)", () => {
      setupTurn(R6, { hand: [STREAM_OF_LIFE], pp: 2 });
      assertSpellBlockedAtLegality(STREAM_OF_LIFE, 2);

      enemyFollower(2, 5, "Target");
      const spell = getHand(state, "first")[0]!;
      expect(canPlayCard(spell, "first").ok).toBe(true);
    }, 60_000);

    it("10172320 Doomwright Resurgence — must refuse play without 2 Artifact followers that cost 5 or less in hand (official Q&A: No, you can't.)", () => {
      setupTurn(R8, {
        hand: [DOOMWRIGHT_RESURGENCE, STRIKER_ARTIFACT],
        pp: 5,
      });
      assertSpellBlockedAtLegality(DOOMWRIGHT_RESURGENCE, 5);

      resetUidCounter();
      setupTurn(R8, {
        hand: [DOOMWRIGHT_RESURGENCE, STRIKER_ARTIFACT, FORTIFIER_ARTIFACT],
        pp: 5,
      });
      const okSpell = getHand(state, "first").find(
        (c) => c.id === DOOMWRIGHT_RESURGENCE,
      )!;
      expect(canPlayCard(okSpell, "first").ok).toBe(true);
    }, 60_000);

    it("10201310 Dark Side — must refuse selecting allied follower while enemy Lloyd is on the field (official Q&A: No, you can't.)", () => {
      setupTurn(R6, { hand: [DARK_SIDE], pp: 2 });
      const ally = allyFollower("Ally", 1, 4);
      const lloyd = createCard(LLOYD, "board", "second");
      lloyd.peak_defense = lloyd.defense;
      applyKeywordsFromList(lloyd);
      state.players.second.board = [lloyd];
      whenPlayCard("first", 0);
      const pending = state.pendingTargetEffect!;
      expect(validateTargetSelection(state, pending, ally.uid).ok).toBe(false);
      expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
      resolvePendingByUid(lloyd.uid);
      expect(Number(ally.defense)).toBe(4);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10642310 Spilling Red — must refuse play when hand target or enemy follower is missing (vice versa) (official Q&A: No, you can't.)", () => {
      setupTurn(R6, { hand: [SPILLING_RED, FILLER], pp: 6 });
      assertSpellBlockedAtLegality(SPILLING_RED, 6);

      resetUidCounter();
      setupTurn(R6, { hand: [SPILLING_RED], pp: 6 });
      enemyFollower(2, 3);
      assertSpellBlockedAtLegality(SPILLING_RED, 6);

      resetUidCounter();
      setupTurn(R6, { hand: [SPILLING_RED, FILLER], pp: 6 });
      enemyFollower(2, 3);
      const spilling = getHand(state, "first").find(
        (c) => c.id === SPILLING_RED,
      )!;
      expect(canPlayCard(spilling, "first").ok).toBe(true);
    }, 60_000);
  });

  describe("cluster B — ability activates with empty enemy pool", () => {
    it("10152140 Vlad, Impaler — must restore 5 leader defense even when there aren't enemy followers (official Q&A: Yes. It will restore 5 defense to your leader.)", () => {
      setupTurn(R8, { hand: [VLAD], pp: 8, hp: 10 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(15);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10153120 Orthrus, Hellhound Blader — must consume 4 shadows even when there aren't enemy followers (official Q&A: Yes. It will simply consume 4 shadows.)", () => {
      setupTurn(R6, { hand: [ORTHRUS], pp: 3, shadows: 4 });
      whenPlayCard("first", 0);
      expect(getShadows(state, "first")).toBe(6);
      const orth = findOnBoard("first", "Orthrus, Hellhound Blader")!;
      whenEvolveSelf(orth, "first", "normal");
      expect(getShadows(state, "first")).toBe(2);
      expect(getBoard(state, "second")).toHaveLength(0);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("90004130 Demon of Purgatory — must deal 6 damage to enemy leader even when there aren't enemy followers (official Q&A: Yes. It will deal 6 damage to the enemy leader.)", () => {
      setupTurn(R10, { hand: [RULER_COCYTUS], pp: 10 });
      whenPlayCard("first", 0);
      const demon = createCard(DEMON_OF_PURGATORY, "hand", "first");
      state.players.first.hand = [demon];
      state.players.first.pp = 5;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(14);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);
  });

  describe("cluster C — duplicate crest blocked (count stays 1)", () => {
    it("10114110 Aria — must not gain more than one of the same crest (official Q&A: No, you can't have more than one of the same crest.)", () => {
      setupTurn(R7, { hand: [ARIA, ARIA], pp: 12 });
      whenPlayCard("first", 0);
      expect(crestCount("first", ARIA_CREST)).toBe(1);
      whenPlayCard("first", 0);
      expect(crestCount("first", ARIA_CREST)).toBe(1);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10133110 Juno — must not gain more than one of the same crest (official Q&A: No, you can't have more than one of the same crest.)", () => {
      setupTurn(R8, { hand: [JUNO, JUNO], pp: 10, evo: 2 });
      gainCrest("first", JUNO_CREST);
      expect(crestCount("first", JUNO_CREST)).toBe(1);
      whenPlayCard("first", 0);
      const juno = findOnBoard("first", "Juno, Visionary Alchemist")!;
      whenEvolveSelf(juno, "first", "normal");
      expect(crestCount("first", JUNO_CREST)).toBe(1);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10163130 Lapis — must not gain more than one of the same crest via Last Words (official Q&A: No, you can't have more than one of the same crest.)", () => {
      setupTurn(R6);
      gainCrest("first", LAPIS_CREST);
      expect(crestCount("first", LAPIS_CREST)).toBe(1);
      const lapis = createCard(LAPIS, "board", "first");
      applyKeywordsFromList(lapis);
      lapis.peak_defense = lapis.defense;
      state.players.first.board.push(lapis);
      destroyCardForLastWords(lapis, "first");
      expect(crestCount("first", LAPIS_CREST)).toBe(1);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);

    it("10174110 Eudie — must not gain more than one of the same crest (official Q&A: No, you can't have more than one of the same crest.)", () => {
      setupTurn(R6, { hand: [EUDIE], pp: 3, evo: 1 });
      gainCrest("first", EUDIE_CREST);
      expect(crestCount("first", EUDIE_CREST)).toBe(1);
      whenPlayCard("first", 0);
      const eudie = findOnBoard("first", "Eudie, Maiden Reborn")!;
      whenEvolveSelf(eudie, "first", "normal");
      expect(crestCount("first", EUDIE_CREST)).toBe(1);
      expect(state.pendingTargetEffect).toBeFalsy();
    }, 60_000);
  });
});
