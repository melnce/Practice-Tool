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

type GateEffect = Effect & {
  op: "gate";
  condition?: string;
  cost?: number;
  requirement?: number | string;
  count?: number | string;
};

/** Scan an effect tree for the first gate matching `matches`. */
function findGateInEffects(
  effs: unknown,
  matches: (gate: GateEffect) => boolean,
): GateEffect | null {
  if (!Array.isArray(effs)) return null;
  for (const e of effs) {
    if (!e || typeof e !== "object") continue;
    if (e.op === "gate" && matches(e as GateEffect)) return e as GateEffect;
    if (Array.isArray(e.effects)) {
      const found = findGateInEffects(e.effects, matches);
      if (found) return found;
    }
    if (e.op === "mode" && Array.isArray(e.options)) {
      for (const opt of e.options) {
        const found = findGateInEffects(opt.effects || [], matches);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Find a gate on a card, scanning fanfare + spell with nesting. */
function findGateOnCard(
  card: CardInstance,
  matches: (gate: GateEffect) => boolean,
): GateEffect | null {
  const fanfare = Array.isArray(card.fanfare) ? card.fanfare : [];
  const spell = Array.isArray((card as any).spell) ? (card as any).spell : [];
  return (
    findGateInEffects(fanfare, matches) || findGateInEffects(spell, matches)
  );
}

function hasOverflowMarkersInTree(effs: unknown): boolean {
  if (!Array.isArray(effs)) return false;
  for (const e of effs) {
    if (!e || typeof e !== "object") continue;
    if (e.amount_overflow !== undefined || e.overflow_amount !== undefined)
      return true;
    if (Array.isArray(e.effects) && hasOverflowMarkersInTree(e.effects))
      return true;
    if (e.op === "mode" && Array.isArray(e.options)) {
      if (
        e.options.some((opt: any) =>
          hasOverflowMarkersInTree(opt.effects || []),
        )
      )
        return true;
    }
  }
  return false;
}

function cardHasOverflowEffects(card: CardInstance): boolean {
  return (
    findGateOnCard(card, (g) => g.condition === "overflow") !== null ||
    hasOverflowMarkersInTree(card.fanfare) ||
    hasOverflowMarkersInTree(
      Array.isArray((card as any).spell) ? (card as any).spell : [],
    )
  );
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

  const hasOverflowEffects = cardHasOverflowEffects(card);
  const overflowReady = hasOverflowEffects && isOverflow(owner);

  const necroGate = findGateOnCard(card, (g) => g.condition === "necromancy");
  const necromancyReady =
    necroGate !== null && hasNecromancy(owner, necroGate.cost || 0);

  const skyboundGate = findGateOnCard(
    card,
    (g) => g.condition === "skybound_art",
  );
  let skyboundReady = false;
  if (skyboundGate) {
    const req = parseInt(
      String(skyboundGate.requirement || skyboundGate.count || 10),
      10,
    );
    const gauge =
      (state.roundCount || 1) + (card.skyboundArtEvolvesWitnessed || 0);
    skyboundReady = gauge >= req;
  }

  const hasSuperEvoGate =
    findGateOnCard(card, (g) =>
      /super[_-]?evolved?[_-]?alli/i.test(g.condition || ""),
    ) !== null ||
    /super[- ]?evolved allied follower/i.test(card?.description || "");

  const hasSuperUnlockGate =
    findGateOnCard(card, (g) => g.condition === "super_evo_unlocked") !== null;

  const superUnlockReady = hasSuperUnlockGate && handleSuperEvoGate(owner);

  const hasBothMaxPPGate =
    findGateOnCard(card, (g) => g.condition === "both_max_pp") !== null;
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
