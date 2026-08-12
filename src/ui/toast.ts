/**
 * Brief non-blocking toast for blocked actions and similar UI feedback.
 * Quiet by design — fires often during normal hot-seat play.
 */
let toastEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureToast(): HTMLElement {
  if (toastEl && toastEl.isConnected) return toastEl;
  const el = document.createElement("div");
  el.id = "actionToast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  toastEl = el;
  return el;
}

export function showToast(message: string, ms = 1800): void {
  if (typeof document === "undefined") return;
  const el = ensureToast();
  el.textContent = message;
  el.classList.add("visible");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    el.classList.remove("visible");
  }, ms);
}
