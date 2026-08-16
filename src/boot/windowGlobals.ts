import {
  endTurnAction,
  bonusPpAction,
  maybeAdvanceScriptFromUi,
} from "../ui/playerDispatch.js";

/** Expose globals for UI onclick handlers — routed through PlayerAction dispatch */
export function initWindowGlobals(): void {
  window.endTurnBlue = () => {
    endTurnAction();
    maybeAdvanceScriptFromUi();
  };
  window.endTurnRed = () => {
    endTurnAction();
    maybeAdvanceScriptFromUi();
  };
  window.useRedBoost = () => {
    bonusPpAction("second");
  };
}
