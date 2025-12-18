#!/usr/bin/env tsx
/**
 * scripts/check-pendingtarget.ts
 * Enforces that only approved modules may write to pendingTargetEffect.
 * Ops must use the setPendingTarget helper instead of direct assignment.
 */

import * as path from "path";
import {
    listFiles,
    relativePath,
    scanAssignments,
    scanDeletes,
    formatViolations,
    ScanResult
} from "./_importGraph.js";

const SRC_ROOT = path.join(process.cwd(), "src");

// Allowlist: files that may WRITE to pendingTargetEffect
// POLICY: Only core lifecycle modules may write. Ops must use setPendingTarget().
const ALLOWED_WRITERS = new Set([
    "logic/core/pendingTarget/pendingTarget.ts",
    "logic/core/targeting.ts",
    "logic/core/resolveTarget.ts",
    "core/gameState.ts",
    "core/types.ts",
]);

function checkPendingTargetWrites(): boolean {
    const files = listFiles(SRC_ROOT);
    const violations: ScanResult[] = [];

    for (const file of files) {
        const relPath = relativePath(file, SRC_ROOT);
        if (ALLOWED_WRITERS.has(relPath)) continue;

        const assignments = scanAssignments(file, "pendingTargetEffect", SRC_ROOT);
        const deletes = scanDeletes(file, "pendingTargetEffect", SRC_ROOT);
        const allMatches = [...assignments, ...deletes];

        if (allMatches.length > 0) {
            violations.push({ file: relPath, matches: allMatches });
        }
    }

    if (violations.length > 0) {
        const lines = formatViolations(violations, "Unauthorized pendingTargetEffect write");
        lines.forEach(l => console.error(l));
        return false;
    }

    console.log("✓ pendingTargetEffect write access is properly restricted.");
    return true;
}

console.log("🔍 Checking pendingTargetEffect Write Policy...");

if (checkPendingTargetWrites()) {
    console.log("✅ Architecture is clean.");
    process.exit(0);
} else {
    console.error("⛔ Architectural violations found.");
    process.exit(1);
}
