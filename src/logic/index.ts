// src/logic/index.ts
export { playCard } from "@logic/core/playCard.js";
export { useRedBoost } from "@logic/boosts.js";
export { endTurnBlue, endTurnRed } from "@logic/core/turns.js";
export { attackFollower, attackLeader, handleDropOnLeader } from "@logic/core/combat.js";
// @ts-ignore
export { grantBarrier, dealDamage } from "@logic/core/barrier.js";
// @ts-ignore
export { startGame } from "@logic/startGame.js";
export { onEvolve } from "@logic/evolveUtils.js";
export { onFanfare, runEffects } from "@logic/core/effects.js";
// @ts-ignore
export { engageAmulet } from "@logic/effects/ops/engage.js";
export { resolvePendingTarget } from "@logic/core/resolveTarget.js";
// @ts-ignore
export { summonNamed } from "@logic/effects/ops/summon.js";
export { getCardDetails } from "@data/cardDatabase.js";

// Expose to window
import { runEffects } from "@logic/core/effects.js";
// @ts-ignore
import { startGame as _startGame } from "@logic/startGame.js";
import { endTurnBlue as _endTurnBlue, endTurnRed as _endTurnRed } from "@logic/core/turns.js";
import { useRedBoost as _useRedBoost } from "@logic/boosts.js";
import "@data/cardDatabase.js";
// @ts-ignore
import { summonNamed as _summonNamed } from "@logic/effects/ops/summon.js";
import { getCardDetails as _getCardDetails } from "@data/cardDatabase.js";
import { state } from "@core/gameState.js";
import { Player } from "@core/types.js";

export function startFuseFromHand(owner: Player, initiatorUid: string) {
    runEffects([{
        op: "start_fuse_from_card",
        initiator_uid: initiatorUid
    }], owner, null); // sourceCard null?
}

(window as any).startGame = _startGame;
(window as any).endTurnBlue = _endTurnBlue;
(window as any).endTurnRed = _endTurnRed;
(window as any).useRedBoost = _useRedBoost;
(window as any).summonNamed = _summonNamed;
(window as any).getCardDetails = _getCardDetails;
(window as any)._gameState = state;
(window as any).getGameState = () => state;
(window as any).startFuseFromHand = startFuseFromHand;
