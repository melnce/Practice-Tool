// src/core/card_validation.ts
const SAFE_SINGLE_OPS = new Set([
    "damage", "buff", "banish", "keyword", "heal_leader", "draw", "recover_pp",
    "reduce_cost", "destroy", "return_to_hand", "remove_keyword", "damage_follower_or_leader"
]);
function validateEffects(effects, contextString) {
    if (!Array.isArray(effects))
        return;
    for (const eff of effects) {
        // Check 1: Simple op with both `effects` AND `target: selected` inside?
        if (SAFE_SINGLE_OPS.has(eff.op)) {
            if (eff.effects && eff.effects.length > 0) {
                if (eff.op !== "destroy") {
                    console.warn(`[Validation] Warning: ${contextString} - Effect '${eff.op}' has nested effects. Should it be 'select' or usage of 'then' variant?`);
                }
            }
        }
        // Check 2: op "select" with no effects
        if (eff.op === "select" && (!eff.effects || eff.effects.length === 0)) {
            console.warn(`[Validation] Warning: ${contextString} - 'select' op has no 'effects'. Selection will do nothing.`);
        }
        // Recurse
        if (eff.effects)
            validateEffects(eff.effects, `${contextString} > ${eff.op}`);
        // @ts-ignore
        if (eff.else_effects)
            validateEffects(eff.else_effects, `${contextString} > ${eff.op}(else)`);
    }
}
export function validateCardDatabase() {
    console.log("Validating Card Database...");
    const db = window.cardDatabase;
    if (!db) {
        console.warn("[Validation] cardDatabase not found on window.");
        return;
    }
    const allCards = [
        ...Object.values(db.fullData || {}),
        ...Object.values(db.tokenData || {})
    ];
    if (allCards.length === 0) {
        console.warn("[Validation] Database appears empty.");
        return;
    }
    let count = 0;
    for (const card of allCards) {
        const name = card.name;
        const fields = ["fanfare", "evolve", "superevolve", "spell", "last_words"];
        for (const f of fields) {
            if (card[f])
                validateEffects(card[f], `${name}.${f}`);
        }
        count++;
    }
    console.log(`Validated ${count} cards/tokens.`);
}
