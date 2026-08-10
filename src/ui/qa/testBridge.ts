// src/ui/qa/testBridge.ts — window.__svwbTest bridge (?test=1 only)

import { state, resetGameState } from "../../core/gameState.js";
import { adapter } from "../../core/adapter.js";
import { getCardDetails } from "../../data/cardIndex.js";
import { loadDecksFromRaw } from "../../data/deckLoader.js";
import { loadCardDatabase } from "../../data/cardDatabase.js";
import { applyKeywordsFromList } from "../../logic/core/keywords/apply.js";
import type {
  CardInstance,
  GameState,
  Player,
} from "../../core/types/index.js";
import type { RawDeck } from "../../data/rawDeck.js";
import { endTurnBlue, endTurnRed } from "../../logic/core/turns.js";

export interface SvwbTestBridge {
  getState(): GameState;
  seedRng(seed: number | string): void;
  loadDecks(
    blue: RawDeck,
    red: RawDeck,
    opts?: { drawOpening?: boolean },
  ): void;
  addToHand(player: Player, cardId: string, count?: number): void;
  addToDeck(player: Player, cardId: string, count?: number): void;
  summonToBoard(player: Player, cardId: string, attackReady?: boolean): boolean;
  setPP(player: Player, pp: number, maxPP?: number): void;
  setEP(player: Player, charges: number): void;
  setSEP(player: Player, charges: number): void;
  setLeaderHP(player: Player, hp: number): void;
  advanceToTurn(round: number, activePlayer?: Player): void;
  render(): void;
  endTurn(): void;
}

function makeCard(cardId: string, owner: Player): CardInstance {
  const tmpl = getCardDetails(cardId);
  if (!tmpl) throw new Error(`Unknown card id: ${cardId}`);
  const card = structuredClone(tmpl) as CardInstance;
  card.uid = state.rng.makeUid();
  card.owner = owner;
  card.buffs = card.buffs ?? { attack: 0, defense: 0 };
  applyKeywordsFromList(card);
  return card;
}

function installBridge(): void {
  const bridge: SvwbTestBridge = {
    getState: () => state,

    seedRng(seed: number | string) {
      resetGameState(seed);
    },

    loadDecks(blue, red, opts) {
      loadDecksFromRaw(blue, red, opts);
    },

    addToHand(player, cardId, count = 1) {
      const hand = state.players[player].hand;
      for (let i = 0; i < count; i++) {
        hand.push(makeCard(cardId, player));
      }
      adapter.render();
    },

    addToDeck(player, cardId, count = 1) {
      const deck = state.players[player].deck;
      for (let i = 0; i < count; i++) {
        deck.push(makeCard(cardId, player));
      }
      adapter.render();
    },

    summonToBoard(player, cardId, attackReady = false) {
      const board = state.players[player].board;
      if (board.length >= 5) return false;
      const card = makeCard(cardId, player);
      card.zone = "board";
      card.can_attack = attackReady;
      card.justPlayed = !attackReady;
      card.hasAttacked = false;
      if (attackReady) {
        card.attacks_left = 1;
      }
      board.push(card);
      adapter.render();
      return true;
    },

    setPP(player, pp, maxPP) {
      const p = state.players[player];
      if (maxPP != null) p.maxPP = maxPP;
      p.pp = Math.max(0, Math.min(pp, p.maxPP));
      adapter.render();
    },

    setEP(player, charges) {
      state.players[player].evoCharges = Math.max(0, charges);
      adapter.render();
    },

    setSEP(player, charges) {
      state.players[player].superEvoCharges = Math.max(0, charges);
      adapter.render();
    },

    setLeaderHP(player, hp) {
      state.players[player].hp = hp;
      adapter.render();
    },

    advanceToTurn(round, activePlayer = "first") {
      state.roundCount = round;
      state.activePlayer = activePlayer;
      state.gameStarted = true;
      state.phase = "main";

      const tune = (player: Player, isSecond: boolean) => {
        const p = state.players[player];
        const max = Math.min(
          10,
          isSecond ? Math.max(1, round) : Math.max(1, round),
        );
        p.maxPP = max;
        p.pp = max;
        p.evoUsedThisTurn = false;
        if (isSecond) {
          p.evoCharges = round >= 4 ? Math.min(3, round - 3) : 0;
          p.superEvoCharges = round >= 6 ? Math.min(3, round - 5) : 0;
        } else {
          p.evoCharges = round >= 5 ? Math.min(3, round - 4) : 0;
          p.superEvoCharges = round >= 7 ? Math.min(3, round - 6) : 0;
        }
      };

      tune("first", false);
      tune("second", true);
      adapter.render();
    },

    render() {
      adapter.render();
    },

    endTurn() {
      if (state.activePlayer === "first") endTurnBlue();
      else endTurnRed();
    },
  };

  (window as Window & { __svwbTest?: SvwbTestBridge }).__svwbTest = bridge;
}

export async function initTestBridgeIfRequested(): Promise<void> {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("test")) return;

  await loadCardDatabase();
  installBridge();
}

declare global {
  interface Window {
    __svwbTest?: SvwbTestBridge;
  }
}
