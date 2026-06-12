// src/ui/zones/handlers.ts
import type { CardViewModel, ZoneContext } from "./types.js";
import type { CardInstance, GameState } from "../../core/types/index.js";
import { state } from "../../core/gameState.js";
import * as actions from "./actions.js";
import {
  enableCardDragFromHand,
  enableCardEvoDrop,
  enableAttackerDrag,
  enableEnemyFollowerDrop,
} from "../drag.js";
import { createHandDragClickSuppressor } from "./dragClickGuard.js";

const attachedHandlers = new WeakSet<HTMLElement>();
const fuseCardFallback = new WeakMap<HTMLElement, CardInstance>();

function isLegacyVm(value: unknown): value is CardViewModel {
  return (
    !!value &&
    typeof value === "object" &&
    "uid" in value &&
    "card" in value &&
    typeof (value as CardViewModel).uid === "string"
  );
}

function wireHandlers(
  div: HTMLElement,
  ctx: ZoneContext,
  rerender: () => void,
  onPlayByUid?: (uid: string) => void,
): void {
  if (attachedHandlers.has(div)) return;
  attachedHandlers.add(div);

  const instanceId = () => div.dataset.instanceId ?? div.dataset.uid ?? "";

  if (ctx.isMulligan) {
    div.addEventListener("click", (e) => {
      e.stopPropagation();
      const uid = instanceId();
      if (!uid) return;
      const owner = ctx.isBlueHand ? "first" : "second";
      actions.handleMulliganToggle(owner, uid);
    });
    div.oncontextmenu = (e) => e.preventDefault();
    return;
  }

  div.addEventListener("click", (e) => {
    const uid = instanceId();
    if (!uid) return;
    const owner = ctx.owner;
    const zone = ctx.isHand ? state.players[owner].hand : state.players[owner].board;
    const card = zone.find((c) => c.uid === uid);
    if (!card) return;
    const selected =
      Array.isArray(state.pendingTargetEffect?.targets) &&
      state.pendingTargetEffect.targets.some((t) => t?.uid === uid);
    const inTargets = state.pendingTargetEffect?.targetUids?.includes(uid);
    if (!state.pendingTargetEffect || (!card.__uiSelectable && !inTargets && !selected)) return;
    e.stopPropagation();
    actions.handleResolveTarget(uid);
  });

  if (ctx.isHand) {
    if (onPlayByUid) {
      div.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const uid = instanceId();
        if (uid) onPlayByUid(uid);
      });
    }

    const dragClickGuard = createHandDragClickSuppressor();
    dragClickGuard.attach(div, (e) => {
      const uid = instanceId();
      if (!uid) return;

      const hand = state.players[ctx.owner].hand;
      let card = hand.find((c) => c.uid === uid) ?? fuseCardFallback.get(div);
      if (!card) return;

      if (card.__uiSelectable || state.pendingTargetEffect?.targetUids?.includes(uid)) return;
      if (ctx.owner !== state.activePlayer) return;

      const hasFuseRecipes =
        Array.isArray(card.fuse_recipes) && card.fuse_recipes.length > 0;
      const hasFortifierFuse =
        Array.isArray(card.fuse) &&
        card.fuse.some((op) => op?.op === "fuse" && op?.type === "fortifier");
      const hasSpecialFuse =
        card.name === "Gear of Ambition" ||
        card.name === "Gear of Remembrance" ||
        card.name === "Ominous Artifact α";

      if (hasFuseRecipes || hasFortifierFuse || hasSpecialFuse) {
        e.stopPropagation();
        actions.handleFuse(
          ctx.owner,
          uid,
          !!(hasFuseRecipes || hasSpecialFuse),
          card,
        );
      }
    });

    enableCardDragFromHand(div, ctx.containerId);
  }

  if (ctx.isBoard) {
    const owner = ctx.owner;

    div.addEventListener("contextmenu", (e) => {
      const id = instanceId();
      if (!id) return;
      const board = state.players[owner].board;
      const card = board.find((c) => c.uid === id);
      if (!card || card.type !== "Amulet" || !card.hasEngage) return;
      const ks = card.keywordState || {};
      const engageCost = Number(ks.engageCost ?? card.engageCost ?? 0);
      const pp = state.players[owner].pp;
      const oncePerTurn = card.engageOncePerTurn !== false;
      const alreadyEngaged = !!ks.engagedThisTurn;
      const isMyTurn = owner === state.activePlayer;
      if (!isMyTurn || pp < engageCost || (oncePerTurn && alreadyEngaged)) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = board.findIndex((c) => c.uid === id);
      if (idx !== -1) actions.handleEngage(owner, idx);
    });

    enableCardEvoDrop(div, ctx.containerId, rerender);

    const boardCard = () => {
      const id = instanceId();
      return state.players[owner].board.find((c) => c.uid === id);
    };

    if (ctx.isMyBoard) {
      enableAttackerDrag(div, owner, () => {
        const card = boardCard();
        if (!card) return -1;
        return state.players[owner].board.findIndex((c) => c.uid === card.uid);
      });
    } else {
      enableEnemyFollowerDrop(div, owner, () => {
        const card = boardCard();
        if (!card) return -1;
        return state.players[owner].board.findIndex((c) => c.uid === card.uid);
      });
    }
  }
}

/** Supports legacy (div, vm, ctx, state, rerender) and modern (div, ctx, rerender, onPlayByUid). */
export function attachHandlers(
  div: HTMLElement,
  vmOrCtx: CardViewModel | ZoneContext,
  ctxOrRerender: ZoneContext | (() => void),
  stateOrOnPlay?: GameState | (() => void) | ((uid: string) => void),
  rerenderArg?: () => void,
): void {
  const isLegacy =
    isLegacyVm(vmOrCtx) &&
    typeof ctxOrRerender === "object" &&
    ctxOrRerender !== null &&
    "containerId" in ctxOrRerender;

  if (isLegacy) {
    const vm = vmOrCtx as CardViewModel;
    const ctx = ctxOrRerender as ZoneContext;
    const rerender = rerenderArg ?? (() => {});
    div.dataset.instanceId = vm.uid;
    div.dataset.uid = vm.uid;
    fuseCardFallback.set(div, vm.card);
    wireHandlers(div, ctx, rerender);
    return;
  }

  const ctx = vmOrCtx as ZoneContext;
  const rerender = ctxOrRerender as () => void;
  const onPlayByUid =
    typeof stateOrOnPlay === "function" && stateOrOnPlay.length === 1
      ? (stateOrOnPlay as (uid: string) => void)
      : undefined;
  wireHandlers(div, ctx, rerender, onPlayByUid);
}
