/**
 * Generalized op-keys gate (Layer 1–3).
 * Allowlists derived from handler consumption — keys copied into specs but not
 * read downstream are excluded. See src/logic/core/effects/domains and
 * src/logic/effects/ops type modules.
 */

import { CREST_ACTION_VALUES } from "../src/logic/effects/ops/crest/types.js";
import { DECK_ACTION_VALUES } from "../src/logic/effects/deck.js";
import { COUNTER_ACTION_VALUES } from "../src/logic/effects/ops/counter/types.js";
import { COUNTDOWN_ACTION_VALUES } from "../src/logic/effects/ops/countdown/unified.js";
import { COST_ACTION_VALUES } from "../src/logic/effects/ops/cost/types.js";
import { FUSE_ACTION_VALUES } from "../src/logic/effects/ops/fuse/types.js";
import { KEYWORD_ACTION_VALUES } from "../src/logic/effects/ops/keyword/unified.js";
import { STAT_ACTION_VALUES } from "../src/logic/effects/ops/stat/types.js";
import {
  PP_ACTION_VALUES,
  EP_ACTION_VALUES,
  COMBO_ACTION_VALUES,
} from "../src/logic/core/effects/domains/resources.js";
import { TRIGGER_CONDITION_KEYS } from "../src/logic/core/triggers/conditions.js";
import { CARD_CONDITION_KEYS } from "../src/logic/core/conditions/evaluator.js";
import { TRIGGER_EVENTS_WITH_DAMAGE_VICTIM } from "../src/logic/core/triggers/dispatcher.js";

type CardJson = {
  id: string;
  name: string;
  description?: string;
  triggers?: unknown[];
  [key: string]: unknown;
};

type Issue = {
  id: string;
  name: string;
  kind: "error" | "warn";
  message: string;
};

/** Ops with an action field validated against exported *_ACTION_VALUES sets. */
const OP_ACTION_VALUES: Record<string, ReadonlySet<string>> = {
  crest: CREST_ACTION_VALUES,
  deck: DECK_ACTION_VALUES,
  counter: COUNTER_ACTION_VALUES,
  countdown: COUNTDOWN_ACTION_VALUES,
  cost: COST_ACTION_VALUES,
  fuse: FUSE_ACTION_VALUES,
  keyword: KEYWORD_ACTION_VALUES,
  stat: STAT_ACTION_VALUES,
  pp: PP_ACTION_VALUES,
  ep: EP_ACTION_VALUES,
  combo: COMBO_ACTION_VALUES,
};

// ---------------------------------------------------------------------------
// Shared nested key sets
// ---------------------------------------------------------------------------

/** Keys forwarded to evaluateCardCondition / applyFilters pool path. */
export const POOL_CONDITION_KEYS = new Set([
  ...CARD_CONDITION_KEYS,
  "not_self",
  "include_self",
]);

/** Pool-only keys — belong in condition, not filter. */
export const POOL_ONLY_CONDITION_KEYS = new Set(["not_self", "include_self"]);

/**
 * Ops where CARD_CONDITION_KEYS must live in filter (not condition).
 * Banish splits condition→getPool vs filter→applyFilters; select merges both
 * but filter is the canonical spelling (targeting.ts selectPoolCondition).
 */
const OPS_CARD_NARROWING_IN_FILTER = new Set(["banish", "select"]);

/** cardFilter family (draw, search). */
export const CARD_FILTER_KEYS = new Set([
  "name",
  "type",
  "class",
  "cost_eq",
  "cost_lte",
  "cost_gte",
  "attack_eq",
  "attack_lte",
  "attack_gte",
  "defense_eq",
  "defense_lte",
  "defense_gte",
  "tribe",
  "tribes",
  "tribe_in",
  "tribes_in",
  "cost_in",
]);

/** summon filter / destroyed_match filter (normalize + deck.ts). */
export const SUMMON_FILTER_KEYS = new Set([
  "type",
  "class",
  "tribe",
  "cost",
  "cost_max",
  "cost_min",
  "cost_lte",
  "cost_gte",
  "cost_eq",
  "hasLastWords",
  "base_cost_lte",
  "baseCost_lte",
]);

/** banish post-pool filters (banish/unified.ts + primitives deck banish). */
export const BANISH_FILTERS_KEYS = new Set([
  "defense_lte",
  "cost_lte",
  "cost_in",
  "base_cost_in",
  "type",
  "name",
]);

/** keyword op filters (buffs.ts). */
export const KEYWORD_FILTERS_KEYS = new Set(["class", "type", "tribe"]);

/** return op filters (return.ts). */
export const RETURN_FILTERS_KEYS = new Set(["type"]);

/** cost op filter (cost/unified.ts). */
export const COST_FILTER_KEYS = new Set(["type", "tribe", "class", "name"]);

/** transform filter (transform.ts matchesFilter). */
export const TRANSFORM_FILTER_KEYS = new Set([
  "type",
  "tribe",
  "class",
  "name",
  "cost_lte",
  "cost_gte",
  "cost_eq",
  "costLte",
  "costGte",
  "costEq",
  "cost",
]);

/** evolve merged filter (evolve/unified.ts). */
export const EVOLVE_FILTER_KEYS = new Set([
  ...POOL_CONDITION_KEYS,
  "base_cost_eq",
  "base_cost_gte",
  "base_cost_lte",
]);

/** countdown board filter. */
export const COUNTDOWN_FILTER_KEYS = new Set(["name"]);

/** repeat_effect filter when count_source is count_in_hand. */
export const REPEAT_FILTER_KEYS = new Set(["tribe"]);

/** add_to_hand destroyed_match filter. */
export const ADD_TO_HAND_FILTER_KEYS = new Set([
  "type",
  "tribe",
  "hasLastWords",
  "base_cost_lte",
]);

/** Rejected nested keys (no reader in evaluateCardCondition / filters.ts). */
export const REJECTED_NESTED_KEYS = new Set(["card_type", "type_eq"]);

const STAT_NAME_VALUE_SOURCES = new Set(["named_enter_count"]);

const OP_WARN_TOP_LEVEL_KEYS: Record<string, ReadonlySet<string>> = {};

// ---------------------------------------------------------------------------
// Per-op top-level allowlists (excluding "op")
// ---------------------------------------------------------------------------

export const OP_TOP_LEVEL_KEYS: Record<string, ReadonlySet<string>> = {
  stat: new Set([
    "action",
    "mode",
    "target",
    "attack",
    "defense",
    "attack_source",
    "defense_source",
    "keywords",
    "keyword",
    "duration",
    "tribes",
    "name_filter",
    "name_in",
    "has_keyword",
    "filter",
    "condition",
    "exclude_self",
    "include_self",
    "distribution",
    "stat",
    "pick",
    "select_mode",
    "random",
    "select",
    "select_count",
    "count",
    "until_end_of_turn",
    "until_eot",
    "attacks_per_turn",
    "amount",
  ]),
  attacks_per_turn: new Set([
    "target",
    "value",
    "count",
    "amount",
    "n",
    "until_end_of_turn",
    "until_eot",
    "filter",
    "condition",
    "select",
    "select_mode",
  ]),
  keyword: new Set([
    "action",
    "keywords",
    "target",
    "player",
    "select",
    "select_count",
    "count",
    "pick",
    "distribution",
    "condition",
    "filter",
    "exclude_self",
    "until_end_of_turn",
    "name_filter",
    "triggers",
  ]),
  cost: new Set([
    "target",
    "mode",
    "amount",
    "pool",
    "condition",
    "filter",
    "select",
    "min_cost",
    "minCost",
    "until_eot",
  ]),
  counter: new Set(["action", "key", "amount"]),
  countdown: new Set([
    "action",
    "amount",
    "amount_source",
    "target",
    "name",
    "board_name",
    "filter",
    "select",
    "select_mode",
    "random",
  ]),
  spellboost: new Set(["target", "mode", "count", "times", "amount"]),
  summon: new Set([
    "source",
    "name",
    "count",
    "owner",
    "cost",
    "filter",
    "condition",
    "distinct_by",
    "distribution",
    "target",
    "copy_scope",
    "copy_mode",
    "mode",
    "select",
    "select_count",
    "then",
    "keywords",
    "eot_destroy",
    "sort",
    "max_cost",
    "unique_names",
    "evolve_summons",
  ]),
  return: new Set([
    "destination",
    "target",
    "select",
    "select_count",
    "optional",
    "all",
    "condition",
    "filters",
    "select_mode",
    "distribution",
    "count",
  ]),
  transform: new Set([
    "target",
    "mode",
    "into",
    "name",
    "into_source",
    "filter",
    "condition",
    "select",
    "distribution",
    "exclude_self",
    "target_card_name",
  ]),
  damage: new Set([
    "target",
    "amount",
    "add_amount",
    "amount_source",
    "amount_overflow",
    "overflow_amount",
    "distribution",
    "count",
    "stat",
    "rank",
    "pick",
    "spill_to_leader",
    "select",
    "include_leader",
    "fallback_leader",
    "can_target_leader",
    "condition",
    "filter",
    "class",
    "exclude_selected",
  ]),
  destroy: new Set([
    "target",
    "distribution",
    "count",
    "count_source",
    "stat",
    "select",
    "scope",
    "condition",
    "filter",
    "then",
    "effects",
    "exclude",
    "only_if_damaged",
    "store_count_as",
  ]),
  banish: new Set([
    "target",
    "distribution",
    "count",
    "select",
    "select_count",
    "scope",
    "condition",
    "filter",
    "store_count_as",
  ]),
  restore: new Set([
    "target",
    "amount",
    "amount_source",
    "player",
    "store_restored_as",
  ]),
  heal_leader: new Set(["amount"]),
  pp: new Set(["action", "amount", "amount_source", "player"]),
  ep: new Set(["action", "amount", "player"]),
  add_shadows: new Set(["amount"]),
  earth_rite: new Set(["cost", "amount", "effects"]),
  combo: new Set(["action", "amount"]),
  draw: new Set(["source", "count", "player", "filter", "distinct_by"]),
  add_to_hand: new Set([
    "source",
    "name",
    "count",
    "target",
    "from",
    "player",
    "keywords",
    "filter",
    "distinct_by",
    "distribution",
    "select",
    "condition",
  ]),
  search: new Set(["filter", "count", "keywords", "player"]),
  discard: new Set([
    "mode",
    "count",
    "filter",
    "names",
    "name",
    "select",
    "optional",
  ]),
  deck: new Set([
    "action",
    "from_set",
    "exclude",
    "cards",
    "mode",
    "filter",
    "amount",
    "name",
    "count",
    "source",
    "rank",
    "stat",
    "shuffle",
    "set_cost",
  ]),
  crest: new Set([
    "action",
    "name",
    "crest",
    "image",
    "description",
    "countdown",
    "effects",
    "triggers",
    "trigger",
    "player",
    "counter",
    "amount",
    "on_success_effects",
    "append_triggers",
    "on_gain",
    "keywords",
    "passives",
    "target",
    "is_faith",
  ]),
  fuse: new Set([
    "action",
    "type",
    "initiator_uid",
    "result",
    "result_name",
    "recipe_id",
    "recipe_index",
  ]),
  select: new Set([
    "target",
    "select",
    "select_count",
    "condition",
    "filter",
    "effects",
    "mode",
  ]),
  mode: new Set([
    "options",
    "select",
    "select_count",
    "unique",
    "pick",
    "distribution",
    "activate_all_if",
    "activate_all_if_ally_board_gte",
  ]),
  mode_bonus: new Set(["amount"]),
  evolve: new Set([
    "target",
    "mode",
    "name",
    "spend_point",
    "select",
    "count",
    "select_mode",
    "filter",
    "condition",
  ]),
  evolve_self: new Set([
    "target",
    "mode",
    "name",
    "spend_point",
    "select",
    "count",
    "select_mode",
    "filter",
    "condition",
  ]),
  super_evolve_self: new Set([
    "target",
    "mode",
    "name",
    "spend_point",
    "select",
    "count",
    "select_mode",
    "filter",
    "condition",
  ]),
  gate: new Set([
    "condition",
    "effects",
    "else_effects",
    "count",
    "at_least",
    "cost",
    "requirement",
    "name",
    "type",
    "exclude_self",
    "class",
    "base_cost_eq",
    "base_cost_gte",
    "base_cost_lte",
    "tribe",
    "is_ally",
    "ally",
    "has_keyword",
  ]),
  repeat_effect: new Set([
    "effects",
    "effect",
    "count",
    "count_source",
    "filter",
  ]),
  sequence: new Set(["key", "steps", "advance", "wrap"]),
  replicate: new Set(["zone"]),
  random_split: new Set(["total", "parts", "effects"]),
  with_source: new Set(["source_uid", "effects"]),
  set_deckout_victory: new Set([]),
  boost_skybound_art_hand: new Set(["amount"]),
};

// ---------------------------------------------------------------------------
// Nested allowlist routing per op
// ---------------------------------------------------------------------------

type NestedKind =
  | "pool"
  | "card_filter"
  | "summon_filter"
  | "banish_filters"
  | "keyword_filters"
  | "return_filters"
  | "cost_filter"
  | "transform_filter"
  | "evolve_filter"
  | "countdown_filter"
  | "repeat_filter"
  | "add_to_hand_filter"
  | "none";

function nestedKindFor(
  op: string,
  field: "condition" | "filter" | "filters",
): NestedKind {
  if (op === "gate") return "none"; // condition is a string gate name
  if (field === "condition") {
    if (
      [
        "stat",
        "destroy",
        "select",
        "transform",
        "attacks_per_turn",
        "keyword",
        "banish",
        "summon",
        "return",
        "cost",
        "evolve",
        "evolve_self",
        "super_evolve_self",
        "add_to_hand",
      ].includes(op)
    ) {
      return "pool";
    }
    return "none";
  }
  if (field === "filters") {
    if (op === "draw" || op === "search") return "card_filter";
    if (op === "banish") return "banish_filters";
    if (op === "keyword") return "keyword_filters";
    if (op === "return") return "return_filters";
    if (op === "summon") return "summon_filter";
    return "none";
  }
  // filter
  if (op === "draw" || op === "search") return "card_filter";
  if (op === "summon") return "summon_filter";
  if (op === "add_to_hand") return "add_to_hand_filter";
  if (op === "cost") return "cost_filter";
  if (op === "transform") return "transform_filter";
  if (op === "evolve" || op === "evolve_self" || op === "super_evolve_self")
    return "evolve_filter";
  if (op === "countdown") return "countdown_filter";
  if (op === "repeat_effect") return "repeat_filter";
  if (op === "banish") return "banish_filters";
  if (
    [
      "stat",
      "destroy",
      "select",
      "transform",
      "attacks_per_turn",
      "keyword",
      "damage",
    ].includes(op)
  ) {
    return "pool";
  }
  return "none";
}

function allowedNestedKeys(kind: NestedKind): Set<string> | null {
  switch (kind) {
    case "pool":
      return POOL_CONDITION_KEYS;
    case "card_filter":
      return CARD_FILTER_KEYS;
    case "summon_filter":
      return SUMMON_FILTER_KEYS;
    case "banish_filters":
      return BANISH_FILTERS_KEYS;
    case "keyword_filters":
      return KEYWORD_FILTERS_KEYS;
    case "return_filters":
      return RETURN_FILTERS_KEYS;
    case "cost_filter":
      return COST_FILTER_KEYS;
    case "transform_filter":
      return TRANSFORM_FILTER_KEYS;
    case "evolve_filter":
      return EVOLVE_FILTER_KEYS;
    case "countdown_filter":
      return COUNTDOWN_FILTER_KEYS;
    case "repeat_filter":
      return REPEAT_FILTER_KEYS;
    case "add_to_hand_filter":
      return ADD_TO_HAND_FILTER_KEYS;
    case "none":
      return null;
    default:
      return null;
  }
}

// discard filter: type only
const DISCARD_FILTER_KEYS = new Set(["type"]);

function resolveNestedKeys(
  op: string,
  field: "condition" | "filter" | "filters",
): Set<string> | null {
  if (op === "discard" && field === "filter") return DISCARD_FILTER_KEYS;
  const kind = nestedKindFor(op, field);
  return allowedNestedKeys(kind);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nearestKey(unknown: string, allowed: Iterable<string>): string {
  const list = [...allowed];
  if (!list.length) return "(none)";
  let best = list[0]!;
  let bestScore = Infinity;
  for (const k of list) {
    const score = levenshtein(unknown.toLowerCase(), k.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

function descSnippet(desc: string | undefined, max = 72): string {
  const one = (desc ?? "").replace(/\s+/g, " ").trim();
  if (!one) return "(no description)";
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`;
}

function statNameAllowed(eff: Record<string, unknown>): boolean {
  const atkSrc = String(eff.attack_source ?? "").toLowerCase();
  const defSrc = String(eff.defense_source ?? "").toLowerCase();
  return (
    STAT_NAME_VALUE_SOURCES.has(atkSrc) || STAT_NAME_VALUE_SOURCES.has(defSrc)
  );
}

export function collectOpsInTree(
  node: unknown,
  pathStr: string,
  out: { path: string; eff: Record<string, unknown> }[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectOpsInTree(n, `${pathStr}[${i}]`, out));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.op === "string") {
    out.push({ path: pathStr, eff: obj });
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    collectOpsInTree(v, `${pathStr}.${k}`, out);
  }
}

function collectCrestTriggerConditions(
  node: unknown,
  pathStr: string,
  out: { path: string; event?: string; cond: Record<string, unknown> }[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) =>
      collectCrestTriggerConditions(n, `${pathStr}[${i}]`, out),
    );
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.op === "crest") {
    const triggerLists: unknown[][] = [];
    if (Array.isArray(obj.triggers)) triggerLists.push(obj.triggers);
    if (obj.trigger && typeof obj.trigger === "object") {
      triggerLists.push([obj.trigger]);
    }
    for (const trigArr of triggerLists) {
      trigArr.forEach((t, i) => {
        if (!t || typeof t !== "object") return;
        const trig = t as Record<string, unknown>;
        const cond = trig.condition;
        if (cond && typeof cond === "object" && !Array.isArray(cond)) {
          out.push({
            path: `${pathStr}.triggers[${i}].condition`,
            event: typeof trig.event === "string" ? trig.event : undefined,
            cond: cond as Record<string, unknown>,
          });
        }
      });
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    collectCrestTriggerConditions(v, `${pathStr}.${k}`, out);
  }
}

export function checkTriggerConditionKeysForCard(card: CardJson): Issue[] {
  const issues: Issue[] = [];
  const sites: {
    path: string;
    event?: string;
    cond: Record<string, unknown>;
  }[] = [];

  if (Array.isArray(card.triggers)) {
    card.triggers.forEach((t, i) => {
      if (!t || typeof t !== "object") return;
      const trig = t as Record<string, unknown>;
      const cond = trig.condition;
      if (cond && typeof cond === "object" && !Array.isArray(cond)) {
        sites.push({
          path: `${card.id}.triggers[${i}].condition`,
          event: typeof trig.event === "string" ? trig.event : undefined,
          cond: cond as Record<string, unknown>,
        });
      }
    });
  }

  collectCrestTriggerConditions(card, card.id, sites);

  const damageVictimEvents = [...TRIGGER_EVENTS_WITH_DAMAGE_VICTIM]
    .sort()
    .join(", ");

  for (const { path: condPath, event, cond } of sites) {
    for (const key of Object.keys(cond)) {
      if (!TRIGGER_CONDITION_KEYS.has(key)) {
        const alt = nearestKey(key, TRIGGER_CONDITION_KEYS);
        issues.push({
          id: card.id,
          name: card.name,
          kind: "error",
          message: `trigger condition at ${condPath} has unsupported key "${key}" (try "${alt}"?) — ${descSnippet(card.description)}`,
        });
        continue;
      }
      if (
        key === "still_alive" &&
        (!event || !TRIGGER_EVENTS_WITH_DAMAGE_VICTIM.has(event))
      ) {
        const eventLabel = event ?? "(missing event)";
        issues.push({
          id: card.id,
          name: card.name,
          kind: "error",
          message: `trigger condition at ${condPath} uses "still_alive" but event "${eventLabel}" is not a damage-victim event (allowed: ${damageVictimEvents}) — ${descSnippet(card.description)}`,
        });
      }
    }
  }

  return issues;
}

function checkOpTopLevelKeysForCard(card: CardJson): Issue[] {
  const issues: Issue[] = [];
  const found: { path: string; eff: Record<string, unknown> }[] = [];
  collectOpsInTree(card, card.id, found);

  for (const { path: opPath, eff } of found) {
    const op = String(eff.op);
    const allowed = OP_TOP_LEVEL_KEYS[op];
    if (!allowed) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `unknown op "${op}" at ${opPath} — not in OP_TOP_LEVEL_KEYS (${descSnippet(card.description)})`,
      });
      continue;
    }

    for (const key of Object.keys(eff)) {
      if (key === "op") continue;
      if (allowed.has(key)) continue;

      // stat: name only when named_enter_count sources
      if (op === "stat" && key === "name" && statNameAllowed(eff)) continue;

      if (OP_WARN_TOP_LEVEL_KEYS[op]?.has(key)) {
        issues.push({
          id: card.id,
          name: card.name,
          kind: "warn",
          message: `${op} op at ${opPath} uses top-level "${key}" (PENDING: destroy count_source unimplemented — fix brief follows (Congregant 10373110)) — ${descSnippet(card.description)}`,
        });
        continue;
      }

      const alt = nearestKey(key, allowed);
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${op} op at ${opPath} has unsupported top-level key "${key}" (try "${alt}"?) — ${descSnippet(card.description)}`,
      });
    }

    const actionValues = OP_ACTION_VALUES[op];
    if (actionValues && typeof eff.action === "string") {
      const action = String(eff.action);
      if (!actionValues.has(action)) {
        const alt = nearestKey(action, actionValues);
        issues.push({
          id: card.id,
          name: card.name,
          kind: "error",
          message: `${op} op at ${opPath} has unsupported action "${action}" (try "${alt}"?) — ${descSnippet(card.description)}`,
        });
      }
    }

    if (
      op === "stat" &&
      (eff.tribe !== undefined || eff.class !== undefined) &&
      String(eff.target ?? "").includes(":hand")
    ) {
      const bad = eff.tribe !== undefined ? "tribe" : "class";
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `stat op at ${opPath} carries top-level "${bad}" on hand route — use filter.${bad} — ${descSnippet(card.description)}`,
      });
    }

    for (const field of ["condition", "filter", "filters"] as const) {
      const val = eff[field];
      if (val == null) continue;
      if (typeof val === "string") continue; // position filter / gate condition name
      if (typeof val !== "object" || Array.isArray(val)) continue;

      const nestedAllowed = resolveNestedKeys(op, field);
      if (!nestedAllowed) continue;

      for (const nk of Object.keys(val as Record<string, unknown>)) {
        if (REJECTED_NESTED_KEYS.has(nk) || !nestedAllowed.has(nk)) {
          const alt = nearestKey(nk, nestedAllowed);
          const hint = REJECTED_NESTED_KEYS.has(nk)
            ? `rejected key (no reader) — use "${nk === "card_type" || nk === "type_eq" ? "type" : alt}"`
            : `unsupported — try "${alt}"`;
          issues.push({
            id: card.id,
            name: card.name,
            kind: "error",
            message: `${op} op at ${opPath}.${field} has ${hint} key "${nk}" — ${descSnippet(card.description)}`,
          });
        }
      }

      if (
        field === "condition" &&
        OPS_CARD_NARROWING_IN_FILTER.has(op) &&
        typeof val === "object" &&
        !Array.isArray(val)
      ) {
        for (const nk of Object.keys(val as Record<string, unknown>)) {
          if (!CARD_CONDITION_KEYS.has(nk)) continue;
          issues.push({
            id: card.id,
            name: card.name,
            kind: "error",
            message: `${op} op at ${opPath}.condition carries card-narrowing key "${nk}" — use filter.{${nk}} (condition is for pool-only keys ${[...POOL_ONLY_CONDITION_KEYS].join("/")}) — ${descSnippet(card.description)}`,
          });
        }
      }
    }
  }

  return issues;
}

export function checkOpKeysForCard(card: CardJson): Issue[] {
  return [
    ...checkOpTopLevelKeysForCard(card),
    ...checkTriggerConditionKeysForCard(card),
  ];
}
