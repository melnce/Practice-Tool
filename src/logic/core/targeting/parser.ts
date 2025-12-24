import { TargetQuery } from "./types.js";

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
  if (raw === "ally:last_summoned") {
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

  // 3. Standard "side:type" parsing
  const parts = raw.split(":");
  let sideRaw = (parts[0] || "ally").trim();
  let typeRaw = (parts[1] || "").trim();

  // Mapping aliases
  // LEGACY: if side is "ally" and type is "hand", it means "hand"
  // This handles old card definitions that used "ally:hand" before standardization
  if (sideRaw === "ally" && typeRaw === "hand") {
    sideRaw = "hand";
    typeRaw = ""; // "hand" usually implies type is handled elsewhere or implicitly
  }

  // Map side to enum
  let side: TargetQuery["side"] = "ally";
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
  } else if (
    sideRaw === "any" ||
    sideRaw === "both" ||
    sideRaw === "all" ||
    sideRaw === "other"
  ) {
    side = "any";
  } else {
    side = "ally"; // default
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
  };
}















