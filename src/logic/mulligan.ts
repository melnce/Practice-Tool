// src/logic/mulligan.ts
// ─────────────────────────────────────────────────────────────────────────────
// BROWSER-ONLY: This module handles mulligan phase with DOM access.
// Core/replay code never imports this module.
// ─────────────────────────────────────────────────────────────────────────────
import { state } from "../core/gameState.js";
import { logEvent } from "../core/logger.js";
import type { Player } from "../core/types/index.js";
import { getHand } from "../core/playerHelpers.js";
import { adapter } from "../core/adapter.js";
import {
  toggleMulliganPickCore,
  confirmMulliganCore,
  startFirstTurnCore,
  setMulliganUiHooks,
} from "./core/mulliganCore.js";
import { occurrenceOf } from "../core/script/identity.js";

function markSelectable(owner: Player) {
  getHand(state, owner).forEach((c) => {
    (c as any).__mulliganSelectable = true;
    (c as any).__mulliganSelected = false;
  });
}

function showMulliganUI() {
  const firstBtn = document.getElementById(
    "blueMulliganConfirm",
  ) as HTMLButtonElement | null;
  const secondBtn = document.getElementById(
    "redMulliganConfirm",
  ) as HTMLButtonElement | null;
  document.body.classList.add("mulligan-active");
  if (firstBtn) {
    firstBtn.style.display =
      state.mulliganStage === "first" ? "inline-block" : "none";
    firstBtn.disabled = false;
    firstBtn.onclick = () => confirmMulligan("first");
  }
  if (secondBtn) {
    secondBtn.style.display =
      state.mulliganStage === "second" ? "inline-block" : "none";
    secondBtn.disabled = false;
    secondBtn.onclick = () => confirmMulligan("second");
  }
}

function hideMulliganUI() {
  const firstBtn = document.getElementById("blueMulliganConfirm");
  const secondBtn = document.getElementById("redMulliganConfirm");
  if (firstBtn) firstBtn.style.display = "none";
  if (secondBtn) secondBtn.style.display = "none";
  document.body.classList.remove("mulligan-active");
}

setMulliganUiHooks({
  onAdvanceToSecond: () => showMulliganUI(),
  onStartFirstTurn: () => startFirstTurnCore({ hideUi: hideMulliganUI }),
  hideUi: hideMulliganUI,
});

function maybeRecordMulligan(
  owner: Player,
  step:
    | { op: "CONFIRM_MULLIGAN" }
    | { op: "TOGGLE_MULLIGAN"; card: { cardId: string; occ?: number } },
): void {
  void import("./script/runtime.js").then((rt) => {
    if (!rt.isScriptRecordingActive()) return;
    if (rt.getScriptedSide() !== owner) return;
    rt.recordScriptStep(step);
  });
}

export function beginMulligan(options?: { skipMulligan?: boolean }) {
  if (options?.skipMulligan) {
    startFirstTurnCore({ hideUi: hideMulliganUI });
    return;
  }

  logEvent("mulliganStart", {});
  state.phase = "mulligan";
  state.mulliganStage = "first";
  state.mulliganFirstSelected = new Set();
  state.mulliganSecondSelected = new Set();

  [...getHand(state, "first"), ...getHand(state, "second")].forEach((c) => {
    delete (c as any).__mulliganSelectable;
    delete (c as any).__mulliganSelected;
  });

  markSelectable("first");
  adapter.render();
  showMulliganUI();
}

if (typeof window !== "undefined") {
  (window as any).confirmMulligan = confirmMulligan;
  (window as any).toggleMulliganPick = toggleMulliganPick;
}

export function toggleMulliganPick(owner: Player, uid: string) {
  const hand = getHand(state, owner);
  const ref = occurrenceOf(hand, uid);
  toggleMulliganPickCore(owner, uid);
  if (ref) maybeRecordMulligan(owner, { op: "TOGGLE_MULLIGAN", card: ref });
}

export function confirmMulligan(owner: Player) {
  console.log("[MULLIGAN] confirm clicked", {
    owner,
    stage: state.mulliganStage,
  });
  const result = confirmMulliganCore(owner);
  maybeRecordMulligan(owner, { op: "CONFIRM_MULLIGAN" });
  return result;
}
