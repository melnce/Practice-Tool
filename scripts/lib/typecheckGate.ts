/**
 * Extended typecheck gate — src/, scripts/, and tests/ with bidirectional allowlist.
 *
 * Dangerous diagnostics (undefined identifiers, wrong arity, impossible comparisons)
 * are never allowlisted; they must be fixed.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../..");

export const TYPECHECK_CONFIG_PATH = path.join(ROOT, "tsconfig.typecheck.json");
export const TYPECHECK_ALLOWLIST_PATH = path.join(
  ROOT,
  "typecheck-gate-allowlist.json",
);

/** Diagnostics that must be zero — never allowlisted. */
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

export type TypecheckAllowEntry = {
  file: string;
  line: number;
  column: number;
  code: string;
  reason: string;
};

export type TypecheckGateReport = {
  diagnostics: TypecheckDiagnostic[];
  dangerous: TypecheckDiagnostic[];
  allowlisted: TypecheckDiagnostic[];
  unallowlisted: TypecheckDiagnostic[];
  unmatchedAllowlist: TypecheckAllowEntry[];
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

export function diagnosticKey(d: {
  file: string;
  line: number;
  column: number;
  code: string;
}): string {
  return `${d.file}:${d.line}:${d.column}:${d.code}`;
}

export function loadTypecheckAllowlist(
  filePath = TYPECHECK_ALLOWLIST_PATH,
): TypecheckAllowEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error(`${filePath} is not a JSON array`);
  }
  return raw as TypecheckAllowEntry[];
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
  allowlist: TypecheckAllowEntry[],
): TypecheckGateReport {
  const dangerous = diagnostics.filter((d) => DANGEROUS_TS_CODES.has(d.code));

  const allowlistable = diagnostics.filter(
    (d) => !DANGEROUS_TS_CODES.has(d.code),
  );
  const allowlistKeys = new Set(allowlist.map((e) => diagnosticKey(e)));

  const allowlisted: TypecheckDiagnostic[] = [];
  const unallowlisted: TypecheckDiagnostic[] = [];
  for (const d of allowlistable) {
    if (allowlistKeys.has(diagnosticKey(d))) {
      allowlisted.push(d);
    } else {
      unallowlisted.push(d);
    }
  }

  const liveKeys = new Set(allowlistable.map((d) => diagnosticKey(d)));
  const unmatchedAllowlist = allowlist.filter(
    (e) => !liveKeys.has(diagnosticKey(e)),
  );

  const errors: string[] = [];

  for (const d of dangerous) {
    errors.push(
      `[DANGEROUS ${d.code}] ${d.file}:${d.line}:${d.column} — ${d.message}`,
    );
  }
  for (const d of unallowlisted) {
    errors.push(
      `[NEW ${d.code}] ${d.file}:${d.line}:${d.column} — ${d.message}`,
    );
  }
  for (const e of unmatchedAllowlist) {
    errors.push(
      `[STALE ALLOWLIST] ${e.file}:${e.line}:${e.column} ${e.code} — ${e.reason}`,
    );
  }

  return {
    diagnostics,
    dangerous,
    allowlisted,
    unallowlisted,
    unmatchedAllowlist,
    errors,
    exitCode: errors.length > 0 ? 1 : 0,
  };
}

export function runTypecheckGate(
  allowlistOverride?: TypecheckAllowEntry[],
): TypecheckGateReport {
  const { diagnostics } = runTsc();
  const allowlist = allowlistOverride ?? loadTypecheckAllowlist();
  return evaluateTypecheckGate(diagnostics, allowlist);
}

export function reasonForCode(code: string): string {
  switch (code) {
    case "TS2412":
      return "exactOptionalPropertyTypes: optional field may receive undefined in test/script setup";
    case "TS2339":
      return "property access on loosely typed fixture or JSON card blob in test/script";
    case "TS2345":
      return "argument type mismatch in test/script helper call (non-undefined-id debt)";
    case "TS2322":
      return "assignment type mismatch in test/script setup";
    case "TS2532":
      return "possibly undefined value used without narrow in test/script";
    case "TS2379":
      return "exactOptionalPropertyTypes on object literal in test/script";
    case "TS18048":
      return "possibly undefined indexed access in test/script";
    case "TS5097":
      return "Playwright page.evaluate uses Vite /src/*.ts import paths (browser-only)";
    case "TS2307":
      return "stale debug script import path predating src/ layout (script not in check chain)";
    case "TS2835":
    case "TS2834":
      return "relative import path missing explicit .js extension in script/test";
    case "TS7006":
      return "implicit any parameter in script/test callback";
    case "TS2365":
      return "arithmetic on incompatible types in test assertion helper";
    case "TS2353":
      return "object literal excess property in test fixture";
    case "TS1484":
      return "type-only import must use import type under verbatimModuleSyntax";
    case "TS2375":
      return "exactOptionalPropertyTypes undefined vs missing on object literal";
    case "TS2741":
      return "required property missing on test fixture object literal";
    case "TS2769":
      return "no matching overload in test/script call";
    case "TS2678":
      return "switch case type never matches in test/script";
    case "TS2362":
    case "TS2363":
      return "arithmetic operand type mismatch in test/script";
    case "TS2559":
      return "spread type has no properties in test/script";
    case "TS7053":
      return "implicit any element access in test/script";
    case "TS18046":
      return "unknown typed value used without narrow in script";
    case "TS18047":
      return "possibly null value in script";
    case "TS2538":
      return "invalid index type in script";
    case "TS2551":
      return "property typo on loosely typed object in test/script";
    case "TS2739":
      return "object literal missing required properties in test fixture";
    case "TS2740":
      return "object missing required properties in test fixture";
    case "TS2550":
      return "ES target does not support language feature in test/script";
    case "TS7016":
      return "missing declaration for import in script";
    case "TS2300":
      return "duplicate identifier in test/script";
    case "TS1543":
      return "importing non-type with import type in test/script";
    case "TS5097":
      return "import path ends with .ts without allowImportingTsExtensions";
    default:
      return `pre-typecheck debt (${code}) in test/script tree`;
  }
}

export function buildAllowlistFromDiagnostics(
  diagnostics: TypecheckDiagnostic[],
): TypecheckAllowEntry[] {
  return diagnostics
    .filter((d) => !DANGEROUS_TS_CODES.has(d.code))
    .map((d) => ({
      file: d.file,
      line: d.line,
      column: d.column,
      code: d.code,
      reason: reasonForCode(d.code),
    }))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.column - b.column ||
        a.code.localeCompare(b.code),
    );
}
