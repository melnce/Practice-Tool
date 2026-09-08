import type { Player } from "../../../core/types/index.js";
import { state } from "../../../core/gameState.js";
import { clearCantAttack, clearAmbush } from "./remove.js";
import { getBoard } from "../../../core/playerHelpers.js";

// Called at end-of-turn: clear temporary keyword locks whose duration has elapsed.
export function clearExpiredTemporaryKeywordsAtEOT(endedPlayer: Player) {
  const boards = [getBoard(state, "first"), getBoard(state, "second")];
  for (const board of boards) {
    for (const c of board) {
      if (!c || !c.keywordState) continue;
      const ks = c.keywordState;

      // Can't Attack — until opponent EOT expires after the opponent's turn ends
      if (ks.cantAttackUntilOpponentEOT && ks.cantAttackOwner !== endedPlayer) {
        clearCantAttack(c);
      }
      if (
        typeof ks.cantAttackExpiresOnTurn === "number" &&
        (state.roundCount ?? 0) >= ks.cantAttackExpiresOnTurn
      ) {
        clearCantAttack(c);
      }

      // Ambush — same duration primitives; clears root hasAmbush via clearAmbush
      if (ks.ambushUntilOpponentEOT && ks.ambushOwner !== endedPlayer) {
        clearAmbush(c);
      }
      if (
        typeof ks.ambushExpiresOnTurn === "number" &&
        (state.roundCount ?? 0) >= ks.ambushExpiresOnTurn
      ) {
        clearAmbush(c);
      }
    }
  }
}

/** @deprecated Use clearExpiredTemporaryKeywordsAtEOT */
export const clearExpiredCantAttackAtEOT = clearExpiredTemporaryKeywordsAtEOT;
