// src/ui/zones/dom.ts
import type { CardViewModel } from "./types.js";
import { applyKeywordOverlays, applyBarrierOverlay } from "../overlays.js";
import { attachTooltip } from "../tooltips.js";

function createElement(
  tag: string,
  className?: string,
  text?: string,
): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function renderCardDOM(
  vm: CardViewModel,
  elementId: string,
  tooltipContainer: HTMLElement | null,
  isBoard = false,
  ownerIsFirst = false,
  opts?: { faceDown?: boolean },
): HTMLElement {
  const { card } = vm;
  const faceDown = !!opts?.faceDown;

  const div = createElement("div", faceDown ? "card card-back" : "card");
  // Face-down: opaque DOM identity — no real uid / name / image leak.
  if (faceDown) {
    div.dataset.faceDown = "1";
    div.dataset.slot = String(vm.idx);
    div.id = elementId;
    const imageWrapper = createElement("div", "card-image-wrapper");
    const back = createElement("div", "card-back-face", "");
    back.setAttribute("aria-label", "Face-down card");
    imageWrapper.appendChild(back);
    div.appendChild(imageWrapper);
    return div;
  }

  div.dataset.uid = vm.uid;
  div.id = elementId;
  div.classList.add("hidpi");

  // Glow
  if (vm.glowClass) div.classList.add(vm.glowClass);
  if (vm.playBlockedReason) {
    div.dataset.playBlockedReason = vm.playBlockedReason;
  } else {
    delete div.dataset.playBlockedReason;
  }
  if (vm.isSpell) div.classList.add("spell");

  // Interactions
  if (vm.isSelectable) div.classList.add("selectable");
  if (vm.isSelected) div.classList.add("selected");

  // Engage
  if (vm.canEngage) {
    div.classList.add("engage-ready");
    div.style.cursor = "pointer";
  }

  // Board specific
  if (vm.isSuperEvo) div.classList.add("super-evo");
  else if (vm.isEvo) div.classList.add("evolved");

  if (vm.canAttack) {
    if (vm.isRush) div.classList.add("rush-glow");
    else div.classList.add("can-attack");
  }

  // Image Wrapper
  const imageWrapper = createElement("div", "card-image-wrapper");
  const imgSrc = card.base_image || card.image || "placeholder.jpg";
  const img = document.createElement("img");
  img.src = String(imgSrc);
  img.alt = card.name;
  imageWrapper.appendChild(img);

  // Icarus Badge
  if (vm.icarusBuff) {
    const badge = createElement("div", "icarus-badge", "!");
    Object.assign(badge.style, {
      position: "absolute",
      top: "28px",
      left: "6px",
      width: "18px",
      height: "18px",
      lineHeight: "18px",
      borderRadius: "50%",
      background: "rgba(255, 215, 0, 0.95)",
      color: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "900",
      fontSize: "12px",
      boxShadow: "0 0 4px rgba(0,0,0,0.6)",
      zIndex: "3",
    });
    imageWrapper.appendChild(badge);
  }

  // Unimplemented / unknown-op coverage badge — honest signal that effects are stubs
  if (
    vm.implementationStatus === "unimplemented" ||
    vm.implementationStatus === "unknown_ops"
  ) {
    div.classList.add("card-unimplemented");
    const label =
      vm.implementationStatus === "unknown_ops" ? "UNKNOWN OP" : "UNIMPL";
    const badge = createElement("div", "unimplemented-badge", label);
    badge.title =
      vm.implementationStatus === "unknown_ops"
        ? "Card JSON contains an unknown effect op"
        : "This card has no programmed effects — results may be misleading";
    imageWrapper.appendChild(badge);
  }

  // Selection Check
  if (vm.isSelected) {
    const check = createElement("div", "selected-check", "✓");
    Object.assign(check.style, {
      position: "absolute",
      top: "6px",
      right: "8px",
      fontSize: "24px",
      fontWeight: "900",
      color: "#2ecc71",
      textShadow: "0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(46,204,113,0.8)",
      zIndex: "100",
      pointerEvents: "none",
    });
    imageWrapper.appendChild(check);
  }

  // Stats
  const topLeft = createElement(
    "div",
    "card-stats top-left",
    String(vm.shownCost),
  );
  if (vm.formLabel) {
    const formBadge = createElement(
      "div",
      "alternate-form-badge",
      `${vm.formLabel} ${vm.shownCost}`,
    );
    imageWrapper.appendChild(formBadge);
  }
  const bottomLeft = createElement("div", "card-stats bottom-left");
  const bottomRight = createElement("div", "card-stats bottom-right");

  // Stat logic
  if (card.type === "Follower") {
    bottomLeft.textContent = String(vm.atkDisp);
    bottomRight.textContent = String(vm.defDisp);

    // Colors via classes
    // Attack
    if (vm.isAtkBuffed) bottomLeft.classList.add("stat-buffed");
    else if (vm.isAtkDebuffed) bottomLeft.classList.add("stat-damaged");

    // Defense
    if (vm.isDamaged) bottomRight.classList.add("stat-damaged");
    else if (vm.isDefBuffed) bottomRight.classList.add("stat-buffed");
  } else if (card.type === "Amulet") {
    bottomLeft.style.display = "none";

    if (vm.countdown !== null) {
      bottomRight.style.display = "block";
      bottomRight.className = "card-stats bottom-right countdown-badge";
      bottomRight.textContent = String(vm.countdown);
    } else {
      // Logic for any named counter from original zones.ts
      // We can check card.counters in VM but let's replicate logic here or in VM.
      // VM has access to card.counters. Let's do a quick check if VM didn't handle it fully.
      // Actually VM does check `card.counters`. But let's refine this in VM next time or assume VM logic is decent.
      // In zones.ts logic was: if countdown found use it, else if counter found use it.
      // In my VM I mapped countdown. I didn't map "other counters" explicitly in VM props except via `card`.
      // Doing it here for safety to match behavior exactly.
      let shown = false;
      if (card.counters && typeof card.counters === "object") {
        const entries = Object.entries(card.counters).filter(([, v]) =>
          Number.isFinite(Number(v)),
        );
        if (entries.length) {
          const entry = entries[0];
          if (entry) {
            bottomRight.style.display = "block";
            bottomRight.className = "card-stats bottom-right countdown-badge";
            bottomRight.textContent = String(Number(entry[1]));
            shown = true;
          }
        }
      }
      if (!shown) bottomRight.style.display = "none";
    }
  } else {
    // Spell
    bottomLeft.style.display = "none";
    bottomRight.style.display = "none";
  }

  // Spellboost
  const sbContainer = createElement("div", "spellboost-container");
  if (vm.spellboostCount !== null && vm.spellboostCount > 0) {
    const sb = createElement(
      "div",
      "spellboost-badge",
      String(vm.spellboostCount),
    );
    sbContainer.appendChild(sb);
  }

  imageWrapper.append(img, topLeft, sbContainer, bottomLeft, bottomRight);
  div.appendChild(imageWrapper);

  // Overlays
  applyKeywordOverlays(div, card, isBoard);
  applyBarrierOverlay(div, card);

  // Tooltip — owner comes from ZoneContext, not element id sniffing
  if (tooltipContainer) {
    attachTooltip(div, tooltipContainer, card, ownerIsFirst);
  }

  return div;
}
