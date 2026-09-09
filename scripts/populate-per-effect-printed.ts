#!/usr/bin/env tsx
/**
 * Phase 1 — populate `printed` on the free slice (one clause root, one sentence).
 * Mechanical generation; validator is the proof. Rejections are findings, not fixes.
 */

import fs from "fs";
import path from "path";
import { SETS_DIR } from "./mergeSets.js";
import { TOKEN_JSON } from "./lib/loadAllCardData.js";
import { writeFormattedJson } from "./lib/formatJson.js";
import {
  collectClauseRoots,
  freeSlicePrintedLiteral,
  checkPerEffectPrintedForCard,
  isFreeSliceCard,
} from "./lib/perEffectPrinted.js";
import type { CardJson } from "./lib/loadCards.js";

function resolveOpAtPath(
  root: Record<string, unknown>,
  opPath: string,
  cardId: string,
): Record<string, unknown> {
  const rel = opPath.startsWith(`${cardId}.`)
    ? opPath.slice(cardId.length + 1)
    : opPath;
  const segments = rel.match(/[^.]+(?:\[\d+\])?/g) ?? [];
  let node: unknown = root;

  for (const seg of segments) {
    const m = seg.match(/^([^\[]+)(?:\[(\d+)\])?$/);
    if (!m) throw new Error(`bad path segment: ${seg}`);
    const key = m[1]!;
    const idx = m[2] != null ? Number(m[2]) : null;
    const obj = node as Record<string, unknown>;
    node = idx != null ? (obj[key] as unknown[])[idx] : obj[key];
    if (!node || typeof node !== "object") {
      throw new Error(`path missing: ${opPath} at ${seg}`);
    }
  }

  if (!node || typeof node !== "object" || !("op" in (node as object))) {
    throw new Error(`path does not end at op: ${opPath}`);
  }
  return node as Record<string, unknown>;
}

function setPrintedAtPath(
  root: Record<string, unknown>,
  opPath: string,
  cardId: string,
  value: string,
): void {
  const op = resolveOpAtPath(root, opPath, cardId);
  op.printed = value;
}

function loadEditableCards(): Map<
  string,
  { card: CardJson; filePath: string; cards: CardJson[] }
> {
  const byId = new Map<
    string,
    { card: CardJson; filePath: string; cards: CardJson[] }
  >();

  const tokenCards = JSON.parse(
    fs.readFileSync(TOKEN_JSON, "utf-8"),
  ) as CardJson[];
  for (const card of tokenCards) {
    byId.set(card.id, {
      card,
      filePath: TOKEN_JSON,
      cards: tokenCards,
    });
  }

  const setFiles = fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of setFiles) {
    const filePath = path.join(SETS_DIR, file);
    const cards = JSON.parse(fs.readFileSync(filePath, "utf-8")) as CardJson[];
    for (const card of cards) {
      byId.set(card.id, { card, filePath, cards });
    }
  }

  return byId;
}

async function main() {
  const editable = loadEditableCards();
  let candidateCount = 0;
  let populatedCount = 0;
  const rejected: string[] = [];
  const touchedFiles = new Set<string>();

  for (const { card } of editable.values()) {
    if (!isFreeSliceCard(card)) continue;
    candidateCount++;

    const literal = freeSlicePrintedLiteral(card);
    const roots = collectClauseRoots(card);
    if (!literal || roots.length !== 1) {
      rejected.push(
        `${card.id} ${card.name}: could not derive literal (roots=${roots.length})`,
      );
      continue;
    }

    const rootPath = roots[0]!.path;
    const entry = editable.get(card.id);
    if (!entry) continue;

    const draft = structuredClone(entry.card) as CardJson;
    setPrintedAtPath(
      draft as Record<string, unknown>,
      rootPath,
      card.id,
      literal,
    );

    const issues = checkPerEffectPrintedForCard(draft);
    if (issues.length) {
      rejected.push(
        `${card.id} ${card.name}: validator rejected — ${issues.map((i) => i.rule).join(", ")}`,
      );
      continue;
    }

    setPrintedAtPath(
      entry.card as Record<string, unknown>,
      rootPath,
      card.id,
      literal,
    );
    populatedCount++;
    touchedFiles.add(entry.filePath);
  }

  const fileCards = new Map<string, CardJson[]>();
  for (const entry of editable.values()) {
    if (!touchedFiles.has(entry.filePath)) continue;
    if (!fileCards.has(entry.filePath))
      fileCards.set(entry.filePath, entry.cards);
  }
  for (const [filePath, cards] of fileCards) {
    await writeFormattedJson(filePath, cards);
  }

  console.log(`Free-slice candidates: ${candidateCount}`);
  console.log(`Populated: ${populatedCount}`);
  console.log(`Validator rejected: ${rejected.length}`);
  if (rejected.length) {
    console.log("\nRejections (findings):");
    for (const line of rejected) console.log(`  ${line}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
