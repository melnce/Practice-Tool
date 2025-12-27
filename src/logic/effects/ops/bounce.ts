// src/logic/effects/ops/bounce.ts
import { state } from "../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../core/targeting.js";
import { pushToHand } from "../../../core/utils.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
import { fireTrigger } from "../../core/triggers.js";
import { setPendingTarget } from "../../core/pendingTarget/index.js";

import { logEvent } from "../../../core/logger.js";
import type { CardInstance, Effect, Player, EffectContext } from "../../../core/types/index.js";
import { getBoard, getHand, getGraveyard, opponentOf } from "../../../core/playerHelpers.js";

// Create a fresh base copy (new uid)
function freshBaseCopyByName(name: string) {
  const base = getCardDetails(name);
  if (!base) return null;
  const copy = structuredClone(base);
  copy.uid = state.rng.makeUid();
  return copy;
}

// Remove from board and push a *reset* copy to the correct hand.
export function bounceToHand(card: CardInstance) {
  let fromArr = null;
  let toHand = null;
  let owner: Player | null = null;

  const firstBoard = getBoard(state, "first");
  const secondBoard = getBoard(state, "second");
  const bi = firstBoard.indexOf(card);
  const ri = secondBoard.indexOf(card);

  // Determine the owner based on which board the card was on.
  if (bi !== -1) {
    fromArr = firstBoard;
    toHand = getHand(state, "first");
    owner = "first";
  } else if (ri !== -1) {
    fromArr = secondBoard;
    toHand = getHand(state, "second");
    owner = "second";
  } else {
    console.warn(
      `[BounceToHand] Card ${card.name}#${card.uid} not found on any board! bi=${bi} ri=${ri}`,
    );
    return; // Card not on a board; ignore.
  }

  // Fire ally trigger for owner, enemy trigger for opponent
  const opponent = opponentOf(owner);
  fireTrigger("ally_follower_leaves_field", owner);
  fireTrigger("enemy_follower_leaves_field", opponent);

  const [removed] = fromArr.splice(fromArr.indexOf(card), 1);
  if (!removed) return;

  // Try to get fresh base copy from database
  let fresh = freshBaseCopyByName(removed.name);

  // Fallback: For synthetic/test cards not in database, create a reset copy
  // This enables AI training scenarios and testing with custom cards
  if (!fresh) {
    fresh = structuredClone(removed);
    fresh.uid = state.rng.makeUid();
    fresh.zone = "hand";
    // Reset combat state
    delete fresh.hasAttacked;
    delete fresh.hasEvolved;
    delete fresh.exhausted;
    delete fresh.attacksThisTurn;
  }

  const pushed = pushToHand(toHand, fresh);
  if (!pushed) {
    // Hand full -> Burn to graveyard
    // Shadowverse: Bounced cards that trigger burn go to graveyard (shadows +1)
    const grave = owner ? getGraveyard(state, owner) : null;

    if (grave) {
      fresh.zone = "graveyard";
      grave.push(fresh);
      logEvent("burn_to_grave", { owner, card: fresh.name, uid: fresh.uid });
    }
  } else {
    logEvent("bounceToHand", {
      from: owner,
      name: removed.name,
      oldUid: removed.uid,
      newUid: fresh.uid,
    });
  }
}

// Handle "return_to_hand" effect
export function handleReturnToHand(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: Effect[],
  context: EffectContext = {},
) {
  let pool = getPool(
    eff.target as any,
    owner,
    sourceCard,
    eff.condition,
    context,
  ).filter((c) => c.type === "Follower" || c.type === "Amulet");

  if ((eff as any).filters?.type) {
    const want = String((eff as any).filters.type).toLowerCase();
    pool = pool.filter((c) => (c.type || "").toLowerCase() === want);
  }

  // If there's a source card, filter it out of the pool so it can't target itself,
  // UNLESS current op target is explicitly "self".
  if (sourceCard && eff.target !== "self") {
    pool = pool.filter((c) => c.uid !== sourceCard.uid);
  }

  if (!pool.length) return;

  // Handle select: "all" - bounce all matching cards immediately
  if ((eff as any).select === "all") {
    for (const t of pool) bounceToHand(t);
    return;
  }

  // Numeric select - use pending target for UI selection
  if ((eff as any).select) {
    setPendingTarget({
      eff,
      owner,
      sourceCard,
      resumeEffects: effectsQueue,
      pool,
      targets: [],
      selectCount: parseInt((eff as any).select_count || 1),
    });
    logEvent("returnToHand_select", {
      owner,
      pool: pool.length,
      select: parseInt((eff as any).select_count || 1),
    });
    highlightSelectable(pool);
    return "pending";
  }

  // non-select → bounce all matching
  for (const t of pool) bounceToHand(t);
}















