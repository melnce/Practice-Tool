/**
 * Settings drawer (phase 3) — hamburger + slide-out #controlPanel.
 * Self-contained: remove this module + css/settings-drawer.css to revert.
 */

const SETTINGS_SHORTCUT = "Ctrl+Shift+M";

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function closeHistoryDrawer(): void {
  const drawer = getEl("historyDrawer");
  const scrim = getEl("historyScrim");
  if (!drawer || !scrim) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  scrim.classList.remove("show");
}

function isHistoryOpen(): boolean {
  const drawer = getEl("historyDrawer");
  return drawer?.classList.contains("open") ?? false;
}

export function closeSettingsDrawer(): void {
  const drawer = getEl("settingsDrawer");
  const scrim = getEl("settingsScrim");
  if (!drawer || !scrim) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  scrim.classList.remove("show");
}

export function isSettingsOpen(): boolean {
  const drawer = getEl("settingsDrawer");
  return drawer?.classList.contains("open") ?? false;
}

export function openSettingsDrawer(): void {
  if (isHistoryOpen()) closeHistoryDrawer();
  const drawer = getEl("settingsDrawer");
  const scrim = getEl("settingsScrim");
  if (!drawer || !scrim) return;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  scrim.classList.add("show");
}

export function initSettingsDrawer(): void {
  const toggle = getEl("settingsToggle");
  const drawer = getEl("settingsDrawer");
  const scrim = getEl("settingsScrim");
  if (!toggle || !drawer || !scrim) return;

  const toggleDrawer = () => {
    if (isSettingsOpen()) closeSettingsDrawer();
    else openSettingsDrawer();
  };

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDrawer();
  });

  scrim.addEventListener("click", () => closeSettingsDrawer());

  drawer.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", (e) => {
    if (
      isSettingsOpen() &&
      !drawer.contains(e.target as Node) &&
      e.target !== toggle
    ) {
      closeSettingsDrawer();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSettingsOpen()) {
      closeSettingsDrawer();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleDrawer();
    }
  });

  // Expose for history drawer mutual exclusion
  (
    window as Window & { __svwbCloseSettings?: () => void }
  ).__svwbCloseSettings = closeSettingsDrawer;
}

export const settingsDrawerShortcut = SETTINGS_SHORTCUT;
