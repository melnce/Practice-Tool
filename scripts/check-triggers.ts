#!/usr/bin/env tsx
/**
 * scripts/check-triggers.ts
 * Enforces architectural invariants for the Triggers module.
 */

import * as fs from "fs";
import * as path from "path";

const BASE = "src/logic/core/triggers";

// Define rules
const RULES = [
    {
        file: "tracking.ts",
        deny: [/\/handlers\//],
        msg: "tracking.ts must not import from handlers"
    },
    {
        file: "process.ts",
        deny: [/\/handlers\//],
        msg: "process.ts must not import from handlers (use predicates)"
    }
];

// For handlers, we want to ensure they don't import EACH OTHER (siblings).
// They can import common stuff, but cross-handler dependencies are smelly.
const HANDLERS_DIR = path.join(BASE, "handlers");

function checkFile(filePath: string, denyPatterns: RegExp[], contextMsg: string): string[] {
    const errors: string[] = [];
    if (!fs.existsSync(filePath)) return errors;

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
        if (line.trim().startsWith("//")) return;
        if (!line.includes("from")) return;

        for (const pattern of denyPatterns) {
            if (pattern.test(line)) {
                errors.push(`${path.basename(filePath)}:${idx + 1} - ${contextMsg}\n   Code: ${line.trim()}`);
            }
        }
    });

    return errors;
}

function main() {
    console.log("🔍 Checking Trigger Module Invariants...\n");
    let failure = false;

    // 1. Check specific files
    for (const rule of RULES) {
        const fullPath = path.join(BASE, rule.file);
        const errors = checkFile(fullPath, rule.deny, rule.msg);
        if (errors.length > 0) {
            failure = true;
            console.error(`❌ Rule Violation in ${rule.file}:`);
            errors.forEach(e => console.error(e));
        }
    }

    // 2. Check Handler Siblings
    if (fs.existsSync(HANDLERS_DIR)) {
        const handlers = fs.readdirSync(HANDLERS_DIR).filter(f => f.endsWith(".ts"));
        for (const h of handlers) {
            const fullPath = path.join(HANDLERS_DIR, h);
            // Deny importing other handlers.
            // Pattern: from "./<other_handler>" or "../handlers/<other_handler>"
            // We'll simplisticly check for "./" followed by a different handler name
            // or explicit "../handlers/"

            // This regex is a bit rough, trying to catch sibling imports.
            // It matches `from "./something"` or `from "./something.js"`
            const deny = [
                /from\s+['"]\.\/(?!common|types|utils)([^/'"]+)['"]/, // Sibling imports usually look like "./foo.js"
                /from\s+['"]\.\.\/handlers\// // Explicit full path
            ];

            // Actually, we can just ban importing any OTHER handler by name
            const otherHandlers = handlers.filter(x => x !== h).map(x => x.replace(".ts", ""));
            const specificDeny = otherHandlers.map(oh => new RegExp(`from\\s+['"].*${oh}(\\.js)?['"]`));

            const errors = checkFile(fullPath, specificDeny, "Handlers should not import each other");
            if (errors.length > 0) {
                failure = true;
                console.error(`❌ Handler Isolation Violation in ${h}:`);
                errors.forEach(e => console.error(e));
            }
        }
    }

    if (failure) {
        console.log("\n⛔ Trigger Architecture Violations Found.");
        process.exit(1);
    } else {
        console.log("✅ Trigger Module Constraints Passed.");
        process.exit(0);
    }
}

main();
