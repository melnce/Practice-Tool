/**
 * Unified keyword presence check.
 * 
 * CHOKE POINT: All keyword presence checks should use this function.
 * This consolidates the 4+ patterns previously used:
 * - Boolean flags (card.hasWard)
 * - KeywordState (card.keywordState?.cantAttack)
 * - Keywords array (card.keywords?.some(...))
 * - Cast access ((card as any).hasIntimidate)
 */

import type { CardInstance } from "../../../core/types/index.js";

/**
 * Normalize keyword name for comparison.
 */
function normalizeKeyword(name: string): string {
    return name.toLowerCase().replace(/[_\s-]/g, "");
}

/**
 * Check if a card has a specific keyword.
 * 
 * @param card - The card to check
 * @param keyword - The keyword name (case-insensitive)
 * @returns true if the card has the keyword
 */
export function hasKeyword(card: CardInstance | null | undefined, keyword: string): boolean {
    if (!card) return false;

    const k = normalizeKeyword(keyword);

    // 1. Check explicit boolean flags (most common keywords)
    switch (k) {
        case "ward":
            if (card.hasWard) return true;
            break;
        case "rush":
            if (card.hasRush) return true;
            break;
        case "storm":
            if (card.hasStorm) return true;
            break;
        case "bane":
            if (card.hasBane) return true;
            break;
        case "ambush":
            if (card.hasAmbush) return true;
            break;
        case "aura":
            if (card.hasAura) return true;
            break;
        case "drain":
            if ((card as any).hasDrain) return true;
            break;
        case "intimidate":
            if ((card as any).hasIntimidate) return true;
            if (card.keywordState?.hasIntimidate) return true;
            break;
        case "lastwords":
            if (card.hasLastWords) return true;
            break;
        case "barrier":
            if (card.keywordState?.hasBarrier || (card as any).hasBarrier) return true;
            break;
        case "cantattack":
            if (card.keywordState?.cantAttack ||
                card.keywordState?.hasCantAttack ||
                card.keywordState?.cantAttackUntilOpponentEOT) return true;
            break;
        case "cantattackfollowers":
            if (card.keywordState?.cantAttackFollowers) return true;
            break;
        case "cantattackleaders":
            if (card.keywordState?.cantAttackLeaders) return true;
            break;
        case "indestructible":
        case "cannotbedestroyed":
            if (card.keywordState?.cannotBeDestroyed) return true;
            break;
        case "piercing":
            if (card.keywordState?.hasPiercing) return true;
            break;
        case "invincibleonattack":
            if (card.keywordState?.isInvincibleOnAttack) return true;
            break;
        case "taunt":
            if ((card as any).hasTaunt) return true;
            break;
    }

    // 2. Check keywords array
    if (Array.isArray(card.keywords)) {
        for (const kw of card.keywords) {
            const kwName = typeof kw === "string"
                ? normalizeKeyword(kw)
                : kw?.name ? normalizeKeyword(kw.name) : "";
            if (kwName === k) return true;
        }
    }

    // 3. Check temp_keywords (for duration-based keywords)
    if (Array.isArray((card as any).temp_keywords)) {
        for (const kw of (card as any).temp_keywords) {
            const kwName = typeof kw === "string"
                ? normalizeKeyword(kw)
                : kw?.name ? normalizeKeyword(kw.name) : "";
            if (kwName === k) return true;
        }
    }

    return false;
}

/**
 * Check if a card has ALL of the specified keywords.
 */
export function hasAllKeywords(card: CardInstance | null | undefined, keywords: string[]): boolean {
    return keywords.every(kw => hasKeyword(card, kw));
}

/**
 * Check if a card has ANY of the specified keywords.
 */
export function hasAnyKeyword(card: CardInstance | null | undefined, keywords: string[]): boolean {
    return keywords.some(kw => hasKeyword(card, kw));
}
