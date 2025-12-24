// src/logic/mulligan.ts
// ─────────────────────────────────────────────────────────────────────────────
// BROWSER-ONLY: This module handles mulligan phase with DOM access.
// Core/replay code never imports this module.
// ─────────────────────────────────────────────────────────────────────────────
import { state } from "../core/gameState.js";
import { drawCard, shuffleInPlace } from "../core/utils.js";
import { logEvent } from "../core/logger.js";
import { doAction } from "../core/history.js";
import { Player } from "../core/types.js";
import { getHand, getDeck, isFirstPlayer, getDeckFile } from "../core/playerHelpers.js";

function ownerZones(owner: Player) {
  return {
    hand: getHand(state, owner),
    deck: getDeck(state, owner),
  };
}

export function beginMulligan() {
  // Skip mulligan entirely if testing deck is used by either side
  const firstDeckFile = getDeckFile(state, "first");
  const secondDeckFile = getDeckFile(state, "second");
  const usingTestDeck =
    (firstDeckFile && firstDeckFile.toLowerCase().includes("0_testing_")) ||
    (secondDeckFile && secondDeckFile.toLowerCase().includes("0_testing_"));

  if (usingTestDeck) {
    console.log("[MULLIGAN] Skipping mulligan for testing deck");
    startFirstTurn();
    return;
  }

  // Normal mulligan flow
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
  // Render removed - UI layer
  showMulliganUI();
}

// Debug/global fallback (browser only)
if (typeof window !== "undefined") {
  (window as any).confirmMulligan = confirmMulligan;
  (window as any).toggleMulliganPick = toggleMulliganPick;
}

function markSelectable(owner: Player) {
  const { hand } = ownerZones(owner);
  hand.forEach((c) => {
    (c as any).__mulliganSelectable = true;
    (c as any).__mulliganSelected = false;
  });
}

function clearSelectable(owner: Player) {
  const { hand } = ownerZones(owner);
  hand.forEach((c) => {
    delete (c as any).__mulliganSelectable;
    delete (c as any).__mulliganSelected;
  });
}

export function toggleMulliganPick(owner: Player, uid: string) {
  if (state.phase !== "mulligan") return;
  // Stage must match the owner slot directly
  if (state.mulliganStage !== owner) return;

  const { hand } = ownerZones(owner);
  const card = hand.find((c) => c.uid === uid);
  if (!card || !(card as any).__mulliganSelectable) return;

  const bag = isFirstPlayer(owner)
    ? state.mulliganFirstSelected
    : state.mulliganSecondSelected;
  if (!bag) return;

  if ((card as any).__mulliganSelected) {
    (card as any).__mulliganSelected = false;
    bag.delete(uid);
  } else {
    // Limit: up to 4
    if (bag.size >= 4) return;
    (card as any).__mulliganSelected = true;
    bag.add(uid);
  }
  // Render removed - UI layer
}

export function confirmMulligan(owner: Player) {
  return doAction(
    "Confirm Mulligan",
    () => {
      console.log("[MULLIGAN] confirm clicked", {
        owner,
        stage: state.mulliganStage,
      });
      if (state.phase !== "mulligan") return;
      // Stage must match the owner slot directly
      if (state.mulliganStage !== owner) return;

      const bag = isFirstPlayer(owner)
        ? state.mulliganFirstSelected
        : state.mulliganSecondSelected;
      if (!bag) return;
      const { hand, deck } = ownerZones(owner);

      if (bag.size > 0) {
        // Put selected back into deck
        const toPutBack = [];
        for (let i = hand.length - 1; i >= 0; i--) {
          const c = hand[i];
          if (c && bag.has(c.uid)) {
            toPutBack.push(hand.splice(i, 1)[0]!);
          }
        }
        // Return & shuffle
        deck.push(...toPutBack);
        shuffleInPlace(deck);
        // Draw replacements to 4
        while (hand.length < 4 && deck.length > 0) {
          drawCard(hand, deck, owner);
        }
      }

      logEvent("mulligan", { owner, kept: [...hand.map((c) => c.name)] });

      // Clean flags on this owner's hand
      clearSelectable(owner);
      bag.clear();

      // Next owner or start the game proper
      if (isFirstPlayer(owner)) {
        state.mulliganStage = "second";
        markSelectable("second");
        // Render removed - UI layer
        showMulliganUI();
      } else {
        // Both done → start first turn
        startFirstTurn();
      }
    },
    { owner, stage: "mulligan" },
    { autoRender: false },
  );
}

function startFirstTurn() {
  logEvent("startFirstTurn", { active: "first" });
  // First player draws 1 as the first turn draw
  const firstHand = getHand(state, "first");
  const firstDeck = getDeck(state, "first");
  drawCard(firstHand, firstDeck, "first");

  // Switch to main phase / normal turn rules
  state.phase = "main";
  state.activePlayer = "first";

  // Cleanup UI
  hideMulliganUI();

  // Render removed - UI layer
}

// ---- Simple UI helpers (browser only) ----
function showMulliganUI() {
  const firstBtn = document.getElementById(
    "blueMulliganConfirm",  // Keep DOM IDs for backward compatibility
  ) as HTMLButtonElement | null;
  const secondBtn = document.getElementById(
    "redMulliganConfirm",   // Keep DOM IDs for backward compatibility
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
