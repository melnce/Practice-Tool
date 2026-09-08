/**
 * Test-only probe for resolvePendingTarget no-prompt exits.
 * Stored on globalThis next to gameState so vitest setup and SUT share one bag.
 */

import { readEnv } from "../../core/env.js";

export type NoPromptExitRecord = {
  uid: string | "leader";
  callerTestFile: string | null;
};

const PROBE_KEY = "__RESOLVE_TARGET_PROBE__";

type ProbeBag = { exits: NoPromptExitRecord[] };

function probeBag(): ProbeBag {
  const g = globalThis as { [PROBE_KEY]?: ProbeBag };
  if (!g[PROBE_KEY]) g[PROBE_KEY] = { exits: [] };
  return g[PROBE_KEY]!;
}

function callerTestFileFromStack(): string | null {
  const stack = new Error().stack ?? "";
  for (const line of stack.split("\n")) {
    const m = line.match(/\/(tests\/[^:)]+)/);
    if (m) return m[1]!;
  }
  return null;
}

export function recordNoPromptExit(uid: string | "leader"): void {
  if (readEnv("NODE_ENV") !== "test") return;
  probeBag().exits.push({ uid, callerTestFile: callerTestFileFromStack() });
}

export function getNoPromptExits(): readonly NoPromptExitRecord[] {
  return probeBag().exits;
}

export function resetResolveTargetProbe(): void {
  probeBag().exits.length = 0;
}
