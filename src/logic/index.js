// gameLogic.js (barrel + window bindings)
export { playCard } from "@logic/core/playCard.js";
export { useRedBoost } from "@logic/boosts.js";
export { endTurnBlue, endTurnRed } from "@logic/core/turns.js";
export { attackFollower, attackLeader, handleDropOnLeader } from "@logic/core/combat.js";
export { grantBarrier, dealDamage } from "@logic/core/barrier.js";
export { startGame } from "@logic/startGame.js";
export { onEvolve } from "@logic/evolveUtils.js";
export { onFanfare, runEffects } from "@logic/core/effects.js";
export { engageAmulet } from "@logic/effects/ops/engage.js";
export { resolvePendingTarget } from "@logic/core/resolveTarget.js";
export { summonNamed } from "@logic/effects/ops/summon.js";
export { getCardDetails } from "@data/cardDatabase.js";

// Expose to window
import { runEffects } from "@logic/core/effects.js";
import { startGame as _startGame } from "@logic/startGame.js";
import { endTurnBlue as _endTurnBlue, endTurnRed as _endTurnRed } from "@logic/core/turns.js";
import { useRedBoost as _useRedBoost } from "@logic/boosts.js";
import "@data/cardDatabase.js";
import { summonNamed as _summonNamed } from "@logic/effects/ops/summon.js";
import { getCardDetails as _getCardDetails } from "@data/cardDatabase.js";
import { state } from "@core/gameState.js";

export function startFuseFromHand(owner, initiatorUid) {
  runEffects([{
    op: "start_fuse_from_card",
    initiator_uid: initiatorUid
  }], owner, null);
}

window.startGame = _startGame;
window.endTurnBlue = _endTurnBlue;
window.endTurnRed = _endTurnRed;
window.useRedBoost = _useRedBoost;
window.summonNamed = _summonNamed;
window.getCardDetails = _getCardDetails;
window._gameState = state;
window.getGameState = () => state;
window.startFuseFromHand = startFuseFromHand;
