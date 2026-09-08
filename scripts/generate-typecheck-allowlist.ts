#!/usr/bin/env tsx
/**
 * Regenerate typecheck-gate-allowlist.json from current tsc output.
 * Run only after fixing all dangerous diagnostics.
 */
import fs from "node:fs";
import {
  TYPECHECK_ALLOWLIST_PATH,
  buildAllowlistFromDiagnostics,
  runTsc,
  DANGEROUS_TS_CODES,
} from "./lib/typecheckGate.js";

const { diagnostics } = runTsc();
const dangerous = diagnostics.filter((d) => DANGEROUS_TS_CODES.has(d.code));

if (dangerous.length > 0) {
  console.error(
    `Refusing to generate allowlist: ${dangerous.length} dangerous diagnostic(s) remain.`,
  );
  for (const d of dangerous.slice(0, 20)) {
    console.error(`  ${d.file}:${d.line} ${d.code} — ${d.message}`);
  }
  if (dangerous.length > 20) {
    console.error(`  … and ${dangerous.length - 20} more`);
  }
  process.exit(1);
}

const allowlist = buildAllowlistFromDiagnostics(diagnostics);
fs.writeFileSync(
  TYPECHECK_ALLOWLIST_PATH,
  `${JSON.stringify(allowlist, null, 2)}\n`,
);
console.log(`Wrote ${allowlist.length} entries to ${TYPECHECK_ALLOWLIST_PATH}`);
