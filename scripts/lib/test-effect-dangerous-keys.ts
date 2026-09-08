/**
 * Dangerous-op-key gate for effect literals in test sources.
 *
 * Flags keys the engine silently ignores — tests that use them cannot fail on
 * the intended filter/condition behaviour. Curated list only; every entry must
 * point at a handler that does not read the key.
 *
 * Scans all TypeScript files under tests/ (not only test/spec suffixes).
 * Skips object literals whose `op` is not a string literal, and any literal
 * containing a spread (cannot infer merged keys).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Project,
  Node,
  SyntaxKind,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";

const __filename = fileURLToPath(import.meta.url);
const LIB_ROOT = path.resolve(path.dirname(__filename), "..", "..");

export const TEST_EFFECT_DANGEROUS_KEYS_EXCLUSIONS = [
  "tests/unit/test-effect-dangerous-keys.test.ts",
];

export type DangerousKeyViolation = {
  file: string;
  line: number;
  op: string;
  key: string;
  message: string;
};

/** Ops whose `filter` / `filters` nested object routes to CARD_FILTER_KEYS. */
const CARD_FILTER_OPS = new Set(["search", "draw"]);

/** Bare stat keys ignored by normalizeCardFilter (normalize.ts). */
const BARE_CARD_FILTER_STAT_KEYS = new Set(["cost", "attack", "defense"]);

const HANDLER_REF = {
  returnHandFilter:
    'handleReturnToHand (src/logic/effects/ops/bounce.ts:135,144) reads eff.condition and eff.filters?.type, not eff.filter — use "condition" instead',
  returnHandUnknownDestinationFilter:
    "handleReturnToHand reads eff.condition and eff.filters?.type, not eff.filter (when destination is absent or not a string literal, flag conservatively)",
  returnDeckInertKey:
    "handleReturnHandToDeck (src/logic/effects/ops/returnHandToDeck.ts:95-201) never calls getPool and reads none of filter or condition — delete the key",
  returnDeckTargetKey:
    "handleReturnHandToDeck ignores target for selection, but handleReturn (src/logic/effects/ops/return/unified.ts:37-40) requires target — delete filter/condition instead; this violation clears once they are removed",
  keywordFilter:
    "keyword routing (src/logic/core/effects/domains/buffs.ts:92) reads eff.filters, not eff.filter",
  cardFilterBareStat:
    "normalizeCardFilter (src/logic/core/cardFilter/normalize.ts:34-46) only reads *_eq / *_lte / *_gte stat keys",
} as const;

export type ScanOptions = {
  rootDir?: string;
  testRoots?: string[];
  testGlob?: string;
  excludedRelPaths?: string[];
};

export const DEFAULT_SCAN_OPTIONS: Required<ScanOptions> = {
  rootDir: LIB_ROOT,
  testRoots: ["tests"],
  testGlob: "tests/**/*.ts",
  excludedRelPaths: TEST_EFFECT_DANGEROUS_KEYS_EXCLUSIONS,
};

function globMatches(rel: string, glob: string): boolean {
  const pattern = glob
    .replace(/\*\*/g, "<<<globstar>>>")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/<<<globstar>>>/g, ".*");
  return new RegExp(`^${pattern}$`).test(rel);
}

export function listTestSourceFiles(options: ScanOptions = {}): string[] {
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options };
  const excluded = new Set(opts.excludedRelPaths);
  const files: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const rel = path.relative(opts.rootDir, full).replace(/\\/g, "/");
      if (excluded.has(rel)) continue;
      if (globMatches(rel, opts.testGlob)) {
        files.push(full);
      }
    }
  }

  for (const relRoot of opts.testRoots) {
    walk(path.join(opts.rootDir, relRoot));
  }

  return files.sort();
}

function hasSpread(obj: ObjectLiteralExpression): boolean {
  return obj.getProperties().some((p) => Node.isSpreadAssignment(p));
}

function unwrapTypeAssertion(node: Node): Node {
  if (Node.isAsExpression(node)) {
    return unwrapTypeAssertion(node.getExpression());
  }
  return node;
}

function getOpStringLiteral(obj: ObjectLiteralExpression): string | null {
  const opProp = obj.getProperty("op");
  if (!opProp || !Node.isPropertyAssignment(opProp)) return null;
  const init = opProp.getInitializer();
  if (!init) return null;
  const unwrapped = unwrapTypeAssertion(init);
  if (!Node.isStringLiteral(unwrapped)) return null;
  return unwrapped.getLiteralValue();
}

function getStringLiteralProperty(
  obj: ObjectLiteralExpression,
  name: string,
): string | null {
  const prop = obj.getProperty(name);
  if (!prop || !Node.isPropertyAssignment(prop)) return null;
  const init = prop.getInitializer();
  if (!init) return null;
  const unwrapped = unwrapTypeAssertion(init);
  if (!Node.isStringLiteral(unwrapped)) return null;
  return unwrapped.getLiteralValue();
}

function checkReturnOpKeys(
  obj: ObjectLiteralExpression,
  relFile: string,
): DangerousKeyViolation[] {
  const violations: DangerousKeyViolation[] = [];
  const destination = getStringLiteralProperty(obj, "destination");

  if (destination === "hand") {
    if (hasProperty(obj, "filter")) {
      violations.push({
        file: relFile,
        line: obj.getStartLineNumber(),
        op: "return",
        key: "filter",
        message: `"filter" on op "return" with destination:"hand" is silently ignored — ${HANDLER_REF.returnHandFilter}`,
      });
    }
    return violations;
  }

  if (destination === "deck") {
    const hasFilter = hasProperty(obj, "filter");
    const hasCondition = hasProperty(obj, "condition");

    for (const [key, present] of [
      ["filter", hasFilter],
      ["condition", hasCondition],
    ] as const) {
      if (!present) continue;
      const prop = obj.getProperty(key);
      violations.push({
        file: relFile,
        line:
          prop && Node.isPropertyAssignment(prop)
            ? prop.getStartLineNumber()
            : obj.getStartLineNumber(),
        op: "return",
        key,
        message: `"${key}" on op "return" with destination:"deck" is silently ignored — ${HANDLER_REF.returnDeckInertKey}`,
      });
    }

    // target is required by return/unified.ts validation but ignored by
    // handleReturnHandToDeck — flag only alongside filter/condition (name-selection fiction).
    if (hasProperty(obj, "target") && (hasFilter || hasCondition)) {
      const prop = obj.getProperty("target");
      violations.push({
        file: relFile,
        line:
          prop && Node.isPropertyAssignment(prop)
            ? prop.getStartLineNumber()
            : obj.getStartLineNumber(),
        op: "return",
        key: "target",
        message: `"target" on op "return" with destination:"deck" is silently ignored for selection — ${HANDLER_REF.returnDeckTargetKey}`,
      });
    }

    return violations;
  }

  if (hasProperty(obj, "filter")) {
    violations.push({
      file: relFile,
      line: obj.getStartLineNumber(),
      op: "return",
      key: "filter",
      message: `"filter" on op "return" is silently ignored — ${HANDLER_REF.returnHandUnknownDestinationFilter}`,
    });
  }

  return violations;
}

function hasProperty(obj: ObjectLiteralExpression, name: string): boolean {
  return obj.getProperty(name) != null;
}

function getNestedObjectLiteral(
  obj: ObjectLiteralExpression,
  field: string,
): ObjectLiteralExpression | null {
  const prop = obj.getProperty(field);
  if (!prop || !Node.isPropertyAssignment(prop)) return null;
  const init = prop.getInitializer();
  if (!init || !Node.isObjectLiteralExpression(init)) return null;
  if (hasSpread(init)) return null;
  return init;
}

function checkBareStatKeysInCardFilter(
  filterObj: ObjectLiteralExpression,
  op: string,
  relFile: string,
  filterField: "filter" | "filters",
): DangerousKeyViolation[] {
  const violations: DangerousKeyViolation[] = [];
  for (const prop of filterObj.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) continue;
    const keyName = prop.getName();
    if (!BARE_CARD_FILTER_STAT_KEYS.has(keyName)) continue;
    violations.push({
      file: relFile,
      line: prop.getStartLineNumber(),
      op,
      key: `${filterField}.${keyName}`,
      message:
        `bare "${keyName}" inside ${filterField} on op "${op}" is silently ignored — ` +
        HANDLER_REF.cardFilterBareStat,
    });
  }
  return violations;
}

function checkEffectLiteral(
  obj: ObjectLiteralExpression,
  relFile: string,
): DangerousKeyViolation[] {
  if (hasSpread(obj)) return [];

  const op = getOpStringLiteral(obj);
  if (op == null) return [];

  const violations: DangerousKeyViolation[] = [];

  if (op === "return") {
    violations.push(...checkReturnOpKeys(obj, relFile));
  }

  if (op === "keyword" && hasProperty(obj, "filter")) {
    violations.push({
      file: relFile,
      line: obj.getStartLineNumber(),
      op,
      key: "filter",
      message: `"filter" on op "keyword" is silently ignored — ${HANDLER_REF.keywordFilter}`,
    });
  }

  if (CARD_FILTER_OPS.has(op)) {
    for (const field of ["filter", "filters"] as const) {
      const nested = getNestedObjectLiteral(obj, field);
      if (nested) {
        violations.push(
          ...checkBareStatKeysInCardFilter(nested, op, relFile, field),
        );
      }
    }
  }

  return violations;
}

function scanSourceFile(
  sourceFile: SourceFile,
  relFile: string,
): DangerousKeyViolation[] {
  const violations: DangerousKeyViolation[] = [];
  for (const obj of sourceFile.getDescendantsOfKind(
    SyntaxKind.ObjectLiteralExpression,
  )) {
    violations.push(...checkEffectLiteral(obj, relFile));
  }
  return violations;
}

export function scanEffectLiteralFiles(
  filePaths: string[],
  rootDir: string = LIB_ROOT,
): DangerousKeyViolation[] {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      target: 99,
    },
  });

  const violations: DangerousKeyViolation[] = [];
  for (const filePath of filePaths) {
    const relFile = path.relative(rootDir, filePath).replace(/\\/g, "/");
    const sourceFile = project.addSourceFileAtPath(filePath);
    violations.push(...scanSourceFile(sourceFile, relFile));
  }

  return violations.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );
}

export function scanTestEffectDangerousKeys(
  options: ScanOptions = {},
): DangerousKeyViolation[] {
  const opts = { ...DEFAULT_SCAN_OPTIONS, ...options };
  return scanEffectLiteralFiles(listTestSourceFiles(opts), opts.rootDir);
}

export function runTestEffectDangerousKeysGate(options: ScanOptions = {}): {
  exitCode: number;
  violations: DangerousKeyViolation[];
  errors: string[];
} {
  const violations = scanTestEffectDangerousKeys(options);
  const errors = violations.map(
    (v) => `${v.file}:${v.line} op=${v.op} key=${v.key} — ${v.message}`,
  );
  return {
    exitCode: violations.length > 0 ? 1 : 0,
    violations,
    errors,
  };
}
