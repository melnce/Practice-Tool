#!/usr/bin/env tsx
/**
 * Mechanical check: card JSON structure vs written description.
 * Flags authoring mismatches (wrong/missing ops, keywords). Does NOT assert engine behavior.
 *
 * Unimplemented stubs (derived via cardImplementationStatus) skip effect-completeness
 * errors — they are expected to have rules text without ops. Evergreen keyword
 * presence is still checked when the ingest extracted them.
 *
 * Also gates add_to_hand field contracts (name/count/source) across the whole card
 * tree — including crest definitions nested under fanfare — so play-time throws
 * from misspelled fields become check failures instead.
 *
 * Clause-fidelity heuristics (until-EOT without duration, unjustified max_per_turn)
 * are written to reports/clause-fidelity-hints.json as a REPORT, not a gate.
 *
 * Run: npm run check:card-text
 *      npm run check:card-text -- --set 10000_basic
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SETS_DIR } from "./mergeSets.js";
import { checkOpKeysForCard } from "./op-keys-gate.js";
import {
  getImplementationStatus,
  type ImplementationStatus,
} from "../src/data/cardImplementationStatus.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

type CardJson = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  fanfare?: unknown[];
  evolve?: unknown[];
  superevolve?: unknown[];
  spell?: unknown[];
  keywords?: unknown[];
  triggers?: unknown[];
};

type Issue = {
  id: string;
  name: string;
  kind: "error" | "warn";
  message: string;
  status?: ImplementationStatus;
};

type ClauseHint = {
  id: string;
  name: string;
  kind: "until_eot_missing" | "max_per_turn_without_ruling";
  message: string;
};

type NumericDriftHint = {
  id: string;
  name: string;
  check:
    | "countdown"
    | "enhance_multiset"
    | "necromancy"
    | "earth_rite"
    | "accelerate"
    | "crystallize"
    | "damage_amount"
    | "stat_bonus"
    | "draw_count";
  message: string;
  textValue: string | number;
  jsonValue: string | number;
};

type NumericDriftScanStat = {
  check: NumericDriftHint["check"];
  scanned: number;
  flagged: number;
};

const NUMERIC_DRIFT_CHECKS: NumericDriftHint["check"][] = [
  "countdown",
  "enhance_multiset",
  "necromancy",
  "earth_rite",
  "accelerate",
  "crystallize",
  "damage_amount",
  "stat_bonus",
  "draw_count",
];

/** Drift checks with known baseline findings — report-only until individually triaged. */
const NUMERIC_DRIFT_HINT_ONLY_CHECKS = new Set<NumericDriftHint["check"]>([
  "damage_amount",
  "stat_bonus",
]);
const MAX_PER_TURN_RULING_IDS = new Set([
  "10344110", // Azurifrit — bible line 422: up to 3 activations per turn
]);

/** Fields accepted on add_to_hand (plus op). Unknown keys fail the check. */
const ADD_TO_HAND_ALLOWED = new Set([
  "op",
  "source",
  "name",
  "count",
  "target",
  "from", // exact-copy zone sample (ally/enemy hand|deck)
  "player",
  "keywords",
  // occasional authoring that the normalizer ignores but is not a crash typo
  "filter",
  "distinct_by",
  "distribution",
  "select",
  "condition",
]);

function listSetFiles(setFilter?: string): string[] {
  const files = fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (!setFilter) return files.map((f) => path.join(SETS_DIR, f));
  const needle = setFilter.replace(/\.json$/, "");
  const match = files.filter(
    (f) => f === `${needle}.json` || f.includes(needle),
  );
  if (!match.length) {
    throw new Error(`No set file matching "${setFilter}" in ${SETS_DIR}`);
  }
  return match.map((f) => path.join(SETS_DIR, f));
}

function keywordNames(keywords: unknown[] | undefined): string[] {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((k) => {
      if (typeof k === "string") return k;
      if (k && typeof k === "object" && "name" in k)
        return String((k as { name: string }).name);
      return "";
    })
    .filter(Boolean);
}

function normalizeKwName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, "");
}

function hasKeyword(keywords: unknown[] | undefined, name: string): boolean {
  const target = normalizeKwName(name);
  return keywordNames(keywords).some((k) => normalizeKwName(k) === target);
}

function lastWordsEffects(keywords: unknown[] | undefined): unknown[] {
  if (!Array.isArray(keywords)) return [];
  for (const k of keywords) {
    if (
      k &&
      typeof k === "object" &&
      normalizeKwName(String((k as { name?: string }).name ?? "")) ===
        "lastwords"
    ) {
      return Array.isArray((k as { effects?: unknown[] }).effects)
        ? (k as { effects: unknown[] }).effects
        : [];
    }
  }
  return [];
}

function collectOps(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectOps(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.op === "string") out.add(obj.op);
  for (const v of Object.values(obj)) collectOps(v, out);
}

function asArray<T>(v: T[] | T | undefined | null): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v as T];
}

function allEffectRoots(card: CardJson): unknown[] {
  const roots: unknown[] = [];
  roots.push(...asArray(card.spell));
  roots.push(...asArray(card.fanfare));
  roots.push(...asArray(card.evolve));
  roots.push(...asArray(card.superevolve));
  roots.push(...asArray(card.triggers));
  roots.push(...lastWordsEffects(card.keywords));
  for (const k of card.keywords ?? []) {
    if (k && typeof k === "object") {
      const kw = k as { name?: string; effects?: unknown[] };
      if (kw.name === "Engage" && kw.effects) roots.push(...kw.effects);
      if (kw.name === "Enhance" && kw.effects) roots.push(...kw.effects);
      if (kw.name === "Countdown" && kw.effects) roots.push(...kw.effects);
    }
  }
  return roots;
}

/** Walk every object in the card JSON (including crest defs) for add_to_hand ops. */
function collectAddToHandOps(
  node: unknown,
  pathStr: string,
  out: { path: string; eff: Record<string, unknown> }[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectAddToHandOps(n, `${pathStr}[${i}]`, out));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.op === "add_to_hand") {
    out.push({ path: pathStr, eff: obj });
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    collectAddToHandOps(v, `${pathStr}.${k}`, out);
  }
}

/** Walk every object in the card JSON for stat ops with legacy top-level filters. */
function collectStatOps(
  node: unknown,
  pathStr: string,
  out: { path: string; eff: Record<string, unknown> }[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectStatOps(n, `${pathStr}[${i}]`, out));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.op === "stat") {
    out.push({ path: pathStr, eff: obj });
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    collectStatOps(v, `${pathStr}.${k}`, out);
  }
}

const STAT_NAME_VALUE_SOURCES = new Set(["named_enter_count"]);

function statNameConsumedAsValue(eff: Record<string, unknown>): boolean {
  const atkSrc = String(eff.attack_source ?? "").toLowerCase();
  const defSrc = String(eff.defense_source ?? "").toLowerCase();
  return (
    STAT_NAME_VALUE_SOURCES.has(atkSrc) || STAT_NAME_VALUE_SOURCES.has(defSrc)
  );
}

function checkStatOpFilters(card: CardJson): Issue[] {
  const issues: Issue[] = [];
  const found: { path: string; eff: Record<string, unknown> }[] = [];
  collectStatOps(card, card.id, found);

  for (const { path: opPath, eff } of found) {
    if (eff.not_self !== undefined) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `stat op at ${opPath} uses top-level "not_self" (ignored by engine) — use "filter": {"not_self": true} instead`,
      });
    }
    if (eff.name !== undefined && !statNameConsumedAsValue(eff)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `stat op at ${opPath} uses top-level "name" for targeting (ignored by engine) — use "name_filter" or "target": "ally:last_summoned" instead`,
      });
    }
  }
  return issues;
}

function collectDestroyOps(
  node: unknown,
  pathStr: string,
  out: { path: string; eff: Record<string, unknown> }[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectDestroyOps(n, `${pathStr}[${i}]`, out));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.op === "destroy") {
    out.push({ path: pathStr, eff: obj });
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    collectDestroyOps(v, `${pathStr}.${k}`, out);
  }
}

function checkDestroyOpFilters(card: CardJson): Issue[] {
  const issues: Issue[] = [];
  const found: { path: string; eff: Record<string, unknown> }[] = [];
  collectDestroyOps(card, card.id, found);

  for (const { path: opPath, eff } of found) {
    if (eff.not_self !== undefined) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `destroy op at ${opPath} uses top-level "not_self" (ignored by engine) — use "filter": {"not_self": true} instead`,
      });
    }
  }
  return issues;
}

function nodeHasUntilEotOrDuration(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) {
    return node.some((n) => nodeHasUntilEotOrDuration(n));
  }
  const obj = node as Record<string, unknown>;
  if (obj.until_eot === true) return true;
  if (typeof obj.duration === "string" || typeof obj.duration === "number")
    return true;
  if (
    typeof obj.duration === "string" &&
    /eot|end.?of.?turn/i.test(obj.duration)
  )
    return true;
  return Object.values(obj).some((v) => nodeHasUntilEotOrDuration(v));
}

function collectMaxPerTurn(
  node: unknown,
  out: { path: string; max: number }[],
  pathStr = "",
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectMaxPerTurn(n, out, `${pathStr}[${i}]`));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.max_per_turn === "number" && obj.max_per_turn > 0) {
    out.push({ path: pathStr || "root", max: obj.max_per_turn });
  }
  for (const [k, v] of Object.entries(obj)) {
    collectMaxPerTurn(v, out, pathStr ? `${pathStr}.${k}` : k);
  }
}

function checkAddToHand(card: CardJson): Issue[] {
  const issues: Issue[] = [];
  const found: { path: string; eff: Record<string, unknown> }[] = [];
  collectAddToHandOps(card, card.id, found);

  for (const { path: opPath, eff } of found) {
    const keys = Object.keys(eff);
    const unknownKeys = keys.filter((k) => !ADD_TO_HAND_ALLOWED.has(k));
    // Classic footgun: card_name instead of name
    if (unknownKeys.length) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `add_to_hand at ${opPath} has unknown/misspelled field(s): ${unknownKeys.join(", ")} (allowed: ${[...ADD_TO_HAND_ALLOWED].filter((k) => k !== "op").join(", ")})`,
      });
    }

    const sourceRaw = String(eff.source || "named")
      .toLowerCase()
      .trim();
    const source =
      sourceRaw === "copy"
        ? "copy"
        : sourceRaw === "destroyed_match"
          ? "destroyed_match"
          : "named";

    if (source === "named") {
      if (
        !(typeof eff.name === "string" && eff.name.trim()) &&
        !unknownKeys.includes("card_name")
      ) {
        // If card_name was present we already errored on unknown keys; still
        // require name when it's simply missing.
        issues.push({
          id: card.id,
          name: card.name,
          kind: "error",
          message: `add_to_hand at ${opPath} (source=named) requires "name"`,
        });
      }
    } else if (source === "copy" && !eff.target && !eff.from) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `add_to_hand at ${opPath} (source=copy) requires "target" or "from"`,
      });
    }

    if (eff.count === undefined) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `add_to_hand at ${opPath} requires "count"`,
      });
    } else {
      const count = parseInt(String(eff.count), 10);
      if (!Number.isFinite(count) || count < 0) {
        issues.push({
          id: card.id,
          name: card.name,
          kind: "error",
          message: `add_to_hand at ${opPath} has invalid count: ${JSON.stringify(eff.count)}`,
        });
      }
    }
  }
  return issues;
}

function clauseHintsForCard(card: CardJson): ClauseHint[] {
  const hints: ClauseHint[] = [];
  const desc = card.description ?? "";
  const descLower = desc.toLowerCase();
  const roots = allEffectRoots(card);
  // Crests / nested fanfare trees also count as ops evidence for until_eot
  const wholeCardHasUntil = nodeHasUntilEotOrDuration(card);

  if (
    /until (the )?end of (the |your |this )?turn/.test(descLower) &&
    !wholeCardHasUntil
  ) {
    hints.push({
      id: card.id,
      name: card.name,
      kind: "until_eot_missing",
      message:
        'Description says "until end of turn" but no until_eot/duration found in authored ops',
    });
  }

  const caps: { path: string; max: number }[] = [];
  collectMaxPerTurn(card, caps);
  if (caps.length && !MAX_PER_TURN_RULING_IDS.has(card.id)) {
    // Only flag when text looks like an unbounded repeating trigger
    const repeating =
      /\b(whenever|each time|every time)\b/i.test(desc) &&
      !/\b(once|up to \d+|at most \d+)\b/i.test(desc);
    if (repeating) {
      for (const cap of caps) {
        hints.push({
          id: card.id,
          name: card.name,
          kind: "max_per_turn_without_ruling",
          message: `Ops set max_per_turn=${cap.max} at ${cap.path} but description looks uncapped and no owner ruling id is listed`,
        });
      }
    }
  }

  void roots;
  return hints;
}

function sortedNumericList(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function listsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function walkEffectNodes(
  node: unknown,
  visitor: (obj: Record<string, unknown>, path: string) => void,
  path = "",
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => walkEffectNodes(n, visitor, `${path}[${i}]`));
    return;
  }
  const obj = node as Record<string, unknown>;
  visitor(obj, path);
  for (const [k, v] of Object.entries(obj)) {
    if (k === "op") continue;
    walkEffectNodes(v, visitor, path ? `${path}.${k}` : k);
  }
}

function isConditionalContainer(obj: Record<string, unknown>): boolean {
  if (obj.condition != null && obj.condition !== "") return true;
  if (obj.op === "gate" && obj.condition != null) return true;
  if (obj.op === "if") return true;
  return false;
}

function collectKeywordCosts(
  keywords: unknown[] | undefined,
  keywordName: string,
): number[] {
  const target = normalizeKwName(keywordName);
  const costs: number[] = [];
  for (const k of keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const name = normalizeKwName(String((k as { name?: string }).name ?? ""));
    if (name === target) {
      const cost = Number((k as { cost?: number }).cost);
      if (Number.isFinite(cost)) costs.push(cost);
    }
  }
  return costs;
}

function collectCountdownFromJson(card: CardJson): number[] {
  const values: number[] = [];
  for (const k of card.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const name = normalizeKwName(String((k as { name?: string }).name ?? ""));
    if (name === "countdown") {
      const turns = Number(
        (k as { turns?: number; value?: number }).turns ??
          (k as { value?: number }).value,
      );
      if (Number.isFinite(turns)) values.push(turns);
    }
  }
  const inline = Number((card as { countdown?: number }).countdown);
  if (Number.isFinite(inline)) values.push(inline);
  return values;
}

function collectNecromancyCosts(card: CardJson): number[] {
  const costs: number[] = [];
  walkEffectNodes(card, (obj) => {
    if (obj.op !== "gate") return;
    const cond = String(obj.condition ?? "").toLowerCase();
    if (cond !== "necromancy") return;
    const cost = Number(obj.cost);
    if (Number.isFinite(cost)) costs.push(cost);
  });
  return costs;
}

function collectEarthRiteCosts(card: CardJson): number[] {
  const costs: number[] = [];
  walkEffectNodes(card, (obj) => {
    if (obj.op !== "earth_rite") return;
    const cost = Number(obj.cost);
    if (Number.isFinite(cost)) costs.push(cost);
  });
  return costs;
}

function collectUnconditionalDamageOps(card: CardJson): number[] {
  const amounts: number[] = [];
  walkEffectNodes(card, (obj, path) => {
    if (obj.op !== "damage") return;
    if (obj.condition != null && obj.condition !== "") return;
    if (isInsideConditionalGate(card, path)) return;
    const amount = Number(obj.amount);
    if (Number.isFinite(amount)) amounts.push(amount);
  });
  return amounts;
}

function collectUnconditionalDrawOps(card: CardJson): number[] {
  const counts: number[] = [];
  walkEffectNodes(card, (obj, path) => {
    if (obj.op !== "draw") return;
    if (obj.condition != null && obj.condition !== "") return;
    if (isInsideConditionalGate(card, path)) return;
    const count = Number(obj.count);
    if (Number.isFinite(count)) counts.push(count);
  });
  return counts;
}

function collectUnconditionalStatOps(
  card: CardJson,
): { attack: number; defense: number }[] {
  const stats: { attack: number; defense: number }[] = [];
  walkEffectNodes(card, (obj, path) => {
    if (obj.op !== "stat") return;
    if (obj.condition != null && obj.condition !== "") return;
    if (isInsideConditionalGate(card, path)) return;
    const attack = Number(obj.attack);
    const defense = Number(obj.defense);
    if (Number.isFinite(attack) && Number.isFinite(defense)) {
      stats.push({ attack, defense });
    }
  });
  return stats;
}

function isInsideConditionalGate(card: CardJson, opPath: string): boolean {
  let inside = false;
  walkEffectNodes(card, (obj, path) => {
    if (obj.op !== "gate") return;
    if (obj.condition == null || obj.condition === "") return;
    const effectsPrefix = `${path}.effects`;
    if (opPath.startsWith(effectsPrefix)) inside = true;
  });
  return inside;
}

function extractTextCosts(desc: string, pattern: RegExp): number[] {
  const costs: number[] = [];
  const re = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g",
  );
  for (const m of desc.matchAll(re)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) costs.push(n);
  }
  return costs;
}

function extractUnconditionalDealDamageClauses(desc: string): number[] {
  const amounts: number[] = [];
  for (const line of desc.split("\n")) {
    const trimmed = line.trim();
    if (/^\d+\./.test(trimmed)) continue; // mode list item
    if (/\b(random|split between|up to)\b/i.test(trimmed)) continue;
    const m = trimmed.match(/\bdeal (\d+) damage\b/i);
    if (m) amounts.push(Number(m[1]));
  }
  return amounts;
}

function extractStatBonusClauses(
  desc: string,
): { attack: number; defense: number }[] {
  const stats: { attack: number; defense: number }[] = [];
  for (const line of desc.split("\n")) {
    const trimmed = line.trim();
    if (/^\d+\./.test(trimmed)) continue;
    const m = trimmed.match(/\+(\d+)\/\+(\d+)/);
    if (m) stats.push({ attack: Number(m[1]), defense: Number(m[2]) });
  }
  return stats;
}

function extractDrawCountClauses(desc: string): number[] {
  const counts: number[] = [];
  for (const line of desc.split("\n")) {
    const trimmed = line.trim();
    if (/^\d+\./.test(trimmed)) continue;
    const m = trimmed.match(/\bdraw (\d+) cards?\b/i);
    if (m) counts.push(Number(m[1]));
  }
  return counts;
}

function pushNumericDriftHint(
  hints: NumericDriftHint[],
  stats: Map<NumericDriftHint["check"], NumericDriftScanStat>,
  check: NumericDriftHint["check"],
  card: CardJson,
  message: string,
  textValue: string | number,
  jsonValue: string | number,
): void {
  const stat = stats.get(check) ?? { check, scanned: 0, flagged: 0 };
  stat.flagged += 1;
  stats.set(check, stat);
  hints.push({
    id: card.id,
    name: card.name,
    check,
    message,
    textValue,
    jsonValue,
  });
}

function markScanned(
  stats: Map<NumericDriftHint["check"], NumericDriftScanStat>,
  check: NumericDriftHint["check"],
): void {
  const stat = stats.get(check) ?? { check, scanned: 0, flagged: 0 };
  stat.scanned += 1;
  stats.set(check, stat);
}

function checkNumericDrift(
  card: CardJson,
  stats: Map<NumericDriftHint["check"], NumericDriftScanStat>,
): { hints: NumericDriftHint[]; errors: Issue[] } {
  const hints: NumericDriftHint[] = [];
  const errors: Issue[] = [];
  const desc = card.description ?? "";

  const recordDrift = (
    check: NumericDriftHint["check"],
    message: string,
    textValue: string | number,
    jsonValue: string | number,
  ) => {
    if (NUMERIC_DRIFT_HINT_ONLY_CHECKS.has(check)) {
      pushNumericDriftHint(
        hints,
        stats,
        check,
        card,
        message,
        textValue,
        jsonValue,
      );
    } else {
      const stat = stats.get(check) ?? { check, scanned: 0, flagged: 0 };
      stat.flagged += 1;
      stats.set(check, stat);
      errors.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message,
      });
    }
  };

  // Countdown (N) vs JSON countdown value — one text clause, one JSON value
  const textCountdowns = extractTextCosts(desc, /countdown\s*\((\d+)\)/gi);
  const jsonCountdowns = collectCountdownFromJson(card);
  if (textCountdowns.length === 1 && jsonCountdowns.length === 1) {
    markScanned(stats, "countdown");
    if (textCountdowns[0] !== jsonCountdowns[0]) {
      recordDrift(
        "countdown",
        `Countdown in text (${textCountdowns[0]}) != JSON (${jsonCountdowns[0]})`,
        textCountdowns[0],
        jsonCountdowns[0],
      );
    }
  }

  // Enhance tier-set: compare sorted text costs vs JSON keyword costs as multisets
  const textEnhance = sortedNumericList(
    extractTextCosts(desc, /enhance\s*\((\d+)\):/gi),
  );
  const jsonEnhance = sortedNumericList(
    collectKeywordCosts(card.keywords, "Enhance"),
  );
  if (textEnhance.length > 0 && jsonEnhance.length > 0) {
    markScanned(stats, "enhance_multiset");
    if (!listsEqual(textEnhance, jsonEnhance)) {
      recordDrift(
        "enhance_multiset",
        `Enhance costs in text [${textEnhance.join(", ")}] != JSON [${jsonEnhance.join(", ")}]`,
        textEnhance.join(","),
        jsonEnhance.join(","),
      );
    }
  }

  const compareCostMultiset = (
    check: NumericDriftHint["check"],
    textPattern: RegExp,
    jsonCosts: number[],
    label: string,
  ) => {
    const textCosts = sortedNumericList(extractTextCosts(desc, textPattern));
    const jsonSorted = sortedNumericList(jsonCosts);
    if (!textCosts.length || textCosts.length !== jsonSorted.length) return;
    markScanned(stats, check);
    if (!listsEqual(textCosts, jsonSorted)) {
      recordDrift(
        check,
        `${label} costs in text [${textCosts.join(", ")}] != JSON [${jsonSorted.join(", ")}]`,
        textCosts.join(","),
        jsonSorted.join(","),
      );
    }
  };

  compareCostMultiset(
    "necromancy",
    /necromancy\s*\((\d+)\)/gi,
    collectNecromancyCosts(card),
    "Necromancy",
  );
  compareCostMultiset(
    "earth_rite",
    /earth rite\s*\((\d+)\)/gi,
    collectEarthRiteCosts(card),
    "Earth Rite",
  );
  compareCostMultiset(
    "accelerate",
    /accelerate\s*\((\d+)\)/gi,
    collectKeywordCosts(card.keywords, "Accelerate"),
    "Accelerate",
  );
  compareCostMultiset(
    "crystallize",
    /crystallize\s*\((\d+)\)/gi,
    collectKeywordCosts(card.keywords, "Crystallize"),
    "Crystallize",
  );

  // Single unconditional "Deal N damage" vs one damage.amount
  const textDamage = extractUnconditionalDealDamageClauses(desc);
  const jsonDamage = collectUnconditionalDamageOps(card);
  if (textDamage.length === 1 && jsonDamage.length === 1) {
    markScanned(stats, "damage_amount");
    if (textDamage[0] !== jsonDamage[0]) {
      recordDrift(
        "damage_amount",
        `Deal damage in text (${textDamage[0]}) != JSON damage.amount (${jsonDamage[0]})`,
        textDamage[0],
        jsonDamage[0],
      );
    }
  }

  // Single +X/+Y vs one stat op
  const textStats = extractStatBonusClauses(desc);
  const jsonStats = collectUnconditionalStatOps(card);
  if (textStats.length === 1 && jsonStats.length === 1) {
    markScanned(stats, "stat_bonus");
    const t = textStats[0]!;
    const j = jsonStats[0]!;
    if (t.attack !== j.attack || t.defense !== j.defense) {
      recordDrift(
        "stat_bonus",
        `Stat bonus in text (+${t.attack}/+${t.defense}) != JSON stat op (+${j.attack}/+${j.defense})`,
        `+${t.attack}/+${t.defense}`,
        `+${j.attack}/+${j.defense}`,
      );
    }
  }

  // Single "Draw N card(s)" vs one draw.count
  const textDraws = extractDrawCountClauses(desc);
  const jsonDraws = collectUnconditionalDrawOps(card);
  if (textDraws.length === 1 && jsonDraws.length === 1) {
    markScanned(stats, "draw_count");
    if (textDraws[0] !== jsonDraws[0]) {
      recordDrift(
        "draw_count",
        `Draw count in text (${textDraws[0]}) != JSON draw.count (${jsonDraws[0]})`,
        textDraws[0],
        jsonDraws[0],
      );
    }
  }

  return { hints, errors };
}

function checkCard(card: CardJson): Issue[] {
  const issues: Issue[] = [];
  const status = getImplementationStatus(card);
  const desc = card.description ?? "";
  const kws = card.keywords;
  const ops = new Set<string>();
  for (const root of allEffectRoots(card)) collectOps(root, ops);

  // Unimplemented stubs: skip effect-completeness errors (text without ops is expected).
  // Still surface evergreen keyword mismatches as warnings so ingest quality is visible.
  const effectCompletenessKind: "error" | "warn" =
    status === "unimplemented" ? "warn" : "error";

  const expectKw = (label: string, present: boolean, linePattern?: RegExp) => {
    const lines = desc.split("\n");
    const mentionsOnOwnLine = lines.some((line) =>
      linePattern
        ? linePattern.test(line.trim())
        : new RegExp(`^${label}\\b`, "i").test(line.trim()),
    );
    if (mentionsOnOwnLine && !present) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: status === "unimplemented" ? "warn" : "error",
        status,
        message: `Description mentions "${label}" as card keyword but keyword is missing from JSON`,
      });
    }
  };

  expectKw("Ward", hasKeyword(kws, "Ward"));
  expectKw("Storm", hasKeyword(kws, "Storm"), /^storm\b/i);
  expectKw("Rush", hasKeyword(kws, "Rush"), /^rush\b/i);
  expectKw("Bane", hasKeyword(kws, "Bane"), /^bane\b/i);

  if (
    desc.split("\n").some((line) => /^last words:/i.test(line.trim())) &&
    !hasKeyword(kws, "LastWords")
  ) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: effectCompletenessKind,
      status,
      message: "Description has Last Words but JSON lacks LastWords keyword",
    });
  }

  if (/fanfare:/i.test(desc) && !(card.fanfare?.length ?? 0)) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: effectCompletenessKind,
      status,
      message: "Description has Fanfare but fanfare[] is empty",
    });
  }

  if (/super-evolve:/i.test(desc) && !(card.superevolve?.length ?? 0)) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: effectCompletenessKind,
      status,
      message: "Description has Super-Evolve but superevolve[] is empty",
    });
  }

  // Evolve: on its own line (not Super-Evolve, not "Combo - Evolve this follower" fanfare text only)
  const hasEvoLine = desc
    .split("\n")
    .some((line) => /^evolve:/i.test(line.trim()));
  if (hasEvoLine && !(card.evolve?.length ?? 0)) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: effectCompletenessKind,
      status,
      message: "Description has Evolve: line but evolve[] is empty",
    });
  }

  const textEnhanceCosts = extractTextCosts(desc, /enhance\s*\((\d+)\):/gi);
  if (
    textEnhanceCosts.length > 0 &&
    !collectKeywordCosts(kws, "Enhance").length
  ) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: effectCompletenessKind,
      status,
      message: `Description has Enhance (${textEnhanceCosts[0]}) but JSON lacks Enhance keyword`,
    });
  }

  if (/countdown \(\d+\)/i.test(desc) && !hasKeyword(kws, "Countdown")) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "warn",
      status,
      message:
        "Description mentions Countdown but Countdown keyword missing (may use inline field)",
    });
  }

  if (/^engage:/im.test(desc) && !hasKeyword(kws, "Engage")) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "warn",
      status,
      message: "Description mentions Engage but Engage keyword missing",
    });
  }

  if (/draw a card/i.test(desc) && !ops.has("draw") && !ops.has("search")) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: effectCompletenessKind,
      status,
      message: 'Description says "Draw a card" but no draw/search op in JSON',
    });
  }

  if (
    card.type === "Spell" &&
    desc.trim() &&
    !(card.spell?.length ?? 0) &&
    !(card.fanfare?.length ?? 0)
  ) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: effectCompletenessKind,
      status,
      message: "Spell has description but spell[] is empty",
    });
  }

  if (
    !desc.trim() &&
    (card.fanfare?.length || card.spell?.length || lastWordsEffects(kws).length)
  ) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "warn",
      status,
      message: "Card has effects in JSON but empty description",
    });
  }

  // Gate: add_to_hand field contracts (includes crest-nested ops)
  issues.push(...checkAddToHand(card));
  issues.push(...checkStatOpFilters(card));

  return issues;
}

function main() {
  const setArg =
    process.argv.find((a) => a.startsWith("--set="))?.split("=")[1] ??
    (process.argv.includes("--set")
      ? process.argv[process.argv.indexOf("--set") + 1]
      : undefined);

  const gateAddToHand =
    process.argv.includes("--gate=add-to-hand") ||
    process.argv.includes("--gate=add_to_hand");
  const gateStatOp =
    process.argv.includes("--gate=stat-op") ||
    process.argv.includes("--gate=stat_op");
  const gateDestroyOp =
    process.argv.includes("--gate=destroy-op") ||
    process.argv.includes("--gate=destroy_op");
  const gateOpKeys =
    process.argv.includes("--gate=op-keys") ||
    process.argv.includes("--gate=op_keys");
  const gateMode = gateAddToHand || gateStatOp || gateDestroyOp || gateOpKeys;

  const files = listSetFiles(setArg);
  const allIssues: Issue[] = [];
  const allHints: ClauseHint[] = [];
  const allNumericDriftHints: NumericDriftHint[] = [];
  const numericDriftStats = new Map<
    NumericDriftHint["check"],
    NumericDriftScanStat
  >();
  let cardCount = 0;

  console.log(
    gateAddToHand
      ? "🔍 Checking add_to_hand field contracts...\n"
      : gateStatOp
        ? "🔍 Checking stat op filter field contracts...\n"
        : gateDestroyOp
          ? "🔍 Checking destroy op filter field contracts...\n"
          : gateOpKeys
            ? "🔍 Checking op-keys field contracts...\n"
            : "🔍 Checking card description ↔ JSON structure...\n",
  );

  for (const file of files) {
    const cards = JSON.parse(fs.readFileSync(file, "utf-8")) as CardJson[];
    cardCount += cards.length;
    for (const card of cards) {
      if (gateMode) {
        if (gateAddToHand) allIssues.push(...checkAddToHand(card));
        if (gateStatOp) allIssues.push(...checkStatOpFilters(card));
        if (gateDestroyOp) allIssues.push(...checkDestroyOpFilters(card));
        if (gateOpKeys) allIssues.push(...checkOpKeysForCard(card));
      } else {
        allIssues.push(...checkCard(card));
        allHints.push(...clauseHintsForCard(card));
        const drift = checkNumericDrift(card, numericDriftStats);
        allNumericDriftHints.push(...drift.hints);
        allIssues.push(...drift.errors);
      }
    }
  }

  const errors = allIssues.filter((i) => i.kind === "error");
  const warns = allIssues.filter((i) => i.kind === "warn");

  if (errors.length) {
    console.log(`❌ ${errors.length} error(s):\n`);
    for (const i of errors) {
      console.log(`  [${i.id}] ${i.name}: ${i.message}`);
    }
    console.log("");
  }

  if (warns.length) {
    console.log(`⚠️  ${warns.length} warning(s):\n`);
    for (const i of warns) {
      console.log(`  [${i.id}] ${i.name}: ${i.message}`);
    }
    console.log("");
  }

  if (!gateMode) {
    const reportPath = path.join(ROOT, "reports", "clause-fidelity-hints.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const driftStatsList = NUMERIC_DRIFT_CHECKS.map((check) => {
      const s = numericDriftStats.get(check);
      return s ?? { check, scanned: 0, flagged: 0 };
    });
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          note: "Informational only — not a CI gate. High-signal heuristics with known false-positive risk.",
          clause_fidelity: {
            count: allHints.length,
            hints: allHints,
          },
          numeric_drift: {
            note: "Precision-first text↔JSON numeric cross-checks. Drift hints are report-only until individually triaged.",
            count: allNumericDriftHints.length,
            scan_stats: driftStatsList,
            hints: allNumericDriftHints,
          },
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `📝 Clause-fidelity hints: ${allHints.length} (report only) → ${path.relative(ROOT, reportPath)}`,
    );
    console.log("📊 Numeric-drift scan stats (report only):");
    for (const s of driftStatsList) {
      console.log(`   ${s.check}: scanned ${s.scanned}, flagged ${s.flagged}`);
    }
    if (allNumericDriftHints.length) {
      console.log(
        `📝 Numeric-drift hints: ${allNumericDriftHints.length} (report only)`,
      );
    }
  }

  if (!errors.length && !warns.length) {
    console.log(
      gateAddToHand
        ? `✅ ${cardCount} cards — all add_to_hand ops have valid fields.\n`
        : gateStatOp
          ? `✅ ${cardCount} cards — all stat ops use supported filter fields.\n`
          : gateDestroyOp
            ? `✅ ${cardCount} cards — all destroy ops use supported filter fields.\n`
            : gateOpKeys
              ? `✅ ${cardCount} cards — all ops use supported keys.\n`
              : `✅ ${cardCount} cards — no description/JSON mismatches found.\n`,
    );
  } else {
    console.log(
      `   Scanned ${cardCount} cards in ${files.length} set file(s).`,
    );
    console.log("   Errors fail CI; warnings are informational.\n");
  }

  if (errors.length) process.exit(1);
}

main();
