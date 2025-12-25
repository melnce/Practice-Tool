import { CardInstance } from "../../../core/types/index.js";
import { normalizeKeywordName } from "./registry.js";
import { getKS } from "./internal.js";
import { grantBarrier } from "../barrier.js";

interface KeywordOptions {
  [key: string]: any;
}

export const KEYWORD_MAP: {
  [key: string]: (c: CardInstance, opts?: KeywordOptions) => void;
} = {
  max_damage_cap: (c, opts) => {
    if (opts && typeof opts.amount === "number") {
      getKS(c).maxDamageCap = opts.amount;
    }
  },
  rush: (c) => {
    c.hasRush = true;

    // Make sure it can actually attack right now
    if (c.attacks_left == null) {
      const per = Number.isFinite(c.attacks_per_turn)
        ? (c.attacks_per_turn as number)
        : 1;
      c.attacks_left = per;
    }
    c.can_attack = true;
    getKS(c).can_attack_followers = true;
    c.isRush = !c.hasStorm && !!c.justPlayed;
  },
  storm: (c) => {
    c.hasStorm = true;
    c.can_attack = true;
    getKS(c).can_attack_followers = true;
    c.isRush = false;
  },
  ward: (c) => {
    c.hasWard = true;
  },
  bane: (c) => {
    c.hasBane = true;
  },
  drain: (c) => {
    c.hasDrain = true;
  },
  intimidate: (c) => {
    c.hasIntimidate = true;
  },
  ambush: (c) => {
    c.hasAmbush = true;
  },
  barrier: (c) => {
    grantBarrier(c);
    getKS(c).hasBarrier = true;
  },
  banish_on_death: (c) => {
    getKS(c).banishOnDeath = true;
  },
  countdown: (c, opts) => {
    c.hasCountdown = true;
    const v = Number(opts?.turns ?? opts?.count);
    if (Number.isFinite(v)) {
      c.countdown = v;
    } else if (c.countdown == null) {
      c.countdown = 0;
    }
  },
  aura: (c) => {
    c.hasAura = true;
  },
  taunt: (c) => {
    c.hasTaunt = true;
  },
  last_words: (c, opts) => {
    c.hasLastWords = true;
    const ks = getKS(c);

    if (opts && Array.isArray(opts.effects)) {
      ks.lastWordsEffects = opts.effects;
    } else if (!ks.lastWordsEffects && !c.lastWordsEffects) {
      ks.lastWordsEffects = [];
    }
  },
  cant_be_destroyed: (c) => {
    getKS(c).cannotBeDestroyed = true;
  },
  trigger: (c, opts) => {
    if (!opts?.trigger) return;
    const ks = getKS(c);
    if (!Array.isArray(ks.triggers)) ks.triggers = [];
    ks.triggers.push(opts.trigger);
  },
  rally: (c, opts) => {
    const ks = getKS(c);
    ks.hasRally = true;
    const need = Number(opts?.count ?? 0);

    if (need > 0 && opts && Array.isArray(opts.effects)) {
      ks.rallyRequirement = need;
      ks.rallyEffects = opts.effects;
    }
  },
  fanfare: (c, opts) => {
    getKS(c).hasFanfare = true;
    c.fanfare = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  strike: (c, opts) => {
    const ks = getKS(c);
    ks.hasStrike = true;
    ks.strikeEffects = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  engage: (c, opts) => {
    if (!opts) return;
    c.hasEngage = true;
    const ks = getKS(c);
    ks.engageEffects = Array.isArray(opts.effects) ? opts.effects : [];
    ks.engageCost = Number(opts.cost ?? 0);
    ks.engageOncePerTurn = opts.once_per_turn !== false;
    ks.engageSacrifice = !!(opts.sacrifice || opts.engageSacrifice);
  },
  enhance: (c, opts) => {
    if (!opts?.cost) return;
    if (!c.enhanceTiers) c.enhanceTiers = [];
    c.enhanceTiers.push({
      cost: Number(opts.cost),
      effects: opts.effects || [],
    });
    c.enhanceTiers.sort((a, b) => b.cost - a.cost);
  },
  spellboost: (c, opts) => {
    if (!opts) return;
    const ks = getKS(c);
    ks.hasSpellboost = true;
    ks.spellboostCount = ks.spellboostCount ?? 0;

    ks.spellboost = {
      reduceCostBy: Number(opts.reduce_cost_by ?? 1),
      minCost: Number(opts.min_cost ?? 0),
    };
  },
  counter: (c, opts) => {
    if (!opts?.key) return;
    const ks = getKS(c);
    if (!ks.counters) ks.counters = {};
    const key = String(opts.key);
    const add = Number(opts.count ?? 0);
    ks.counters[key] = (ks.counters[key] || 0) + add;
  },
  skybound_art: () => { },
  pixie_enter: (c, opts) => {
    const ks = getKS(c);
    ks.hasPixieEnter = true;
    ks.pixieEnterEffects = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  bleed: (c, opts) => {
    const toLeader = Number(opts?.to_leader ?? 1);
    const toSelf = Number(opts?.to_self ?? 2);
    const ks = getKS(c);

    ks.hasBleed = true;
    ks.bleed = { toLeader, toSelf };
  },
  ally_enter: (c, opts) => {
    const ks = getKS(c);
    ks.hasAllyEnter = true;
    ks.allyEnterEffects = Array.isArray(opts?.effects) ? opts.effects : [];
  },
  cant_attack: (c, opts) => {
    const ks = getKS(c);
    ks.cantAttack = true;
    ks.cantAttackFollowers = true;
    ks.cantAttackLeaders = true;

    if (opts?.expires_on_turn != null) {
      ks.cantAttackExpiresOnTurn = Number(opts.expires_on_turn);
      ks.cantAttackIsTemporary = true;
    }
    if (opts?.until_opponent_eot) {
      ks.cantAttackUntilOpponentEOT = true;
      ks.cantAttackUntilOpponentEOT = true;
      ks.cantAttackIsTemporary = true;
      // Use the caster if provided, otherwise fallback to card owner (for self-buffs)
      ks.cantAttackOwner = opts.request_owner || c.owner || null;
    }
  },
};

let __initializingKeywords = false;

export function applyKeyword(
  card: CardInstance,
  keywordName: string,
  options?: KeywordOptions,
) {
  if (!card || !keywordName) return;
  const key = normalizeKeywordName(keywordName);
  if (!key) {
    console.warn(`[Keywords] Unknown/Empty keyword: '${keywordName}'`);
    return;
  }
  const keywordHandler = KEYWORD_MAP[key];

  if (keywordHandler) {
    keywordHandler(card, options);

    const isTempCantAttack =
      key === "cant_attack" &&
      (options?.until_opponent_eot || options?.expires_on_turn);

    if (!__initializingKeywords && !isTempCantAttack) {
      if (Array.isArray(card.keywords)) {
        card.keywords = card.keywords.map((k) =>
          typeof k === "string" ? k : { ...k },
        );
      } else {
        card.keywords = [];
      }

      const hasAlready = card.keywords.some(
        (k) =>
          (typeof k === "string" && normalizeKeywordName(k) === key) ||
          (k &&
            typeof k === "object" &&
            normalizeKeywordName(k.name || "") === key),
      );
      if (!hasAlready) (card.keywords as any[]).push(key);
    }
  } else {
    console.warn(`[Keywords] Unknown keyword: '${key}'`);
  }
}

export function applyKeywordsFromList(card: CardInstance) {
  if (!Array.isArray(card.keywords)) return;
  const snapshot = card.keywords.slice();
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















