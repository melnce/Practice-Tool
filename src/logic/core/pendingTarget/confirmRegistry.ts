// Serializable confirm-handler registry for pending target prompts.
// Confirm is never stored as a function on game state — only eff/op keys and data.

export type PendingConfirmHandler = () => void;

const CONFIRM_HANDLERS = new Map<string, PendingConfirmHandler>();

export function registerPendingConfirmHandler(
  key: string,
  handler: PendingConfirmHandler,
): void {
  CONFIRM_HANDLERS.set(key, handler);
}

export type PendingConfirmInput = {
  requiresConfirmation?: boolean;
  eff?: { op?: string; action?: string; type?: string };
  targetUids?: string[];
  selectCount?: number;
  enforceMinSelectCount?: boolean;
};

/** Registry key derived from serializable pending fields (survives snapshots). */
export function getPendingConfirmKey(pending: PendingConfirmInput): string | null {
  if (!pending.requiresConfirmation) return null;
  const eff = pending.eff ?? {};
  const op = String(eff.op ?? "");
  if (!op) return null;
  if (op === "fuse" && eff.action === "finalize") {
    return `fuse:finalize:${String(eff.type ?? "generic")}`;
  }
  return `targeted:${op}`;
}

export function hasPendingConfirmHandler(key: string): boolean {
  return CONFIRM_HANDLERS.has(key) || CONFIRM_HANDLERS.has("targeted:default");
}

export function runPendingConfirmHandler(key: string): boolean {
  const handler =
    CONFIRM_HANDLERS.get(key) ?? CONFIRM_HANDLERS.get("targeted:default");
  if (!handler) return false;
  handler();
  return true;
}

/** Whether pending data is sufficient to confirm (no adapter hook required). */
export function canConfirmPendingTarget(
  pending: PendingConfirmInput | null | undefined,
): boolean {
  if (!pending) return false;
  const key = getPendingConfirmKey(pending);
  if (!key || !hasPendingConfirmHandler(key)) return false;
  const targetUids = pending.targetUids ?? [];
  if (targetUids.length === 0) return false;
  if (pending.enforceMinSelectCount) {
    const required =
      typeof pending.selectCount === "number" &&
      Number.isFinite(pending.selectCount) &&
      pending.selectCount > 0
        ? pending.selectCount
        : 1;
    if (targetUids.length < required) return false;
  }
  return true;
}
