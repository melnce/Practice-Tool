// src/logic/index.ts
export { playCard } from "./core/playCard.js";
export { useRedBoost } from "./boosts.js";
export { endTurnBlue, endTurnRed } from "./core/turns.js";
export { attackFollower, attackLeader, handleDropOnLeader } from "./core/combat.js";
// @ts-ignore
export { grantBarrier, dealDamage } from "./core/barrier.js";
// @ts-ignore
export { startGame } from "./startGame.js";
export { onEvolve } from "./evolveUtils.js";
import { onFanfare, runEffects } from "./core/effects/index.js";
export { onFanfare, runEffects };
// @ts-ignore
export { engageAmulet } from "./effects/ops/engage.js";
export { resolvePendingTarget } from "./core/resolveTarget.js";
// @ts-ignore
export { summonNamed } from "./effects/ops/summon.js";
export { getCardDetails } from "../data/cardDatabase.js";

// Expose to window

// @ts-ignore
import { startGame as _startGame } from "./startGame.js";
import { endTurnBlue as _endTurnBlue, endTurnRed as _endTurnRed } from "./core/turns.js";
import { useRedBoost as _useRedBoost } from "./boosts.js";
import "../data/cardDatabase.js";
// @ts-ignore
import { summonNamed as _summonNamed } from "./effects/ops/summon.js";
import { getCardDetails as _getCardDetails } from "../data/cardDatabase.js";
import { state } from "../core/gameState.js";
import { Player } from "../core/types.js";

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
