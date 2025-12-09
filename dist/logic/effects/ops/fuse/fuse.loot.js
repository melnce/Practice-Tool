// @effects/fuse.loot.js
import { state } from "@core/gameState.js";
import { render } from "@ui/render.js";
import { clearSelectableFlags } from "@logic/core/targeting.js";
import { fireTrigger } from "@logic/core/triggers.js";
import { logEvent } from "@core/logger.js";
function handOf(owner) {
    return owner === "blue" ? state.blueHand : state.redHand;
}
function graveOf(owner) {
    return owner === "blue" ? state.blueGraveyard : state.redGraveyard;
}
function alreadyFusedThisTurn(card) {
    return !!card && card.lastFuseRound === state.roundCount;
}
// Notify 'loot_fused' exactly ONCE per fuse finalize; include initiator for dedupe
function notifyLootFused(owner, initiator, count) {
    if (!count)
        return;
    try {
        fireTrigger?.("loot_fused", owner, { source: "fuse", kind: "loot", initiator, count });
    }
    catch { }
}
// Returning Slash, etc.
export function fuse_finalize_loot(owner, initiator_uid, partners) {
    const hand = handOf(owner);
    const grave = graveOf(owner);
    const initiator = hand.find(c => c?.uid === initiator_uid);
    if (!initiator) {
        clearSelectableFlags();
        render();
        return;
    }
    if (alreadyFusedThisTurn(initiator)) {
        console.warn("[Fuse] This copy already fused this turn.");
        logEvent("fuseBlocked", { owner, reason: "already_fused_this_turn", initiator: initiator?.name });
        clearSelectableFlags();
        render();
        return "done";
    }
    // Only allow actual Loot spells (keep your stricter set if desired)
    const ALLOWED = new Set(["Gilded Blade", "Gilded Goblet", "Gilded Boots", "Gilded Necklace"]);
    const used = (partners || []).filter(p => p?.type === "Spell" &&
        Array.isArray(p?.tribes) && p.tribes.includes("Loot") &&
        ALLOWED.has(p?.name));
    // Track unique fused names on this specific copy (for X = different names use-cases)
    const prev = Array.isArray(initiator._fusedLootNames) ? initiator._fusedLootNames : [];
    const next = new Set(prev.map(String));
    for (const p of used)
        next.add(String(p.name || ""));
    initiator._fusedLootNames = Array.from(next);
    // Consume selected Loot cards
    for (const p of used) {
        const idx = hand.findIndex(c => c?.uid === p.uid);
        if (idx !== -1) {
            const [taken] = hand.splice(idx, 1);
            grave.push(taken);
        }
    }
    logEvent("fuseConsume", {
        owner,
        kind: "loot",
        initiator: initiator.name,
        used: used.map(x => x.name),
    });
    // Fire exactly ONCE per fuse action on this initiator this TURN.
    // A card can only "fuse" once per turn by rule; treat multi-select as a single fuse.
    if (initiator.__lootFuseTurn !== state.roundCount) {
        initiator.__lootFuseTurn = state.roundCount;
        try {
            // Single ping; include count only as metadata (listeners should NOT loop).
            fireTrigger?.("loot_fused", owner, { initiator, kind: "loot", count: used.length });
        }
        catch { }
    }
    // Mutate spell text/effects on this copy
    const baseSpell = [
        { op: "damage_random", target: "enemy:follower", amount: 2 },
        { op: "add_to_hand", name: "Gilded Blade", count: 1 },
    ];
    if (used.length >= 1)
        baseSpell.push({ op: "draw", count: 1 });
    initiator.spell = baseSpell;
    initiator.isFused = used.length >= 1;
    initiator.__lootFuseCount = used.length;
    initiator.lastFuseRound = state.roundCount;
    logEvent("fuseFinalize", {
        owner,
        kind: "loot",
        initiator: initiator.name,
        partners: used.length,
        result: "fused_loot",
    });
    // Bookkeeping
    state.lastFuse = {
        owner,
        initiator_name: initiator?.name,
        partners_count: used.length,
        result_name: "fused_loot",
        targets: "merge",
    };
    try {
        fireTrigger?.("on_fuse", owner, { initiator, partners: used, result: { result_card_name: "fused_loot" } });
    }
    catch { }
    clearSelectableFlags();
    render();
}
