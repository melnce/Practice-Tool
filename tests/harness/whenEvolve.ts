/**
 * Real evolve-path helpers for tests — use instead of calling onEvolve() directly.
 * onEvolve() only applies flags, scripts, and bookkeeping; it does not apply +2/+2 or +3/+3 stat buffs.
 * The player's EVOLVE action goes through handleEvolveSelf(), which applies stats and then calls onEvolve().
 */
import { state } from "../../src/core/gameState.js";
import type { CardInstance, PlayerSlot } from "../../src/core/types/index.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { canEvolve } from "../../src/logic/evolveUtils.js";
import {
  getEvoCharges,
  setEvoCharges,
  getSuperEvoCharges,
  setSuperEvoCharges,
  setEvoUsedThisTurn,
  isFirstPlayer,
} from "../../src/core/playerHelpers.js";

type EvolveMode = "normal" | "super";

function ensureEvolveWindow(owner: PlayerSlot, mode: EvolveMode): void {
  const first = isFirstPlayer(owner);
  const minRound =
    mode === "super" ? (first ? 7 : 6) : first ? 5 : 4;
  if (state.roundCount < minRound) {
    state.roundCount = minRound;
  }
  setEvoUsedThisTurn(state, owner, false);
}

function grantEvolvePoint(owner: PlayerSlot, mode: EvolveMode): void {
  if (mode === "super") {
    if (getSuperEvoCharges(state, owner) < 1) {
      setSuperEvoCharges(state, owner, 1);
    }
  } else if (getEvoCharges(state, owner) < 1) {
    setEvoCharges(state, owner, 1);
  }
}

function assertEvolvedOutcome(
  card: CardInstance,
  preAtk: number,
  preDef: number,
  preBuffAtk: number,
  preBuffDef: number,
  mode: EvolveMode,
  label: string,
): CardInstance {
  const bonus = mode === "super" ? 3 : 2;
  if (!card.hasEvolved) {
    throw new Error(`${label}: expected hasEvolved after evolve`);
  }
  const atk = Number(card.attack);
  const def = Number(card.defense);
  const buffAtk = card.buffs?.attack ?? 0;
  const buffDef = card.buffs?.defense ?? 0;
  if (buffAtk < preBuffAtk + bonus) {
    throw new Error(
      `${label}: expected attack buff at least ${preBuffAtk + bonus}, got ${buffAtk}`,
    );
  }
  if (buffDef < preBuffDef + bonus) {
    throw new Error(
      `${label}: expected defense buff at least ${preBuffDef + bonus}, got ${buffDef}`,
    );
  }
  // Evolve scripts may raise or lower printed stats after the +2/+3 buff is applied.
  if (atk < preAtk + bonus && def < preDef + bonus) {
    throw new Error(
      `${label}: expected printed stats to reflect +${bonus}/+${bonus} (atk ${atk}, def ${def})`,
    );
  }
  return card;
}

/** Player EP evolve (+2/+2, Evolve: script, spend EP). */
export function whenEvolve(
  card: CardInstance,
  owner: PlayerSlot,
): CardInstance {
  ensureEvolveWindow(owner, "normal");
  grantEvolvePoint(owner, "normal");
  if (!canEvolve(owner, card, "normal")) {
    throw new Error(
      `whenEvolve: evolve is not legal for ${card.name} (${card.uid})`,
    );
  }
  const preAtk = Number(card.attack);
  const preDef = Number(card.defense);
  const preBuffAtk = card.buffs?.attack ?? 0;
  const preBuffDef = card.buffs?.defense ?? 0;
  handleEvolveSelf(card, owner, { mode: "normal", spendPoint: true });
  return assertEvolvedOutcome(
    card,
    preAtk,
    preDef,
    preBuffAtk,
    preBuffDef,
    "normal",
    "whenEvolve",
  );
}

/** Player SEP super-evolve (+3/+3, scripts, spend SEP). */
export function whenSuperEvolve(
  card: CardInstance,
  owner: PlayerSlot,
): CardInstance {
  ensureEvolveWindow(owner, "super");
  grantEvolvePoint(owner, "super");
  if (!canEvolve(owner, card, "super")) {
    throw new Error(
      `whenSuperEvolve: super-evolve is not legal for ${card.name} (${card.uid})`,
    );
  }
  const preAtk = Number(card.attack);
  const preDef = Number(card.defense);
  const preBuffAtk = card.buffs?.attack ?? 0;
  const preBuffDef = card.buffs?.defense ?? 0;
  handleEvolveSelf(card, owner, { mode: "super", spendPoint: true });
  return assertEvolvedOutcome(
    card,
    preAtk,
    preDef,
    preBuffAtk,
    preBuffDef,
    "super",
    "whenSuperEvolve",
  );
}

/** Effect-granted evolve (stats apply; card Evolve: line does not run unless evolve_trigger_always). */
export function whenEffectEvolve(
  card: CardInstance,
  owner: PlayerSlot,
  mode: EvolveMode = "normal",
): CardInstance {
  if (card.hasEvolved) {
    throw new Error(
      `whenEffectEvolve: ${card.name} (${card.uid}) is already evolved`,
    );
  }
  const preAtk = Number(card.attack);
  const preDef = Number(card.defense);
  const preBuffAtk = card.buffs?.attack ?? 0;
  const preBuffDef = card.buffs?.defense ?? 0;
  handleEvolveSelf(card, owner, { mode, spendPoint: false });
  return assertEvolvedOutcome(
    card,
    preAtk,
    preDef,
    preBuffAtk,
    preBuffDef,
    mode,
    "whenEffectEvolve",
  );
}
