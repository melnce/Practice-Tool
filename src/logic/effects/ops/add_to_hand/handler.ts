// src/logic/effects/ops/add_to_hand/handler.ts
// Handler for ADD_TO_HAND operation - adds cards to hand.
// Source determines where the card comes from:
// - "named": Create from card database by name (token generation)
// - "copy": Duplicate from an existing target card
// - "destroyed_match": Recreate cards selected from destroyed history

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { pushToHand } from "../../../../core/utils.js";
import { normalizeCardStats } from "../../../../core/cardStats.js";
import { getCardById, getCardDetails } from "../../../../data/cardDatabase.js";
import type {
  Effect,
  Player,
  CardInstance,
} from "../../../../core/types/index.js";
import { normalizeToAddToHandSpec } from "./types.js";
import { normalizeInstanceEnteringHandAsCopy } from "./normalizeHandCopy.js";
import { bumpZoneVersion } from "../../../core/triggers/utils.js";
import { pickDestroyedMatch } from "../../../core/destroyedHistory.js";

/**
 * Handle the add_to_hand operation.
 *
 * Semantics:
 * - source="named": Create token from database, does NOT thin deck
 * - source="copy": Duplicate existing card, does NOT thin deck
 * - source="destroyed_match": Create fresh cards from destroyed-history records
 *
 * @param eff - The add_to_hand effect
 * @param owner - The player who triggered the effect
 * @param sourceCard - The card that triggered this effect (for target: "self")
 * @param context - Additional context (selected cards, last drawn, etc.)
 */
export function handleAddToHand(
  eff: Effect & Record<string, any>,
  owner: Player,
  sourceCard: CardInstance | null = null,
  context: {
    selected?: CardInstance[];
    lastDrawn?: CardInstance;
    triggerCard?: CardInstance;
  } = {},
): void {
  const spec = normalizeToAddToHandSpec(eff);

  if (spec.count <= 0) return; // No-op

  // Determine who receives the cards
  const receivingPlayer: Player =
    spec.player === "enemy" ? (owner === "first" ? "second" : "first") : owner;

  const hand = state.players[receivingPlayer].hand;

  // Route based on source
  if (spec.source === "named") {
    addNamedCards(spec, receivingPlayer, hand);
  } else if (spec.source === "copy") {
    addCopiedCards(spec, owner, receivingPlayer, hand, sourceCard, context);
  } else if (spec.source === "destroyed_match") {
    addDestroyedMatchCards(spec, owner, receivingPlayer, hand);
  }
}

/**
 * Add named cards (token generation).
 */
function addNamedCards(
  spec: ReturnType<typeof normalizeToAddToHandSpec>,
  receivingPlayer: Player,
  hand: CardInstance[],
): void {
  if (!spec.name) return;

  // Look up the card template
  const base = getCardDetails(spec.name);
  if (!base) {
    logEvent("add_to_hand_notFound", {
      name: spec.name,
      player: receivingPlayer,
    });
    return;
  }

  // Create and add cards (overflow burns via pushToHand → burnHandOverflow)
  let added = 0;
  for (let i = 0; i < spec.count; i++) {
    const copy: CardInstance = structuredClone(base);
    copy.uid = state.rng.makeUid();
    copy.owner = receivingPlayer;
    copy.zone = "hand";
    normalizeCardStats(copy);

    // Apply keywords if specified
    if (spec.keywords.length > 0) {
      applyKeywords(copy, spec.keywords);
    }

    if (pushToHand(hand, copy)) {
      added++;
      (state as any).lastAddedToHand = copy;
      logEvent("add_to_hand", {
        owner: receivingPlayer,
        name: copy.name,
        uid: copy.uid,
        source: "named",
      });
    }
  }
  if (added > 0) bumpZoneVersion();
}

/** Add fresh card instances selected from the owner's destroyed history. */
function addDestroyedMatchCards(
  spec: ReturnType<typeof normalizeToAddToHandSpec>,
  owner: Player,
  receivingPlayer: Player,
  hand: CardInstance[],
): void {
  const records = pickDestroyedMatch(state, owner, {
    filter: spec.filter,
    ...(spec.distinctBy ? { distinct_by: spec.distinctBy } : {}),
    ...(spec.distribution ? { distribution: spec.distribution } : {}),
    count: spec.count,
  });

  let added = 0;
  for (const record of records) {
    const base =
      getCardById(record.cardId || record.id) ?? getCardDetails(record.name);
    if (!base) {
      logEvent("add_to_hand_notFound", {
        name: record.name,
        id: record.cardId || record.id,
        player: receivingPlayer,
        source: "destroyed_match",
      });
      continue;
    }

    const copy: CardInstance = structuredClone(base);
    copy.uid = state.rng.makeUid();
    copy.owner = receivingPlayer;
    copy.zone = "hand";
    normalizeCardStats(copy);

    if (spec.keywords.length > 0) {
      applyKeywords(copy, spec.keywords);
    }

    if (pushToHand(hand, copy)) {
      added++;
      (state as any).lastAddedToHand = copy;
      logEvent("add_to_hand", {
        owner: receivingPlayer,
        name: copy.name,
        uid: copy.uid,
        source: "destroyed_match",
        from: record.uid,
      });
    }
  }
  if (added > 0) bumpZoneVersion();
}

/**
 * Add copied cards (duplication).
 */
function addCopiedCards(
  spec: ReturnType<typeof normalizeToAddToHandSpec>,
  owner: Player,
  receivingPlayer: Player,
  hand: CardInstance[],
  sourceCard: CardInstance | null,
  context: {
    selected?: CardInstance[];
    lastDrawn?: CardInstance;
    triggerCard?: CardInstance;
  },
): void {
  // Determine the source card to copy
  let cardToCopy: CardInstance | null = null;

  switch (spec.target) {
    case "self":
      cardToCopy = sourceCard;
      break;
    case "selected": {
      const picks = context.selected;
      cardToCopy =
        (Array.isArray(picks) ? picks[0] : picks) ??
        (state as any).lastSelected?.[0] ??
        (state as any).__lastSelected ??
        null;
      break;
    }
    case "last_drawn":
      // Try context first, then fall back to state.lastDrawnCards (array)
      cardToCopy =
        context.lastDrawn ??
        (state as any).lastDrawnCards?.[0] ??
        (state as any).lastDrawnCard ??
        null;
      break;
    case "trigger":
      cardToCopy = context.triggerCard ?? null;
      break;
  }

  if (!cardToCopy) {
    logEvent("add_to_hand_noTarget", { target: spec.target, player: owner });
    return;
  }

  // Create copies (overflow burns via pushToHand → burnHandOverflow)
  let added = 0;
  for (let i = 0; i < spec.count; i++) {
    const copy: CardInstance = structuredClone(cardToCopy);
    copy.uid = state.rng.makeUid();
    copy.owner = receivingPlayer;
    copy.zone = "hand";
    // structuredClone carries board runtime (witnesses, damage, combat flags…).
    // A card entering hand as a copy must start clean for those fields.
    normalizeInstanceEnteringHandAsCopy(copy);
    normalizeCardStats(copy);

    // Apply keywords if specified
    if (spec.keywords.length > 0) {
      applyKeywords(copy, spec.keywords);
    }

    if (pushToHand(hand, copy)) {
      added++;
      (state as any).lastAddedToHand = copy;
      logEvent("add_to_hand", {
        owner: receivingPlayer,
        name: copy.name,
        uid: copy.uid,
        source: "copy",
        from: cardToCopy.uid,
      });
    }
  }
  if (added > 0) bumpZoneVersion();
}

/**
 * Apply keywords to a card.
 */
function applyKeywords(card: CardInstance, keywords: string[]): void {
  if (!card.keywords) {
    card.keywords = [];
  }
  for (const kw of keywords) {
    if (!card.keywords.includes(kw)) {
      card.keywords.push(kw);
    }
  }
}
