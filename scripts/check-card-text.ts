#!/usr/bin/env tsx
/**
 * Mechanical check: card JSON structure vs written description.
 * Flags authoring mismatches (wrong/missing ops, keywords). Does NOT assert engine behavior.
 *
 * Run: npm run check:card-text
 *      npm run check:card-text -- --set 10000_basic
 */

import fs from "fs";
import path from "path";
import { SETS_DIR } from "./mergeSets.js";

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
};

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

function hasKeyword(keywords: unknown[] | undefined, name: string): boolean {
  const lower = name.toLowerCase();
  return keywordNames(keywords).some((k) => k.toLowerCase() === lower);
}

function lastWordsEffects(keywords: unknown[] | undefined): unknown[] {
  if (!Array.isArray(keywords)) return [];
  for (const k of keywords) {
    if (
      k &&
      typeof k === "object" &&
      (k as { name?: string }).name === "LastWords"
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

function checkCard(card: CardJson): Issue[] {
  const issues: Issue[] = [];
  const desc = card.description ?? "";
  const descLower = desc.toLowerCase();
  const kws = card.keywords;
  const ops = new Set<string>();
  for (const root of allEffectRoots(card)) collectOps(root, ops);

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
        kind: "error",
        message: `Description mentions "${label}" as card keyword but keyword is missing from JSON`,
      });
    }
  };

  expectKw("Ward", hasKeyword(kws, "Ward"));
  expectKw("Storm", hasKeyword(kws, "Storm"), /^storm\b/i);
  expectKw("Rush", hasKeyword(kws, "Rush"), /^rush\b/i);
  expectKw("Bane", hasKeyword(kws, "Bane"), /^bane\b/i);

  if (/last words:/i.test(desc) && !hasKeyword(kws, "LastWords")) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: "Description has Last Words but JSON lacks LastWords keyword",
    });
  }

  if (/fanfare:/i.test(desc) && !(card.fanfare?.length ?? 0)) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: "Description has Fanfare but fanfare[] is empty",
    });
  }

  if (/super-evolve:/i.test(desc) && !(card.superevolve?.length ?? 0)) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
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
      kind: "error",
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
        (k as { name?: string }).name === "Enhance",
    ) as { cost?: number } | undefined;
    if (!enhanceKw) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `Description has Enhance (${cost}) but JSON lacks Enhance keyword`,
      });
    } else if (Number(enhanceKw.cost) !== cost) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `Enhance cost in text (${cost}) != JSON (${enhanceKw.cost})`,
      });
    }
  }

  if (/countdown \(\d+\)/i.test(desc) && !hasKeyword(kws, "Countdown")) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "warn",
      message:
        "Description mentions Countdown but Countdown keyword missing (may use inline field)",
    });
  }

  if (/^engage:/im.test(desc) && !hasKeyword(kws, "Engage")) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "warn",
      message: "Description mentions Engage but Engage keyword missing",
    });
  }

  if (/draw a card/i.test(desc) && !ops.has("draw") && !ops.has("search")) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: 'Description says "Draw a card" but no draw/search op in JSON',
    });
  }

  if (card.type === "Spell" && desc.trim() && !(card.spell?.length ?? 0)) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
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
      message: "Card has effects in JSON but empty description",
    });
  }

  return issues;
}

function main() {
  const setArg =
    process.argv.find((a) => a.startsWith("--set="))?.split("=")[1] ??
    (process.argv.includes("--set")
      ? process.argv[process.argv.indexOf("--set") + 1]
      : undefined);

  const files = listSetFiles(setArg);
  const allIssues: Issue[] = [];
  let cardCount = 0;

  console.log("🔍 Checking card description ↔ JSON structure...\n");

  for (const file of files) {
    const cards = JSON.parse(fs.readFileSync(file, "utf-8")) as CardJson[];
    cardCount += cards.length;
    for (const card of cards) {
      allIssues.push(...checkCard(card));
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

  if (!errors.length && !warns.length) {
    console.log(
      `✅ ${cardCount} cards — no description/JSON mismatches found.\n`,
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
