/**
 * Hand-card fuse vs HTML5 drag discrimination.
 *
 * Hand cards are `draggable` for drag-to-play. On a draggable element, any
 * pointer movement before release can start a native drag — and then **no
 * `click` is dispatched**. Fuse used to listen only for `click`, so a few
 * pixels of hand tremor silently ate the fuse gesture while right-click play
 * (contextmenu) kept working.
 *
 * Fix: track movement from pointerdown; `preventDefault()` on `dragstart` when
 * movement stays under {@link DRAG_THRESHOLD_PX} so the browser falls through
 * to `click` (fuse). Past the threshold, allow the drag (play) and suppress
 * a trailing click.
 *
 * Latch recovery: `suppressClickFromDrag` clears on every new `pointerdown`
 * and on `dragend`. A missing `dragend` (detached node, focus loss) can no
 * longer permanently block fuse — especially important because zone reconcile
 * reuses DOM nodes when the memoized VM is unchanged and does not re-attach
 * handlers.
 */
export const DRAG_THRESHOLD_PX = 8;

export interface HandDragClickSuppressor {
  /** Test hook: whether a drag gesture is currently suppressing clicks. */
  isSuppressing(): boolean;
  attach(el: HTMLElement, onAllowedClick: (ev: MouseEvent) => void): void;
}

export function createHandDragClickSuppressor(): HandDragClickSuppressor {
  let suppressClickFromDrag = false;
  let gesture: {
    startX: number;
    startY: number;
    pointerId: number;
  } | null = null;
  let maxDist = 0;

  return {
    isSuppressing() {
      return suppressClickFromDrag;
    },
    attach(el, onAllowedClick) {
      el.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        // New gesture always clears a stuck suppress latch (Finding 2).
        suppressClickFromDrag = false;
        maxDist = 0;
        gesture = {
          startX: ev.clientX,
          startY: ev.clientY,
          pointerId: ev.pointerId,
        };
        try {
          el.setPointerCapture(ev.pointerId);
        } catch {
          /* capture optional — tracking still works while over the element */
        }
      });

      el.addEventListener("pointermove", (ev) => {
        if (!gesture || ev.pointerId !== gesture.pointerId) return;
        maxDist = Math.max(
          maxDist,
          Math.hypot(ev.clientX - gesture.startX, ev.clientY - gesture.startY),
        );
      });

      el.addEventListener("dragstart", (ev) => {
        if (maxDist < DRAG_THRESHOLD_PX) {
          ev.preventDefault();
          return;
        }
        suppressClickFromDrag = true;
        gesture = null;
      });

      el.addEventListener("dragend", () => {
        setTimeout(() => {
          suppressClickFromDrag = false;
        }, 0);
      });

      const endGesture = (ev: PointerEvent) => {
        if (gesture && ev.pointerId === gesture.pointerId) {
          gesture = null;
        }
      };
      el.addEventListener("pointerup", endGesture);
      el.addEventListener("pointercancel", endGesture);

      el.addEventListener("click", (ev) => {
        if (suppressClickFromDrag) return;
        onAllowedClick(ev);
      });
    },
  };
}
