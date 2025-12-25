// =============================================================================
// PLAYER SLOT UTILITIES
// =============================================================================
// Runtime constants for player slot mapping.
// Separated from type definitions to allow type-only imports.

import type { PlayerSlot, LegacyPlayer } from "./types/player.js";

/**
 * Maps semantic slots to legacy display names.
 * Use ONLY for UI display purposes (labels, CSS classes, etc).
 */
export const SLOT_TO_LEGACY: Record<PlayerSlot, LegacyPlayer> = {
    first: "blue",
    second: "red",
};
