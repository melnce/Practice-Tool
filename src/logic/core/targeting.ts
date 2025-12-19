import { state } from "../../core/gameState.js";
// @ts-ignore
import { adapter } from "../../core/adapter.js";
import { logEvent } from "../../core/logger.js";
import { CardInstance, Effect, Player } from "../../core/types.js";
import { guardLifecycle } from "./targeting/guards.js";

// Refactored Imports
import {
    parseTargetQuery,
    resolveBasePool,
    applyFilters,
    TargetContext
} from "./targeting/index.js";

// Re-export Context for consumers
export type { TargetContext };

/**
 * Orchestrates target selection.
 * Refactored pipeline: Parse -> Resolve -> Filter
 */
export function getPool(targetSpec: string, owner: Player, sourceCard: CardInstance | null = null, condition: any = {}, context: TargetContext = {}): CardInstance[] {
    // 1. Parse string spec into structured Query
    // LEGACY: Preserves "ally:hand" alias and default "ally" side fallback
    const env = { owner, sourceCard, context };
    const query = parseTargetQuery(targetSpec, condition);

    // 2. Resolve base candidate pool (Context Resolution)
    // LEGACY: Preserves "last_summoned" and "entering_follower" contexts
    const basePool = resolveBasePool(query, env);

    // 3. Apply Filters and Conditions
    // LEGACY: Preserves filter order and Ambush/Aura handling
    const finalPool = applyFilters(basePool, query, env);

    return finalPool;
}

// -----------------------------------------------------------------------------
// Legacy / UI Helpers (Preserved)
// -----------------------------------------------------------------------------

function getCardSide(c: CardInstance): Player | null {
    if (state.blueBoard?.includes(c)) return "blue";
    if (state.redBoard?.includes(c)) return "red";
    if (state.blueHand?.includes(c)) return "blue";
    if (state.redHand?.includes(c)) return "red";
    return c?.owner ?? null;
}

export function highlightSelectable(cards: CardInstance[]) {
    cards.forEach(c => (c as any).__uiSelectable = true);
    adapter.render();
}

export function clearSelectableFlags() {
    guardLifecycle("clearSelectableFlags");
    [...state.blueBoard, ...state.redBoard, ...state.blueHand, ...state.redHand, ...state.blueGraveyard, ...state.redGraveyard].forEach(c => {
        if (c) delete (c as any).__uiSelectable;
    });
}

// -----------------------------------------------------------------------------
// handleSelect (Orchestrator for Selection Effects)
// -----------------------------------------------------------------------------

export function handleSelect(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: Effect[], context: TargetContext = {}) {
    // requested number of picks from JSON
    const raw = eff.select ?? eff.select_count ?? 1;
    let requestedCount = parseInt(String(raw), 10);
    if (!Number.isFinite(requestedCount) || requestedCount < 1) requestedCount = 1;

    // mark this as a targeted effect for Ambush/Aura filtering
    const targetedCtx = { ...context, isTargetedEffect: true, selectCount: requestedCount };

    // build the initial pool
    let pool = getPool(eff.target, owner, sourceCard, eff.condition, targetedCtx);

    // Always log for debugging this issue
    if (String(eff.target).startsWith("hand:")) console.log(`[handleSelect Debug] Target: ${eff.target}, Pool Size: ${pool.length}`);

    if (!(globalThis as any).HEADLESS && String(eff.target).startsWith("hand:")) {
        const myHand = owner === "blue" ? state.blueHand : state.redHand;
        console.log("[handleSelect Debug] Hand valid?", myHand.length, "Hand UIDs:", myHand.map(c => c.uid));
        console.log("[handleSelect Debug] Hand names:", myHand.map(c => c.name));
        console.log("[handleSelect Debug] Source:", sourceCard?.name, sourceCard?.uid);
    }

    // Apply extra filters if specified in 'op: select' itself (e.g. "leftmost")
    if (eff.filter === "leftmost") {
        if (pool.length > 0) {
            const first = pool[0];
            pool = first ? [first] : []; // Assuming pool order matches board order (getPool usually returns board order)
        }
    } else if (eff.filter === "rightmost") {
        if (pool.length > 0) {
            const last = pool[pool.length - 1];
            pool = last ? [last] : [];
        }
    }

    // no valid targets at all → nothing to do
    if (!pool.length) return "done";

    // --- LLOYD GATING (may shrink the pool) ---
    (function applyLloydGate() {
        try {
            const opp = owner === "blue" ? "red" : "blue";
            const oppBoard = opp === "blue" ? state.blueBoard : state.redBoard;
            const lloyds = (oppBoard || []).filter(c => c?.name === "Lloyd");
            if (!lloyds.length) return;

            const poolHasOpponent = (pool || []).some(c => getCardSide(c) === opp);
            if (!poolHasOpponent) return;

            if (requestedCount <= 1) {
                const lloydUids = new Set(lloyds.map(l => l.uid));
                pool = pool.filter(c => lloydUids.has(c?.uid));
            } else {
                targetedCtx.__lloydRequiredFirstUids = lloyds.map(l => l.uid);
            }
        } catch (e) {
            console.warn("Lloyd gate failed:", e);
        }
    })();

    // after all filters, cap the select count to available targets
    const effectiveCount = Math.max(1, Math.min(requestedCount, pool.length));

    // === AUTOMATIC SELECTION (Bot OR Mode=Random) ===
    // If SpectatorBot is active OR the effect explicitly requests 'random' mode,
    // pick targets at random and immediately resolve.
    const isRandomMode = eff.mode === "random";
    const isBot = (typeof window !== "undefined" && (window as any).__BOT_AUTO_TARGETING__ === true);

    if (isBot || isRandomMode) {
        console.log(`[Targeting] Auto-Select (Bot=${isBot}, RandomMode=${isRandomMode}) Pool Size: ${pool.length}`);

        // Honor any “must include these first” constraint from the Lloyd gate
        const picks: CardInstance[] = [];
        const mustFirst = targetedCtx.__lloydRequiredFirstUids || [];
        if (mustFirst.length) {
            const set = new Set(mustFirst);
            for (const c of pool) {
                if (picks.length >= effectiveCount) break;
                if (set.has(c?.uid)) picks.push(c);
            }
        }
        // Fill remaining picks randomly from the rest of the pool (no duplicates)
        const remaining = pool.filter(c => !picks.includes(c));
        while (picks.length < effectiveCount && remaining.length) {
            const idx = state.rng.nextInt(remaining.length);
            const picked = remaining.splice(idx, 1)[0];
            if (picked) picks.push(picked);
        }

        // Clear any UI highlights and immediately resolve the effect queue
        clearSelectableFlags();
        const selectedCtx = { ...targetedCtx, targets: picks };

        // If this select wraps nested effects (usual case), resolve them now.
        if (Array.isArray(eff.effects) && eff.effects!.length) {
            // runEffects([...eff.effects!], owner, sourceCard, selectedCtx);
            const runner = context.runner || ((...args: any[]) => console.warn("Missing runner for handleSelect auto"));
            runner([...eff.effects!], owner, sourceCard, selectedCtx);
        }
        // Only trigger 'done' if we fully handled it (which we did).

        state.__lastSelected = picks[0] || null;

        // If 'select' is just a wrapper for nested effects, returning 'done' is fine.
        return "done";
    }

    // Special case for super evolve
    if (eff.effects && (eff.effects as Effect[]).some((e: Effect) => e.op === "super_evolve")) {
        const superEvoEff = (eff.effects as Effect[]).find((e: Effect) => e.op === "super_evolve");
        if (superEvoEff) {
            state.pendingTargetEffect = {
                eff: superEvoEff,
                owner,
                sourceCard,
                resumeEffects: effectsQueue,
                pool,
                targets: [],
                selectCount: effectiveCount,
            };
        }
    } else {
        state.pendingTargetEffect = {
            eff: { op: 'nested_effects', effects: eff.effects ?? [] },
            owner,
            sourceCard,
            resumeEffects: effectsQueue,
            pool,
            targets: [],
            selectCount: effectiveCount,
        };
    }

    highlightSelectable(pool);
    return "pending";
}
