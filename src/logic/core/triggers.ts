import { state } from "@core/gameState.js";
import { runEffects } from "@logic/core/effects/index.js";
import { logEvent } from "@core/logger.js";
import { CardInstance, Effect, Player } from "@core/types.js";

interface TriggerContext {
    initiator?: CardInstance;
    enteringCard?: CardInstance;
    target?: CardInstance;
    damagedCard?: CardInstance;
    attacker?: CardInstance;
    defender?: CardInstance;
    playedCard?: CardInstance;
    costChanged?: boolean;
    [key: string]: any;
}

// --- Dedupe map for "one fuse → one ping" invariant ---
const _seenLootFuseThisTurn = new WeakMap<CardInstance, number>();

// --- Once-per-turn helpers ---
function _didRunOnceThisTurn(hostCard: CardInstance, turnNumber: number, key: string) {
    if (!key) return false;
    if (!(hostCard as any).__onceByTurn) (hostCard as any).__onceByTurn = Object.create(null);
    return (hostCard as any).__onceByTurn[key] === turnNumber;
}
function _markRanThisTurn(hostCard: CardInstance, turnNumber: number, key: string) {
    if (!key) return;
    if (!(hostCard as any).__onceByTurn) (hostCard as any).__onceByTurn = Object.create(null);
    (hostCard as any).__onceByTurn[key] = turnNumber;
}

export function fireTrigger(eventName: string, activePlayer: Player, context: TriggerContext = {}) {
    const _turnToken =
        Number.isFinite(state.turnNumber) ? state.turnNumber
            : ((state.roundCount || 0) * 2 + (state.isBlueTurn ? 0 : 1));

    // Coalesce duplicate loot_fused from the same initiator in the same turn.
    if (eventName === "loot_fused" && context?.initiator) {
        const prevTurn = _seenLootFuseThisTurn.get(context.initiator);
        if (prevTurn === _turnToken) {
            logEvent("triggerDeduped", {
                event: "loot_fused",
                initiator: context.initiator?.name || "(unknown)",
                turn: _turnToken
            });
            return; // already handled this initiator's fuse this turn
        }
        _seenLootFuseThisTurn.set(context.initiator, _turnToken as number);
    }

    const enteringCard = context?.enteringCard ?? null;
    const enteringOwner: Player | null = enteringCard
        ? (state.blueBoard.includes(enteringCard) ? 'blue'
            : state.redBoard.includes(enteringCard) ? 'red'
                : null)
        : null;

    // --- Crest triggers (support single + array; respect once_per_turn) ---
    // NOTE: start_of_turn / end_of_turn are handled centrally in turns.js via processCrestEvent.
    // Avoid running them here to prevent double-firing.
    if (eventName !== "start_of_turn" && eventName !== "end_of_turn") {
        const crests = activePlayer === "blue" ? state.blueCrests : state.redCrests;
        if (Array.isArray(crests)) {
            for (const crest of crests) {
                const crestTriggers = Array.isArray(crest.triggers) && crest.triggers.length
                    ? crest.triggers
                    : (crest.trigger ? [crest.trigger] : []);

                for (const cTrig of crestTriggers) {
                    if (!cTrig || cTrig.event !== eventName) continue;

                    const cond = cTrig.condition || {};

                    // ===== ally_follower_enter (needs entering card + ally check) =====
                    if (eventName === "ally_follower_enter") {
                        const entered = context?.enteringCard;
                        if (!entered) continue;

                        const enteredIsBlue = state.blueBoard.includes(entered);
                        const enteredOwner = enteredIsBlue ? "blue"
                            : (state.redBoard.includes(entered) ? "red" : null);
                        if (enteredOwner !== activePlayer) continue; // must be an ally

                        if (cond.not_self && entered.uid === crest.uid) continue;

                        if (cond.tribe) {
                            const want = String(cond.tribe).toLowerCase();
                            const tribes = Array.isArray(entered.tribes)
                                ? entered.tribes!.map(t => String(t).toLowerCase())
                                : [];
                            if (!tribes.includes(want)) continue;
                        }

                        if (cond.has_keyword || cond.keywords) {
                            const wantRaw = cond.has_keyword ?? cond.keywords;
                            const wants = Array.isArray(wantRaw) ? wantRaw : [wantRaw];
                            const toKey = (s: any) => String(s || "").toLowerCase();
                            const hasKW = (card: CardInstance, kw: any) => {
                                const k = toKey(kw);
                                if (k === "ward" && card.hasWard) return true;
                                if (k === "rush" && card.hasRush) return true;
                                if (k === "storm" && card.hasStorm) return true;
                                if (k === "bane" && card.hasBane) return true;
                                if (k === "ambush" && card.hasAmbush) return true;
                                if (k === "aura" && (card as any).hasAura) return true;
                                if (k === "drain" && (card as any).hasDrain) return true;
                                if (k === "intimidate" && (card as any).hasIntimidate) return true;
                                if (k === "lastwords" && card.hasLastWords) return true;
                                if (Array.isArray(card.keywords)) {
                                    return card.keywords!.some((w: any) =>
                                        (typeof w === "string" && toKey(w) === k) ||
                                        (w && typeof w === "object" && toKey(w.name) === k)
                                    );
                                }
                                return false;
                            };
                            const ok = wants.every((w: any) => hasKW(entered, w));
                            if (!ok) continue;
                        }

                        const list = [...(cTrig.effects || [])];
                        if (!list.length) continue;

                        if (cTrig.once_per_turn) {
                            const key = cTrig.once_key || `${cTrig.event || "any"}_once`;
                            if (_didRunOnceThisTurn(crest, _turnToken as number, key)) {
                                logEvent("triggerSkip", {
                                    event: eventName,
                                    card: crest?.name,
                                    reason: "once_per_turn"
                                });
                                continue;
                            }
                            logEvent("trigger", { event: eventName, card: crest?.name });
                            runEffects(list, activePlayer, crest, context);
                            _markRanThisTurn(crest, _turnToken as number, key);
                        } else {
                            logEvent("trigger", { event: eventName, card: crest?.name });
                            runEffects(list, activePlayer, crest, context);
                        }
                        continue; // done handling this crest trigger
                    }

                    // ===== all other crest events (e.g., loot_fused, loot_played, etc.) =====
                    const list = [...(cTrig.effects || [])];
                    if (!list.length) continue;

                    if (cTrig.once_per_turn) {
                        const key = cTrig.once_key || `${cTrig.event || "any"}_once`;
                        if (_didRunOnceThisTurn(crest, _turnToken as number, key)) continue;
                        logEvent("trigger", { event: eventName, card: crest?.name });
                        runEffects(list, activePlayer, crest, context);
                        _markRanThisTurn(crest, _turnToken as number, key);
                    } else {
                        logEvent("trigger", { event: eventName, card: crest?.name });
                        runEffects(list, activePlayer, crest, context);
                    }
                }
            }
        }
    }


    // --- Build a snapshot of zones (board first to avoid hand noise) ---
    const zones: { card: CardInstance, owner: Player, source: string }[] = [
        ...state.blueBoard.map((card: CardInstance) => ({ card, owner: 'blue' as Player, source: 'board' })),
        ...state.redBoard.map((card: CardInstance) => ({ card, owner: 'red' as Player, source: 'board' })),
        ...state.blueHand.map((card: CardInstance) => ({ card, owner: 'blue' as Player, source: 'hand' })),
        ...state.redHand.map((card: CardInstance) => ({ card, owner: 'red' as Player, source: 'hand' })),
    ];

    for (const { card, owner, source } of zones) {
        if (!Array.isArray((card as any)?.triggers) || !(card as any).triggers.length) continue;

        for (const trigger of (card as any).triggers) {
            if (trigger.event !== eventName) continue;

            // --- Self-damaged: only fire on the damaged follower itself ---
            if (eventName === "self_damaged") {
                const damaged = context?.damagedCard;
                if (!damaged) continue;
                if (card.uid !== damaged.uid) continue; // must be THIS follower

                const cond = trigger.condition || {};
                if (cond.still_alive && (parseInt(damaged.defense as string, 10) || 0) <= 0) continue;
                if (cond.own_turn && owner !== (state as any).activePlayer) continue;

                logEvent("trigger", { event: eventName, card: card?.name });
                runEffects([...(trigger.effects || [])], owner, card, { ...context });
                if (trigger.once_per_turn) trigger.usedThisTurn = true;
                continue;
            }

            // NEW: self_buffed_up — only fire on the follower that actually got the +buff, and only on board
            if (eventName === "self_buffed_up") {
                const t = context?.target;
                if (!t) continue;
                if (card.uid !== t.uid) continue;   // must be THIS follower
                if (source !== "board") continue;   // only on the field
                logEvent("trigger", { event: eventName, card: card?.name });
                runEffects([...(trigger.effects || [])], owner, card, { ...context });
                if (trigger.once_per_turn) trigger.usedThisTurn = true;
                continue;
            }

            // Ally-only enforcement for super-evolve events
            if (eventName === 'ally_super_evolve') {
                // Only the evolving player's own cards may react
                if (owner !== activePlayer) continue;
            }

            // Enemy-only enforcement for enemy super-evolve events
            if (eventName === 'enemy_super_evolve') {
                // Only the opponent's cards may react
                if (owner === activePlayer) continue;
            }

            // --- Ally follower actually PLAYED from hand (not summon) ---
            if (eventName === 'ally_follower_played') {
                // Host must belong to the active player and be on board
                if (owner !== activePlayer) continue;
                if (source !== 'board') continue;
                const played = context?.playedCard;
                if (!played || played.type !== 'Follower') continue;

                const cond = trigger.condition || {};
                // cost_changed gate for "Institute of Truth"
                if (cond.cost_changed) {
                    // Prefer precomputed flag; otherwise recompute
                    let changed = !!context?.costChanged;
                    if (!changed) {
                        const printed = Number.isFinite((played as any).base_cost)
                            ? Number((played as any).base_cost)
                            : (parseInt(played.cost as string, 10) || 0);
                        const current = parseInt(played.cost as string, 10) || 0;
                        const handMod = parseInt((played as any).cost_mod, 10) || 0;
                        changed = (handMod !== 0) || (Number.isFinite((played as any).base_cost) && current !== printed);
                    }
                    if (!changed) continue;
                }

                // Optional other filters (tribe/keywords/name/not_self) aren’t typical here,
                // but if present on JSON, reuse the same checks against `played`.
                if (cond.tribe) {
                    const want = String(cond.tribe).toLowerCase();
                    const tribes = Array.isArray(played.tribes) ? played.tribes!.map(t => String(t).toLowerCase()) : [];
                    if (!tribes.includes(want)) continue;
                }
                if (cond.name) {
                    if (String(played.name) !== String(cond.name)) continue;
                }

                logEvent("trigger", { event: eventName, card: card?.name });
                runEffects([...trigger.effects], owner, card, { ...context });
                if (trigger.once_per_turn) trigger.usedThisTurn = true;
                continue;
            }

            // Source check (default to 'board' for ally_follower_enter if omitted)
            const needSource =
                trigger.source || (eventName === 'ally_follower_enter' ? 'board' : null);
            if (needSource && needSource !== source) continue;

            // --- Fast-path handling for combat/strike events ---
            if (eventName === 'clash') {
                if ((card.uid === context.attacker?.uid || card.uid === context.defender?.uid) &&
                    owner === activePlayer) {
                    logEvent("trigger", { event: eventName, card: card?.name });
                    runEffects([...trigger.effects], owner, card, context);
                }
                continue;
            }
            if (eventName === 'strike') {
                if (card.uid === context.attacker?.uid && owner === activePlayer) {
                    logEvent("trigger", { event: eventName, card: card?.name });
                    runEffects([...trigger.effects], owner, card, context);
                }
                continue;
            }
            if (eventName === 'follower_strike') {
                if (card.uid === context.attacker?.uid && owner === activePlayer) {
                    logEvent("trigger", { event: eventName, card: card?.name });
                    runEffects([...trigger.effects], owner, card, context);
                }
                continue;
            }

            // --- Engage must be owned by the active player ---
            if (eventName === 'engage' && owner !== activePlayer) continue;

            // --- For ally_follower_enter: default to ally-only (robust) ---
            if (eventName === 'ally_follower_enter') {
                if (!enteringCard) continue;                // nothing entering -> ignore
                if (owner !== enteringOwner) continue;      // must be same side as host
                if (source !== 'board') continue;           // host must be on board
            }
            // --- For enemy_follower_enter: host on board, and host owner ≠ entering owner
            if (eventName === "enemy_follower_enter") {
                if (!enteringCard) continue;          // nothing entered
                if (source !== "board") continue;     // host must be on board
                const hostOwner = owner;              // <- define properly
                if (hostOwner === enteringOwner) continue; // same side => not enemy
                // fall through to conditions + runEffects below
            }

            // ===== THE FIX IS HERE =====
            // This is a self-contained handler. If the event is on_fuse, it is
            // handled completely within this block and then we 'continue' to the
            // next trigger, preventing it from falling through to other logic.
            if (eventName === "on_fuse") {
                // The trigger should ONLY fire if the owner of this card (`owner`)
                // is the same player who performed the fuse (`activePlayer`).
                if (owner === activePlayer) {
                    // All conditions met, run the effects for this trigger.
                    logEvent("trigger", { event: eventName, card: card?.name });
                    runEffects([...trigger.effects], owner, card, context);
                }
                // Whether the trigger fired or not, we are done with this trigger
                // because the event was 'on_fuse'.
                continue;
            }


            // --- Conditions ---
            const cond = trigger.condition || {};
            // whose_turn
            if (cond.whose_turn === 'owner' && activePlayer !== owner) continue;
            if (cond.whose_turn === 'opponent' && activePlayer === owner) continue;

            // is_ally (if provided, otherwise ally_follower_enter already enforced)
            if (typeof cond.is_ally === 'boolean' && enteringCard) {
                if (cond.is_ally && owner !== enteringOwner) continue;
                if (!cond.is_ally && owner === enteringOwner) continue;
            }

            // tribe
            if (cond.tribe && enteringCard) {
                const want = String(cond.tribe).toLowerCase();
                const tribes = Array.isArray(enteringCard.tribes)
                    ? enteringCard.tribes!.map(t => String(t).toLowerCase())
                    : [];
                console.log(`🏷️ Tribe check: ${want} in`, tribes);
                if (!tribes.includes(want)) continue;
            }

            // --- cost_changed (for Institute of Truth) ---
            if (cond.cost_changed && enteringCard) {
                const printed = Number.isFinite((enteringCard as any).base_cost)
                    ? Number((enteringCard as any).base_cost)
                    : Number(enteringCard.cost) || 0;

                const current = Number(enteringCard.cost) || 0;
                const handMod = Number((enteringCard as any).cost_mod) || 0;

                // Treat as "changed" iff some effect altered the hand cost (cost_mod ≠ 0)
                // or the printed/base cost was explicitly overwritten.
                const changed = (handMod !== 0) || (Number.isFinite((enteringCard as any).base_cost) && current !== printed);
                if (!changed) continue;
            }

            // name
            if (cond.name && enteringCard) {
                if (String(enteringCard.name) !== String(cond.name)) continue;
            }

            // --- Host card stat gates (for events like end_of_turn on the host) ---
            if (typeof cond.attack_lte === "number" && (parseInt(card.attack as string, 10) || 0) > cond.attack_lte) continue;
            if (typeof cond.attack_gte === "number" && (parseInt(card.attack as string, 10) || 0) < cond.attack_gte) continue;
            if (typeof cond.defense_lte === "number" && (parseInt(card.defense as string, 10) || 0) > cond.defense_lte) continue;
            if (typeof cond.defense_gte === "number" && (parseInt(card.defense as string, 10) || 0) < cond.defense_gte) continue;
            if (cond.still_alive === true && (parseInt(card.defense as string, 10) || 0) <= 0) continue;


            // not_self
            if (cond.not_self && enteringCard && enteringCard.uid === card.uid) continue;

            // your_turn_only
            if (trigger.your_turn_only && owner !== activePlayer) continue;

            // once_per_turn (check first, mark after successful fire)
            if (trigger.once_per_turn) {
                const key = trigger.once_key || `${trigger.event}_once`;
                if (_didRunOnceThisTurn(card, _turnToken as number, key)) {
                    logEvent("triggerSkip", {
                        event: eventName,
                        card: card?.name,
                        reason: "once_per_turn"
                    });
                    continue;
                }

                logEvent("trigger", { event: eventName, card: card?.name });
                runEffects([...trigger.effects], owner, card, { ...context, enteringOwner });
                _markRanThisTurn(card, _turnToken as number, key);
                continue;
            }

            logEvent("trigger", { event: eventName, card: card?.name });
            runEffects([...trigger.effects], owner, card, { ...context, enteringOwner });
        }
    }
}

function hasCrest(player: Player, crestName: string) {
    const crests = player === 'blue' ? state.blueCrests : state.redCrests;
    return crests.some((c: any) => c.name === crestName);
}
