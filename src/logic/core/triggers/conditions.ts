import { TriggerContext, TriggerSpec, TriggerEventName } from "./types.js";
import { CardInstance, Player } from "../../../core/types.js";

// Helper to normalize "subject" card (entering, played, etc.)
export function getSubjectCard(context: TriggerContext): CardInstance | null {
    return context.enteringCard ?? context.invokedCard ?? context.playedCard ?? null;
}

function checkKeywords(card: CardInstance, wants: string[]): boolean {
    const toKey = (s: any) => String(s || "").toLowerCase();

    // Helper to check one keyword
    const hasKW = (c: CardInstance, kw: string) => {
        const k = toKey(kw);
        // Explicit boolean flags
        if (k === "ward" && c.hasWard) return true;
        if (k === "rush" && c.hasRush) return true;
        if (k === "storm" && c.hasStorm) return true;
        if (k === "bane" && c.hasBane) return true;
        if (k === "ambush" && c.hasAmbush) return true;
        if (k === "aura" && c.hasAura) return true;
        // Check dynamic props if necessary (legacy code did (card as any).hasDrain)
        if (k === "drain" && (c as any).hasDrain) return true;
        if (k === "intimidate" && (c as any).hasIntimidate) return true;
        if (k === "lastwords" && c.hasLastWords) return true;

        // Check keywords array
        if (Array.isArray(c.keywords)) {
            return c.keywords!.some((w: any) =>
                (typeof w === "string" && toKey(w) === k) ||
                (w && typeof w === "object" && toKey(w.name) === k)
            );
        }
        return false;
    };

    return wants.every(w => hasKW(card, w));
}


export function evalCommonConditions(
    trigger: TriggerSpec,
    hostCard: CardInstance,
    owner: Player,
    activePlayer: Player,
    context: TriggerContext,
    event: TriggerEventName
): boolean {
    const cond = trigger.condition || {};
    const subjectCard = getSubjectCard(context);

    // 1. whose_turn
    if (cond.whose_turn === 'owner' && activePlayer !== owner) return false;
    if (cond.whose_turn === 'opponent' && activePlayer === owner) return false;
    if (trigger.your_turn_only && owner !== activePlayer) return false;

    // 2. is_ally
    if (typeof cond.is_ally === 'boolean' && subjectCard) {
        if (context.enteringOwner) {
            if (cond.is_ally && owner !== context.enteringOwner) return false;
            if (!cond.is_ally && owner === context.enteringOwner) return false;
        }
    }

    // 3. is_self
    if (cond.is_self && subjectCard) {
        if (subjectCard.uid !== hostCard.uid) return false;
    }

    // 4. tribe
    if (cond.tribe && subjectCard) {
        const want = String(cond.tribe).toLowerCase();
        const tribes = Array.isArray(subjectCard.tribes)
            ? subjectCard.tribes!.map(t => String(t).toLowerCase())
            : [];
        if (!tribes.includes(want)) return false;
    }

    // 5. cost_changed
    if (cond.cost_changed && subjectCard) {
        const printed = Number.isFinite((subjectCard as any).base_cost)
            ? Number((subjectCard as any).base_cost)
            : Number(subjectCard.cost) || 0;

        const current = Number(subjectCard.cost) || 0;
        const handMod = Number((subjectCard as any).cost_mod) || 0;
        const changed = (handMod !== 0) || (Number.isFinite((subjectCard as any).base_cost) && current !== printed);

        if (!changed) return false;
    }

    // 6. name
    if (cond.name && subjectCard) {
        if (String(subjectCard.name) !== String(cond.name)) return false;
    }

    // 7. Host card stat gates
    const atk = parseInt(hostCard.attack as string, 10) || 0;
    const def = parseInt(hostCard.defense as string, 10) || 0;

    if (typeof cond.attack_lte === "number" && atk > cond.attack_lte) return false;
    if (typeof cond.attack_gte === "number" && atk < cond.attack_gte) return false;
    if (typeof cond.defense_lte === "number" && def > cond.defense_lte) return false;
    if (typeof cond.defense_gte === "number" && def < cond.defense_gte) return false;
    if (cond.still_alive === true && def <= 0) return false;

    // 8. not_self
    if (cond.not_self && subjectCard && subjectCard.uid === hostCard.uid) return false;

    // 9. own_turn
    if (cond.own_turn && owner !== activePlayer) return false;

    // 10. keywords (Crest compat)
    if ((cond.has_keyword || cond.keywords) && subjectCard) {
        const wantRaw = cond.has_keyword ?? cond.keywords;
        const wants = (Array.isArray(wantRaw) ? wantRaw : [wantRaw]).filter((s: any) => typeof s === 'string');
        if (!checkKeywords(subjectCard, wants as string[])) return false;
    }

    return true;
}
