// src/logic/core/effects/index.ts

import { state } from "../../../core/gameState.js";
// @ts-ignore
import { adapter } from "../../../core/adapter.js";
import { fireTrigger } from "../triggers.js";
import { CardInstance, Effect, Player, GameState } from "../../../core/types.js";


import { handleBanish, handleBanishTargeted, handleBanishDuplicatesFromDeck, handleBanishAllEnemyCopies, handleBanishRandom } from "../../effects/ops/banish.js";
// import { handleHimekaCrestEffect } from "@logic/effects/cards/havencraft/himeka.js"
import { addMaxPP } from "../../pp.js";
import { handleReturnToHand } from "../../effects/ops/bounce.js";
import { handleBuff, handleBuffHandTribe, handleBuffLastAddedToHand, handleBuffHandClass, handleSetAttackTo, handleComboRepeatBuff, handleSetStats } from "../../effects/ops/buff.js";

import { processCrestEvent, handleGainCrest, crestAddCounter, crestSpendCounter } from "../../effects/crest.js";
import { handleChoose } from "../../effects/ops/choose.js";
import { handleAddCounter, handleReduceCountdown, handleIncreaseCountdown } from "../../effects/counters.js";
import {
    handleDamage, handleDamageAll, handleDamageRandom,
    handleDamageSplitSequential, handleDamageFollowerOrLeader,
    handleDamageAllByAlliedGolems, handleDamageSplitFixed,
    handleDamageRandomSelectedDefense,
    handleDamageSplitAllEnemies, handleDamageHighestDefense
} from "../../effects/ops/damage.js";
import { handleReplaceDeck } from "../../effects/deck.js";
import { handleDestroy, handleDestroyHighest, destroyAlliedAmulets, handleDestroyAll, handleDestroyRandom, resolveDestroy } from "../../effects/ops/destroy.js";
// import { handleDragonsign as handleDragonSign } from "@logic/effects/cards/dragoncraft/dragonsign.js";
import { handleDraw, handleDrawAllNamedWithKeyword, handleDrawFiltered, handleAddToHand, handleDrawComboFollower, handleDrawOpponent, handleDrawNamed } from "../../effects/ops/draw.js";
import { consumeEarthSigils } from "../../effects/cards/runecraft/earth.js";
import { handleSelectEvolveGolem } from "../../effects/cards/runecraft/golem.js";
import { handleDiscardSelectHand, handleTransformInHand, handleDiscardAllExceptNamed } from "../../effects/hand.js";
import { handleKeyword, handleRemoveKeyword, handleKeywordSelf, handleConditionalKeyword } from "../keywords.js";
import { handleHealLeader, handleRecoverPP, handleSetMaxHP, handleDynamicHealLeader, handleLeaderBarrierOp, applyLeaderDamage } from "../../effects/leader.js";
import { handleReanimate } from "../../effects/ops/reanimate.js";
import { handleReturnHandToDeck } from "../../effects/ops/returnHandToDeck.js";
import { handleRepeatEffect } from "../../effects/repeat.js";
import { handleEvolveSelf } from "../../effects/ops/evolve.js";
import { handleBuffSelf, handleDestroySelf, handleBanishSelf, handleDynamicBuffSelf } from "../../effects/self.js";
import { spellboostHand, handleSetSpellboostCount } from "../../effects/ops/spellboost.js";
import {
    summonNamed, summonRandomFromDeck, handleSelectHandSummonArtifactCopiesEOT, summonExactCopyFromHand, handleSelectHandSummonArtifactCopy,
    summonExactCopy, handleSummonDestroyedAmuletHighestBaseCost
} from "../../effects/ops/summon.js";
import {
    handleSuperEvoGate, handleEvolvedSelfGate, amuletCountGate, hasNoDuplicatesInDeck, noAllyAttackedThisTurn,
    handleBoardNameGate, handleBothMaxPPGate, handleRallyGate, handleSelfCostGate, handleSuperEvolvedAlliedGate,
    handleMaxPPGate
} from "../../effects/gates/gates.js";
import { handleSelect, getPool, highlightSelectable, clearSelectableFlags } from "../targeting.js";
import { handleComboAdd, handleComboGate } from "../../effects/gates/combo.js";
import { handleReduceCostSelf, handleReduceCost, handleSetCostSelf, applyTempOpponentHandCostMod, handleHalveDeckCost, handleModifyCost, handleModifyCostPool, reduceDeckFollowersCost } from "../../effects/cost.js";
import { cleanupDead } from "../cleanup.js";
import { isOverflow } from "../../../helpers/overflow.js";
import { hasNecromancy, spendShadows } from "../../../helpers/necromancy.js";
import { onEvolve } from "../../evolveUtils.js";
import { recordEvent } from "../../../core/debugTimeline.js";
import { applyAttacksPerTurn } from "../../effects/attacks.js";
import { opStartFuseFromCard, startFortifierFuse } from "../../effects/ops/fuse/fuse.js";
import { handCountGate } from "../../effects/gates/handCountGate.js";
import { transformTarget, transformRandomSpellInHand } from "../../effects/ops/transform.js";
import { handleFillBoardChainDecay as handleFillCongregantCopies } from "../../effects/ops/summon.js";
import {
    handleDestroyAlliedAmuletsThenDamage,
    handleDamageEnemyLeaderByOtherAllies,
    handleDestroyRandomOtherAllies,
    handleRestoreFullDefenseSelf,
    handleRestoreSelfAndHealLeader,
    handleChooseBonusAdd,
    handleGainMaxPP,
    handleSetCostLastDrawn
} from "../../effects/ops/misc.js";


import { logEvent } from "../../../core/logger.js";




// --- Core Wrappers (Unchanged) ---
/**
 * Triggers fanfare effects for a card.
 * @param {object} card - The card with potential fanfare effects.
 * @param {string} owner - "blue" or "red".
 */
export function onFanfare(card: CardInstance, owner: Player) {
    const list = card.fanfare || [];
    if (Array.isArray(list) && list.length) runEffects([...list], owner, card);
}

function handleAddShadows(eff: Effect, owner: Player) {
    const amt = (eff.amount || 1) as number;
    if (owner === "blue") state.blueShadows = (state.blueShadows || 0) + amt;
    else state.redShadows = (state.redShadows || 0) + amt;
}

function getEffectiveCost(card: CardInstance) {
    // @ts-ignore
    if (Number.isFinite(card.effectiveCost)) return card.effectiveCost;
    const base = parseInt(card?.cost as string, 10) || 0;
    const mod = parseInt((card as any)?.cost_mod, 10) || 0;
    return base + mod;
}

// Notify (event-only) that a Loot spell was played.
// Keeps evolveEffects generic; cards listen via triggers (event: "loot_played").
function notifyLootPlayed(owner: Player, sourceCard: CardInstance | null) {
    if (!sourceCard) return;
    const isLoot =
        Array.isArray(sourceCard.tribes) &&
        sourceCard.tribes!.some(t => String(t).toLowerCase() === "loot");
    if (!isLoot) return;
    fireTrigger("loot_played", owner, { source: "play", kind: "loot", playedCard: sourceCard });
}



// --- The Master Effect Runner ---
/**
 * Main effect dispatcher. Processes a queue of effects sequentially.
 * @param {Array<object>} effects - Array of effect objects to process.
 * @param {string} owner - "blue" or "red".
 * @param {object|null} sourceCard - The card initiating the effects.
 * @param {object} [context={}] - Shared context for targeting and chaining.
 */
export function runEffects(effects: Effect[], owner: Player, sourceCard: CardInstance | null, context?: any) {
    if (!effects || effects.length === 0) return;

    // We do NOT stop execution if one fails; we process queue.
    // However, some effects might queue more effects (loops possible).

    // Create a local queue copy unless we want depth-first? 
    // Usually shadowverse is depth-first for some triggers, but immediate for fanfare.
    // The current implementation shifts from the passed array directly if it is the queue?
    // Let's assume 'effects' is a fresh array of instructions to run.

    // In this engine, runEffects is often called with a fresh array property like card.fanfare.
    // modifying that array would be bad. We should clone it to a queue or iterate.
    // Existing logic usually assumes recursive calls or managing a stack in gameState if complex.
    // For now, simple iteration.

    const queue = [...effects]; // Shallow copy to process

    while (queue.length > 0) {
        const eff = queue.shift()!;

        recordEvent({ type: "run_effect", payload: { op: eff.op, owner, source: sourceCard?.name } });

        // --- Gate Checks & Expansions ---
        // Some ops are "gates" that expand into other effects or conditional effects.
        // We handle them first.
        switch (eff.op) {
            case "add_counter": handleAddCounter(eff, owner, sourceCard); break;
            case "add_max_pp": addMaxPP(owner, (eff as any).amount || 1); break;
            case "add_selected_copy_to_hand": { const t = context?.selectedCard || (context?.targets?.[0] || null); if (!t || !t.name) break; handleAddToHand({ count: eff.count ?? 1, name: t.name } as any, owner); break; }
            case "add_shadows": handleAddShadows(eff, owner); break;
            case "add_to_hand": handleAddToHand(eff, owner); break;
            case "amulet_count_gate": { const next = amuletCountGate(owner, eff) ? (eff.effects || []) : (eff.else_effects || []); if (next.length) queue.unshift(...next); break; }
            case "attacks_per_turn": applyAttacksPerTurn(eff, sourceCard); break;
            case "banish": if (handleBanishTargeted(eff, owner, queue) === "pending") return; break;
            case "banish_all_enemy_copies": { const target = context?.selectedCard || (context?.targets?.[0] || null); if (target) { handleBanishAllEnemyCopies(owner, target); } break; }
            case "banish_duplicates_from_deck": handleBanishDuplicatesFromDeck(owner); return "done";
            case "banish_random": handleBanishRandom(eff, owner); break;
            case "banish_self": handleBanishSelf(sourceCard as any, owner); break;
            case "both_max_pp_gate": handleBothMaxPPGate(eff, queue); break;
            case "max_pp_gate": handleMaxPPGate(owner, eff, queue); break;
            case "board_name_gate": {
                const board = owner === "blue" ? state.blueBoard : state.redBoard;
                const hasCard = board.some(c => c?.name === eff.name);
                const next = hasCard ? (eff.effects || []) : (eff.else_effects || []);
                if (next.length) queue.unshift(...next);
                break;
            }
            case "buff": { const res = handleBuff(eff as any, owner, sourceCard, [], context); if (res === "pending") return res; break; }
            case "buff_hand_class": handleBuffHandClass(eff, owner); break;
            case "buff_last_added_to_hand": handleBuffLastAddedToHand(eff, owner); break;
            case "buff_self": handleBuffSelf(sourceCard, eff); break;
            case "buff_hand_tribe": handleBuffHandTribe(eff, owner); break;

            case "choose": if (handleChoose(eff, owner, sourceCard, queue) === "pending") return; break;
            case "choose_bonus_add": handleChooseBonusAdd(owner, eff); break;
            case "combo_add": handleComboAdd(owner, eff as any); break;
            case "combo_gate": if (handleComboGate(owner, eff as any)) { effects.unshift(...(eff.effects || [])); } else { effects.unshift(...(eff.else_effects || [])); } break;
            case "combo_repeat_buff": { const res = handleComboRepeatBuff(eff, owner, sourceCard, queue, context); if (res === "pending") return res; break; }
            // Congregant / Generic Chain
            case "congregant_fill_board":
            case "fill_board_chain_decay":
                handleFillCongregantCopies(owner, sourceCard);
                break;
            case "crest_add_counter": { const ok = crestAddCounter(owner, (eff as any).crest || eff.name, (eff as any).counter || "faith", (eff as any).amount ?? 1); break; }
            case "crest_pay_counter": {
                const ok = crestSpendCounter(owner, (eff as any).crest || eff.name, (eff as any).counter || "faith", (eff as any).amount ?? 1);
                // @ts-ignore
                const chain = ok ? (eff.on_success_effects || []) : (eff.on_fail_effects || []);
                if (chain.length) effects.unshift(...chain);
                break;
            }
            case "damage": if (handleDamage(eff as any, owner, sourceCard, queue, context) === "pending") return; break;
            case "damage_all": handleDamageAll(eff as any, owner, sourceCard); break;
            case "damage_all_by_allied_golems": handleDamageAllByAlliedGolems(eff, owner); break;
            case "damage_enemy_leader_by_other_allies": handleDamageEnemyLeaderByOtherAllies(owner, sourceCard!); break;
            case "damage_follower_or_leader": if (handleDamageFollowerOrLeader(eff, owner, sourceCard, queue) === "pending") return; break;
            case "damage_highest_defense": handleDamageHighestDefense(eff, owner, sourceCard); break;
            case "damage_random": handleDamageRandom(eff as any, owner); break;
            case "damage_random_selected_defense": handleDamageRandomSelectedDefense(eff, owner, sourceCard, queue, context); break;
            case "damage_self": {
                if (sourceCard && sourceCard.type === "Follower") {
                    import('../../core/barrier.js').then(({ dealDamage }) => {
                        dealDamage(sourceCard, (eff.amount || 0) as number);
                        import('../../core/cleanup.js').then(({ cleanupDead }) => cleanupDead());
                    });
                }
                break;
            }
            case "damage_split_all_enemies": handleDamageSplitAllEnemies(eff, owner, sourceCard); break;
            case "damage_split_fixed": handleDamageSplitFixed(eff, owner, sourceCard); break;
            case "damage_split_sequential": handleDamageSplitSequential(eff, owner); break;
            case "destroy": if (handleDestroy(eff, owner, queue, context, sourceCard) === "pending") return; break;
            case "destroy_all": handleDestroyAll(eff, owner, sourceCard, context); break;
            case "destroy_allied_amulets_then_damage": handleDestroyAlliedAmuletsThenDamage(owner); break;
            case "destroy_defender_if_damaged": {
                const t = context?.defender;
                if (!t) break;

                const current = parseInt(t.defense) || 0;
                // @ts-ignore
                const base = Number.isFinite(t.peak_defense)
                    ? t.peak_defense
                    // @ts-ignore
                    : Number.isFinite(t.base_defense)
                        ? t.base_defense
                        : current;

                if (current < base) {
                    // Respect cannotBeDestroyed + super-protect
                    resolveDestroy(t, owner);
                    cleanupDead();
                }
                break;
            }
            case "destroy_highest": handleDestroyHighest(eff, owner); break;
            case "destroy_random": handleDestroyRandom(eff, owner, context); break;
            case "destroy_random_other_allies": handleDestroyRandomOtherAllies(owner, sourceCard!, context); break;
            case "destroy_self": handleDestroySelf(sourceCard); cleanupDead(); break;
            case "destroy_then": {
                const destroyed = handleDestroy(eff, owner, [], context, sourceCard);
                if (destroyed === "pending") return destroyed;
                if (typeof destroyed === "number" && destroyed > 0) {
                    if (Array.isArray(eff.effects)) effects.unshift(...eff.effects!);
                }
                break;
            }
            case "discard_all_except_named": handleDiscardAllExceptNamed(eff, owner); break;
            case "discard_select_hand": if (handleDiscardSelectHand(eff, owner, queue) === "pending") return; break;
            case "double_stats_allies": { return import("../../effects/doubleStats.js").then(({ doubleStatsAllies }) => { doubleStatsAllies(owner); }); }
            case "draw": handleDraw(eff, owner); break;
            case "draw_all_named_with_keyword": handleDrawAllNamedWithKeyword(eff, owner); break;
            case "draw_combo_follower": handleDrawComboFollower(eff, owner); break;
            case "draw_filtered": handleDrawFiltered(eff, owner); break;
            case "draw_named": handleDrawNamed(eff, owner); break;
            case "draw_opponent": handleDrawOpponent(eff, owner); break;
            case "dynamic_buff_self": handleDynamicBuffSelf(sourceCard, eff as any, owner); break;
            case "dynamic_heal_leader": handleDynamicHealLeader(owner, eff); logEvent("healLeader", { owner, amount: eff.amount }); break;
            case "earth_rite": if (consumeEarthSigils(owner, (eff as any).cost || 1)) queue.unshift(...(eff.effects || [])); break;
            case "evolved_self_gate": handleEvolvedSelfGate(eff, owner, sourceCard!, queue); break;
            case "evolve_all_unevolved_allies": {
                const board = owner === "blue" ? state.blueBoard : state.redBoard;
                for (const ally of board) {
                    if (ally.type === "Follower" && !ally.hasEvolved) {
                        // evolve now, run evolve effects, do NOT consume evo points
                        handleEvolveSelf(ally, owner, { spendPoint: false });
                    }
                }
                logEvent("evolve", { owner, card: "(multi)" });
                break;
            }
            case "evolve_self": handleEvolveSelf(sourceCard, owner); logEvent("evolve", { owner, card: sourceCard?.name }); break;
            case "fill_congregant_copies": handleFillCongregantCopies(owner, sourceCard); break;
            case "follower_strike_destroy": if (sourceCard && context?.defender) { resolveDestroy(context.defender, owner); cleanupDead(); } break;
            case "fuse_finalize_fortifier": logEvent("fuse", { owner, op: eff.op, source: sourceCard?.name }); break;
            case "fuse_start": if (opStartFuseFromCard(eff, owner) === "pending") return; break;
            case "gain_crest": handleGainCrest(eff, owner); logEvent("gainCrest", { owner, crest: eff.name }); break;
            case "gain_max_pp": handleGainMaxPP(owner, eff); break;
            case "halve_deck_cost": handleHalveDeckCost(owner); break;
            case "hand_count_gate": { const pass = handCountGate(owner, eff); const next = pass ? (eff.effects || []) : (eff.else_effects || []); if (next.length) effects.unshift(...next); break; }
            case "heal_leader": { handleHealLeader(owner, eff); logEvent("healLeader", { owner, amount: eff.amount }); const targetOwner = (eff.player || "self") === "self" ? owner : (owner === "blue" ? "red" : "blue"); const fx = processCrestEvent(targetOwner, "heal_leader"); if (fx.length) { effects.unshift(...fx); } break; }
            case "grant_trigger": {
                const targets = (context?.targets && context.targets.length) ? context.targets : (sourceCard ? [sourceCard] : []);
                for (const t of targets) {
                    if (!t || !eff.trigger) continue;
                    if (!Array.isArray(t.triggers)) t.triggers = [];
                    // Inject trigger
                    t.triggers.push(eff.trigger);
                }
                break;
            }
            case "himeka_crest_effect": console.warn("Legacy himeka op used"); break;
            case "increase_countdown": { const amt = Number(eff.amount ?? 1); handleIncreaseCountdown(owner, amt); break; }
            case "increase_opponent_hand_cost_eot": { const amt = parseInt(String(eff.amount ?? 1)) || 1; applyTempOpponentHandCostMod(owner, amt); break; }

            case "keyword": { const merged = { ...(context || {}), sourceCard }; if (handleKeyword(eff as any, owner, queue, merged) === "pending") return; break; }
            case "keyword_self": { const target = sourceCard || (Array.isArray(state.lastSummoned) ? state.lastSummoned[0] : null); handleKeywordSelf(target!, eff); break; }

            case "leader_barrier": { handleLeaderBarrierOp(owner, eff); break; }
            case "modify_cost": handleModifyCost(eff, owner, sourceCard, context); break;
            case "modify_cost_pool": handleModifyCostPool(eff, owner, sourceCard); break;
            case "necromancy_gate": if (hasNecromancy(owner, (eff as any).cost || 1)) { const cost = (eff as any).cost || 1; spendShadows(owner, cost); logEvent("necromancySpend", { owner, cost }); effects.unshift(...(eff.effects || [])); } break;
            case "nested_effects": if (eff.effects?.length) queue.unshift(...eff.effects); break;
            case "no_ally_attacked_this_turn_gate": {
                const pass = noAllyAttackedThisTurn(owner);
                const next = pass ? (eff.effects || []) : (eff.else_effects || []);
                if (next.length) effects.unshift(...next);
                break;
            }
            case "no_duplicates_in_deck_gate": { if (hasNoDuplicatesInDeck(owner)) { effects.unshift(...(eff.effects || [])); } break; }
            case "overflow_gate": if (isOverflow(owner)) effects.unshift(...(eff.effects || [])); break;
            case "reanimate": handleReanimate(eff, owner); break;
            case "rally_gate": handleRallyGate(owner, eff, queue); break;
            case "recover_pp": handleRecoverPP(owner, eff); break;
            case "repeat_effect": handleRepeatEffect(eff, owner, sourceCard, queue); break;
            case "reduce_cost": { const target = (context && (context.targetCard || context.selectedCard)) || sourceCard; handleReduceCost(target!, eff); break; }
            case "reduce_cost_self": handleReduceCostSelf(sourceCard, eff); break;
            case "reduce_countdown": handleReduceCountdown(sourceCard, eff); break;
            case "reduce_deck_followers_cost": { const amt = parseInt(String(eff.amount ?? 1)) || 1; reduceDeckFollowersCost(owner, amt); break; }
            case "remove_keyword": if (handleRemoveKeyword(eff as any, owner) === "pending") return; break;
            case "replace_deck": handleReplaceDeck(owner, eff); break;
            case "replace_deck_with_set_minus": { import("../../effects/deck.js").then(({ replaceDeckWithSetMinus }) => { replaceDeckWithSetMinus(owner, eff).then(() => adapter.render()); }); break; }
            case "restore_full_defense_self": handleRestoreFullDefenseSelf(sourceCard!, context); break;
            case "restore_self_and_heal_leader": handleRestoreSelfAndHealLeader(owner, sourceCard!); break;
            case "return_hand_to_deck": if (handleReturnHandToDeck(eff, owner, queue) === "pending") return; break;
            case "return_to_hand": if (handleReturnToHand(eff, owner, sourceCard, queue) === "pending") return; break;
            case "select": { const res = handleSelect(eff, owner, sourceCard, queue, context); if (res === "pending") return res; break; }
            case "select_evolve_golem": if (handleSelectEvolveGolem(eff, owner, sourceCard, queue) === "pending") return; break;
            case "select_hand_summon_artifact_copy": logEvent("summon", { owner, op: eff.op, status: "pending_selection" }); if (handleSelectHandSummonArtifactCopy(eff, owner, queue) === "pending") return; break;
            case "select_hand_summon_artifact_copies_eot_destroy": logEvent("summon", { owner, op: eff.op, status: "pending_selection" }); if (handleSelectHandSummonArtifactCopiesEOT(eff, owner, queue) === "pending") return; break;
            case "set_attack_to": { const res = handleSetAttackTo(eff, owner, sourceCard, queue, context); if (res === "pending") return res; break; }
            case "set_deckout_victory": { const enable = (eff as any).enabled !== false; if (owner === "blue") state.deckoutWinsBlue = enable; else state.deckoutWinsRed = enable; break; }
            case "set_max_hp": handleSetMaxHP(eff, owner); break;
            case "spellboost_hand": spellboostHand(owner, eff as any); break;
            case "spellboost_target": if (sourceCard) { spellboostHand(owner, 1, sourceCard); } break;
            case "start_fortifier_fuse": { const res = sourceCard ? startFortifierFuse(owner, sourceCard) : null; if (res === "pending") return res; logEvent("fuse", { owner, op: eff.op, source: sourceCard?.name }); break; }
            case "start_fuse_from_card": { if (opStartFuseFromCard(eff, owner) === "pending") return; logEvent("fuse", { owner, op: eff.op, source: sourceCard?.name }); break; }
            case "self_cost_gate": handleSelfCostGate(sourceCard!, eff, effects); break;
            case "set_attack_to": { const res = handleSetAttackTo(eff, owner, sourceCard, effects, context); if (res === "pending") return res; break; }
            case "set_stats": { const res = handleSetStats(eff, owner, sourceCard, effects, context); if (res === "pending") return res; break; }
            case "set_cost_last_drawn": handleSetCostLastDrawn(eff); break;
            case "set_cost_self": handleSetCostSelf(sourceCard, eff); break;
            case "set_cost_self": handleSetCostSelf(sourceCard, eff); break;
            case "super_evo_gate": if (handleSuperEvoGate(owner)) { effects.unshift(...(eff.effects || [])); } break;
            case "super_evolve_ally": { import("../../evolveUtils.js").then(({ superEvolveAllyFromContext }) => { superEvolveAllyFromContext(owner, sourceCard, context); }); break; }
            case "super_evolved_allied_gate": handleSuperEvolvedAlliedGate(owner, eff, queue); break;
            case "super_evolve_self": handleEvolveSelf(sourceCard, owner, { mode: "super", spendPoint: false }); break;
            case "super_evolved_self_gate": { const isSuper = sourceCard && sourceCard.evoType === "super"; const next = (isSuper ? eff.effects : eff.else_effects) || []; if (next.length) { effects.unshift(...next); } break; }
            case "summon_destroyed_amulet_highest_base_cost": handleSummonDestroyedAmuletHighestBaseCost(owner); logEvent("summon", { owner, name: "(highest cost destroyed amulet)" }); break;
            case "summon_exact_copy": {
                // NEW: support "self" directly
                if (eff.target === "self" && sourceCard && sourceCard.type === "Follower") {
                    summonExactCopy(sourceCard, owner);
                    logEvent("summon", { owner, name: sourceCard.name });
                    break;
                }

                // Use already selected target(s) if present; else build pool
                const targets = (context?.targets && context.targets.length)
                    ? context.targets
                    : getPool((eff as any).target, owner, sourceCard, (eff as any).condition, context);
                const times = Math.max(1, parseInt(eff.count as any ?? 1, 10));
                for (const t of targets) {
                    if (t?.type !== "Follower") continue;
                    for (let i = 0; i < times; i++) {
                        summonExactCopy(t, owner);
                        logEvent("summon", { owner, name: t.name });
                    }
                }
                break;
            }
            case "summon_named": summonNamed(eff as any, owner); logEvent("summon", { owner, name: eff.name }); break;
            case "summon_named_enemy": { const foe = (owner === "blue") ? "red" : "blue"; summonNamed({ op: "summon_named", name: eff.name, count: eff.count || 1 } as any, foe); logEvent("summon", { owner: foe, name: eff.name }); break; }
            case "summon_random_from_deck": summonRandomFromDeck(eff, owner); logEvent("summon", { owner, name: "(random from deck)" }); break;
            case "transform": {
                const into = String((eff as any).into || eff.name || "").trim();
                // Prefer the selected target from a preceding select()
                const t = (context && (context.selectedCard || context.targetCard)) || null;
                if (!into) break;
                if (t) {
                    transformTarget(t, into);
                } else if (sourceCard && (eff as any).target === "self") {
                    // optional: allow self-transform if explicitly requested
                    transformTarget(sourceCard, into);
                } else {
                    console.warn("transform: no target in context; use via select{...}");
                }
                break;
            }
            case "transform_in_hand": handleTransformInHand(eff, owner); break;
            case "transform_random_spell_in_hand": { transformRandomSpellInHand(owner, (eff as any).into || "Ersatz Elimination"); break; }
            case "transform_self_if_spellboost_at_least": return;
            case "set_spellboost_count": handleSetSpellboostCount(eff, sourceCard!); break;


            default:
                console.warn(`UNKNOWN EFFECT OPERATION: ${eff.op}`);
                break;
        }
    }

    // A single, reliable render call after all synchronous effects are done.
    adapter.render();
}
