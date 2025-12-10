// src/logic/effects/ops/buff.ts
import { state } from "@core/gameState.js";
import { getPool, highlightSelectable } from "@logic/core/targeting.js";
import { cleanupDead } from "@logic/core/cleanup.js";
import { applyKeyword } from "@logic/core/keywords.js";
import { randInt } from "@core/rng.js";
import { logEvent } from "@core/logger.js";
export function handleBuff(eff, owner, sourceCard, effectsQueue, context = {}) {
    // pass context so targets like "entering_follower" work
    let pool = getPool(eff.target, owner, null, eff.condition, context)
        .filter(c => c.type === "Follower" &&
        // allow self when explicitly requested
        (eff.include_self || c.uid !== sourceCard?.uid));
    console.log('BUFF pool uids:', pool.map(c => c.uid), 'source:', sourceCard?.uid, 'include_self:', !!eff.include_self);
    // NEW: optional tribe filtering
    const rawTribes = eff.tribes ? (Array.isArray(eff.tribes) ? eff.tribes : [eff.tribes]) :
        eff.tribe ? [eff.tribe] : null;
    if (rawTribes) {
        const want = rawTribes.map((t) => String(t).toLowerCase());
        pool = pool.filter(c => Array.isArray(c.tribes) &&
            c.tribes.some(tr => want.includes(String(tr).toLowerCase())));
    }
    // NEW: optional exact name filtering
    if (eff.name_filter) {
        const want = String(eff.name_filter).toLowerCase();
        pool = pool.filter(c => String(c.name || "").toLowerCase() === want);
    }
    // (optional) support a list of names
    if (Array.isArray(eff.name_in) && eff.name_in.length) {
        const wants = new Set(eff.name_in.map((n) => String(n).toLowerCase()));
        pool = pool.filter(c => wants.has(String(c.name || "").toLowerCase()));
    }
    // NEW: optional keyword filtering (e.g., "Ward")
    const rawKW = eff.has_keyword ?? eff.keywords;
    if (rawKW) {
        const wants = Array.isArray(rawKW) ? rawKW : [rawKW];
        pool = pool.filter(c => wants.every((w) => hasKeyword(c, w)));
    }
    if (!pool.length)
        return "done";
    if (eff.select) {
        state.pendingTargetEffect = {
            eff,
            owner,
            sourceCard,
            resumeEffects: effectsQueue,
            pool,
            targets: [],
            selectCount: parseInt(eff.select_count ?? 1),
            context
        };
        highlightSelectable(pool);
        return "pending";
    }
    // NEW: random targeting path
    if (eff.random) {
        const k = Math.max(0, parseInt(eff.count ?? 1, 10));
        if (k <= 0 || !pool.length)
            return "done";
        const chosen = [];
        const bag = [...pool];
        for (let i = 0; i < k && bag.length; i++) {
            const idx = randInt(bag.length);
            chosen.push(bag.splice(idx, 1)[0]);
        }
        const a = parseInt(eff.attack ?? 0) || 0;
        const d = parseInt(eff.defense ?? 0) || 0;
        console.log("[Devotee EOT] applying to", chosen.map(c => c.uid));
        for (const target of chosen) {
            if (!target.buffs)
                target.buffs = { attack: 0, defense: 0 };
            target.buffs.attack += a;
            target.buffs.defense += d;
            // @ts-ignore
            target.attack = (parseInt(target.attack) || 0) + a;
            // @ts-ignore
            target.defense = (parseInt(target.defense) || 0) + d;
            // @ts-ignore
            target.peak_defense = Math.max(target.peak_defense ?? target.defense, target.defense);
            // @ts-ignore
            if (!target.potential_attack)
                target.potential_attack = target.base_attack || target.attack;
            // @ts-ignore
            if (!target.potential_defense)
                target.potential_defense = target.base_defense || target.defense;
            target.potential_attack += a;
            target.potential_defense += d;
            logEvent("buff", { owner, target: target.name, uid: target.uid, a: a, d: d, mode: "random" });
            // + Optional: grant keywords to exactly these buffed targets
            const grantListRaw = eff.keywords || eff.keyword || null;
            if (grantListRaw) {
                const grantList = Array.isArray(grantListRaw) ? grantListRaw : [grantListRaw];
                for (const kw of grantList) {
                    const name = (typeof kw === "string" ? kw : kw?.name) || "";
                    const options = (typeof kw === "object" ? kw : undefined);
                    if (name)
                        applyKeyword(target, name, options);
                }
            }
            // NEW: notify when a positive buff is applied to a follower on the field
            if ((a > 0 || d > 0) && (state.blueBoard.includes(target) || state.redBoard.includes(target))) {
                import("@logic/core/triggers.js").then(({ fireTrigger }) => {
                    fireTrigger("self_buffed_up", owner, { target });
                });
            }
            // Fire "enemy_follower_defense_down" if we actually reduced DEF on an enemy follower
            if (d < 0 && target?.type === "Follower") {
                const targetOwner = state.blueBoard.includes(target) ? "blue" :
                    state.redBoard.includes(target) ? "red" : null;
                const debufferOwner = owner; // the player executing this buff/debuff op
                if (targetOwner && debufferOwner) {
                    import("@logic/core/triggers.js").then(({ fireTrigger }) => {
                        fireTrigger("enemy_follower_defense_down", debufferOwner, { target });
                    });
                }
            }
        }
        // Remove anything that dropped to 0 or less
        cleanupDead();
        return "done";
    }
    const a = parseInt(eff.attack ?? 0) || 0;
    const d = parseInt(eff.defense ?? 0) || 0;
    for (const target of pool) {
        if (!target.buffs)
            target.buffs = { attack: 0, defense: 0 };
        target.buffs.attack += a;
        target.buffs.defense += d;
        // @ts-ignore
        target.attack = (parseInt(target.attack) || 0) + a;
        // @ts-ignore
        target.defense = (parseInt(target.defense) || 0) + d;
        // @ts-ignore
        target.peak_defense = Math.max(target.peak_defense ?? target.defense, target.defense);
        // @ts-ignore
        if (!target.potential_attack)
            target.potential_attack = target.base_attack || target.attack;
        // @ts-ignore
        if (!target.potential_defense)
            target.potential_defense = target.base_defense || target.defense;
        target.potential_attack += a;
        target.potential_defense += d;
        logEvent("buff", { owner, target: target.name, uid: target.uid, a: a, d: d, mode: "all" });
        // + Optional: grant keywords to exactly these buffed targets
        const grantListRaw = eff.keywords || eff.keyword || null;
        if (grantListRaw) {
            const grantList = Array.isArray(grantListRaw) ? grantListRaw : [grantListRaw];
            for (const kw of grantList) {
                const name = (typeof kw === "string" ? kw : kw?.name) || "";
                const options = (typeof kw === "object" ? kw : undefined);
                if (name)
                    applyKeyword(target, name, options);
            }
        }
        // NEW: notify when a positive buff is applied to a follower on the field
        if ((a > 0 || d > 0) && (state.blueBoard.includes(target) || state.redBoard.includes(target))) {
            import("@logic/core/triggers.js").then(({ fireTrigger }) => {
                fireTrigger("self_buffed_up", owner, { target });
            });
        }
        // Fire "enemy_follower_defense_down" if we actually reduced DEF on an enemy follower
        if (d < 0 && target?.type === "Follower") {
            const targetOwner = state.blueBoard.includes(target) ? "blue" :
                state.redBoard.includes(target) ? "red" : null;
            const debufferOwner = owner; // the player executing this buff/debuff op
            if (targetOwner && debufferOwner) {
                import("@logic/core/triggers.js").then(({ fireTrigger }) => {
                    fireTrigger("enemy_follower_defense_down", debufferOwner, { target });
                });
            }
        }
    }
    // Remove anything that dropped to 0 or less
    cleanupDead();
    return "done";
}
export function handleBuffHandTribe(eff, owner) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const a = parseInt(eff.attack ?? 0) || 0;
    const d = parseInt(eff.defense ?? 0) || 0;
    for (const card of hand) {
        if (card.type === "Follower" && Array.isArray(card.tribes) && card.tribes.includes(eff.tribe)) {
            if (!card.buffs)
                card.buffs = { attack: 0, defense: 0 };
            card.buffs.attack += a;
            card.buffs.defense += d;
            // @ts-ignore
            card.attack = (parseInt(card.attack) || 0) + a;
            // @ts-ignore
            card.defense = (parseInt(card.defense) || 0) + d;
            // keep previews coherent
            // @ts-ignore
            card.potential_attack = (card.potential_attack ?? card.base_attack ?? card.attack) + a;
            // @ts-ignore
            card.potential_defense = (card.potential_defense ?? card.base_defense ?? card.defense) + d;
            logEvent("buffHand", { owner, target: card.name, uid: card.uid, a: a, d: d, filter: eff.tribe });
        }
    }
}
export function handleBuffHandClass(eff, owner) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const a = parseInt(eff.attack ?? 0) || 0;
    const d = parseInt(eff.defense ?? 0) || 0;
    const wantClass = String(eff.class || "").trim();
    if (!wantClass)
        return;
    for (const card of hand) {
        if (card.type === "Follower" && card.class === wantClass) {
            if (!card.buffs)
                card.buffs = { attack: 0, defense: 0 };
            card.buffs.attack += a;
            card.buffs.defense += d;
            // @ts-ignore
            card.attack = (parseInt(card.attack) || 0) + a;
            // @ts-ignore
            card.defense = (parseInt(card.defense) || 0) + d;
            // keep previews coherent
            // @ts-ignore
            card.potential_attack = (card.potential_attack ?? card.base_attack ?? card.attack) + a;
            // @ts-ignore
            card.potential_defense = (card.potential_defense ?? card.base_defense ?? card.defense) + d;
            logEvent("buffHand", { owner, target: card.name, uid: card.uid, a: a, d: d, filter: wantClass });
        }
    }
}
function hasKeyword(card, kw) {
    const k = String(kw || "").toLowerCase();
    if (k === "ward" && card.hasWard)
        return true;
    if (k === "rush" && card.hasRush)
        return true;
    if (k === "storm" && card.hasStorm)
        return true;
    if (k === "bane" && card.hasBane)
        return true;
    if (k === "ambush" && card.hasAmbush)
        return true;
    if (k === "aura" && card.hasAura)
        return true;
    if (k === "drain" && card.hasDrain)
        return true;
    if (k === "intimidate" && card.hasIntimidate)
        return true;
    if (k === "lastwords" && card.hasLastWords)
        return true;
    if (Array.isArray(card.keywords)) {
        return card.keywords.some(w => (typeof w === "string" && String(w).toLowerCase() === k) ||
            (w && typeof w === "object" && String(w.name || "").toLowerCase() === k));
    }
    return false;
}
export function handleBuffLastAddedToHand(eff, owner) {
    const card = state.lastAddedToHand;
    if (!card)
        return;
    const a = parseInt(eff.attack ?? 0) || 0;
    const d = parseInt(eff.defense ?? 0) || 0;
    // Ensure base stats stay as the printed values
    // @ts-ignore
    if (card.base_attack == null)
        card.base_attack = parseInt(card.attack) || 0;
    // @ts-ignore
    if (card.base_defense == null)
        card.base_defense = parseInt(card.defense) || 0;
    if (!card.buffs)
        card.buffs = { attack: 0, defense: 0 };
    card.buffs.attack += a;
    card.buffs.defense += d;
    // @ts-ignore
    card.attack = (parseInt(card.attack) || 0) + a;
    // @ts-ignore
    card.defense = (parseInt(card.defense) || 0) + d;
    card.potential_attack = card.base_attack + card.buffs.attack;
    card.potential_defense = card.base_defense + card.buffs.defense;
    logEvent("buffLastAddedToHand", { owner, name: card.name, uid: card.uid, a: a, d: d });
}
// Repeat a single buff once per current Combo (plays this turn).
// With replacement: we call handleBuff separately each time, so the same
// random target can be chosen again on later iterations.
export function handleComboRepeatBuff(eff, owner, sourceCard, effectsQueue = [], context = {}) {
    const plays = owner === "blue" ? (state.bluePlaysThisTurn || 0)
        : (state.redPlaysThisTurn || 0);
    if (plays <= 0)
        return;
    logEvent("comboRepeatBuff", { owner, plays });
    // Build the inner buff op from the wrapper fields
    const inner = {
        op: "buff",
        target: eff.target, // e.g. "enemy:follower"
        random: eff.random, // true
        count: eff.count, // 1
        attack: eff.attack, // 0
        defense: eff.defense, // -1
        include_self: eff.include_self, // optional
        condition: eff.condition // optional
    };
    for (let i = 0; i < plays; i++) {
        const res = handleBuff(inner, owner, sourceCard, effectsQueue, context);
        if (res === "pending")
            return res; // propagate UI selection if ever needed
        // If your engine requires, you can proactively clean up between ticks.
        // cleanupDead(); // (imported at top of buff.js already)
    }
}
// NEW: set all matched targets' attack to a fixed value
export function handleSetAttackTo(eff, owner, sourceCard, effectsQueue, context = {}) {
    const pool = getPool(eff.target, owner, null, eff.condition, context)
        .filter(c => c.type === "Follower");
    if (!pool.length)
        return "done";
    const to = parseInt((eff.value ?? eff.set_to ?? eff.attack_to ?? 0)) || 0;
    for (const target of pool) {
        // @ts-ignore
        const current = parseInt(target.attack) || 0;
        const delta = to - current;
        // ensure buffs container
        if (!target.buffs)
            target.buffs = { attack: 0, defense: 0 };
        // Apply as a buff delta so future math stacks correctly with other effects
        target.buffs.attack += delta;
        // @ts-ignore
        target.attack = current + delta;
        // keep previews coherent
        // @ts-ignore
        if (!target.potential_attack)
            target.potential_attack = target.base_attack || target.attack;
        target.potential_attack += delta;
        logEvent("setAttackTo", { owner, target: target.name, uid: target.uid, to });
    }
    // No deaths to clean here (ATK only), but keep symmetry with other handlers
    return "done";
}
