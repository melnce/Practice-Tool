/**
 * Hand-card fuse vs HTML5 drag discrimination.
 *
 * Hand cards are `draggable` for drag-to-play. The browser can dispatch
 * `dragstart` before any `pointermove` reaches JS. Cancelling that
 * `dragstart` (e.g. via a pixel threshold) is one-shot — the browser will not
 * retry for the same press — so real-hardware drag-to-play dies silently.
 *
 * Owner rule: never cancel `dragstart`. Decide by where the gesture ends:
 * - Released outside the hand zone → drag/play (existing drop handlers).
 * - Released inside the hand zone, initiator still in hand → treat as fuse
 *   (same callback as click), when the card is fuse-capable.
 * - Plain click with no `dragstart` still opens fuse via the click path.
 *
 * After any `dragstart`, suppress a trailing `click` so one gesture cannot
 * fuse twice (`dragend` + click). Latch clears on every `pointerdown` and
 * after a `dragend` tick — recovering from a missing `dragend` when zone
 * reconcile reuses the DOM node without re-attaching handlers.
 */

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

function isInsideHandZone(
  handContainerId: string,
  clientX: number,
  clientY: number,
): boolean {
  const handEl = document.getElementById(handContainerId);
  if (!handEl) return false;
  const rect = handEl.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function createHandDragClickSuppressor(): HandDragClickSuppressor {
  let suppressClickFromDrag = false;

  return {
    isSuppressing() {
      return suppressClickFromDrag;
    },
    attach(el, onFuseGesture, options) {
      el.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        // New gesture always clears a stuck suppress latch.
        suppressClickFromDrag = false;
      });

      el.addEventListener("dragstart", () => {
        // Never preventDefault — a cancelled dragstart is one-shot for the press.
        suppressClickFromDrag = true;
      });

      el.addEventListener("dragend", (ev) => {
        const dragEv = ev as DragEvent;
        // Lost gestures (0,0 / outside every zone) must not open fuse.
        if (
          isInsideHandZone(
            options.handContainerId,
            dragEv.clientX,
            dragEv.clientY,
          ) &&
          options.isInitiatorStillInHand()
        ) {
          onFuseGesture(dragEv);
        }
        setTimeout(() => {
          suppressClickFromDrag = false;
        }, 0);
      });

      el.addEventListener("click", (ev) => {
        if (suppressClickFromDrag) return;
        onFuseGesture(ev);
      });
    },
  };
}
