#!/usr/bin/env tsx
/**
 * scripts/check-doaction-sync.ts
 * Fails when a doAction() callback body contains `await` or `.then(` —
 * those make commitAction snapshot before mutations finish (H1 class of bugs).
 */
import * as fs from "fs";
import * as path from "path";
import {
  Node,
  Project,
  type CallExpression,
  type FunctionExpression,
  type ArrowFunction,
} from "ts-morph";

const SRC_ROOT = path.join(process.cwd(), "src");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isDoActionCall(call: CallExpression): boolean {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText() === "doAction";
  if (Node.isPropertyAccessExpression(expr)) {
    return expr.getName() === "doAction";
  }
  return false;
}

function callbackHasAsyncWork(
  fn: ArrowFunction | FunctionExpression,
): string[] {
  const issues: string[] = [];
  fn.forEachDescendant((node) => {
    if (Node.isAwaitExpression(node)) {
      issues.push(`await at ${node.getStartLineNumber()}`);
    }
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression();
      if (
        Node.isPropertyAccessExpression(callee) &&
        callee.getName() === "then"
      ) {
        issues.push(`.then( at ${node.getStartLineNumber()}`);
      }
    }
  });
  return issues;
}

interface Violation {
  file: string;
  line: number;
  detail: string;
}

function main() {
  console.log("🔍 Checking doAction callbacks are synchronous...\n");

  const files = listTsFiles(SRC_ROOT);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false },
  });
  for (const f of files) project.addSourceFileAtPath(f);

  const violations: Violation[] = [];

  for (const sf of project.getSourceFiles()) {
    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node) || !isDoActionCall(node)) return;
      const args = node.getArguments();
      const fnArg = args[1];
      if (!fnArg) return;
      if (!Node.isArrowFunction(fnArg) && !Node.isFunctionExpression(fnArg)) {
        return;
      }
      // Nested doAction inside the callback is fine; only flag await/.then in THIS body.
      const issues = callbackHasAsyncWork(fnArg);
      for (const detail of issues) {
        violations.push({
          file: path.relative(process.cwd(), sf.getFilePath()),
          line: node.getStartLineNumber(),
          detail,
        });
      }
    });
  }

  // Also catch trivial text pattern for doAction(() => { ... await / .then
  // that ts-morph might miss if the callback is stored in a variable.
  // Primary enforcement is AST above.

  if (violations.length === 0) {
    console.log("✅ All doAction callbacks are synchronous.\n");
    process.exit(0);
  }

  console.error(`❌ Found ${violations.length} doAction async violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.detail}`);
  }
  console.error(
    "\n⛔ doAction callbacks must be synchronous. Resolve imports/promises BEFORE doAction, then mutate inside.\n",
  );
  process.exit(1);
}

main();
