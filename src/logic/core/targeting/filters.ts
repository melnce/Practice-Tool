import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types.js";
import { TargetQuery, TargetingEnv } from "./types.js";
import { getBoard, getHand } from "../../../core/playerHelpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function _isCardDamaged(c: CardInstance) {
  const curr = parseInt(c?.defense as string, 10) || 0;
  const full = Number.isFinite(c?.potential_defense)
    ? (c.potential_defense as number)
    : Number.isFinite(c?.peak_defense)
      ? (c.peak_defense as number)
      : Number.isFinite(c?.base_defense)
        ? (c.base_defense as number)
        : curr;
  return curr < full;
}

export function getCardSide(c: CardInstance): Player | null {
  if (getBoard(state, "first")?.includes(c)) return "first";
  if (getBoard(state, "second")?.includes(c)) return "second";
  if (getHand(state, "first")?.includes(c)) return "first";
  if (getHand(state, "second")?.includes(c)) return "second";
  return c?.owner ?? null;
}

const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);

// -----------------------------------------------------------------------------
// Filter Pipeline
// -----------------------------------------------------------------------------

export function applyFilters(
  pool: CardInstance[],
  query: TargetQuery,
  env: TargetingEnv,
): CardInstance[] {
  const cond = query.condition || {};
  let filtered = pool;

  // 1. Initial Type Filter (from parser, e.g. "ally:follower")
  if (query.typeFilter === "follower")
    filtered = filtered.filter((c) => c?.type === "Follower");
  else if (query.typeFilter === "amulet")
    filtered = filtered.filter((c) => c?.type === "Amulet");
  else if (query.typeFilter === "spell")
    filtered = filtered.filter((c) => c?.type === "Spell");

  // Log check from legacy:
  // "if (!(globalThis as any).HEADLESS && spec.startsWith("hand:")) console.warn(`[getPool] After Type Filter (${type}): ${pool.length}`);"
  // We'll preserve this check logic in the Orchestrator or here if side is hand.
  // For purity, let's skip logging here and let Orchestrator handle debug logs if needed,
  // or arguably the legacy code only logged in getPool. I will add a method or just skip for now as primarily debug.

  // 2. Self Exclusion
  const allowSelf =
    query.side === "self" ||
    cond.not_self === false ||
    cond.include_self === true;

  if (!allowSelf && env.sourceCard) {
    filtered = filtered.filter((c) => c?.uid !== env.sourceCard!.uid);
  }

  // 3. Explicit Condition Type Override
  if (cond.type) {
    const typeFilter = String(cond.type).toLowerCase();
    filtered = filtered.filter(
      (c) => String(c?.type || "").toLowerCase() === typeFilter,
    );
  }

  // 4. Unevolved
  if (cond.unevolved) {
    filtered = filtered.filter((c) => c && !c.hasEvolved);
  }

  // 5. Tribe
  if (cond.tribe) {
    filtered = filtered.filter(
      (c) => Array.isArray(c?.tribes) && c.tribes!.includes(cond.tribe),
    );
  }

  // 6. Keywords
  if (cond.has_keyword) {
    const keywordName = String(cond.has_keyword).toLowerCase();
    filtered = filtered.filter((c) => {
      const hasInArray =
        Array.isArray(c?.keywords) &&
        c.keywords!.some((k: any) => {
          const kwName =
            typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase();
          return kwName === keywordName;
        });
      const hasInState =
        keywordName === "cant_attack" &&
        (c?.keywordState?.hasCantAttack ||
          c?.keywordState?.cantAttack ||
          c?.keywordState?.cantAttackUntilOpponentEOT);
      return hasInArray || hasInState;
    });
  }

  // 7. Exclude Keyword
  if (cond.exclude_keyword) {
    const keywordName = String(cond.exclude_keyword).toLowerCase();
    filtered = filtered.filter((c) => {
      const hasInArray =
        Array.isArray(c?.keywords) &&
        c.keywords!.some((k: any) => {
          const kwName =
            typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase();
          return kwName === keywordName;
        });
      const hasInState =
        keywordName === "cant_attack" &&
        (c?.keywordState?.hasCantAttack ||
          c?.keywordState?.cantAttack ||
          c?.keywordState?.cantAttackUntilOpponentEOT);

      return !(hasInArray || hasInState);
    });
  }

  // 8. Super Evolved
  if (cond.is_super_evolved) {
    filtered = filtered.filter(
      (c) => c && c.type === "Follower" && c.evoType === "super",
    );
  }

  // 9. Stat Filters
  if (cond.attack_lte != null) {
    const lim = toNum(cond.attack_lte);
    if (lim != null)
      filtered = filtered.filter(
        (c) => c?.type === "Follower" && (Number(c.attack) || 0) <= lim,
      );
  }
  if (cond.attack_gte != null) {
    const lim = toNum(cond.attack_gte);
    if (lim != null)
      filtered = filtered.filter(
        (c) => c?.type === "Follower" && (Number(c.attack) || 0) >= lim,
      );
  }
  if (cond.attack_eq != null) {
    const lim = toNum(cond.attack_eq);
    if (lim != null)
      filtered = filtered.filter(
        (c) => c?.type === "Follower" && (Number(c.attack) || 0) === lim,
      );
  }
  if (cond.defense_lte != null) {
    const lim = toNum(cond.defense_lte);
    if (lim != null)
      filtered = filtered.filter(
        (c) => c?.type === "Follower" && (Number(c.defense) || 0) <= lim,
      );
  }
  if (cond.defense_gte != null) {
    const lim = toNum(cond.defense_gte);
    if (lim != null)
      filtered = filtered.filter(
        (c) => c?.type === "Follower" && (Number(c.defense) || 0) >= lim,
      );
  }
  if (cond.defense_eq != null) {
    const lim = toNum(cond.defense_eq);
    if (lim != null)
      filtered = filtered.filter(
        (c) => c?.type === "Follower" && (Number(c.defense) || 0) === lim,
      );
  }

  // 9b. Base Cost Filter
  if (cond.base_cost_eq != null) {
    const lim = toNum(cond.base_cost_eq);
    if (lim != null)
      filtered = filtered.filter((c) => {
        const cost =
          c.base_cost !== undefined
            ? c.base_cost
            : parseInt(c.cost as any) || 0;
        return cost === lim;
      });
  }

  // 10. Ambush / Aura (Enemy Logic)
  // LEGACY: Ambush only protects against ENEMY targeted effects.
  // Self-targeting (buffs) or random effects (AOE) bypass this check.
  if (env.context.isTargetedEffect) {
    filtered = filtered.filter((c) => {
      const cardSide = getCardSide(c);
      const isEnemy = cardSide && cardSide !== env.owner;
      if (isEnemy && (c?.hasAmbush || (c as any).hasAura)) return false;
      return true;
    });
  }

  // 11. Taunt Enforcement (opponents must target Taunt cards first)
  // If targeting enemies and any have Taunt, ONLY Taunt cards are valid targets.
  if (env.context.isTargetedEffect) {
    const tauntCards = filtered.filter((c) => {
      const cardSide = getCardSide(c);
      const isEnemy = cardSide && cardSide !== env.owner;
      return isEnemy && (c as any).hasTaunt;
    });

    if (tauntCards.length > 0) {
      // Filter to only Taunt cards + any ally cards (Taunt only restricts enemy targeting)
      filtered = filtered.filter((c) => {
        const cardSide = getCardSide(c);
        const isEnemy = cardSide && cardSide !== env.owner;
        return !isEnemy || (c as any).hasTaunt;
      });
    }
  }

  // 11. Damaged
  if (cond.damaged === true) {
    filtered = filtered.filter(
      (c) => c?.type === "Follower" && _isCardDamaged(c),
    );
  } else if (cond.damaged === false) {
    filtered = filtered.filter(
      (c) => c?.type === "Follower" && !_isCardDamaged(c),
    );
  }

  // 12. Did Not Attack This Turn
  if (cond.did_not_attack_this_turn) {
    filtered = filtered.filter(
      (c) =>
        c?.type === "Follower" &&
        !(c as any).attacks_used_this_turn &&
        !c.hasAttacked,
    );
  }

  return filtered;
}















