/**
 * Persistent in-game seed display + copy control.
 * Shows the literal `state.seed` (not the truncated `rng.seed`).
 */

import { state } from "../core/gameState.js";

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Sync the seed panel / input with `state.seed` when a game is live. */
export function syncSeedDisplay(): void {
  const panel = byId("gameSeedPanel");
  const valueEl = byId("gameSeedValue");
  const seedInput = byId("seedInput") as HTMLInputElement | null;

  if (!state.gameStarted || state.seed === undefined || state.seed === null) {
    if (panel) panel.hidden = true;
    return;
  }

  const literal = String(state.seed);
  if (valueEl) valueEl.textContent = literal;
  if (panel) panel.hidden = false;
  // Keep the start input aligned so rematch / script record see the same value
  if (seedInput && seedInput.value !== literal) {
    seedInput.value = literal;
  }
}

export function wireSeedCopyControl(): void {
  const btn = byId("copySeedBtn") as HTMLButtonElement | null;
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", () => {
    const literal =
      state.gameStarted && state.seed != null
        ? String(state.seed)
        : (byId("seedInput") as HTMLInputElement | null)?.value.trim() || "";
    if (!literal) return;
    const done = () => {
      const prev = btn.textContent;
      btn.textContent = "Copied";
      window.setTimeout(() => {
        btn.textContent = prev || "Copy";
      }, 1200);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(literal)
        .then(done)
        .catch(() => {
          fallbackCopy(literal);
          done();
        });
    } else {
      fallbackCopy(literal);
      done();
    }
  });
}

function fallbackCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* ignore */
  }
  document.body.removeChild(ta);
}
