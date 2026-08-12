/**
 * Derived card implementation status.
 *
 * Never hand-maintain a flag on card JSON — recompute from description + ops.
 *
 * WHAT THESE LABELS GUARANTEE (and what they do not):
 * - unimplemented: non-evergreen rules text with no programmed effects / configured
 *   keywords. Safe claim: "this card has no implemented effects."
 * - partial: at least one unknown/unregistered `op` in the effect trees. On the
 *   current pool this is effectively unreachable (every authored op is registered);
 *   it exists for forward detection when a bad op slips in.
 * - implemented: vanilla / evergreen-only, OR has some programmed content with only
 *   known ops. THIS DOES NOT MEAN THE CARD IS FAITHFUL TO ITS FULL RULES TEXT.
 *   A card with Fanfare authored but Evolve missing still counts as "implemented".
 *   Do not treat the count of "implemented" cards as a fidelity / coverage metric.
 *
 * A real text-vs-ops fidelity audit of the implemented pool is a separate job.
 */

import { ALL_OPS } from "../logic/core/effects/opTypes.js";

export type ImplementationStatus = "implemented" | "partial" | "unimplemented";

/** Evergreen keywords that the engine applies from keywords[] / description lines. */
export const EVERGREEN_KEYWORDS = [
  "Ward",
  "Storm",
  "Rush",
  "Bane",
  "Drain",
  "Ambush",
  "Barrier",
  "Aura",
  "Intimidate",
  "BanishOnDeath",
  "Taunt",
] as const;

const EVERGREEN_LINE = new Set(
  EVERGREEN_KEYWORDS.map((k) => k.toLowerCase()).concat([
    "cant_be_destroyed",
    "strike",
  ]),
);

/** Tribe / trait lines that are not executable effect text. */
const STRUCTURAL_LINE =
  /^(earth sigil|artifact|officer|commander|marionette|loot|naterran|academic|anathema|crystalspawn|marine|pixie|luminous|golem|puppet|treasure|leve[l]? ?\d+)$/i;

const KNOWN_OPS = new Set<string>(ALL_OPS as readonly string[]);

export type CardLike = {
  id?: string;
  name?: string;
  type?: string;
  description?: string | null;
  fanfare?: unknown;
  spell?: unknown;
  evolve?: unknown;
  superevolve?: unknown;
  triggers?: unknown;
  invoke?: unknown;
  on_discard?: unknown;
  keywords?: unknown[];
  specific_effects?: unknown[];
  [key: string]: unknown;
};

function asArray(v: unknown): unknown[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
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

function effectRoots(card: CardLike): unknown[] {
  const roots: unknown[] = [];
  roots.push(...asArray(card.spell));
  roots.push(...asArray(card.fanfare));
  roots.push(...asArray(card.evolve));
  roots.push(...asArray(card.superevolve));
  roots.push(...asArray(card.triggers));
  roots.push(...asArray(card.invoke));
  roots.push(...asArray(card.on_discard));

  for (const k of card.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const kw = k as {
      name?: string;
      effects?: unknown[];
      amuletKeywords?: unknown[];
      keywords?: unknown[];
    };
    if (Array.isArray(kw.effects)) roots.push(...kw.effects);
    // Crystallize nests Countdown / LastWords under amuletKeywords
    for (const nested of [
      ...asArray(kw.amuletKeywords),
      ...asArray(kw.keywords),
    ]) {
      if (!nested || typeof nested !== "object") continue;
      const nk = nested as { effects?: unknown[] };
      if (Array.isArray(nk.effects)) roots.push(...nk.effects);
    }
  }
  return roots;
}

/** Non-evergreen, non-structural description lines (rules text that needs ops). */
export function nonEvergreenText(
  description: string | null | undefined,
): string {
  if (!description) return "";
  return description
    .split("\n")
    .map((l) => l.trim())
    .filter((line) => {
      if (!line) return false;
      const lower = line.toLowerCase().replace(/\.$/, "").trim();
      if (EVERGREEN_LINE.has(lower)) return false;
      if (STRUCTURAL_LINE.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

export function collectCardOps(card: CardLike): Set<string> {
  const ops = new Set<string>();
  for (const root of effectRoots(card)) collectOps(root, ops);
  return ops;
}

export function unknownCardOps(card: CardLike): string[] {
  return [...collectCardOps(card)].filter((op) => !KNOWN_OPS.has(op)).sort();
}

function hasAuthoredAlternateForm(
  card: CardLike,
  kind: "accelerate" | "crystallize",
): boolean {
  for (const k of card.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const kw = k as Record<string, unknown>;
    if (String(kw.name ?? "").toLowerCase() !== kind) continue;
    if (kw.cost == null) continue;
    if (kind === "accelerate") {
      if (Array.isArray(kw.effects) && kw.effects.length > 0) return true;
    } else {
      const nested = asArray(kw.amuletKeywords).concat(asArray(kw.keywords));
      if (nested.length > 0) return true;
      if (Array.isArray(kw.effects) && kw.effects.length > 0) return true;
    }
  }
  return false;
}

/**
 * DotGG specific_effects may list Accelerate / Crystallize before ops are authored.
 * Treat unauthored catalog entries as requiring implementation.
 */
export function hasUnauthoredAlternateForms(card: CardLike): boolean {
  for (const raw of asArray(card.specific_effects)) {
    if (!raw || typeof raw !== "object") continue;
    const name = String((raw as { name?: string }).name ?? "").toLowerCase();
    if (name === "accelerate" && !hasAuthoredAlternateForm(card, "accelerate"))
      return true;
    if (name === "crystallize" && !hasAuthoredAlternateForm(card, "crystallize"))
      return true;
  }
  return false;
}

/**
 * Keyword objects that encode behavior without nested `op` trees
 * (e.g. Spellboost reduceCostBy, Countdown turns, MaxDamageCap).
 */
function hasConfiguredKeyword(card: CardLike): boolean {
  for (const k of card.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const kw = k as Record<string, unknown>;
    const name = String(kw.name ?? "").toLowerCase();
    if (!name) continue;
    if (Array.isArray(kw.effects) && kw.effects.length > 0) return true;
    if (
      name === "spellboost" &&
      (kw.reduceCostBy != null || kw.minCost != null)
    )
      return true;
    if (name === "enhance" && kw.cost != null) return true;
    if (
      (name === "accelerate" || name === "crystallize") &&
      kw.cost != null
    )
      return true;
    if (
      name === "countdown" &&
      (kw.turns != null || kw.count != null || kw.countdown != null)
    )
      return true;
    if (name === "engage" && (kw.sacrifice != null || kw.cost != null))
      return true;
    if (name === "maxdamagecap" && kw.amount != null) return true;
    if (name === "counter") return true;
  }
  return false;
}

export function hasProgrammedEffects(card: CardLike): boolean {
  if (collectCardOps(card).size > 0) return true;
  return hasConfiguredKeyword(card);
}

export function getImplementationStatus(card: CardLike): ImplementationStatus {
  const unknown = unknownCardOps(card);
  if (unknown.length > 0) return "partial";

  if (hasUnauthoredAlternateForms(card)) return "unimplemented";

  const remaining = nonEvergreenText(card.description);
  if (!remaining) return "implemented";

  if (!hasProgrammedEffects(card)) return "unimplemented";

  return "implemented";
}

export function summarizeImplementationStatus(
  cards: CardLike[],
): Record<ImplementationStatus, number> {
  const out: Record<ImplementationStatus, number> = {
    implemented: 0,
    partial: 0,
    unimplemented: 0,
  };
  for (const card of cards) {
    out[getImplementationStatus(card)]++;
  }
  return out;
}
