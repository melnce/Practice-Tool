// src/ui/tooltips.ts
import { state } from "../core/gameState.js";
import type { CardInstance, Player } from "../core/types/index.js";

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

  const classLine = hasTribes ? `${clazz}/${tribes}` : clazz;

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
    const side = owner ?? state.activePlayer ?? "first";
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

  return `${name}
  
${classLine}

${desc}${extraText}${buffDelta}`;
}

export function attachTooltip(
  div: HTMLElement,
  tooltipEl: HTMLElement,
  card: CardInstance,
  isBlueSide: boolean,
) {
  div.dataset.hasTooltip = "1";
  const owner: Player = isBlueSide ? "first" : "second";
  div.onmouseenter = () => {
    // Render once so layout is stable
    tooltipEl.innerHTML = formatCardTooltip(card, owner);
    tooltipEl.style.whiteSpace = "pre-line";
    tooltipEl.style.display = "block";

    // Live refresh elements
    const rallyLine = tooltipEl.querySelector(".rally-line");
    const rallyValue = tooltipEl.querySelector(".rally-value");
    const skyboundLine = tooltipEl.querySelector(".skybound-line");
    const skyboundValue = tooltipEl.querySelector(".skybound-value");

    // === Safe live update (auto-stop) ===
    if ((rallyLine && rallyValue) || (skyboundLine && skyboundValue)) {
      // Rally Data
      const rSide = rallyLine?.getAttribute("data-side");
      const rNeedAttr = rallyLine?.getAttribute("data-need");
      const rNeed = rNeedAttr ? parseInt(rNeedAttr, 10) : null;

      // Skybound Data
      const sReqAttr = skyboundLine?.getAttribute("data-req");
      const sReq = sReqAttr ? parseInt(sReqAttr, 10) : 10;

      let lastRally = NaN;
      let lastSkybound = NaN;
      const stopAt = Date.now() + 120000; // hard cap: 2 min

      function tick() {
        // stop reasons: not hovered, node gone, tab hidden, time cap
        if (
          !div.isConnected ||
          !tooltipEl.isConnected ||
          document.hidden ||
          !div.matches(":hover") ||
          Date.now() > stopAt
        ) {
          cancelAnimationFrame((div as any).__ttRaf || 0);
          (div as any).__ttRaf = null;
          return;
        }

        // Update Rally
        if (rallyLine && rallyValue) {
          const curr =
            rSide === "first"
              ? state.players.first.rally | 0
              : rSide === "second"
                ? state.players.second.rally | 0
                : 0;
          if (curr !== lastRally) {
            rallyValue.textContent =
              rNeed != null ? `${curr} / ${rNeed}` : `${curr}`;
            lastRally = curr;
          }
        }

        // Update Skybound
        if (skyboundLine && skyboundValue) {
          const witnesses = card.skyboundArtEvolvesWitnessed || 0;
          const curr = (state.roundCount || 1) + witnesses;
          if (curr !== lastSkybound) {
            skyboundValue.textContent = `${curr} / ${sReq}`;
            lastSkybound = curr;
          }
        }

        (div as any).__ttRaf = requestAnimationFrame(tick);
      }
      cancelAnimationFrame((div as any).__ttRaf || 0);
      (div as any).__ttRaf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame((div as any).__ttRaf || 0);
      (div as any).__ttRaf = null;
    }
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
    tooltipEl.style.display = "none";
    if ((div as any).__ttRaf) cancelAnimationFrame((div as any).__ttRaf);
    (div as any).__ttRaf = null;
  };
}

// Global safety: stop all running loops when page hides/unloads
window.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // cancel any stray RAF stored on hovered elements
    document.querySelectorAll('[data-has-tooltip="1"]').forEach((el) => {
      const anyEl = el as any;
      cancelAnimationFrame(anyEl.__ttRaf || 0);
      anyEl.__ttRaf = null;
    });
  }
});
