import { Effect, Player, CardInstance } from "../../../core/types.js";
import { removeKeywordFromSingleCard, removeAllAbilitiesFromCard } from "./remove.js";
import { applyKeyword } from "./apply.js";
import { KeywordEffectResult } from "./types.js";

// Helper to construct request
function createSelectionRequest(
    eff: Effect,
    owner: Player,
    targets: CardInstance[],
    sourceCard: CardInstance | null,
    effectsQueue: any[]
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
        }
    };
}

export function handleKeyword(
    eff: Effect,
    owner: Player,
    effectsQueue: any[],
    resolvedTargets: CardInstance[],
    context: any = {}
): KeywordEffectResult {
    let targets = resolvedTargets;

    if (eff.name_filter) {
        const filterStr = String(eff.name_filter).toLowerCase();
        targets = targets.filter((t: CardInstance) => String(t.name || "").toLowerCase() === filterStr);
    }

    if (eff.exclude_self && context.sourceCard) {
        targets = targets.filter((t: CardInstance) => t.uid !== context.sourceCard.uid);
    }
    if (!targets.length) return { kind: "done" };

    const __selRaw = (eff.select ?? eff.select_count);
    if (__selRaw) {
        return createSelectionRequest(eff, context.owner, targets, context.sourceCard, context.effectsQueue);
    }

    const keywordList = Array.isArray((eff as any).keywords) ? (eff as any).keywords : [(eff as any).keyword].filter(Boolean);
    for (const target of targets) {
        for (const k of keywordList) {
            const name = (typeof k === "string" ? k : k?.name) || "";
            const options = (typeof k === "object" ? k : undefined);
            applyKeyword(target, name, options);
        }
    }
    return { kind: "done" };
}

export function handleRemoveKeyword(
    eff: Effect,
    owner: Player,
    targets: CardInstance[],
    effectsQueue: any[] = []
): KeywordEffectResult {
    if (!targets.length) return { kind: "done" };

    // If explicit targets are provided (e.g. from context/selection), we operate on them.
    // If THIS effect triggered selection, we return a request.
    if (eff.select) {
        return createSelectionRequest(eff, owner, targets, null, effectsQueue);
    }

    const keywordToRemove = String(eff.keyword || "").toLowerCase();
    for (const target of targets) {
        removeKeywordFromSingleCard(target, keywordToRemove);
    }
    return { kind: "done" };
}

export function handleRemoveAbilities(
    eff: Effect,
    owner: Player,
    effectsQueue: any[],
    targets: CardInstance[],
    context: any = {}
): KeywordEffectResult {
    if (eff.select) {
        return createSelectionRequest(eff, owner, targets, context.sourceCard, effectsQueue);
    }

    if (!targets || targets.length === 0) return { kind: "done" };

    for (const card of targets) {
        removeAllAbilitiesFromCard(card);
    }
    return { kind: "done" };
}

import { state } from "../../../core/gameState.js";

// ... (existing imports are fine, just fixing the functions at the end)

export function handleKeywordSelf(sourceCard: CardInstance, eff: Effect): KeywordEffectResult {
    if (!sourceCard) {
        return { kind: "done" };
    }

    const keywords = Array.isArray(eff.keywords) ? eff.keywords : [eff.keyword || eff.name];
    for (const kw of keywords) {
        const name = (typeof kw === "string" ? kw : (kw as any)?.name) || "";
        const options = (typeof kw === "object" ? kw : undefined);
        if (name) {
            applyKeyword(sourceCard, name, options);
        }
    }
    return { kind: "done" };
}

export function handleConditionalKeyword(eff: Effect, owner: Player) {
    switch (eff.condition) {
        case "super_evo_unlocked": {
            const charges = owner === "blue" ? state.blueSuperEvoCharges : state.redSuperEvoCharges;
            return charges > 0;
        }
        case "evo_unlocked": {
            const normalCharges = owner === "blue" ? state.blueEvoCharges : state.redEvoCharges;
            return normalCharges > 0;
        }
        default:
            console.warn(`Unknown condition in handleConditionalKeyword: ${eff.condition}`);
            return false;
    }
}

