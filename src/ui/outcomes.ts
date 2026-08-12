/**
 * Consume blocked/paused/done play or attack outcomes for UI feedback.
 */
import { showToast } from "./toast.js";

export function reportBlockedOutcome(outcome: {
  kind: string;
  reason?: string;
}): void {
  if (outcome.kind === "blocked" && outcome.reason) {
    showToast(outcome.reason);
  }
}
