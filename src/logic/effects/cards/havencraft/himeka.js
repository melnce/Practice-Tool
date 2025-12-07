// /gamelogic/effects/cards/havencraft/himeka.js
import { state } from "@core/gameState.js";
import { applyKeyword, clearCantAttack } from "@logic/core/keywords.js";
import { handleBanish } from "@logic/effects/ops/banish.js";
import { rand, randInt } from "@core/rng.js";
import { logEvent } from "@core/logger.js"; // Add import


/**
 * One execution = affect ONE random valid enemy.
 * You already repeat this effect X times via repeat_effect crest_count.
 */
export function handleHimekaCrestEffect(owner) {
  const enemyBoard = owner === "blue" ? state.redBoard : state.blueBoard;

  // Ensure queue exists
  if (!Array.isArray(state.himekaPendingBanish)) state.himekaPendingBanish = [];

  // Build a Set of already-queued targets for THIS owner (so we don't hit same unit twice)
  const alreadyQueued = new Set(
    state.himekaPendingBanish
      .filter(e => e && e.owner === owner && e.target)  // only this crest owner
      .map(e => e.target)
  );

  // valid = follower with 4 attack or less AND not already queued
  const valid = enemyBoard.filter(c =>
    c?.type === "Follower" &&
    (parseInt(c.attack) || 0) <= 4 &&
    !alreadyQueued.has(c)
  );
  if (!valid.length) return false;

  // Random pick among remaining unique candidates
  const pick = valid[randInt(valid.length)];

  // Lock until opponent's EOT
  applyKeyword(pick, "cant_attack", { until_opponent_eot: true });

  // Log the himeka lock effect
  logEvent("himekaLock", { owner, target: pick.name, uid: pick.uid });

  // Queue for banish on opponent EOT
  state.himekaPendingBanish.push({ target: pick, owner });

  return true;
}

/**
 * Called from endTurnBlue/endTurnRed with endedPlayer = "blue" | "red".
 * Banish any entries whose opponent just ended their turn.
 */
export function processHimekaDelayedBanish(endedPlayer) {
  const list = Array.isArray(state.himekaPendingBanish) ? state.himekaPendingBanish : [];
  if (!list.length) return;

  const keep = [];
  for (const entry of list) {
    // Only banish when the *opponent* of the crest owner ends their turn
    const shouldBanishNow = endedPlayer !== entry.owner;
    if (!shouldBanishNow) { keep.push(entry); continue; }

    // Still on board?
    const enemyBoard = entry.owner === "blue" ? state.redBoard : state.blueBoard;
    if (enemyBoard.includes(entry.target)) {
      // Optional: clear the temporary lock before removing for clean UI
      clearCantAttack(entry.target);
      
      // Log the himeka banish effect
      logEvent("himekaBanish", { owner: entry.owner, target: entry.target.name, uid: entry.target.uid });
      
      handleBanish(entry.target);
    }
    // either way, do not re-queue this entry
  }
  state.himekaPendingBanish = keep;
}
