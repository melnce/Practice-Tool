/** Card/crest image fallback with handler cleanup (no retention on failed loads). */

export function detachImageLoadHandlers(img: HTMLImageElement): void {
  img.onerror = null;
  img.onload = null;
}

export function cdnCardImageUrl(cardId: string): string {
  return `https://static.dotgg.gg/shadowverse/cards/${cardId}.webp`;
}

export function cardIdFromImageUrl(url: string): string | null {
  const match = String(url || "").match(/\/(\d+)(?:_token)?\.webp(?:\?|$)/i);
  return match?.[1] ?? null;
}

/**
 * Primary → CDN fallback on error (404). Skips onerror when URLs match so a
 * connection failure cannot install a self-referencing handler that retains the
 * element. Clears handlers after success or after fallback is exhausted.
 */
export function attachCardImageFallback(
  img: HTMLImageElement,
  primaryUrl: string,
  cardId: string,
): void {
  detachImageLoadHandlers(img);
  const fallback = cdnCardImageUrl(cardId);
  const primary = primaryUrl || fallback;

  img.src = primary;
  if (!cardId || primary === fallback) return;

  img.dataset.fallbackSrc = fallback;
  delete img.dataset.fallbackApplied;

  img.onload = () => {
    detachImageLoadHandlers(img);
  };
  img.onerror = () => {
    if (img.dataset.fallbackApplied) {
      detachImageLoadHandlers(img);
      return;
    }
    img.dataset.fallbackApplied = "1";
    img.src = img.dataset.fallbackSrc || fallback;
  };
}

export function wireTooltipCrestImageFallbacks(root: ParentNode): void {
  root
    .querySelectorAll<HTMLImageElement>(
      "img.tooltip-crest-icon[data-fallback-src]",
    )
    .forEach((img) => {
      const primary = img.getAttribute("src") || "";
      const fallback = img.dataset.fallbackSrc || "";
      const cardId =
        cardIdFromImageUrl(fallback) || cardIdFromImageUrl(primary) || "";
      if (!cardId) return;
      attachCardImageFallback(img, primary, cardId);
    });
}

export function detachImageLoadHandlersIn(root: ParentNode): void {
  root.querySelectorAll("img").forEach((node) => {
    detachImageLoadHandlers(node as HTMLImageElement);
  });
}
