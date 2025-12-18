#!/usr/bin/env tsx
/**
 * scripts/check-buffs.ts
 * Enforces architectural invariants for the Buff module refactor.
 */

import * as path from "path";
import { scanPatterns } from "./_importGraph.js";

const BUFF_ROOT = path.join(process.cwd(), "src/logic/effects/ops/buff");

// Define rules
// Each rule has a file and a list of denied import patterns
const RULES = [
    {
        file: "core.ts",
        msg: "core.ts must NOT import orchestrator or facade (leaf node)",
        deny: [
            /orchestrator/,
            /ops\/buff\.ts/,
            /\.\.\/buff\.js/
        ]
    },
    {
        file: "duration.ts",
        msg: "duration.ts must NOT import orchestrator",
        deny: [
            /orchestrator/,
        ]
    },
];

function checkFile(rule: typeof RULES[0]): boolean {
    const fullPath = path.join(BUFF_ROOT, rule.file);
    const matches = scanPatterns(fullPath, rule.deny, BUFF_ROOT);

    if (matches.length > 0) {
        console.error(`❌ Rule Violation in ${rule.file}: ${rule.msg}`);
        for (const m of matches) {
            console.error(`   Line ${m.line}: ${m.snippet}`);
        }
        return false;
    }
    return true;
}

console.log("🔍 Checking Buff Module Architecture...\n");
let failure = false;

for (const rule of RULES) {
    if (!checkFile(rule)) {
        failure = true;
    }
}

if (failure) {
    console.log("\n⛔ Buff Architecture Violations Found.");
    process.exit(1);
} else {
    console.log("✅ Buff Module Constraints Passed.");
    process.exit(0);
}
