import {
  FLOATING_COMBAT_TEXT_TOGGLE_ID,
  initFloatingCombatTextHistoryHooks,
  isFloatingCombatTextEnabled,
  setFloatingCombatTextEnabled,
} from "../ui/floatingCombatText.js";

export function initFloatingCombatText(): void {
  initFloatingCombatTextHistoryHooks();

  const toggle = document.getElementById(
    FLOATING_COMBAT_TEXT_TOGGLE_ID,
  ) as HTMLInputElement | null;
  if (toggle) {
    toggle.checked = isFloatingCombatTextEnabled();
    toggle.addEventListener("change", () => {
      setFloatingCombatTextEnabled(toggle.checked);
    });
  }
}
