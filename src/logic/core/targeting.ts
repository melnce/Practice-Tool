import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { runEffects } from "@logic/core/effects/index.js";
import { randInt } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
import { CardInstance, Effect, Player } from "@core/types.js";

interface TargetContext {
    targets?: CardInstance[];
    enteringCard?: CardInstance;
    isTargetedEffect?: boolean;
    selectCount?: number;
    __lloydRequiredFirstUids?: string[];
    [key: string]: any;
}

// helper (near top of file or inside getPool)
function _isCardDamaged(c: CardInstance) {
    const curr = parseInt(c?.defense as string, 10) || 0;

    // prefer potential_defense (full health after buffs),
    // else peak_defense (highest seen), else base_defense, else current
    const full =
        Number.isFinite(c?.potential_defense) ? (c.potential_defense as number) :
            Number.isFinite(c?.peak_defense) ? (c.peak_defense as number) :
                Number.isFinite(c?.base_defense) ? (c.base_defense as number) :
                    curr;

    return curr < full;
}

function getCardSide(c: CardInstance): Player | null {
    if (state.blueBoard?.includes(c)) return "blue";
    if (state.redBoard?.includes(c)) return "red";
    if (state.blueHand?.includes(c)) return "blue"; // also check hands for completeness
    if (state.redHand?.includes(c)) return "red";
    return c?.owner ?? null;
}

export function getPool(targetSpec: string, owner: Player, sourceCard: CardInstance | null = null, condition: any = {}, context: TargetContext = {}): CardInstance[] {
    const spec = String(targetSpec || "").trim().toLowerCase();

    // --- selected: use the already-chosen targets from a parent select() ---
    if (spec === "selected" || spec.startsWith("selected:")) {
        // Prefer the context passed by resolveTarget() when you confirmed the selection
        let chosen = Array.isArray(context?.targets) ? context.targets
            : Array.isArray(state.pendingTargetEffect?.targets) ? state.pendingTargetEffect!.targets
                : [];

        chosen = (chosen || []).filter(Boolean);

        // Optional subtype filter: "selected:follower" / "selected:amulet"
        const parts = spec.split(":");
        if (parts[1] === "follower") chosen = chosen.filter((c: CardInstance) => c?.type === "Follower");
        if (parts[1] === "amulet") chosen = chosen.filter((c: CardInstance) => c?.type === "Amulet");

        return chosen;
    }
    let pool: CardInstance[] = [];

    if (spec === "ally:last_summoned") {
        // Always return an array
        const ls = (state as any).lastSummoned;
        return Array.isArray(ls) ? ls : (ls ? [ls] : []);
    }

    // entering_follower
    if (spec === "entering_follower") {
        if (context.enteringCard) {
            console.log(`%c[Targeting] Found entering_follower: ${context.enteringCard.name}`, 'color: green; font-weight: bold;');
            return [context.enteringCard];
        }
        console.warn("entering_follower target used without context");
        return [];
    }

    const [sideRaw = "ally", typeRaw = ""] = spec.split(":");
    const side = sideRaw.trim();
    const type = typeRaw.trim();

    // NEW: use already chosen targets from a parent select()
    if (side === "selected") {
        const chosen = Array.isArray(context?.targets)
            ? context.targets
            : (Array.isArray(state.pendingTargetEffect?.targets)
                ? state.pendingTargetEffect!.targets
                : []);
        pool = (chosen || []).filter(Boolean);
    }

    const myHand = owner === "blue" ? state.blueHand : state.redHand;
    const myBoard = owner === "blue" ? state.blueBoard : state.redBoard;
    const oppBoard = owner === "blue" ? state.redBoard : state.blueBoard;

    // Base pool
    if (type === "hand") {
        pool = myHand || [];
        // Optional hand-type filter: condition.card_type = "Follower" | "Spell" | "Amulet"
        const handType = String(condition?.card_type || condition?.type_eq || "").toLowerCase();
        if (handType) {
            pool = pool.filter(c => String(c?.type || "").toLowerCase() === handType);
        }
    } else {
        if (side === "ally" || side === "self") pool = myBoard || [];
        else if (side.startsWith("enemy") || side === "opp" || side === "opponent") pool = oppBoard || [];
        else if (side === "any" || side === "both" || side === "all") pool = [...(myBoard || []), ...(oppBoard || [])];
        else pool = myBoard || [];
    }

    // Type filter
    if (type === "follower") pool = pool.filter(c => c?.type === "Follower");
    else if (type === "amulet") pool = pool.filter(c => c?.type === "Amulet");

    // Condition filters
    // Default: exclude self, unless explicitly allowed
    const allowSelf =
        (condition && (condition.not_self === false || condition.include_self === true));

    if (!allowSelf && sourceCard) {
        pool = pool.filter(c => c?.uid !== sourceCard.uid);
    }
    if (condition.unevolved) {
        pool = pool.filter(c => c && !c.hasEvolved);
    }
    if (condition.tribe) {
        pool = pool.filter(c => Array.isArray(c?.tribes) && c.tribes!.includes(condition.tribe));
    }
    if (condition.has_keyword) {
        const keywordName = String(condition.has_keyword).toLowerCase();
        pool = pool.filter(c => {
            if (!Array.isArray(c?.keywords)) return false;
            return c.keywords!.some((k: any) => {
                const kwName = typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase();
                return kwName === keywordName;
            });
        });
    }

    if (condition.is_super_evolved) {
        pool = pool.filter(c => c && c.type === "Follower" && c.evoType === "super");
    }

    // --- numeric stat filters ---
    const toNum = (v: any) => Number.isFinite(Number(v)) ? Number(v) : null;

    if (condition.attack_lte != null) {
        const lim = toNum(condition.attack_lte);
        if (lim != null) pool = pool.filter(c => c?.type === "Follower" && (Number(c.attack) || 0) <= lim);
    }
    if (condition.attack_gte != null) {
        const lim = toNum(condition.attack_gte);
        if (lim != null) pool = pool.filter(c => c?.type === "Follower" && (Number(c.attack) || 0) >= lim);
    }
    if (condition.attack_eq != null) {
        const lim = toNum(condition.attack_eq);
        if (lim != null) pool = pool.filter(c => c?.type === "Follower" && (Number(c.attack) || 0) === lim);
    }
    if (condition.defense_lte != null) {
        const lim = toNum(condition.defense_lte);
        if (lim != null) pool = pool.filter(c => c?.type === "Follower" && (Number(c.defense) || 0) <= lim);
    }
    if (condition.defense_gte != null) {
        const lim = toNum(condition.defense_gte);
        if (lim != null) pool = pool.filter(c => c?.type === "Follower" && (Number(c.defense) || 0) >= lim);
    }
    if (condition.defense_eq != null) {
        const lim = toNum(condition.defense_eq);
        if (lim != null) pool = pool.filter(c => c?.type === "Follower" && (Number(c.defense) || 0) === lim);
    }

    // Ambush/Aura — only block ENEMY units for targeted effects.
    // Determine owner by which board the card is on (cards often have no .owner)
    if (context.isTargetedEffect) {
        pool = pool.filter(c => {
            const cardSide = getCardSide(c);

            const isEnemy = cardSide && cardSide !== owner;
            if (isEnemy && (c?.hasAmbush || (c as any).hasAura)) return false; // block enemy stealth
            return true; // allies always targetable
        });
    }
    if (condition.damaged === true) {
        pool = pool.filter(c => c?.type === "Follower" && _isCardDamaged(c));
    } else if (condition.damaged === false) {
        pool = pool.filter(c => c?.type === "Follower" && !_isCardDamaged(c));
    }


    // ✅ Always return an array
    return Array.isArray(pool) ? pool : [];
}


export function highlightSelectable(cards: CardInstance[]) {
    cards.forEach(c => (c as any).__uiSelectable = true);
    render();
}

export function clearSelectableFlags() {
    [...state.blueBoard, ...state.redBoard, ...state.blueHand, ...state.redHand].forEach(c => {
        if (c) delete (c as any).__uiSelectable;
    });
}

export function handleSelect(eff: Effect, owner: Player, sourceCard: CardInstance | null, effectsQueue: Effect[], context: TargetContext = {}) {
    // requested number of picks from JSON
    const requestedCount = parseInt((eff.select ?? eff.select_count ?? 1));

    // mark this as a targeted effect for Ambush/Aura filtering
    const targetedCtx = { ...context, isTargetedEffect: true, selectCount: requestedCount };

    // build the initial pool
    let pool = getPool(eff.target, owner, sourceCard, eff.condition, targetedCtx);

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

    // === BOT AUTO-TARGETING ===
    // If SpectatorBot is active, pick targets at random and immediately resolve
    // instead of opening the UI/pending state.
    if (typeof window !== "undefined" && (window as any).__BOT_AUTO_TARGETING__ === true) {
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
            const idx = randInt(remaining.length);
            picks.push(remaining.splice(idx, 1)[0]);
        }

        // Clear any UI highlights and immediately resolve the effect queue
        clearSelectableFlags();
        const selectedCtx = { ...targetedCtx, targets: picks };

        // If this select wraps nested effects (usual case), resolve them now.
        if (Array.isArray(eff.effects) && eff.effects!.length) {
            runEffects([...eff.effects!], owner, sourceCard, selectedCtx);
        }
        // Then continue with the rest of the queued effects (if any)
        if (Array.isArray(effectsQueue) && effectsQueue.length) {
            runEffects([...effectsQueue], owner, sourceCard, selectedCtx);
        }
        return "done";
    }

    // Special case for super evolve
    if (eff.effects && (eff.effects as Effect[]).some((e: Effect) => e.op === "super_evolve")) {
        state.pendingTargetEffect = {
            eff: (eff.effects as Effect[]).find((e: Effect) => e.op === "super_evolve"),
            owner,
            sourceCard,
            resumeEffects: effectsQueue,
            pool,
            targets: [],
            selectCount: effectiveCount,
        };
    } else {
        state.pendingTargetEffect = {
            eff: { op: 'nested_effects', effects: eff.effects },
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

    // try { logEvent("targetPrompt", { owner, op: (eff && eff.op) || "nested_effects", selectCount: effectiveCount, pool: (pool || []).map(t => ({ name: t?.name, uid: t?.uid, type: t?.type })) }); } catch { }

}
