// src/ui/targeting.ts
// UI-only module for target confirmation - no game logic
import { byId } from "./dom.js";

/** View model for the confirmation button */
export interface ConfirmationViewModel {
    text: string;
    count: number;
    onConfirm: () => void;
}

/**
 * Shows the target confirmation button with the given view model.
 * UI only - game logic is in the onConfirm callback.
 */
export function showTargetConfirmationButton(vm: ConfirmationViewModel): void {
    const container = byId("targetingConfirmation");
    if (!container) return;

    container.innerHTML = "";

    const button = document.createElement("button");
    button.className = "confirm-targets-btn";
    button.textContent = `${vm.text} (${vm.count})`;
    button.addEventListener("click", vm.onConfirm);

    container.appendChild(button);
    container.style.display = "block";
}

/**
 * Hides and clears the target confirmation UI.
 */
export function hideTargetConfirmation(): void {
    const container = byId("targetingConfirmation");
    if (container) {
        container.innerHTML = "";
        container.style.display = "none";
    }
}

/**
 * Programmatically triggers a click on the confirmation button if present.
 * Returns true if button was found and clicked, false otherwise.
 */
export function triggerConfirmButtonClick(): boolean {
    const container = byId("targetingConfirmation");
    if (!container) return false;

    const btn = container.querySelector(".confirm-targets-btn") as HTMLButtonElement;
    if (btn) {
        btn.click();
        return true;
    }
    return false;
}
