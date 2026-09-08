import { describe, it, expect } from "vitest";
import {
  DANGEROUS_TS_CODES,
  evaluateTypecheckGate,
  parseTscOutput,
  type TypecheckDiagnostic,
} from "../../scripts/lib/typecheckGate.js";

describe("typecheck gate", () => {
  it("passes when only debt diagnostics are present", () => {
    const diagnostics: TypecheckDiagnostic[] = [
      {
        file: "tests/unit/foo.test.ts",
        line: 1,
        column: 1,
        code: "TS2412",
        message: "exactOptionalPropertyTypes probe",
      },
    ];
    const report = evaluateTypecheckGate(diagnostics);
    expect(report.exitCode).toBe(0);
    expect(report.dangerous).toHaveLength(0);
    expect(report.debt).toHaveLength(1);
    expect(report.errors).toHaveLength(0);
  });

  it("fails on a dangerous diagnostic", () => {
    const report = evaluateTypecheckGate([
      {
        file: "tests/unit/foo.test.ts",
        line: 2,
        column: 1,
        code: "TS2304",
        message: "Cannot find name 'PROBE'.",
      },
    ]);
    expect(report.exitCode).toBe(1);
    expect(report.dangerous).toHaveLength(1);
    expect(report.errors[0]).toMatch(/\[DANGEROUS TS2304\]/);
    expect(DANGEROUS_TS_CODES.has("TS2304")).toBe(true);
  });

  it("does not fail on debt even when dangerous codes are absent", () => {
    const report = evaluateTypecheckGate([
      {
        file: "scripts/foo.ts",
        line: 9,
        column: 1,
        code: "TS2339",
        message: "Property 'bar' does not exist.",
      },
    ]);
    expect(report.exitCode).toBe(0);
    expect(report.debt).toHaveLength(1);
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
