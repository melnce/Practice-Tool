/**
 * Rotation metadata gate — official `is_include_rotation` must match the
 * set-window heuristic except for named allowlist entries.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  collectSetIds,
  isRotationSetId,
  parseCardSetId,
} from "../src/data/formats.js";
import {
  getOfficialCard,
  officialMetaCardIds,
  type OfficialMetaFile,
} from "./lib/officialCards.js";
import { loadRepoCards } from "./lib/officialReconcile.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

export const ROTATION_GATE_ALLOWLIST_PATH = path.join(
  ROOT,
  "cards",
  "rotation-gate-allowlist.json",
);

export type RotationGateAllowEntry = {
  cardId: string;
  reason: string;
};

export type RotationMetaMismatch = {
  cardId: string;
  cardName: string;
  setId: string | null;
  official: boolean;
  heuristic: boolean;
};

export type RotationMetaGateReport = {
  mismatches: RotationMetaMismatch[];
  errors: Array<{ message: string; cardId?: string }>;
  exitCode: number;
};

export function loadRotationGateAllowlist(
  filePath = ROTATION_GATE_ALLOWLIST_PATH,
): RotationGateAllowEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`${filePath} is not a JSON array`);
  }
  return raw as RotationGateAllowEntry[];
}

export function compareRotationMeta(
  meta: OfficialMetaFile,
): RotationMetaMismatch[] {
  const repo = loadRepoCards();
  const allSetIds = collectSetIds(repo.allCards);
  const byId = repo.byId;
  const mismatches: RotationMetaMismatch[] = [];

  for (const id of officialMetaCardIds(meta)) {
    const official = getOfficialCard(meta, id);
    const repoRow = byId.get(id);
    if (!official || !repoRow) continue;
    const setId = parseCardSetId(repoRow.card);
    const heuristic = isRotationSetId(setId, allSetIds);
    if (heuristic !== official.is_include_rotation) {
      mismatches.push({
        cardId: id,
        cardName: official.name,
        setId,
        official: official.is_include_rotation,
        heuristic,
      });
    }
  }

  return mismatches;
}

export function runRotationMetaGate(
  meta: OfficialMetaFile,
  allowlistOverride?: RotationGateAllowEntry[],
): RotationMetaGateReport {
  const mismatches = compareRotationMeta(meta);
  const allowlist = allowlistOverride ?? loadRotationGateAllowlist();

  const unmatchedAllowlist: RotationGateAllowEntry[] = [];
  for (const entry of allowlist) {
    const matched = mismatches.some((m) => m.cardId === entry.cardId);
    if (!matched) unmatchedAllowlist.push(entry);
  }

  const unallowlisted = mismatches.filter(
    (m) => !allowlist.some((entry) => entry.cardId === m.cardId),
  );

  const errors: Array<{ message: string; cardId?: string }> = [
    ...unallowlisted.map((m) => ({
      cardId: m.cardId,
      message: `[${m.cardId}] ${m.cardName} (set ${m.setId ?? "?"}) — official=${m.official}, heuristic=${m.heuristic}`,
    })),
    ...unmatchedAllowlist.map((entry) => ({
      cardId: entry.cardId,
      message: `allowlist entry for card ${entry.cardId} no longer reproduces — remove it after the model matches Cygames`,
    })),
  ];

  return {
    mismatches,
    errors,
    exitCode: errors.length > 0 ? 1 : 0,
  };
}
