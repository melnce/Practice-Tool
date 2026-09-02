// src/logic/core/playCard/spell.ts
// Spell resolution logic. Pure logic, no rendering.

import { state } from "../../../core/gameState.js";
import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";
import { runEffects } from "../effects/index.js";
import { spellboostHand } from "../../effects/ops/spellboost.js";
import { recordEvent } from "../../../core/debugTimeline.js";
import { fireTrigger } from "../triggers.js";
import { pushPlayedHistory } from "./history.js";
import type { PlayOutcome } from "./types.js";
import {
  getGraveyard,
  addShadows,
  isFirstPlayer,
} from "../../../core/playerHelpers.js";
import { enhanceReplacesBase } from "./enhancePlan.js";

/**
 * Play a spell card. Returns PlayOutcome without rendering.
 */
export function playSpell(
  card: CardInstance,
  player: Player,
  effectiveCost: number,
  chosenTiers: { effects: Effect[] }[] | null = [],
): PlayOutcome {
  const tiers = chosenTiers ?? [];
  const owner = isFirstPlayer(state.activePlayer) ? "first" : "second";

  // Spellboost hand
  spellboostHand(owner, 1);

  pushPlayedHistory(player, card);

  // Store reference
  const spellCard = card;

  // To Graveyard
  const toGrave = getGraveyard(state, player);
  toGrave.push(card);

  // Shadows
  addShadows(state, player, 1);

  // Debug timeline (not UI rendering)
  recordEvent({
    type: "play_card",
    payload: { owner, card: card.name, uid: card.uid },
  });

  // Loot trigger
  const isLootSpell =
    Array.isArray(spellCard.tribes) &&
    spellCard.tribes.some((t) => String(t).toLowerCase() === "loot");
  if (isLootSpell) {
    const jsonAlreadyNotifies =
      Array.isArray(spellCard.spell) &&
      spellCard.spell.some((e: any) => e && e.op === "notify_loot_played");
    if (!jsonAlreadyNotifies) {
      fireTrigger("loot_played", owner as any, {
        source: "play",
        kind: "loot",
        playedCard: spellCard,
      });
    }
  }

  // General spell-play trigger (board/crest listeners; Katze / Lunar Bunny / …)
  fireTrigger("ally_spell_played", owner as any, {
    playedCard: spellCard,
  });
  (state as any).__lastPlayedCard = spellCard;
  fireTrigger("ally_card_played", owner as any, {
    playedCard: spellCard,
  });

  // Effect list: additive by default; replace only when enhance_replaces_base.
  // Accelerate reuses the tiers slot for its alternate-form effects (core.ts)
  // and must keep replace semantics — only those effects run.
  // Single concatenated runEffects so a base clause that opens a pending
  // target still resumes into remaining (tier) effects.
  const tierEffects = tiers.flatMap((tier) =>
    Array.isArray(tier.effects) ? tier.effects : [],
  );
  const baseEffects: Effect[] =
    Array.isArray(card.spell) && card.spell.length
      ? [...card.spell]
      : Array.isArray(card.fanfare)
        ? [...card.fanfare]
        : [];
  const accelerateOnly =
    (card as any).playedAs === "accelerate" && tierEffects.length > 0;
  const list: Effect[] =
    accelerateOnly ||
    (tierEffects.length > 0 && enhanceReplacesBase(card, tiers))
      ? [...tierEffects]
      : [...baseEffects, ...tierEffects];

  if (list.length) {
    runEffects([...list], player, spellCard, { targets: [], targetUids: [] });
  }

  if (state.pendingTargetEffect) {
    return { kind: "paused" };
  }

  return { kind: "done" };
}
