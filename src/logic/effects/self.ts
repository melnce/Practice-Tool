// src/logic/effects/self.ts
import { state } from "../../core/gameState.js";
import { applyKeyword } from "../core/keywords.js";
import { normalizeKeywordName } from "../core/keywords/registry.js";
import { handleBanish } from "./ops/banish.js";


import { logEvent } from "../../core/logger.js";
import { CardInstance, Effect, Player } from "../../core/types.js";

export function handleBuffSelf(sourceCard: CardInstance, eff: Effect) {
    const a = parseInt(eff.attack as any || 0) || 0;
    const d = parseInt(eff.defense as any || 0) || 0;

    if (a !== 0 || d !== 0) {
        logEvent("buffSelf", {
            card: sourceCard.name,
            uid: sourceCard.uid,
            attack: a,
            defense: d,
        });
    }

    // Ensure the buff tracking object exists
    if (!sourceCard.buffs) {
        sourceCard.buffs = { attack: 0, defense: 0 };
    }
    // Correctly track the buff amount
    sourceCard.buffs.attack = (sourceCard.buffs.attack ?? 0) + a;
    sourceCard.buffs.defense = (sourceCard.buffs.defense ?? 0) + d;

    // Update the card's current stats
    sourceCard.attack = (parseInt(String(sourceCard.attack)) || 0) + a;
    sourceCard.defense = (parseInt(String(sourceCard.defense)) || 0) + d;
    sourceCard.peak_defense = Math.max(
        sourceCard.peak_defense ?? (sourceCard.defense as number),
        sourceCard.defense as number
    );

    // Track temporary buffs if specified
    if (eff.until_end_of_turn) {
        if (!sourceCard.temporaryBuffs) sourceCard.temporaryBuffs = [];
        sourceCard.temporaryBuffs.push({
            attack: a,
            defense: d,
            id: state.rng.makeUid("buff_"),
        });
    }

    // Apply keywords if specified
    if (Array.isArray(eff.keywords)) {
        for (const kw of eff.keywords) {
            const name = (typeof kw === "string" ? kw : (kw as any)?.name) || "";
            let options = (typeof kw === "object" ? kw : undefined);

            // PATCH: Support duration="turn_end" for cant_attack by injecting expires_on_turn
            const normalized = normalizeKeywordName(name);

            if (eff.duration === "turn_end" && normalized === "cant_attack") {
                options = { ...options, expires_on_turn: state.roundCount };
            }

            if (name) {
                applyKeyword(sourceCard, name, options);
            }
        }
    }

    console.log(
        `%cAFTER BUFF SELF on ${sourceCard.name}:`,
        "color: cyan",
        {
            defense: sourceCard.defense,
            buffs: JSON.parse(JSON.stringify(sourceCard.buffs || null)),
        }
    );
}

// Add this new function to clear temporary buffs
export function clearTemporaryBuffs(card: CardInstance) {
    if (card.temporaryBuffs && card.temporaryBuffs.length > 0) {
        logEvent("buffsCleared", { card: card.name, uid: card.uid });
        let totalAttack = 0;
        let totalDefense = 0;

        // Calculate total temporary buffs
        card.temporaryBuffs.forEach((buff: { attack: number; defense: number }) => {
            totalAttack += buff.attack;
            totalDefense += buff.defense;
        });

        // Remove the temporary buffs from tracking
        if (card.buffs) {
            card.buffs.attack = Math.max(0, (card.buffs.attack ?? 0) - totalAttack);
            card.buffs.defense = Math.max(0, (card.buffs.defense ?? 0) - totalDefense);
        }

        // Update the card's stats
        card.attack = (parseInt(String(card.attack)) || 0) - totalAttack;
        card.defense = Math.max(0, (parseInt(String(card.defense)) || 0) - totalDefense);

        // Reset temporary buffs tracking
        card.temporaryBuffs = [];

        console.log(
            `%cCLEARED TEMPORARY BUFFS from ${card.name}:`,
            "color: orange",
            {
                attack: card.attack,
                defense: card.defense,
                buffs: JSON.parse(JSON.stringify(card.buffs || null)),
            }
        );
    }
}

/**
 * NEW: Applies a buff to the source card based on a dynamic game state value.
 */
export function handleDynamicBuffSelf(sourceCard: CardInstance, eff: Effect, owner: Player) {
    if (!owner) return;

    let a = parseInt(eff.attack as any || 0) || 0;
    let d = parseInt(eff.defense as any || 0) || 0;

    // Check for dynamic attack source
    if (eff.attack_source === "combo") {
        const combo =
            owner === "blue"
                ? state.bluePlaysThisTurn || 0
                : state.redPlaysThisTurn || 0;
        a += combo;
    }

    if (eff.attack_source === "count_in_hand" && eff.filter?.tribe) {
        const hand = owner === "blue" ? state.blueHand : state.redHand;
        const count = hand.filter(
            (c) => Array.isArray(c.tribes) && c.tribes.includes(eff.filter!.tribe!)
        ).length;
        a += count;
    }

    if (eff.attack_source === "count_allies") {
        const board = owner === "blue" ? state.blueBoard : state.redBoard;
        // count followers excluding self if exclude_self is set
        const count = board.filter(
            (c) => c.type === "Follower" && (!eff.exclude_self || c.uid !== sourceCard.uid)
        ).length;
        a += count;
    }

    if (eff.attack_source === "shikigami_deaths") {
        const pool = owner === "blue"
            ? (state.shikigamiDeathsThisTurnBlue || [])
            : (state.shikigamiDeathsThisTurnRed || []);
        const sum = pool.reduce((acc: number, x: any) => acc + (Number(x.attack) || 0), 0);
        a += sum;
    }

    // Check for dynamic defense source - ADD THIS SECTION
    if (eff.defense_source === "combo") {
        const combo =
            owner === "blue"
                ? state.bluePlaysThisTurn || 0
                : state.redPlaysThisTurn || 0;
        d += combo;
    }

    if (eff.defense_source === "count_in_hand" && eff.filter?.tribe) {
        const hand = owner === "blue" ? state.blueHand : state.redHand;
        const count = hand.filter(
            (c) => Array.isArray(c.tribes) && c.tribes.includes(eff.filter!.tribe!)
        ).length;
        d += count;
    }
    if (eff.defense_source === "count_allies") {
        const board = owner === "blue" ? state.blueBoard : state.redBoard;
        const count = board.filter(
            (c) => c.type === "Follower" && (!eff.exclude_self || c.uid !== sourceCard.uid)
        ).length;
        d += count;
    }

    if (eff.defense_source === "shikigami_deaths") {
        const pool = owner === "blue"
            ? (state.shikigamiDeathsThisTurnBlue || [])
            : (state.shikigamiDeathsThisTurnRed || []);
        const sum = pool.reduce((acc: number, x: any) => acc + (Number(x.defense) || 0), 0);
        d += sum;
    }

    if (a === 0 && d === 0) return; // No buff to apply

    logEvent("buffSelf", {
        card: sourceCard.name,
        uid: sourceCard.uid,
        attack: a,
        defense: d,
    });

    // Ensure the buff tracking object exists
    if (!sourceCard.buffs) {
        sourceCard.buffs = { attack: 0, defense: 0 };
    }

    // Track and apply the buff
    sourceCard.buffs.attack = (sourceCard.buffs.attack ?? 0) + a;
    sourceCard.buffs.defense = (sourceCard.buffs.defense ?? 0) + d;
    sourceCard.attack = (parseInt(String(sourceCard.attack)) || 0) + a;
    sourceCard.defense = (parseInt(String(sourceCard.defense)) || 0) + d;
    sourceCard.peak_defense = Math.max(
        sourceCard.peak_defense ?? (sourceCard.defense as number),
        sourceCard.defense as number
    );

    // Track temporary buffs if specified
    if (eff.until_end_of_turn) {
        if (!sourceCard.temporaryBuffs) sourceCard.temporaryBuffs = [];
        sourceCard.temporaryBuffs.push({
            attack: a,
            defense: d,
            id: state.rng.makeUid("buff_"),
        });
    }
}

export function handleDestroySelf(sourceCard: CardInstance) {
    logEvent("destroySelf", { card: sourceCard.name, uid: sourceCard.uid });
    // Setting defense to 0 marks it for cleanup
    sourceCard.defense = 0;
    // Explicitly mark for cleanup (for amulets/spells that don't have defense)
    (sourceCard as any).pendingDestruction = true;
}

export function handleBanishSelf(sourceCard: CardInstance, _owner: Player) {
    logEvent("banishSelf", { card: sourceCard.name, uid: sourceCard.uid });
    handleBanish(sourceCard);
}
