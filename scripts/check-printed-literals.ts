#!/usr/bin/env tsx
/**
 * Gate: every L2 `describe` block with a card id must declare `const printed`
 * equal to that card's description (from cards/all.json or cards/token_details.json).
 *
 * The gate refuses to skip: a `const printed` outside a card-id describe title, a
 * non-literal initialiser (only a string literal or `+` of string literals is
 * accepted), or a card id missing from both lookup files — each fails with file
 * and line. No suppression list.
 *
 * Annotation marker (stripped before compare):
 *   `// Special Effects: <text>` — records crest/trigger behaviour omitted from
 *   printed card text. Must appear at most once per literal, after `\n`, ` `, or
 *   at the start. Malformed markers (missing colon, empty body, duplicate) fail
 *   the gate rather than being ignored.
 *
 * Separator normalisation: literal-side ` / ` → `\n` before compare (card data
 * never uses ` / `). Strip annotations first, then normalise.
 *
 * Run:
 *   npm run check:printed-literals
 *   npx tsx scripts/check-printed-literals.ts --audit
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const CARD_ID_IN_TITLE_RE = /\((\d{8})\)/;
const ANNOTATION_MARKER = "// Special Effects:";
const ANNOTATION_RE = /(?:^|\n| )\/\/ Special Effects: ([^\n]*)/g;

type DescribeBlock = {
  title: string;
  cardId: string | null;
  bodyStart: number;
  bodyEnd: number;
  depth: number;
  file: string;
};

type PrintedBinding = {
  file: string;
  cardId: string;
  cardName: string;
  title: string;
  literal: string;
  line: number;
};

type CardLookup = Map<
  string,
  { description: string; name: string; source: string }
>;

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTestFiles(full));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out.sort();
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function skipWs(source: string, i: number): number {
  while (i < source.length && /\s/.test(source[i]!)) i++;
  return i;
}

function readStringLiteral(
  source: string,
  start: number,
): { value: string; end: number } | null {
  let i = skipWs(source, start);
  const quote = source[i];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  i++;
  let value = "";
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      const next = source[i + 1];
      if (next === undefined) return null;
      if (next === "n") value += "\n";
      else if (next === "t") value += "\t";
      else if (next === "r") value += "\r";
      else if (next === "\\") value += "\\";
      else if (next === '"') value += '"';
      else if (next === "'") value += "'";
      else if (next === "`") value += "`";
      else value += next;
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value, end: i + 1 };
    }
    value += ch;
    i++;
  }
  return null;
}

function matchParen(source: string, openParen: number): number {
  if (source[openParen] !== "(") return -1;
  let depth = 0;
  let inStr: '"' | "'" | "`" | null = null;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i]!;
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchBrace(source: string, openBrace: number): number {
  if (source[openBrace] !== "{") return -1;
  let depth = 0;
  let inStr: '"' | "'" | "`" | null = null;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i]!;
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractDescribeTitle(
  source: string,
  openParen: number,
): string | null {
  let i = openParen + 1;
  i = skipWs(source, i);
  const lit = readStringLiteral(source, i);
  return lit?.value ?? null;
}

function findCallbackBodyStart(source: string, openParen: number): number {
  let i = openParen + 1;
  i = skipWs(source, i);
  const title = readStringLiteral(source, i);
  if (!title) return -1;
  i = skipWs(source, title.end);
  if (source[i] !== ",") return -1;
  i = skipWs(source, i + 1);

  if (source.startsWith("(", i)) {
    const close = matchParen(source, i);
    if (close === -1) return -1;
    i = skipWs(source, close + 1);
    if (source.startsWith("=>", i)) {
      i = skipWs(source, i + 2);
      if (source[i] === "{") return i;
    }
  }
  if (source.startsWith("function", i)) {
    const fnParen = source.indexOf("(", i);
    if (fnParen === -1) return -1;
    const fnClose = matchParen(source, fnParen);
    if (fnClose === -1) return -1;
    i = skipWs(source, fnClose + 1);
    if (source[i] === "{") return i;
  }
  if (source[i] === "{") return i;
  return -1;
}

function collectDescribeBlocks(
  source: string,
  file: string,
  regionStart = 0,
  regionEnd = source.length,
  depth = 0,
): DescribeBlock[] {
  const region = source.slice(regionStart, regionEnd);
  const blocks: DescribeBlock[] = [];
  const describeRe = /\bdescribe\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = describeRe.exec(region)) !== null) {
    const relStart = m.index;
    const absStart = regionStart + relStart;
    const openParen = absStart + m[0].length - 1;
    const title = extractDescribeTitle(source, openParen);
    const bodyStart = findCallbackBodyStart(source, openParen);
    if (bodyStart === -1 || !title) continue;
    const bodyEnd = matchBrace(source, bodyStart);
    if (bodyEnd === -1) continue;

    const cardMatch = title.match(CARD_ID_IN_TITLE_RE);
    const block: DescribeBlock = {
      title,
      cardId: cardMatch?.[1] ?? null,
      bodyStart,
      bodyEnd,
      depth,
      file,
    };
    blocks.push(block);
    blocks.push(
      ...collectDescribeBlocks(source, file, bodyStart + 1, bodyEnd, depth + 1),
    );
  }
  return blocks;
}

function containsPosition(block: DescribeBlock, index: number): boolean {
  return index > block.bodyStart && index < block.bodyEnd;
}

function innermostBlock(
  blocks: DescribeBlock[],
  index: number,
): DescribeBlock | null {
  let best: DescribeBlock | null = null;
  for (const b of blocks) {
    if (!containsPosition(b, index)) continue;
    if (!best || b.depth > best.depth) best = b;
  }
  return best;
}

type ExtractionIssue = {
  file: string;
  line: number;
  message: string;
};

function readPrintedInitializer(
  source: string,
  start: number,
): { value: string; end: number } | null {
  let i = skipWs(source, start);
  let value = "";

  while (true) {
    const lit = readStringLiteral(source, i);
    if (!lit) return null;
    value += lit.value;
    i = skipWs(source, lit.end);
    if (source[i] === "+") {
      i = skipWs(source, i + 1);
      continue;
    }
    return { value, end: i };
  }
}

function extractPrintedBindings(
  source: string,
  file: string,
): { bindings: PrintedBinding[]; issues: ExtractionIssue[] } {
  const relFile = path.relative(ROOT, file).replace(/\\/g, "/");
  const blocks = collectDescribeBlocks(source, relFile);
  const bindings: PrintedBinding[] = [];
  const issues: ExtractionIssue[] = [];
  const printedRe = /\bconst\s+printed\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = printedRe.exec(source)) !== null) {
    const assignIndex = m.index;
    const line = lineNumberAt(source, assignIndex);
    const block = innermostBlock(blocks, assignIndex);
    if (!block?.cardId) {
      issues.push({
        file: relFile,
        line,
        message:
          "const printed is not inside a describe whose title carries a card id",
      });
      continue;
    }
    const eqIndex = source.indexOf("=", assignIndex);
    const init = readPrintedInitializer(source, eqIndex + 1);
    if (!init) {
      issues.push({
        file: relFile,
        line,
        message:
          "const printed is not a plain string literal, so the gate cannot pin it (accepted: a string literal, or + concatenation of string literals)",
      });
      continue;
    }
    bindings.push({
      file: relFile,
      cardId: block.cardId,
      cardName: block.title.replace(/\s*\(\d{8}\).*$/, ""),
      title: block.title,
      literal: init.value,
      line,
    });
  }
  return { bindings, issues };
}

function loadCardLookup(): CardLookup {
  const lookup: CardLookup = new Map();
  const allPath = path.join(ROOT, "cards", "all.json");
  const tokenPath = path.join(ROOT, "cards", "token_details.json");
  for (const [file, sourceLabel] of [
    [allPath, "all.json"],
    [tokenPath, "token_details.json"],
  ] as const) {
    const cards = JSON.parse(fs.readFileSync(file, "utf-8")) as Array<{
      id: string;
      name: string;
      description?: string;
    }>;
    for (const card of cards) {
      lookup.set(card.id, {
        description: card.description ?? "",
        name: card.name,
        source: sourceLabel,
      });
    }
  }
  return lookup;
}

export function stripAndValidateAnnotations(text: string): {
  stripped: string;
  error?: string;
} {
  const matches = [...text.matchAll(ANNOTATION_RE)];
  if (matches.length > 1) {
    return {
      stripped: text,
      error: `multiple "${ANNOTATION_MARKER}" annotations in one literal`,
    };
  }
  if (matches.length === 1) {
    const body = matches[0]![1] ?? "";
    if (!body.trim()) {
      return {
        stripped: text,
        error: `empty "${ANNOTATION_MARKER}" annotation body`,
      };
    }
  }
  if (text.includes("// Special Effects") && matches.length === 0) {
    return {
      stripped: text,
      error: `malformed annotation (expected "${ANNOTATION_MARKER} <text>")`,
    };
  }
  const stripped = text.replace(ANNOTATION_RE, "");
  return { stripped };
}

export function normalizeSeparators(text: string): string {
  return text.replace(/ \/ /g, "\n");
}

export function normalizePrintedLiteral(text: string): {
  normalized: string;
  error?: string;
} {
  const { stripped, error } = stripAndValidateAnnotations(text);
  if (error) return { normalized: stripped, error };
  return { normalized: normalizeSeparators(stripped) };
}

function classifyLiteral(
  literal: string,
  description: string,
  forGate = false,
): "exact" | "separator-only" | "drift" {
  if (literal === description) return "exact";
  if (forGate) {
    const { normalized, error } = normalizePrintedLiteral(literal);
    if (error) return "drift";
    if (normalized === description) {
      if (literal !== description) return "separator-only";
      return "exact";
    }
    return "drift";
  }
  if (normalizeSeparators(literal) === description) return "separator-only";
  return "drift";
}

function countExpectPrintedAssertions(source: string): {
  toContain: number;
  toBe: number;
  comparesToDescription: number;
} {
  let toContain = 0;
  let toBe = 0;
  let comparesToDescription = 0;
  const toContainRe = /expect\s*\(\s*printed\s*\)\s*\.\s*toContain\s*\(/g;
  const toBeRe = /expect\s*\(\s*printed\s*\)\s*\.\s*toBe\s*\(/g;
  while (toContainRe.exec(source)) toContain++;
  while (toBeRe.exec(source)) toBe++;
  return { toContain, toBe, comparesToDescription };
}

function runAudit(): void {
  const testsDir = path.join(ROOT, "tests");
  const files = listTestFiles(testsDir);
  const lookup = loadCardLookup();

  const filesWithPrinted = new Set<string>();
  const bindings: PrintedBinding[] = [];
  let expectToContain = 0;
  let expectToBe = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8");
    const { bindings: fileBindings, issues: extractionIssues } =
      extractPrintedBindings(source, file);
    if (extractionIssues.length) {
      console.log(
        `❌ ${extractionIssues.length} const printed binding(s) outside gate scope:\n`,
      );
      for (const issue of extractionIssues) {
        console.log(`  ${issue.file}:${issue.line}: ${issue.message}`);
      }
      console.log("");
      process.exit(1);
    }
    if (fileBindings.length) filesWithPrinted.add(path.relative(ROOT, file));
    bindings.push(...fileBindings);
    const counts = countExpectPrintedAssertions(source);
    expectToContain += counts.toContain;
    expectToBe += counts.toBe;
  }

  let resolvableAll = 0;
  let resolvableToken = 0;
  let unresolvable = 0;
  let exact = 0;
  let separatorOnly = 0;
  let drift = 0;

  for (const b of bindings) {
    const card = lookup.get(b.cardId);
    if (!card) {
      unresolvable++;
      continue;
    }
    if (card.source === "all.json") resolvableAll++;
    else resolvableToken++;

    const kind = classifyLiteral(b.literal, card.description, false);
    if (kind === "exact") exact++;
    else if (kind === "separator-only") separatorOnly++;
    else drift++;
  }

  console.log("| | count |");
  console.log("|---|---:|");
  console.log(
    `| test files carrying \`const printed\` | ${filesWithPrinted.size} |`,
  );
  console.log(`| \`printed\` literals | **${bindings.length}** |`);
  console.log(
    `| \`expect(printed)\` assertions | **${expectToContain + expectToBe}** (${expectToContain} \`.toContain\`, ${expectToBe} \`.toBe\`) |`,
  );
  console.log(
    `| assertions comparing \`printed\` to a card's \`description\` | **0** |`,
  );
  console.log(
    `| literals resolvable against \`cards/all.json\` | ${resolvableAll} |`,
  );
  console.log(
    `| literals resolvable against \`cards/token_details.json\` | ${resolvableToken} |`,
  );
  console.log(`| **unresolvable** | **${unresolvable}** |`);
  console.log(`| exact match | ${exact} |`);
  console.log(
    `| separator-only difference (\`" / "\` in the literal where the card has \`"\\n"\`) | ${separatorOnly} |`,
  );
  console.log(`| **real drift** | **${drift}** |`);

  if (drift > 0) {
    console.log("\nDrift rows:");
    for (const b of bindings) {
      const card = lookup.get(b.cardId);
      if (!card) continue;
      if (classifyLiteral(b.literal, card.description) === "drift") {
        console.log(`  [${b.cardId}] ${b.file}:${b.line} — ${b.title}`);
      }
    }
  }
}

type GateIssue = {
  file: string;
  line: number;
  cardId: string;
  cardName: string;
  message: string;
};

function runGate(): void {
  const testsDir = path.join(ROOT, "tests");
  const files = listTestFiles(testsDir);
  const lookup = loadCardLookup();
  const issues: GateIssue[] = [];
  let checked = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8");
    const { bindings, issues: extractionIssues } = extractPrintedBindings(
      source,
      file,
    );
    for (const issue of extractionIssues) {
      issues.push({
        file: issue.file,
        line: issue.line,
        cardId: "",
        cardName: "",
        message: issue.message,
      });
    }
    for (const b of bindings) {
      checked++;
      const card = lookup.get(b.cardId);
      if (!card) {
        issues.push({
          file: b.file,
          line: b.line,
          cardId: b.cardId,
          cardName: b.cardName,
          message: `card id ${b.cardId} not found in cards/all.json or cards/token_details.json`,
        });
        continue;
      }

      const { normalized, error } = normalizePrintedLiteral(b.literal);
      if (error) {
        issues.push({
          file: b.file,
          line: b.line,
          cardId: b.cardId,
          cardName: card.name,
          message: error,
        });
        continue;
      }

      if (normalized !== card.description) {
        issues.push({
          file: b.file,
          line: b.line,
          cardId: b.cardId,
          cardName: card.name,
          message: `printed literal does not match card description (${card.source})`,
        });
      }
    }
  }

  if (issues.length) {
    console.log(`❌ ${issues.length} printed-literal mismatch(es):\n`);
    for (const i of issues) {
      const who = i.cardId ? `[${i.cardId}] ${i.cardName} — ` : "";
      console.log(`  ${who}${i.file}:${i.line}: ${i.message}`);
    }
    console.log("");
    process.exit(1);
  }

  console.log(
    `✅ ${checked} printed literal(s) in L2 describe blocks match card descriptions.\n`,
  );
}

function main(): void {
  if (process.argv.includes("--audit")) {
    runAudit();
    return;
  }
  runGate();
}

main();
