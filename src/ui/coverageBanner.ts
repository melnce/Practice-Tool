/**
 * Surface unimplemented / partial card coverage when a deck is loaded.
 * Honest signal: practicing a line that only works because a card does nothing
 * is worse than having no card.
 */
import type { CardInstance } from "../core/types/index.js";
import { getImplementationStatus } from "../data/cardImplementationStatus.js";

export type CoverageCounts = {
  unimplemented: number;
  partial: number;
  /** Unique card ids that are unimplemented or partial (deck multiplicity collapsed). */
  flaggedIds: string[];
};

export function countDeckCoverage(cards: CardInstance[]): CoverageCounts {
  const flagged = new Map<string, "unimplemented" | "partial">();
  for (const card of cards) {
    const status = card.implementationStatus ?? getImplementationStatus(card);
    if (status === "unimplemented" || status === "partial") {
      const id = String(card.id ?? card.name ?? "");
      if (!id) continue;
      // Prefer unimplemented if both somehow appear
      const prev = flagged.get(id);
      if (prev === "unimplemented") continue;
      flagged.set(id, status);
    }
  }
  let unimplemented = 0;
  let partial = 0;
  for (const s of flagged.values()) {
    if (s === "unimplemented") unimplemented++;
    else partial++;
  }
  return {
    unimplemented,
    partial,
    flaggedIds: [...flagged.keys()],
  };
}

function ensureBanner(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("coverageBanner");
  if (el) return el;
  el = document.createElement("div");
  el.id = "coverageBanner";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  return el;
}

export function hideCoverageBanner(): void {
  const el =
    typeof document !== "undefined"
      ? document.getElementById("coverageBanner")
      : null;
  if (!el) return;
  el.classList.remove("visible");
  el.textContent = "";
}

/**
 * Show a persistent banner summarizing unimplemented/partial cards in loaded decks.
 */
export function showCoverageBanner(message: string): void {
  const el = ensureBanner();
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
}

export function reportDeckCoverage(
  blue: CardInstance[],
  red: CardInstance[],
): CoverageCounts {
  const combined = [...blue, ...red];
  const counts = countDeckCoverage(combined);
  if (counts.unimplemented === 0 && counts.partial === 0) {
    hideCoverageBanner();
    return counts;
  }
  const parts: string[] = [];
  // Wording must not imply the remaining cards are faithfully complete —
  // "implemented" only means "has some executable content" (see classifier).
  if (counts.unimplemented > 0) {
    parts.push(
      `${counts.unimplemented} card${counts.unimplemented === 1 ? "" : "s"} in this deck have no implemented effects`,
    );
  }
  if (counts.partial > 0) {
    parts.push(
      `${counts.partial} card${counts.partial === 1 ? "" : "s"} use unknown effect ops`,
    );
  }
  showCoverageBanner(parts.join(" · ") + " — results may be misleading");
  return counts;
}
