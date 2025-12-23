// src/logic/effects/ops/spellboost/unified.ts

import { CardInstance, Player, Effect } from "../../../../core/types.js";
import { resolveDynamicValue } from "../../../core/values.js";
import { normalizeToSpellboostSpec } from "./types.js";

// Import existing spellboost logic to reuse
import { spellboostHand, handleSetSpellboostCount } from "../spellboost.js";

/**
 * Unified spellboost handler - handles all spellboost variants.
 * Replaces 5 legacy spellboost handlers.
 */
export function handleSpellboost(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any = {},
): "done" {
  const spec = normalizeToSpellboostSpec(eff);
  const count = resolveDynamicValue(spec.count, {
    owner,
    sourceCard,
    ...context,
  });

  if (count === 0) return "done"; // no-op case

  switch (spec.mode) {
    case "set":
      // Set spellboost count to specific value
      if (sourceCard) {
        handleSetSpellboostCount({ amount: count }, sourceCard);
      }
      break;

    case "boost":
    default:
      // Apply spellboost to target(s)
      if (spec.target === "self" && sourceCard) {
        // Single card spellboost
        spellboostHand(owner, 1, sourceCard);
      } else {
        // Whole hand spellboost
        spellboostHand(owner, count);
      }
      break;
  }

  return "done";
}
