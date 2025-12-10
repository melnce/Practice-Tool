// src/ui/helpers/glow.ts
import { isOverflow } from "@helpers/overflow.js";
import { comboReadyInHand } from "@helpers/combo.js";
import { hasNecromancy } from "@helpers/necromancy.js";
import { getPool } from "@logic/core/targeting.js";
// @ts-ignore
import { handleSuperEvoGate } from "@logic/effects/gates/gates.js";
// ---- local helpers ported from zones.js ----
function getSpellboostCount(card) {
    if (!card || typeof card !== "object")
        return null;
    const hasSpellboost = Array.isArray(card.keywords) &&
        card.keywords.some(k => (typeof k === "string" ? k : k?.name)?.toLowerCase?.() === "spellboost");
    if (!hasSpellboost)
        return null;
    for (const k of ["spellboostCount", "spellBoostCount", "spellboosts", "spell_boosts", "spellboost_counter"]) {
        // @ts-ignore
        const v = card[k];
        if (Number.isFinite(Number(v)))
            return Number(v);
    }
    return 0;
}
function earthRiteCostInFanfare(effects) {
    if (!Array.isArray(effects))
        return 0;
    const scan = (effs) => {
        let best = Infinity;
        for (const e of effs) {
            if (!e || typeof e !== "object")
                continue;
            if (e.op === "earth_rite") {
                const c = Math.max(1, Number(e.cost ?? 1) || 1);
                best = Math.min(best, c);
            }
            if (Array.isArray(e.effects))
                best = Math.min(best, scan(e.effects));
            if (e.op === "choose" && Array.isArray(e.options)) {
                for (const opt of e.options) {
                    const req = opt?.requires || {};
                    const c = Number(req.earth_rite ?? req.earth ?? 0);
                    if (c > 0)
                        best = Math.min(best, c);
                    if (Array.isArray(opt.effects))
                        best = Math.min(best, scan(opt.effects));
                }
            }
        }
        return best;
    };
    const r = scan(effects);
    return Number.isFinite(r) ? r : 0;
}
function hasEarthOnBoard(state, owner, n = 1) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    return board.some(c => c?.type === "Amulet" && Number(c?.counters?.earth) >= n);
}
function hasOverflowInTree(effs) {
    if (!Array.isArray(effs))
        return false;
    for (const e of effs) {
        if (!e || typeof e !== "object")
            continue;
        if (e.op === "overflow_gate" || e.amount_overflow !== undefined || e.overflow_amount !== undefined)
            return true;
        if (Array.isArray(e.effects) && hasOverflowInTree(e.effects))
            return true;
        if (e.op === "choose" && Array.isArray(e.options)) {
            if (e.options.some((opt) => hasOverflowInTree(opt.effects || [])))
                return true;
        }
    }
    return false;
}
function hasSuperEvoAllyOnBoard(state, owner) {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    return board.some(c => c?.type === "Follower" && c.hasEvolved && c.evoType === "super");
}
function needsUnmetTarget(list, owner, card) {
    if (!Array.isArray(list))
        return false;
    for (const eff of list) {
        if (!eff || typeof eff !== "object")
            continue;
        if (eff.op === "overflow_gate") {
            if (isOverflow(owner) && needsUnmetTarget(eff.effects, owner, card))
                return true;
            continue;
        }
        if (eff.op === "select_hand_summon_artifact_copies_eot_destroy") {
            continue; // custom op that selects from hand
        }
        if (eff.select) {
            const pool = getPool(eff.target, owner, null, eff.condition || {}, { isTargetedEffect: true });
            if (!pool || pool.length === 0)
                return true;
        }
        if (eff.op === "stormy_blast_damage" || (card?.name && card.name.toLowerCase() === "snowman army")) {
            // needs enemy follower
            // owner here is "blue"/"red"
            const stateAny = state; // Need access to opponent board from state if card.__state missing
            const enemyBoard = owner === "blue" ? stateAny.redBoard : stateAny.blueBoard;
            const hasEnemyFollower = Array.isArray(enemyBoard) && enemyBoard.some((c) => c.type === "Follower");
            if (!hasEnemyFollower)
                return true;
        }
        if (Array.isArray(eff.effects) && needsUnmetTarget(eff.effects, owner, card))
            return true;
        if (eff.op === "choose" && Array.isArray(eff.options)) {
            const allBlocked = eff.options.every((opt) => needsUnmetTarget(opt.effects || [], owner, card));
            if (allBlocked)
                return true;
        }
    }
    return false;
}
// ---- main exported API ----
/**
 * Compute which glow class to apply for a hand card.
 * Returns: { glowClass: "enhance-ready" | "playable-glow" | null }
 */
export function computeHandGlow(card, ctx) {
    // ctx: { state, owner, isPlayersTurn, availablePP, isSpell }
    const { state, owner, isPlayersTurn, availablePP, isSpell } = ctx;
    // attach state for some nested checks that need access (snowman army)
    // @ts-ignore
    card.__state = state;
    // cost preview already computed by caller; use card.shownCost if present, else raw cost
    const shownCost = Number(card.shownCost ?? card.cost ?? 0);
    let canAfford = isPlayersTurn && availablePP >= shownCost;
    // ---- board capacity hard block (max 5) ----
    const ownerBoard = owner === "blue" ? state.blueBoard : state.redBoard;
    const isBoardCard = !isSpell && (card?.type === "Follower" || card?.type === "Amulet");
    if (isBoardCard && Array.isArray(ownerBoard) && ownerBoard.filter(Boolean).length >= 5) {
        return { glowClass: null }; // no glow if board is full
    }
    // Spell-specific preconditions
    if (isSpell) {
        const list = Array.isArray(card.spell) && card.spell.length ? card.spell :
            (Array.isArray(card.fanfare) ? card.fanfare : []);
        // Doomwright Resurgence: need >=2 eligible artifacts in hand
        if (card.name === "Doomwright Resurgence") {
            const ownerHand = owner === "blue" ? state.blueHand : state.redHand;
            const getEffectiveCost = (c) => (Number.isFinite(c?.effectiveCost) ? c.effectiveCost :
                (Number(c?.cost) || 0) + (Number(c?.cost_mod) || 0));
            const eligible = ownerHand.filter(c => c?.type === "Follower" &&
                Array.isArray(c?.tribes) && c.tribes.includes("Artifact") &&
                getEffectiveCost(c) <= 5).length;
            if (eligible < 2)
                canAfford = false;
        }
        // Needs ally on board if it returns ally to hand
        const needsAlly = list.some((eff) => eff && eff.select && String(eff.op).toLowerCase() === "return_to_hand" &&
            String(eff.target || "").toLowerCase().startsWith("ally"));
        if (needsAlly) {
            const ownerBoard = owner === "blue" ? state.blueBoard : state.redBoard;
            if (ownerBoard.length === 0)
                canAfford = false;
        }
        // Needs another hand pick (return_hand_to_deck with select)
        const needsHandPick = list.some((e) => String(e.op).toLowerCase() === "return_hand_to_deck" && e.select);
        if (needsHandPick) {
            const ownerHand = owner === "blue" ? state.blueHand : state.redHand;
            if (ownerHand.length <= 1)
                canAfford = false;
        }
        // If all select-targets have no valid pool, block (except when leader is explicitly targetable)
        const canTargetLeader = list.some((eff) => eff?.op === "damage_follower_or_leader" && eff?.can_target_leader);
        if (needsUnmetTarget(list, owner, card) && !canTargetLeader)
            canAfford = false;
        // Radiant Rainbow: require a Spellboost card in hand
        if (card.name && card.name.toLowerCase() === "radiant rainbow") {
            const ownerHand = owner === "blue" ? state.blueHand : state.redHand;
            const hasSB = ownerHand.some(c => Array.isArray(c.keywords) && c.keywords.some(k => (typeof k === "string" ? k : k?.name)?.toLowerCase?.() === "spellboost"));
            if (!hasSB)
                canAfford = false;
        }
    }
    // gates that upgrade to yellow glow
    const comboReady = isPlayersTurn && comboReadyInHand(card, owner, state);
    const tier = ctx.tier ?? null; // caller may pass
    const enhanceReady = isPlayersTurn && !!tier;
    const fusedAllureReady = isPlayersTurn &&
        card?.name === "Garden's Allure" &&
        card?.isFused === true;
    const fusedSlashReady = isPlayersTurn &&
        card?.name === "Returning Slash" &&
        card?.isFused === true;
    // Earth Rite
    const erCost = earthRiteCostInFanfare(Array.isArray(card.fanfare) && card.fanfare.length ? card.fanfare :
        (Array.isArray(card.spell) ? card.spell : []));
    const earthReady = isPlayersTurn && erCost > 0 && hasEarthOnBoard(state, owner, erCost);
    // Overflow
    const hasOverflowEffects = hasOverflowInTree(Array.isArray(card.fanfare) ? card.fanfare : []) ||
        hasOverflowInTree(Array.isArray(card.spell) ? card.spell : []);
    const overflowReady = isPlayersTurn && hasOverflowEffects && isOverflow(owner);
    // Necromancy
    const hasNecroGate = Array.isArray(card.fanfare) && card.fanfare.some(eff => eff.op === "necromancy_gate");
    const necromancyReady = isPlayersTurn && hasNecroGate &&
        hasNecromancy(owner, card.fanfare.find(eff => eff.op === "necromancy_gate")?.cost || 0);
    // Super-evolved ally gate (generic support)
    const hasSuperEvoGate = ((Array.isArray(card.fanfare) && card.fanfare.some(e => /super[_-]?evo(lved)?_ally(_on_board)?_gate/i.test(e?.op))) ||
        /super[- ]?evolved allied follower/i.test(card?.description || ""));
    // NEW: super-evolution unlock gate (e.g., Cheretta fanfare)
    const hasSuperUnlockGate = Array.isArray(card.fanfare) &&
        card.fanfare.some(e => String(e.op).toLowerCase() === "super_evo_gate");
    const superUnlockReady = isPlayersTurn && hasSuperUnlockGate && handleSuperEvoGate(owner);
    const superEvoReady = hasSuperEvoGate && hasSuperEvoAllyOnBoard(state, owner);
    // hard block
    if (card.cant_play)
        canAfford = false;
    if (!canAfford)
        return { glowClass: null };
    // --- Faith (crest) gate: Sham-Nacha glows when Faith >= 10 ---
    const crests = owner === "blue" ? (state.blueCrests || []) : (state.redCrests || []);
    const faith = (() => {
        const c = crests.find(x => String(x?.name).toLowerCase() === "faith");
        // @ts-ignore
        return Number(c?.counters?.faith ?? 0);
    })();
    const isShamNacha = String(card?.name || "").toLowerCase() === "sham-nacha, heir to entwining";
    const faithReady = isPlayersTurn && isShamNacha && faith >= 10;
    if (enhanceReady ||
        comboReady ||
        earthReady ||
        overflowReady ||
        necromancyReady ||
        superEvoReady ||
        superUnlockReady ||
        fusedAllureReady ||
        fusedSlashReady ||
        faithReady) {
        return { glowClass: "enhance-ready" };
    }
    return { glowClass: "playable-glow" };
}
