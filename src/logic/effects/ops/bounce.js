import { state } from "@core/gameState.js";
import { getPool, highlightSelectable } from "@logic/core/targeting.js";
import { pushToHand } from "@core/utils.js";
import { getCardDetails } from "@data/cardDatabase.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { makeUid } from "@core/rng.js";
import { logEvent } from "@core/logger.js";


// Create a fresh base copy (new uid)
function freshBaseCopyByName(name) {
  const base = getCardDetails(name);
  if (!base) return null;
  const copy = JSON.parse(JSON.stringify(base));
  copy.uid = makeUid();
  return copy;
}

// Remove from board and push a *reset* copy to the correct hand.
export function bounceToHand(card) {
  let fromArr = null;
  let toHand = null;
  let owner = null; // FIX: Declare the 'owner' variable.

  const bi = state.blueBoard.indexOf(card);
  const ri = state.redBoard.indexOf(card);

  // FIX: Determine the owner based on which board the card was on.
  if (bi !== -1) { 
    fromArr = state.blueBoard; 
    toHand = state.blueHand; 
    owner = "blue"; 
  } else if (ri !== -1) { 
    fromArr = state.redBoard; 
    toHand = state.redHand; 
    owner = "red"; 
  } else {
    return; // Card not on a board; ignore.
  }

  // FIX: Call the trigger now that 'owner' is correctly defined.
 fireTrigger("follower_leaves_field", owner);

  const [removed] = fromArr.splice(fromArr.indexOf(card), 1);
  if (!removed) return;

  const fresh = freshBaseCopyByName(removed.name);
  if (!fresh) return; // no DB entry → nothing to add

  pushToHand(toHand, fresh);
  logEvent("bounceToHand", { from: owner, name: removed.name, oldUid: removed.uid, newUid: fresh.uid });
}

// Handle "return_to_hand" effect
export function handleReturnToHand(eff, owner, sourceCard = null, effectsQueue) {
  // allow followers + amulets by default; narrow if filters.type is given
  let pool = getPool(eff.target, owner).filter(c => c.type === "Follower" || c.type === "Amulet");
  if (eff.filters?.type) {
    const want = String(eff.filters.type).toLowerCase();
    pool = pool.filter(c => (c.type || "").toLowerCase() === want);
  }

  // If there's a source card, filter it out of the pool so it can't target itself.
  if (sourceCard) {
    pool = pool.filter(c => c.uid !== sourceCard.uid);
  }

  if (!pool.length) return;

  if (eff.select) {
    state.pendingTargetEffect = {
      eff,
      owner,
      sourceCard,
      resumeEffects: effectsQueue,
      pool,
      targets: [],
      selectCount: parseInt(eff.select_count || 1),
    };
    logEvent("returnToHand_select", { owner, pool: pool.length, select: parseInt(eff.select_count||1) });
    highlightSelectable(pool);
    return "pending";
  }

  // non-select → bounce all matching
  for (const t of pool) bounceToHand(t);
}
