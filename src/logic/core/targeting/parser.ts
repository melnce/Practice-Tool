import type { TargetQuery } from "./types.js";
import { logEvent } from "../../../core/logger.js";

/**
 * Parses a raw target string into a normalized Query object.
 * Mirroring legacy `getPool` parsing logic.
 */
export function parseTargetQuery(
  targetSpec: string,
  condition: any,
): TargetQuery {
  const raw = String(targetSpec || "")
    .trim()
    .toLowerCase();

  // 1. Handle special string literals that map to specific contexts
  // LEGACY: Preserves "ally:last_summoned" syntax for replay compatibility
  if (raw === "ally:last_summoned" || raw === "last_summoned") {
    return {
      raw,
      side: "special",
      specialContext: "last_summoned",
      condition,
    };
  }

  // LEGACY: Preserves "entering_follower" syntax for trigger resolution
  if (raw === "entering_follower") {
    return {
      raw,
      side: "special",
      specialContext: "entering_follower",
      condition,
    };
  }

  // Support "played_card" for ally_follower_played triggers
  if (raw === "played_card") {
    return {
      raw,
      side: "special",
      specialContext: "played_card",
      condition,
    };
  }

  // Clash / follower_strike: the opposing combatant relative to sourceCard
  if (raw === "clash_opponent") {
    return {
      raw,
      side: "special",
      specialContext: "clash_opponent",
      condition,
    };
  }

  // 2. Handle "selected" (with optional subtype)
  if (raw === "selected" || raw.startsWith("selected:")) {
    const parts = raw.split(":");
    const sub = parts[1];
    const subtype = sub === "follower" || sub === "amulet" ? sub : undefined;
    return {
      raw,
      side: "selected",
      typeFilter: subtype,
      condition,
    };
  }

  // 3. Standard "side:type[:subtype]" parsing
  const parts = raw.split(":");
  const sideRaw = (parts[0] || "ally").trim();
  const typeRaw = (parts[1] || "").trim();
  const subtypeRaw = (parts[2] || "").trim();

  const parseTypeFilter = (
    seg: string,
  ): "follower" | "amulet" | "spell" | undefined => {
    if (seg === "follower") return "follower";
    if (seg === "amulet") return "amulet";
    if (seg === "spell") return "spell";
    return undefined;
  };

  const isEnemySide =
    sideRaw.startsWith("enemy") || sideRaw === "opp" || sideRaw === "opponent";

  // Hand zone: ally:hand[:type], ally:hand_card, enemy:hand[:type]
  if (typeRaw === "hand" || typeRaw === "hand_card") {
    if (isEnemySide) {
      return {
        raw,
        side: "enemy_hand",
        typeFilter: parseTypeFilter(subtypeRaw),
        condition,
      };
    }
    return {
      raw,
      side: "hand",
      typeFilter: parseTypeFilter(subtypeRaw),
      condition,
    };
  }

  // Map side to enum
  let side: TargetQuery["side"] = "ally";
  let excludeSelf = false;

  if (sideRaw === "hand") {
    side = "hand";
  } else if (sideRaw === "self") {
    side = "self";
  } else if (sideRaw === "attacker") {
    side = "attacker";
  } else if (
    sideRaw.startsWith("enemy") ||
    sideRaw === "opp" ||
    sideRaw === "opponent"
  ) {
    side = "enemy";
  } else if (sideRaw === "any" || sideRaw === "both" || sideRaw === "all") {
    side = "any";
  } else if (sideRaw === "other") {
    // "other:follower" = all followers on the field except the source (both sides)
    side = "any";
    excludeSelf = true;
  } else if (sideRaw === "other_allies") {
    side = "ally";
    excludeSelf = true;
  } else if (sideRaw !== "ally") {
    logEvent("targeting_unknown_side", { side: sideRaw, raw });
    console.warn(`[Targeting] Unknown target side "${sideRaw}" in "${raw}"`);
    return {
      raw,
      side: "unknown",
      condition,
    };
  }

  // Map type filter if present in string
  let typeFilter: "follower" | "amulet" | "spell" | undefined;
  if (typeRaw === "follower") typeFilter = "follower";
  else if (typeRaw === "amulet") typeFilter = "amulet";
  else if (typeRaw === "spell") typeFilter = "spell";

  return {
    raw,
    side,
    typeFilter,
    condition,
    excludeSelf,
  };
}
