// src/ui/zones/dom.ts
import type { CardViewModel } from "./types.js";
import { attachTooltip } from "../tooltips.js";
import { state } from "../../core/gameState.js";

const CLASS_SLUG: Record<string, string> = {
  forestcraft: "forest",
  swordcraft: "sword",
  runecraft: "rune",
  dragoncraft: "dragon",
  abysscraft: "abyss",
  havencraft: "haven",
  portalcraft: "portal",
  neutral: "neutral",
};

const KEYWORD_CHIPS = [
  "storm",
  "rush",
  "bane",
  "drain",
  "ambush",
  "aura",
  "intimidate",
  "barrier",
] as const;

function classSlug(raw?: string): string {
  if (!raw) return "neutral";
  const key = String(raw).toLowerCase().replace(/\s+/g, "");
  return CLASS_SLUG[key] ?? "neutral";
}

function raritySlug(card: CardViewModel["card"]): string {
  const r = String((card as { rarity?: string }).rarity ?? "").toLowerCase();
  if (r.includes("legend")) return "legendary";
  if (r.includes("gold")) return "gold";
  if (r.includes("silver")) return "silver";
  return "bronze";
}

function skyboundGauge(card: CardViewModel["card"]): { current: number; req: number } | null {
  const witnesses = Number(card.skyboundArtEvolvesWitnessed ?? 0);
  const req = Number((card as { skyboundArtRequired?: number }).skyboundArtRequired ?? 0);
  if (!req) return null;
  const current = (state.roundCount || 1) + witnesses;
  return { current, req };
}

function baseCost(card: CardViewModel["card"]): number {
  return Number(card.base_cost ?? card.cost ?? 0);
}

function ensureChild(parent: HTMLElement, selector: string, tag: string, className: string): HTMLElement {
  let el = parent.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = document.createElement(tag);
    el.className = className;
    parent.appendChild(el);
  }
  return el;
}

function syncKeywordChips(wrapper: HTMLElement, vm: CardViewModel, isBoard: boolean): void {
  let chips = wrapper.querySelector(".keyword-chips") as HTMLElement | null;
  if (!isBoard || vm.card.type !== "Follower") {
    chips?.remove();
    return;
  }
  if (!chips) {
    chips = document.createElement("div");
    chips.className = "keyword-chips";
    wrapper.appendChild(chips);
  }
  chips.replaceChildren();
  const card = vm.card;
  const flags: Record<string, boolean> = {
    storm: !!card.hasStorm,
    rush: !!(card.hasRush || card.isRush),
    bane: !!card.hasBane,
    drain: !!card.hasDrain,
    ambush: !!card.hasAmbush,
    aura: !!card.hasAura,
    intimidate: !!card.hasIntimidate,
    barrier: !!card.hasBarrier,
  };
  for (const key of KEYWORD_CHIPS) {
    if (!flags[key]) continue;
    const chip = document.createElement("span");
    chip.className = "keyword-chip";
    chip.dataset.keyword = key;
    chip.textContent = key.slice(0, 1);
    chips.appendChild(chip);
  }
}

function applyCardDataAttributes(div: HTMLElement, vm: CardViewModel, ctx: { isBoard: boolean; isMyHand: boolean }): void {
  const { card } = vm;
  const slug = classSlug(card.class);
  div.dataset.class = slug;
  div.style.setProperty("--card-accent", `var(--c-${slug})`);

  div.dataset.type = String(card.type ?? "Follower").toLowerCase();
  div.dataset.rarity = raritySlug(card);
  div.dataset.zone = ctx.isBoard ? "board" : "hand";

  const setFlag = (key: string, on: boolean) => {
    if (on) div.dataset[key] = "true";
    else delete div.dataset[key];
  };

  setFlag("evolved", !!vm.isEvo);
  setFlag("superEvolved", !!vm.isSuperEvo);
  setFlag("ready", !!(ctx.isBoard && vm.canAttack));
  setFlag("exhausted", !!(ctx.isBoard && card.type === "Follower" && card.hasAttacked));
  setFlag("ward", !!(ctx.isBoard && vm.hasWard));
  setFlag("selectable", !!vm.isSelectable);
  setFlag("selected", !!vm.isSelected);
  setFlag("engageReady", !!vm.canEngage);
  setFlag(
    "engageUsed",
    !!(card.type === "Amulet" && card.keywordState?.engagedThisTurn),
  );
  setFlag("playable", !!(ctx.isMyHand && !!vm.glowClass));
  setFlag("spell", !!vm.isSpell);
}

export function createCardElement(
  vm: CardViewModel,
  ctx: { isBoard: boolean; isMyHand: boolean; isAlly: boolean },
  tooltipContainer: HTMLElement | null,
): HTMLElement {
  const div = document.createElement("div");
  div.className = "card hidpi";
  div.dataset.instanceId = vm.uid;
  div.dataset.uid = vm.uid;

  if (!ctx.isMyHand && !ctx.isBoard) {
    div.classList.add("card-back");
    return div;
  }

  const frame = document.createElement("div");
  frame.className = "card-frame";
  div.appendChild(frame);

  const imageWrapper = document.createElement("div");
  imageWrapper.className = "card-image-wrapper";
  const img = document.createElement("img");
  const imgSrc = vm.card.base_image || vm.card.image || "placeholder.jpg";
  img.src = String(imgSrc);
  img.alt = vm.card.name;
  imageWrapper.appendChild(img);

  const nameEl = document.createElement("div");
  nameEl.className = "card-name";
  nameEl.textContent = vm.card.name;
  imageWrapper.appendChild(nameEl);

  div.appendChild(imageWrapper);

  if (tooltipContainer) {
    attachTooltip(div, tooltipContainer, vm.card, ctx.isAlly);
  }

  updateCardElement(div, vm, ctx);
  return div;
}

export function updateCardElement(
  div: HTMLElement,
  vm: CardViewModel,
  ctx: { isBoard: boolean; isMyHand: boolean; isAlly?: boolean },
): void {
  if (!ctx.isMyHand && !ctx.isBoard) {
    div.classList.add("card-back");
    div.replaceChildren();
    return;
  }

  div.classList.remove("card-back");
  applyCardDataAttributes(div, vm, ctx);

  const wrapper = div.querySelector(".card-image-wrapper") as HTMLElement | null;
  if (!wrapper) return;

  const nameEl = ensureChild(wrapper, ".card-name", "div", "card-name");
  nameEl.textContent = vm.card.name;

  const costGem = ensureChild(wrapper, ".cost-gem", "div", "cost-gem");
  costGem.textContent = String(vm.shownCost);
  const bc = baseCost(vm.card);
  if (vm.shownCost < bc) costGem.dataset.costTint = "buff";
  else if (vm.shownCost > bc) costGem.dataset.costTint = "dmg";
  else delete costGem.dataset.costTint;

  const gauge = skyboundGauge(vm.card);
  let meter = wrapper.querySelector(".skybound-meter") as HTMLElement | null;
  if (gauge) {
    meter = meter ?? document.createElement("div");
    meter.className = "skybound-meter";
    meter.textContent = `${gauge.current}/${gauge.req}`;
    if (!meter.parentElement) wrapper.appendChild(meter);
  } else {
    meter?.remove();
  }

  let atkPlate = wrapper.querySelector('.stat-plate[data-stat="attack"]') as HTMLElement | null;
  let defPlate = wrapper.querySelector('.stat-plate[data-stat="defense"]') as HTMLElement | null;
  let cdChip = wrapper.querySelector(".countdown-chip") as HTMLElement | null;

  if (vm.card.type === "Follower" && ctx.isBoard) {
    atkPlate = atkPlate ?? document.createElement("div");
    atkPlate.className = "stat-plate";
    atkPlate.dataset.stat = "attack";
    atkPlate.textContent = String(vm.atkDisp);
    if (vm.isAtkBuffed) atkPlate.dataset.statTint = "buff";
    else if (vm.isAtkDebuffed) atkPlate.dataset.statTint = "dmg";
    else delete atkPlate.dataset.statTint;
    if (!atkPlate.parentElement) wrapper.appendChild(atkPlate);

    defPlate = defPlate ?? document.createElement("div");
    defPlate.className = "stat-plate";
    defPlate.dataset.stat = "defense";
    defPlate.textContent = String(vm.defDisp);
    if (vm.isDamaged) defPlate.dataset.statTint = "dmg";
    else if (vm.isDefBuffed) defPlate.dataset.statTint = "buff";
    else delete defPlate.dataset.statTint;
    if (!defPlate.parentElement) wrapper.appendChild(defPlate);
    cdChip?.remove();
  } else if (vm.card.type === "Amulet" && ctx.isBoard) {
    atkPlate?.remove();
    defPlate?.remove();
    if (vm.countdown !== null) {
      cdChip = cdChip ?? document.createElement("div");
      cdChip.className = "countdown-chip";
      cdChip.textContent = String(vm.countdown);
      if (!cdChip.parentElement) wrapper.appendChild(cdChip);
    } else {
      cdChip?.remove();
    }
  } else {
    atkPlate?.remove();
    defPlate?.remove();
    cdChip?.remove();
  }

  let check = wrapper.querySelector(".selected-check") as HTMLElement | null;
  if (vm.isSelected) {
    check = check ?? document.createElement("div");
    check.className = "selected-check";
    check.textContent = "✓";
    if (!check.parentElement) wrapper.appendChild(check);
  } else {
    check?.remove();
  }

  syncKeywordChips(wrapper, vm, ctx.isBoard);
}

/** @deprecated Use createCardElement — kept for transitional imports */
export function renderCardDOM(
  vm: CardViewModel,
  _elementId: string,
  tooltipContainer: HTMLElement | null,
  isBoard = false,
  isMyHand = true,
  isAlly = true,
): HTMLElement {
  return createCardElement(vm, { isBoard, isMyHand, isAlly }, tooltipContainer);
}
