// gamelogic/effects/attacks.js
import { logEvent } from "@core/logger.js";
export function applyAttacksPerTurn(eff, sourceCard) {
    if (!sourceCard)
        return;
    const n = parseInt(eff.value ?? eff.count ?? eff.amount ?? eff.n ?? eff[0] ?? eff) ||
        1;
    logEvent("attacksPerTurn", {
        card: sourceCard.name,
        uid: sourceCard.uid,
        value: n,
    });
    // Previous per-turn / left to infer used if the explicit counter is missing
    const prevPer = Number.isFinite(sourceCard.attacks_per_turn)
        ? sourceCard.attacks_per_turn
        : Number.isFinite(sourceCard.attacks_left)
            ? sourceCard.attacks_left
            : 1;
    const prevLeft = Number.isFinite(sourceCard.attacks_left)
        ? sourceCard.attacks_left
        : prevPer;
    const inferredUsed = Math.max(0, prevPer - prevLeft);
    // Prefer the explicit counter if present, else use inference
    const used = Math.max(0, sourceCard.attacks_used_this_turn ?? inferredUsed);
    // Set the new cap
    sourceCard.attacks_per_turn = n;
    // Preserve already-spent swings; do NOT refresh to full
    sourceCard.attacks_left = Math.max(0, n - used);
    // Keep can_attack accurate for the current turn
    if (sourceCard.hasStorm || sourceCard.hasRush || !sourceCard.justPlayed) {
        sourceCard.can_attack = (sourceCard.attacks_left ?? 0) > 0;
    }
}
