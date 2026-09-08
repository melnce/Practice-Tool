import type { GameState } from "../../src/core/types/game.js";
import { DANGLING_PENDING_AUDIT } from "./danglingPendingAudit.js";

export type PendingTargetEffect = NonNullable<GameState["pendingTargetEffect"]>;

/** Allowlisted tests that legitimately end with pendingTargetEffect set. */
export const STRICT_CHOOSE_ALLOWLIST: ReadonlyArray<{
  file: string;
  testName: string;
  reason: string;
}> = DANGLING_PENDING_AUDIT.filter((e) => e.classification === "A").map(
  (e) => ({
    file: e.file,
    testName: e.testName,
    reason: e.reason,
  }),
);

const ALLOWLIST_KEYS = new Set(
  STRICT_CHOOSE_ALLOWLIST.map((e) => `${e.file}::${e.testName}`),
);

export function normalizeTestFile(filePath: string): string {
  const cwd = process.cwd();
  if (filePath.startsWith(`${cwd}/`)) {
    return filePath.slice(cwd.length + 1);
  }
  return filePath.replace(/^\.\//, "");
}

export function formatChooseStrictModeFailed(
  file: string,
  testName: string,
  pending: PendingTargetEffect,
): string {
  const op =
    pending.eff && typeof pending.eff === "object" && "op" in pending.eff
      ? String((pending.eff as { op?: unknown }).op ?? "(unknown)")
      : "(unknown)";
  const selectCount = pending.selectCount ?? 0;
  const chosen = pending.targetUids?.length ?? pending.targets?.length ?? 0;
  const requiresConfirmation = pending.requiresConfirmation === true;
  return [
    `chooseStrictModeFailed: ${file}`,
    `  test: "${testName}"`,
    `  op: ${op}`,
    `  selectCount: ${selectCount}`,
    `  chosen: ${chosen}/${selectCount}`,
    `  requiresConfirmation: ${requiresConfirmation}`,
    "  The engine is still waiting for target selection. Call resolvePendingTarget(...) before the test ends, or add a (A) entry to tests/harness/danglingPendingAudit.ts if the open prompt is the subject.",
  ].join("\n");
}

/**
 * Bidirectional strict-choose gate (afterEach hook).
 * - Dangling test not in (A) → fail with chooseStrictModeFailed details.
 * - (A) entry that no longer dangles → fail so stale allowlist rows get deleted.
 */
export function assertStrictChooseAfterTest(
  file: string,
  testName: string,
  pending: GameState["pendingTargetEffect"],
): void {
  const key = `${file}::${testName}`;
  const allowlisted = ALLOWLIST_KEYS.has(key);
  const hasPending = pending != null;

  if (hasPending && !allowlisted) {
    throw new Error(formatChooseStrictModeFailed(file, testName, pending));
  }

  if (!hasPending && allowlisted) {
    const entry = STRICT_CHOOSE_ALLOWLIST.find(
      (e) => e.file === file && e.testName === testName,
    );
    throw new Error(
      [
        `strict-choose allowlist entry no longer reproduces: ${file}`,
        `  test: "${testName}"`,
        `  reason: ${entry?.reason ?? "(unknown)"}`,
        "  This test no longer ends with pendingTargetEffect set — remove the row from tests/harness/danglingPendingAudit.ts.",
      ].join("\n"),
    );
  }
}
