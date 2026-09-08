import type { DanglingPendingAuditEntry } from "../../tests/harness/danglingPendingAudit.ts";

export function leaf(testName: string): string {
  return testName.includes(" > ") ? testName.split(" > ").pop()! : testName;
}

export function auditEntryKey(entry: {
  file: string;
  testName: string;
}): string {
  return `${entry.file}::${entry.testName}`;
}

/**
 * Match a measured dangling test to an existing audit row.
 *
 * Full key match wins. Leaf fallback applies only when exactly one row in the
 * same file shares the leaf title (suite-path renames). A row already claimed
 * by another measured test cannot match again.
 */
export function findExistingAuditRow(
  file: string,
  testName: string,
  existing: readonly DanglingPendingAuditEntry[],
  consumed: ReadonlySet<string>,
): DanglingPendingAuditEntry | undefined {
  const key = `${file}::${testName}`;
  const byFull = existing.find((e) => auditEntryKey(e) === key);
  if (byFull) {
    const entryKey = auditEntryKey(byFull);
    return consumed.has(entryKey) ? undefined : byFull;
  }

  const leafTitle = leaf(testName);
  const byLeaf = existing.filter(
    (e) => e.file === file && leaf(e.testName) === leafTitle,
  );
  if (byLeaf.length !== 1) return undefined;

  const row = byLeaf[0]!;
  const entryKey = auditEntryKey(row);
  return consumed.has(entryKey) ? undefined : row;
}
