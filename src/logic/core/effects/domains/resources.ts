import { registerOp } from "../registry.js";
import { state } from "../../../../core/gameState.js";
import { handleDraw } from "../../../effects/ops/draw/index.js";
import { handleAddToHand } from "../../../effects/ops/add_to_hand/index.js";
import { handleSearch } from "../../../effects/ops/search/index.js";
import { handleDiscard } from "../../../effects/hand.js";
// Legacy imports removed: handleReplaceDeck, handleSetCostLastDrawn (now in unified deck/cost ops)
import { consumeEarthSigils } from "../../../effects/ops/earth.js";
// Legacy imports removed: hasNecromancy, spendShadows (handled by gate conditions)
// Legacy imports removed: isOverflow (handled by gate conditions)
import { handleFuse } from "../../../effects/ops/fuse/unified.js";
// Legacy import removed: startFortifierFuse (now handled by fuse op with type: "fortifier")
import { handleCrest } from "../../../effects/ops/crest/unified.js";
import { handleDeck } from "../../../effects/deck.js";
import { logEvent } from "../../../../core/logger.js";
import { getAdapter, getTargetingContext } from "../context.js";
import { resolveUids } from "../../../../core/uidResolver.js";
import { enqueueManyFront } from "../queue.js";
import { addMaxPP } from "../../../pp.js";
import type {
  Effect,
  Player,
  EffectContext,
} from "../../../../core/types/index.js";
import {
  isFirstPlayer,
  getPP,
  setPP,
  getMaxPP,
  opponentOf,
  addShadows,
  getEvoCharges,
  setEvoCharges,
  getSuperEvoCharges,
  setSuperEvoCharges,
  getBoard,
} from "../../../../core/playerHelpers.js";

const doLog = (event: string, payload: any) => logEvent(event, payload);

// ========================================================================
// UNIFIED PP/EP HANDLERS
// ========================================================================

type PPAction = "gain_max" | "recover";
type EPAction = "recover" | "recover_super";

function handlePP(
  eff: Effect & { action?: PPAction },
  owner: Player,
  sourceCard: import("../../../../core/types/index.js").CardInstance | null,
) {
  const action = eff.action;
  if (!action) {
    console.warn("pp op: action field is mandatory (gain_max, recover)");
    return;
  }

  const targetPlayer: Player =
    (eff.player || "self") === "self" ? owner : opponentOf(owner);

  switch (action) {
    case "gain_max": {
      const amt = (eff.amount || 1) as number;
      addMaxPP(targetPlayer, amt, {
        cap: 10,
        recalcNow: true,
      });
      break;
    }
    case "recover": {
      const cur = getPP(state, targetPlayer);
      const max = getMaxPP(state, targetPlayer);

      let amt;
      if ((eff as any).amount_source === "other_allies") {
        amt = getBoard(state, targetPlayer).filter(
          (card) =>
            card.type === "Follower" &&
            (!sourceCard || card.uid !== sourceCard.uid),
        ).length;
      } else if (
        typeof eff.amount === "string" &&
        eff.amount.toLowerCase() === "currentmaxpp"
      ) {
        amt = Math.max(0, max - cur);
      } else {
        amt = parseInt(String(eff.amount)) || 0;
      }

      const next = Math.min(max, cur + amt);
      setPP(state, targetPlayer, next);
      logEvent("recoverPP", {
        owner: targetPlayer,
        amount: amt,
      });
      break;
    }
    default:
      console.warn(`pp op: unknown action ${action}`);
  }
}

function handleEP(eff: Effect & { action?: EPAction }, owner: Player) {
  const action = eff.action;
  if (!action) {
    console.warn("ep op: action field is mandatory (recover | recover_super)");
    return;
  }

  const targetPlayer: Player =
    (eff.player || "self") === "self" ? owner : opponentOf(owner);
  const MAX_EP = 2;
  const MAX_SEP = 2;

  switch (action) {
    case "recover": {
      const amt = parseInt(String(eff.amount)) || 0;
      const current = getEvoCharges(state, targetPlayer);
      setEvoCharges(state, targetPlayer, Math.min(MAX_EP, current + amt));
      logEvent("recoverEP", { owner: targetPlayer, amount: amt });
      break;
    }
    case "recover_super": {
      const amt = parseInt(String(eff.amount)) || 0;
      const current = getSuperEvoCharges(state, targetPlayer);
      setSuperEvoCharges(state, targetPlayer, Math.min(MAX_SEP, current + amt));
      logEvent("recoverSEP", { owner: targetPlayer, amount: amt });
      break;
    }
    default:
      console.warn(`ep op: unknown action ${action}`);
  }
}

export function registerResourceEffects() {
  // ========================================================================
  // UNIFIED PP - replaces gain_max_pp, recover_pp
  // action: "gain_max" = increase max PP
  // action: "recover" = restore current PP
  // ========================================================================
  registerOp("pp", (eff, ctx) =>
    handlePP(eff as any, ctx.owner, ctx.sourceCard),
  );

  // ========================================================================
  // UNIFIED EP - replaces recover_ep
  // action: "recover" = restore evolution points
  // ========================================================================
  registerOp("ep", (eff, ctx) => handleEP(eff as any, ctx.owner));

  // Shadows / Necromancy
  registerOp("add_shadows", (eff, ctx) => {
    const amt = (eff.amount || 1) as number;
    addShadows(state, ctx.owner, amt);
  });

  // Earth Rite
  registerOp("earth_rite", (eff, ctx) => {
    // Accept both "cost" and "amount" fields for the sigil cost
    const sigilCost = (eff.cost as number) ?? (eff.amount as number) ?? 1;
    if (consumeEarthSigils(ctx.owner, sigilCost)) {
      if (eff.effects) enqueueManyFront(ctx, eff.effects);
    }
  });

  // ========================================================================
  // DRAW - deck only, thins deck (stochastic card acquisition)
  // For token generation, use "add_to_hand" op
  // For filtered deck search, use "search" op
  // ========================================================================
  registerOp("draw", (eff, ctx) => handleDraw(eff, ctx.owner));

  // ========================================================================
  // ADD_TO_HAND - add card to hand (does NOT thin deck)
  // source: "named" (default) = create token from database
  // source: "copy" = duplicate existing card from target
  // ========================================================================
  registerOp("add_to_hand", (eff, ctx) => {
    const tCtx = getTargetingContext(ctx);
    const fromUids = tCtx.targetUids?.length
      ? resolveUids(tCtx.targetUids)
      : [];
    const selected =
      fromUids.length > 0 ? fromUids : (ctx.context as any)?.selected;
    handleAddToHand(eff, ctx.owner, ctx.sourceCard, {
      selected,
      lastDrawn: (state as any).lastDrawnCard,
    });
  });

  // ========================================================================
  // SEARCH - distinct from draw for AI training semantics
  // Searches deck for matching cards, adds to hand, shuffles deck
  // ========================================================================
  registerOp("search", (eff, ctx) => handleSearch(eff, ctx.owner));

  // ========================================================================
  // UNIFIED DISCARD - replaces discard_select_hand, discard_all_except_named
  // mode: "select" = select cards to discard (default)
  // mode: "except_named" = discard all except named cards
  // ========================================================================
  registerOp("discard", (eff, ctx) => {
    if (handleDiscard(eff, ctx.owner, ctx.queue) === "pending")
      return "pending";
  });

  // Legacy transform_in_hand and transform_random_spell_in_hand
  // are now handled by unified transform op with zone: "hand"

  // ========================================================================
  // UNIFIED DECK - replaces replace_deck, replace_deck_with_set_minus,
  // halve_deck_cost, reduce_deck_followers_cost
  // set_cost_last_drawn is now handled by cost op with target: "last_drawn"
  // NOTE: Synchronous import ensures deterministic effect execution order
  // ========================================================================
  registerOp("deck", (eff, ctx) => {
    handleDeck(eff, ctx.owner, { adapter: getAdapter(ctx) });
  });

  // ========================================================================
  // UNIFIED CREST - replaces gain_crest, crest_add_counter, crest_pay_counter, destroy_crest, crest_advance_countdown
  // ========================================================================
  registerOp("crest", (eff, ctx) => {
    handleCrest(eff as any, { owner: ctx.owner });
  });

  // ==========================================================================
  // UNIFIED FUSE - replaces fuse_start, start_fuse_from_card, fuse_finalize_*
  // ==========================================================================
  registerOp("fuse", (eff, ctx) => {
    const result = handleFuse(
      eff as any,
      ctx.owner,
      ctx.sourceCard,
      ctx.queue,
      ctx.context as EffectContext,
    );
    if (result === "pending") return "pending";
    doLog("fuse", {
      owner: ctx.owner,
      action: eff.action,
      type: (eff as any).type,
    });
  });

  // start_fortifier_fuse is now handled by fuse op with type: "fortifier"
}

import { RESOURCE_OPS } from "./resourcesOps.js";
export const OPS = RESOURCE_OPS;
