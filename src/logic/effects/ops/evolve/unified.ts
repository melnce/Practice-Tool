// src/logic/effects/ops/evolve/unified.ts

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import type { CardInstance, Player, Effect } from "../../../../core/types/index.js";
import type { UnifiedEvolveSpec } from "./types.js";

import { normalizeToEvolveSpec } from "./types.js";
import { onEvolve } from "../../../evolveUtils.js";
import { getBoard, isFirstPlayer, getEvoUsedThisTurn, getEvoCharges, getSuperEvoCharges } from "../../../../core/playerHelpers.js";
import { resolveUids } from "../../../../core/uidResolver.js";
import { highlightSelectable } from "../../../core/targeting.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";

/**
 * Unified evolve handler - handles all evolve variants.
 * Replaces 8 legacy evolve handlers.
 */
export function handleEvolve(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any = {},
): "done" | "pending" {
  const spec = normalizeToEvolveSpec(eff);

  // If we're resuming after selection, use selected targets
  if (context?.targetUids?.length) {
    const targets = resolveUids(context.targetUids);

    for (const target of targets) {
      applyEvolution(target, owner, spec);
    }

    logEvent("evolve", {
      owner,
      target: spec.target,
      mode: spec.mode || "normal",
      count: targets.length,
    });

    return "done";
  }

  // Handle selection if required
  if (spec.select && spec.select > 0) {
    const pool = buildSelectionPool(spec, owner, sourceCard);

    if (pool.length === 0) {
      // No valid targets, skip silently
      return "done";
    }

    const selectCount = Math.min(spec.select, pool.length);

    setPendingTarget({
      eff: eff as any,
      owner,
      sourceCard,
      resumeEffects: context?.queue || [],
      pool,
      targets: [],
      selectCount,
    });

    highlightSelectable(pool);
    logEvent("evolve_select", {
      owner,
      pool: pool.length,
      select: selectCount,
      mode: spec.mode,
    });
    return "pending";
  }

  const targets = resolveTargets(spec, owner, sourceCard, context);

  for (const target of targets) {
    applyEvolution(target, owner, spec);
  }

  logEvent("evolve", {
    owner,
    target: spec.target,
    mode: spec.mode || "normal",
    count: targets.length,
  });

  return "done";
}

/**
 * Builds a pool of valid targets for selection.
 */
function buildSelectionPool(
  spec: UnifiedEvolveSpec,
  owner: Player,
  sourceCard: CardInstance | null,
): CardInstance[] {
  const board = getBoard(state, owner);
  let pool = board.filter((c) => c.type === "Follower");

  // Apply filter conditions
  if (spec.filter) {
    if (spec.filter.unevolved) {
      pool = pool.filter((c) => !c.hasEvolved);
    }
    if (spec.filter.not_self && sourceCard) {
      pool = pool.filter((c) => c.uid !== sourceCard.uid);
    }
    if (spec.filter.type) {
      pool = pool.filter((c) => c.type?.toLowerCase() === spec.filter!.type!.toLowerCase());
    }
    if (spec.filter.tribe) {
      pool = pool.filter((c) => Array.isArray(c.tribes) && c.tribes.includes(spec.filter!.tribe!));
    }
  }

  return pool;
}

/**
 * Resolves targets based on the evolve spec.
 */
function resolveTargets(
  spec: UnifiedEvolveSpec,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any,
): CardInstance[] {
  const target = spec.target || "selected";

  switch (target) {
    case "self":
    case "played_card":
      return sourceCard ? [sourceCard] : [];

    case "selected":
    case "selected:follower": {
      // UID-based selection only
      if (context?.targetUids?.length) {
        return resolveUids(context.targetUids);
      }
      return [];
    }

    case "last_summoned":
      return (state.lastSummoned || []).filter(
        (c) => c.zone === "board" && c.type === "Follower" && !c.hasEvolved,
      );

    case "all_allies": {
      const board = getBoard(state, owner);
      let candidates = board.filter(
        (c) => c.type === "Follower" && !c.hasEvolved,
      );

      // Filter by name if specified
      if (spec.name) {
        const wantName = spec.name.toLowerCase();
        candidates = candidates.filter(
          (c) => String(c.name || "").toLowerCase() === wantName,
        );
      }
      return candidates;
    }

    default:
      // Custom target string - could be a named card
      if (typeof target === "string" && target.length > 0) {
        const board = getBoard(state, owner);
        return board.filter(
          (c) =>
            c.type === "Follower" &&
            !c.hasEvolved &&
            String(c.name || "").toLowerCase() === target.toLowerCase(),
        );
      }
      return [];
  }
}

/**
 * Applies evolution to a single card.
 */
function applyEvolution(
  card: CardInstance,
  owner: Player,
  spec: UnifiedEvolveSpec,
): void {
  if (!card || card.type !== "Follower" || card.hasEvolved) return;

  const mode = spec.mode || "normal";
  const spendPoint = spec.spend_point ?? false; // Default false for effect-triggered

  // Check if can evolve (only if spending point)
  if (spendPoint && !canEvolve(owner, card, mode)) return;

  const attackBonus = mode === "super" ? 3 : 2;
  const defenseBonus = mode === "super" ? 3 : 2;

  // Apply stat buffs
  if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
  card.buffs.attack = (card.buffs.attack ?? 0) + attackBonus;
  card.buffs.defense = (card.buffs.defense ?? 0) + defenseBonus;

  card.attack = (parseInt(String(card.attack)) || 0) + attackBonus;
  card.defense = (parseInt(String(card.defense)) || 0) + defenseBonus;
  card.peak_defense = Math.max(
    card.peak_defense ?? (card.defense as number),
    card.defense as number,
  );

  // Swap to evolved image
  if (card.evo_image) card.base_image = card.evo_image;

  // Grant rush (or keep storm active)
  if (card.hasStorm) {
    card.isRush = false;
    card.can_attack = true;
  } else {
    card.hasRush = true;
    card.isRush = true;
    card.can_attack = true;
  }

  logEvent("evolve", {
    owner,
    name: card.name,
    uid: card.uid,
    mode,
    atk: attackBonus,
    def: defenseBonus,
  });

  // Run evolve effects, spend counters, set flags
  onEvolve(card, owner, mode, { spendPoint, skipEffects: false });
}

/**
 * Check if evolution is allowed (when spending points).
 */
function canEvolve(owner: Player, card: CardInstance, mode: string): boolean {
  if (!card || card.type !== "Follower" || card.hasEvolved) return false;

  const first = isFirstPlayer(owner);
  const usedThisTurn = getEvoUsedThisTurn(state, owner);
  const normalUnlocked = first ? state.roundCount >= 5 : state.roundCount >= 4;
  const superUnlocked = first ? state.roundCount >= 7 : state.roundCount >= 6;

  if (mode === "super") {
    const charges = getSuperEvoCharges(state, owner);
    return superUnlocked && !usedThisTurn && charges > 0;
  } else {
    const charges = getEvoCharges(state, owner);
    return normalUnlocked && !usedThisTurn && charges > 0;
  }
}















