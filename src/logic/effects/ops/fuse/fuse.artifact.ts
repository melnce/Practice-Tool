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
  const pool = hand.filter(
    (c) =>
      c.uid !== initiator.uid &&
      (c.name === "Ominous Artifact β" || c.name === "Ominous Artifact γ"),
  );
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
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  const initiator = hand[iIdx];
  if (!initiator) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  const tmpl = getCardDetails(resultName);
  if (!tmpl) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  const result = structuredClone(tmpl);
  result.uid = state.rng.makeUid();

  hand[iIdx] = result;

  for (const p of partners || []) {
    const idx = hand.findIndex((c) => c?.uid === p.uid);
    if (idx !== -1) hand.splice(idx, 1);
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
    partners: (partners || []).map((p) => p.name),
    result: resultName,
  });

  clearSelectableFlags();
  // Render removed - UI layer
}

export function fuse_finalize_fortifier(
  owner: Player,
  initiatorUid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);
  const iIdx = hand.findIndex((c) => c?.uid === initiatorUid);
  if (iIdx === -1) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  const initiator = hand[iIdx];
  if (!initiator) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    clearSelectableFlags();
    // Render removed - UI layer
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
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  const newCard = structuredClone(tmpl);
  newCard.uid = state.rng.makeUid();

  hand[iIdx] = newCard;
  for (const p of partners || []) {
    const idx = hand.findIndex((c) => c?.uid === p.uid);
    if (idx !== -1) hand.splice(idx, 1);
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
    partners: (partners || []).map((p) => p.name),
    result: resultName,
  });

  clearSelectableFlags();
  // Render removed - UI layer
}

export function fuse_finalize_alpha(
  owner: Player,
  initiatorUid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);
  const iIdx = hand.findIndex((c) => c?.uid === initiatorUid);
  if (iIdx === -1) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  const initiator = hand[iIdx];
  if (!initiator) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  const names = (partners || []).map((p) => p?.name);
  const hasBeta = names.includes("Ominous Artifact β");
  const hasGamma = names.includes("Ominous Artifact γ");

  const idxOf = (uid: string) => hand.findIndex((c) => c?.uid === uid);

  if (hasBeta && hasGamma) {
    const tmpl = getCardDetails("Masterwork Artifact Ω");
    if (!tmpl) {
      clearSelectableFlags();
      // Render removed - UI layer
      return;
    }
    const omega = structuredClone(tmpl);
    omega.uid = state.rng.makeUid();

    hand[iIdx] = omega;

    const partnerIdxsDesc = (partners || [])
      .map((p) => idxOf(p?.uid))
      .filter((ix) => ix !== -1 && ix !== iIdx)
      .sort((a, b) => b - a);

    for (const ix of partnerIdxsDesc) hand.splice(ix, 1);

    state.lastFuse = {
      owner,
      initiator_name: "Ominous Artifact α",
      partners_count: partners.length,
      result_name: "Masterwork Artifact Ω",
      targets: "merge",
    };
  } else if ((partners || []).length === 1) {
    const partner0 = partners[0];
    if (!partner0) {
      clearSelectableFlags();
      // Render removed - UI layer
      return;
    }
    const pIdx = idxOf(partner0.uid);
    if (pIdx !== -1) hand.splice(pIdx, 1);
    state.lastFuse = {
      owner,
      initiator_name: "Ominous Artifact α",
      partner_name: partners[0]?.name,
      result_name: "wasted",
    };

    logEvent("fuseFinalize", {
      owner,
      kind: "artifact_alpha",
      initiator: "Ominous Artifact α",
      partners: (partners || []).map((p) => p.name),
      result: "wasted",
    });
  }

  fireTrigger("on_fuse", owner, {
    initiator,
    partners,
    result: {
      result_card_name:
        hasBeta && hasGamma ? "Masterwork Artifact Ω" : "wasted",
    },
  });

  if (hand[iIdx]?.name === "Ominous Artifact α") {
    hand[iIdx].lastFuseRound = state.roundCount;
  }

  if (hasBeta && hasGamma) {
    logEvent("fuseFinalize", {
      owner,
      kind: "artifact_alpha",
      initiator: "Ominous Artifact α",
      partners: (partners || []).map((p) => p.name),
      result: "Masterwork Artifact Ω",
    });
  }

  clearSelectableFlags();
  // Render removed - UI layer
}















