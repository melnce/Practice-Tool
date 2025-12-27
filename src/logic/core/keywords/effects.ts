import type { Effect, Player, CardInstance } from "../../../core/types/index.js";
import {
  removeKeywordFromSingleCard,
  removeAllAbilitiesFromCard,
} from "./remove.js";
import { applyKeyword } from "./apply.js";
import type { KeywordEffectResult } from "./types.js";

// Helper to construct request
function createSelectionRequest(
  eff: Effect,
  owner: Player,
  targets: CardInstance[],
  sourceCard: CardInstance | null,
  effectsQueue: any[],
): KeywordEffectResult {
  const requested = parseInt((eff.select ?? eff.select_count ?? 1) as string);
  const clamped = Math.max(1, Math.min(requested, targets.length));

  if (targets.length === 0) return { kind: "no-valid-targets" };

  return {
    kind: "request_target",
    request: {
      eff,
      owner,
      sourceCard: sourceCard || null,
      resumeEffects: effectsQueue,
      pool: targets,
      selectCount: clamped,
    },
  };
}

export function handleKeyword(
  eff: Effect,
  owner: Player,
  effectsQueue: any[],
  resolvedTargets: CardInstance[],
  context: any = {},
): KeywordEffectResult {
  let targets = resolvedTargets;

  if (eff.name_filter) {
    const filterStr = String(eff.name_filter).toLowerCase();
    targets = targets.filter(
      (t: CardInstance) => String(t.name || "").toLowerCase() === filterStr,
    );
  }

  if (eff.exclude_self && context.sourceCard) {
    targets = targets.filter(
      (t: CardInstance) => t.uid !== context.sourceCard.uid,
    );
  }
  if (!targets.length) return { kind: "done" };

  const __selRaw = eff.select ?? eff.select_count;
  if (__selRaw) {
    return createSelectionRequest(
      eff,
      context.owner,
      targets,
      context.sourceCard,
      context.effectsQueue,
    );
  }

  // STRICT: Only accept keywords array, not singular keyword
  const keywordList = Array.isArray((eff as any).keywords)
    ? (eff as any).keywords
    : [];

  // Fix: Basic "until_end_of_turn: true" on the generic effect should propagate to keywords that support it (like cant_attack)
  const genericExpiryOpts = eff.until_end_of_turn
    ? {
      expires_on_turn: state.roundCount ?? 0,
    }
    : undefined;

  for (const target of targets) {
    for (const k of keywordList) {
      let name = "";
      let options: any = genericExpiryOpts
        ? { ...genericExpiryOpts }
        : undefined;
      // Inject the caster (owner) so apply.ts knows who applied it
      if (!options) options = {};
      options.request_owner = owner;

      if (typeof k === "string") {
        name = k;
      } else {
        name = k?.name || "";
        // Merge specific options with generic expiry, specific takes precedence?
        // Usually generic EOT flag should override or coexist.
        // Let's merge: specific options > generic options
        if (k) {
          options = { ...options, ...k };
          // If specific has expiration, it keeps it. If not, it gets generic.
        }
      }

      if (name) {
        applyKeyword(target, name, options);
      }
    }
  }
  return { kind: "done" };
}

export function handleRemoveKeyword(
  eff: Effect,
  owner: Player,
  targets: CardInstance[],
  effectsQueue: any[] = [],
): KeywordEffectResult {
  if (!targets.length) return { kind: "done" };

  // If explicit targets are provided (e.g. from context/selection), we operate on them.
  // If THIS effect triggered selection, we return a request.
  if (eff.select) {
    return createSelectionRequest(eff, owner, targets, null, effectsQueue);
  }

  // STRICT: Only accept keywords array for consistency
  const keywordsToRemove = Array.isArray((eff as any).keywords)
    ? (eff as any).keywords
    : [];
  for (const target of targets) {
    for (const kw of keywordsToRemove) {
      const name = (typeof kw === "string" ? kw : kw?.name) || "";
      if (name) removeKeywordFromSingleCard(target, name.toLowerCase());
    }
  }
  return { kind: "done" };
}

export function handleRemoveAbilities(
  eff: Effect,
  owner: Player,
  effectsQueue: any[],
  targets: CardInstance[],
  context: any = {},
): KeywordEffectResult {
  if (eff.select) {
    return createSelectionRequest(
      eff,
      owner,
      targets,
      context.sourceCard,
      effectsQueue,
    );
  }

  if (!targets || targets.length === 0) return { kind: "done" };

  for (const card of targets) {
    removeAllAbilitiesFromCard(card);
  }
  return { kind: "done" };
}

import { state } from "../../../core/gameState.js";
import { getEvoCharges, getSuperEvoCharges } from "../../../core/playerHelpers.js";

// ... (existing imports are fine, just fixing the functions at the end)

export function handleKeywordSelf(
  sourceCard: CardInstance,
  eff: Effect,
): KeywordEffectResult {
  if (!sourceCard) {
    return { kind: "done" };
  }

  // STRICT: Only accept keywords array, not singular keyword
  const keywords = Array.isArray(eff.keywords) ? eff.keywords : [];
  for (const kw of keywords) {
    const name = (typeof kw === "string" ? kw : (kw as any)?.name) || "";
    const options = typeof kw === "object" ? kw : undefined;
    if (name) {
      applyKeyword(sourceCard, name, options);
    }
  }
  return { kind: "done" };
}

export function handleConditionalKeyword(eff: Effect, owner: Player) {
  switch (eff.condition) {
    case "super_evo_unlocked": {
      const charges = getSuperEvoCharges(state, owner);
      return charges > 0;
    }
    case "evo_unlocked": {
      const normalCharges = getEvoCharges(state, owner);
      return normalCharges > 0;
    }
    default:
      console.warn(
        `Unknown condition in handleConditionalKeyword: ${eff.condition}`,
      );
      return false;
  }
}















