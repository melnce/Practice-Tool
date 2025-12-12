// src/logic/core/playCard.ts
import { state } from "../../core/gameState.js";
import { recordEvent } from "../../core/debugTimeline.js";
// @ts-ignore
// @ts-ignore
import { render } from "../../ui/render.js";
import { applyKeywordsFromList } from "./keywords.js";

const isHeadless = () => (typeof globalThis !== "undefined" && (globalThis as any).HEADLESS);
const safeRender = () => { if (!isHeadless()) render(); };
import { runEffects } from "./effects/index.js";
// @ts-ignore
import { spellboostHand } from "../effects/ops/spellboost.js";
import { getPool } from "./targeting.js";
import { isOverflow } from "../../helpers/overflow.js";
import { fireTrigger } from "./triggers.js";
// @ts-ignore
// import { medicalAssassinOnFollowerEnter } from "@logic/effects/cards/portalcraft/medicalAssassin.js";
// @ts-ignore
// import { handleCongregantOnEnter } from "@logic/effects/cards/forestcraft/congregant.js";
import { logEvent } from "../../core/logger.js";
import { doAction } from "../../core/history.js";
import { CardInstance, Player, Effect } from "../../core/types.js";


function _pushPlayedHistory(owner: Player, card: CardInstance) {
    const entry = {
        id: card?.id,
        uid: card?.uid,
        name: card?.name,
        type: card?.type,
        cost: Number(card?.cost) || 0,
        base_image: card?.base_image || null,
        ts: Date.now()
    };
    if (owner === "blue") state.bluePlayedHistory.push(entry as CardInstance);
    else state.redPlayedHistory.push(entry as CardInstance);
}

function getEffectiveCost(card: CardInstance) {
    if (typeof card.effectiveCost === "number") return card.effectiveCost;
    if (card.cost_mod != null) return (parseInt(String(card.cost), 10) || 0) + (parseInt(String(card.cost_mod), 10) || 0);
    if ((card as any).costModified != null) return parseInt((card as any).costModified, 10) || 0;
    return parseInt(String(card.cost), 10) || 0;
}

function countArtifactsInHand(owner: Player, maxCost = 5) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    if (!Array.isArray(hand)) return 0;
    let n = 0;
    for (const c of hand) {
        if (!c || c.type !== "Follower") continue;
        const tribes = Array.isArray(c.tribes) ? c.tribes.map(t => String(t).toLowerCase()) : [];
        if (!tribes.includes("artifact")) continue;
        if (getEffectiveCost(c) <= maxCost) n++;
    }
    return n;
}

// Add this check function near your other spell validation functions
function spellNeedsArtifactPair(card: CardInstance, player: Player) {
    // Check if this spell uses the artifact copy operation
    const usesArtifactCopyOp =
        Array.isArray((card as any).spell) &&
        (card as any).spell.some((e: any) => e && e.op === "select_hand_summon_artifact_copies_eot_destroy");

    if (usesArtifactCopyOp) {
        return countArtifactsInHand(player, 5) < 2;
    }
    return false;
}

// keep your existing helper
function pickEnhanceTier(card: CardInstance, availablePP: number) {
    const tiers = Array.isArray((card as any)?.enhanceTiers) ? (card as any).enhanceTiers : [];
    if (!tiers.length && Array.isArray((card as any)?.keywords)) {
        const tmp = [];
        for (const k of (card as any).keywords) {
            const name = (typeof k === "string" ? k : k?.name) || "";
            if (name.toLowerCase() === "enhance") {
                const cost = Number(typeof k === "object" ? k.cost : 0);
                const effects = (typeof k === "object" && Array.isArray(k.effects)) ? k.effects : [];
                if (cost > 0) tmp.push({ cost, effects });
            }
        }
        tmp.sort((a: any, b: any) => b.cost - a.cost);
        (card as any).enhanceTiers = tmp;
    }
    for (const t of ((card as any).enhanceTiers || [])) {
        if (availablePP >= t.cost) return t; // highest affordable
    }
    return null;
}

// Put near top or bottom of file
// /gamelogic/playCard.js

function mergeWitchsNewBrewOnPlay(newCard: CardInstance, owner: Player) {
    // only for the Brew amulet
    if ((newCard?.type !== "Amulet") || (String(newCard.name).toLowerCase() !== "witch's new brew")) return;

    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;

    // index of the just-played copy (it was just pushed to board)
    const newIndex = board.lastIndexOf(newCard);
    if (newIndex < 0) return;

    // collect counters from any previous Brew(s) AND Magic Sediments
    const sum: Record<string, number> = {};
    const toRemove = [];

    for (let i = 0; i < board.length; i++) {
        if (i === newIndex) continue;
        const c = board[i];
        if (c && c.type === "Amulet") {
            const cardName = String(c.name).toLowerCase();
            // Check for both Witch's New Brew AND Magic Sediment
            if (cardName === "witch's new brew" || cardName === "magic sediment") {
                // merge all named counters (do NOT merge countdown etc.)
                if ((c as any).counters && typeof (c as any).counters === "object") {
                    for (const [k, v] of Object.entries((c as any).counters)) {
                        sum[k] = (sum[k] || 0) + (Number(v) || 0);
                    }
                }
                toRemove.push(i);
            }
        }
    }

    // nothing to merge
    if (!toRemove.length) return;

    // apply merged counters to the new card
    (newCard as any).counters = (newCard as any).counters || {};
    for (const [k, v] of Object.entries(sum)) {
        (newCard as any).counters[k] = ((newCard as any).counters[k] || 0) + v;
    }

    // remove old copies → grave (destroy them)
    // remove from highest index down so indices stay valid
    toRemove.sort((a, b) => b - a);
    for (const idx of toRemove) {
        grave.push(board.splice(idx, 1)[0]);
        // Increment shadows for the owner
        if (owner === "blue") state.blueShadows++;
        else state.redShadows++;
    }
}


function spellNeedsAllyOnBoard(card: CardInstance, player: Player) { // Player param not used? Re-check logic
    const availablePP = player === "blue" ? state.bluePP : state.redPP;
    const tier = pickEnhanceTier(card, availablePP);

    const baseList =
        (Array.isArray((card as any).spell) && (card as any).spell.length ? (card as any).spell : [])
            .concat(Array.isArray((card as any).fanfare) ? (card as any).fanfare : []);

    const list = (tier && Array.isArray(tier.effects) && tier.effects.length)
        ? tier.effects
        : baseList;

    // Way of the Maid-style requirement: needs to return an ally from board
    return list.some((eff: Effect) =>
        eff &&
        eff.select &&
        String(eff.op).toLowerCase() === "return_to_hand" &&
        String(eff.target || "").toLowerCase().startsWith("ally")
    );
}


function canCastSpell(card: CardInstance, player: Player) {
    const effects = Array.isArray(card.spell) && card.spell.length
        ? card.spell
        : (Array.isArray(card.fanfare) ? card.fanfare : []);

    // Way of the Maid pattern: needs to return another hand card
    const needsHandReturn =
        effects.some((e: Effect) => String(e.op).toLowerCase() === "return_hand_to_deck" && e.select);

    if (needsHandReturn) {
        const hand = player === "blue" ? state.blueHand : state.redHand;
        // spell itself is still in hand here, so we need at least 2 cards
        if (hand.length <= 1) return false;
    }
    return true;
}

function spellNeedsTarget(card: CardInstance, player: Player) {
    const availablePP = player === "blue" ? state.bluePP : state.redPP;
    const tier = pickEnhanceTier(card, availablePP);

    const baseList =
        (Array.isArray((card as any).spell) && (card as any).spell.length ? (card as any).spell : [])
            .concat(Array.isArray((card as any).fanfare) ? (card as any).fanfare : []);

    const list = (tier && Array.isArray(tier.effects) && tier.effects.length)
        ? tier.effects
        : baseList;

    // Allow follower-or-leader effects to be cast without a pre target.
    const hasFollowerOrLeaderEffect = list.some((eff: Effect) =>
        /* eff?.op === "damage_follower_or_leader" && eff?.can_target_leader is not valid TS unless fields exist */
        eff?.op === "damage_follower_or_leader" && (eff as any)?.can_target_leader
    );
    if (hasFollowerOrLeaderEffect) return false;

    const checkArr = (arr: any[]): boolean => {
        for (const eff of arr || []) {
            if (eff?.op === "overflow_gate") {
                if (isOverflow(player) && checkArr(eff.effects)) return true;
                continue;
            }
            // Skip custom ops that handle their own UI
            if (eff?.op === "select_hand_summon_artifact_copies_eot_destroy") continue;

            if (eff?.select) {
                // ✅ Pass the condition + targeted context so Ward filtering applies
                const pool = getPool(
                    eff.target,
                    player,
          /* sourceCard */ null,
          /* condition  */ eff.condition,
          /* context    */ { isTargetedEffect: true }
                );
                if (!pool || pool.length === 0) return true; // needs target but none available
            }

            // Recurse nested effects if present
            if (Array.isArray(eff?.effects) && eff.effects.length) {
                if (checkArr(eff.effects)) return true;
            }
        }
        return false;
    };

    return checkArr(list);
}


function spellNeedsSpellboostTarget(card: CardInstance, player: Player) {
    // Only apply to Radiant Rainbow (or similar effects)
    if (card.name.toLowerCase() !== "radiant rainbow") return false;

    const hand = player === "blue" ? state.blueHand : state.redHand;
    return !hand.some(c =>
        Array.isArray((c as any).keywords) && (c as any).keywords.some((k: any) => {
            const kwName = typeof k === "string" ? k.toLowerCase() : k?.name?.toLowerCase();
            return kwName === "spellboost";
        })
    );
}

function spellNeedsEnemyFollower(card: CardInstance, player: Player) {
    const enemyBoard = player === "blue" ? state.redBoard : state.blueBoard;
    const needsEnemy = (card.name.toLowerCase() === "stormy blast" || card.name.toLowerCase() === "snowman army");
    if (!needsEnemy) return false;

    // Return true if there are NO enemy followers
    return !enemyBoard.some(c => c.type === "Follower");
}


// Internal core so we can wrap with history.doAction
function _playCardCore(fromHand: CardInstance[], player: Player, index: number) {
    // 1) Turn guard
    if ((player === "blue" && !state.isBlueTurn) || (player === "red" && state.isBlueTurn)) return;

    const card = fromHand[index];
    if (!card) return;

    // 0) Can't-play guard
    if (card.cant_play) {
        if (!(globalThis as any).HEADLESS) {
            console.warn(`[cast blocked] ${card.name} cannot be played.`);
        }
        return;
    }

    // ⛔ spell pre-checks BEFORE paying/removing from hand
    if (card.type === "Spell" && !canCastSpell(card, player)) {
        if (!(globalThis as any).HEADLESS) {
            console.warn("[cast blocked] Spell needs a different hand card to return.");
        }
        return;
    }

    // --- NEW: Artifact pair requirement check ---
    if (card.type === "Spell" && spellNeedsArtifactPair(card, player)) {
        if (!(globalThis as any).HEADLESS) {
            console.warn("[cast blocked] Spell requires at least 2 Artifact followers (cost ≤ 5) in hand.");
        }
        return;
    }

    const toBoard = player === "blue" ? state.blueBoard : state.redBoard;
    const toGrave = player === "blue" ? state.blueGraveyard : state.redGraveyard;

    const isFollower = card.type === "Follower";
    const isAmulet = card.type === "Amulet";
    const isSpell = card.type === "Spell";
    const isPermanent = isFollower || isAmulet;

    // New check for spells that require a target.
    if (isSpell && spellNeedsTarget(card, player)) {
        if (!(globalThis as any).HEADLESS) {
            console.warn("Spell requires a target but none are available. Cannot cast.");
        }
        return;
    }
    // --- NEW: Radiant Rainbow check ---
    if (isSpell && spellNeedsSpellboostTarget(card, player)) {
        if (!(globalThis as any).HEADLESS) {
            console.warn("Radiant Rainbow requires a card in hand with Spellboost.");
        }
        return;
    }

    // --- NEW: Stormy Blast check ---
    if (isSpell && spellNeedsEnemyFollower(card, player)) {
        if (!(globalThis as any).HEADLESS) {
            console.warn("Stormy Blast requires an enemy follower on the field.");
        }
        return;
    }


    // 2) Board space check for permanents only
    if (isPermanent && toBoard.length >= 5) return;

    // --- NEW: Spell precondition (Bug Alert style) ---
    if (isSpell && spellNeedsAllyOnBoard(card, player)) { // added player param
        const myBoard = player === "blue" ? state.blueBoard : state.redBoard;
        if (myBoard.length === 0) return; // not castable → do nothing, don't pay
    }

    // 3) Cost / Enhance (hand mod affects BASE only; ENHANCE ignores it)
    const currentPP = player === "blue" ? state.bluePP : state.redPP;
    const handMod = parseInt(String(card.cost_mod)) || 0;
    const baseCost = parseInt(String(card.cost)) || 0;

    // Pick highest affordable tier by *printed* tier cost (no hand mod)
    const chosenTier = pickEnhanceTier(card, currentPP); // uses t.cost <= PP

    // Final effective cost:
    // - Enhanced: pay the tier's printed cost (ignore handMod)
    // - Base: pay (base + handMod)
    const effectiveCost = chosenTier ? chosenTier.cost : (baseCost + handMod);
    if (!(globalThis as any).HEADLESS) {
        logEvent("enhanceDecision", {
            player,
            card: card.name,
            uid: card.uid,
            chosenTierCost: chosenTier ? chosenTier.cost : null,
            effectiveCost
        });
    }

    if (effectiveCost > currentPP) return; // not affordable

    // 4) Pay PP exactly once
    if (player === "blue") state.bluePP -= effectiveCost;
    else state.redPP -= effectiveCost;

    // 5) Remove from hand and count play (matters for Combo glow/effects)
    fromHand.splice(index, 1);
    if (!(globalThis as any).HEADLESS) {
        logEvent("playCard", { player, card: card.name, uid: card.uid });
    }
    if (player === "blue") state.bluePlaysThisTurn = (state.bluePlaysThisTurn || 0) + 1;
    else state.redPlaysThisTurn = (state.redPlaysThisTurn || 0) + 1;

    // 6) Type-specific handling
    if (isSpell) {
        if (!(globalThis as any).HEADLESS) {
            logEvent("spellCast", { player, card: card.name, uid: card.uid, cost: effectiveCost });
        }
        const owner = state.isBlueTurn ? "blue" : "red";
        spellboostHand(owner, 1);

        // Record played history for spells
        _pushPlayedHistory(player, card);

        // Store the card reference BEFORE moving it to grave
        const spellCard = card;

        // Spells never enter board — go straight to grave and resolve once
        toGrave.push(card);
        // Increment shadows for the owner
        if (owner === "blue") state.bluePlaysThisTurn++;
        else state.redPlaysThisTurn++;

        recordEvent({ type: "play_card", payload: { owner, card: card.name, uid: card.uid } });

        // AUTO-EVENT: any Loot spell played → fire 'loot_played'
        const isLootSpell =
            Array.isArray(spellCard.tribes) &&
            spellCard.tribes.some(t => String(t).toLowerCase() === "loot");
        if (isLootSpell) {
            // Guard: if JSON still has a notifier, don't double-emit
            const jsonAlreadyNotifies =
                Array.isArray((spellCard as any).spell) &&
                (spellCard as any).spell.some((e: any) => e && e.op === "notify_loot_played");
            if (!jsonAlreadyNotifies) {
                // Log auto "loot" notification (if any)
                if (!(globalThis as any).HEADLESS) {
                    logEvent("lootPlayed", { player, card: spellCard.name, uid: spellCard.uid });
                }
                fireTrigger("loot_played", owner as any, {
                    source: "play",
                    kind: "loot",
                    playedCard: spellCard
                });
            }
        }

        // FIX: Use enhanced effects if available, otherwise use base spell effects
        let list: Effect[] = [];
        if (chosenTier && Array.isArray(chosenTier.effects) && chosenTier.effects.length) {
            list = [...chosenTier.effects];
        } else {
            list = Array.isArray((card as any).spell) && (card as any).spell.length
                ? [...(card as any).spell]
                : (Array.isArray((card as any).fanfare) ? [...(card as any).fanfare] : []);
        }

        // Pass the spellCard reference instead of null
        if (list.length) runEffects([...list], player, spellCard, { targets: [] });
        else safeRender();
        return;
    }

    // Followers
    if (isFollower) {
        if (!(globalThis as any).HEADLESS) {
            logEvent("followerEnter", { player, card: card.name, uid: card.uid });
        }

        // Record played history for followers
        _pushPlayedHistory(player, card);

        // Snapshot whether the hand cost was modified (for "played" triggers only)
        const printed = Number.isFinite(card.base_cost)
            ? Number(card.base_cost)
            : (parseInt(String(card.cost), 10) || 0);
        const current = parseInt(String(card.cost), 10) || 0;
        const handMod = parseInt(String(card.cost_mod), 10) || 0;
        const costChangedOnPlay = (handMod !== 0) || (Number.isFinite(card.base_cost) && current !== printed);
        // normalize numbers before any math
        card.attack = parseInt(String(card.attack), 10) || 0;
        card.defense = parseInt(String(card.defense), 10) || 0;

        // Do NOT count the card itself if its own fanfare has Rally
        const hasRallyFanfare =
            Array.isArray((card as any).fanfare) &&
            (card as any).fanfare.some((e: any) => String(e.op).toLowerCase() === "rally_gate");

        if (!hasRallyFanfare) {
            if (player === "blue") state.blueRally++;
            else state.redRally++;

        }

        if ((card as any).base_attack === undefined) (card as any).base_attack = card.attack;
        if ((card as any).base_defense === undefined) (card as any).base_defense = card.defense;
        if (card.peak_defense === undefined) card.peak_defense = card.defense;

        applyKeywordsFromList(card); // This sets hasRush/hasStorm
        if (!(globalThis as any).HEADLESS) {
            console.log(`% c[PlayCard] ${card.name} keywords: `, 'color: blue', {
                hasRush: card.hasRush,
                hasStorm: card.hasStorm,
                can_attack: (card as any).can_attack,
                keywords: (card as any).keywords
            });
        }

        card.can_attack = !!card.hasStorm || !!card.hasRush;
        card.isRush = !!card.hasRush && !card.hasStorm;
        card.justPlayed = true;
        card.hasAttacked = false;


        toBoard.push(card);
        // Fire PLAYED-FROM-HAND (not summons) event
        fireTrigger('ally_follower_played', player as any, { playedCard: card, costChanged: costChangedOnPlay });

        // medicalAssassinOnFollowerEnter(player, card); // Hook removed - logic moved to JSON triggers
        fireTrigger('ally_follower_enter', player as any, { enteringCard: card });
        fireTrigger('enemy_follower_enter', player as any, { enteringCard: card });



        if (chosenTier && Array.isArray(chosenTier.effects) && chosenTier.effects.length) {
            runEffects([...chosenTier.effects], player, card);
        }

        // Re-apply keyword flags now that effects may have added some
        applyKeywordsFromList(card);

        // Update combat flags using the *new* keywords
        card.can_attack = !!card.hasStorm || !!card.hasRush;
        card.isRush = !!card.hasRush && !card.hasStorm;


        // ⭐ Ally-enter amulets (e.g., Ancestral Crown)
        {
            const myBoard = player === "blue" ? state.blueBoard : state.redBoard;
            for (const perm of myBoard) {
                if (perm !== card && perm.type === "Amulet" && (perm as any).hasAllyEnter && Array.isArray((perm as any).allyEnterEffects)) {
                    (perm as any).allyEnterEffects.forEach((eff: any) => {
                        if (eff.op === "buff" && eff.target === "trigger") {
                            // @ts-ignore
                            card.attack = (parseInt(card.attack) || 0) + (parseInt(eff.attack) || 0);
                            // @ts-ignore
                            card.defense = (parseInt(card.defense) || 0) + (parseInt(eff.defense) || 0);
                        }
                    });
                }
            }
        }

        // Pixie-enter (your existing special case)
        if (Array.isArray(card.tribes) && card.tribes.includes("Pixie")) {
            const myBoard = player === "blue" ? state.blueBoard : state.redBoard;
            for (const perm of myBoard) {
                if (perm.type === "Amulet" && (perm as any).hasPixieEnter && Array.isArray((perm as any).pixieEnterEffects)) {
                    runEffects([...(perm as any).pixieEnterEffects], player, perm);
                }
            }
        }

        // Fanfare (after ally-enter)
        if (Array.isArray((card as any).fanfare) && (card as any).fanfare.length) {

            state.lastSummoned = [card];
            runEffects([...(card as any).fanfare], player, card, { enteringCard: card });

        }

        return safeRender();
    }


    // Amulets
    if (isAmulet) {
        if (!(globalThis as any).HEADLESS) {
            logEvent("amuletEnter", { player, card: card.name, uid: card.uid });
        }

        // Record played history for amulets
        _pushPlayedHistory(player, card);

        applyKeywordsFromList(card);     // gives it counters/engage/etc.
        toBoard.push(card);

        // merge older Brew(s) into the new one, then remove the old copies
        mergeWitchsNewBrewOnPlay(card, player);

        if (chosenTier && Array.isArray(chosenTier.effects) && chosenTier.effects.length) {
            runEffects([...chosenTier.effects], player, card);
        }
        if (Array.isArray((card as any).fanfare) && (card as any).fanfare.length) {
            state.lastSummoned = [card];
            runEffects([...(card as any).fanfare], player, card, { enteringCard: card });
        }
        return safeRender();
    }
}

// Public API: one undo step per "Play Card"
export function playCard(fromHand: CardInstance[], player: Player, index: number) {
    const card = fromHand?.[index];
    const meta = { player, index, name: card?.name, uid: card?.uid };
    return doAction("Play Card", () => _playCardCore(fromHand, player, index), meta, { autoRender: false });
}
