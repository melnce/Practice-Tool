// src/logic/effects/ops/stat.ts
import { handleStatOrchestrator } from "./stat/orchestrator.js";
import { Effect, Player, CardInstance } from "../../../core/types.js";
import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import { cleanupDead } from "../../core/cleanup.js";
import { getPool } from "../../core/targeting.js"; // Needed for other handlers

// -----------------------------------------------------------------------------
// MAIN ENTRY POINT (Refactored)
// -----------------------------------------------------------------------------
export function handleStat(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: any,
  context: any = {},
) {
  return handleStatOrchestrator(
    eff as any,
    owner,
    sourceCard,
    effectsQueue,
    context,
  );
}

const toNum = (v: number | string | undefined | null): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

// -----------------------------------------------------------------------------
// LEGACY / SPECIALIZED HANDLERS (Preserved)
// LEGACY: Preserved for determinism/replay compatibility — specialized handlers are intentionally separate.
// -----------------------------------------------------------------------------

export function handleBuffHandTribe(eff: Effect, owner: Player) {
  const hand = owner === "blue" ? state.blueHand : state.redHand;
  const a = parseInt((eff.attack as any) ?? 0) || 0;
  const d = parseInt((eff.defense as any) ?? 0) || 0;

  for (const card of hand) {
    if (
      card.type === "Follower" &&
      Array.isArray(card.tribes) &&
      card.tribes.includes(eff.tribe)
    ) {
      if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
      card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
      card.buffs.defense = Number(card.buffs.defense ?? 0) + d;

      card.attack = (parseInt(String(card.attack)) || 0) + a;
      card.defense = (parseInt(String(card.defense)) || 0) + d;

      // keep previews coherent
      // keep previews coherent
      card.potential_attack =
        toNum(card.potential_attack ?? card.base_attack ?? card.attack) + a;
      card.potential_defense =
        toNum(card.potential_defense ?? card.base_defense ?? card.defense) + d;
      logEvent("buffHand", {
        owner,
        target: card.name,
        uid: card.uid,
        a: a,
        d: d,
        filter: eff.tribe,
      });
    }
  }
}

export function handleBuffHandClass(eff: Effect, owner: Player) {
  const hand = owner === "blue" ? state.blueHand : state.redHand;
  const a = parseInt((eff.attack as any) ?? 0) || 0;
  const d = parseInt((eff.defense as any) ?? 0) || 0;
  const wantClass = String(eff.class || "").trim();

  if (!wantClass) return;

  for (const card of hand) {
    if (card.type === "Follower" && card.class === wantClass) {
      if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
      card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
      card.buffs.defense = Number(card.buffs.defense ?? 0) + d;

      (card as any).attack = (parseInt(String(card.attack)) || 0) + a;
      (card as any).defense = (parseInt(String(card.defense)) || 0) + d;

      // keep previews coherent
      // keep previews coherent
      card.potential_attack =
        toNum(card.potential_attack ?? card.base_attack ?? card.attack) + a;
      card.potential_defense =
        toNum(card.potential_defense ?? card.base_defense ?? card.defense) + d;
      logEvent("buffHand", {
        owner,
        target: card.name,
        uid: card.uid,
        a: a,
        d: d,
        filter: wantClass,
      });
    }
  }
}

export function handleBuffLastAddedToHand(eff: Effect, owner: Player) {
  const card = state.lastAddedToHand;
  if (!card) return;

  const a = parseInt((eff.attack as any) ?? 0) || 0;
  const d = parseInt((eff.defense as any) ?? 0) || 0;

  // Ensure base stats stay as the printed values
  if (card.base_attack == null)
    card.base_attack = parseInt(String(card.attack)) || 0;
  if (card.base_defense == null)
    card.base_defense = parseInt(String(card.defense)) || 0;

  if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
  card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
  card.buffs.defense = Number(card.buffs.defense ?? 0) + d;

  (card as any).attack = (parseInt(String(card.attack)) || 0) + a;
  (card as any).defense = (parseInt(String(card.defense)) || 0) + d;

  card.potential_attack = (card.base_attack ?? 0) + (card.buffs.attack ?? 0);
  card.potential_defense = (card.base_defense ?? 0) + (card.buffs.defense ?? 0);
  logEvent("buffLastAddedToHand", {
    owner,
    name: card.name,
    uid: card.uid,
    a: a,
    d: d,
  });
}

// Repeat a single buff once per current Combo (plays this turn).
export function handleComboRepeatBuff(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: any[] = [],
  context: any = {},
) {
  const plays =
    owner === "blue"
      ? state.bluePlaysThisTurn || 0
      : state.redPlaysThisTurn || 0;
  if (plays <= 0) return;
  logEvent("comboRepeatBuff", { owner, plays });

  const inner = {
    op: "buff",
    target: eff.target,
    random: (eff as any).random,
    count: (eff as any).count,
    attack: eff.attack,
    defense: eff.defense,
    include_self: (eff as any).include_self,
    condition: eff.condition,
  };

  for (let i = 0; i < plays; i++) {
    const res = handleStat(
      inner as any,
      owner,
      sourceCard,
      effectsQueue,
      context,
    );
    if (res === "pending") return res;
  }
}

// NEW: set all matched targets' attack to a fixed value
export function handleSetAttackTo(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: any,
  context: any = {},
) {
  const pool = getPool(
    eff.target as any,
    owner,
    null,
    eff.condition,
    context,
  ).filter((c) => c.type === "Follower");

  if (!pool.length) return "done";

  const to =
    parseInt(
      (eff.value ?? (eff as any).set_to ?? (eff as any).attack_to ?? 0) as any,
    ) || 0;

  for (const target of pool) {
    const current = parseInt(String(target.attack)) || 0;
    const delta = to - current;

    // ensure buffs container
    if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

    // Apply as a buff delta
    target.buffs.attack = (target.buffs.attack ?? 0) + delta;
    (target as any).attack = current + delta;

    // keep previews coherent
    if (!target.potential_attack)
      target.potential_attack = (target.base_attack ||
        Number(target.attack) ||
        0) as number;
    target.potential_attack! += delta;
    logEvent("setAttackTo", {
      owner,
      target: target.name,
      uid: target.uid,
      to,
    });
  }
  return "done";
}

// NEW: set all matched targets' stats to fixed values
export function handleSetStats(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: any,
  context: any = {},
) {
  let pool =
    context?.targets && context.targets.length
      ? context.targets
      : getPool(eff.target as any, owner, null, eff.condition, context).filter(
          (c) => c.type === "Follower",
        );

  pool = pool.filter((c: CardInstance) => c.type === "Follower");

  if (!pool.length) return "done";

  const setA =
    eff.attack !== undefined ? parseInt(eff.attack as any) || 0 : null;
  const setD =
    eff.defense !== undefined ? parseInt(eff.defense as any) || 0 : null;

  for (const target of pool) {
    if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

    if (setA !== null) {
      const currentA = parseInt(String(target.attack)) || 0;
      const deltaA = setA - currentA;
      target.buffs.attack = (target.buffs.attack ?? 0) + deltaA;
      (target as any).attack = setA;
      if (!target.potential_attack)
        target.potential_attack = target.base_attack || currentA;
      target.potential_attack! += deltaA;
    }

    if (setD !== null) {
      // DEBUG: Log before state
      console.log(`[set_stats] BEFORE: ${target.name}`, {
        defense: target.defense,
        base_defense: target.base_defense,
        buffs_defense: target.buffs?.defense,
        peak_defense: target.peak_defense,
      });

      // For set_stats, we're setting a new "base" defense level
      // Update base_defense so UI shows this as the new max HP
      target.base_defense = setD;
      target.buffs.defense = 0; // Reset buff delta since we're setting a new base
      (target as any).defense = setD;
      target.potential_defense = setD;
      // For set_stats, peak_defense should equal the new defense (unit is at "full" health at new stat line)
      target.peak_defense = setD;

      // DEBUG: Log after state
      console.log(`[set_stats] AFTER: ${target.name}`, {
        defense: target.defense,
        base_defense: target.base_defense,
        buffs_defense: target.buffs?.defense,
        peak_defense: target.peak_defense,
      });
    }

    logEvent("setStats", {
      owner,
      target: target.name,
      uid: target.uid,
      a: setA,
      d: setD,
    });
  }

  cleanupDead();
  return "done";
}
