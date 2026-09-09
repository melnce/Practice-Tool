#!/usr/bin/env tsx
/**
 * scripts/check-rulings-absorbed.ts
 *
 * Verifies every `## ` heading in docs/owner-rulings.md carries exactly one
 * `<!-- rulebook: … -->` marker. For `absorbed`, verifies a unique locator
 * string appears in the anchored section and exactly once in the rulebook.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = process.cwd();
const RULINGS_PATH = path.join(ROOT, "docs/owner-rulings.md");
const RULEBOOK_PATH = path.join(ROOT, "docs/svwb_rulebook_formatted.md");

/** Pinned pending population — must match deliberate `pending` markers. */
const EXPECTED_PENDING_COUNT = 7;

const ABSORBED_RE =
  /^<!--\s*rulebook:\s*absorbed\s+#([a-z0-9-]+)\s+»\s+(.+?)\s*-->$/i;
const ENGINE_INTERNAL_RE =
  /^<!--\s*rulebook:\s*engine-internal\s+—\s+(.+?)\s*-->$/i;
const PENDING_RE = /^<!--\s*rulebook:\s*pending\s+—\s+(.+?)\s*-->$/i;

const DATE_RE = /\d{4}-\d{2}-\d{2}/;

interface Heading {
  line: number;
  title: string;
}

interface RulebookSection {
  anchor: string;
  level: number;
  title: string;
  content: string;
}

function githubSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function parseRulebookSections(markdown: string): Map<string, RulebookSection> {
  const lines = markdown.split("\n");
  const headings: { level: number; title: string; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      headings.push({ level: m[1].length, title: m[2].trim(), line: i });
    }
  }

  const sections = new Map<string, RulebookSection>();
  const slugCounts = new Map<string, number>();

  for (let i = 0; i < headings.length; i++) {
    const { level, title, line } = headings[i];
    let baseSlug = githubSlug(title);
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    const anchor = count === 0 ? baseSlug : `${baseSlug}-${count}`;

    const endLine =
      i + 1 < headings.length
        ? (headings.slice(i + 1).find((h) => h.level <= level)?.line ??
          lines.length)
        : lines.length;

    const content = lines.slice(line + 1, endLine).join("\n");
    sections.set(anchor, { anchor, level, title, content });
  }

  return sections;
}

function parseRulingHeadings(markdown: string): Heading[] {
  const lines = markdown.split("\n");
  const headings: Heading[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## (.+)$/);
    if (!m) continue;

    const title = m[1].trim();
    if (title.startsWith("Still open")) continue;

    if (!DATE_RE.test(title)) {
      throw new Error(
        `Could not extract date from ruling heading at line ${i + 1}: ${title}`,
      );
    }

    headings.push({ line: i + 1, title });
  }

  return headings;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count++;
    index += needle.length;
  }
  return count;
}

function main(): void {
  const rulings = fs.readFileSync(RULINGS_PATH, "utf-8");
  const rulebook = fs.readFileSync(RULEBOOK_PATH, "utf-8");
  const lines = rulings.split("\n");
  const rulingHeadings = parseRulingHeadings(rulings);
  const rulebookSections = parseRulebookSections(rulebook);

  let absorbed = 0;
  let engineInternal = 0;
  let pending = 0;
  const pendingRows: string[] = [];
  let failed = false;

  for (const heading of rulingHeadings) {
    const headingIndex = heading.line - 1;
    let markerIndex = headingIndex + 1;
    while (markerIndex < lines.length && lines[markerIndex].trim() === "") {
      markerIndex++;
    }

    const markerLine = lines[markerIndex]?.trim() ?? "";
    if (!markerLine.startsWith("<!-- rulebook:")) {
      console.error(
        `✗ Missing marker immediately below heading (line ${heading.line}): ${heading.title}`,
      );
      failed = true;
      continue;
    }

    const between = lines.slice(headingIndex + 1, markerIndex);
    if (between.some((line) => line.trim() !== "")) {
      console.error(
        `✗ Content between heading and marker (line ${heading.line}): ${heading.title}`,
      );
      failed = true;
      continue;
    }

    const markerMatches = lines
      .slice(markerIndex, markerIndex + 3)
      .filter((l) => l.trim().startsWith("<!-- rulebook:"));
    if (markerMatches.length > 1) {
      console.error(
        `✗ Multiple markers below heading (line ${heading.line}): ${heading.title}`,
      );
      failed = true;
      continue;
    }

    const absorbedMatch = ABSORBED_RE.exec(markerLine);
    const engineMatch = ENGINE_INTERNAL_RE.exec(markerLine);
    const pendingMatch = PENDING_RE.exec(markerLine);

    if (absorbedMatch) {
      const anchor = absorbedMatch[1];
      const locator = absorbedMatch[2];
      const section = rulebookSections.get(anchor);
      if (!section) {
        console.error(
          `✗ Absorbed anchor #${anchor} does not exist in rulebook — heading: ${heading.title}`,
        );
        failed = true;
        continue;
      }
      const occurrences = countOccurrences(rulebook, locator);
      if (occurrences === 0) {
        console.error(
          `✗ Locator not found in rulebook — heading: ${heading.title}`,
        );
        console.error(`  locator: ${locator}`);
        failed = true;
        continue;
      }
      if (occurrences > 1) {
        console.error(
          `✗ Locator appears ${occurrences} times in rulebook (must be exactly once) — heading: ${heading.title}`,
        );
        console.error(`  locator: ${locator}`);
        failed = true;
        continue;
      }
      if (!section.content.includes(locator)) {
        console.error(
          `✗ Locator not in anchored section #${anchor} — heading: ${heading.title}`,
        );
        console.error(`  locator: ${locator}`);
        failed = true;
        continue;
      }
      absorbed++;
    } else if (engineMatch) {
      const reason = engineMatch[1]?.trim();
      if (!reason) {
        console.error(
          `✗ engine-internal marker missing reason — heading: ${heading.title}`,
        );
        failed = true;
        continue;
      }
      engineInternal++;
    } else if (pendingMatch) {
      const reason = pendingMatch[1]?.trim();
      if (!reason) {
        console.error(
          `✗ pending marker missing reason — heading: ${heading.title}`,
        );
        failed = true;
        continue;
      }
      pending++;
      pendingRows.push(`  - ${heading.title} — ${reason}`);
    } else {
      console.error(
        `✗ Invalid marker syntax (line ${heading.line + 1}): ${markerLine}`,
      );
      failed = true;
    }
  }

  if (pending !== EXPECTED_PENDING_COUNT) {
    console.error(
      `✗ Pending count ${pending} does not match expected ${EXPECTED_PENDING_COUNT}`,
    );
    failed = true;
  }

  if (pendingRows.length > 0) {
    console.log("Pending rulings:");
    for (const row of pendingRows) console.log(row);
  }

  const total = rulingHeadings.length;
  console.log(
    `rulings ${total}: absorbed ${absorbed} / engine-internal ${engineInternal} / pending ${pending}`,
  );

  if (failed) process.exit(1);
}

main();
