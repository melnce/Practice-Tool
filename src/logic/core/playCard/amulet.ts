// src/logic/core/playCard/amulet.ts
// Amulet resolution logic. Pure logic, no rendering.

import { state } from "../../../core/gameState.js";
import type { CardInstance, Player, Effect } from "../../../core/types/index.js";
import { runEffects } from "../effects/index.js";
import { pushPlayedHistory } from "./history.js";
import type { PlayOutcome } from "./types.js";

import { mergeWitchsNewBrewOnPlay } from "./specialCases.js";
import { applyKeywordsFromList } from "../keywords.js";

import { initAmulet } from "../../effects/ops/summon_ops/init.js";
import { getBoard } from "../../../core/playerHelpers.js";

/**
 * Play an amulet card. Returns PlayOutcome without rendering.
 */
export function playAmulet(
  card: CardInstance,
  player: Player,
  chosenTier: { effects: Effect[] } | null,
): PlayOutcome {
  pushPlayedHistory(player, card);
  initAmulet(card);
  applyKeywordsFromList(card);

  const toBoard = getBoard(state, player);
  toBoard.push(card);

  mergeWitchsNewBrewOnPlay(card, player);

  if (
    chosenTier &&
    Array.isArray(chosenTier.effects) &&
    chosenTier.effects.length
  ) {
    runEffects([...chosenTier.effects], player, card);
  }

  if (Array.isArray(card.fanfare) && card.fanfare.length) {
    if (state.lastSummoned) {
      state.lastSummoned.length = 0;
      state.lastSummoned.push(card);
    }
    runEffects([...card.fanfare], player, card, { enteringCard: card });
  }

  if (state.pendingTargetEffect) {
    return { kind: "paused" };
  }

  return { kind: "done" };
}















