/**
 * @file Mechanic Contract Test: Faith is not a crest for counting (owner ruling 2026-09-06)
 *
 * Faith still occupies one of the five crest/faith slots (MAX_CREST_SLOTS).
 * "Number of crests you have" counts exclude Faith entries.
 *
 * Game-playing tests use it(name, fn, 60_000) per repo lesson §11 (2-core CI).
 *
 * Sabotage: if countCrests counted Faith (full list length), the Shining Disenchantment
 * cases below would expect countdown 1 / 3 instead of 2 / 4 and would fail.
 */

import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { bootstrapFaithForPlayer } from "../../src/logic/faith/bootstrap.js";
import { getCardById } from "../../src/data/cardDatabase.js";

import { endTurnBlue } from "../../src/logic/core/turns.js";
import {
  countCrests,
  getBoard,
  getCrests,
  getHP,
} from "../../src/core/playerHelpers.js";
import { getKS } from "../../src/logic/core/keywords/internal.js";
import { clearLogs, getLogs } from "../../src/core/logger.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const SHINING_DISENCHANTMENT = "10363210";
const TEMPLE_OF_REPOSE = "10362210";
const MARWYNN = "10364120";
const HIMEKA = "10364110";
const SHAM_NACHA = "10354110";

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number } = {},
): void {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function gainCrest(owner: "first" | "second", name: string): void {
  handleGainCrest({ op: "crest", action: "gain", name } as any, owner);
}

function grantShamNachaFaith(owner: "first" | "second" = "first"): void {
  const sham = getCardById(SHAM_NACHA)!;
  state.players[owner].deck.push({ ...sham, uid: state.rng.makeUid() } as any);
  bootstrapFaithForPlayer(
    owner,
    state.players[owner].deck,
    state.players[owner].hand,
  );
}

function engageFirstAmulet(name: string) {
  const card = findOnBoard("first", name)!;
  engageAmulet("first", state.players.first.board.indexOf(card));
  return card;
}

describe("Mechanic Contract: Faith is not a crest for counting", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Engage X = number of crests you have", () => {
    it("Shining Disenchantment (10363210): Faith + 2 crests advances by 2, not 3", () => {
      setupTurn(R6, { hand: [SHINING_DISENCHANTMENT], pp: 4 });
      grantShamNachaFaith();
      gainCrest("first", "Test Crest A");
      gainCrest("first", "Test Crest B");
      expect(getCrests(state, "first").length).toBe(3);
      expect(countCrests(state, "first")).toBe(2);

      whenPlayCard("first", 0);
      const disc = engageFirstAmulet("Shining Disenchantment");
      expect(disc.countdown).toBe(2);
    }, 60_000);

    it("Shining Disenchantment (10363210): Faith only advances by 0", () => {
      setupTurn(R6, { hand: [SHINING_DISENCHANTMENT], pp: 4 });
      grantShamNachaFaith();
      expect(countCrests(state, "first")).toBe(0);

      whenPlayCard("first", 0);
      const disc = engageFirstAmulet("Shining Disenchantment");
      expect(disc.countdown).toBe(4);
    }, 60_000);

    it("Temple of Repose (10362210): Faith + 2 crests advances by 2, not 3", () => {
      setupTurn(R6, { hand: [TEMPLE_OF_REPOSE], pp: 3 });
      grantShamNachaFaith();
      gainCrest("first", "Test Crest A");
      gainCrest("first", "Test Crest B");
      expect(countCrests(state, "first")).toBe(2);

      whenPlayCard("first", 0);
      const temple = engageFirstAmulet("Temple of Repose");
      expect(temple.countdown).toBe(2);
    }, 60_000);

    it("Temple of Repose (10362210): Faith only advances by 0", () => {
      setupTurn(R6, { hand: [TEMPLE_OF_REPOSE], pp: 3 });
      grantShamNachaFaith();
      whenPlayCard("first", 0);
      const temple = engageFirstAmulet("Temple of Repose");
      expect(temple.countdown).toBe(4);
    }, 60_000);
  });

  describe("Marwynn crest end-of-turn split damage", () => {
    it("Faith + 2 crests (filler + Marwynn) deals 2 split damage", () => {
      setupTurn(R6, { hand: [MARWYNN], pp: 5 });
      grantShamNachaFaith();
      gainCrest("first", "Filler Crest");
      state.players.second.hp = 20;

      whenPlayCard("first", 0);
      const mar = findOnBoard("first", "Marwynn, Despair Manifest")!;
      whenEvolve(mar, "first");
      expect(countCrests(state, "first")).toBe(2);

      endTurnBlue();
      expect(getHP(state, "second")).toBe(18);
    }, 60_000);
  });

  describe("Himeka crest random follower locks", () => {
    it("Faith + 2 crests (filler + Himeka) locks 2 enemy followers", () => {
      setupTurn(R6, { hand: [HIMEKA], pp: 6 });
      grantShamNachaFaith();
      gainCrest("first", "Filler Crest");

      for (let i = 0; i < 3; i++) {
        const foe = createCard(
          {
            name: `LockTarget${i}`,
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
        state.players.second.board.push(foe);
      }

      whenPlayCard("first", 0);
      expect(countCrests(state, "first")).toBe(2);

      endTurnBlue();

      const locked = getBoard(state, "second").filter(
        (c) => getKS(c).cantAttack,
      );
      expect(locked.length).toBe(2);
    }, 60_000);
  });

  describe("Five-slot cap still counts Faith toward MAX_CREST_SLOTS", () => {
    it("four ordinary crests + Faith: fifth ordinary crest bounces (slot_cap)", () => {
      (globalThis as any).HEADLESS = false;
      clearLogs();

      givenGameState({ seed: 1, activePlayer: "first" }).build();
      state.gameStarted = true;
      state.players.first.crests = [];

      grantShamNachaFaith();
      for (let i = 1; i <= 4; i++) {
        gainCrest("first", `Ordinary Crest ${i}`);
      }
      expect(getCrests(state, "first").length).toBe(5);
      expect(countCrests(state, "first")).toBe(4);

      gainCrest("first", "Ordinary Crest 5");

      expect(getCrests(state, "first").length).toBe(5);
      expect(
        getCrests(state, "first").some((c) => c.name === "Ordinary Crest 5"),
      ).toBe(false);
      expect(
        getLogs().some(
          (e) =>
            e.type === "crestBounce" &&
            e.details?.reason === "slot_cap" &&
            e.details?.crest === "Ordinary Crest 5",
        ),
      ).toBe(true);
    }, 60_000);
  });
});
