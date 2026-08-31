// src/logic/effects/ops/spellboost/unified.ts

import type {
  CardInstance,
  Player,
  Effect,
} from "../../../../core/types/index.js";
import { resolveDynamicValue } from "../../../core/values.js";
import { resolveUids } from "../../../../core/uidResolver.js";
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
      // Apply spellboost to target(s)
      if (spec.target === "self" && sourceCard) {
        // Single card spellboost (ability owner). Honour count.
        spellboostHand(owner, count, sourceCard);
      } else if (spec.target === "ally:hand") {
        // Whole hand spellboost
        spellboostHand(owner, count);
      } else if (spec.target === "selected") {
        // Chosen card(s) from a nested select — do not fall back if empty.
        const uids = context?.targetUids;
        if (!Array.isArray(uids) || uids.length === 0) {
          return "done";
        }
        for (const card of resolveUids(uids)) {
          spellboostHand(owner, count, card);
        }
      }
      break;
  }

  return "done";
}
