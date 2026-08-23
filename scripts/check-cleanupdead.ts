#!/usr/bin/env tsx
/**
 * scripts/check-cleanupdead.ts
 * Enforces that only approved orchestrator modules may call cleanupDead.
 */

import * as path from "path";
import {
  listFiles,
  relativePath,
  scanUsages,
  formatViolations,
  ScanResult,
} from "./_importGraph.js";

const SRC_ROOT = path.join(process.cwd(), "src/logic");

// Allowlist: files that may import/call cleanupDead
// Paths are relative to src/logic/. Keep in sync with current module layout
// (damage/destroy/stat were split into unified/helpers/primitives packages).
const ALLOWED_FILES = new Set([
  "core/cleanup.ts",
  "core/cleanup/index.ts",
  "core/barrier.ts",
  "core/turns.ts",
  "core/turnBoundary.ts",
  "core/combat.ts",
  "core/effects/domains/combat.ts",
  "effects/ops/damage.ts",
  "effects/ops/damage/unified.ts",
  "effects/ops/damage/helpers.ts",
  "effects/ops/damage/primitives.ts",
  "effects/ops/destroy.ts",
  "effects/ops/destroy/unified.ts",
  "effects/ops/engage.ts",
  "core/resolveTarget.ts",
  "effects/ops/buff.ts",
  "effects/ops/buff/core.ts",
  "effects/ops/buff/orchestrator.ts",
  "effects/ops/stat/orchestrator.ts",
  "effects/doubleStats.ts",
]);

function checkCleanupDeadUsage(): boolean {
  const files = listFiles(SRC_ROOT);
  const violations: ScanResult[] = [];

  for (const file of files) {
    const relPath = relativePath(file, SRC_ROOT);
    if (ALLOWED_FILES.has(relPath)) continue;

    const usages = scanUsages(file, "cleanupDead", SRC_ROOT);
    if (usages.length > 0) {
      violations.push({ file: relPath, matches: usages });
    }
  }

  if (violations.length > 0) {
    const lines = formatViolations(
      violations,
      "Unauthorized cleanupDead usage",
    );
    lines.forEach((l) => console.error(l));
    return false;
  }

  console.log("✓ cleanupDead usage is properly restricted.");
  return true;
}

console.log("🔍 Checking cleanupDead Usage Policy...");

if (checkCleanupDeadUsage()) {
  console.log("✅ Architecture is clean.");
  process.exit(0);
} else {
  console.error("⛔ Architectural violations found.");
  process.exit(1);
}
