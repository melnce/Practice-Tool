// src/data/cardDatabase.ts
import {
    hasInherentStorm,
    hasInherentRush,
    hasInherentWard,
    hasInherentIntimidate,
    hasInherentBarrier,
    hasInherentBane,
    hasInherentBanishOnDeath,
    hasInherentLastWords,
    hasInherentCountdown
} from "./keywords.js";
import { CardTemplate } from "../core/types.js";

let fullCardData: Record<string, CardTemplate> = {};
let tokenCardData: Record<string, CardTemplate> = {};
let cardIdMap: Record<string, CardTemplate> = {};

export async function loadCardDatabase() {
    fullCardData = {};
    tokenCardData = {};
    cardIdMap = {};

    let root = (window as any).APP_ROOT || '/';
    if (root.includes(':5500') && !window.location.href.includes(':5500')) {
        console.warn("Detected invalid APP_ROOT (5500). Fallback to /");
        root = '/';
    }

    const ts = Date.now();
    const fullRes = await fetch(`${root}cards/all.json?v=${ts}`);
    if (!fullRes.ok) throw new Error(`Main cards failed: ${fullRes.status}`);
    const fullJson: any[] = await fullRes.json();

    const tokenRes = await fetch(`${root}cards/token_details.json?v=${ts}`);
    if (!tokenRes.ok) throw new Error(`Tokens failed: ${tokenRes.status}`);
    const tokenJson: any[] = await tokenRes.json();

    // Load lab vanilla set
    let vanillaJson: any[] = [];
    try {
        const vanillaRes = await fetch(`${root}cards/vanilla_lab_set.json`);
        if (vanillaRes.ok) {
            vanillaJson = await vanillaRes.json();
        }
    } catch (e) {
        console.warn("Vanilla lab set not found or failed to load", e);
    }

    const processCard = (card: any, targetMap: Record<string, CardTemplate>) => {
        if (!card.name) return;
        if (card.type === "Follower" || card.type === "Amulet") {
            card.hasStorm = hasInherentStorm(card.description, card.keywords);
            card.hasRush = hasInherentRush(card.description, card.keywords);
            card.hasWard = hasInherentWard(card.description, card.keywords);
            card.hasIntimidate = hasInherentIntimidate(card.description, card.keywords);
            card.hasBarrier = hasInherentBarrier(card.description, card.keywords);
            // card.barrierCharges = card.hasBarrier ? 1 : 0; // Removed
            card.hasBane = hasInherentBane(card.description, card.keywords);
            card.hasBanishOnDeath = hasInherentBanishOnDeath(card.keywords);
            card.hasLastWords = hasInherentLastWords(card.keywords);
            card.hasCountdown = hasInherentCountdown(card.keywords);

            if (card.hasLastWords) {
                const lastWordsKeyword = Array.isArray(card.keywords) ? card.keywords.find((k: any) => typeof k === 'object' && k.name === "LastWords") : null;
                card.lastWordsEffects = lastWordsKeyword?.effects || [];
            }

            if (card.hasCountdown) {
                const countdownKeyword = Array.isArray(card.keywords) ? card.keywords.find((k: any) => typeof k === 'object' && k.name === "Countdown") : null;
                if (countdownKeyword) {
                    card.countdown = parseInt(countdownKeyword.turns) || 0;
                }
            }
        }
        targetMap[card.name] = card;

        // Index by ID if present
        if (card.id) {
            cardIdMap[String(card.id)] = card;
        }
    };

    for (const card of [...fullJson, ...vanillaJson]) {
        processCard(card, fullCardData);
    }

    for (const token of tokenJson) {
        processCard(token, tokenCardData);
    }
}

// Now supports lookup by Name OR ID
export function getCardDetails(nameOrId: string): CardTemplate | null {
    if (!nameOrId) return null;

    // 1. Exact ID match (8+ digits)
    if (/^\d{8,}$/.test(nameOrId)) {
        const byId = cardIdMap[nameOrId];
        if (byId) return byId;
    }

    // 2. Name match
    return fullCardData[nameOrId] || tokenCardData[nameOrId] || null;
}

export function getCardById(id: string): CardTemplate | null {
    return cardIdMap[String(id)] || null;
}

(window as any).cardDatabase = {
    getCardDetails,
    getCardById,
    fullData: fullCardData,
    tokenData: tokenCardData,
    idMap: cardIdMap,
    reload: loadCardDatabase
};
