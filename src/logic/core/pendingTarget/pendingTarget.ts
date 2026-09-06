// src/logic/core/pendingTarget/pendingTarget.ts
// Centralized facade for pendingTargetEffect lifecycle management.
// All ops should use these helpers instead of directly writing to state.pendingTargetEffect.

import { state } from "../../../core/gameState.js";
import type { PendingTargetRequest } from "./types.js";
import { hasTargetedOpHandler, isTargetedOpRegistryReady } from "./types.js";
import { toUids, toUid } from "../../../core/uidResolver.js";
import { isDev, readEnv } from "../../../core/env.js";
import { logEvent } from "../../../core/logger.js";
import type {
  CardInstance,
  Effect,
  Player,
} from "../../../core/types/index.js";

export type TargetSelectionResult = "pending" | "fizzled";

/**
 * Sets the pending target selection state.
 * This is the ONLY approved way for ops to initiate target selection.
 *
 * Auto-populates UID fields from object refs if not provided.
 *
 * @param request - The selection request specification
 */
export function setPendingTarget(
  request: Partial<PendingTargetRequest> & {
    eff: any;
    owner: any;
    selectCount: number;
  },
): void {
  // Auto-populate UID fields from object refs if not provided
  const normalized: any = { ...request };

  // Ensure targetUids exists (default empty)
  if (!normalized.targetUids) {
    normalized.targetUids = normalized.targets
      ? toUids(normalized.targets)
      : [];
  }

  // Ensure poolUids exists
  if (!normalized.poolUids) {
    normalized.poolUids = normalized.pool ? toUids(normalized.pool) : [];
  }

  // Populate sourceCardUid if sourceCard is provided
  if (normalized.sourceCard && !normalized.sourceCardUid) {
    normalized.sourceCardUid = toUid(normalized.sourceCard);
  }

  const op = String(normalized.eff?.op ?? "");
  if (op && isTargetedOpRegistryReady() && !hasTargetedOpHandler(op)) {
    const sourceName =
      normalized.sourceCard?.name ?? normalized.sourceCardUid ?? "unknown";
    const msg = `[setPendingTarget] No targeted handler for op "${op}" (source: ${sourceName})`;
    if (isDev()) {
      throw new Error(msg);
    }
    console.warn(msg);
  }

  state.pendingTargetEffect = normalized;
}

export function poolLengthFromRequest(
  request: Partial<PendingTargetRequest>,
): number {
  if (Array.isArray(request.poolUids) && request.poolUids.length > 0) {
    return request.poolUids.length;
  }
  if (Array.isArray(request.pool) && request.pool.length > 0) {
    return request.pool.length;
  }
  return 0;
}

function assertSpellNeverReachedEmptySelect(
  sourceCard: CardInstance | null | undefined,
  eff: Effect | undefined,
): void {
  if (!isDev()) return;
  if (sourceCard?.type !== "Spell") return;
  if ((eff as { optional?: boolean } | undefined)?.optional === true) return;
  const msg = `[selectFizzled] Spell "${sourceCard.name}" (${sourceCard.id}) reached empty mandatory select — preflight should have blocked play. op=${String(eff?.op ?? "")}`;
  const headless =
    readEnv("VITEST") === "true" ||
    readEnv("HEADLESS") === "true" ||
    !!(globalThis as { HEADLESS?: boolean }).HEADLESS;
  if (headless) {
    console.error(msg);
    return;
  }
  throw new Error(msg);
}

/**
 * Log that a mandatory select clause had no legal targets and fizzled.
 * Follower/amulet paths may continue the parent effect list; spells must never reach here.
 */
export function reportSelectFizzled(params: {
  eff?: Effect;
  owner?: Player;
  sourceCard?: CardInstance | null;
  target?: string;
}): void {
  assertSpellNeverReachedEmptySelect(params.sourceCard, params.eff);
  logEvent("selectFizzled", {
    owner: params.owner,
    op: params.eff?.op,
    target: params.target ?? params.eff?.target,
    source: params.sourceCard?.name,
    sourceUid: params.sourceCard?.uid,
  });
}

/**
 * Begin a targeted selection pause, or fizzle when the pool is empty.
 * Leader-fallback prompts (canTargetLeader) may proceed with an empty follower pool.
 */
export function trySetPendingTarget(
  request: Partial<PendingTargetRequest> & {
    eff: any;
    owner: any;
    selectCount: number;
  },
): TargetSelectionResult {
  const poolLen = poolLengthFromRequest(request);
  const canLeader = !!(request as { canTargetLeader?: boolean })
    .canTargetLeader;
  if (poolLen === 0 && !canLeader) {
    reportSelectFizzled({
      eff: request.eff,
      owner: request.owner,
      sourceCard: request.sourceCard ?? null,
      target: request.eff?.target,
    });
    return "fizzled";
  }

  setPendingTarget(request);
  return "pending";
}

/**
 * Clears the pending target selection state.
 * Called by resolveTarget after execution completes.
 */
export function clearPendingTarget(): void {
  delete state.pendingTargetEffect;
}

/**
 * Gets the current pending target selection state.
 * Safe for UI/read-only access.
 */
export function getPendingTarget(): PendingTargetRequest | null {
  return (state.pendingTargetEffect as PendingTargetRequest) || null;
}

/**
 * Checks if there is a pending target selection.
 * Use for pause/resume checks in playCard/* modules.
 */
export function isPendingTarget(): boolean {
  return !!state.pendingTargetEffect;
}
