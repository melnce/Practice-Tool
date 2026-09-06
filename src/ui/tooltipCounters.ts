import { state } from "../core/gameState.js";
import type { CardInstance, Player } from "../core/types/index.js";
import {
  getBoard,
  countCrests,
  getHand,
  getPlaysThisTurn,
  getRally,
  getShadows,
} from "../core/playerHelpers.js";
import {
  countNamedEnters,
  countUniqueTribeEnters,
} from "../logic/core/followerEnterHistory.js";

/** Dynamic count sources referenced by card ops (stat / repeat / damage / gate). */
export const DYNAMIC_COUNT_SOURCES = new Set([
  "combo",
  "count_in_hand",
  "count_allies",
  "shikigami_deaths",
  "named_enter_count",
  "crest_count",
  "other_allies",
  "unique_tribe_enters",
  "necromancy",
  "spellboost_count",
  "amulet_count",
]);

export type CounterParams = {
  name?: string;
  tribe?: string;
  excludeSelf?: boolean;
};

export type TooltipCounterSpec = {
  key: string;
  source: string;
  label: string;
  threshold: number | null;
  params: CounterParams;
  /** When true, live value renders as `atk/def` (shikigami death totals). */
  compoundStat?: boolean;
};

const SOURCE_FIELDS = [
  "attack_source",
  "defense_source",
  "count_source",
  "amount_source",
] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pluralSummonName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "Copies summoned";
  const base = trimmed.includes(",")
    ? (trimmed.split(",")[0]?.trim() ?? trimmed)
    : trimmed;
  return `${base}s summoned`;
}

/** Human-readable counter label derived from count source + op params. */
export function counterLabel(source: string, params: CounterParams): string {
  switch (source) {
    case "named_enter_count":
      return pluralSummonName(params.name || "");
    case "combo":
      return "Combo";
    case "count_in_hand":
      return params.tribe ? `${params.tribe} in hand` : "Cards in hand";
    case "count_allies":
      return params.excludeSelf ? "Other allied followers" : "Allied followers";
    case "shikigami_deaths":
      return "Shikigami death stats";
    case "crest_count":
      return "Crests";
    case "other_allies":
      return "Other allies";
    case "unique_tribe_enters":
      return `Unique ${params.tribe || "Artifact"}s entered`;
    case "necromancy":
      return "Shadows";
    case "spellboost_count":
      return "Spellboost";
    case "amulet_count":
      return "Amulets in play";
    default:
      return source.replace(/_/g, " ");
  }
}

function counterKey(source: string, params: CounterParams): string {
  const parts = [
    source,
    params.name ?? "",
    params.tribe ?? "",
    params.excludeSelf ? "1" : "0",
  ];
  return parts.join("|");
}

function paramsFromOp(
  source: string,
  op: Record<string, unknown>,
): CounterParams {
  const params: CounterParams = {};
  if (op.name != null) params.name = String(op.name);
  if (op.filter && typeof op.filter === "object") {
    const filter = op.filter as Record<string, unknown>;
    if (filter.tribe != null) params.tribe = String(filter.tribe);
  }
  if (op.tribe != null) params.tribe = String(op.tribe);
  if (op.exclude_self === true) params.excludeSelf = true;
  return params;
}

function thresholdFromGate(
  source: string,
  params: CounterParams,
  gate: Record<string, unknown>,
): number | null {
  if (source === "necromancy") {
    const cost = gate.cost;
    return cost != null ? Number(cost) : null;
  }
  if (source === "spellboost_count") {
    const count = gate.count;
    return count != null ? Number(count) : null;
  }
  const count = gate.count ?? gate.at_least ?? gate.requirement;
  return count != null ? Number(count) : null;
}

function gateMatchesSource(
  gate: Record<string, unknown>,
  source: string,
  params: CounterParams,
): boolean {
  const cond = gate.condition;
  if (typeof cond !== "string" || cond !== source) return false;
  if (params.name && gate.name != null && String(gate.name) !== params.name) {
    return false;
  }
  if (
    params.tribe &&
    gate.tribe != null &&
    String(gate.tribe) !== params.tribe
  ) {
    return false;
  }
  return true;
}

function collectGateOps(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child) => collectGateOps(child, out));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.op === "gate") out.push(obj);
  for (const [key, value] of Object.entries(obj)) {
    if (key === "op") continue;
    collectGateOps(value, out);
  }
}

function walkForSources(
  node: unknown,
  cardName: string,
  hits: Array<{ source: string; params: CounterParams }>,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child) => walkForSources(child, cardName, hits));
    return;
  }
  const obj = node as Record<string, unknown>;

  for (const field of SOURCE_FIELDS) {
    const raw = String(obj[field] ?? "").toLowerCase();
    if (!DYNAMIC_COUNT_SOURCES.has(raw)) continue;
    const params = paramsFromOp(raw, obj);
    if (raw === "named_enter_count" && !params.name) {
      params.name = cardName;
    }
    hits.push({ source: raw, params });
  }

  if (obj.op === "gate" && typeof obj.condition === "string") {
    const source = obj.condition.toLowerCase();
    if (DYNAMIC_COUNT_SOURCES.has(source)) {
      const params = paramsFromOp(source, obj);
      if (source === "named_enter_count" && !params.name) {
        params.name = cardName;
      }
      hits.push({ source, params });
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "op") continue;
    walkForSources(value, cardName, hits);
  }
}

/** Scan a card's effect tree for dynamic count sources (deduped). */
function collectTooltipCountersUncached(
  card: CardInstance,
): TooltipCounterSpec[] {
  const hits: Array<{ source: string; params: CounterParams }> = [];
  walkForSources(card, String(card.name ?? ""), hits);

  const gates: Record<string, unknown>[] = [];
  collectGateOps(card, gates);

  const byKey = new Map<string, TooltipCounterSpec>();

  for (const hit of hits) {
    const key = counterKey(hit.source, hit.params);
    if (byKey.has(key)) continue;

    let threshold: number | null = null;
    for (const gate of gates) {
      if (!gateMatchesSource(gate, hit.source, hit.params)) continue;
      const t = thresholdFromGate(hit.source, hit.params, gate);
      if (t != null) threshold = t;
    }

    byKey.set(key, {
      key,
      source: hit.source,
      label: counterLabel(hit.source, hit.params),
      threshold,
      params: hit.params,
      compoundStat: hit.source === "shikigami_deaths",
    });
  }

  return [...byKey.values()];
}

const tooltipCounterCache = new Map<string, TooltipCounterSpec[]>();

/** Card-definition counter specs (stable per card id). */
export function collectTooltipCounters(
  card: CardInstance,
): TooltipCounterSpec[] {
  const id = String(card.id ?? "");
  if (!id) return collectTooltipCountersUncached(card);
  const cached = tooltipCounterCache.get(id);
  if (cached) return cached;
  const specs = collectTooltipCountersUncached(card);
  tooltipCounterCache.set(id, specs);
  return specs;
}

/** Test / repro helper. */
export function clearTooltipCounterCache(): void {
  tooltipCounterCache.clear();
}

export type ResolvedCounterValue =
  | { kind: "single"; value: number }
  | { kind: "compound"; attack: number; defense: number };

/** Resolve the live counter value for the viewing side. */
export function resolveCounterValue(
  spec: TooltipCounterSpec,
  owner: Player,
  card: CardInstance,
): ResolvedCounterValue {
  const { source, params } = spec;

  switch (source) {
    case "named_enter_count": {
      const name = params.name || card.name || "";
      return {
        kind: "single",
        value: countNamedEnters(state, owner, name),
      };
    }
    case "combo":
      return { kind: "single", value: getPlaysThisTurn(state, owner) };
    case "count_in_hand": {
      const hand = getHand(state, owner);
      if (!params.tribe) return { kind: "single", value: hand.length };
      const tribe = params.tribe;
      return {
        kind: "single",
        value: hand.filter(
          (c) => Array.isArray(c.tribes) && c.tribes.includes(tribe),
        ).length,
      };
    }
    case "count_allies": {
      const board = getBoard(state, owner);
      return {
        kind: "single",
        value: board.filter(
          (c) =>
            c.type === "Follower" &&
            (!params.excludeSelf || c.uid !== card.uid),
        ).length,
      };
    }
    case "other_allies": {
      const board = getBoard(state, owner);
      return {
        kind: "single",
        value: board.filter((c) => c.type === "Follower" && c.uid !== card.uid)
          .length,
      };
    }
    case "shikigami_deaths": {
      const pool = state.players[owner].shikigamiDeathsThisTurn || [];
      const attack = pool.reduce(
        (acc, x) => acc + (Number(x.base_attack ?? x.attack) || 0),
        0,
      );
      const defense = pool.reduce(
        (acc, x) => acc + (Number(x.base_defense ?? x.defense) || 0),
        0,
      );
      return { kind: "compound", attack, defense };
    }
    case "crest_count":
      return {
        kind: "single",
        value: countCrests(state, owner),
      };
    case "unique_tribe_enters":
      return {
        kind: "single",
        value: countUniqueTribeEnters(state, owner, params.tribe || "Artifact"),
      };
    case "necromancy":
      return { kind: "single", value: getShadows(state, owner) };
    case "spellboost_count": {
      const ks = card.keywordState?.spellboostCount;
      const fromCard = (card as { spellboostCount?: number }).spellboostCount;
      const value =
        typeof ks === "number"
          ? ks
          : typeof fromCard === "number"
            ? fromCard
            : 0;
      return { kind: "single", value };
    }
    case "amulet_count": {
      const board = getBoard(state, owner);
      return {
        kind: "single",
        value: board.filter((c) => c.type === "Amulet").length,
      };
    }
    default:
      return { kind: "single", value: 0 };
  }
}

function formatResolvedValue(
  resolved: ResolvedCounterValue,
  threshold: number | null,
): string {
  if (resolved.kind === "compound") {
    const text = `${resolved.attack}/${resolved.defense}`;
    return threshold != null ? `${text}/${threshold}` : text;
  }
  return threshold != null
    ? `${resolved.value}/${threshold}`
    : `${resolved.value}`;
}

export function formatCounterLines(
  counters: TooltipCounterSpec[],
  owner: Player,
  card: CardInstance,
): string {
  if (!counters.length) return "";

  const lines = counters.map((spec) => {
    const resolved = resolveCounterValue(spec, owner, card);
    const valueText = formatResolvedValue(resolved, spec.threshold);
    const dataAttrs = [
      `data-source="${escapeHtml(spec.source)}"`,
      `data-counter-key="${escapeHtml(spec.key)}"`,
      `data-side="${owner}"`,
      spec.params.name ? `data-name="${escapeHtml(spec.params.name)}"` : "",
      spec.params.tribe ? `data-tribe="${escapeHtml(spec.params.tribe)}"` : "",
      spec.params.excludeSelf ? `data-exclude-self="1"` : "",
      spec.threshold != null ? `data-threshold="${spec.threshold}"` : "",
      spec.compoundStat ? `data-compound-stat="1"` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      `<div class="dynamic-counter-line" ${dataAttrs}>` +
      `(<span class="dynamic-counter-label">${escapeHtml(spec.label)}</span>: ` +
      `<span class="dynamic-counter-value">${escapeHtml(valueText)}</span>)` +
      `</div>`
    );
  });

  return `<div class="tooltip-counter-block">${lines.join("")}</div>`;
}

export function formatCounterValueText(
  spec: TooltipCounterSpec,
  owner: Player,
  card: CardInstance,
): string {
  const resolved = resolveCounterValue(spec, owner, card);
  return formatResolvedValue(resolved, spec.threshold);
}

/** Exposed for tests / PR inventory scripts. */
export function isRallyCounterSource(source: string): boolean {
  return source === "rally";
}

export function isSkyboundCounterSource(source: string): boolean {
  return source === "skybound_art";
}

/** Rally is tracked separately in tooltips.ts but uses the same live-update loop. */
export function resolveRallyValue(owner: Player): number {
  return getRally(state, owner) | 0;
}
