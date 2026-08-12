/**
 * Surface unimplemented / unknown-op card coverage when a deck is loaded.
 * Honest signal: practicing a line that only works because a card does nothing
 * is worse than having no card.
 *
 * Note: cards with status `ops_present` are NOT claimed as text-faithful — that
 * label only means some executable content exists.
 */
import type { CardInstance } from "../core/types/index.js";
import { getImplementationStatus } from "../data/cardImplementationStatus.js";

export type CoverageCounts = {
  unimplemented: number;
  unknown_ops: number;
  /** Unique card ids that are unimplemented or unknown_ops (deck multiplicity collapsed). */
  flaggedIds: string[];
};

export function countDeckCoverage(cards: CardInstance[]): CoverageCounts {
  const flagged = new Map<string, "unimplemented" | "unknown_ops">();
  for (const card of cards) {
    const status = card.implementationStatus ?? getImplementationStatus(card);
    if (status === "unimplemented" || status === "unknown_ops") {
      const id = String(card.id ?? card.name ?? "");
      if (!id) continue;
      // Prefer unimplemented if both somehow appear
      const prev = flagged.get(id);
      if (prev === "unimplemented") continue;
      flagged.set(id, status);
    }
  }
  let unimplemented = 0;
  let unknown_ops = 0;
  for (const s of flagged.values()) {
    if (s === "unimplemented") unimplemented++;
    else unknown_ops++;
  }
  return {
    unimplemented,
    unknown_ops,
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
 * Show a persistent banner summarizing unimplemented/unknown_ops cards in loaded decks.
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
  if (counts.unimplemented === 0 && counts.unknown_ops === 0) {
    hideCoverageBanner();
    return counts;
  }
  const parts: string[] = [];
  // Wording must not imply the remaining cards are faithfully complete —
  // "ops_present" only means "has some executable content" (see classifier).
  if (counts.unimplemented > 0) {
    parts.push(
      `${counts.unimplemented} card${counts.unimplemented === 1 ? "" : "s"} in this deck have no programmed effects`,
    );
  }
  if (counts.unknown_ops > 0) {
    parts.push(
      `${counts.unknown_ops} card${counts.unknown_ops === 1 ? "" : "s"} use unknown effect ops`,
    );
  }
  showCoverageBanner(
    parts.join(" · ") +
      " — other cards may still have incomplete clauses; results may be misleading",
  );
  return counts;
}
