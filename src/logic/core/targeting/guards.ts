/**
 * === MAINTENANCE MODE ===
 * This targeting system is HARDENED.
 * DO NOT add new bypasses. DO NOT add lifecycle logic to handlers.
 * Refer to docs/targeting-contract.md before making changes.
 */
import { isDev } from "../../../core/env.js";

const ALLOWED_BYPASS_OPS = new Set([
  "nested_effects",
  "safe_but_nested",
  "discard",
  "discard_select_hand",
]);
let _currentOp: string | null = null;
let _isTargetedOpDispatchActive = false;

/**
 * Marks the start of a targeted operation dispatch.
 * @param opName - The operation being dispatched.
 */
export function startDispatch(opName: string) {
  _isTargetedOpDispatchActive = true;
  if (isDev()) _currentOp = opName;
}

/**
 * Marks the end of a targeted operation dispatch.
 */
export function endDispatch() {
  _isTargetedOpDispatchActive = false;
  if (isDev()) _currentOp = null;
}

/** True while a targeted-op handler is running (runEffects is forbidden). */
export function isTargetedOpDispatchActive(): boolean {
  return _isTargetedOpDispatchActive;
}

/**
 * Temporarily bypasses the lifecycle guard for legitimate reasons (e.g. nested effects).
 * ENFORCEMENT: Only allowed for specific operations.
 */
export function runWithBypass(callback: () => void) {
  if (isDev()) {
    if (!_currentOp || !ALLOWED_BYPASS_OPS.has(_currentOp)) {
      throw new Error(
        `Illegal guard bypass attempt by op: "${_currentOp}". Bypass is restricted.`,
      );
    }
  }

  // We don't use try/finally here for _isTargetedOpDispatchActive restore
  // because if callback throws, the dispatcher's main try/finally will call endDispatch().
  // Actually, we SHOULD restore strictness if we catch, but rethrow?
  // Standard try/finally to ensure guard is restored for subsequent usage in same stack?
  const wasActive = _isTargetedOpDispatchActive;
  _isTargetedOpDispatchActive = false;
  try {
    callback();
  } finally {
    _isTargetedOpDispatchActive = wasActive;
  }
}

/**
 * Checks if a forbidden lifecycle function is being called during a targeted op dispatch.
 * Throws if active.
 */
export function guardLifecycle(functionName: string) {
  // Only check in Dev/Test environments to prevent production crashes
  if (isDev() && _isTargetedOpDispatchActive) {
    throw new Error(
      `Targeted op handler illegally invoked lifecycle function: ${functionName}`,
    );
  }
}
