// src/logic/effects/ops/fuse/fuse.artifact.ts
import { state } from "../../../../core/gameState.js";
import { adapter } from "../../../../core/adapter.js";
import {
  highlightSelectable,
  clearSelectableFlags,
} from "../../../core/targeting.js";
import { fireTrigger } from "../../../core/triggers.js";
import { getCardDetails } from "../../../../data/cardDatabase.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";

import { logEvent } from "../../../../core/logger.js";
import type { Player, CardInstance } from "../../../../core/types/index.js";
import type { FuseOp } from "./types.js";

import { alreadyFusedThisTurn, handOf } from "./types.js";
import { moveToBanishZone } from "../banish/primitives.js";

const OMINOUS_BETA = "Ominous Artifact β";
const OMINOUS_GAMMA = "Ominous Artifact γ";

function ensureFusedArtifacts(initiator: CardInstance) {
  if (!initiator.fusedArtifacts) {
    initiator.fusedArtifacts = { beta: false, gamma: false };
  }
  return initiator.fusedArtifacts;
}

function alphaNeedsBeta(initiator: CardInstance): boolean {
  return !ensureFusedArtifacts(initiator).beta;
}

function alphaNeedsGamma(initiator: CardInstance): boolean {
  return !ensureFusedArtifacts(initiator).gamma;
}

function alphaPartnerPool(
  hand: CardInstance[],
  initiator: CardInstance,
): CardInstance[] {
  const needsBeta = alphaNeedsBeta(initiator);
  const needsGamma = alphaNeedsGamma(initiator);
  return hand.filter(
    (c) =>
      c.uid !== initiator.uid &&
      ((c.name === OMINOUS_BETA && needsBeta) ||
        (c.name === OMINOUS_GAMMA && needsGamma)),
  );
}

// ---------- starters ----------
export function startGearMultiSelect(owner: Player, initiator: CardInstance) {
  const hand = handOf(owner);
  const pool = hand.filter(
    (c) =>
      c.uid !== initiator.uid &&
      (c?.name === "Gear of Ambition" || c?.name === "Gear of Remembrance"),
  );
  if (!pool.length) return;

  const resultName =
    initiator.name === "Gear of Ambition"
      ? "Striker Artifact"
      : "Fortifier Artifact";

  logEvent("fuseOpen", {
    owner,
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    pool: pool.length,
    finalize: "fuse:gear_multi",
  });

  setPendingTarget({
    eff: {
      op: "fuse",
      action: "finalize",
      type: "gear_multi",
      initiator_uid: initiator.uid,
      result_name: resultName,
    } as FuseOp,
    owner,
    sourceCard: initiator,
    pool,
    selectCount: pool.length,
    targets: [],
    resumeEffects: [],
    requiresConfirmation: true,
    confirmationText: "Fuse Selected Gears",
  });

  highlightSelectable(pool);
  adapter.render();
  return "pending";
}

// Start fuse for Striker/Fortifier Artifact: "Fuse: Artifact cards"
export function startFortifierFuse(owner: Player, initiator: CardInstance) {
  const hand = handOf(owner);
  // pool = all *other* Artifact cards in hand
  const pool = hand.filter(
    (c) =>
      c?.uid !== initiator?.uid &&
      Array.isArray(c?.tribes) &&
      c.tribes.some((t) => String(t).toLowerCase() === "artifact"),
  );
  if (!pool.length) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  logEvent("fuseOpen", {
    owner,
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    pool: pool.length,
    finalize: "fuse:fortifier",
  });

  setPendingTarget({
    eff: {
      op: "fuse",
      action: "finalize",
      type: "fortifier",
      initiator_uid: initiator.uid,
    } as FuseOp,
    owner,
    sourceCard: initiator,
    pool,
    selectCount: pool.length, // select any number; confirm to finalize
    targets: [],
    resumeEffects: [],
    requiresConfirmation: true,
    confirmationText: "Fuse Selected Artifacts",
  });

  highlightSelectable(pool);
  adapter.render();
  return "pending";
}

export function startAlphaSelect(owner: Player, initiator: CardInstance) {
  const hand = handOf(owner);
  const pool = alphaPartnerPool(hand, initiator);
  if (!pool.length) return;

  logEvent("fuseOpen", {
    owner,
    initiator: initiator.name,
    initiatorUid: initiator.uid,
    pool: pool.length,
    finalize: "fuse:alpha",
  });

  setPendingTarget({
    eff: {
      op: "fuse",
      action: "finalize",
      type: "alpha",
      initiator_uid: initiator.uid,
    } as FuseOp,
    owner,
    sourceCard: initiator,
    pool,
    selectCount: Math.min(2, pool.length),
    targets: [],
    resumeEffects: [],
    requiresConfirmation: true,
    confirmationText: "Fuse Selected (β + γ → Ω)",
  });

  highlightSelectable(pool);
  adapter.render();
  return "pending";
}

// ---------- finalizers (export with op-string names) ----------
export function fuse_finalize_gear_multi(
  owner: Player,
  initiatorUid: string,
  partners: CardInstance[],
  resultName: string,
) {
  const hand = handOf(owner);
  const iIdx = hand.findIndex((c) => c?.uid === initiatorUid);
  if (iIdx === -1) {
    return;
  }

  const initiator = hand[iIdx];
  if (!initiator) {
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    return;
  }

  const tmpl = getCardDetails(resultName);
  if (!tmpl) {
    return;
  }

  const result = structuredClone(tmpl);
  result.uid = state.rng.makeUid();

  hand[iIdx] = result;

  for (const p of partners || []) {
    const idx = hand.findIndex((c) => c?.uid === p.uid);
    if (idx !== -1) {
      const [used] = hand.splice(idx, 1);
      if (used) moveToBanishZone(used, owner);
    }
  }

  state.lastFuse = {
    owner,
    initiator_name: initiator?.name,
    partners_count: partners?.length || 0,
    result_name: resultName,
    targets: "merge",
  };

  fireTrigger("on_fuse", owner, {
    initiator,
    partners,
    result: { result_card_name: resultName },
  });

  logEvent("fuseFinalize", {
    owner,
    kind: "artifact",
    initiator: initiator?.name,
    initiatorUid: initiator?.uid,
    partners: (partners || []).map((p) => p.name),
    partnerUids: (partners || []).map((p) => p.uid),
    result: resultName,
  });
}

export function fuse_finalize_fortifier(
  owner: Player,
  initiatorUid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);
  const iIdx = hand.findIndex((c) => c?.uid === initiatorUid);
  if (iIdx === -1) {
    return;
  }

  const initiator = hand[iIdx];
  if (!initiator) {
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    return;
  }

  const sumCost = (partners || []).reduce((acc: number, p: CardInstance) => {
    const eff = Number.isFinite(p?.effectiveCost)
      ? p.effectiveCost!
      : (Number(p?.cost) || 0) + (Number(p?.cost_mod) || 0);
    return acc + eff;
  }, 0);

  const resultName =
    sumCost === 1
      ? "Ominous Artifact α"
      : sumCost === 2
        ? "Ominous Artifact β"
        : "Ominous Artifact γ";

  const tmpl = getCardDetails(resultName);
  if (!tmpl) {
    return;
  }

  const newCard = structuredClone(tmpl);
  newCard.uid = state.rng.makeUid();

  hand[iIdx] = newCard;
  for (const p of partners || []) {
    const idx = hand.findIndex((c) => c?.uid === p.uid);
    if (idx !== -1) {
      const [used] = hand.splice(idx, 1);
      if (used) moveToBanishZone(used, owner);
    }
  }

  state.lastFuse = {
    owner,
    initiator_name: initiator.name,
    totalCost: sumCost,
    result_name: resultName,
  };
  fireTrigger("on_fuse", owner, {
    initiator,
    partners,
    result: { result_card_name: resultName },
  });

  logEvent("fuseFinalize", {
    owner,
    kind: "artifact",
    initiator: initiator?.name,
    initiatorUid: initiator?.uid,
    partners: (partners || []).map((p) => p.name),
    partnerUids: (partners || []).map((p) => p.uid),
    result: resultName,
  });
}

export function fuse_finalize_alpha(
  owner: Player,
  initiatorUid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);
  const iIdx = hand.findIndex((c) => c?.uid === initiatorUid);
  if (iIdx === -1) {
    return;
  }

  const initiator = hand[iIdx];
  if (!initiator) {
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    return;
  }

  const idxOf = (uid: string) => hand.findIndex((c) => c?.uid === uid);
  const fused = ensureFusedArtifacts(initiator);

  for (const p of partners || []) {
    if (p?.name === OMINOUS_BETA) fused.beta = true;
    if (p?.name === OMINOUS_GAMMA) fused.gamma = true;
  }

  const partnerIdxsDesc = (partners || [])
    .map((p) => idxOf(p?.uid))
    .filter((ix) => ix !== -1 && ix !== iIdx)
    .sort((a, b) => b - a);

  for (const ix of partnerIdxsDesc) {
    const [used] = hand.splice(ix, 1);
    if (used) moveToBanishZone(used, owner);
  }

  const bothFused = fused.beta && fused.gamma;
  const resultName = bothFused ? "Masterwork Artifact Ω" : "wasted";

  if (bothFused) {
    const tmpl = getCardDetails("Masterwork Artifact Ω");
    if (!tmpl) {
      return;
    }
    const omega = structuredClone(tmpl);
    omega.uid = state.rng.makeUid();
    hand[iIdx] = omega;
  }

  state.lastFuse = {
    owner,
    initiator_name: "Ominous Artifact α",
    partners_count: (partners || []).length,
    partner_name: partners?.length === 1 ? partners[0]?.name : undefined,
    result_name: resultName,
    ...(bothFused ? { targets: "merge" as const } : {}),
  };

  fireTrigger("on_fuse", owner, {
    initiator,
    partners,
    result: { result_card_name: resultName },
  });

  const host = hand[iIdx];
  if (host?.name === "Ominous Artifact α") {
    host.lastFuseRound = state.roundCount;
    host.fusedArtifacts = fused;
  }

  logEvent("fuseFinalize", {
    owner,
    kind: "artifact_alpha",
    initiator: "Ominous Artifact α",
    initiatorUid: initiator?.uid,
    partners: (partners || []).map((p) => p.name),
    partnerUids: (partners || []).map((p) => p.uid),
    result: resultName,
  });
}
