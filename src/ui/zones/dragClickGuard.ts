/**
 * Suppresses fuse left-clicks that immediately follow a hand-card drag gesture.
 * Clears on dragend (deferred) — never on click — so aborted drags cannot leave
 * the flag stuck and eat the next fuse.
 */
export interface HandDragClickSuppressor {
  /** Test hook: whether a drag gesture is currently suppressing clicks. */
  isSuppressing(): boolean;
  attach(el: HTMLElement, onAllowedClick: (ev: MouseEvent) => void): void;
}

export function createHandDragClickSuppressor(): HandDragClickSuppressor {
  let suppressClickFromDrag = false;

  return {
    isSuppressing() {
      return suppressClickFromDrag;
    },
    attach(el, onAllowedClick) {
      el.addEventListener("dragstart", () => {
        suppressClickFromDrag = true;
      });
      el.addEventListener("dragend", () => {
        setTimeout(() => {
          suppressClickFromDrag = false;
        }, 0);
      });
      el.addEventListener("click", (ev) => {
        if (suppressClickFromDrag) return;
        onAllowedClick(ev);
      });
    },
  };
}
