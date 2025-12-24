// src/logic/core/playCard/specialCases.ts
// Special handling for specific cards that require non-standard behavior DURING play.
// This is NOT for preflight checks (those are in preflight.ts).
// Only amulet merging and similar post-play behaviors belong here.

import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types.js";
import { getBoard, getGraveyard, addShadows } from "../../../core/playerHelpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// Witch's New Brew Merge Logic
// When a new Witch's New Brew enters the field, merge counters from existing
// Brew/Sediment amulets and destroy the old ones.
// TODO: Consider moving this to JSON effect data in future.
// ─────────────────────────────────────────────────────────────────────────────

// Card IDs for reference (not used in logic since merge uses same name check):
// Witch's New Brew: needs lookup
// Magic Sediment: token, may not have stable ID

const BREW_NAMES = new Set(["witch's new brew", "magic sediment"]);

export function mergeWitchsNewBrewOnPlay(newCard: CardInstance, owner: Player) {
  // Only for Witch's New Brew amulet
  if (newCard?.type !== "Amulet") return;
  if (!BREW_NAMES.has(String(newCard.name).toLowerCase())) return;
  if (String(newCard.name).toLowerCase() !== "witch's new brew") return;

  const board = getBoard(state, owner);
  const grave = getGraveyard(state, owner);

  const newIndex = board.lastIndexOf(newCard);
  if (newIndex < 0) return;

  const sum: Record<string, number> = {};
  const toRemove: number[] = [];

  for (let i = 0; i < board.length; i++) {
    if (i === newIndex) continue;
    const c = board[i];
    if (c && c.type === "Amulet") {
      const cardName = String(c.name).toLowerCase();
      if (BREW_NAMES.has(cardName)) {
        if ((c as any).counters && typeof (c as any).counters === "object") {
          for (const [k, v] of Object.entries((c as any).counters)) {
            sum[k] = (sum[k] || 0) + (Number(v) || 0);
          }
        }
        toRemove.push(i);
      }
    }
  }

  if (!toRemove.length) return;

  (newCard as any).counters = (newCard as any).counters || {};
  for (const [k, v] of Object.entries(sum)) {
    (newCard as any).counters[k] = ((newCard as any).counters[k] || 0) + v;
  }

  toRemove.sort((a, b) => b - a);
  for (const idx of toRemove) {
    const removed = board.splice(idx, 1)[0];
    if (removed) {
      grave.push(removed);
      addShadows(state, owner, 1);
    }
  }
}















