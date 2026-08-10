// src/logic/core/targeting/selection.ts
import type { CardInstance } from "../../../core/types/index.js";

/**
 * Toggles a card's presence in the pending selection.
 * Mutates pending.targets and card.isSelectable flag.
 * @deprecated Use toggleSelectionUid for UID-only targeting
 */
export function toggleSelection(
  pending: any,
  target: CardInstance,
): "added" | "removed" {
  const idx = pending.targets.findIndex((t: any) => t.uid === target.uid);
  if (idx !== -1) {
    pending.targets.splice(idx, 1);
    return "removed";
  } else {
    pending.targets.push(target);
    target.isSelectable = false;
    return "added";
  }
}

/**
 * Toggles a UID's presence in targetUids array.
 * Pure UID-based selection for modern targeting.
 */
export function toggleSelectionUid(
  targetUids: string[],
  uid: string,
): "added" | "removed" {
  const idx = targetUids.indexOf(uid);
  if (idx !== -1) {
    targetUids.splice(idx, 1);
    return "removed";
  } else {
    targetUids.push(uid);
    return "added";
  }
}
