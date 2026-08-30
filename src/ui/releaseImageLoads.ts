/**
 * Cancel pending/failed <img> loads before a subtree is detached.
 *
 * Chromium's ImageLoader keeps a strong ref to HTMLImageElement while a
 * network load is in flight. The element keeps its parent chain, so a
 * detached .card (tooltips, keywords, IDL on* listeners, …) cannot be GC'd
 * until the request settles. CDN stalls / resets / aborts mid-session turn
 * that into unbounded DOM retention across zone reconciles.
 *
 * Clearing src + dropping onload/onerror cancels the loader and releases the
 * closure edge from crest fallback handlers (render.ts / tooltipFormat.ts).
 */
export function releaseImageLoads(root: Node | null | undefined): void {
  if (!root || typeof document === "undefined") return;

  const imgs: HTMLImageElement[] = [];
  if (root instanceof HTMLImageElement) {
    imgs.push(root);
  }
  if (root instanceof Element || root instanceof DocumentFragment) {
    imgs.push(...root.querySelectorAll("img"));
  }

  for (const img of imgs) {
    img.onload = null;
    img.onerror = null;
    // Cancel in-flight request; empty string / removeAttribute both drop the
    // pending ImageLoader association in Chromium.
    try {
      img.removeAttribute("src");
      img.src = "";
    } catch {
      /* ignore — element may already be in a torn-down document */
    }
  }
}
