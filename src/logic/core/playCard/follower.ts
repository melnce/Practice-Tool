// src/logic/core/playCard/follower.ts
// Follower resolution logic. Pure logic, no rendering.

import { state } from "../../../core/gameState.js";
import { CardInstance, Player, Effect } from "../../../core/types.js";
import { runEffects } from "../effects/index.js";
import { fireTrigger } from "../triggers.js";
import { pushPlayedHistory } from "./history.js";
import { PlayOutcome } from "./types.js";
import { applyKeywordsFromList } from "../keywords.js";
import { incrementRally, getBoard, opponentOf } from "../../../core/playerHelpers.js";

/**
 * Play a follower card. Returns PlayOutcome without rendering.
 */
export function playFollower(
  card: CardInstance,
  player: Player,
  chosenTier: { effects: Effect[] } | null,
): PlayOutcome {
  pushPlayedHistory(player, card);

  // Snapshot cost for triggers
  const printed = Number.isFinite(card.base_cost)
    ? Number(card.base_cost)
    : parseInt(String(card.cost), 10) || 0;
  const current = parseInt(String(card.cost), 10) || 0;
  const handMod = parseInt(String(card.cost_mod), 10) || 0;
  const costChangedOnPlay =
    handMod !== 0 || (Number.isFinite(card.base_cost) && current !== printed);

  card.attack = parseInt(String(card.attack), 10) || 0;
  card.defense = parseInt(String(card.defense), 10) || 0;

  // Rally check
  const hasRallyFanfare =
    Array.isArray(card.fanfare) &&
    card.fanfare.some((e: any) => String(e.op).toLowerCase() === "rally_gate");

  if (!hasRallyFanfare) {
    incrementRally(state, player);
  }

  if ((card as any).base_attack === undefined)
    (card as any).base_attack = card.attack;
  if ((card as any).base_defense === undefined)
    (card as any).base_defense = card.defense;
  if (card.peak_defense === undefined) card.peak_defense = card.defense;

  applyKeywordsFromList(card);

  card.can_attack = !!card.hasStorm || !!card.hasRush;
  card.isRush = !!card.hasRush && !card.hasStorm;
  card.justPlayed = true;
  card.hasAttacked = false;

  const toBoard = getBoard(state, player);
  toBoard.push(card);

  // Fire ally trigger for owner, enemy trigger for opponent
  const opponent = opponentOf(player);
  fireTrigger("ally_follower_played", player as any, {
    playedCard: card,
    costChanged: costChangedOnPlay,
  });
  fireTrigger("ally_follower_enter", player as any, { enteringCard: card });
  fireTrigger("enemy_follower_enter", opponent as any, { enteringCard: card });

  // Fanfare
  const skipFanfareForEnhance =
    chosenTier && (card as any).enhance_replaces_fanfare;
  if (
    !skipFanfareForEnhance &&
    Array.isArray(card.fanfare) &&
    card.fanfare.length
  ) {
    if (state.lastSummoned) {
      state.lastSummoned.length = 0;
      state.lastSummoned.push(card);
    }
    runEffects([...card.fanfare], player, card, { enteringCard: card });
  }

  // Enhance
  if (
    chosenTier &&
    Array.isArray(chosenTier.effects) &&
    chosenTier.effects.length
  ) {
    runEffects([...chosenTier.effects], player, card);
  }

  // Re-apply keywords
  applyKeywordsFromList(card);
  card.can_attack = !!card.hasStorm || !!card.hasRush;
  card.isRush = !!card.hasRush && !card.hasStorm;

  // Ally-enter amulets (e.g. Ancestral Crown)
  const myBoard = getBoard(state, player);
  for (const perm of myBoard) {
    if (perm === card || perm.type !== "Amulet") continue;

    // Check keywordState (where applyKeywordsFromList stores ally_enter data)
    const ks = perm.keywordState;
    if (ks?.hasAllyEnter && Array.isArray(ks.allyEnterEffects)) {
      for (const eff of ks.allyEnterEffects) {
        if (eff.op === "stat" && eff.target === "trigger") {
          card.attack =
            (Number(card.attack) || 0) + (Number((eff as any).attack) || 0);
          card.defense =
            (Number(card.defense) || 0) + (Number((eff as any).defense) || 0);
        }
      }
    }
  }

  // Pixie-enter
  if (Array.isArray(card.tribes) && card.tribes.includes("Pixie")) {
    for (const perm of myBoard) {
      const ks = perm.keywordState || {};
      if (
        perm.type === "Amulet" &&
        ks.hasPixieEnter &&
        Array.isArray(ks.pixieEnterEffects)
      ) {
        runEffects([...ks.pixieEnterEffects], player, perm);
      }
    }
  }

  if (state.pendingTargetEffect) {
    return { kind: "paused" };
  }

  return { kind: "done" };
}















