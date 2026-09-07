/**
 * Subjecthood analyzer — measures whether collectibles are named as subjects in
 * human-written test titles (not merely present as board filler in test bodies).
 *
 * COUNTING RULES (every reported number depends on these; do not change silently)
 *
 * Pool
 * - Collectibles from cards/all.json plus tokens from cards/token_details.json
 *   (904-card behaviour pool). Metrics are reported for the full pool.
 *
 * Subject / asserting block
 * - An asserting block is an `it()` or `test()` call (including `.skip`, `.only`,
 *   `.todo`, `.fails` variants). `describe()` titles do not count as asserting
 *   blocks on their own.
 * - A card is the subject of an asserting block when its id or matchable name
 *   appears in that block's composed title (see nested describes below).
 * - Matching uses composed titles only — never test bodies, comments, or string
 *   literals inside implementation code.
 *
 * Nested describe composition (`inheritDescribeTitles`, default true)
 * - When true, each asserting block inherits all ancestor `describe()` titles
 *   from the same file, joined with " › " (e.g. "Warden of Selflessness (10903110)
 *   › applies Barrier to allies").
 * - Justification: most card tests name the card once in an outer describe and
 *   write generic `it` titles underneath; without inheritance those cards would
 *   falsely read as zero-subject.
 * - Set `inheritDescribeTitles: false` to require the card id/name in the `it`/
 *   `test` title itself (stricter; useful for sensitivity analysis).
 *
 * Id matching
 * - Card id must appear as an 8-digit token (word boundary) in the composed title.
 *
 * Name matching
 * - Full printed name, case-insensitive, with word boundaries at both ends.
 * - Names shorter than MIN_NAME_MATCH_LENGTH (9) are never matched by name — only
 *   by id — because very short names ("Goblin", "Ward", "Fury") collide with unrelated
 *   prose. This is intentional: generic names must be cited by id in test titles.
 * - Names of length ≥ MIN_NAME_MATCH_LENGTH may still be ambiguous; the report
 *   includes `matchedByNameOnly` so false-positive surface is visible.
 *
 * Mentioned / filler / never mentioned
 * - "Mentioned" = card id or matchable name appears anywhere in a scanned test
 *   file (title or body).
 * - "Mentioned only as filler" = zero asserting-block subjects but mentioned in
 *   ≥1 test file.
 * - "Never mentioned" = does not appear in any scanned test file.
 *
 * Clause count (per card JSON)
 * - +1 fanfare when fanfare[] is non-empty
 * - +1 spell when spell[] is non-empty
 * - +1 evolve when evolve[] is non-empty
 * - +1 superevolve when superevolve[] is non-empty
 * - +1 per triggers[] entry whose effects[] is non-empty
 * - +1 per keywords[] entry that has non-empty effects[] or non-empty
 *   amuletKeywords[] (covers Engage, Enhance, Countdown, Accelerate, Crystallize
 *   amulet text, Last Words, etc.)
 * - Excluded: bare stat keywords (Ward, Rush, …) with no nested effects; empty
 *   arrays; triggers with no effects (timing-only stubs). These are not effect
 *   clauses a human test would name separately.
 *
 * vanilla_place-only / dark
 * - Uses classifyPaths() from cardBehaviourDrive (no harness mutation).
 * - vanilla_place-only ⇔ paths are exactly ["vanilla_place"].
 * - Dark ⇔ zero asserting-block subjects AND vanilla_place-only.
 *
 * Scanned files
 * - Vitest (*.test.ts) and Playwright (*.spec.ts) files under tests/.
 * - NOT scanned: tests/specs/generated_specs.json (lists all 904 cards by
 *   construction — including it would mark every card "mentioned" and destroy
 *   the signal).
 * - Excluded: tests/unit/subjecthood.test.ts (and any path in
 *   excludedTestRelPaths). A test *about* subjecthood must not change
 *   subjecthood counts — e.g. an it() title naming a dark card would drop it
 *   from the dark set and fail the gate's stale-entry arm.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Project, Node, type SourceFile } from "ts-morph";
import { classifyPaths } from "./cardBehaviourDrive.js";
import type { CardJson } from "./loadCards.js";

const __filename = fileURLToPath(import.meta.url);
const LIB_ROOT = path.resolve(path.dirname(__filename), "..", "..");

export const MIN_NAME_MATCH_LENGTH = 9;
export const COMPOSED_TITLE_SEP = " › ";

export const SUBJECTHOOD_DARK_ALLOWLIST_PATH = path.join(
  LIB_ROOT,
  "cards",
  "subjecthood-dark-allowlist.json",
);

export type SubjecthoodDarkAllowEntry = {
  cardId: string;
  reason: string;
};

export const SUBJECTHOOD_SCAN_EXCLUSIONS = ["tests/unit/subjecthood.test.ts"];

export type SubjecthoodOptions = {
  inheritDescribeTitles: boolean;
  testRoots: string[];
  testGlobs: string[];
  /** Repo-relative paths omitted from the scan (see header). */
  excludedTestRelPaths: string[];
};

export const DEFAULT_SUBJECTHOOD_OPTIONS: SubjecthoodOptions = {
  inheritDescribeTitles: true,
  testRoots: ["tests"],
  testGlobs: ["**/*.test.ts", "**/*.spec.ts"],
  excludedTestRelPaths: SUBJECTHOOD_SCAN_EXCLUSIONS,
};

export type AssertingBlock = {
  file: string;
  composedTitle: string;
  ownTitle: string;
  describeTitles: string[];
};

export type CardSubjecthood = {
  cardId: string;
  cardName: string;
  subjectBlockCount: number;
  subjectBlocks: Array<{ file: string; composedTitle: string }>;
  matchedById: boolean;
  matchedByName: boolean;
  matchedByNameOnly: boolean;
  clauseCount: number;
  paths: string[];
  vanillaPlaceOnly: boolean;
  isDark: boolean;
  mentionedInTests: boolean;
  mentionedOnlyAsFiller: boolean;
  neverMentioned: boolean;
  fewerSubjectBlocksThanClauses: boolean;
};

export type SubjecthoodReport = {
  generatedAt: string;
  options: SubjecthoodOptions;
  poolSize: number;
  summary: {
    withAtLeastOneSubjectBlock: number;
    withExactlyOneSubjectBlock: number;
    zeroSubject: number;
    mentionedOnlyAsFiller: number;
    neverMentioned: number;
    fewerSubjectBlocksThanClauses: number;
    dark: number;
    matchedByNameOnly: number;
  };
  cards: CardSubjecthood[];
  darkCardIds: string[];
};

export type SubjecthoodGateReport = {
  errors: string[];
  exitCode: number;
};

function asArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function hasNonEmptyEffects(arr: unknown[] | undefined): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

/** Clause counting rules — see file header. */
export function countClauses(card: CardJson): number {
  let count = 0;
  if (hasNonEmptyEffects(card.fanfare)) count += 1;
  if (hasNonEmptyEffects(card.spell)) count += 1;
  if (hasNonEmptyEffects(card.evolve)) count += 1;
  if (hasNonEmptyEffects(card.superevolve)) count += 1;

  for (const trigger of asArray(card.triggers)) {
    if (!trigger || typeof trigger !== "object") continue;
    const effects = (trigger as { effects?: unknown[] }).effects;
    if (hasNonEmptyEffects(effects)) count += 1;
  }

  for (const keyword of asArray(card.keywords)) {
    if (!keyword || typeof keyword !== "object") continue;
    const kw = keyword as {
      effects?: unknown[];
      amuletKeywords?: unknown[];
    };
    if (hasNonEmptyEffects(kw.effects)) count += 1;
    else if (hasNonEmptyEffects(kw.amuletKeywords)) count += 1;
  }

  return count;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function nameIsMatchableByTitle(cardName: string): boolean {
  return cardName.trim().length >= MIN_NAME_MATCH_LENGTH;
}

export function cardMatchesTitle(
  card: Pick<CardJson, "id" | "name">,
  title: string,
): { byId: boolean; byName: boolean } {
  const byId = new RegExp(`\\b${escapeRegExp(card.id)}\\b`).test(title);
  let byName = false;
  if (nameIsMatchableByTitle(card.name)) {
    byName = new RegExp(`\\b${escapeRegExp(card.name)}\\b`, "i").test(title);
  }
  return { byId, byName };
}

function getStringLiteralArg(node: Node): string | null {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralText();
  }
  return null;
}

function calleeBaseName(node: Node): string | null {
  if (!Node.isCallExpression(node)) return null;
  const expr = node.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (
    Node.isPropertyAccessExpression(expr) &&
    Node.isIdentifier(expr.getExpression())
  ) {
    return expr.getExpression().getText();
  }
  return null;
}

function collectTitlesFromFile(sourceFile: SourceFile): {
  assertingBlocks: AssertingBlock[];
  allTitles: string[];
} {
  const assertingBlocks: AssertingBlock[] = [];
  const allTitles: string[] = [];
  const relFile = sourceFile.getFilePath();

  const visit = (node: Node, describeStack: string[]): void => {
    if (!Node.isCallExpression(node)) {
      node.forEachChild((child) => visit(child, describeStack));
      return;
    }

    const base = calleeBaseName(node);
    const titleArg = node.getArguments()[0];
    const title = titleArg ? getStringLiteralArg(titleArg) : null;
    if (!base || title == null) {
      node.forEachChild((child) => visit(child, describeStack));
      return;
    }

    if (base === "describe") {
      allTitles.push(title);
      const nextStack = [...describeStack, title];
      const callback = node.getArguments()[1];
      if (callback) callback.forEachChild((child) => visit(child, nextStack));
      return;
    }

    if (base === "it" || base === "test") {
      allTitles.push(title);
      const describeTitles = describeStack;
      const composedTitle = [...describeTitles, title].join(COMPOSED_TITLE_SEP);
      assertingBlocks.push({
        file: relFile,
        composedTitle,
        ownTitle: title,
        describeTitles: [...describeTitles],
      });
      return;
    }

    node.forEachChild((child) => visit(child, describeStack));
  };

  sourceFile.forEachChild((child) => visit(child, []));
  return { assertingBlocks, allTitles };
}

export function listTestFiles(
  rootDir: string,
  options: Pick<
    SubjecthoodOptions,
    "testRoots" | "testGlobs" | "excludedTestRelPaths"
  >,
): string[] {
  const files: string[] = [];
  const excluded = new Set(options.excludedTestRelPaths);

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(rootDir, full).replace(/\\/g, "/");
      if (excluded.has(rel)) continue;
      if (
        options.testGlobs.some((glob) => {
          const pattern = glob.replace(/\*\*/g, "<<<globstar>>>");
          const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/<<<globstar>>>/g, ".*");
          return new RegExp(`^${escaped}$`).test(rel);
        })
      ) {
        files.push(full);
      }
    }
  }

  for (const relRoot of options.testRoots) {
    walk(path.join(rootDir, relRoot));
  }

  return files.sort();
}

export function parseTestFiles(
  filePaths: string[],
  options: Pick<SubjecthoodOptions, "inheritDescribeTitles">,
): { assertingBlocks: AssertingBlock[]; fileContents: Map<string, string> } {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      target: 99,
    },
  });

  const assertingBlocks: AssertingBlock[] = [];
  const fileContents = new Map<string, string>();

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, "utf-8");
    fileContents.set(filePath, content);
    const sourceFile = project.addSourceFileAtPath(filePath);
    const parsed = collectTitlesFromFile(sourceFile);
    for (const block of parsed.assertingBlocks) {
      if (!options.inheritDescribeTitles) {
        assertingBlocks.push({
          ...block,
          composedTitle: block.ownTitle,
          describeTitles: [],
        });
      } else {
        assertingBlocks.push(block);
      }
    }
  }

  return { assertingBlocks, fileContents };
}

export function cardMentionedInContent(
  card: Pick<CardJson, "id" | "name">,
  content: string,
): boolean {
  if (new RegExp(`\\b${escapeRegExp(card.id)}\\b`).test(content)) return true;
  if (
    nameIsMatchableByTitle(card.name) &&
    new RegExp(`\\b${escapeRegExp(card.name)}\\b`, "i").test(content)
  ) {
    return true;
  }
  return false;
}

export function analyzeSubjecthood(
  cards: CardJson[],
  assertingBlocks: AssertingBlock[],
  fileContents: Map<string, string>,
): SubjecthoodReport {
  const options = { ...DEFAULT_SUBJECTHOOD_OPTIONS };
  const perCard: CardSubjecthood[] = cards.map((card) => {
    const subjectBlocks = assertingBlocks
      .filter((block) => {
        const match = cardMatchesTitle(card, block.composedTitle);
        return match.byId || match.byName;
      })
      .map((block) => ({
        file: block.file,
        composedTitle: block.composedTitle,
      }));

    const matchedById = subjectBlocks.some(
      (block) => cardMatchesTitle(card, block.composedTitle).byId,
    );
    const matchedByName = subjectBlocks.some(
      (block) => cardMatchesTitle(card, block.composedTitle).byName,
    );

    const mentionedInTests = [...fileContents.entries()].some(([, content]) =>
      cardMentionedInContent(card, content),
    );

    const paths = classifyPaths(card);
    const vanillaPlaceOnly = paths.length === 1 && paths[0] === "vanilla_place";
    const subjectBlockCount = subjectBlocks.length;
    const clauseCount = countClauses(card);
    const isDark = subjectBlockCount === 0 && vanillaPlaceOnly;

    return {
      cardId: card.id,
      cardName: card.name,
      subjectBlockCount,
      subjectBlocks,
      matchedById,
      matchedByName,
      matchedByNameOnly: matchedByName && !matchedById,
      clauseCount,
      paths,
      vanillaPlaceOnly,
      isDark,
      mentionedInTests,
      mentionedOnlyAsFiller: subjectBlockCount === 0 && mentionedInTests,
      neverMentioned: !mentionedInTests,
      fewerSubjectBlocksThanClauses:
        clauseCount > 0 && subjectBlockCount < clauseCount,
    };
  });

  const darkCardIds = perCard.filter((c) => c.isDark).map((c) => c.cardId);

  const summary = {
    withAtLeastOneSubjectBlock: perCard.filter((c) => c.subjectBlockCount >= 1)
      .length,
    withExactlyOneSubjectBlock: perCard.filter((c) => c.subjectBlockCount === 1)
      .length,
    zeroSubject: perCard.filter((c) => c.subjectBlockCount === 0).length,
    mentionedOnlyAsFiller: perCard.filter((c) => c.mentionedOnlyAsFiller)
      .length,
    neverMentioned: perCard.filter((c) => c.neverMentioned).length,
    fewerSubjectBlocksThanClauses: perCard.filter(
      (c) => c.fewerSubjectBlocksThanClauses,
    ).length,
    dark: darkCardIds.length,
    matchedByNameOnly: perCard.filter((c) => c.matchedByNameOnly).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    options,
    poolSize: cards.length,
    summary,
    cards: perCard,
    darkCardIds,
  };
}

export function loadSubjecthoodDarkAllowlist(
  filePath = SUBJECTHOOD_DARK_ALLOWLIST_PATH,
): SubjecthoodDarkAllowEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`${filePath} is not a JSON array`);
  }
  return raw.filter(
    (entry): entry is SubjecthoodDarkAllowEntry =>
      entry != null &&
      typeof entry === "object" &&
      typeof (entry as SubjecthoodDarkAllowEntry).cardId === "string" &&
      typeof (entry as SubjecthoodDarkAllowEntry).reason === "string",
  );
}

export function runSubjecthoodDarkGate(
  report: SubjecthoodReport,
  allowlistOverride?: SubjecthoodDarkAllowEntry[],
): SubjecthoodGateReport {
  const allowlist = allowlistOverride ?? loadSubjecthoodDarkAllowlist();
  const darkSet = new Set(report.darkCardIds);
  const errors: string[] = [];

  for (const entry of allowlist) {
    if (!darkSet.has(entry.cardId)) {
      errors.push(
        `allowlist entry for card ${entry.cardId} is no longer dark — remove it after adding test coverage`,
      );
    }
  }

  for (const cardId of report.darkCardIds) {
    if (!allowlist.some((entry) => entry.cardId === cardId)) {
      const card = report.cards.find((c) => c.cardId === cardId);
      errors.push(
        `new dark card ${cardId}${card ? ` (${card.cardName})` : ""} is not in cards/subjecthood-dark-allowlist.json`,
      );
    }
  }

  return {
    errors,
    exitCode: errors.length > 0 ? 1 : 0,
  };
}

export function runSubjecthoodAnalysis(
  rootDir: string,
  cards: CardJson[],
  options: SubjecthoodOptions = DEFAULT_SUBJECTHOOD_OPTIONS,
): SubjecthoodReport {
  const testFiles = listTestFiles(rootDir, options);
  const { assertingBlocks, fileContents } = parseTestFiles(testFiles, options);
  const report = analyzeSubjecthood(cards, assertingBlocks, fileContents);
  return { ...report, options };
}
