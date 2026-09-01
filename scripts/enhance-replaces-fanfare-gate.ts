/**
 * Enhance-replaces-fanfare gate — followers whose Enhance line says "instead"
 * must set `enhance_replaces_fanfare`, and the flag must not be a silent no-op.
 */

type CardJson = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  fanfare?: unknown[];
  keywords?: unknown[];
  enhance_replaces_fanfare?: unknown;
};

export type EnhanceReplacesFanfareGateIssue = {
  id: string;
  name: string;
  kind: "error";
  message: string;
};

/** Match `Enhance (8):` and `Enhance(9):` spellings; return each Enhance line. */
function enhanceLinesFromDescription(description: string): string[] {
  const lines = description.split(/\r?\n/);
  return lines.filter((line) => /^\s*Enhance\s*\(\s*\d+\s*\)\s*:/i.test(line));
}

function hasNonEmptyFanfare(card: CardJson): boolean {
  return Array.isArray(card.fanfare) && card.fanfare.length > 0;
}

function hasEnhanceWithEffects(card: CardJson): boolean {
  if (!Array.isArray(card.keywords)) return false;
  for (const k of card.keywords) {
    if (!k || typeof k !== "object") continue;
    const name = String((k as { name?: unknown }).name ?? "");
    if (name.toLowerCase() !== "enhance") continue;
    const effects = (k as { effects?: unknown }).effects;
    if (Array.isArray(effects) && effects.length > 0) return true;
  }
  return false;
}

export function checkEnhanceReplacesFanfareForCard(
  card: CardJson,
): EnhanceReplacesFanfareGateIssue[] {
  const issues: EnhanceReplacesFanfareGateIssue[] = [];
  const flagTruthy = Boolean(card.enhance_replaces_fanfare);

  // Rule B — flag only meaningful on Followers (read in follower.ts).
  if (flagTruthy && card.type !== "Follower") {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: `${card.id} ${card.name}: enhance_replaces_fanfare is set but type is ${card.type ?? "(missing)"} — flag is only read on the follower play path`,
    });
  }

  // Rule C — dead flag (no fanfare to replace, or no Enhance effects).
  if (flagTruthy) {
    if (!hasNonEmptyFanfare(card)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: enhance_replaces_fanfare is set but card has no fanfare to replace`,
      });
    }
    if (!hasEnhanceWithEffects(card)) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: enhance_replaces_fanfare is set but card has no Enhance keyword with effects`,
      });
    }
  }

  // Rule A — Follower with fanfare + Enhance effects whose Enhance line says
  // "instead" must carry the flag.
  if (
    card.type === "Follower" &&
    hasNonEmptyFanfare(card) &&
    hasEnhanceWithEffects(card) &&
    !flagTruthy
  ) {
    const desc = String(card.description ?? "");
    const insteadLines = enhanceLinesFromDescription(desc).filter((line) =>
      /\binstead\b/i.test(line),
    );
    for (const line of insteadLines) {
      issues.push({
        id: card.id,
        name: card.name,
        kind: "error",
        message: `${card.id} ${card.name}: Enhance line says "instead" but enhance_replaces_fanfare is missing — "${line.trim()}"`,
      });
    }
  }

  return issues;
}
