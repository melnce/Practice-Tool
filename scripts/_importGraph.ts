#!/usr/bin/env tsx
/**
 * scripts/_importGraph.ts
 * Shared utilities for architecture check scripts.
 * Provides AST-based scanning for TS/TSX files with regex fallback.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

// ============================================================================
// Types
// ============================================================================

export interface Match {
    file: string;          // Relative path from scanRoot
    line: number;          // 1-indexed
    snippet: string;       // Trimmed line content
}

export interface ScanOptions {
    extensions?: string[]; // Default: [".ts"]
    excludeDirs?: string[]; // Default: ["node_modules", "dist"]
    excludeTests?: boolean; // Default: true
}

export interface ScanResult {
    file: string;
    matches: Match[];
}

// ============================================================================  
// Directory Scanning
// ============================================================================

/**
 * Scans a directory recursively, returning all matching file paths.
 */
export function listFiles(rootDir: string, opts: ScanOptions = {}): string[] {
    const extensions = opts.extensions ?? [".ts"];
    const excludeDirs = opts.excludeDirs ?? ["node_modules", "dist"];
    const excludeTests = opts.excludeTests ?? true;

    const results: string[] = [];

    function walk(dir: string) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!excludeDirs.includes(entry.name)) {
                    walk(fullPath);
                }
            } else {
                const ext = path.extname(entry.name);
                if (!extensions.includes(ext)) continue;
                if (excludeTests && entry.name.endsWith(".test.ts")) continue;
                results.push(fullPath);
            }
        }
    }

    walk(rootDir);
    return results;
}

/**
 * Normalizes path separators to forward slashes for consistent comparison.
 */
export function normalizePath(p: string): string {
    return p.replace(/\\/g, "/");
}

/**
 * Gets relative path from root with normalized separators.
 */
export function relativePath(fullPath: string, rootDir: string): string {
    return normalizePath(path.relative(rootDir, fullPath));
}

// ============================================================================
// AST Helpers
// ============================================================================

function parseFile(filePath: string): { sourceFile: ts.SourceFile; content: string } | null {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    return { sourceFile, content };
}

function getLineNumber(sourceFile: ts.SourceFile, pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function getLineSnippet(content: string, lineNumber: number): string {
    const lines = content.split("\n");
    return (lines[lineNumber - 1] || "").trim();
}

// ============================================================================
// AST-Based Scanners (Preferred for .ts/.tsx)
// ============================================================================

/**
 * AST-based import scanner. Returns all import/export specifiers.
 */
export function scanImportsAst(
    filePath: string,
    relativeTo?: string
): Match[] {
    const parsed = parseFile(filePath);
    if (!parsed) return [];

    const { sourceFile, content } = parsed;
    const matches: Match[] = [];
    const relPath = relativeTo ? relativePath(filePath, relativeTo) : filePath;

    function visit(node: ts.Node) {
        // import ... from "..."
        if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
            const line = getLineNumber(sourceFile, node.getStart());
            matches.push({
                file: relPath,
                line,
                snippet: getLineSnippet(content, line),
            });
        }
        // export ... from "..."
        if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            const line = getLineNumber(sourceFile, node.getStart());
            matches.push({
                file: relPath,
                line,
                snippet: getLineSnippet(content, line),
            });
        }
        // require("...")
        if (ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "require") {
            const line = getLineNumber(sourceFile, node.getStart());
            matches.push({
                file: relPath,
                line,
                snippet: getLineSnippet(content, line),
            });
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return matches;
}

/**
 * AST-based property assignment scanner.
 * Detects: obj.propertyName = ..., obj["propertyName"] = ...
 */
export function scanAssignmentsAst(
    filePath: string,
    propertyName: string,
    relativeTo?: string
): Match[] {
    const parsed = parseFile(filePath);
    if (!parsed) return [];

    const { sourceFile, content } = parsed;
    const matches: Match[] = [];
    const relPath = relativeTo ? relativePath(filePath, relativeTo) : filePath;

    function visit(node: ts.Node) {
        // BinaryExpression with = operator
        if (ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            const left = node.left;

            // obj.propertyName = ...
            if (ts.isPropertyAccessExpression(left) &&
                left.name.text === propertyName) {
                const line = getLineNumber(sourceFile, node.getStart());
                matches.push({
                    file: relPath,
                    line,
                    snippet: getLineSnippet(content, line),
                });
            }
            // obj["propertyName"] = ...
            if (ts.isElementAccessExpression(left) &&
                ts.isStringLiteral(left.argumentExpression) &&
                left.argumentExpression.text === propertyName) {
                const line = getLineNumber(sourceFile, node.getStart());
                matches.push({
                    file: relPath,
                    line,
                    snippet: getLineSnippet(content, line),
                });
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return matches;
}

/**
 * AST-based identifier usage scanner.
 * Detects any usage of the identifier (import, call, reference).
 */
export function scanIdentifierUsagesAst(
    filePath: string,
    identifier: string,
    relativeTo?: string
): Match[] {
    const parsed = parseFile(filePath);
    if (!parsed) return [];

    const { sourceFile, content } = parsed;
    const matches: Match[] = [];
    const relPath = relativeTo ? relativePath(filePath, relativeTo) : filePath;
    const seenLines = new Set<number>();

    function visit(node: ts.Node) {
        if (ts.isIdentifier(node) && node.text === identifier) {
            const line = getLineNumber(sourceFile, node.getStart());
            if (!seenLines.has(line)) {
                seenLines.add(line);
                matches.push({
                    file: relPath,
                    line,
                    snippet: getLineSnippet(content, line),
                });
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return matches;
}

/**
 * AST-based function call scanner.
 * Detects: fnName(...) or obj.fnName(...)
 */
export function scanCallUsagesAst(
    filePath: string,
    fnName: string,
    relativeTo?: string
): Match[] {
    const parsed = parseFile(filePath);
    if (!parsed) return [];

    const { sourceFile, content } = parsed;
    const matches: Match[] = [];
    const relPath = relativeTo ? relativePath(filePath, relativeTo) : filePath;

    function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
            const expr = node.expression;
            // Direct call: fnName()
            if (ts.isIdentifier(expr) && expr.text === fnName) {
                const line = getLineNumber(sourceFile, node.getStart());
                matches.push({
                    file: relPath,
                    line,
                    snippet: getLineSnippet(content, line),
                });
            }
            // Method call: obj.fnName()
            if (ts.isPropertyAccessExpression(expr) && expr.name.text === fnName) {
                const line = getLineNumber(sourceFile, node.getStart());
                matches.push({
                    file: relPath,
                    line,
                    snippet: getLineSnippet(content, line),
                });
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return matches;
}

/**
 * AST-based delete statement scanner.
 * Detects: delete obj.propertyName, delete obj["propertyName"]
 */
export function scanDeleteAst(
    filePath: string,
    propertyName: string,
    relativeTo?: string
): Match[] {
    const parsed = parseFile(filePath);
    if (!parsed) return [];

    const { sourceFile, content } = parsed;
    const matches: Match[] = [];
    const relPath = relativeTo ? relativePath(filePath, relativeTo) : filePath;

    function visit(node: ts.Node) {
        // delete expression
        if (ts.isDeleteExpression(node)) {
            const expr = node.expression;
            // delete obj.propertyName
            if (ts.isPropertyAccessExpression(expr) && expr.name.text === propertyName) {
                const line = getLineNumber(sourceFile, node.getStart());
                matches.push({
                    file: relPath,
                    line,
                    snippet: getLineSnippet(content, line),
                });
            }
            // delete obj["propertyName"]
            if (ts.isElementAccessExpression(expr) &&
                ts.isStringLiteral(expr.argumentExpression) &&
                expr.argumentExpression.text === propertyName) {
                const line = getLineNumber(sourceFile, node.getStart());
                matches.push({
                    file: relPath,
                    line,
                    snippet: getLineSnippet(content, line),
                });
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return matches;
}

// ============================================================================
// Regex-Based Scanners (Fallback)
// ============================================================================

/**
 * Scans a file for lines matching any of the provided patterns.
 * Returns matches with file, line number, and snippet.
 */
export function scanPatterns(
    filePath: string,
    patterns: RegExp[],
    relativeTo?: string
): Match[] {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const matches: Match[] = [];
    const relPath = relativeTo ? relativePath(filePath, relativeTo) : filePath;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip pure comments
        if (line.trim().startsWith("//")) continue;

        for (const pattern of patterns) {
            if (pattern.test(line)) {
                matches.push({
                    file: relPath,
                    line: i + 1,
                    snippet: line.trim(),
                });
                break; // Only report each line once
            }
        }
    }

    return matches;
}

// ============================================================================
// Unified Scanners (AST preferred, regex fallback)
// ============================================================================

function isTypeScriptFile(filePath: string): boolean {
    return filePath.endsWith(".ts") || filePath.endsWith(".tsx");
}

/**
 * Scans for property assignments. Uses AST for TS/TSX, regex fallback otherwise.
 */
export function scanAssignments(
    filePath: string,
    propertyName: string,
    relativeTo?: string
): Match[] {
    if (isTypeScriptFile(filePath)) {
        try {
            return scanAssignmentsAst(filePath, propertyName, relativeTo);
        } catch {
            // Fallback to regex on parse error
        }
    }
    const pattern = new RegExp(`(?:\\.)?${propertyName}\\s*=(?!=)`, "g");
    return scanPatterns(filePath, [pattern], relativeTo);
}

/**
 * Scans for identifier usages. Uses AST for TS/TSX, regex fallback otherwise.
 */
export function scanUsages(
    filePath: string,
    identifier: string,
    relativeTo?: string
): Match[] {
    if (isTypeScriptFile(filePath)) {
        try {
            return scanIdentifierUsagesAst(filePath, identifier, relativeTo);
        } catch {
            // Fallback to regex on parse error
        }
    }
    const pattern = new RegExp(`\\b${identifier}\\b`);
    return scanPatterns(filePath, [pattern], relativeTo);
}

/**
 * Scans for delete statements. Uses AST for TS/TSX, regex fallback otherwise.
 */
export function scanDeletes(
    filePath: string,
    propertyName: string,
    relativeTo?: string
): Match[] {
    if (isTypeScriptFile(filePath)) {
        try {
            return scanDeleteAst(filePath, propertyName, relativeTo);
        } catch {
            // Fallback to regex on parse error
        }
    }
    const pattern = new RegExp(`delete\\s+(?:\\w+\\.)?${propertyName}\\b`);
    return scanPatterns(filePath, [pattern], relativeTo);
}

/**
 * Scans for function calls. Uses AST for TS/TSX, regex fallback otherwise.
 */
export function scanCalls(
    filePath: string,
    fnName: string,
    relativeTo?: string
): Match[] {
    if (isTypeScriptFile(filePath)) {
        try {
            return scanCallUsagesAst(filePath, fnName, relativeTo);
        } catch {
            // Fallback to regex on parse error
        }
    }
    const pattern = new RegExp(`\\b${fnName}\\s*\\(`);
    return scanPatterns(filePath, [pattern], relativeTo);
}

// ============================================================================
// Batch Scanning
// ============================================================================

/**
 * Scans all files in a directory for patterns.
 */
export function scanDirectory(
    rootDir: string,
    patterns: RegExp[],
    opts: ScanOptions = {}
): ScanResult[] {
    const files = listFiles(rootDir, opts);
    const results: ScanResult[] = [];

    for (const file of files) {
        const matches = scanPatterns(file, patterns, rootDir);
        if (matches.length > 0) {
            results.push({ file: relativePath(file, rootDir), matches });
        }
    }

    return results;
}

/**
 * Checks files against allowlist, returning violations.
 */
export function checkAllowlist(
    rootDir: string,
    patterns: RegExp[],
    allowlist: Set<string>,
    opts: ScanOptions = {}
): ScanResult[] {
    const files = listFiles(rootDir, opts);
    const violations: ScanResult[] = [];

    for (const file of files) {
        const relPath = relativePath(file, rootDir);
        if (allowlist.has(relPath)) continue;

        const matches = scanPatterns(file, patterns, rootDir);
        if (matches.length > 0) {
            violations.push({ file: relPath, matches });
        }
    }

    return violations;
}

// ============================================================================
// Reporting
// ============================================================================

/**
 * Formats violations for console output.
 */
export function formatViolations(violations: ScanResult[], ruleName: string): string[] {
    const lines: string[] = [];
    for (const v of violations) {
        lines.push(`❌ ${ruleName}: ${v.file}`);
        for (const m of v.matches) {
            lines.push(`   Line ${m.line}: ${m.snippet}`);
        }
    }
    return lines;
}
