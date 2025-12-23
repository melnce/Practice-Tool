export const COMBAT_OPS = [
  "damage", // Unified damage op - handles all damage variants via distribution/amount_source fields
  "destroy", // Unified destroy op - handles all destroy variants via distribution/scope fields
  "banish", // Unified banish op - handles all banish variants via distribution/scope fields
  "restore", // Unified restore op - handles leader heal + follower defense restore

  // Leader state now handled by:
  // - stat op with target: ally:leader / enemy:leader (for defense/max HP)
  // - keyword op with target: ally:leader / enemy:leader (for Barrier, MaxDamageCap, Vulnerable)

  // Combat mechanic
  "clash_damage",
] as const;
