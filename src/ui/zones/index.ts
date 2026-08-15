// src/ui/zones/index.ts
import { byId } from "../dom.js";
import type { GameState, CardInstance } from "../../core/types/index.js";
import { enableBoardDropForOwnSide } from "../drag.js";
import { buildZoneContext } from "./selectors.js";
import { getMemoizedViewModel } from "./memoization.js";
import { renderCardDOM } from "./dom.js";
import { attachHandlers } from "./handlers.js";
import type { CardViewModel } from "./types.js";

// Helper to track VM on DOM
interface ReconcilableElement extends HTMLElement {
  __cachedVM?: CardViewModel;
  __faceDown?: boolean;
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

  const tooltipEl = ctx.hideHandFaces
    ? null
    : document.getElementById("cardTooltip");

  // Face-down hands: destroy and rebuild by slot — never key by real uid.
  if (ctx.hideHandFaces) {
    // Clear any leftover tooltip from the other (face-up) hand so hovering
    // card-backs cannot appear to "leak" a previously shown card name.
    const tip = document.getElementById("cardTooltip");
    if (tip) {
      tip.style.display = "none";
      tip.textContent = "";
    }
    container.replaceChildren();
    cards.forEach((card, i) => {
      const vm = getMemoizedViewModel(card, i, ctx, state);
      const newEl = renderCardDOM(
        vm,
        `${containerId}-hidden-${i}`,
        null,
        false,
        ctx.owner === "first",
        { faceDown: true },
      ) as ReconcilableElement;
      newEl.__cachedVM = vm;
      newEl.__faceDown = true;
      // No handlers — face-down must not be interactive. Also keep tooltip down
      // if the pointer enters a back (stale tooltip from the opposite hand).
      newEl.onmouseenter = () => {
        const t = document.getElementById("cardTooltip");
        if (t) {
          t.style.display = "none";
          t.textContent = "";
        }
      };
      container.appendChild(newEl);
    });
    return;
  }

  // 2. Map Existing DOM Nodes by UID
  const existingChildren = new Map<string, ReconcilableElement>();
  const childrenToRemove = new Set<ReconcilableElement>();

  for (let i = 0; i < container.children.length; i++) {
    const child = container.children[i] as ReconcilableElement;
    if (child.dataset.uid) {
      existingChildren.set(child.dataset.uid, child);
      childrenToRemove.add(child);
    } else if (child.dataset.faceDown) {
      // Stale face-down nodes when toggle turns off
      childrenToRemove.add(child);
    }
  }

  // 3. Reconciliation Loop
  cards.forEach((card, i) => {
    const vm = getMemoizedViewModel(card, i, ctx, state);

    const el = existingChildren.get(card.uid);

    if (el) {
      childrenToRemove.delete(el);

      if (el.__cachedVM === vm && !el.__faceDown) {
        if (container.children[i] !== el) {
          container.insertBefore(el, container.children[i] || null);
        }
        return;
      }
    }

    const newEl = renderCardDOM(
      vm,
      `${containerId}-${i}`,
      tooltipEl,
      ctx.isBoard,
      ctx.owner === "first",
    ) as ReconcilableElement;
    newEl.__cachedVM = vm;

    attachHandlers(
      newEl,
      vm,
      ctx,
      state,
      rerender,
      clickable ? onClick : undefined,
    );

    if (el) {
      container.replaceChild(newEl, el);
      if (container.children[i] !== newEl) {
        container.insertBefore(newEl, container.children[i] || null);
      }
    } else {
      container.insertBefore(newEl, container.children[i] || null);
    }
  });

  childrenToRemove.forEach((el) => el.remove());
}
