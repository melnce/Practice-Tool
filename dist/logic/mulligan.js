// src/logic/mulligan.ts
import { state } from "@core/gameState.js";
// @ts-ignore
import { render } from "@ui/render.js";
import { drawCard, shuffleInPlace } from "@core/utils.js";
import { logEvent } from "@core/logger.js";
import { doAction } from "@core/history.js";
function ownerZones(owner) {
    return {
        hand: owner === "blue" ? state.blueHand : state.redHand,
        deck: owner === "blue" ? state.blueDeck : state.redDeck,
    };
}
export function beginMulligan() {
    // Skip mulligan entirely if testing deck is used by either side
    const usingTestDeck = state.blueDeckFile === "0_testing_deck.json" ||
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
        delete c.__mulliganSelectable;
        delete c.__mulliganSelected;
    });
    markSelectable("blue");
    render();
    showMulliganUI();
}
// Debug/global fallback so you can call from console if buttons don't fire:
window.confirmMulligan = confirmMulligan;
window.toggleMulliganPick = toggleMulliganPick;
function markSelectable(owner) {
    const { hand } = ownerZones(owner);
    hand.forEach(c => { c.__mulliganSelectable = true; c.__mulliganSelected = false; });
}
function clearSelectable(owner) {
    const { hand } = ownerZones(owner);
    hand.forEach(c => { delete c.__mulliganSelectable; delete c.__mulliganSelected; });
}
function chooseMulliganUids(owner) {
    const { hand } = ownerZones(owner);
    // Simple curve heuristic:
    // - Blue (going first): replace cost > 2
    // - Red  (going second): replace cost > 3
    const cutoff = (owner === "blue") ? 2 : 3;
    const picks = [];
    for (const c of hand) {
        const cost = Number(c?.cost) || 0;
        if (cost > cutoff)
            picks.push(c.uid);
        if (picks.length >= 4)
            break; // obey selection cap
    }
    // If nothing selected and hand is clunky (e.g., all 3s on blue), pick the highest cost one.
    if (picks.length === 0) {
        const sorted = [...hand].sort((a, b) => (Number(b.cost || 0) - Number(a.cost || 0)));
        if (sorted.length)
            picks.push(sorted[0].uid);
    }
    return picks;
}
function queueAutoMulligan(owner) {
    // Small delay to allow initial render; avoids racing the DOM.
    setTimeout(() => {
        if (state.phase !== "mulligan" || state.mulliganStage !== owner)
            return;
        const bag = owner === "blue" ? state.mulliganBlueSelected : state.mulliganRedSelected;
        const { hand } = ownerZones(owner);
        const want = new Set(chooseMulliganUids(owner));
        hand.forEach(c => {
            if (!c || !c.__mulliganSelectable)
                return;
            c.__mulliganSelected = want.has(c.uid);
            if (c.__mulliganSelected)
                bag.add(c.uid);
            else
                bag.delete(c.uid);
        });
        render();
        // Confirm immediately
        try {
            confirmMulligan(owner);
        }
        catch { }
    }, 100);
}
export function toggleMulliganPick(owner, uid) {
    if (state.phase !== "mulligan")
        return;
    if (state.mulliganStage !== owner)
        return;
    const { hand } = ownerZones(owner);
    const card = hand.find(c => c.uid === uid);
    if (!card || !card.__mulliganSelectable)
        return;
    const bag = owner === "blue" ? state.mulliganBlueSelected : state.mulliganRedSelected;
    if (card.__mulliganSelected) {
        card.__mulliganSelected = false;
        bag.delete(uid);
    }
    else {
        // Limit: up to 4
        if (bag.size >= 4)
            return;
        card.__mulliganSelected = true;
        bag.add(uid);
    }
    render();
}
export function confirmMulligan(owner) {
    return doAction("Confirm Mulligan", () => {
        console.log("[MULLIGAN] confirm clicked", { owner, stage: state.mulliganStage });
        if (state.phase !== "mulligan")
            return;
        if (state.mulliganStage !== owner)
            return;
        const bag = owner === "blue" ? state.mulliganBlueSelected : state.mulliganRedSelected; // fix typo
        const { hand, deck } = ownerZones(owner);
        if (bag.size > 0) {
            // Put selected back into deck
            const toPutBack = [];
            for (let i = hand.length - 1; i >= 0; i--) {
                const c = hand[i];
                if (bag.has(c.uid)) {
                    toPutBack.push(hand.splice(i, 1)[0]);
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
            render();
            showMulliganUI();
        }
        else {
            // Both done → start first turn
            startFirstTurn();
        }
    }, { owner, stage: "mulligan" }, { autoRender: false });
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
    render();
}
// ---- Simple UI helpers (two confirm buttons you can place in your HTML) ----
function showMulliganUI() {
    const blueBtn = document.getElementById("blueMulliganConfirm");
    const redBtn = document.getElementById("redMulliganConfirm");
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
    if (blueBtn)
        blueBtn.style.display = "none";
    if (redBtn)
        redBtn.style.display = "none";
    document.body.classList.remove("mulligan-active");
}
