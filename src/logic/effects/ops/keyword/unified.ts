// src/logic/effects/ops/keyword/unified.ts
// Unified keyword handler - replaces keyword, remove_keyword, remove_abilities, grant_trigger

import { CardInstance, Effect, Player } from "../../../../core/types.js";
import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";
import { applyKeyword } from "../../../core/keywords/apply.js";
import {
    removeKeywordFromSingleCard,
    removeAllAbilitiesFromCard,
} from "../../../core/keywords/remove.js";
import { KeywordEffectResult } from "../../../core/keywords/types.js";
import { grantLeaderBarrier } from "../../leader.js";

export interface KeywordHandlerContext {
    owner: Player;
    sourceCard: CardInstance | null;
    targets: CardInstance[];
    effectsQueue: Effect[];
    isTargetedEffect?: boolean;
}

/**
 * Helper to construct selection request
 */
function createSelectionRequest(
    eff: Effect,
    owner: Player,
    targets: CardInstance[],
    sourceCard: CardInstance | null,
    effectsQueue: Effect[],
): KeywordEffectResult {
    const requested = parseInt((eff.select ?? eff.select_count ?? 1) as string);
    const clamped = Math.max(1, Math.min(requested, targets.length));

    if (targets.length === 0) return { kind: "no-valid-targets" };

    return {
        kind: "request_target",
        request: {
            eff,
            owner,
            sourceCard: sourceCard || null,
            resumeEffects: effectsQueue,
            pool: targets,
            selectCount: clamped,
        },
    };
}

/**
 * Unified keyword handler.
 * Routes to appropriate keyword primitive based on action field.
 *
 * STRICT MODE: Throws on missing required fields.
 */
export function handleKeyword(
    eff: Effect,
    ctx: KeywordHandlerContext,
): KeywordEffectResult {
    // ========================================================================
    // STRICT VALIDATION
    // ========================================================================
    if ((eff as any).action === undefined) {
        throw new Error(
            `[keyword] Missing required field: "action". Must be "grant", "remove", "silence", or "grant_trigger". Effect: ${JSON.stringify(eff)}`,
        );
    }

    const action = (eff as any).action;

    switch (action) {
        case "grant":
            return handleGrant(eff, ctx);
        case "remove":
            return handleRemove(eff, ctx);
        case "silence":
            return handleSilence(eff, ctx);
        case "grant_trigger":
            return handleGrantTrigger(eff, ctx);
        default:
            throw new Error(
                `[keyword] Invalid action: "${action}". Must be "grant", "remove", "silence", or "grant_trigger".`,
            );
    }
}

/**
 * Grant keywords to targets
 */
function handleGrant(
    eff: Effect,
    ctx: KeywordHandlerContext,
): KeywordEffectResult {
    // STRICT: Only accept keywords array
    const keywordList = Array.isArray((eff as any).keywords)
        ? (eff as any).keywords
        : [];

    // ========================================================================
    // LEADER KEYWORD SUPPORT
    // ally:leader / enemy:leader / leader (legacy)
    // ========================================================================
    const targetStr = String((eff as any).target || "").toLowerCase();
    if (
        targetStr === "ally:leader" ||
        targetStr === "enemy:leader" ||
        targetStr === "leader"
    ) {
        // Determine target leader
        let targetOwner: Player;
        if (targetStr === "enemy:leader") {
            targetOwner = ctx.owner === "first" ? "second" : "first";
        } else if (targetStr === "ally:leader") {
            targetOwner = ctx.owner;
        } else {
            // Legacy "leader" target - use player field for backwards compatibility
            const player = (eff as any).player || "self";
            targetOwner =
                player === "opponent"
                    ? ctx.owner === "first"
                        ? "second"
                        : "first"
                    : ctx.owner;
        }

        for (const k of keywordList) {
            const name = (typeof k === "string" ? k : k?.name) || "";
            const value = typeof k === "object" ? k?.value : undefined;
            const duration = typeof k === "object" ? k?.duration : undefined;
            const nameLower = name.toLowerCase();

            const s = state as any;

            if (nameLower === "barrier") {
                grantLeaderBarrier(targetOwner);
            } else if (nameLower === "maxdamagecap") {
                // Set max damage cap (Zooey-style effect)
                const capKey =
                    targetOwner === "first"
                        ? "blueLeaderMaxDamageCap"
                        : "redLeaderMaxDamageCap";
                const expiryKey =
                    targetOwner === "first"
                        ? "blueLeaderMaxDamageCapExpiry"
                        : "redLeaderMaxDamageCapExpiry";
                s[capKey] = value ?? 0;
                if (duration === "opponent_turn_end") {
                    s[expiryKey] = "opponent_turn_end";
                }
                logEvent("setLeaderMaxDamageCap", {
                    owner: targetOwner,
                    cap: value,
                    duration,
                });
            } else if (nameLower === "vulnerable") {
                // Increase damage taken (Beelzebub-style debuff)
                const modKey =
                    targetOwner === "first"
                        ? "blueLeaderDamagePlus"
                        : "redLeaderDamagePlus";
                s[modKey] = (s[modKey] || 0) + (value ?? 1);
                logEvent("grantVulnerable", {
                    owner: targetOwner,
                    value: value ?? 1,
                    total: s[modKey],
                });
            }
        }
        return { kind: "done" };
    }

    // ========================================================================
    // CARD/FOLLOWER KEYWORD HANDLING (existing logic)
    // ========================================================================
    let targets = ctx.targets;

    if (eff.name_filter) {
        const filterStr = String(eff.name_filter).toLowerCase();
        targets = targets.filter(
            (t: CardInstance) => String(t.name || "").toLowerCase() === filterStr,
        );
    }

    if (eff.exclude_self && ctx.sourceCard) {
        targets = targets.filter(
            (t: CardInstance) => t.uid !== ctx.sourceCard?.uid,
        );
    }

    if (!targets.length) return { kind: "done" };

    const __selRaw = eff.select ?? eff.select_count;
    if (__selRaw) {
        return createSelectionRequest(
            eff,
            ctx.owner,
            targets,
            ctx.sourceCard,
            ctx.effectsQueue,
        );
    }

    const genericExpiryOpts = eff.until_end_of_turn
        ? {
            expires_on_turn: state.roundCount ?? 0,
        }
        : undefined;

    for (const target of targets) {
        for (const k of keywordList) {
            let name = "";
            let options: any = genericExpiryOpts
                ? { ...genericExpiryOpts }
                : undefined;
            if (!options) options = {};
            options.request_owner = ctx.owner;

            if (typeof k === "string") {
                name = k;
            } else {
                name = k?.name || "";
                if (k) {
                    options = { ...options, ...k };
                }
            }

            if (name) {
                applyKeyword(target, name, options);
            }
        }
    }
    return { kind: "done" };
}

/**
 * Remove specific keywords from targets
 */
function handleRemove(
    eff: Effect,
    ctx: KeywordHandlerContext,
): KeywordEffectResult {
    const targets = ctx.targets;
    if (!targets.length) return { kind: "done" };

    if (eff.select) {
        return createSelectionRequest(
            eff,
            ctx.owner,
            targets,
            null,
            ctx.effectsQueue,
        );
    }

    const keywordsToRemove = Array.isArray((eff as any).keywords)
        ? (eff as any).keywords
        : [];
    for (const target of targets) {
        for (const kw of keywordsToRemove) {
            const name = (typeof kw === "string" ? kw : kw?.name) || "";
            if (name) removeKeywordFromSingleCard(target, name.toLowerCase());
        }
    }
    return { kind: "done" };
}

/**
 * Silence - remove ALL abilities from targets
 */
function handleSilence(
    eff: Effect,
    ctx: KeywordHandlerContext,
): KeywordEffectResult {
    const targets = ctx.targets;

    if (eff.select) {
        return createSelectionRequest(
            eff,
            ctx.owner,
            targets,
            ctx.sourceCard,
            ctx.effectsQueue,
        );
    }

    if (!targets || targets.length === 0) return { kind: "done" };

    for (const card of targets) {
        removeAllAbilitiesFromCard(card);
    }
    return { kind: "done" };
}

/**
 * Grant a trigger to targets
 */
function handleGrantTrigger(
    eff: Effect,
    ctx: KeywordHandlerContext,
): KeywordEffectResult {
    const targets = ctx.targets.length
        ? ctx.targets
        : ctx.sourceCard
            ? [ctx.sourceCard]
            : [];

    for (const t of targets) {
        if (!t || !(eff as any).trigger) continue;
        if (!Array.isArray(t.triggers)) t.triggers = [];
        t.triggers.push((eff as any).trigger);
    }
    return { kind: "done" };
}















