// src/ui/helpers/glow.ts
import { isOverflow } from "../../helpers/overflow.js";
import { comboReadyInHand } from "../../helpers/combo.js";
import { hasNecromancy } from "../../helpers/necromancy.js";
import { handleSuperEvoGate } from "../../logic/effects/gates/gates.js";
import { resolvePlayCost } from "../../logic/core/playCard/cost.js";
import { getCachedCanPlay } from "./glowPreflightCache.js";
import type {
  CardInstance,
  GameState,
  Player,
  Effect,
} from "../../core/types/index.js";

export type HandGlowResult = {
  glowClass: "enhance-ready" | "playable-glow" | "alternate-ready" | null;
  /** Human-readable reason when the card cannot be played on the active player's turn. */
  blockedReason?: string;
};

// ---- local helpers ported from zones.js ----

function earthRiteCostInFanfare(effects: Effect[] | unknown): number {
  if (!Array.isArray(effects)) return 0;
  const scan = (effs: any[]): number => {
    let best = Infinity;
    for (const e of effs) {
      if (!e || typeof e !== "object") continue;
      if (e.op === "earth_rite") {
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
  const board =
    owner === "first" ? state.players.first.board : state.players.second.board;
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
  const board =
    owner === "first" ? state.players.first.board : state.players.second.board;
  return board.some(
    (c) => c?.type === "Follower" && c.hasEvolved && c.evoType === "super",
  );
}

/**
 * Compute which glow class to apply for a hand card.
 * Play legality uses the same `canPlayCard` preflight as the engine.
 */
export function computeHandGlow(card: CardInstance, ctx: any): HandGlowResult {
  const { state, owner, isPlayersTurn, availablePP } = ctx;

  if (!isPlayersTurn) {
    return { glowClass: null };
  }

  const plan = resolvePlayCost(card, availablePP);
  const payableCost = plan.cost;

  if (availablePP < payableCost) {
    return { glowClass: null, blockedReason: "Not enough PP." };
  }

  const preflight = getCachedCanPlay(card, owner);
  if (!preflight.ok) {
    return { glowClass: null, blockedReason: preflight.reason };
  }

  const tier = ctx.tier ?? null;

  const comboReady = comboReadyInHand(card, owner, state);
  const fusedAllureReady =
    card?.name === "Garden's Allure" && card?.isFused === true;
  const fusedSlashReady =
    card?.name === "Returning Slash" && card?.isFused === true;

  const erCost = earthRiteCostInFanfare(
    Array.isArray(card.fanfare) && card.fanfare.length
      ? card.fanfare
      : Array.isArray((card as any).spell)
        ? (card as any).spell
        : [],
  );
  const earthReady = erCost > 0 && hasEarthOnBoard(state, owner, erCost);

  const hasOverflowEffects =
    hasOverflowInTree(Array.isArray(card.fanfare) ? card.fanfare : []) ||
    hasOverflowInTree(
      Array.isArray((card as any).spell) ? (card as any).spell : [],
    );
  const overflowReady = hasOverflowEffects && isOverflow(owner);

  const hasNecroGate =
    Array.isArray(card.fanfare) &&
    card.fanfare.some(
      (eff) => eff.op === "gate" && (eff as any).condition === "necromancy",
    );
  const necromancyReady =
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
  if (hasSkybound) {
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

  const hasSuperEvoGate =
    (Array.isArray(card.fanfare) &&
      card.fanfare.some(
        (e) =>
          e.op === "gate" &&
          /super[_-]?evolved?[_-]?alli/i.test((e as any).condition || ""),
      )) ||
    /super[- ]?evolved allied follower/i.test(card?.description || "");

  const hasSuperUnlockGate =
    Array.isArray(card.fanfare) &&
    card.fanfare.some(
      (e) => e.op === "gate" && (e as any).condition === "super_evo_unlocked",
    );

  const superUnlockReady = hasSuperUnlockGate && handleSuperEvoGate(owner);

  const hasBothMaxPPGate =
    Array.isArray(card.fanfare) &&
    card.fanfare.some(
      (e) => e.op === "gate" && (e as any).condition === "both_max_pp",
    );
  const bothMaxPPReady =
    hasBothMaxPPGate &&
    state.players.first.maxPP >= 10 &&
    state.players.second.maxPP >= 10;

  const superEvoReady = hasSuperEvoGate && hasSuperEvoAllyOnBoard(state, owner);

  const crests =
    owner === "first"
      ? state.players.first.crests || []
      : state.players.second.crests || [];
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
  const faithReady = isShamNacha && faith >= 10;

  if (plan.mode === "accelerate" || plan.mode === "crystallize") {
    return { glowClass: "alternate-ready" };
  }

  const enhanceReady = plan.mode === "enhance" || !!tier;

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
