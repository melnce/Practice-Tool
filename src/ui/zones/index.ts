// src/ui/zones/index.ts
import { byId } from "../dom.js";
import type { GameState, CardInstance } from "../../core/types/index.js";
import { enableBoardDropForOwnSide, wireFieldSlotDragHighlight } from "../drag.js";
import { buildZoneContext } from "./selectors.js";
import { getMemoizedViewModel } from "./memoization.js";
import { createCardElement, updateCardElement } from "./dom.js";
import { attachHandlers } from "./handlers.js";
import { reconcileZone } from "../render/reconcile.js";
import type { CardViewModel } from "./types.js";
import type { ZoneContext } from "./types.js";

const BOARD_SLOT_COUNT = 5;

interface CardReconcileItem {
  instanceId: string;
  idx: number;
  vm: CardViewModel;
  ctx: ZoneContext;
  isAlly: boolean;
}

const FAN_DEGREES = [-8, -4, 0, 4, 8] as const;

function fanRotation(index: number, total: number): string {
  if (index >= FAN_DEGREES.length) return "0deg";
  return `${FAN_DEGREES[index] ?? 0}deg`;
}

function ensureBoardSlots(container: HTMLElement): HTMLElement[] {
  const slots: HTMLElement[] = [];
  for (let i = 0; i < BOARD_SLOT_COUNT; i++) {
    let slot = container.children[i] as HTMLElement | undefined;
    if (!slot || !slot.classList.contains("field-slot")) {
      slot = document.createElement("div");
      slot.className = "field-slot";
      slot.dataset.slotIndex = String(i);
      container.appendChild(slot);
    }
    slots.push(slot);
  }
  while (container.children.length > BOARD_SLOT_COUNT) {
    container.lastElementChild?.remove();
  }
  return slots;
}

function reconcileCardsInContainer(
  container: HTMLElement,
  cards: CardInstance[],
  ctx: ZoneContext,
  state: GameState,
  rerender: () => void,
  clickable: boolean,
  onPlayByUid?: (uid: string) => void,
): void {
  const tooltipEl = document.getElementById("cardTooltip");
  const isAlly = ctx.owner === "first";

  const items: CardReconcileItem[] = cards.map((card, i) => ({
    instanceId: card.uid,
    idx: i,
    vm: getMemoizedViewModel(card, i, ctx, state),
    ctx,
    isAlly,
  }));

  reconcileZone(container, items, {
    create: (item) => {
      const el = createCardElement(
        item.vm,
        {
          isBoard: item.ctx.isBoard,
          isMyHand: item.ctx.isMyHand,
          isAlly: item.isAlly,
        },
        tooltipEl,
      );
      attachHandlers(el, item.ctx, rerender, clickable ? onPlayByUid : undefined);
      return el;
    },
    update: (el, item) => {
      updateCardElement(el, item.vm, {
        isBoard: item.ctx.isBoard,
        isMyHand: item.ctx.isMyHand,
        isAlly: item.isAlly,
      });
    },
    getInstanceId: (item) => item.instanceId,
  });
}

function reconcileHandZone(
  container: HTMLElement,
  cards: CardInstance[],
  ctx: ZoneContext,
  state: GameState,
  rerender: () => void,
  clickable: boolean,
  onPlayByUid?: (uid: string) => void,
): void {
  const tooltipEl = document.getElementById("cardTooltip");
  const isAlly = ctx.owner === "first";
  const total = cards.length;

  const items: CardReconcileItem[] = cards.map((card, i) => ({
    instanceId: card.uid,
    idx: i,
    vm: getMemoizedViewModel(card, i, ctx, state),
    ctx,
    isAlly,
  }));

  reconcileZone(container, items, {
    create: (item) => {
      const slot = document.createElement("div");
      slot.className = "hand-slot";
      slot.style.setProperty("--fan-rot", fanRotation(item.idx, total));

      const cardEl = createCardElement(
        item.vm,
        {
          isBoard: false,
          isMyHand: item.ctx.isMyHand,
          isAlly: item.isAlly,
        },
        tooltipEl,
      );
      delete cardEl.dataset.instanceId;
      slot.appendChild(cardEl);
      attachHandlers(cardEl, item.ctx, rerender, clickable ? onPlayByUid : undefined);
      return slot;
    },
    update: (slot, item) => {
      slot.style.setProperty("--fan-rot", fanRotation(item.idx, total));
      const cardEl = slot.querySelector(".card") as HTMLElement | null;
      if (!cardEl) return;
      updateCardElement(cardEl, item.vm, {
        isBoard: false,
        isMyHand: item.ctx.isMyHand,
        isAlly: item.isAlly,
      });
    },
    getInstanceId: (item) => item.instanceId,
  });
}

function reconcileBoardZone(
  container: HTMLElement,
  cards: CardInstance[],
  ctx: ZoneContext,
  state: GameState,
  rerender: () => void,
): void {
  const slots = ensureBoardSlots(container);
  wireFieldSlotDragHighlight(slots);

  for (let i = 0; i < BOARD_SLOT_COUNT; i++) {
    const slot = slots[i]!;
    const card = cards[i];
    if (!card) {
      slot.dataset.empty = "true";
      slot.replaceChildren();
      continue;
    }
    slot.dataset.empty = "false";
    reconcileCardsInContainer(slot, [card], ctx, state, rerender, false);
  }
}

export function renderZone(
  containerId: string,
  cards: CardInstance[],
  state: GameState,
  rerender: () => void,
  clickable = false,
  onPlayByUid?: (uid: string) => void,
): void {
  const container = byId(containerId);
  if (!container) return;

  const ctx = buildZoneContext(containerId, state);

  if (ctx.isBoard && ctx.isMyBoard && !ctx.isMulligan) {
    if (!container.dataset.dropWired) {
      container.dataset.dropWired = "1";
      container.ondragover = (e) => e.preventDefault();
      enableBoardDropForOwnSide(container, containerId);
    }
  }

  if (ctx.isBoard) {
    reconcileBoardZone(container, cards, ctx, state, rerender);
    return;
  }

  if (ctx.isHand || ctx.isMyHand) {
    reconcileHandZone(
      container,
      cards,
      ctx,
      state,
      rerender,
      clickable,
      onPlayByUid,
    );
    return;
  }

  reconcileCardsInContainer(
    container,
    cards,
    ctx,
    state,
    rerender,
    clickable,
    onPlayByUid,
  );
}
