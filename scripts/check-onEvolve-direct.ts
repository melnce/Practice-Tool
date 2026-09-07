#!/usr/bin/env tsx
/**
 * Gate: tests must not import onEvolve from evolveUtils — use tests/harness/whenEvolve.ts.
 *
 * Opt-out (line immediately above the import):
 *   // eslint-disable-next-line … onEvolve-direct: <reason>
 *
 * Run: npx tsx scripts/check-onEvolve-direct.ts
 */
import * as fs from "fs";
import * as path from "path";

const TESTS_ROOT = path.join(process.cwd(), "tests");
const IMPORT_RE =
  /import\s+(?:type\s+)?\{[^}]*\bonEvolve\b[^}]*\}\s+from\s+["'][^"']*evolveUtils(?:\.js)?["']/;

const OPT_OUT_RE = /onEvolve-direct:\s*.+/;

interface Violation {
  file: string;
  line: number;
  content: string;
}

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!IMPORT_RE.test(line)) continue;

    const prev = i > 0 ? lines[i - 1] : "";
    if (OPT_OUT_RE.test(prev)) continue;

    violations.push({
      file: path.relative(process.cwd(), filePath),
      line: i + 1,
      content: line.trim(),
    });
  }

  return violations;
}

function main(): void {
  const files = getAllTsFiles(TESTS_ROOT);
  const violations = files.flatMap(checkFile);

  if (violations.length === 0) {
    console.log(
      "check:onEvolve-direct — OK (no direct onEvolve imports in tests/)",
    );
    process.exit(0);
  }

  console.error(
    `check:onEvolve-direct — FAILED: ${violations.length} direct onEvolve import(s)\n`,
  );
  console.error(
    "Use whenEvolve / whenSuperEvolve / whenEffectEvolve from tests/harness/whenEvolve.ts\n",
  );
  console.error(
    "Opt-out: // eslint-disable-next-line … onEvolve-direct: <reason> on the line above the import\n",
  );

  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.content}\n`);
  }

  process.exit(1);
}

main();
