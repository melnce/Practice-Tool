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

/** Owner rulings that justify a max_per_turn cap (bible overrides printed text). */
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

  const enhanceMatch = desc.match(/enhance \((\d+)\):/i);
  if (enhanceMatch) {
    const cost = Number(enhanceMatch[1]);
    const enhanceKw = (kws ?? []).find(
      (k) =>
        k &&
        typeof k === "object" &&
        String((k as { name?: string }).name ?? "").toLowerCase() === "enhance",
    ) as { cost?: number } | undefined;
    if (!enhanceKw) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: effectCompletenessKind,
        status,
        message: `Description has Enhance (${cost}) but JSON lacks Enhance keyword`,
      });
    } else if (Number(enhanceKw.cost) !== cost) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        status,
        message: `Enhance cost in text (${cost}) != JSON (${enhanceKw.cost})`,
      });
    }
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
  const gateMode = gateAddToHand || gateStatOp;

  const files = listSetFiles(setArg);
  const allIssues: Issue[] = [];
  const allHints: ClauseHint[] = [];
  let cardCount = 0;

  console.log(
    gateAddToHand
      ? "🔍 Checking add_to_hand field contracts...\n"
      : gateStatOp
        ? "🔍 Checking stat op filter field contracts...\n"
        : "🔍 Checking card description ↔ JSON structure...\n",
  );

  for (const file of files) {
    const cards = JSON.parse(fs.readFileSync(file, "utf-8")) as CardJson[];
    cardCount += cards.length;
    for (const card of cards) {
      if (gateMode) {
        if (gateAddToHand) allIssues.push(...checkAddToHand(card));
        if (gateStatOp) allIssues.push(...checkStatOpFilters(card));
      } else {
        allIssues.push(...checkCard(card));
        allHints.push(...clauseHintsForCard(card));
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
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          note: "Informational only — not a CI gate. High-signal heuristics with known false-positive risk.",
          count: allHints.length,
          hints: allHints,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `📝 Clause-fidelity hints: ${allHints.length} (report only) → ${path.relative(ROOT, reportPath)}`,
    );
  }

  if (!errors.length && !warns.length) {
    console.log(
      gateAddToHand
        ? `✅ ${cardCount} cards — all add_to_hand ops have valid fields.\n`
        : gateStatOp
          ? `✅ ${cardCount} cards — all stat ops use supported filter fields.\n`
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
