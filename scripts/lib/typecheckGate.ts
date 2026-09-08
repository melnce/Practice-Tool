/**
 * Extended typecheck gate — src/, scripts/, and tests/.
 *
 * Runs tsc over the wider tree and fails only on dangerous diagnostics
 * (undefined identifiers, wrong arity, impossible comparisons). All other
 * pre-existing debt is reported but does not fail the gate.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

export const TYPECHECK_CONFIG_PATH = path.join(ROOT, "tsconfig.typecheck.json");

/** Diagnostics that fail the gate. Everything else is debt, not a blocker. */
export const DANGEROUS_TS_CODES = new Set([
  "TS2304", // Cannot find name
  "TS2552", // Cannot find name (did you mean …)
  "TS2554", // Wrong argument count
  "TS2367", // Unintentional comparison / no overlap
]);

export type TypecheckDiagnostic = {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
};

export type TypecheckGateReport = {
  diagnostics: TypecheckDiagnostic[];
  dangerous: TypecheckDiagnostic[];
  debt: TypecheckDiagnostic[];
  errors: string[];
  exitCode: number;
};

const TSC_LINE_RE = /^(.*)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

export function parseTscOutput(output: string): TypecheckDiagnostic[] {
  const diagnostics: TypecheckDiagnostic[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const match = rawLine.match(TSC_LINE_RE);
    if (!match) continue;
    const [, file, line, column, code, message] = match;
    if (!file || !line || !column || !code || message === undefined) continue;
    diagnostics.push({
      file: file.replace(/\\/g, "/"),
      line: Number(line),
      column: Number(column),
      code,
      message,
    });
  }
  return diagnostics;
}

export function runTsc(configPath = TYPECHECK_CONFIG_PATH): {
  diagnostics: TypecheckDiagnostic[];
  output: string;
} {
  const result = spawnSync("npx", ["tsc", "--noEmit", "-p", configPath], {
    cwd: ROOT,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { diagnostics: parseTscOutput(output), output };
}

export function evaluateTypecheckGate(
  diagnostics: TypecheckDiagnostic[],
): TypecheckGateReport {
  const dangerous = diagnostics.filter((d) => DANGEROUS_TS_CODES.has(d.code));
  const debt = diagnostics.filter((d) => !DANGEROUS_TS_CODES.has(d.code));

  const errors = dangerous.map(
    (d) =>
      `[DANGEROUS ${d.code}] ${d.file}:${d.line}:${d.column} — ${d.message}`,
  );

  return {
    diagnostics,
    dangerous,
    debt,
    errors,
    exitCode: errors.length > 0 ? 1 : 0,
  };
}

export function runTypecheckGate(): TypecheckGateReport {
  const { diagnostics } = runTsc();
  return evaluateTypecheckGate(diagnostics);
}
