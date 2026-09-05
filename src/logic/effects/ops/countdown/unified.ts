// src/logic/effects/ops/countdown/unified.ts
// Unified countdown handler - works for both amulets and crests

import type {
  CardInstance,
  Effect,
  Player,
} from "../../../../core/types/index.js";
import { logEvent } from "../../../../core/logger.js";
import { state } from "../../../../core/gameState.js";
import { isDev } from "../../../../core/env.js";
import type { Crest } from "../../crest.js";
import { resolveEffectAmount } from "../../../core/values.js";

import { completeCrest } from "../../crest.js";
import {
  getCrests,
  getBoard,
  opponentOf,
} from "../../../../core/playerHelpers.js";

export type CountdownAction = "advance" | "delay";

/** Allowed countdown.action values — must match normalizeAction in countdown/unified.ts */
export const COUNTDOWN_ACTION_VALUES = new Set([
  "advance",
  "advance_countdown",
  "delay",
  "delay_countdown",
]);

export interface CountdownHandlerContext {
  owner: Player;
  source?: any; // CardInstance | Crest | null - using any for caller flexibility
  context?: Record<string, unknown>;
}

/**
 * Unified countdown handler.
 * Works for both amulets (CardInstance) and crests (Crest).
 *
 * Actions:
 * - "advance": Reduce countdown (move toward 0)
 * - "delay": Increase countdown (delay expiry)
 *
 * Targeting:
 * - target: "self" → uses ctx.source (amulet or crest)
 * - name: "CrestName" → finds crest by name (legacy)
 * - board_name / filter.name + target ally:amulet → board amulets
 * - select_mode: "random" with select: 1 picks via seeded RNG
 */
export function handleCountdown(
  eff: Effect,
  ctx: CountdownHandlerContext,
): void {
  const rawAction = (eff as any).action;
  const sourceCard =
    ctx.source && !isCrest(ctx.source) ? (ctx.source as CardInstance) : null;
  const cardName = sourceCard?.name ?? "unknown";
  if (
    rawAction != null &&
    rawAction !== "" &&
    !COUNTDOWN_ACTION_VALUES.has(String(rawAction))
  ) {
    const msg = `[countdown] Unknown action "${rawAction}" in card ${cardName}`;
    if (isDev()) {
      throw new Error(msg);
    }
    console.warn(msg);
  }
  const action = normalizeAction(rawAction);
  const amount = resolveEffectAmount(
    eff as any,
    {
      owner: ctx.owner,
      sourceCard,
      selectedCard: (ctx.context as any)?.selected ?? null,
      variables: (ctx.context as any)?.variables,
    },
    1,
  );
  const targetSpec = (eff as any).target;
  const crestName = (eff as any).name;
  const boardName =
    (eff as any).board_name ??
    (eff as any).filter?.name ??
    (targetSpec && String(targetSpec).includes("amulet")
      ? (eff as any).name
      : undefined);

  // Board amulet targeting (e.g. delay random Rings of Moonlight)
  if (
    boardName ||
    (typeof targetSpec === "string" &&
      targetSpec.includes("amulet") &&
      targetSpec !== "self")
  ) {
    handleBoardAmuletCountdown(ctx.owner, eff, action, amount);
    return;
  }

  // All crests for a player (e.g. Torrent of Despair delays every allied crest)
  if (targetSpec === "ally:crest" || targetSpec === "enemy:crest") {
    const crestOwner =
      targetSpec === "enemy:crest" ? opponentOf(ctx.owner) : ctx.owner;
    handleAllCrestsCountdown(crestOwner, action, amount);
    return;
  }

  // Route to appropriate handler
  if (targetSpec === "self" && ctx.source) {
    // Instance-based: amulet or crest passed as source
    if (isCrest(ctx.source)) {
      handleCrestCountdown(ctx.source, action, amount, ctx.owner);
    } else {
      handleAmuletCountdown(ctx.source as CardInstance, action, amount);
    }
  } else if (crestName) {
    // Name-based: find crest by name
    const crest = findCrestByName(ctx.owner, crestName);
    if (crest) {
      handleCrestCountdown(crest, action, amount, ctx.owner);
    }
  } else if (ctx.source && !isCrest(ctx.source)) {
    // Default: assume amulet source
    handleAmuletCountdown(ctx.source as CardInstance, action, amount);
  }
}

/**
 * Normalize action string to canonical form (advance or delay)
 */
function normalizeAction(action: string): CountdownAction {
  if (action === "advance" || action === "advance_countdown") {
    return "advance";
  }
  if (action === "delay" || action === "delay_countdown") {
    return "delay";
  }
  return "advance"; // default
}

/**
 * Check if object is a Crest (not a CardInstance)
 */
function isCrest(obj: any): obj is Crest {
  return obj && typeof obj === "object" && "owner" in obj && !("uid" in obj);
}

/**
 * Find crest by name for a player
 */
function findCrestByName(owner: Player, name: string): Crest | undefined {
  const crests = getCrests(state, owner);
  return crests.find((c) => c.name?.toLowerCase() === name?.toLowerCase());
}

function handleBoardAmuletCountdown(
  owner: Player,
  eff: Effect,
  action: CountdownAction,
  amount: number,
): void {
  const board = getBoard(state, owner) || [];
  const wantName = String(
    (eff as any).board_name ??
      (eff as any).filter?.name ??
      (eff as any).name ??
      "",
  ).trim();
  const pool = board.filter(
    (c) =>
      c?.type === "Amulet" &&
      c.hasCountdown &&
      (!wantName || String(c.name) === wantName),
  );
  if (!pool.length) return;

  const rawSelect = (eff as any).select;
  const hasSelect =
    rawSelect !== undefined && rawSelect !== null && rawSelect !== "";
  const picks: CardInstance[] = [];
  if (!hasSelect) {
    picks.push(...pool);
  } else {
    const need = Math.max(1, parseInt(String(rawSelect), 10) || 1);
    if ((eff as any).select_mode === "random" || (eff as any).random) {
      const copy = [...pool];
      for (let i = 0; i < need && copy.length; i++) {
        const idx = state.rng.nextInt(copy.length);
        picks.push(copy.splice(idx, 1)[0]!);
      }
    } else {
      picks.push(...pool.slice(0, need));
    }
  }
  for (const card of picks) {
    handleAmuletCountdown(card, action, amount);
  }
}

// =============================================================================
// AMULET COUNTDOWN
// =============================================================================

function handleAmuletCountdown(
  card: CardInstance,
  action: CountdownAction,
  amount: number,
): void {
  if (card.type !== "Amulet" || !card.hasCountdown) return;

  if (action === "advance") {
    card.countdown = Math.max(0, (Number(card.countdown) || 0) - amount);
  } else {
    card.countdown = (Number(card.countdown) || 0) + amount;
  }

  logEvent("countdownChange", {
    card: card.name,
    owner: card.owner,
    value: card.countdown,
    uid: card.uid,
  });

  // Render removed - UI layer
  // Note: cleanupDead() handles amulet death when countdown=0
}

// =============================================================================
// CREST COUNTDOWN
// =============================================================================

function handleAllCrestsCountdown(
  owner: Player,
  action: CountdownAction,
  amount: number,
): void {
  const crests = [...(getCrests(state, owner) || [])];
  for (const crest of crests) {
    handleCrestCountdown(crest, action, amount, owner);
  }
}

function handleCrestCountdown(
  crest: Crest,
  action: CountdownAction,
  amount: number,
  owner: Player,
): void {
  if (!Number.isFinite(crest.countdown)) return;

  if (action === "advance") {
    (crest as any).countdown = Math.max(
      0,
      (Number(crest.countdown) || 0) - amount,
    );

    logEvent("countdownChange", {
      card: crest.name,
      owner,
      value: crest.countdown,
    });

    if ((crest as any).countdown <= 0) {
      completeCrest(crest, owner);
    } else {
      // Render removed - UI layer
    }
  } else {
    (crest as any).countdown = (Number(crest.countdown) || 0) + amount;

    logEvent("countdownChange", {
      card: crest.name,
      owner,
      value: crest.countdown,
    });

    // Render removed - UI layer
  }
}
