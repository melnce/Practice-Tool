import type { CardInstance } from "../core/types/index.js";
import { getGlobalCardIndex } from "../data/cardIndex.js";

export type CrestTooltipData = {
  name: string;
  description: string;
  image?: string;
  cardId: string;
};

const KEYWORD_LINE_RE =
  /^(Fanfare|Ward|Rush|Storm|Bane|Barrier|Aura|Intimidate|Last Words|Super-Evolve|Enhance(?: \(\d+\))?|Accelerate(?: \(\d+\))?|Crystallize(?: \(\d+\))?|Engage|Evolve|Countdown(?: \(\d+\))?)\s*:?\s*(.*)$/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectCrestOps(
  node: unknown,
  out: CrestTooltipData[],
  cardId: string,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child) => collectCrestOps(child, out, cardId));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.op === "crest" && String(obj.action || "").toLowerCase() === "gain") {
    const name = String(obj.name ?? "Crest");
    const description = String(obj.description ?? "").trim();
    const image = obj.image != null ? String(obj.image) : undefined;
    if (name || description) {
      const entry: CrestTooltipData = { name, description, cardId };
      if (image) entry.image = image;
      out.push(entry);
    }
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key === "op") continue;
    collectCrestOps(value, out, cardId);
  }
}

export function extractCardCrests(card: CardInstance): CrestTooltipData[] {
  const crests: CrestTooltipData[] = [];
  collectCrestOps(card, crests, String(card.id ?? ""));
  const byName = new Map<string, CrestTooltipData>();
  for (const crest of crests) {
    if (!byName.has(crest.name)) byName.set(crest.name, crest);
  }
  return [...byName.values()];
}

function knownCardNames(): string[] {
  const index = getGlobalCardIndex();
  if (!index) return [];
  return [...index.byName.keys()].sort((a, b) => b.length - a.length);
}

function highlightCardNames(text: string, cardNames: string[]): string {
  let out = text;
  for (const name of cardNames) {
    if (!name || name.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
    out = out.replace(
      re,
      `<span class="tooltip-card-name">${escapeHtml(name)}</span>`,
    );
  }
  return out;
}

function formatDescriptionLine(line: string, cardNames: string[]): string {
  const trimmed = line.trim();
  if (!trimmed) return "";

  const kwMatch = trimmed.match(KEYWORD_LINE_RE);
  if (kwMatch) {
    const keyword = kwMatch[1] ?? "";
    const rest = kwMatch[2] ?? "";
    const restHtml = rest
      ? ` ${highlightCardNames(escapeHtml(rest), cardNames)}`
      : "";
    return `<div class="tooltip-desc-line"><span class="tooltip-keyword">${escapeHtml(keyword)}:</span>${restHtml}</div>`;
  }

  if (/^gain crest:/i.test(trimmed)) {
    return `<div class="tooltip-desc-line tooltip-crest-lead">${highlightCardNames(escapeHtml(trimmed), cardNames)}</div>`;
  }

  return `<div class="tooltip-desc-line">${highlightCardNames(escapeHtml(trimmed), cardNames)}</div>`;
}

export function formatTooltipDescription(
  card: CardInstance,
  rawDescription: string,
): string {
  const desc = rawDescription.trim();
  if (!desc) return "";

  const cardNames = knownCardNames();
  const lines = desc.split(/\n+/);
  return `<div class="tooltip-desc-block">${lines
    .map((line) => formatDescriptionLine(line, cardNames))
    .join("")}</div>`;
}

export function formatCrestPanels(
  crests: CrestTooltipData[],
  sourceCardId: string,
): string {
  if (!crests.length) return "";

  const panels = crests.map((crest) => {
    const image =
      crest.image ||
      `https://static.dotgg.gg/shadowverse/cards/${sourceCardId}.webp`;
    const fallback = `https://static.dotgg.gg/shadowverse/cards/${crest.cardId || sourceCardId}.webp`;
    const descLines = crest.description
      .split(/\n+/)
      .map((line) => formatDescriptionLine(line, []))
      .join("");

    return (
      `<div class="tooltip-crest-panel">` +
      `<img class="tooltip-crest-icon" src="${escapeHtml(image)}" alt="" ` +
      `data-fallback-src="${escapeHtml(fallback)}" ` +
      `onerror="if(!this.dataset.fallbackApplied){this.dataset.fallbackApplied='1';this.src=this.dataset.fallbackSrc||'';}">` +
      `<div class="tooltip-crest-body">` +
      `<div class="tooltip-crest-name">${escapeHtml(crest.name)}</div>` +
      `<div class="tooltip-crest-text">${descLines}</div>` +
      `</div></div>`
    );
  });

  return `<div class="tooltip-crest-block">${panels.join("")}</div>`;
}

/** Extract numeric card id from a crest/token image URL. */
export function cardIdFromCrestImage(url: string): string | null {
  const match = String(url || "").match(/\/(\d+)(?:_token)?\.webp(?:\?|$)/i);
  const id = match?.[1];
  return id ?? null;
}

export function attachCrestImageFallback(
  img: HTMLImageElement,
  primaryUrl: string,
  cardId: string,
): void {
  const fallback = `https://static.dotgg.gg/shadowverse/cards/${cardId}.webp`;
  img.src = primaryUrl;
  img.dataset.fallbackSrc = fallback;
  img.onerror = () => {
    if (img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = "1";
    img.src = img.dataset.fallbackSrc || fallback;
  };
}
