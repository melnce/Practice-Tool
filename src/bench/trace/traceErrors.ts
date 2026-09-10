// Trace runner hard failures — never end a game silently.

import type { SoakAction } from "../soakEnv.js";

export class TraceRunnerError extends Error {
  readonly action?: SoakAction;
  readonly lineIndex?: number;
  readonly gameIndex?: number;

  constructor(
    message: string,
    opts?: { action?: SoakAction; lineIndex?: number; gameIndex?: number },
  ) {
    super(message);
    this.name = "TraceRunnerError";
    if (opts?.action !== undefined) this.action = opts.action;
    if (opts?.lineIndex !== undefined) this.lineIndex = opts.lineIndex;
    if (opts?.gameIndex !== undefined) this.gameIndex = opts.gameIndex;
  }
}

export function soakActionKey(action: SoakAction): string {
  return JSON.stringify(action);
}

export function isLegalSoakAction(
  action: SoakAction,
  legal: SoakAction[],
): boolean {
  const key = soakActionKey(action);
  return legal.some((candidate) => soakActionKey(candidate) === key);
}
