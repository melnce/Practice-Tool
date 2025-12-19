// src/logic/mulligan.ts
// ─────────────────────────────────────────────────────────────────────────────
// BROWSER-ONLY: This module handles mulligan phase with DOM access.
// Core/replay code never imports this module.
// ─────────────────────────────────────────────────────────────────────────────
import { state } from "../core/gameState.js";
import { adapter } from "../core/adapter.js";
import { drawCard, shuffleInPlace } from "../core/utils.js";
import { logEvent } from "../core/logger.js";
import { doAction } from "../core/history.js";
import { Player, CardInstance } from "../core/types.js";

function ownerZones(owner: Player) {
    return {
        hand: owner === "blue" ? state.blueHand : state.redHand,
        deck: owner === "blue" ? state.blueDeck : state.redDeck,
    };
}

export function beginMulligan() {
    // Skip mulligan entirely if testing deck is used by either side
    const usingTestDeck =
        state.blueDeckFile === "0_testing_deck.json" ||
        state.redDeckFile === "0_testing_deck.json";

    if (usingTestDeck) {
        console.log("[MULLIGAN] Skipping mulligan for testing deck");
        startFirstTurn();
        return;
    }

    // Normal mulligan flow
    logEvent("mulliganStart", {});
    state.phase = "mulligan";
    state.mulliganStage = "blue";
    state.mulliganBlueSelected = new Set();
    state.mulliganRedSelected = new Set();

    [...state.blueHand, ...state.redHand].forEach(c => {
        delete (c as any).__mulliganSelectable;
        delete (c as any).__mulliganSelected;
    });

    markSelectable("blue");
    adapter.render();
    showMulliganUI();
}

// Debug/global fallback (browser only)
if (typeof window !== "undefined") {
    (window as any).confirmMulligan = confirmMulligan;
    (window as any).toggleMulliganPick = toggleMulliganPick;
}

function markSelectable(owner: Player) {
    const { hand } = ownerZones(owner);
    hand.forEach(c => { (c as any).__mulliganSelectable = true; (c as any).__mulliganSelected = false; });
}

function clearSelectable(owner: Player) {
    const { hand } = ownerZones(owner);
    hand.forEach(c => { delete (c as any).__mulliganSelectable; delete (c as any).__mulliganSelected; });
}




function chooseMulliganUids(owner: Player) {
    const { hand } = ownerZones(owner);
    // Simple curve heuristic:
    // - Blue (going first): replace cost > 2
    // - Red  (going second): replace cost > 3
    const cutoff = (owner === "blue") ? 2 : 3;
    const picks: string[] = [];
    for (const c of hand) {
        const cost = Number((c as any)?.cost) || 0;
        if (cost > cutoff) picks.push(c.uid);
        if (picks.length >= 4) break; // obey selection cap
    }
    // If nothing selected and hand is clunky (e.g., all 3s on blue), pick the highest cost one.
    if (picks.length === 0) {
        const sorted = [...hand].sort((a, b) => (Number((b as any).cost || 0) - Number((a as any).cost || 0)));
        const first = sorted[0];
        if (first) picks.push(first.uid);
    }
    return picks;
}

function queueAutoMulligan(owner: Player) {
    // Small delay to allow initial render; avoids racing the DOM.
    setTimeout(() => {
        if (state.phase !== "mulligan" || state.mulliganStage !== owner) return;
        const bag = owner === "blue" ? state.mulliganBlueSelected : state.mulliganRedSelected;
        const { hand } = ownerZones(owner);
        const want = new Set(chooseMulliganUids(owner));
        hand.forEach(c => {
            if (!c || !(c as any).__mulliganSelectable) return;
            (c as any).__mulliganSelected = want.has(c.uid);
            if ((c as any).__mulliganSelected) bag.add(c.uid);
            else bag.delete(c.uid);
        });
        adapter.render();
        // Confirm immediately
        try { confirmMulligan(owner); } catch { void 0; }
    }, 100);
}

export function toggleMulliganPick(owner: Player, uid: string) {
    if (state.phase !== "mulligan") return;
    if (state.mulliganStage !== owner) return;

    const { hand } = ownerZones(owner);
    const card = hand.find(c => c.uid === uid);
    if (!card || !(card as any).__mulliganSelectable) return;

    const bag = owner === "blue" ? state.mulliganBlueSelected : state.mulliganRedSelected;

    if ((card as any).__mulliganSelected) {
        (card as any).__mulliganSelected = false;
        bag.delete(uid);
    } else {
        // Limit: up to 4
        if (bag.size >= 4) return;
        (card as any).__mulliganSelected = true;
        bag.add(uid);
    }
    adapter.render();
}

export function confirmMulligan(owner: Player) {
    return doAction(
        "Confirm Mulligan",
        () => {
            console.log("[MULLIGAN] confirm clicked", { owner, stage: state.mulliganStage });
            if (state.phase !== "mulligan") return;
            if (state.mulliganStage !== owner) return;

            const bag = owner === "blue" ? state.mulliganBlueSelected : state.mulliganRedSelected; // fix typo
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

            logEvent("mulligan", { owner, kept: [...hand.map(c => c.name)] });

            // Clean flags on this owner’s hand
            clearSelectable(owner);
            bag.clear();

            // Next owner or start the game proper
            if (owner === "blue") {
                state.mulliganStage = "red";
                markSelectable("red");
                adapter.render();
                showMulliganUI();

            } else {
                // Both done → start first turn
                startFirstTurn();
            }
        },
        { owner, stage: "mulligan" },
        { autoRender: false }
    );
}

function startFirstTurn() {
    logEvent("startFirstTurn", { active: "blue" });
    // Blue draws 1 as the first turn draw
    const blueHand = state.blueHand;
    const blueDeck = state.blueDeck;
    drawCard(blueHand, blueDeck, "blue");

    // Switch to main phase / normal turn rules
    state.phase = "main";
    state.activePlayer = "blue";
    state.isBlueTurn = true;

    // Cleanup UI
    hideMulliganUI();

    adapter.render();
}

// ---- Simple UI helpers (browser only) ----
function showMulliganUI() {
    const blueBtn = document.getElementById("blueMulliganConfirm") as HTMLButtonElement | null;
    const redBtn = document.getElementById("redMulliganConfirm") as HTMLButtonElement | null;
    document.body.classList.add("mulligan-active");
    if (blueBtn) {
        blueBtn.style.display = (state.mulliganStage === "blue") ? "inline-block" : "none";
        blueBtn.disabled = false;
        blueBtn.onclick = () => confirmMulligan("blue");
    }
    if (redBtn) {
        redBtn.style.display = (state.mulliganStage === "red") ? "inline-block" : "none";
        redBtn.disabled = false;
        redBtn.onclick = () => confirmMulligan("red");
    }
}

function hideMulliganUI() {
    const blueBtn = document.getElementById("blueMulliganConfirm");
    const redBtn = document.getElementById("redMulliganConfirm");
    if (blueBtn) blueBtn.style.display = "none";
    if (redBtn) redBtn.style.display = "none";
    document.body.classList.remove("mulligan-active");
}
