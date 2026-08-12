// src/logic/evolveUtils.ts
import { runEffects } from "./core/effects/index.js";
import { incrementSkyboundArt } from "./effects/skybound.js";
import { state } from "../core/gameState.js";
import { fireTrigger } from "./core/triggers.js";
import { logEvent } from "../core/logger.js";
import type { CardInstance, Player, Effect } from "../core/types/index.js";
import {
  isFirstPlayer,
  getEvoCharges,
  setEvoCharges,
  getSuperEvoCharges,
  setSuperEvoCharges,
  getEvoUsedThisTurn,
  setEvoUsedThisTurn,
  getEvoCount,
  incrementEvoCount,
} from "../core/playerHelpers.js";

/**
 * Bookkeeping for every completed allied evolve (EP-spent or effect-granted,
 * with or without an Evolve: script). Bible: Skybound gauge counts "allied
 * followers that evolved" while the card was in hand — not whether a script ran.
 * Couples evoCount + Skybound so they cannot drift apart.
 */
function recordAlliedEvolve(owner: Player) {
  incrementEvoCount(state, owner);
  incrementSkyboundArt(owner);
  logEvent("evolveCount", {
    owner,
    count: getEvoCount(state, owner),
  });
}

function collectEvolveEffects(obj: unknown): Effect[] {
  if (Array.isArray(obj)) return [...obj];
  if (
    obj &&
    typeof obj === "object" &&
    Array.isArray((obj as { effects?: Effect[] }).effects)
  ) {
    return [...(obj as { effects: Effect[] }).effects];
  }
  return [];
}

/** Card text "Super-Evolve: … instead" replaces the Evolve line (owner + §747 exception). */
function superEvolveReplacesEvolveLine(card: CardInstance): boolean {
  if (card.superEvolveReplaces === true) return true;
  return /super-evolve:[^\n]*\binstead\b/i.test(String(card.description ?? ""));
}

/** Resolve effect lists for normal vs super evolve (exported for audit tests). */
export function resolveEvolveEffects(
  card: CardInstance,
  mode: "normal" | "super",
): Effect[] {
  const normalFx = collectEvolveEffects(card.evolve);
  if (mode === "normal") return normalFx;

  const superFx = collectEvolveEffects(card.superevolve);
  if (superEvolveReplacesEvolveLine(card) || normalFx.length === 0) {
    return superFx;
  }
  // Rulebook §747: both Evolve and Super-Evolve fire on super-evolve
  return [...normalFx, ...superFx];
}

/**
 * Subset of evolve[] / superevolve[] that may run for this evolve invocation.
 * - Player EP evolve (spendPoint): full script ("Evolve:" + "When this evolves" entries).
 * - Effect evolve: only "When this follower evolves" — card-level evolve_trigger_always,
 *   or per-effect on_any_evolve (reserved; none in data yet).
 */
export function resolveEvolveScriptToRun(
  card: CardInstance,
  mode: "normal" | "super",
  spendPoint: boolean,
): Effect[] {
  const all = resolveEvolveEffects(card, mode);
  if (spendPoint) return all;
  if (card.evolve_trigger_always === true) return all;
  return all.filter((e) => (e as any).on_any_evolve === true);
}

// Note: Rendering removed from logic layer - UI orchestrator handles all rendering

export function canEvolve(
  owner: Player,
  card: CardInstance,
  mode: "normal" | "super" = "normal",
) {
  if (!card || card.type !== "Follower") return false;
  if (card.hasEvolved) return false;

  const first = isFirstPlayer(owner);

  // Unlock rounds (second player earlier than first)
  const normalUnlocked = first ? state.roundCount >= 5 : state.roundCount >= 4;
  const superUnlocked = first ? state.roundCount >= 7 : state.roundCount >= 6;

  // Per-turn limit
  const usedThisTurn = getEvoUsedThisTurn(state, owner);

  if (mode === "super") {
    const charges = getSuperEvoCharges(state, owner);
    return superUnlocked && !usedThisTurn && charges > 0;
  } else {
    const charges = getEvoCharges(state, owner);
    return normalUnlocked && !usedThisTurn && charges > 0;
  }
}

export function onEvolve(
  card: CardInstance,
  owner: Player,
  mode: "normal" | "super",
  { spendPoint = true, skipEffects = false } = {},
) {
  if (!card) return;

  // Update evolution state FIRST (before running effects)
  card.hasEvolved = true;
  card.evoType = mode === "super" ? "super" : "normal";

  const spendCounters = () => {
    if (!spendPoint) return;
    if (mode === "super") {
      // Only decrement super evolution charges for super evolves
      setSuperEvoCharges(
        state,
        owner,
        Math.max(0, getSuperEvoCharges(state, owner) - 1),
      );
      setEvoUsedThisTurn(state, owner, true);
    } else {
      // Only decrement normal evolution charges for normal evolves
      setEvoCharges(state, owner, Math.max(0, getEvoCharges(state, owner) - 1));
      setEvoUsedThisTurn(state, owner, true);
    }
  };

  const fireEvoTriggers = () => {
    // Ally evolve fires for both normal and super (EP-spent or effect-granted).
    fireTrigger("ally_evolve", owner, { enteringCard: card });
    if (mode === "super") {
      // Ally listeners: cards on the super-evolver's side.
      fireTrigger("ally_super_evolve", owner, { enteringCard: card });
      // Enemy listeners: cards on the opponent's side (hand/board/deck).
      // activePlayer must be the super-evolver so process/zones route to owner !== evolver.
      fireTrigger("enemy_super_evolve", owner, { enteringCard: card });
    }
  };

  if (skipEffects) {
    // Just spend counters & trigger, no card effects
    recordAlliedEvolve(owner);
    spendCounters();
    fireEvoTriggers();
    logEvent("evolve", {
      owner,
      card: card.name,
      uid: card.uid,
      mode,
      via: "skipEffects",
    });
    return;
  }

  const effectsToRun = resolveEvolveScriptToRun(card, mode, spendPoint);

  // Even with no evolve effects defined, we still spend counters & fire triggers once.
  if (effectsToRun.length === 0) {
    recordAlliedEvolve(owner);
    spendCounters();
    fireEvoTriggers();
    logEvent("evolve", {
      owner,
      card: card.name,
      uid: card.uid,
      mode,
      via: "noEffects",
    });
    return;
  }

  runEffects(effectsToRun, owner, card);

  recordAlliedEvolve(owner);
  spendCounters();
  fireEvoTriggers();
  logEvent("evolve", {
    owner,
    card: card.name,
    uid: card.uid,
    mode,
    via: "withEffects",
  });
}
