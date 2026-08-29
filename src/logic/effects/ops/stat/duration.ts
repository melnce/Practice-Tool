import { state } from "../../../../core/gameState.js";
import type { CardInstance, Player } from "../../../../core/types/index.js";
import type { StatOp } from "./types.js";
import { resolveDynamicValue } from "../../../core/values.js";

/**
 * Wraps an operation with duration logic (Permanent vs Temporary).
 * Currently, only 'until_end_of_turn' is supported as a temporary mode.
 */
export function withBuffDuration(
  target: CardInstance,
  eff: StatOp,
  applyFn: (stats: { attack: number; defense: number }) => void,
  ctx: { owner?: Player; sourceCard?: CardInstance | null } = {},
) {
  // 1. Resolve stat changes if any (supports "-{self.attack}" etc.)
  const a = resolveDynamicValue(eff.attack as any, ctx);
  const d = resolveDynamicValue(eff.defense as any, ctx);

  // 2. Determine duration
  if (eff.until_end_of_turn || (eff as any).until_eot) {
    if (!target.temporaryBuffs) target.temporaryBuffs = [];
    target.temporaryBuffs.push({
      attack: a,
      defense: d,
      id: state.rng.makeUid("buff_"),
    });
  }

  // 3. Apply the change (permanent fields are used for both permanent and temporary in this engine,
  //    temporary removal logic subtracts them later)
  applyFn({ attack: a, defense: d });
}
