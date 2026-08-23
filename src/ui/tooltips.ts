// src/ui/tooltips.ts
import { state } from "../core/gameState.js";
import type { CardInstance, Player } from "../core/types/index.js";
import { resolveUid } from "../core/uidResolver.js";
import { getGlobalCardIndex } from "../data/cardIndex.js";
import { collectSetIds, formatSetBadge } from "../data/formats.js";
import {
  collectTooltipCounters,
  formatCounterLines,
} from "./tooltipCounters.js";
import {
  extractCardCrests,
  formatCrestPanels,
  formatTooltipDescription,
} from "./tooltipFormat.js";

// NEW: show +A/+D based only on buffs/debuffs (not damage)
function formatBuffDelta(card: CardInstance) {
  if (!card || card.type !== "Follower") return "";
  const a = Number(card?.buffs?.attack ?? 0);
  const d = Number(card?.buffs?.defense ?? 0);
  if (a === 0 && d === 0) return "";

  const sa = (a >= 0 ? "+" : "") + a;
  const sd = (d >= 0 ? "+" : "") + d;

  // color hint (green if any positive, red if any negative)
  const color = a < 0 || d < 0 ? "#ff6666" : "#66ff66";

  return `<br><br><span class="buff-delta" style="color:${color};font-weight:700;">${sa}/${sd}</span>`;
}

function formatSetLine(card: CardInstance): string {
  const index = getGlobalCardIndex();
  const setIds = index
    ? collectSetIds(
        [...index.byName.values()].map((c) => ({
          set: (c as { set?: unknown }).set,
        })),
      )
    : [];
  const badge = formatSetBadge(card as { set?: unknown }, setIds);
  if (!badge) return "";
  // Quiet in-game-style set label; older sets get a soft marker (not a warning).
  const color = badge.inRotation ? "#9aa3b2" : "#7a8494";
  return `<span class="card-set-line" style="color:${color};font-size:0.9em;">${badge.text}</span>`;
}

// Helper to check for the keyword OR the gate op
function hasSkyboundArt(card: any): boolean {
  if (!card) return false;
  // Check explicit keyword
  if (
    card.keywords?.some(
      (k: any) =>
        (typeof k === "string" ? k : k?.name)?.toLowerCase() === "skybound art",
    )
  )
    return true;
  // Check unified gate in fanfare
  if (
    card.fanfare?.some(
      (f: any) => f.op === "gate" && f.condition === "skybound_art",
    )
  )
    return true;
  // Check gate in triggers
  if (
    card.triggers?.some((t: any) =>
      t.effects?.some(
        (e: any) => e.op === "gate" && e.condition === "skybound_art",
      ),
    )
  )
    return true;
  // Check gate in spell effects (for spells like Alfheimr)
  if (
    card.spell?.some(
      (s: any) => s.op === "gate" && s.condition === "skybound_art",
    )
  )
    return true;
  return false;
}

export function formatCardTooltip(
  card: CardInstance,
  owner: Player | null = null,
) {
  const name = String(card?.name ?? "");
  const clazz = String(card?.class ?? "Neutral");
  const hasTribes = Array.isArray(card?.tribes) && card.tribes.length > 0;
  const tribes = hasTribes ? (card.tribes ?? []).join(", ") : "";
  const desc = (card?.description ?? "").trim();
  const side = owner ?? state.activePlayer ?? "first";

  const classLine = hasTribes ? `${clazz}/${tribes}` : clazz;
  const setLine = formatSetLine(card);

  const counters = collectTooltipCounters(card);
  const counterBlock = formatCounterLines(counters, side, card);
  const descBlock = formatTooltipDescription(card, desc);
  const crestBlock = formatCrestPanels(
    extractCardCrests(card),
    String(card.id ?? ""),
  );

  // === Fused Loot (unique) section ===
  let extraText = "";
  if (Array.isArray(card?._fusedLootNames) && card._fusedLootNames.length > 0) {
    const uniq = Array.from(
      new Set(
        card._fusedLootNames.map((n) => String(n || "").trim()).filter(Boolean),
      ),
    );
    extraText += `<br><br><span style="color: orange;">Fused Loot (unique): ${uniq.length}<br>${uniq.join(", ")}</span>`;
  } else if (
    (card as any)._fusedCards &&
    (card as any)._fusedCards.length > 0
  ) {
    extraText += `<br><span style="color: #aaa; font-size: 0.8em;">Fused: ${(card as any)._fusedCards.length} cards</span>`;
  }

  // === Rally tracker ===
  // Priority: Keyword Object -> Gate Op -> Keyword String (legacy/fallback)
  const rallyKw = card.keywords?.find(
    (k) => typeof k === "object" && k.name === "Rally",
  ) as any;
  const rallyReq = rallyKw ? rallyKw.count : null;
  const rallyGate =
    !rallyReq &&
    card.fanfare?.find((f: any) => f.op === "gate" && f.condition === "rally");
  const finalRallyReq = rallyReq || (rallyGate ? rallyGate.count : null);

  if (finalRallyReq) {
    extraText +=
      `<br><br><span class="rally-line" data-need="${finalRallyReq}" data-side="${side}" style="color: #7af;">` +
      `Rally: <span class="rally-value">0 / ${finalRallyReq}</span>` +
      `</span>`;
  }

  // === Skybound Art tracker ===
  if (hasSkyboundArt(card)) {
    const gate =
      card.fanfare?.find(
        (f: any) => f.op === "gate" && f.condition === "skybound_art",
      ) ||
      card.spell?.find(
        (s: any) => s.op === "gate" && s.condition === "skybound_art",
      );
    const req = gate ? gate.requirement || 10 : 10;
    const current =
      ((card as any).skyboundArtEvolvesWitnessed || 0) +
      (state.roundCount || 1);

    // Use structure compatible with attachTooltip's live updater
    extraText +=
      `<br><br><span class="skybound-line" data-req="${req}" style="color: #ebd04f;">` +
      `Skybound Art: <span class="skybound-value">${current} / ${req}</span>` +
      `</span>`;
  }

  // === Buff Delta ===
  const buffDelta = formatBuffDelta(card);

  const metaParts = [classLine, setLine].filter(Boolean).join("<br>");

  return (
    `<div class="tooltip-header-name">${name}</div>` +
    (metaParts ? `<div class="tooltip-header-meta">${metaParts}</div>` : "") +
    counterBlock +
    descBlock +
    crestBlock +
    extraText +
    buffDelta
  );
}

type TooltipSession = {
  anchor: HTMLElement;
  owner: Player;
  uid: string;
};

let activeSession: TooltipSession | null = null;

function hideTooltip(tooltipEl: HTMLElement) {
  tooltipEl.style.display = "none";
}

function resolveCardForAnchor(
  anchor: HTMLElement,
  fallback: CardInstance,
): CardInstance | null {
  const uid = anchor.dataset.uid;
  if (!uid) return fallback;
  return resolveUid(uid) ?? fallback;
}

function paintTooltip(
  tooltipEl: HTMLElement,
  card: CardInstance,
  owner: Player,
  anchor?: HTMLElement | null,
) {
  let html = formatCardTooltip(card, owner);
  const blockedReason = anchor?.dataset?.playBlockedReason?.trim();
  if (blockedReason) {
    html +=
      `<div class="tooltip-play-blocked" style="color:#ff8888;margin-top:0.5em;font-weight:600;">` +
      `Cannot play: ${blockedReason}</div>`;
  }
  tooltipEl.innerHTML = html;
  tooltipEl.style.whiteSpace = "normal";
  tooltipEl.style.display = "block";
}

/** Event-driven refresh — called from render() after each state paint. */
export function refreshActiveTooltips(): void {
  const tooltipEl = document.getElementById(
    "cardTooltip",
  ) as HTMLElement | null;
  if (!tooltipEl) return;

  const hoveredFromCss = document.querySelector(
    '[data-has-tooltip="1"]:hover',
  ) as HTMLElement | null;
  const hovered =
    hoveredFromCss ??
    (activeSession?.anchor?.isConnected ? activeSession.anchor : null);

  if (!hovered) {
    if (activeSession) activeSession = null;
    if (tooltipEl.style.display !== "none") hideTooltip(tooltipEl);
    return;
  }

  const uid = hovered.dataset.uid;
  if (!uid) return;

  const owner = (hovered.dataset.tooltipOwner as Player | undefined) ?? "first";
  const card = resolveUid(uid);
  if (!card) {
    activeSession = null;
    hideTooltip(tooltipEl);
    return;
  }

  activeSession = { anchor: hovered, owner, uid };
  paintTooltip(tooltipEl, card, owner, hovered);
}

export function attachTooltip(
  div: HTMLElement,
  tooltipEl: HTMLElement,
  card: CardInstance,
  isBlueSide: boolean,
) {
  div.dataset.hasTooltip = "1";
  const owner: Player = isBlueSide ? "first" : "second";
  div.dataset.tooltipOwner = owner;

  div.onmouseenter = () => {
    const liveCard = resolveCardForAnchor(div, card);
    if (!liveCard) return;
    activeSession = { anchor: div, owner, uid: liveCard.uid };
    paintTooltip(tooltipEl, liveCard, owner, div);
  };
  div.onmousemove = (e: MouseEvent) => {
    const isBottomHalf = e.clientY > window.innerHeight / 2;
    const left = Math.min(
      e.clientX + 12,
      window.innerWidth - tooltipEl.offsetWidth - 12,
    );

    // Smart Anchoring:
    // If in bottom half, anchor to BOTTOM (grow upwards).
    // If in top half, anchor to TOP (grow downwards).
    // This removes offsetHeight dependency and guarantees "stick to edge" behavior.
    if (isBottomHalf) {
      const distanceFromBottom = window.innerHeight - e.clientY + 12;
      tooltipEl.style.bottom = distanceFromBottom + "px";
      tooltipEl.style.top = "auto";
    } else {
      const distanceFromTop = e.clientY + 12;
      tooltipEl.style.top = distanceFromTop + "px";
      tooltipEl.style.bottom = "auto";
    }
    tooltipEl.style.left = Math.max(0, left) + "px";
  };
  div.onmouseleave = () => {
    if (activeSession?.anchor === div) activeSession = null;
    hideTooltip(tooltipEl);
  };
}
