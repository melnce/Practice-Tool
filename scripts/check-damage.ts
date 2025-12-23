#!/usr/bin/env tsx
/**
 * scripts/check-damage.ts
 * Enforces architectural invariants for the Damage module refactor.
 * Calculator must remain pure (no state/cleanup/UI imports).
 */

import * as path from "path";
import {
  listFiles,
  relativePath,
  scanPatterns,
  ScanResult,
} from "./_importGraph.js";

const DAMAGE_ROOT = path.join(process.cwd(), "src/logic/effects/ops/damage");
const OPS_ROOT = path.join(process.cwd(), "src/logic/effects/ops");

// Patterns that indicate impure imports (state mutation, cleanup, UI, targeting)
const IMPURE_PATTERNS = [
  /gameState/,
  /cleanup/,
  /adapter/,
  /targeting/,
  /pendingTargetEffect/,
  /highlightSelectable/,
  /barrier\.js/,
  /leader\.js/,
];

// Types isolation: types.ts should not import from internal modules
const TYPES_DENY_PATTERNS = [/calculator/, /damage\.ts/];

// Calculator import policy pattern
const CALC_IMPORT_PATTERN = /from\s+["'].*damage\/(calculator|index)\.js["']/;

function checkCalculatorPurity(): boolean {
  const calcPath = path.join(DAMAGE_ROOT, "calculator.ts");
  const matches = scanPatterns(calcPath, IMPURE_PATTERNS, DAMAGE_ROOT);

  if (matches.length > 0) {
    console.error("❌ Purity violation in calculator.ts:");
    for (const m of matches) {
      console.error(`   Line ${m.line}: ${m.snippet}`);
    }
    return false;
  }

  console.log("✓ calculator.ts is pure (no impure imports).");
  return true;
}

function checkTypesIsolation(): boolean {
  const typesPath = path.join(DAMAGE_ROOT, "types.ts");
  const matches = scanPatterns(typesPath, TYPES_DENY_PATTERNS, DAMAGE_ROOT);

  if (matches.length > 0) {
    console.error("❌ Types isolation violation in types.ts:");
    for (const m of matches) {
      console.error(`   Line ${m.line}: ${m.snippet}`);
    }
    return false;
  }

  console.log("✓ types.ts is isolated (no internal imports).");
  return true;
}

function checkCalculatorImportPolicy(): boolean {
  const allowedImporters = new Set([
    "damage.ts",
    "damage/index.ts",
    "targeted/index.ts",
  ]);

  const files = listFiles(OPS_ROOT);
  const violations: ScanResult[] = [];

  for (const file of files) {
    const relPath = relativePath(file, OPS_ROOT);
    if (allowedImporters.has(relPath)) continue;

    const matches = scanPatterns(file, [CALC_IMPORT_PATTERN], OPS_ROOT);
    if (matches.length > 0) {
      violations.push({ file: relPath, matches });
    }
  }

  if (violations.length > 0) {
    console.error("❌ Policy A violation (calculator import policy):");
    for (const v of violations) {
      console.error(`   ${v.file}`);
      for (const m of v.matches) {
        console.error(`      Line ${m.line}: ${m.snippet}`);
      }
    }
    return false;
  }

  console.log("✓ Calculator import policy (Policy A) respected.");
  return true;
}

console.log("🔍 Checking Damage Module Architecture...");
let allPassed = true;

if (!checkCalculatorPurity()) allPassed = false;
if (!checkTypesIsolation()) allPassed = false;
if (!checkCalculatorImportPolicy()) allPassed = false;

if (allPassed) {
  console.log("✅ Architecture is clean.");
  process.exit(0);
} else {
  console.error("⛔ Architectural violations found.");
  process.exit(1);
}
