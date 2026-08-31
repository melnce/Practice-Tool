/**
 * Hand-card fuse vs pointer-drag discrimination.
 *
 * Owner rule (unchanged from the HTML5 DnD era):
 * - Released outside the hand zone → play/drop (handled by the pointer drag layer).
 * - Released inside the hand zone, initiator still in hand → fuse
 *   (pointer drag layer calls onFuseGesture).
 * - Plain click/tap with no drag → open fuse via the click path.
 * - A release that lands nowhere does nothing — never fuse.
 * - One gesture must never fire two actions.
 *
 * After any drag past the tap threshold, suppress a trailing `click` so one
 * gesture cannot fuse twice. Latch clears on every `pointerdown`.
 */

import { shouldSuppressClickFromPointerDrag } from "../pointerDragSession.js";

export interface HandDragClickOptions {
  /** DOM id of the hand container (`blueHand` / `redHand`). */
  handContainerId: string;
  /** True when the initiator card is still in the owner's hand. */
  isInitiatorStillInHand: () => boolean;
}

export interface HandDragClickSuppressor {
  /** Test hook: whether a drag gesture is currently suppressing clicks. */
  isSuppressing(): boolean;
  attach(
    el: HTMLElement,
    onFuseGesture: (ev: Event) => void,
    options: HandDragClickOptions,
  ): void;
}

export function createHandDragClickSuppressor(): HandDragClickSuppressor {
  let suppressClickFromDrag = false;

  return {
    isSuppressing() {
      return suppressClickFromDrag || shouldSuppressClickFromPointerDrag();
    },
    attach(el, onFuseGesture, _options) {
      el.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        // New gesture always clears a stuck suppress latch.
        suppressClickFromDrag = false;
        delete el.dataset.pointerDragSuppressClick;
      });

      el.addEventListener("click", (ev) => {
        if (suppressClickFromDrag || shouldSuppressClickFromPointerDrag(el)) {
          suppressClickFromDrag = false;
          return;
        }
        onFuseGesture(ev);
      });
    },
  };
}
