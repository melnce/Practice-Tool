// src/logic/effects/ops/evolve/unified.ts

import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, Player, Effect } from "../../../../core/types.js";
import { UnifiedEvolveSpec, normalizeToEvolveSpec } from "./types.js";
import { onEvolve } from "../../../evolveUtils.js";

/**
 * Unified evolve handler - handles all evolve variants.
 * Replaces 8 legacy evolve handlers.
 */
export function handleEvolve(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any = {},
): "done" {
  const spec = normalizeToEvolveSpec(eff);
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
      return sourceCard ? [sourceCard] : [];

    case "selected": {
      const selected =
        context?.targetCard ||
        context?.selectedCard ||
        context?.playedCard ||
        context?.enteringCard ||
        context?.targets?.[0];
      return selected ? [selected] : [];
    }

    case "last_summoned":
      return (state.lastSummoned || []).filter(
        (c) => c.zone === "board" && c.type === "Follower" && !c.hasEvolved,
      );

    case "all_allies": {
      const board = owner === "blue" ? state.blueBoard : state.redBoard;
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
        const board = owner === "blue" ? state.blueBoard : state.redBoard;
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

  const isBlue = owner === "blue";
  const usedThisTurn = isBlue
    ? state.blueEvoUsedThisTurn
    : state.redEvoUsedThisTurn;
  const normalUnlocked = isBlue ? state.roundCount >= 5 : state.roundCount >= 4;
  const superUnlocked = isBlue ? state.roundCount >= 7 : state.roundCount >= 6;

  if (mode === "super") {
    const charges = isBlue
      ? state.blueSuperEvoCharges | 0
      : state.redSuperEvoCharges | 0;
    return superUnlocked && !usedThisTurn && charges > 0;
  } else {
    const charges = isBlue ? state.blueEvoCharges | 0 : state.redEvoCharges | 0;
    return normalUnlocked && !usedThisTurn && charges > 0;
  }
}
