// src/ui/zones/handlers.ts
import type { CardViewModel, ZoneContext } from "./types.js";
import type { GameState } from "../../core/types/index.js";
import * as actions from "./actions.js";
import {
  enableCardDragFromHand,
  enableCardEvoDrop,
  enableAttackerDrag,
  enableEnemyFollowerDrop,
} from "../drag.js";

export function attachHandlers(
  div: HTMLElement,
  vm: CardViewModel,
  ctx: ZoneContext,
  state: GameState,
  rerender: () => void,
  onPlayClick?: (i: number) => void,
): void {
  const { card, idx } = vm;

  // 1. Mulligan Interactions
  if (ctx.isMulligan) {
    if (vm.isSelectable) {
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        const owner = ctx.isBlueHand ? "first" : "second";
        actions.handleMulliganToggle(owner, card.uid);
      });
      div.oncontextmenu = (e) => e.preventDefault();
    }
    return;
  }

  // 2. Target Selection (Resolving pending target) - includes toggle for already-selected
  if ((vm.isSelectable || vm.isSelected) && !ctx.isMulligan) {
    div.addEventListener("click", (e) => {
      e.stopPropagation();
      actions.handleResolveTarget(card.uid);
    });
    // Dont return, might need drag if implemented for selectable cards?
    // usually selection locks other interactions but lets keep consistent with orig file
  }

  // 3. Hand Interactions (Play, Fuse)
  if (ctx.isHand) {
    // Right-click to play (via callback from renderZone)
    if (onPlayClick) {
      div.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        onPlayClick(idx);
      });
    }

    // Left-click for Fuse
    div.addEventListener("click", (e) => {
      if (vm.isSelectable || vm.isSelected) return; // handled above

      // Check turn
      const isPlayersTurn = ctx.isMyHand; // calculated in selector
      if (!isPlayersTurn) return;

      const hasFuseRecipes =
        Array.isArray(card.fuse_recipes) && card.fuse_recipes.length > 0;
      const hasFortifierFuse =
        Array.isArray(card.fuse) &&
        card.fuse.some((op) => op?.op === "fuse" && op?.type === "fortifier");
      // Gears and Ominous Artifact α have special hardcoded fuse logic by name
      const hasSpecialFuse =
        card.name === "Gear of Ambition" ||
        card.name === "Gear of Remembrance" ||
        card.name === "Ominous Artifact α";

      if (hasFuseRecipes || hasFortifierFuse || hasSpecialFuse) {
        e.stopPropagation();
        actions.handleFuse(ctx.owner, card.uid, !!(hasFuseRecipes || hasSpecialFuse), card);
      }
    });

    // Drag
    enableCardDragFromHand(div, card, ctx.containerId);
  }

  // 4. Board Interactions
  if (ctx.isBoard) {
    // Evo Drop
    if (vm.card.type === "Follower") {
      enableCardEvoDrop(div, ctx.containerId, card, state, rerender);
    }

    // Combat Drag / Drop
    if (vm.card.type === "Follower") {
      if (ctx.isMyBoard && vm.canAttack) {
        // enableAttackerDrag expects 'blue'/'red' string
        enableAttackerDrag(div, ctx.owner, idx);
      }
      if (!ctx.isMyBoard) {
        // enemy drop target
        // enableEnemyFollowerDrop expects isRedBoard boolean
        enableEnemyFollowerDrop(
          div,
          null,
          idx,
          state,
          ctx.containerId === "redBoard",
        );
      }
    }

    // Engage
    if (vm.canEngage) {
      div.addEventListener(
        "contextmenu",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          actions.handleEngage(ctx.owner, idx);
        },
        { once: true },
      );
    }
  }
}














