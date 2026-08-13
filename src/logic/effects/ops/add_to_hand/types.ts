// src/logic/effects/ops/add_to_hand/types.ts
// Types for the ADD_TO_HAND operation - adds cards to hand.
// Source determines where the card comes from:
// - "named": Create from card database by name (token generation)
// - "copy": Duplicate from an existing target card
// - "destroyed_match": Recreate cards matching the owner's destroyed history

import type { Effect } from "../../../../core/types/index.js";
import type { DestroyedMatchFilter } from "../../../core/destroyedHistory.js";

/**
 * CANONICAL FORMAT for add_to_hand op:
 *
 * Create named token:
 * { "op": "add_to_hand", "name": "Fairy", "count": 2 }
 *
 * Copy existing card:
 * { "op": "add_to_hand", "source": "copy", "target": "selected", "count": 1 }
 */

export type AddToHandSource = "named" | "copy" | "destroyed_match";
export type AddToHandPlayer = "ally" | "enemy";
// Base copy target - where to copy from
export type CopyTargetBase = "selected" | "last_drawn" | "trigger" | "self";
// Type filter for copy target (what type of card can be selected)
export type CopyTargetFilter = "follower" | "spell" | "amulet" | "any" | null;
/** Zone to sample exact copies from (instance clones). */
export type AddToHandFromZone =
  | "ally:hand"
  | "enemy:hand"
  | "ally:deck"
  | "enemy:deck";

export interface UnifiedAddToHandSpec {
  op: "add_to_hand";
  source: AddToHandSource; // Where the card comes from - default: "named"
  name: string | null; // Card name (required when source=named)
  target: CopyTargetBase | null; // What to copy (required when source=copy without from)
  targetFilter: CopyTargetFilter; // Type filter on target (e.g., follower, any)
  /** Exact-copy sample zone (Goddess / Wolfraud / Legacy). Implies source=copy. */
  from: AddToHandFromZone | null;
  filter: DestroyedMatchFilter;
  distinctBy: string | null;
  distribution: string | null;
  count: number; // How many to add - REQUIRED
  player: AddToHandPlayer; // Who receives - default: ally
  keywords: string[]; // Keywords to apply
}

/**
 * Normalize an add_to_hand effect to unified spec.
 * STRICT: Throws on missing required fields.
 */
export function normalizeToAddToHandSpec(
  eff: Effect & Record<string, any>,
): UnifiedAddToHandSpec {
  // ========================================================================
  // Determine source: "named" (default), "copy", or "destroyed_match"
  // A `from` zone sample implies exact-copy sampling.
  // ========================================================================
  const fromRaw =
    typeof eff.from === "string" ? String(eff.from).toLowerCase().trim() : "";
  const validFrom: AddToHandFromZone[] = [
    "ally:hand",
    "enemy:hand",
    "ally:deck",
    "enemy:deck",
  ];
  const from: AddToHandFromZone | null = validFrom.includes(
    fromRaw as AddToHandFromZone,
  )
    ? (fromRaw as AddToHandFromZone)
    : null;
  if (fromRaw && !from) {
    throw new Error(
      `[add_to_hand] Invalid "from" zone: "${eff.from}". ` +
        `Must be: ${validFrom.join(", ")}. Effect: ${JSON.stringify(eff)}`,
    );
  }

  const sourceRaw = String(eff.source || (from ? "copy" : "named"))
    .toLowerCase()
    .trim();
  const source: AddToHandSource =
    sourceRaw === "copy" || from
      ? "copy"
      : sourceRaw === "destroyed_match"
        ? "destroyed_match"
        : "named";

  // ========================================================================
  // Validate based on source
  // ========================================================================
  let name: string | null = null;
  let target: CopyTargetBase | null = null;
  let targetFilter: CopyTargetFilter = null;
  const filter: DestroyedMatchFilter =
    eff.filter && typeof eff.filter === "object" && !Array.isArray(eff.filter)
      ? { ...eff.filter }
      : {};
  const distinctBy =
    typeof eff.distinct_by === "string" ? eff.distinct_by.trim() : null;
  const distribution =
    typeof eff.distribution === "string" ? eff.distribution.trim() : null;

  if (source === "named") {
    // REQUIRED: name
    if (!eff.name || typeof eff.name !== "string" || !eff.name.trim()) {
      throw new Error(
        `[add_to_hand] source="named" requires "name" field. ` +
          `Effect: ${JSON.stringify(eff)}`,
      );
    }
    name = eff.name.trim();
  } else if (source === "copy" && !from) {
    // REQUIRED: target (can be composite like "selected:follower")
    // Skipped when sampling a zone via `from` (exact copies of zone instances).
    if (!eff.target) {
      throw new Error(
        `[add_to_hand] source="copy" requires "target" or "from" field. ` +
          `Target must be: "selected", "selected:follower", "selected:any", "last_drawn", "trigger", or "self". ` +
          `Effect: ${JSON.stringify(eff)}`,
      );
    }

    // Parse composite target (e.g., "selected:follower" → base: "selected", filter: "follower")
    const targetRaw = String(eff.target).toLowerCase().trim();
    const validBases: CopyTargetBase[] = [
      "selected",
      "last_drawn",
      "trigger",
      "self",
    ];
    const validFilters: CopyTargetFilter[] = [
      "follower",
      "spell",
      "amulet",
      "any",
    ];

    if (targetRaw.includes(":")) {
      const [baseStr, filterStr] = targetRaw.split(":");
      if (!validBases.includes(baseStr as CopyTargetBase)) {
        throw new Error(
          `[add_to_hand] Invalid target base: "${baseStr}". ` +
            `Must be: ${validBases.join(", ")}. ` +
            `Effect: ${JSON.stringify(eff)}`,
        );
      }
      if (!validFilters.includes(filterStr as CopyTargetFilter)) {
        throw new Error(
          `[add_to_hand] Invalid target filter: "${filterStr}". ` +
            `Must be: ${validFilters.join(", ")}. ` +
            `Effect: ${JSON.stringify(eff)}`,
        );
      }
      target = baseStr as CopyTargetBase;
      targetFilter = filterStr as CopyTargetFilter;
    } else {
      // STRICT: Bare target without filter - REJECT for AI training clarity
      throw new Error(
        `[add_to_hand] Bare target "${eff.target}" is ambiguous for AI training. ` +
          `Target MUST include explicit type filter. ` +
          `Use: "selected:follower", "selected:any", "last_drawn:any", etc. ` +
          `Effect: ${JSON.stringify(eff)}`,
      );
    }
  }

  // ========================================================================
  // REQUIRED: count
  // ========================================================================
  if (eff.count === undefined) {
    throw new Error(
      `[add_to_hand] Missing required field: "count". ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }
  const count = parseInt(String(eff.count), 10);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(
      `[add_to_hand] Invalid count: "${eff.count}". Must be non-negative. ` +
        `Effect: ${JSON.stringify(eff)}`,
    );
  }

  // ========================================================================
  // OPTIONAL: player (default: ally)
  // ========================================================================
  const playerRaw = String(eff.player || "ally")
    .toLowerCase()
    .trim();
  const player: AddToHandPlayer = playerRaw === "enemy" ? "enemy" : "ally";

  // ========================================================================
  // OPTIONAL: keywords
  // ========================================================================
  let keywords: string[] = [];
  if (Array.isArray(eff.keywords)) {
    keywords = eff.keywords
      .map((kw: any) => {
        if (typeof kw === "string") return kw;
        if (typeof kw === "object" && kw?.name) return kw.name;
        return "";
      })
      .filter((k: string) => k.length > 0);
  }

  return {
    op: "add_to_hand",
    source,
    name,
    target,
    targetFilter,
    from,
    filter,
    distinctBy,
    distribution,
    count,
    player,
    keywords,
  };
}
