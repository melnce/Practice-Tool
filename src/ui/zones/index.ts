// src/ui/zones/index.ts
import { byId } from "../dom.js";
import { GameState, CardInstance } from "../../core/types.js";
import { enableBoardDropForOwnSide } from "../drag.js";
import { buildZoneContext } from "./selectors.js";
import { getMemoizedViewModel } from "./memoization.js";
import { renderCardDOM } from "./dom.js";
import { attachHandlers } from "./handlers.js";
import { CardViewModel } from "./types.js";

// Helper to track VM on DOM
interface ReconcilableElement extends HTMLElement {
  __cachedVM?: CardViewModel;
}

export function renderZone(
  containerId: string,
  cards: CardInstance[],
  state: GameState,
  rerender: () => void,
  clickable = false,
  onClick?: (i: number) => void,
): void {
  const container = byId(containerId);
  if (!container) return;

  const ctx = buildZoneContext(containerId, state);

  // 1. One-time Interaction Setup (Do not re-bind on every render)
  if (ctx.isBoard && ctx.isMyBoard && !ctx.isMulligan) {
    if (!container.ondragover) {
      container.ondragover = (e) => e.preventDefault();
      enableBoardDropForOwnSide(container, containerId, state);
    }
  }

  const tooltipEl = document.getElementById("cardTooltip");

  // 2. Map Existing DOM Nodes by UID
  // We assume strict UID uniqueness within a zone.
  const existingChildren = new Map<string, ReconcilableElement>();
  const childrenToRemove = new Set<ReconcilableElement>();

  // Stage 1: Index existing children
  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i] as ReconcilableElement;
    // dataset properties are strings, ensure we access consistently
    // renderCardDOM logic sets: div.dataset.uid = vm.uid;
    if (child.dataset.uid) {
      existingChildren.set(child.dataset.uid, child);
      childrenToRemove.add(child); // Assume removal until proven guilty
    }
  }

  // 3. Reconciliation Loop
  cards.forEach((card, i) => {
    // VM Generation (Fast)
    const vm = getMemoizedViewModel(card, i, ctx, state);

    const el = existingChildren.get(card.uid);

    if (el) {
      // MATCH FOUND
      childrenToRemove.delete(el); // Don't remove this one

      // IDENTITY CHECK: Is it the exact same VM reference?
      if (el.__cachedVM === vm) {
        // OPTIMIZATION: Zero DOM work.
        // We just ensure it's in the right position (reordering)
        if (container.children[i] !== el) {
          // This moves the node without destroying it
          container.insertBefore(el, container.children[i] || null);
        }
        return;
      }
    }

    // MISS or STALE: Render fresh
    // Note: We deliberately create new DOM if VM changes to ensure all attributes/classes update.
    // A "Super Top Tier" would diff attributes, but that's overkill for this scope.
    const newEl = renderCardDOM(
      vm,
      `${containerId}-${i}`,
      tooltipEl,
      ctx.isBoard,
    ) as ReconcilableElement;
    newEl.__cachedVM = vm; // Tag it

    attachHandlers(
      newEl,
      vm,
      ctx,
      state,
      rerender,
      clickable ? onClick : undefined,
    );

    if (el) {
      // Replace in place (preserves scroll/focus better than append, if we replace node)
      // Actually, we want to update the existing slot or insert at new slot.
      // If we have an existing element for this UID but the VM changed (or we are moving it),
      // replaceChild is good IF it is in the DOM.
      // However, we need to respect the loop index `i`.

      // Logic:
      // 1. If el is already at container.children[i], replace it there.
      // 2. If el is elsewhere, we need to move it to i.

      // Simplest safe DOM manipulation:
      // Insert `newEl` at index `i`.
      // If `el` exists in DOM, verify uniqueness or remove it?
      // `el` is currently in the DOM.
      // If we use replaceChild, we effectively remove `el` and put `newEl` in its spot.
      // But its "spot" might be wrong if reordering happened.

      // Allow `insertBefore` to handle positioning.
      // We first replace `el` with `newEl` ONLY if we want to preserve position?
      // No, the array `cards` defines the correct position `i`.
      // So we just want `newEl` to be at `container.children[i]`.

      // If we just `container.insertBefore(newEl, container.children[i])`,
      // we might be duplicating if `el` is still floating around further down?
      // No, we tracked `el`. We should replace `el` with `newEl` globally first?
      // Actually, the user snippet logic was:

      /*
            if (el) {
                // Replace in place (preserves scroll/focus better than append)
                container.replaceChild(newEl, el);
            } else {
                // New Append
                container.insertBefore(newEl, container.children[i] || null);
            }
            */

      // Wait, if `el` is at index 5 and we need it at index 0, `replaceChild` keeps it at index 5.
      // Then the array loop continues.
      // This implementation relies on the fact that if we replace it, it stays in the DOM but potentially at the wrong index initially.
      // But if we iterate `i` from 0 to N, we need strict ordering.

      // User's snippet might be slightly buggy on re-order if `replaceChild` doesn't account for slot.
      // BUT: `container.insertBefore(newEl, container.children[i] || null)` guarantees position.
      // If we do `replaceChild`, we update the content of the node at `el`'s position.
      // If `el`'s position is wrong (old position), we still have a node in the DOM.
      // Then we might need to move it.

      // Alternative Step:
      // 1. Tag `el` for replacement.
      // 2. Insert `newEl` at `i`.
      // 3. Remove `el`?

      // Let's stick closer to standard keyed reconciliation:
      // The goal is: Ensure the node at `children[i]` matches `card.uid`.
      // If we have `el` (existing node for this UID):
      //    If `el` is already at `children[i]` -> Replace `el` with `newEl`.
      //    If `el` is NOT at `children[i]` -> Insert `newEl` at `i`. `el` will be effectively "removed" when we iterate past it or removed at end?
      //    Wait, complex.

      // Let's refine the User's snippet to be safe:
      // `container.replaceChild(newEl, el);` swaps them in place (old index).
      // Then:
      // `if (container.children[i] !== newEl) container.insertBefore(newEl, container.children[i] || null);`
      // This ensures it moves to the correct spot.

      container.replaceChild(newEl, el);
      if (container.children[i] !== newEl) {
        container.insertBefore(newEl, container.children[i] || null);
      }
    } else {
      // New Append/Insert
      container.insertBefore(newEl, container.children[i] || null);
    }
  });

  // 4. Cleanup Dead Nodes
  childrenToRemove.forEach((el) => el.remove());
}
