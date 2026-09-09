#!/usr/bin/env tsx
/**
 * scripts/check-rulings-absorbed.ts
 *
 * Log → rulebook: every `## ` heading in docs/owner-rulings.md carries exactly one
 * `<!-- rulebook: … -->` marker. For `absorbed`, verifies a unique locator string
 * appears in the anchored section and exactly once in the rulebook.
 *
 * Rulebook → log: every `**Owner ruling — <topic> (<date>):**` block in the rulebook
 * maps to a dated `## ` heading in docs/owner-rulings.md` (by locator or date+topic).
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

const RULEBOOK_OWNER_RULING_RE =
  /\*\*Owner ruling — (.+?) \((?:PROVISIONAL,\s*)?(\d{4}-\d{2}-\d{2})\):\*\*/g;

interface RulebookOwnerRuling {
  topic: string;
  date: string;
  fullPrefix: string;
  line: number;
}

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

function extractHeadingDate(title: string): string | null {
  const m = title.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normalizeTopic(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d{8,}/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function topicWords(text: string): Set<string> {
  const stop = new Set([
    "owner",
    "ruling",
    "the",
    "and",
    "for",
    "with",
    "not",
    "are",
    "is",
    "a",
    "an",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "or",
    "as",
    "if",
    "it",
    "its",
    "this",
    "that",
    "when",
    "from",
    "has",
    "have",
  ]);
  return new Set(
    normalizeTopic(text)
      .split(" ")
      .filter((w) => w.length > 2 && !stop.has(w)),
  );
}

function topicsOverlap(rulebookTopic: string, headingTitle: string): boolean {
  const headingBody = headingTitle.replace(/\s*—\s*\d{4}-\d{2}-\d{2}.*$/, "");
  const rt = normalizeTopic(rulebookTopic);
  const ht = normalizeTopic(headingBody);

  if (rt.includes(ht) || ht.includes(rt)) return true;

  const rw = topicWords(rulebookTopic);
  const hw = topicWords(headingBody);
  let overlap = 0;
  for (const w of rw) {
    if (hw.has(w)) overlap++;
  }
  const minSize = Math.min(rw.size, hw.size);
  return overlap >= 2 || (minSize > 0 && overlap / minSize >= 0.4);
}

function parseRulebookOwnerRulings(markdown: string): RulebookOwnerRuling[] {
  const blocks: RulebookOwnerRuling[] = [];
  RULEBOOK_OWNER_RULING_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RULEBOOK_OWNER_RULING_RE.exec(markdown)) !== null) {
    blocks.push({
      topic: match[1],
      date: match[2],
      fullPrefix: match[0],
      line: markdown.slice(0, match.index).split("\n").length,
    });
  }
  return blocks;
}

function findLoggedCounterpart(
  block: RulebookOwnerRuling,
  rulingHeadings: Heading[],
  locatorToHeading: Map<string, string>,
): Heading | undefined {
  for (const [locator, title] of locatorToHeading) {
    if (
      locator === block.fullPrefix ||
      block.fullPrefix.startsWith(locator) ||
      locator.startsWith(block.fullPrefix)
    ) {
      return rulingHeadings.find((h) => h.title === title);
    }
  }

  const sameDate = rulingHeadings.filter(
    (h) => extractHeadingDate(h.title) === block.date,
  );
  return sameDate.find((h) => topicsOverlap(block.topic, h.title));
}

function checkRulebookBlocksLogged(
  rulebook: string,
  rulingHeadings: Heading[],
  locatorToHeading: Map<string, string>,
): boolean {
  const blocks = parseRulebookOwnerRulings(rulebook);
  let failed = false;
  const unmapped: RulebookOwnerRuling[] = [];

  for (const block of blocks) {
    const counterpart = findLoggedCounterpart(
      block,
      rulingHeadings,
      locatorToHeading,
    );
    if (!counterpart) unmapped.push(block);
  }

  console.log(
    `rulebook owner-ruling blocks ${blocks.length}: mapped ${blocks.length - unmapped.length} / unmapped ${unmapped.length}`,
  );

  if (unmapped.length > 0) {
    failed = true;
    console.error("✗ Rulebook owner-ruling blocks with no logged counterpart:");
    for (const block of unmapped) {
      console.error(
        `  line ${block.line}: ${block.fullPrefix}`,
      );
    }
  }

  return !failed;
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
  const locatorToHeading = new Map<string, string>();
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
      locatorToHeading.set(locator, heading.title);
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

  if (!checkRulebookBlocksLogged(rulebook, rulingHeadings, locatorToHeading)) {
    failed = true;
  }

  if (failed) process.exit(1);
}

main();
