// src/ui/helpers/glow.ts
import { isOverflow } from "../../helpers/overflow.js";
import { comboReadyInHand } from "../../helpers/combo.js";
import { hasNecromancy } from "../../helpers/necromancy.js";
import { handleSuperEvoGate } from "../../logic/effects/gates/gates.js";
import type { CardInstance, GameState, Player, Effect } from "../../core/types/index.js";

// ---- local helpers ported from zones.js ----

function earthRiteCostInFanfare(effects: Effect[] | unknown): number {
  if (!Array.isArray(effects)) return 0;
  const scan = (effs: any[]): number => {
    let best = Infinity;
    for (const e of effs) {
      if (!e || typeof e !== "object") continue;
      if (e.op === "earth_rite") {
        // Card schema uses "cost", not "amount"
        const c = Math.max(1, Number(e.cost ?? e.amount ?? 1) || 1);
        best = Math.min(best, c);
      }
      if (Array.isArray(e.effects)) best = Math.min(best, scan(e.effects));
      if (e.op === "mode" && Array.isArray(e.options)) {
        for (const opt of e.options) {
          const req = opt?.requires || {};
          const c = Number(req.earth_rite ?? req.earth ?? 0);
          if (c > 0) best = Math.min(best, c);
          if (Array.isArray(opt.effects))
            best = Math.min(best, scan(opt.effects));
        }
      }
    }
    return best;
  };
  const r = scan(effects as any[]);
  return Number.isFinite(r) ? r : 0;
}

function hasEarthOnBoard(state: GameState, owner: Player, n = 1) {
  const board = owner === "first" ? state.players.first.board : state.players.second.board;
  return board.some(
    (c) => c?.type === "Amulet" && Number(c?.counters?.earth) >= n,
  );
}

function hasOverflowInTree(effs: unknown): boolean {
  if (!Array.isArray(effs)) return false;
  for (const e of effs) {
    if (!e || typeof e !== "object") continue;
    if (
      (e.op === "gate" && (e as any).condition === "overflow") ||
      e.amount_overflow !== undefined ||
      e.overflow_amount !== undefined
    )
      return true;
    if (Array.isArray(e.effects) && hasOverflowInTree(e.effects)) return true;
    if (e.op === "mode" && Array.isArray(e.options)) {
      if (e.options.some((opt: any) => hasOverflowInTree(opt.effects || [])))
        return true;
    }
  }
  return false;
}

function hasSuperEvoAllyOnBoard(state: GameState, owner: Player) {
  const board = owner === "first" ? state.players.first.board : state.players.second.board;
  return board.some(
    (c) => c?.type === "Follower" && c.hasEvolved && c.evoType === "super",
  );
}

/**
 * Check if any effect in the list has a select requirement with no valid targets.
 * Returns true if spell should be blocked from glowing.
 */
function spellHasUnmetSelectTarget(effects: any[], owner: Player, state: GameState): boolean {
  if (!Array.isArray(effects)) return false;

  const ownerBoard = owner === "first" ? state.players.first.board : state.players.second.board;
  const enemyBoard = owner === "first" ? state.players.second.board : state.players.first.board;
  const ownerHand = owner === "first" ? state.players.first.hand : state.players.second.hand;

  for (const eff of effects) {
    if (!eff || typeof eff !== "object") continue;

    // Detect select requirement in two forms:
    // 1. eff.select: 1 (inline select on damage/destroy/etc)
    // 2. op: "select" with select_count: 1 (explicit select operation)
    const hasNumericSelect = typeof eff.select === "number" && eff.select > 0;
    const isSelectOp = eff.op === "select" && typeof eff.select_count === "number" && eff.select_count > 0;

    if (!hasNumericSelect && !isSelectOp) {
      // Recurse into nested effects
      if (Array.isArray(eff.effects) && spellHasUnmetSelectTarget(eff.effects, owner, state)) {
        return true;
      }
      continue;
    }

    // Parse target to determine required pool
    const target = String(eff.target || "").toLowerCase();

    if (target.includes("enemy:follower") || target === "enemy:any") {
      const hasValidEnemy = enemyBoard.some((c: any) => c?.type === "Follower" && !c?.hasAmbush);
      if (!hasValidEnemy) return true;
    }
    if (target.includes("ally:follower") || target === "ally:any") {
      const hasValidAlly = ownerBoard.some((c: any) => c?.type === "Follower");
      if (!hasValidAlly) return true;
    }
    if (target.includes("ally:hand")) {
      // Need at least select+1 cards (the spell being played doesn't count)
      if (ownerHand.length <= eff.select) return true;
    }
    if (target.includes("enemy:amulet")) {
      const hasEnemyAmulet = enemyBoard.some((c: any) => c?.type === "Amulet");
      if (!hasEnemyAmulet) return true;
    }
    if (target.includes("ally:amulet")) {
      const hasAllyAmulet = ownerBoard.some((c: any) => c?.type === "Amulet");
      if (!hasAllyAmulet) return true;
    }

    // Recurse into nested effects
    if (Array.isArray(eff.effects) && spellHasUnmetSelectTarget(eff.effects, owner, state)) {
      return true;
    }
  }

  return false;
}

// ---- main exported API ----
/**
 * Compute which glow class to apply for a hand card.
 * Returns: { glowClass: "enhance-ready" | "playable-glow" | null }
 */
export function computeHandGlow(card: CardInstance, ctx: any) {
  // ctx: { state, owner, isPlayersTurn, availablePP, isSpell, tier?, shownCost? }
  const { state, owner, isPlayersTurn, availablePP, isSpell } = ctx;

  // NOTE: Do NOT attach state to card (circular reference breaks cloning)
  // State is available via ctx parameter for all checks

  // cost preview already computed by caller; use ctx.shownCost if present
  const shownCost = Number(
    ctx.shownCost ?? (card as any).shownCost ?? (card as any).cost ?? 0,
  );

  let canAfford = isPlayersTurn && availablePP >= shownCost;

  // ---- board capacity hard block (max 5) ----
  const ownerBoard = owner === "first" ? state.players.first.board : state.players.second.board;
  const isBoardCard =
    !isSpell && (card?.type === "Follower" || card?.type === "Amulet");
  if (
    isBoardCard &&
    Array.isArray(ownerBoard) &&
    ownerBoard.filter(Boolean).length >= 5
  ) {
    return { glowClass: null }; // no glow if board is full
  }

  // Spell-specific preconditions
  if (isSpell) {

    // Doomwright Resurgence: need >=2 eligible artifacts in hand
    if (card.name === "Doomwright Resurgence") {
      const ownerHand = owner === "first" ? state.players.first.hand : state.players.second.hand;
      const getEffectiveCost = (c: any) =>
        Number.isFinite(c?.effectiveCost)
          ? c.effectiveCost
          : (Number(c?.cost) || 0) + (Number(c?.cost_mod) || 0);
      const eligible = ownerHand.filter(
        (c: CardInstance) =>
          c?.type === "Follower" &&
          Array.isArray(c?.tribes) &&
          c.tribes.includes("Artifact") &&
          getEffectiveCost(c) <= 5,
      ).length;
      if (eligible < 2) canAfford = false;
    }

    // Generic: spells with select targets require valid targets
    const spellEffects = Array.isArray((card as any).spell) ? (card as any).spell : [];
    if (spellHasUnmetSelectTarget(spellEffects, owner, state)) {
      canAfford = false;
    }
    // Radiant Rainbow: require a Spellboost card in hand
    if (card.name && card.name.toLowerCase() === "radiant rainbow") {
      const ownerHand = owner === "first" ? state.players.first.hand : state.players.second.hand;
      const hasSB = ownerHand.some(
        (c: CardInstance) =>
          Array.isArray(c.keywords) &&
          c.keywords.some(
            (k: string | { name?: string }) =>
              (typeof k === "string" ? k : k?.name)?.toLowerCase?.() ===
              "spellboost",
          ),
      );
      if (!hasSB) canAfford = false;
    }
  }

  // gates that upgrade to yellow glow
  const comboReady = isPlayersTurn && comboReadyInHand(card, owner, state);
  const tier = ctx.tier ?? null; // caller may pass
  const enhanceReady = isPlayersTurn && !!tier;
  const fusedAllureReady =
    isPlayersTurn && card?.name === "Garden's Allure" && card?.isFused === true;

  const fusedSlashReady =
    isPlayersTurn && card?.name === "Returning Slash" && card?.isFused === true;

  // Earth Rite
  const erCost = earthRiteCostInFanfare(
    Array.isArray(card.fanfare) && card.fanfare.length
      ? card.fanfare
      : Array.isArray((card as any).spell)
        ? (card as any).spell
        : [],
  );
  const earthReady =
    isPlayersTurn && erCost > 0 && hasEarthOnBoard(state, owner, erCost);

  // Overflow
  const hasOverflowEffects =
    hasOverflowInTree(Array.isArray(card.fanfare) ? card.fanfare : []) ||
    hasOverflowInTree(
      Array.isArray((card as any).spell) ? (card as any).spell : [],
    );
  const overflowReady =
    isPlayersTurn && hasOverflowEffects && isOverflow(owner);

  // Necromancy
  const hasNecroGate =
    Array.isArray(card.fanfare) &&
    card.fanfare.some(
      (eff) => eff.op === "gate" && (eff as any).condition === "necromancy",
    );
  const necromancyReady =
    isPlayersTurn &&
    hasNecroGate &&
    hasNecromancy(
      owner,
      (
        card.fanfare?.find(
          (eff: Effect) =>
            eff.op === "gate" && (eff as any).condition === "necromancy",
        ) as any
      )?.cost || 0,
    );

  // Skybound Art (Yellow Glow)
  const hasSkybound =
    (Array.isArray(card.fanfare) &&
      card.fanfare.some(
        (eff) => eff.op === "gate" && (eff as any).condition === "skybound_art",
      )) ||
    (Array.isArray((card as any).spell) &&
      (card as any).spell.some(
        (eff: any) => eff.op === "gate" && eff.condition === "skybound_art",
      ));
  let skyboundReady = false;
  if (isPlayersTurn && hasSkybound) {
    // inline logic for speed, matching gates.ts
    const gateEff =
      card.fanfare?.find(
        (eff) => eff.op === "gate" && (eff as any).condition === "skybound_art",
      ) ||
      (card as any).spell?.find(
        (eff: any) => eff.op === "gate" && eff.condition === "skybound_art",
      );
    const req = parseInt(gateEff?.requirement || gateEff?.count || 10, 10);
    const gauge =
      (state.roundCount || 1) + (card.skyboundArtEvolvesWitnessed || 0);
    skyboundReady = gauge >= req;
  }

  // Super-evolved ally gate (generic support)
  const hasSuperEvoGate =
    (Array.isArray(card.fanfare) &&
      card.fanfare.some(
        (e) =>
          e.op === "gate" &&
          /super[_-]?evolved?[_-]?alli/i.test((e as any).condition || ""),
      )) ||
    /super[- ]?evolved allied follower/i.test(card?.description || "");

  // NEW: super-evolution unlock gate (e.g., Cheretta fanfare)
  const hasSuperUnlockGate =
    Array.isArray(card.fanfare) &&
    card.fanfare.some(
      (e) => e.op === "gate" && (e as any).condition === "super_evo_unlocked",
    );

  const superUnlockReady =
    isPlayersTurn && hasSuperUnlockGate && handleSuperEvoGate(owner);

  // Both Max PP gate (Gilnelise)
  const hasBothMaxPPGate =
    Array.isArray(card.fanfare) &&
    card.fanfare.some(
      (e) => e.op === "gate" && (e as any).condition === "both_max_pp",
    );
  const bothMaxPPReady =
    isPlayersTurn &&
    hasBothMaxPPGate &&
    state.players.first.maxPP >= 10 &&
    state.players.second.maxPP >= 10; // Default to 10 if not specified, but typically check op params if available. Here assuming Gilnelise standard 10.

  const superEvoReady = hasSuperEvoGate && hasSuperEvoAllyOnBoard(state, owner);

  // hard block
  if (card.cant_play) canAfford = false;

  if (!canAfford) return { glowClass: null };

  // --- Faith (crest) gate: Sham-Nacha glows when Faith >= 10 ---
  const crests =
    owner === "first" ? state.players.first.crests || [] : state.players.second.crests || [];
  const faith = (() => {
    const c = crests.find(
      (x: CardInstance) =>
        String(x?.name).toLowerCase() ===
        "faith: sham-nacha, heir to entwining",
    );
    return Number(c?.counters?.faith ?? 0);
  })();
  const isShamNacha =
    String(card?.name || "").toLowerCase() === "sham-nacha, heir to entwining";
  const faithReady = isPlayersTurn && isShamNacha && faith >= 10;

  if (
    enhanceReady ||
    comboReady ||
    earthReady ||
    overflowReady ||
    necromancyReady ||
    superEvoReady ||
    superUnlockReady ||
    fusedAllureReady ||
    fusedSlashReady ||
    faithReady ||
    skyboundReady ||
    bothMaxPPReady
  ) {
    return { glowClass: "enhance-ready" };
  }

  return { glowClass: "playable-glow" };
}














