import { Player } from "../../../core/types.js";
import { state } from "../../../core/gameState.js";
import { clearCantAttack } from "./remove.js";
import { getBoard } from "../../../core/playerHelpers.js";

// Called at end-of-turn: if the *owner* of a locked card just ended their turn,
// the “until opponent EOT” lock has served its purpose → clear it.
export function clearExpiredCantAttackAtEOT(endedPlayer: Player) {
  const boards = [getBoard(state, "first"), getBoard(state, "second")];
  for (const board of boards) {
    for (const c of board) {
      if (!c || !c.keywordState) continue;
      const ks = c.keywordState;
      // EOT lock expires right after the owner's turn ends
      if (ks.cantAttackUntilOpponentEOT && ks.cantAttackOwner !== endedPlayer) {
        clearCantAttack(c);
      }
      // Optional absolute turn counter expiry
      if (
        typeof ks.cantAttackExpiresOnTurn === "number" &&
        (state.roundCount ?? 0) >= ks.cantAttackExpiresOnTurn
      ) {
        clearCantAttack(c);
      }
    }
  }
}















