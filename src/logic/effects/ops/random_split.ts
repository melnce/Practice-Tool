// src/logic/effects/ops/random_split.ts
// Splits a total among named placeholders, then enqueues substituted child effects.

import { state } from "../../../core/gameState.js";
import { logEvent } from "../../../core/logger.js";
import { isDev, readEnv } from "../../../core/env.js";
import { getCrests } from "../../../core/playerHelpers.js";
import { resolveDynamicValue } from "../../core/values.js";
import { enqueueManyFront } from "../../core/effects/queue.js";
import type { Effect, Player } from "../../../core/types/index.js";
import type { EffectCtx } from "../../core/effects/registry.js";

type CrestCounterRef = { crest: string; counter: string };

type RandomSplitEffect = Effect & {
  total?: number | string | { crest_counter: CrestCounterRef };
  parts?: string[];
  effects?: Effect[];
};

const PLACEHOLDER_RE = /^\{([A-Z]+)\}$/;

function isTestEnv(): boolean {
  const vitest = readEnv("VITEST");
  return isDev() || vitest === "true" || vitest === "1";
}

function resolveTotal(total: unknown, owner: Player): number {
  if (typeof total === "number" && Number.isFinite(total)) {
    return Math.max(0, total | 0);
  }
  if (typeof total === "string") {
    return Math.max(0, resolveDynamicValue(total, { owner }) | 0);
  }
  if (total && typeof total === "object" && "crest_counter" in total) {
    const ref = (total as { crest_counter: CrestCounterRef }).crest_counter;
    const crests = getCrests(state, owner) || [];
    const crest = crests.find(
      (c) => String(c.name).toLowerCase() === String(ref.crest).toLowerCase(),
    );
    if (!crest) return 0;
    return (
      Math.max(
        0,
        parseInt(String(crest.counters?.[ref.counter] ?? 0), 10) || 0,
      ) | 0
    );
  }
  return 0;
}

function drawSplit(total: number, parts: string[]): Record<string, number> {
  const drawn: Record<string, number> = {};
  for (const part of parts) drawn[part] = 0;
  if (!parts.length || total <= 0) return drawn;

  for (let i = 0; i < total; i++) {
    const idx = state.rng.nextInt(parts.length);
    const key = parts[idx]!;
    drawn[key] = (drawn[key] ?? 0) + 1;
  }
  return drawn;
}

function substitutePlaceholders(
  value: unknown,
  drawn: Record<string, number>,
  knownParts: Set<string>,
): unknown {
  if (typeof value === "string") {
    const match = value.match(PLACEHOLDER_RE);
    if (!match) return value;
    const key = match[1]!;
    if (!knownParts.has(key)) {
      throwUnknownPlaceholder(value);
    }
    return drawn[key] ?? 0;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      substitutePlaceholders(entry, drawn, knownParts),
    );
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = substitutePlaceholders(entry, drawn, knownParts);
    }
    return out;
  }
  return value;
}

function throwUnknownPlaceholder(token: string): never {
  throw new Error(`[random_split] Unknown placeholder: ${token}`);
}

function assertNoUnknownPlaceholders(
  value: unknown,
  knownParts: Set<string>,
): void {
  if (typeof value === "string") {
    const match = value.match(PLACEHOLDER_RE);
    if (match && !knownParts.has(match[1]!)) {
      throwUnknownPlaceholder(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoUnknownPlaceholders(entry, knownParts);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      assertNoUnknownPlaceholders(entry, knownParts);
    }
  }
}

export function handleRandomSplit(
  eff: RandomSplitEffect,
  ctx: EffectCtx,
): void {
  const parts = Array.isArray(eff.parts) ? eff.parts.map(String) : [];
  const knownParts = new Set(parts);
  const total = resolveTotal(eff.total, ctx.owner);
  const drawn = drawSplit(total, parts);

  logEvent("randomSplit", { total, parts: drawn });

  const childEffects = Array.isArray(eff.effects) ? eff.effects : [];
  if (!childEffects.length) return;

  const substituted = substitutePlaceholders(
    structuredClone(childEffects),
    drawn,
    knownParts,
  ) as Effect[];

  if (isTestEnv()) {
    assertNoUnknownPlaceholders(substituted, knownParts);
  }

  enqueueManyFront(ctx, substituted);
}
