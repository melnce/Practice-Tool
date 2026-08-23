// src/logic/effects/ops/evolve.ts
import { onEvolve } from "../../evolveUtils.js";
import { logEvent } from "../../../core/logger.js";
import { state } from "../../../core/gameState.js";
import type { CardInstance, Player } from "../../../core/types/index.js";
import {
  isFirstPlayer,
  getEvoUsedThisTurn,
  getEvoCharges,
  getSuperEvoCharges,
} from "../../../core/playerHelpers.js";

function canEvolve(owner: Player, card: CardInstance, mode = "normal") {
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

export function handleEvolveSelf(
  sourceCard: CardInstance,
  owner: Player,
  opts: any = {},
) {
  const { spendPoint = true, mode = "normal", runEvoEffects = true } = opts; // <-- allow mode
  if (spendPoint && !canEvolve(owner, sourceCard, mode)) return; // engine gate

  const attackBonus = mode === "super" ? 3 : 2;
  const defenseBonus = mode === "super" ? 3 : 2;

  const preEvoAtk = parseInt(String(sourceCard.attack)) || 0;
  const preEvoDef = parseInt(String(sourceCard.defense)) || 0;

  if (!sourceCard.buffs) sourceCard.buffs = { attack: 0, defense: 0 };
  sourceCard.buffs.attack = (sourceCard.buffs.attack ?? 0) + attackBonus;
  sourceCard.buffs.defense = (sourceCard.buffs.defense ?? 0) + defenseBonus;

  sourceCard.attack = preEvoAtk + attackBonus;
  sourceCard.defense = preEvoDef + defenseBonus;

  const prePeak = sourceCard.peak_defense ?? preEvoDef;
  sourceCard.peak_defense = Math.max(
    prePeak + defenseBonus,
    sourceCard.defense as number,
  );
  if (sourceCard.potential_defense != null) {
    sourceCard.potential_defense = Math.max(
      sourceCard.potential_defense + defenseBonus,
      sourceCard.peak_defense,
    );
  }
  logEvent("evolve", {
    owner,
    name: sourceCard.name,
    uid: sourceCard.uid,
    mode,
    atk: +attackBonus,
    def: +defenseBonus,
  });
  if (sourceCard.evo_image) sourceCard.base_image = sourceCard.evo_image;

  if (sourceCard.hasStorm) {
    sourceCard.isRush = false;
    sourceCard.can_attack = true;
  } else {
    sourceCard.hasRush = true;
    sourceCard.isRush = true;
    sourceCard.can_attack = true;
  }

  // Spend counters, set evo flags, and (optionally) run the card’s evolve/superevolve script.
  onEvolve(sourceCard, owner, mode, {
    spendPoint,
    skipEffects: !runEvoEffects,
  });
}

/** Effect-granted evolve: stats + flags only; never runs the card's evolve[] / superevolve[] script. */
export function evolveFollowerByEffect(
  sourceCard: CardInstance,
  owner: Player,
  mode: "normal" | "super" = "normal",
) {
  handleEvolveSelf(sourceCard, owner, {
    spendPoint: false,
    mode,
    runEvoEffects: true,
  });
}

export function handleEvolveLastSummoned(owner: Player) {
  console.log(
    `[evolve_last_summoned] LastSummoned length: ${state.lastSummoned?.length}`,
  );
  if (!state.lastSummoned || state.lastSummoned.length === 0) return;

  // Create a copy to avoid mutation issues during iteration if evolve triggers further summons (unlikely but safe)
  const targets = [...state.lastSummoned];

  for (const card of targets) {
    console.log(
      `[evolve_last_summoned] Checking card: ${card.name} (${card.uid}) Zone: ${card.zone} Type: ${card.type} Evolved: ${card.hasEvolved}`,
    );
    if (card.zone === "board" && card.type === "Follower" && !card.hasEvolved) {
      evolveFollowerByEffect(card, owner);
    }
  }
}
