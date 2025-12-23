// src/logic/core/targeting/selection.ts
import { CardInstance } from "../../../core/types.js";

/**
 * Toggles a card's presence in the pending selection.
 * Mutates pending.targets and card.isSelectable flag.
 */
export function toggleSelection(
  pending: any,
  target: CardInstance,
): "added" | "removed" {
  const idx = pending.targets.findIndex((t: any) => t.uid === target.uid);
  if (idx !== -1) {
    // Unselect
    pending.targets.splice(idx, 1);
    // Re-enable selection flag if needed (though usually orchestrator clears all on end)
    // But for toggling off, we might want to make it selectable again immediately?
    // resolveTarget.ts didn't explicitly set isSelectable = true on unselect??
    // Let's check resolveTarget.ts logic.
    // Line 284: pending.targets.splice(idx, 1).
    // Line 313: clickedTarget.isSelectable = false.
    // It does NOT set isSelectable = true on unselect.
    // But existing behavior implies it might need to?
    // If current code doesn't do it, I won't do it. "Bit-for-bit identical".
    // Wait, if I unselect, I should be able to select it again.
    // The renderer likely resets isSelectable based on pool?
    // clearSelectableFlags() is called on cleanup.
    // During selection, highlightSelectable() is called?
    // Let's assume the renderer or `adapter.render()` handles it based on `pending.pool`.
    // I will NOT touch isSelectable here to match resolveTarget.ts exactly (unless I see it there).
    // resolveTarget.ts line 281-291: Just splices.
    return "removed";
  } else {
    // Select
    pending.targets.push(target);
    target.isSelectable = false; // Mark dependencies (visual)
    return "added";
  }
}
