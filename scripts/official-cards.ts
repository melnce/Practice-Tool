#!/usr/bin/env tsx
/**
 * Pull Cygames official per-card Q&A, Rotation flag, and related-card ids.
 *
 *   npm run cards:official
 *   npm run cards:official -- --out cards/official-meta.json --lang en --md
 *   npm run cards:official -- --input reports/official/raw-pages.json --md
 *   npm run cards:official -- --raw reports/official/raw-pages.json
 *
 * Not in the `check` chain. Findings only — does not rewrite card data.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  OfficialCardsError,
  collectOfficialCards,
  collectOfficialFromInput,
  writeOfficialOutputs,
  type OfficialCardListResponse,
} from "./lib/officialCards.js";
import { writeOfficialReport } from "./lib/officialReconcile.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type OfficialCliArgs = {
  out: string;
  lang: string;
  input?: string;
  raw?: string;
  md?: string;
  report?: string;
  noReport: boolean;
};

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

export function parseOfficialArgs(argv: string[]): OfficialCliArgs {
  const out = argValue(argv, "--out") ?? "cards/official-meta.json";
  const lang = argValue(argv, "--lang") ?? "en";
  const input = argValue(argv, "--input");
  const raw = argValue(argv, "--raw");
  const mdFlag = argv.includes("--md");
  const mdArg = argValue(argv, "--md");
  const reportArg = argValue(argv, "--report");
  const noReport = argv.includes("--no-report");
  return {
    out,
    lang,
    ...(input ? { input } : {}),
    ...(raw ? { raw } : {}),
    ...(mdFlag || mdArg ? { md: mdArg ?? "docs/official-qa.md" } : {}),
    ...(reportArg ? { report: reportArg } : {}),
    noReport,
  };
}

function resolveFromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

export async function runOfficialCards(
  argv: string[] = process.argv.slice(2),
): Promise<number> {
  const args = parseOfficialArgs(argv);
  const outPath = resolveFromRoot(args.out);
  const mdPath = args.md ? resolveFromRoot(args.md) : undefined;
  const rawPath = args.raw ? resolveFromRoot(args.raw) : undefined;
  const reportDir = args.noReport
    ? undefined
    : resolveFromRoot(args.report ?? "reports/official");

  try {
    let pages: OfficialCardListResponse[] = [];
    let fallbackPages: OfficialCardListResponse[] = [];
    let meta;

    if (args.input) {
      const inputPath = resolveFromRoot(args.input);
      const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as unknown;
      const collected = collectOfficialFromInput(raw, {
        lang: args.lang,
        source: `input:${path.relative(ROOT, inputPath).replace(/\\/g, "/")}`,
      });
      pages = collected.pages;
      fallbackPages = collected.fallbackPages;
      meta = collected.meta;
      console.log(
        `Loaded ${pages.length} saved page(s) from ${path.relative(ROOT, inputPath)}`,
      );
    } else {
      console.log(
        `Fetching official catalog (lang=${args.lang}) from shadowverse-wb.com …`,
      );
      const collected = await collectOfficialCards({ lang: args.lang });
      pages = collected.pages;
      fallbackPages = collected.fallbackPages;
      meta = collected.meta;
      console.log(
        `Paged ${pages.length} list response(s) by sort_card_id_list; fallback fetches: ${fallbackPages.length}`,
      );
    }

    const cardCount = Object.keys(meta).filter((k) => k !== "_meta").length;
    console.log(
      `Catalog: ${cardCount} ids (count=${meta._meta.count}, lang=${meta._meta.lang})`,
    );

    await writeOfficialOutputs({
      meta,
      outPath,
      ...(mdPath ? { mdPath } : {}),
      ...(rawPath ? { rawPath, pages: [...pages, ...fallbackPages] } : {}),
    });
    console.log(`Wrote ${path.relative(ROOT, outPath)}`);
    if (mdPath) console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
    if (rawPath) console.log(`Wrote ${path.relative(ROOT, rawPath)}`);

    if (reportDir) {
      const report = await writeOfficialReport(meta, reportDir);
      console.log(`Wrote ${path.relative(ROOT, reportDir)}/reconciliation.md`);
      console.log(
        `Rotation mismatches: ${report.rotation.length}; official-not-encoded: ${report.officialNotEncoded.length}; encoded-not-official: ${report.encodedNotOfficial.length}; unresolved tokens: ${report.unresolvedTokens.length}; Q&A pinned ${report.pinnedCount} / unpinned ${report.unpinnedCount}; Q&A-vs-rulings notes: ${report.qaRulings.length}`,
      );
    }
    return 0;
  } catch (err) {
    if (err instanceof OfficialCardsError) {
      console.error(`official-cards: ${err.message}`);
      return 1;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`official-cards: ${message}`);
    return 1;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runOfficialCards()
    .then((code) => {
      process.exit(code);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
