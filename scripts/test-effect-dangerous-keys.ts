#!/usr/bin/env tsx
/**
 * Dangerous-op-key gate for effect literals in test sources.
 *
 *   npm run check:test-effect-dangerous-keys
 */
import { runTestEffectDangerousKeysGate } from "./lib/test-effect-dangerous-keys.js";

function main(): void {
  const checkMode = process.argv.includes("--check");
  const gate = runTestEffectDangerousKeysGate();

  if (gate.violations.length === 0) {
    if (checkMode) {
      console.log(
        "\n✅ Test effect dangerous-keys gate passed (0 violations).",
      );
    }
    return;
  }

  console.error(
    `\n❌ ${gate.violations.length} test effect dangerous-key violation(s):`,
  );
  for (const err of gate.errors) console.error(`  - ${err}`);

  if (checkMode) {
    process.exit(1);
  }
}

main();
