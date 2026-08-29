// src/logic/effects/ops/fuse/unified.ts
// Unified fuse operation handler

import type {
  Player,
  CardInstance,
  Effect,
  EffectContext,
} from "../../../../core/types/index.js";
import { resolveUids } from "../../../../core/uidResolver.js";
import type { FuseOp } from "./types.js";

// Import existing handlers
import { opStartFuseFromCard, fuse_finalize_generic } from "./fuse.js";

import {
  fuse_finalize_alpha,
  fuse_finalize_gear_multi,
  fuse_finalize_fortifier,
  startFortifierFuse,
} from "./fuse.artifact.js";

import { fuse_finalize_gardens_allure } from "./fuse.forest.js";

import { fuse_finalize_loot } from "./fuse.loot.js";

import { fuse_finalize_cards } from "./fuse.cards.js";

/**
 * Unified fuse handler
 *
 * Routes based on action field:
 * - action: "start" → Opens fuse partner selection
 * - action: "finalize" → Routes to type-specific finalizer
 * - type: "fortifier" (no action) → Starts fortifier fuse flow
 */
export function handleFuse(
  eff: FuseOp,
  owner: Player,
  sourceCard: CardInstance | null,
  _effectsQueue: Effect[],
  context: EffectContext = {},
): string | void {
  const action = eff.action;
  const type = eff.type;

  // === TYPE-BASED INITIATION (no action) ===
  // For specific fuse types that have their own initiation flow
  if (!action && type === "fortifier" && sourceCard) {
    return startFortifierFuse(owner, sourceCard);
  }

  if (!action) {
    console.warn(
      `[fuse] Missing action field - must be "start" or "finalize". Effect:`,
      eff,
    );
    return "done";
  }

  // === ACTION: START ===
  if (action === "start") {
    return opStartFuseFromCard(eff, owner);
  }

  // === ACTION: FINALIZE ===
  if (action === "finalize") {
    const type = eff.type || "generic";
    const initiatorUid = eff.initiator_uid || "";

    // UID-based selection only
    const partners = context.targetUids?.length
      ? resolveUids(context.targetUids)
      : [];

    switch (type) {
      case "generic": {
        const partner = partners[0];
        if (partner) {
          fuse_finalize_generic(owner, initiatorUid, partner, eff.result);
        }
        break;
      }

      case "fortifier":
        fuse_finalize_fortifier(owner, initiatorUid, partners);
        break;

      case "alpha":
        fuse_finalize_alpha(owner, initiatorUid, partners);
        break;

      case "gear_multi":
        fuse_finalize_gear_multi(
          owner,
          initiatorUid,
          partners,
          eff.result_name || "",
        );
        break;

      case "loot":
        fuse_finalize_loot(owner, initiatorUid, partners);
        break;

      case "gardens_allure":
        fuse_finalize_gardens_allure(owner, initiatorUid, partners);
        break;

      case "cards":
        fuse_finalize_cards(owner, initiatorUid, partners);
        break;

      default:
        console.warn(`[fuse] Unknown finalize type: "${type}"`);
    }

    return "done";
  }

  console.warn(`[fuse] Unknown action: "${action}"`);
  return "done";
}
