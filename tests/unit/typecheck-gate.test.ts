import { describe, it, expect } from "vitest";
import {
  DANGEROUS_TS_CODES,
  diagnosticKey,
  evaluateTypecheckGate,
  parseTscOutput,
  type TypecheckAllowEntry,
  type TypecheckDiagnostic,
} from "../../scripts/lib/typecheckGate.js";

describe("typecheck gate", () => {
  it("passes when live diagnostics match the allowlist exactly", () => {
    const diagnostics: TypecheckDiagnostic[] = [
      {
        file: "tests/unit/foo.test.ts",
        line: 1,
        column: 1,
        code: "TS2412",
        message: "exactOptionalPropertyTypes probe",
      },
    ];
    const allowlist: TypecheckAllowEntry[] = [
      {
        file: "tests/unit/foo.test.ts",
        line: 1,
        column: 1,
        code: "TS2412",
        reason: "verified category debt",
      },
    ];
    const report = evaluateTypecheckGate(diagnostics, allowlist);
    expect(report.exitCode).toBe(0);
    expect(report.dangerous).toHaveLength(0);
    expect(report.unallowlisted).toHaveLength(0);
    expect(report.unmatchedAllowlist).toHaveLength(0);
  });

  it("fails on a new non-dangerous violation", () => {
    const report = evaluateTypecheckGate(
      [
        {
          file: "tests/unit/foo.test.ts",
          line: 2,
          column: 1,
          code: "TS2339",
          message: "Property 'bar' does not exist.",
        },
      ],
      [],
    );
    expect(report.exitCode).toBe(1);
    expect(report.unallowlisted).toHaveLength(1);
    expect(report.errors[0]).toMatch(/\[NEW TS2339\]/);
  });

  it("fails on a dangerous diagnostic even if allowlisted", () => {
    const diagnostics: TypecheckDiagnostic[] = [
      {
        file: "tests/unit/foo.test.ts",
        line: 3,
        column: 1,
        code: "TS2304",
        message: "Cannot find name 'PROBE'.",
      },
    ];
    const allowlist: TypecheckAllowEntry[] = [
      {
        file: "tests/unit/foo.test.ts",
        line: 3,
        column: 1,
        code: "TS2304",
        reason: "must not suppress dangerous codes",
      },
    ];
    const report = evaluateTypecheckGate(diagnostics, allowlist);
    expect(report.exitCode).toBe(1);
    expect(report.dangerous).toHaveLength(1);
    expect(report.errors[0]).toMatch(/\[DANGEROUS TS2304\]/);
    expect(DANGEROUS_TS_CODES.has("TS2304")).toBe(true);
    expect(allowlist.map(diagnosticKey)).toContain(
      diagnosticKey(diagnostics[0]!),
    );
  });

  it("fails when an allowlist entry no longer reproduces", () => {
    const report = evaluateTypecheckGate(
      [],
      [
        {
          file: "scripts/foo.ts",
          line: 9,
          column: 1,
          code: "TS18048",
          reason: "stale probe",
        },
      ],
    );
    expect(report.exitCode).toBe(1);
    expect(report.unmatchedAllowlist).toHaveLength(1);
    expect(report.errors[0]).toMatch(/\[STALE ALLOWLIST\]/);
  });

  it("parses tsc error lines", () => {
    const parsed = parseTscOutput(
      `scripts/foo.ts(10,3): error TS2339: Property 'bar' does not exist on type 'X'.`,
    );
    expect(parsed).toEqual([
      {
        file: "scripts/foo.ts",
        line: 10,
        column: 3,
        code: "TS2339",
        message: "Property 'bar' does not exist on type 'X'.",
      },
    ]);
  });
});
