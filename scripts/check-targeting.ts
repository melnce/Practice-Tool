#!/usr/bin/env tsx
/**
 * scripts/check-targeting.ts
 * Enforces architectural invariants for the Targeting module refactor.
 */

import * as path from "path";
import { scanPatterns } from "./_importGraph.js";

const TARGETING_ROOT = path.join(process.cwd(), "src/logic/core/targeting");

// Define rules
// Patterns match IMPORT LINES ONLY (from "..." or from '...')
const RULES = [
    {
        file: "parser.ts",
        msg: "Parser must be pure (no imports from context/filters)",
        deny: [
            /from\s+["']\.\/context/,
            /from\s+["']\.\/filters/,
            /from\s+["']\.\/engine/,
        ]
    },
    {
        file: "context.ts",
        msg: "Context Resolver must be pure (no imports from parser/filters)",
        deny: [
            /from\s+["']\.\/parser/,
            /from\s+["']\.\/filters/,
            /from\s+["']\.\/engine/,
        ]
    },
    {
        file: "filters.ts",
        msg: "Filters must be pure (no imports from parser/context)",
        deny: [
            /from\s+["']\.\/parser/,
            /from\s+["']\.\/context/,
            /from\s+["']\.\/engine/,
        ]
    },
    {
        file: "types.ts",
        msg: "Types should only import from core",
        deny: [
            /from\s+["']\.\/parser/,
            /from\s+["']\.\/context/,
            /from\s+["']\.\/filters/,
        ]
    }
];

function checkFile(rule: typeof RULES[0]): boolean {
    const fullPath = path.join(TARGETING_ROOT, rule.file);
    const matches = scanPatterns(fullPath, rule.deny, TARGETING_ROOT);

    if (matches.length > 0) {
        console.error(`❌ Violation in ${rule.file}: ${rule.msg}`);
        for (const m of matches) {
            console.error(`   Line ${m.line}: ${m.snippet}`);
        }
        return false;
    }
    return true;
}

console.log("🔍 Checking Targeting Module Architecture...");
let allPassed = true;

for (const rule of RULES) {
    if (!checkFile(rule)) {
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
