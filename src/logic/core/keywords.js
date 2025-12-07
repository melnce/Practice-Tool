// /gamelogic/keywords.js - Complete version with all original functions and keywords
import { state } from "@core/gameState.js";
import { getPool, highlightSelectable } from "@logic/core/targeting.js";
import { grantBarrier } from "@logic/core/barrier.js";


let __initializingKeywords = false;

const KEYWORD_MAP = {
  rush: (c) => {
  c.hasRush = true;

  // Make sure it can actually attack right now
  if (c.attacks_left == null) {
    const per = Number.isFinite(c.attacks_per_turn) ? c.attacks_per_turn : 1;
    c.attacks_left = per;
  }
  c.can_attack = true;             // <-- allow attacking this turn
  c.can_attack_followers = true;   // follower-only on play turn is respected by combat
  c.isRush = !c.hasStorm && !!c.justPlayed;
},
  storm: (c) => {
    c.hasStorm = true;
    c.can_attack = true;  // Storm can attack anything
    c.can_attack_followers = true;
    c.isRush = false;
  },
  ward: (c) => { c.hasWard = true; },
  bane: (c) => { c.hasBane = true; },
  drain: (c) => { c.hasDrain = true; },
  intimidate: (c) => { c.hasIntimidate = true; },
  ambush: (c) => { c.hasAmbush = true; },
  barrier: (c, opts) => { grantBarrier(c, opts?.charges ?? 1); },
  banishondeath: (c) => { c.banishOnDeath = true; },
  banish_on_death: (c) => { c.banishOnDeath = true; },
  countdown: (c, opts) => {
    c.hasCountdown = true;
    const v = Number(opts?.turns ?? opts?.count);
    if (Number.isFinite(v)) {
      c.countdown = v;        // only set when a valid number is provided
    } else if (c.countdown == null) {
      // ensure it exists, but don't force it to 0 if it already had a value
      c.countdown = 0;
    }
  },
  aura: (c) => {
    c.hasAura = true;
  },
  lastwords: (c, opts) => {
  c.hasLastWords = true;
    
    // THIS IS THE FIX:
    // It only assigns the effects if the incoming 'opts' object
    // actually contains a valid 'effects' array.
    // It will no longer overwrite good data with an empty array.
    if (opts && Array.isArray(opts.effects)) {
      c.lastWordsEffects = opts.effects;
    } else if (!c.lastWordsEffects) {
      // If there are no incoming effects AND no effects already on the card,
      // initialize the property as an empty array to prevent errors.
      c.lastWordsEffects = [];
    }
  },
  cant_be_destroyed: (c) => {
    c.cannotBeDestroyed = true;
  },
  trigger: (c, opts) => {
    if (!opts?.trigger) return;
    if (!Array.isArray(c.triggers)) c.triggers = [];
    c.triggers.push(opts.trigger);
  },
  rally: (c, opts) => {
    c.hasRally = true;
    const need = Number(opts?.count ?? 0);

    // store effects to trigger if Rally threshold is reached
    if (need > 0 && Array.isArray(opts.effects)) {
      c.rallyRequirement = need;
      c.rallyEffects = opts.effects;
    }
  },
  fanfare: (c, opts) => {
    c.hasFanfare = true;
    c.fanfareEffects = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  strike: (c, opts) => {
    c.hasStrike = true;
    c.strikeEffects = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  engage: (c, opts) => {
    if (!opts) return;
    c.hasEngage = true;
    c.engageEffects = Array.isArray(opts.effects) ? opts.effects : [];
    c.engageCost = Number(opts.cost ?? 0);
    c.engageOncePerTurn = opts.once_per_turn !== false;
  },
  enhance: (c, opts) => {
    if (!opts?.cost) return;
    if (!c.enhanceTiers) c.enhanceTiers = [];
    c.enhanceTiers.push({ cost: Number(opts.cost), effects: opts.effects || [] });
    c.enhanceTiers.sort((a, b) => b.cost - a.cost);
  },
  spellboost: (c, opts) => {
    if (!opts) return;
    c.hasSpellboost = true;
    c.spellboostCount = c.spellboostCount ?? 0;
    c.spellboost = {
      reduceCostBy: Number(opts.reduce_cost_by ?? 1),
      minCost: Number(opts.min_cost ?? 0),
    };
  },
  counter: (c, opts) => {
    if (!opts?.key) return;
    if (!c.counters) c.counters = {};
    const key = String(opts.key);
    const add = Number(opts.count ?? 0);
    c.counters[key] = (c.counters[key] || 0) + add;
  },
  pixieenter: (c, opts) => {
    c.hasPixieEnter = true;
    c.pixieEnterEffects = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  bleed: (c, opts) => {
    // opts: { to_leader?: number, to_self?: number }
    const toLeader = Number(opts?.to_leader ?? 1);
    const toSelf   = Number(opts?.to_self   ?? 2);

    c.hasBleed = true;
    // Keep one slot; last application overwrites numbers (intentional).
    c.bleed = { toLeader, toSelf };
  },
  allyenter: (c, opts) => {
    c.hasAllyEnter = true;
    c.allyEnterEffects = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  cant_attack: (c, opts) => {
    // Functional lock
    c.hasCantAttack = true;
    c.cantAttack = true;
    c.cantAttackFollowers = true;
    c.cantAttackLeaders = true;

    // Mark as a *temporary* status if an expiry is specified
    if (opts?.expires_on_turn != null) {
      c.cantAttackExpiresOnTurn = Number(opts.expires_on_turn);
      c.cantAttackIsTemporary = true;
    }
    if (opts?.until_opponent_eot) {
      c.cantAttackUntilOpponentEOT = true;
      c.cantAttackIsTemporary = true;
      // Track owner for end-of-turn cleanup
      const isBlue = state.blueBoard.includes(c);
      const isRed  = state.redBoard.includes(c);
      c.cantAttackOwner = isBlue ? "blue" : (isRed ? "red" : c.cantAttackOwner || null);
    }
  },
};

// --- modify applyKeyword so it doesn’t push during init ---
export function applyKeyword(card, keywordName, options) {
  if (!card || !keywordName) return;
  const key = String(keywordName).toLowerCase().trim();
  const keywordHandler = KEYWORD_MAP[key];

  if (keywordHandler) {
    keywordHandler(card, options);

    // only persist keyword tags when NOT initializing from JSON
    const isTempCantAttack =
      (key === "cant_attack") && (options?.until_opponent_eot || options?.expires_on_turn);

    if (!__initializingKeywords && !isTempCantAttack) {
      // 🔧 NEW: ensure we don't mutate a shared array from the template
      if (Array.isArray(card.keywords)) {
        // make a shallow copy so this instance owns its own keywords
        card.keywords = card.keywords.map(k => (typeof k === "string" ? k : { ...k }));
      } else {
        card.keywords = [];
      }

      // robust "has keyword" check that works for strings or objects
      const hasAlready = card.keywords.some(k =>
        (typeof k === "string" && k.toLowerCase() === key) ||
        (k && typeof k === "object" && String(k.name || "").toLowerCase() === key)
      );
      if (!hasAlready) card.keywords.push(key);
    }
  } else {
    console.warn(`[Keywords] Unknown keyword: '${key}'`);
  }
}


// --- modify applyKeywordsFromList to use a snapshot and flag ---
export function applyKeywordsFromList(card) {
  if (!Array.isArray(card.keywords)) return;
  const snapshot = card.keywords.slice(); // important!
  __initializingKeywords = true;
  for (const k of snapshot) {
    if (typeof k === "string") {
      applyKeyword(card, k);
    } else if (k && typeof k.name === "string") {
      applyKeyword(card, k.name, k);
    }
  }
  __initializingKeywords = false;
}
export function handleKeyword(eff, owner, effectsQueue, context = {}) {
  const ctx = { ...context, isTargetedEffect: !!eff.select };
  let targets = getPool(eff.target, owner, context.sourceCard, eff.condition, ctx);

  // NEW: name_filter support
  if (eff.name_filter) {
    const filterStr = String(eff.name_filter).toLowerCase();
    targets = targets.filter(t => String(t.name || "").toLowerCase() === filterStr);
  }

  if (eff.exclude_self && context.sourceCard) {
    targets = targets.filter(t => t.uid !== context.sourceCard.uid);
  }
  if (!targets.length) return "done";

  const __selRaw = (eff.select ?? eff.select_count);
  if (__selRaw) {
    const requested = parseInt((eff.select ?? eff.select_count ?? 1));
    const clamped   = Math.max(1, Math.min(requested, targets.length));

    if (targets.length === 0) return "no-valid-targets";

    state.pendingTargetEffect = {
      eff,
      owner,
      sourceCard: context.sourceCard || null,
      resumeEffects: effectsQueue,
      pool: targets,
      targets: [],
      selectCount: clamped,
    };
    highlightSelectable(targets);
    return "pending";
  }

  for (const target of targets) {
    for (const k of (eff.keywords || [])) {
      const name = (typeof k === "string" ? k : k?.name) || "";
      const options = (typeof k === "object" ? k : undefined);
      applyKeyword(target, name, options);
    }
  }
  return "done";
}


export function handleRemoveKeyword(eff, owner, explicitTargets) {
  const targets = explicitTargets || getPool(eff.target, owner);
  if (!targets.length) return;

  if (eff.select && !explicitTargets) {
    state.pendingTargetEffect = { eff, owner, sourceCard: null, pool: targets, targets: [], selectCount: 1 };
    highlightSelectable(targets);
    return;
  }

  const keywordToRemove = String(eff.keyword || "").toLowerCase();
  if (!keywordToRemove) return;

  for (const target of targets) {
    // Step 1: Disable the keyword's functionality (existing logic)
    if (keywordToRemove === "ward") target.hasWard = false;
    else if (keywordToRemove === "rush") target.hasRush = false;
    else if (keywordToRemove === "storm") target.hasStorm = false;
    else if (keywordToRemove === "bane") target.hasBane = false;
    else if (keywordToRemove === "intimidate") target.hasIntimidate = false;
    else if (keywordToRemove === "drain") target.hasDrain = false;
    else if (keywordToRemove === "lastwords") target.hasLastWords = false;
    else if (keywordToRemove === "ambush") target.hasAmbush = false;

    // Step 2: Remove the keyword from the card's data array to fix the UI (new logic)
    if (Array.isArray(target.keywords)) {
      target.keywords = target.keywords.filter(k => {
        const kwName = (typeof k === "string" ? k : k?.name) || "";
        return kwName.toLowerCase() !== keywordToRemove;
      });
    }
  }
}

export function handleKeywordSelf(sourceCard, eff) {
  if (!sourceCard) {
    console.warn("keyword_self: Called without a source card.");
    return;
  }

  const keywords = Array.isArray(eff.keywords) ? eff.keywords : [eff.keyword || eff.name];
  for (const kw of keywords) {
    const name = (typeof kw === "string" ? kw : kw?.name) || "";
    const options = (typeof kw === "object" ? kw : undefined);
    if (name) {
      applyKeyword(sourceCard, name, options);
    }
  }
}

/**
 * Checks a specific game state condition to determine if a conditional effect should run.
 * @param {object} eff - The effect object containing the condition.
 * @param {string} owner - The player whose state should be checked.
 * @returns {boolean} - True if the condition is met, false otherwise.
 */
export function handleConditionalKeyword(eff, owner) {
  switch (eff.condition) {
    case "super_evo_unlocked": {
      const charges = owner === "blue" ? state.blueSuperEvoCharges : state.redSuperEvoCharges;
      return charges > 0;
    }
    case "evo_unlocked": {
      const normalCharges = owner === "blue" ? state.blueEvoCharges : state.redEvoCharges;
      return normalCharges > 0;
    }
    default:
      console.warn(`Unknown condition in handleConditionalKeyword: ${eff.condition}`);
      return false;
  }
}

// Helper to clear the lock flags on a single card
export function clearCantAttack(card) {
  if (!card) return;
  delete card.hasCantAttack;
  delete card.cantAttack;
  delete card.cantAttackFollowers;
  delete card.cantAttackLeaders;
  delete card.cantAttackUntilOpponentEOT;
  delete card.cantAttackExpiresOnTurn;
  delete card.cantAttackIsTemporary;
  delete card.cantAttackOwner;
}

// Called at end-of-turn: if the *owner* of a locked card just ended their turn,
// the “until opponent EOT” lock has served its purpose → clear it.
export function clearExpiredCantAttackAtEOT(endedPlayer) {
  const boards = [state.blueBoard, state.redBoard];
  for (const board of boards) {
    for (const c of board) {
      if (!c) continue;
      // EOT lock expires right after the owner's turn ends
      if (c.cantAttackUntilOpponentEOT && c.cantAttackOwner === endedPlayer) {
        clearCantAttack(c);
      }
      // Optional absolute turn counter expiry
      if (typeof c.cantAttackExpiresOnTurn === "number" && state.turnNumber >= c.cantAttackExpiresOnTurn) {
        clearCantAttack(c);
      }
    }
  }
}
