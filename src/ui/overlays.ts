// src/ui/overlays.ts
import type { CardInstance } from "../core/types/index.js";

/**
 * Keep a named overlay in sync without recreating it every render.
 * Recreating would restart CSS animations (ward pulse, barrier pulse, etc.).
 * Only remove when the flag says it should not be there; only create when missing.
 */
function syncOverlay(
  wrapper: Element,
  className: string,
  shouldShow: boolean,
  onCreate?: (el: HTMLElement) => void,
): void {
  const existing = wrapper.querySelectorAll(`:scope > .${className}`);
  if (!shouldShow) {
    existing.forEach((n) => n.remove());
    return;
  }
  let ov = existing[0] as HTMLElement | undefined;
  for (let i = 1; i < existing.length; i++) existing[i]!.remove();
  if (!ov) {
    ov = document.createElement("div");
    ov.classList.add(className);
    wrapper.appendChild(ov);
    onCreate?.(ov);
  }
}

export function applyKeywordOverlays(
  div: HTMLElement,
  card: CardInstance,
  isBoard = false,
) {
  const wrapper = div.querySelector(".card-image-wrapper") ?? div;

  // Create (or reuse) a bottom-center icon stack
  let stack = wrapper.querySelector(".keyword-icon-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "keyword-icon-stack";
    wrapper.appendChild(stack);
  }
  // Clear before repopulating so a reused wrapper cannot retain stale icons
  stack.replaceChildren();

  const addIcon = (src: string, extraClass: string) => {
    if (!stack) return;
    const img = document.createElement("img");
    img.src = src;
    img.className = `keyword-icon ${extraClass || ""}`;
    stack.appendChild(img);
  };

  const hasAura =
    !!card.hasAura ||
    (Array.isArray(card.keywords) &&
      card.keywords.some(
        (k) =>
          (typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase()) ===
          "aura",
      ));

  const hasCantAttack = !!(
    card.hasCantAttack ||
    card.keywordState?.cantAttack ||
    card.keywordState?.cantAttackUntilOpponentEOT
  );

  const hasLastWords =
    !!card.hasLastWords ||
    (Array.isArray(card.keywords) &&
      card.keywords.some(
        (k) =>
          (typeof k === "string" ? k : k?.name || "").toLowerCase() ===
          "lastwords",
      ));

  const hasCantBeDestroyed =
    !!card.cannotBeDestroyed ||
    (Array.isArray(card.keywords) &&
      card.keywords.some(
        (k) =>
          (typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase()) ===
          "cant_be_destroyed",
      ));

  syncOverlay(wrapper, "ward-overlay", isBoard && !!card.hasWard);
  syncOverlay(wrapper, "ambush-overlay", isBoard && !!card.hasAmbush);
  syncOverlay(wrapper, "aura-overlay", isBoard && hasAura);
  syncOverlay(wrapper, "cant_attack-overlay", isBoard && hasCantAttack);
  syncOverlay(wrapper, "intimidate-overlay", isBoard && !!card.hasIntimidate);
  syncOverlay(
    wrapper,
    "cant-be-destroyed-overlay",
    isBoard && hasCantBeDestroyed,
    (overlay) => {
      for (let i = 0; i < 5; i++) {
        const particle = document.createElement("div");
        particle.classList.add("cant-be-destroyed-particle");
        overlay.appendChild(particle);
      }
    },
  );

  if (card.hasBane) {
    addIcon("images/icon_bane.png", "bane-icon");
  }
  if (hasLastWords) {
    addIcon("images/icon_last-words.png", "lastwords-icon");
  }
  if (card.hasDrain) {
    addIcon("images/icon_drain.png", "drain-icon");
  }
  if (card.hasOngoing) {
    addIcon("images/icon_ongoing.png", "ongoing-icon");
  }

  // If multiple icons are present, enable swapping
  const count = stack.children.length;
  stack.classList.toggle("swap-2", count === 2);
  stack.classList.toggle("swap-3", count === 3);
  stack.classList.toggle("swap-4", count >= 4);
}

export function applyBarrierOverlay(div: HTMLElement, card: CardInstance) {
  const wrap = div.querySelector(".card-image-wrapper") ?? div;
  const existing = wrap.querySelectorAll(":scope > .barrier-overlay");

  if (!card.hasBarrier) {
    // Remove-only-stale: clear a leftover overlay on a reused wrapper.
    // Flash/pop are unchanged — they still run only when hasBarrier is true
    // (same as before); consumeBarrier sets hasBarrier false first, so those
    // flags were never applied on the post-pop path either.
    existing.forEach((n) => n.remove());
    return;
  }

  let ov = existing[0] as HTMLElement | undefined;
  for (let i = 1; i < existing.length; i++) existing[i]!.remove();
  if (!ov) {
    ov = document.createElement("div");
    ov.className = "barrier-overlay";
    wrap.appendChild(ov);
  }
  ov.setAttribute("data-charges", "");

  if (card.__uiFlashBarrier) {
    wrap.classList.add("barrier-flash");
    delete card.__uiFlashBarrier;
    setTimeout(() => wrap.classList.remove("barrier-flash"), 250);
  }
  if (card.__uiPopBarrier) {
    wrap.classList.add("barrier-pop");
    delete card.__uiPopBarrier;
    setTimeout(() => wrap.classList.remove("barrier-pop"), 350);
  }
}
