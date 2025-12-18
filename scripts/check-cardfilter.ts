#!/usr/bin/env tsx
/**
 * scripts/check-cardfilter.ts
 * Enforces architectural invariants for the CardFilter module.
 * CardFilter must remain pure (no state/effects/UI imports).
 */

import * as path from "path";
import { scanPatterns, Match } from "./_importGraph.js";

const CARDFILTER_ROOT = path.join(process.cwd(), "src/logic/core/cardFilter");

// Patterns that indicate impure imports
const IMPURE_PATTERNS = [
    /from\s+["']\.\.\/\.\.\/effects\//,      // Any import from effects/
    /gameState/,                              // State access
    /cleanup/,                                // Cleanup modules
    /adapter/,                                // UI adapter
    /targeting/,                              // Targeting modules
    /pendingTargetEffect/,                    // Selection state
    /barrier/,                                // Damage application
    /leader/,                                 // Leader damage
    /dealDamage/,                             // Damage mutation
    /applyKeyword/,                           // Keyword mutation
];

const FILES_TO_CHECK = ["types.ts", "normalize.ts", "predicates.ts"];

function checkFile(filename: string): boolean {
    const fullPath = path.join(CARDFILTER_ROOT, filename);
    const matches = scanPatterns(fullPath, IMPURE_PATTERNS, CARDFILTER_ROOT);

    if (matches.length > 0) {
        console.error(`❌ Purity violation in ${filename}:`);
        for (const m of matches) {
            console.error(`   Line ${m.line}: ${m.snippet}`);
        }
        return false;
    }

    console.log(`✓ ${filename} is pure.`);
    return true;
}

console.log("🔍 Checking CardFilter Module Architecture...");
let allPassed = true;

for (const file of FILES_TO_CHECK) {
    if (!checkFile(file)) {
        allPassed = false;
    }
}

if (allPassed) {
    console.log("✅ Architecture is clean.");
    process.exit(0);
} else {
    console.error("⛔ Architectural violations found.");
    process.exit(1);
}
