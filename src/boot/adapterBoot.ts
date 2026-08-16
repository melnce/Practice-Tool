import { injectAdapter } from "../core/adapter.js";
import { render } from "../ui/render.js";
import { showChoiceModal } from "../ui/choiceModal.js";
import {
  showTargetConfirmationButton,
  hideTargetConfirmation,
  triggerConfirmButtonClick,
} from "../ui/targeting.js";

/** Initialize Logic -> UI Adapter (wire ALL targeting UI functions) */
export function initAdapter(): void {
  injectAdapter({
    render,
    showChoiceModal,
    showTargetConfirmationButton,
    hideTargetConfirmation,
    triggerConfirmButtonClick,
  });
}
