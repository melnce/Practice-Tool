// utils.js - Combined utility functions
import { state } from "@core/gameState.js"; // NEW
import { render } from "@ui/render.js"; // NEW
import { logEvent } from "@core/logger.js"; // Add import
// Pull *once* from rng and re-export locally-used helpers
import { rand, randInt, choice as rngChoice, shuffleInPlace as rngShuffle, } from "@core/rng.js";
// Constants
export const MAX_HAND = 9;
const REAPER_URLS = [
    "https://static.wikia.nocookie.net/shadowverse/images/b/b7/Images.jpg",
    "https://images.wikia.nocookie.net/__cb20220410215837/shadowverse/images/b/b7/Images.jpg",
    // simple skull SVG
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="black"/><circle cx="128" cy="120" r="70" fill="white"/><circle cx="102" cy="110" r="12"/><circle cx="154" cy="110" r="12"/><rect x="118" y="138" width="20" height="38"/></svg>'
];
// ---- RNG helpers (aliases to avoid duplication) ------------------------------
// Keep old API names if other files import from utils:
export const randomChoice = rngChoice; // was local, now alias
export const randomInt = randInt; // was local, now alias
export const shuffleInPlace = rngShuffle; // was local, now alias
// -------- Helpers --------
function showImageOverlayWithFallback(urls) {
    if (typeof document === "undefined")
        return; // headless: noop
    const box = document.getElementById("burnPreview");
    const img = document.getElementById("burnPreviewImg");
    if (!box || !img)
        return;
    let i = 0;
    img.onload = () => {
        box.style.display = "block";
        setTimeout(() => (box.style.display = "none"), 900);
        // clean handlers after success
        img.onload = null;
        img.onerror = null;
    };
    img.onerror = () => {
        i += 1;
        if (i < urls.length) {
            img.src = urls[i];
        }
        else {
            // give up silently
            box.style.display = "none";
            img.onerror = null;
            img.onload = null;
        }
    };
    img.src = urls[0];
}
function burnPreview(card) {
    if (typeof document === "undefined")
        return; // headless: noop
    const box = document.getElementById("burnPreview");
    const img = document.getElementById("burnPreviewImg");
    if (!box || !img)
        return;
    img.onload = null;
    img.onerror = null; // no fallback for burns
    img.src = card?.base_image || card?.image || "";
    box.style.display = "block";
    setTimeout(() => (box.style.display = "none"), 900);
}
export function pushToHand(hand, card) {
    if (!card)
        return false;
    if (hand.length >= MAX_HAND) {
        // Log the burn effect
        let owner = null;
        if (hand === state.blueHand)
            owner = "blue";
        else if (hand === state.redHand)
            owner = "red";
        logEvent("burn", { owner, card: card.name });
        burnPreview(card); // burn visual
        return false; // goes to void
    }
    hand.push(card);
    return true;
}
/**
 * drawCard(hand, deck, owner?)
 * - If deck empty: instant loss for the drawer + flash Reaper image.
 * - Owner inference keeps old call sites working.
 */
export function drawCard(hand, deck, owner = null) {
    if (!owner) {
        if (hand === state.blueHand)
            owner = "blue";
        else if (hand === state.redHand)
            owner = "red";
    }
    if (!deck || deck.length === 0) {
        if (typeof document !== "undefined") {
            showImageOverlayWithFallback(REAPER_URLS);
            const iHaveCrest = (owner === "blue"
                ? (state.blueCrests || []).some(c => c.name === "Mjerrabaine, Great Manifest")
                : (state.redCrests || []).some(c => c.name === "Mjerrabaine, Great Manifest"));
            const iWinOnDeckout = iHaveCrest || (owner === "blue" ? !!state.deckoutWinsBlue : !!state.deckoutWinsRed);
            const opp = (owner === "blue") ? "red" : "blue";
            if (iWinOnDeckout) {
                if (opp === "blue")
                    state.blueHP = 0;
                else
                    state.redHP = 0;
            }
            else {
                if (owner === "blue")
                    state.blueHP = 0;
                else
                    state.redHP = 0;
            }
            // Log the deckout event
            logEvent("deckout", { loser: owner, winner: opp });
            render();
            return false;
        }
    }
    // draw from the END of the array (top of deck)
    const top = deck.pop();
    // Log the normal draw
    logEvent("draw", { owner, card: top.name, uid: top.uid });
    return pushToHand(hand, top);
}
