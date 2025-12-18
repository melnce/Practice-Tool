#!/usr/bin/env tsx
/**
 * scripts/check-boundaries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces "core cannot import UI/DOM" architectural boundary.
 * Scans core source files and fails if forbidden imports are detected.
 * 
 * Core directories (must NOT import from UI):
 *   - src/logic/core/**
 *   - src/core/**
 *   - src/data/**
 * 
 * Forbidden import paths:
 *   - /ui/ (UI rendering layer)
 *   - /logic/browser/ (browser-only modules)
 *   - /startGame (browser-only game initialization)
 *   - /mulligan (browser-only mulligan phase)
 * 
 * Run: npx tsx scripts/check-boundaries.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CORE_DIRECTORIES = [
    "src/logic/core",
    "src/core",
    "src/data",
];

const FORBIDDEN_IMPORT_PATTERNS = [
    /from\s+["'][^"']*\/ui\//,              // imports from /ui/
    /from\s+["'][^"']*\/logic\/browser\//,   // imports from /logic/browser/
    /from\s+["'][^"']*\/startGame[."']/,     // imports startGame.ts (browser-only)
    /from\s+["'][^"']*\/mulligan[."']/,      // imports mulligan.ts (browser-only)
];

const FORBIDDEN_IMPORT_DESCRIPTIONS = [
    "UI layer (/ui/)",
    "Browser-only modules (/logic/browser/)",
    "Browser-only startGame module",
    "Browser-only mulligan module",
];

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function getAllTsFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...getAllTsFiles(fullPath));
        } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
            files.push(fullPath);
        }
    }

    return files;
}

interface Violation {
    file: string;
    line: number;
    content: string;
    pattern: string;
}

function checkFile(filePath: string): Violation[] {
    const violations: Violation[] = [];
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        // Skip commented lines
        if (line.trim().startsWith("//")) continue;

        for (let p = 0; p < FORBIDDEN_IMPORT_PATTERNS.length; p++) {
            const pattern = FORBIDDEN_IMPORT_PATTERNS[p];
            if (pattern && pattern.test(line)) {
                violations.push({
                    file: filePath,
                    line: i + 1,
                    content: line.trim(),
                    pattern: FORBIDDEN_IMPORT_DESCRIPTIONS[p] || "unknown",
                });
            }
        }
    }

    return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
    console.log("🔍 Checking architectural boundaries...\n");
    console.log("Core directories (must NOT import from UI):");
    CORE_DIRECTORIES.forEach(d => console.log(`  - ${d}`));
    console.log("\nForbidden import paths:");
    FORBIDDEN_IMPORT_DESCRIPTIONS.forEach(d => console.log(`  - ${d}`));
    console.log("");

    const allFiles: string[] = [];
    for (const dir of CORE_DIRECTORIES) {
        allFiles.push(...getAllTsFiles(dir));
    }

    console.log(`Scanning ${allFiles.length} files...\n`);

    const allViolations: Violation[] = [];

    for (const file of allFiles) {
        const violations = checkFile(file);
        allViolations.push(...violations);
    }

    if (allViolations.length === 0) {
        console.log("✅ No boundary violations found!");
        console.log("\n   Core modules do NOT import from UI. Architecture is clean.\n");
        process.exit(0);
    } else {
        console.log(`❌ Found ${allViolations.length} boundary violation(s):\n`);

        for (const v of allViolations) {
            console.log(`  ${v.file}:${v.line}`);
            console.log(`    Forbidden: ${v.pattern}`);
            console.log(`    Line: ${v.content}`);
            console.log("");
        }

        console.log("⛔ Core modules MUST NOT import from UI.");
        console.log("   Fix the imports above before committing.\n");
        process.exit(1);
    }
}

main();
