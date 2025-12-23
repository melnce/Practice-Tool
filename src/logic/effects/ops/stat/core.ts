import { state } from "../../../../core/gameState.js";

import { applyKeyword } from "../../../core/keywords.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, Player } from "../../../../core/types.js";
import { StatOp } from "./types.js";
import { fireTrigger } from "../../../core/triggers.js";

/**
 * Applies stat changes to a card (additive).
 * Handles `buffs`, `attack`, `defense`, `peak_defense`, `potential_*`.
 */
export function applyStatBuff(
  target: CardInstance,
  a: number,
  d: number,
  _owner: Player,
) {
  if (!target.buffs) target.buffs = { attack: 0, defense: 0 };
  target.buffs.attack = (target.buffs.attack ?? 0) + a;
  target.buffs.defense = (target.buffs.defense ?? 0) + d;

  (target as any).attack = (parseInt(String(target.attack)) || 0) + a;
  (target as any).defense = (parseInt(String(target.defense)) || 0) + d;
  target.peak_defense = Math.max(
    target.peak_defense ?? Number(target.defense),
    Number(target.defense),
  );

  if (!target.potential_attack)
    target.potential_attack = (target.base_attack ||
      Number(target.attack) ||
      0) as number;
  if (!target.potential_defense)
    target.potential_defense = (target.base_defense ||
      Number(target.defense) ||
      0) as number;
  target.potential_attack! += a;
  target.potential_defense! += d;
}

/**
 * Sets stats to fixed values (action: "set").
 * If attack or defense is undefined, that stat is not changed.
 */
export function setStatsBuff(
  target: CardInstance,
  setA: number | null,
  setD: number | null,
  owner: Player,
) {
  if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

  if (setA !== null) {
    const currentA = parseInt(String(target.attack)) || 0;
    const deltaA = setA - currentA;
    target.buffs.attack = (target.buffs.attack ?? 0) + deltaA;
    (target as any).attack = setA;
    if (!target.potential_attack)
      target.potential_attack = (target.base_attack as number) || currentA;
    target.potential_attack! += deltaA;
    logEvent("setStats", {
      owner,
      target: target.name,
      uid: target.uid,
      stat: "attack",
      value: setA,
    });
  }

  if (setD !== null) {
    // For set_stats, we're setting a new "base" defense level
    target.base_defense = setD;
    target.buffs.defense = 0; // Reset buff delta since we're setting a new base
    (target as any).defense = setD;
    target.potential_defense = setD;
    target.peak_defense = setD; // Unit is at "full" health at new stat line
    logEvent("setStats", {
      owner,
      target: target.name,
      uid: target.uid,
      stat: "defense",
      value: setD,
    });
  }
}

/**
 * Applies keywords from the effect.
 */
export function applyKeywordBuff(
  target: CardInstance,
  eff: StatOp,
  requestOwner?: Player,
) {
  // STRICT: Only accept keywords array, not singular keyword
  const grantListRaw = eff.keywords || null;
  if (grantListRaw) {
    const grantList = Array.isArray(grantListRaw)
      ? grantListRaw
      : [grantListRaw];
    for (const kw of grantList) {
      const name = (typeof kw === "string" ? kw : kw?.name) || "";
      const options: any = typeof kw === "object" ? { ...kw } : {};

      // Pass duration from effect to keyword options
      if (eff.duration === "opponent_turn_end") {
        options.until_opponent_eot = true;
        options.request_owner = requestOwner; // Who cast the debuff
      }
      if (eff.duration === "turn_end" || (eff as any).until_end_of_turn) {
        options.expires_on_turn = state.roundCount;
      }

      if (name)
        applyKeyword(
          target,
          name,
          Object.keys(options).length > 0 ? options : undefined,
        );
    }
  }
}

/**
 * Applies "attacks_per_turn" setting.
 */
export function applyAttacksPerTurnBuff(
  target: CardInstance,
  eff: StatOp,
  owner: Player,
) {
  if ((eff as any).attacks_per_turn !== undefined) {
    const n = parseInt((eff as any).attacks_per_turn) || 1;
    target.attacks_per_turn = n;
    // Give them the attacks immediately if they can attack
    if (target.hasStorm || target.hasRush || !target.justPlayed) {
      target.attacks_left = n;
      target.can_attack = true;
    }
    logEvent("attacksPerTurn", {
      owner,
      target: target.name,
      uid: target.uid,
      value: n,
    });
  }
}

/**
 * Checks and fires post-buff triggers.
 */
export function checkPostBuffTriggers(
  target: CardInstance,
  a: number,
  d: number,
  owner: Player,
) {
  // NEW: notify when a positive buff is applied to a follower on the field
  // LEGACY: explicit trigger firing preserved for determinism/replay compatibility — do not simplify to reactive system
  if (
    (a > 0 || d > 0) &&
    (state.blueBoard.includes(target) || state.redBoard.includes(target))
  ) {
    fireTrigger("self_buffed_up", owner, { target });
  }

  // Fire "enemy_follower_defense_down" if we actually reduced DEF on an enemy follower
  if (d < 0 && target?.type === "Follower") {
    const targetOwner = state.blueBoard.includes(target)
      ? "blue"
      : state.redBoard.includes(target)
        ? "red"
        : null;
    const debufferOwner = owner; // the player executing this buff/debuff op
    if (targetOwner && debufferOwner) {
      fireTrigger("enemy_follower_defense_down", debufferOwner, { target });
    }
  }
}
