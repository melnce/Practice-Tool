// src/logic/effects/ops/summon.ts
import { state } from "../../../core/gameState.js";
import { getCardDetails } from "../../../data/cardDatabase.js";
// @ts-ignore
import { render } from "../../../ui/render.js";
import { fireTrigger } from "../../core/triggers.js";
// import { medicalAssassinOnFollowerEnter } from "@logic/effects/cards/portalcraft/medicalAssassin.js";
import { getPool, highlightSelectable, clearSelectableFlags } from "../../core/targeting.js";
import { applyKeywordsFromList, applyKeyword } from "../../core/keywords.js";
// import { handleCongregantOnEnter } from "@logic/effects/cards/forestcraft/congregant.js";
import { rand, randInt, makeUid } from "../../../core/rng.js";
import { logEvent } from "../../../core/logger.js";
import { Effect, CardInstance, CardTemplate, Player } from "../../../core/types.js";

// =============== Utilities ===============

function boardOf(owner: Player) {
    return owner === "blue" ? state.blueBoard : state.redBoard;
}

function deckOf(owner: Player) {
    return owner === "blue" ? state.blueDeck : state.redDeck;
}

function normalizeName(s: string) {
    return String(s || "").trim().toLowerCase();
}

function isAmulet(card: CardInstance) {
    return card && card.type === "Amulet";
}

function isFollower(card: CardInstance) {
    return card && card.type === "Follower";
}

function isWitchsNewBrew(card: CardInstance) {
    const n = normalizeName(card?.name);
    return isAmulet(card) && n.includes("witch") && n.includes("brew");
}

function isMagicSediment(card: CardInstance) {
    return isAmulet(card) && normalizeName(card?.name) === "magic sediment";
}

function isEarthSigil(card: CardInstance) {
    // In this engine, Earth Sigils on board are represented by either Brew or Sediment.
    return isWitchsNewBrew(card) || isMagicSediment(card);
}

// Add in summon.js (Utilities section)
function getEffectiveCost(card: CardInstance) {
    // @ts-ignore
    if (card && typeof card.effectiveCost === "number") return card.effectiveCost;
    const base = parseInt(card?.cost as any, 10) || 0;
    const mod = parseInt(card?.cost_mod as any, 10) || 0;
    return base + mod;
}

function nextId() {
    // Use seeded UID for deterministic instance IDs
    return makeUid("inst_");
}


function filterArtifactFollowersHand(owner: Player, maxCost: number) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    return hand.filter(c =>
        c?.type === "Follower" &&
        Array.isArray(c?.tribes) && c.tribes.includes("Artifact") &&
        getEffectiveCost(c) <= (maxCost ?? 999)
    );
}

// Pull starting counters/destroyOnEmpty from the JSON keywords
function seedCountersFromKeywords(card: CardInstance) {
    card.counters = card.counters || {};
    const kws = Array.isArray(card.keywords) ? card.keywords : [];
    for (const k of kws) {
        // @ts-ignore
        if (typeof k !== "string" && k?.name === "Counter") {
            const key = String(k.key);
            const count = Number(k.count || 0);
            if (key) {
                // SET the counter value instead of ADDING to it
                // This ensures we don't double-count if called multiple times
                if (card.counters[key] === undefined) {
                    card.counters[key] = count;
                }
            }
            if (k.destroyOnEmpty) card.destroyOnEmpty = true;
        }
    }
}

// Safe deep clone that ignores cycles and engine backrefs
function safeClone(value: any, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return undefined;
    seen.add(value);

    if (Array.isArray(value)) return value.map(v => safeClone(v, seen));

    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
        // Drop obvious engine links/cycles
        if (k === "__state" || k === "__dom" || k === "element") continue;
        if (v === state) continue; // direct reference to global state
        out[k] = safeClone(v, seen);
    }
    return out;
}

// Return how many earth counters a card *starts* with, based on its keywords
function startingEarthFromKeywords(cardData: CardTemplate) {
    let n = 0;
    const kws = Array.isArray(cardData?.keywords) ? cardData.keywords : [];
    for (const k of kws) {
        // @ts-ignore
        if (typeof k !== "string" && k?.name === "Counter" && String(k.key) === "earth") {
            n += Number(k.count || 0);
        }
    }
    // Safety default: most Earth Sigil amulets start with 1
    return n || 1;
}

// =============== Initialization ===============

function initFollower(card: CardInstance) {
    // normalize numbers
    // @ts-ignore
    card.attack = parseInt(card.attack as any) || 0;
    // @ts-ignore
    card.defense = parseInt(card.defense as any) || 0;

    // remember raw stats
    if (card.base_attack == null) card.base_attack = card.attack;
    if (card.base_defense == null) card.base_defense = card.defense;
    if (card.peak_defense == null) card.peak_defense = card.defense;

    // apply keyword booleans/params
    applyKeywordsFromList(card);

    // turn-state
    card.justPlayed = true;
    card.hasAttacked = false;
    card.attacks_per_turn = Number.isFinite(card.attacks_per_turn) ? card.attacks_per_turn! : 1;
    card.attacks_left = card.attacks_per_turn;
    card.can_attack = !!(card.hasStorm || card.hasRush);
    card.isRush = !!(card.hasRush && !card.hasStorm);
}

function initAmulet(card: CardInstance) {
    // bring in keyword flags and keyword-defined params (e.g., countdown)
    applyKeywordsFromList(card);

    // counters + destroyOnEmpty from keywords
    seedCountersFromKeywords(card);

    // normalize countdown if present
    if (card.hasCountdown) {
        card.countdown = Number(card.countdown || 0);
    }
}

// =============== Earth Sigil Merge + De-dup ===============

// Find an existing Earth Sigil on board for the owner: prefer Brew (replacement rule), else Sediment.
function findEarthSigilTarget(board: CardInstance[]) {
    let brew = null;
    let sediment = null;
    for (const c of board) {
        if (!isAmulet(c)) continue;
        if (isWitchsNewBrew(c)) {
            brew = brew || c;
        } else if (isMagicSediment(c)) {
            sediment = sediment || c;
        }
    }
    return brew || sediment || null;
}

// Add "amount" earth counters to the preferred Earth Sigil target, if present.
// Returns true if merged into an existing amulet (no new card should be created).
function tryMergeIntoExistingEarthSigil(board: CardInstance[]) {
    const target = findEarthSigilTarget(board);
    if (!target) return false;

    target.counters = target.counters || {};
    target.counters.earth = (target.counters.earth || 0) + 1;
    return true;
}

// After any summon that could touch Earth Sigils, merge duplicates down to one.
// Preferred survivor: Brew if present, else the oldest Sediment (first found).
// All earth counters from the others are absorbed into the survivor; extras are removed.
function dedupeEarthSigils(board: CardInstance[]) {
    const sigils = board.filter(isEarthSigil);
    if (sigils.length <= 1) return;

    // Group by type: Brews and Sediments
    const brews = sigils.filter(isWitchsNewBrew);
    const sediments = sigils.filter(isMagicSediment);

    // If we have multiple Brews, merge them into one
    if (brews.length > 1) {
        mergeSigils(board, brews);
    }

    // If we have multiple Sediments, merge them into one
    if (sediments.length > 1) {
        mergeSigils(board, sediments);
    }
}

// Helper function to merge sigils of the same type
function mergeSigils(board: CardInstance[], sigilsToMerge: CardInstance[]) {
    if (sigilsToMerge.length <= 1) return;

    // Choose the first one as survivor
    const survivor = sigilsToMerge[0];

    // Sum counters from the others
    let totalEarth = Number(survivor.counters?.earth || 0);
    for (let i = 1; i < sigilsToMerge.length; i++) {
        const s = sigilsToMerge[i];
        totalEarth += Number(s.counters?.earth || 0);

        // Remove from board
        const idx = board.indexOf(s);
        if (idx !== -1) board.splice(idx, 1);
    }

    // Update survivor counters
    survivor.counters = survivor.counters || {};
    survivor.counters.earth = totalEarth;
}

// =============== Core Summon Routines ===============

function makeCardFromDB(cardData: CardTemplate, owner: Player): CardInstance {
    const card: CardInstance = JSON.parse(JSON.stringify(cardData));
    card.uid = makeUid();
    card.owner = owner;
    if (isFollower(card)) initFollower(card);
    else if (isAmulet(card)) initAmulet(card);
    return card;
}

function pushToBoard(board: CardInstance[], owner: Player, card: CardInstance) {
    // Respect max board size 5
    if (board.length >= 5) return false;
    board.push(card);

    // Increment Rally if follower
    if (card.type === "Follower") {
        if (owner === "blue") state.blueRally++;
        else state.redRally++;
    }

    // MEDICAL ASSASSIN TRIGGER - ADD THIS LINE
    // Hook removed - replaced by JSON trigger
    // medicalAssassinOnFollowerEnter(owner, card);

    // follower enter triggers
    if (isFollower(card)) {
        fireTrigger("ally_follower_enter", owner, { enteringCard: card });
        fireTrigger("enemy_follower_enter", owner, { enteringCard: card });

        // >>> Congregant chain (runs once when the first instance enters)
        // Legacy Support REMOVED: Managed by JSON Trigger now
        // if (normalizeName(card.name) === "congregant of unkilling") ...
    }
    return true;
}

// =============== Public API ===============

export function summonNamed(eff: Effect, owner: Player) {
    state.lastSummoned = [];

    const name = String((eff as any)?.name || "").trim();
    let count = parseInt((eff as any)?.count);
    if (!Number.isFinite(count) || count <= 0) count = 1;

    if (!name) return;

    const data = getCardDetails(name);
    if (!data) {
        console.error(`summonNamed: Card "${name}" not found in DB`);
        return;
    }

    const board = boardOf(owner);
    const isSedimentSummon = normalizeName(name) === "magic sediment";

    for (let i = 0; i < count; i++) {
        if (isSedimentSummon) {
            // SPECIAL HANDLING FOR MAGIC SEDIMENT: Check if any Earth Sigil exists first
            const existingEarthSigil = findEarthSigilTarget(board);
            if (existingEarthSigil) {
                // Add counter to existing Earth Sigil instead of summoning new one
                existingEarthSigil.counters = existingEarthSigil.counters || {};
                existingEarthSigil.counters.earth = (existingEarthSigil.counters.earth || 0) + 1;
                continue; // Skip summoning
            }
        }

        const card = makeCardFromDB(data, owner);

        // Support "keyword": "Rush" and/or "keywords": ["Rush","Ward", ...]
        if ((eff as any)?.keyword) {
            applyKeyword(card, (eff as any).keyword);
        }
        if (Array.isArray(eff?.keywords)) {
            for (const kw of eff.keywords) {
                if (typeof kw === "string") applyKeyword(card, kw);
                else if (kw && typeof kw.name === "string") applyKeyword(card, kw.name, kw);
            }
        }

        const placed = pushToBoard(board, owner, card);
        if (placed) {
            logEvent("summon", { owner, card: card.name, uid: card.uid });
            state.lastSummoned.push(card);
        }
    }

    render();
}

export function reanimateSummon(c: CardInstance, owner: Player) {
    if (!c || c.type !== "Follower") return;

    const board = boardOf(owner);
    if (board.length >= 5) return;

    const base = getCardDetails(c.name);
    if (!base) return;

    const copy = makeCardFromDB(base, owner);

    // Reanimates enter 'justPlayed', but Rush/Storm should still work this turn:
    // - Storm: can attack leaders & followers
    // - Rush:  can attack followers only
    copy.hasAttacked = false;
    copy.attacks_left = copy.attacks_per_turn ?? 1;
    if (copy.hasStorm) {
        copy.can_attack = true;
        copy.can_attack_followers = true;
        copy.isRush = false;
    } else if (copy.hasRush) {
        // Allow follower attacks this turn; leader swings are blocked in attackLeader().
        copy.can_attack = true;
        copy.can_attack_followers = true;
        copy.isRush = true;
    }

    // ✅ Ensure reanimated units gain the Departed tribe
    copy.tribes = Array.isArray(copy.tribes) ? copy.tribes : [];
    if (!copy.tribes.includes("Departed")) copy.tribes.push("Departed");
    // (Optional) mark provenance if you ever need it:
    // copy.wasReanimated = true;

    if (pushToBoard(board, owner, copy)) {
        logEvent("reanimateSummon", { owner, card: copy.name, uid: copy.uid });
        state.lastSummoned = [copy];
    }
    render();
}


export function summonRandomFromDeck(eff: Effect, owner: Player) {
    // Desired number
    let want = parseInt((eff as any)?.count ?? 1);
    if (!Number.isFinite(want) || want <= 0) want = 1;

    const deck = deckOf(owner);
    const board = boardOf(owner);

    // Respect board space
    const space = Math.max(0, 5 - board.length);
    if (space <= 0) return;

    // -------- Filters --------
    const f = (eff as any)?.filters || {};
    const wantType = String(f.type ?? "").toLowerCase();   // "amulet" | "follower" | "spell"
    const cls = String(f.class ?? f.class_eq ?? "").toLowerCase();
    const costLte = Number.isFinite(Number(f.cost_lte)) ? Number(f.cost_lte) : null;
    const costGte = Number.isFinite(Number(f.cost_gte)) ? Number(f.cost_gte) : null;
    const costEq = Number.isFinite(Number(f.cost_eq)) ? Number(f.cost_eq) : null;

    const matches = (c: CardInstance) => {
        const t = String(c.type || "").toLowerCase();
        const okType = !wantType || t === wantType;
        const okClass = !cls || String(c.class || "").toLowerCase() === cls;
        const costNum = Number(c.cost);
        const okLte = costLte == null || (Number.isFinite(costNum) && costNum <= costLte);
        const okGte = costGte == null || (Number.isFinite(costNum) && costNum >= costGte);
        const okEq = costEq == null || (Number.isFinite(costNum) && costNum === costEq);
        return okType && okClass && okLte && okGte && okEq;
    };

    // Collect candidates from deck (deck entries have UIDs)
    let candidates = deck.filter(matches);
    if (!candidates.length) return;

    // Optional: enforce differently named results
    if ((eff as any).unique_names) {
        const seen = new Set();
        candidates = candidates.filter(c => {
            const n = String(c.name || "").toLowerCase();
            if (seen.has(n)) return false;
            seen.add(n);
            return true;
        });
    }
    if (!candidates.length) return;

    // Shuffle (Fisher–Yates)
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Respect board space and requested count
    const take = Math.min(want, space, candidates.length);
    const picks = candidates.slice(0, take);

    state.lastSummoned = [];

    // Summon and remove from deck
    for (const deckEntry of picks) {
        const data = getCardDetails(deckEntry.name);
        if (!data) continue;

        const card = makeCardFromDB(data, owner);
        if (!pushToBoard(board, owner, card)) break;

        // remove the specific deck entry (by uid) so duplicates remain intact in deck
        const idx = deck.indexOf(deckEntry);
        if (idx !== -1) deck.splice(idx, 1);

        state.lastSummoned.push(card);
    }

    logEvent("summonRandom", { owner, picks: state.lastSummoned.map(c => c.name) });
    render();
}


export function handleSummonDestroyedAmuletHighestBaseCost(owner: Player) {
    const grave = owner === "blue" ? state.blueGraveyard : state.redGraveyard;

    // Only amulets that actually hit the graveyard (i.e., were destroyed, not banished/bounced)
    const destroyedAmulets = grave.filter(c => c?.type === "Amulet");
    if (!destroyedAmulets.length) return;

    // Compute base costs from DB (ignores temporary cost mods during play)
    let maxBase = -Infinity;
    const withBase = destroyedAmulets.map(g => {
        const base = getCardDetails(g.name);
        const baseCost = parseInt(base?.cost as any, 10) || 0;
        if (baseCost > maxBase) maxBase = baseCost;
        return { g, baseCost };
    });

    const candidates = withBase.filter(x => x.baseCost === maxBase);
    if (!candidates.length) return;

    // Random one among the highest base cost
    const pick = candidates[randInt(candidates.length)].g;

    // Re-create a fresh copy from DB and put it on board using existing API
    // @ts-ignore
    summonNamed({ op: "summon_named", name: pick.name, count: 1 }, owner);
}

export function handleSelectHandSummonArtifactCopiesEOT(eff: Effect, owner: Player, effectsQueue: any) {
    const maxCost = Number((eff as any).max_cost ?? 5);
    const hand = owner === "blue" ? state.blueHand : state.redHand;

    const pool = (hand || []).filter(c => {
        if (!c || c.type !== "Follower") return false;
        const tribes = Array.isArray(c.tribes) ? c.tribes.map(t => String(t).toLowerCase()) : [];
        if (!tribes.includes("artifact")) return false;
        return getEffectiveCost(c) <= maxCost;
    });

    if (!pool.length) return;

    state.pendingTargetEffect = {
        eff: { ...eff, op: "select_hand_summon_artifact_copies_eot_destroy" } as any,
        owner,
        sourceCard: null,
        resumeEffects: effectsQueue,
        pool,
        targets: [],
        selectCount: Math.max(1, parseInt((eff.select ?? (eff as any).select_count ?? 2) as any, 10)),
    };
    highlightSelectable(pool);
    return "pending";
}

// --- NEW: summonExactCopyFromHand ---
// Summons an *exact* clone of a hand card (keeping buffs/keywords/current stats/cost mods/etc.).
// It does NOT remove the original from hand (we copy, not move).


export function summonExactCopyFromHand(srcCard: CardInstance, owner: Player, position = "right") {
    if (!srcCard) return null;

    // Deep clone the current hand object (keeps buffs/keywords/cost mods, etc.)
    const clone: CardInstance = (typeof structuredClone === "function")
        ? structuredClone(srcCard)
        : JSON.parse(JSON.stringify(srcCard));

    // Normalize instance/placement fields
    clone.id = nextId();
    clone.zone = "board";
    clone.owner = owner;
    clone.selected = false;
    clone.selectable = false;
    clone.glow = false;

    // Ensure arrays exist
    clone.triggers = Array.isArray(clone.triggers) ? clone.triggers : [];
    clone.keywords = Array.isArray(clone.keywords) ? clone.keywords : [];
    clone.buffs = clone.buffs || {}; // keep object shape used elsewhere

    // --- Follower init (this is what was missing) ---
    if (clone.type === "Follower") {

        // Numbers
        // @ts-ignore
        clone.attack = parseInt(clone.attack as any) || 0;
        // @ts-ignore
        clone.defense = parseInt(clone.defense as any) || 0;

        // Base/peak
        if (clone.base_attack == null) clone.base_attack = clone.attack;
        if (clone.base_defense == null) clone.base_defense = clone.defense;
        if (clone.peak_defense == null) clone.peak_defense = clone.defense;

        // Apply keyword flags (sets hasRush/hasStorm/etc.) from the cloned keywords list
        applyKeywordsFromList(clone);

        // Turn-state
        clone.justPlayed = true;
        clone.hasAttacked = false;
        clone.attacks_per_turn = Number.isFinite(clone.attacks_per_turn) ? clone.attacks_per_turn! : 1;
        clone.attacks_left = clone.attacks_per_turn;

        // Combat flags
        if (clone.hasStorm) {
            clone.can_attack = true;            // leaders & followers
            clone.isRush = false;
            clone.can_attack_followers = true;
        } else if (clone.hasRush) {
            clone.can_attack = true;            // followers this turn
            clone.isRush = true;
            clone.can_attack_followers = true;
        } else {
            clone.can_attack = false;
            clone.isRush = false;
            clone.can_attack_followers = false;
        }
    }

    // Place on board (respect space)
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    if (!Array.isArray(board) || board.length >= 5) return null;

    if (position === "left") board.unshift(clone);
    else board.push(clone);

    logEvent("summonExactCopy", { owner, from: srcCard.name, uid: clone.uid });
    // Track last summoned
    state.lastSummoned = [clone];

    // Fire follower-enter hooks exactly like other summon paths
    if (clone.type === "Follower") {
        // @ts-ignore
        medicalAssassinOnFollowerEnter(owner, clone);      // consistency with pushToBoard
        fireTrigger("ally_follower_enter", owner, { enteringCard: clone });
        fireTrigger("enemy_follower_enter", owner, { enteringCard: clone });
        // Ensure effect-based summons also trigger the Congregrant chain
        // @ts-ignore
        handleCongregantOnEnter(owner, clone);
    }

    return clone;
}

export function handleSelectHandSummonArtifactCopy(eff: Effect, owner: Player, effectsQueue: any) {
    const maxCost = Number((eff as any).max_cost ?? 5);
    const hand = owner === "blue" ? state.blueHand : state.redHand;

    const pool = (hand || []).filter(c => {
        if (!c || c.type !== "Follower") return false;
        const tribes = Array.isArray(c.tribes) ? c.tribes.map(t => String(t).toLowerCase()) : [];
        if (!tribes.includes("artifact")) return false;
        const base = parseInt(c?.cost as any, 10) || 0;
        const mod = parseInt(c?.cost_mod as any, 10) || 0;
        // @ts-ignore
        const effCost = Number.isFinite(c?.effectiveCost) ? c.effectiveCost : base + mod;
        return effCost <= maxCost;
    });

    if (!pool.length) return;

    state.pendingTargetEffect = {
        eff: { ...eff, op: "select_hand_summon_artifact_copy" } as any, // resolved in resolveTarget.js
        owner,
        sourceCard: null,
        resumeEffects: effectsQueue,
        pool,
        targets: [],
        // ← respect JSON-specified select count
        selectCount: Math.max(1, parseInt((eff.select ?? (eff as any).select_count ?? 1) as any, 10)),
        // optional: let user confirm multi-selects (shows the confirm button)
        requiresConfirmation: (parseInt((eff.select ?? 1) as any, 10) > 1)
    };

    highlightSelectable(pool);
    return "pending";
}

export function summonExactCopy(sourceCard: CardInstance, owner: Player) {
    if (!sourceCard || sourceCard.type !== "Follower") return null;

    const board = boardOf(owner);
    if ((board?.length || 0) >= 5) return null;

    // Deep clone current instance (no cycles)
    const clone = (typeof structuredClone === "function")
        ? structuredClone(sourceCard)
        : safeClone(sourceCard);

    // Normalize instance identity/placement
    clone.uid = makeUid();
    clone.owner = owner;
    clone.zone = "board";
    clone.selected = false;
    clone.selectable = false;
    clone.glow = false;

    // Make sure arrays/objects exist
    clone.triggers = Array.isArray(clone.triggers) ? clone.triggers : [];
    clone.keywords = Array.isArray(clone.keywords) ? clone.keywords : [];
    clone.buffs = clone.buffs || {};

    // Follower init similar to summonExactCopyFromHand
    // @ts-ignore
    clone.attack = parseInt(clone.attack as any) || 0;
    // @ts-ignore
    clone.defense = parseInt(clone.defense as any) || 0;

    if (clone.base_attack == null) clone.base_attack = clone.attack;
    if (clone.base_defense == null) clone.base_defense = clone.defense;
    if (clone.peak_defense == null) clone.peak_defense = clone.defense;

    // Re-derive keyword flags (Rush/Storm/etc.) from keywords list
    applyKeywordsFromList(clone);

    // Turn state
    clone.justPlayed = true;
    clone.hasAttacked = false;
    clone.attacks_per_turn = Number.isFinite(clone.attacks_per_turn) ? clone.attacks_per_turn! : 1;
    clone.attacks_left = clone.attacks_per_turn;

    // Combat flags
    if (clone.hasStorm) {
        clone.can_attack = true;
        clone.can_attack_followers = true;
        clone.isRush = false;
    } else if (clone.hasRush) {
        clone.can_attack = true;             // followers this turn
        clone.can_attack_followers = true;
        clone.isRush = true;
    } else {
        clone.can_attack = false;
        clone.can_attack_followers = false;
        clone.isRush = false;
    }

    if (!pushToBoard(board, owner, clone)) return null;

    logEvent("summonExactCopy", { owner, from: sourceCard.name, uid: clone.uid });
    // >>> Congregant chain managed by JSON triggers now

    state.lastSummoned = [clone];
    render();
    return clone;
}

// =============== Generic Board Fill Chain ===============

/**
 * Create a specialized clone of the previous instance, apply -1 DEF,
 * and mark it as chain-spawned to suppress re-entry cascade.
 * 
 * Logic generalized from Congregant of Unkilling to work for any card.
 */
function makeChainDecayClone(prev: CardInstance, owner: Player): CardInstance {
    // START MANUAL CLONE to avoid circular JSON failures
    // We only take the properties we need or are safe to copy.
    const clone: CardInstance = {
        ...prev, // Shallow copy first (primitives + references)
        // Overwrite references we need to be unique
        triggers: Array.isArray(prev.triggers) ? [...prev.triggers] : [], // Shallow copy array
        keywords: Array.isArray(prev.keywords) ? [...prev.keywords] : [],
        buffs: prev.buffs ? { ...prev.buffs } : { attack: 0, defense: 0 },
        // Clear dangerous circular refs if they exist in shallow copy
        __state: undefined,
    } as any;
    // END MANUAL CLONE

    // Identity/placement
    clone.uid = makeUid();
    clone.owner = owner;
    clone.zone = "board";
    clone.selected = false;
    clone.selectable = false;
    clone.glow = false;

    // Normalize numbers from prev
    const prevAtk = parseInt(String(prev.attack)) || 0;
    const prevDef = parseInt(String(prev.defense)) || 0;
    // @ts-ignore
    const prevBaseA = Number.isFinite(prev.base_attack) ? prev.base_attack : prevAtk - (parseInt(prev.buffs?.attack) || 0);
    // @ts-ignore
    const prevBaseD = Number.isFinite(prev.base_defense) ? prev.base_defense : prevDef - (parseInt(prev.buffs?.defense) || 0);
    const buffA = parseInt(String(prev.buffs?.attack)) || 0;
    const buffD = parseInt(String(prev.buffs?.defense)) || 0;

    // DECAY: -1 to the MAX HP (base_defense)
    const newBaseD = Math.max(0, (prevBaseD as number) - 1);

    // Attack copies exactly (base + buffs)
    clone.base_attack = (prevBaseA as number);
    clone.attack = (prevBaseA as number) + buffA;

    // Defense copies with reduced MAX: base_defense -1, keep buffs
    clone.base_defense = newBaseD;
    clone.defense = newBaseD + buffD;

    // Keep potentials aligned so DEF is white (not damaged)
    // @ts-ignore
    clone.potential_attack = (clone.base_attack as number) + buffA;
    // @ts-ignore
    clone.potential_defense = (clone.base_defense as number) + buffD;

    // Peak is this instance's full current DEF
    clone.peak_defense = clone.defense;
    clone.peak_attack = Math.max(clone.peak_attack ?? clone.attack, clone.attack);

    // Turn/attack flags
    clone.justPlayed = true;
    clone.hasAttacked = false;
    // @ts-ignore
    clone.attacks_per_turn = Number.isFinite(clone.attacks_per_turn) ? clone.attacks_per_turn : 1;
    // @ts-ignore
    clone.attacks_left = clone.attacks_per_turn;

    // Rush/Storm handling
    if (clone.hasStorm) {
        clone.can_attack = true;
        clone.can_attack_followers = true;
        clone.isRush = false;
    } else if (clone.hasRush) {
        clone.can_attack = true;         // followers only this turn
        clone.can_attack_followers = true;
        clone.isRush = true;
    } else {
        clone.can_attack = false;
        clone.can_attack_followers = false;
        clone.isRush = false;
    }

    // Prevent re-entrant cascade from chain-spawned copies
    // Renamed from _spawnedByCongregant to generic _spawnedByChain
    // @ts-ignore
    clone._spawnedByChain = true;

    // Ensure UI "damaged" flag is false (white DEF)
    // @ts-ignore
    clone.isDamaged = false;

    return clone;
}

/**
 * Fills the board with copies of the entering card, each with -1 MAX DEF than previous.
 * Stops when DEF hits 0 or board is full.
 * 
 * Logic generalized from Congregant of Unkilling to work for any card.
 */
export function handleFillBoardChainDecay(owner: Player, enteringCard: CardInstance) {
    if (!enteringCard || enteringCard.type !== "Follower") return;

    // Don’t start a new cascade from chain-spawned copies
    // @ts-ignore
    if (enteringCard._spawnedByChain || enteringCard._spawnedByCongregant) return;

    const board = boardOf(owner);

    // Chain from the *latest* instance; stop if DEF would drop to 0 or board is full.
    let prev = enteringCard;
    while (board.length < 5) {
        const nextDef = (parseInt(String(prev.defense), 10) || 0) - 1;
        if (nextDef <= 0) break;

        const clone = makeChainDecayClone(prev, owner);

        // Respect max board size
        if (board.length >= 5) break;
        board.push(clone);
        // @ts-ignore
        logEvent("chainSpawn", { owner, name: clone.name, uid: clone.uid, base_defense: clone.base_defense });

        // Rally for followers
        if (owner === "blue") state.blueRally++;
        else state.redRally++;

        // Per-enter hooks & triggers (keep parity with pushToBoard)
        // @ts-ignore
        medicalAssassinOnFollowerEnter(owner, clone);
        fireTrigger("ally_follower_enter", owner, { enteringCard: clone });
        fireTrigger("enemy_follower_enter", owner, { enteringCard: clone });

        // Next link in the chain is the clone we just placed
        prev = clone;
    }
}
