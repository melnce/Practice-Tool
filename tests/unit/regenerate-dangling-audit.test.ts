import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DANGLING_PENDING_AUDIT } from "../../tests/harness/danglingPendingAudit.ts";
import {
  auditEntryKey,
  findExistingAuditRow,
  leaf,
} from "../../scripts/lib/regenerateDanglingAuditMatch.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const AUDIT_PATH = join(ROOT, "tests/harness/danglingPendingAudit.ts");
const SCRIPT = join(ROOT, "scripts/regenerate-dangling-audit.ts");

const LEAF_COLLISION_CASES = [
  {
    file: "tests/mechanics/target-prompt-undo.test.ts",
    leafTitle:
      "click one target of two, undo confirm step → prompt open with empty targetUids",
  },
  {
    file: "tests/mechanics/fuse-gear-lifecycle.test.ts",
    leafTitle:
      "one Confirm Targets undo step per prompt; undo reopens with committed pick",
  },
] as const;

function splitMeasuredKeys(): {
  main: Array<{ file: string; testName: string }>;
  audit: Array<{ file: string; testName: string }>;
} {
  const main: Array<{ file: string; testName: string }> = [];
  const audit: Array<{ file: string; testName: string }> = [];
  for (const entry of DANGLING_PENDING_AUDIT) {
    const row = { file: entry.file, testName: entry.testName };
    if (entry.file.startsWith("tests/audit/")) {
      audit.push(row);
    } else {
      main.push(row);
    }
  }
  return { main, audit };
}

function runRegenerate(
  mainPath: string,
  auditPath: string,
): { status: number; stderr: string } {
  try {
    execSync(`npx tsx ${SCRIPT} ${mainPath} ${auditPath}`, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stderr: "" };
  } catch (error) {
    const err = error as {
      status?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      status: err.status ?? 1,
      stderr: `${err.stderr ?? ""}${err.stdout ?? ""}`,
    };
  }
}

describe("regenerate-dangling-audit match", () => {
  it("refuses ambiguous leaf fallback when two rows share the same leaf in one file", () => {
    for (const { file, leafTitle } of LEAF_COLLISION_CASES) {
      const rows = DANGLING_PENDING_AUDIT.filter(
        (e) => e.file === file && leaf(e.testName) === leafTitle,
      );
      expect(rows.length).toBeGreaterThan(1);

      const consumed = new Set<string>();
      const fakeSuite = `BRAND NEW UNCLASSIFIED SUITE > ${leafTitle}`;
      expect(
        findExistingAuditRow(file, fakeSuite, DANGLING_PENDING_AUDIT, consumed),
      ).toBeUndefined();
    }
  });

  it("upgrades a renamed suite path when the leaf matches exactly one row", () => {
    const row = DANGLING_PENDING_AUDIT.find(
      (e) => e.file === LEAF_COLLISION_CASES[0].file,
    );
    expect(row).toBeDefined();

    const renamed = `renamed suite path only > ${leaf(row!.testName)}`;
    const consumed = new Set<string>();
    const match = findExistingAuditRow(
      row!.file,
      renamed,
      DANGLING_PENDING_AUDIT,
      consumed,
    );
    expect(match).toBeDefined();
    expect(auditEntryKey(match!)).toBe(auditEntryKey(row!));
  });

  it("refuses a second measured test claiming the same audit row", () => {
    const row = DANGLING_PENDING_AUDIT[0]!;
    const consumed = new Set<string>();
    const first = findExistingAuditRow(
      row.file,
      row.testName,
      DANGLING_PENDING_AUDIT,
      consumed,
    );
    expect(first).toBeDefined();
    consumed.add(auditEntryKey(first!));

    const renamed = `another suite > ${leaf(row.testName)}`;
    expect(
      findExistingAuditRow(row.file, renamed, DANGLING_PENDING_AUDIT, consumed),
    ).toBeUndefined();
  });
});

describe("regenerate-dangling-audit script", () => {
  it.each(LEAF_COLLISION_CASES)(
    "aborts without writing when an unclassified test collides on leaf ($file)",
    ({ file, leafTitle }) => {
      const dir = mkdtempSync(join(tmpdir(), "regen-audit-"));
      const mainPath = join(dir, "main.json");
      const auditPath = join(dir, "audit.json");
      const { main, audit } = splitMeasuredKeys();

      main.push({
        file,
        testName: `BRAND NEW UNCLASSIFIED SUITE > ${leafTitle}`,
      });

      writeFileSync(mainPath, JSON.stringify(main));
      writeFileSync(auditPath, JSON.stringify(audit));

      const before = readFileSync(AUDIT_PATH, "utf8");
      const result = runRegenerate(mainPath, auditPath);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Refusing to regenerate/);
      expect(readFileSync(AUDIT_PATH, "utf8")).toBe(before);

      rmSync(dir, { recursive: true, force: true });
    },
  );
});
