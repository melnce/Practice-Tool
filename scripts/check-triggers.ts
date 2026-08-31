#!/usr/bin/env tsx
/**
 * scripts/check-triggers.ts
 * Enforces architectural invariants for the Triggers module.
 */

import * as fs from "fs";
import * as path from "path";

const BASE = "src/logic/core/triggers";
const POOL_PATH = path.resolve("cards/all.json");

// Define rules
const RULES = [
  {
    file: "tracking.ts",
    deny: [/\/handlers\//],
    msg: "tracking.ts must not import from handlers",
  },
  {
    file: "process.ts",
    deny: [/\/handlers\//],
    msg: "process.ts must not import from handlers (use predicates)",
  },
];

// For handlers, we want to ensure they don't import EACH OTHER (siblings).
// They can import common stuff, but cross-handler dependencies are smelly.
const HANDLERS_DIR = path.join(BASE, "handlers");

function checkFile(
  filePath: string,
  denyPatterns: RegExp[],
  contextMsg: string,
): string[] {
  const errors: string[] = [];
  if (!fs.existsSync(filePath)) return errors;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    if (line.trim().startsWith("//")) return;
    if (!line.includes("from")) return;

    for (const pattern of denyPatterns) {
      if (pattern.test(line)) {
        errors.push(
          `${path.basename(filePath)}:${idx + 1} - ${contextMsg}\n   Code: ${line.trim()}`,
        );
      }
    }
  });

  return errors;
}

function collectCrestTriggerEvents(): Set<string> {
  const events = new Set<string>();
  if (!fs.existsSync(POOL_PATH)) return events;

  const data = JSON.parse(fs.readFileSync(POOL_PATH, "utf8")) as unknown[];

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const rec = obj as Record<string, unknown>;
    if (
      rec.op === "crest" &&
      rec.action === "gain" &&
      Array.isArray(rec.triggers)
    ) {
      for (const t of rec.triggers as Record<string, unknown>[]) {
        const ev = (t.event ?? t.type) as string | undefined;
        if (ev) events.add(ev);
      }
    }
    if (Array.isArray(obj)) obj.forEach(walk);
    else Object.values(rec).forEach(walk);
  }

  for (const card of data) walk(card);
  events.add("select_mode");
  events.add("invoke");
  return events;
}

function checkCrestTriggerEvents(): string[] {
  const errors: string[] = [];
  const typesPath = path.join(BASE, "types.ts");
  const content = fs.readFileSync(typesPath, "utf-8");
  const start = content.indexOf("export type TriggerEventName");
  if (start < 0) {
    errors.push("Could not find TriggerEventName in types.ts");
    return errors;
  }
  const end = content.indexOf("// =====", start + 1);
  const block = content.slice(start, end > start ? end : undefined);

  const known = new Set<string>();
  for (const m of block.matchAll(/\|\s*"([^"]+)"/g)) known.add(m[1]);

  /** type shorthands on crest triggers — not TriggerEventName literals */
  const CREST_TYPE_ALIASES = new Set(["end_of_turn_own", "start_of_turn_own"]);

  for (const ev of collectCrestTriggerEvents()) {
    if (CREST_TYPE_ALIASES.has(ev)) continue;
    if (!known.has(ev)) {
      errors.push(
        `Unknown crest trigger event "${ev}" in cards/all.json — add to TriggerEventName and crest owner-scoping tests`,
      );
    }
  }

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
      errors.forEach((e) => console.error(e));
    }
  }

  // 2. Check Handler Siblings
  if (fs.existsSync(HANDLERS_DIR)) {
    const handlers = fs
      .readdirSync(HANDLERS_DIR)
      .filter((f) => f.endsWith(".ts"));
    // Shared helpers in handlers/ (not event handlers themselves).
    const SHARED_HANDLER_MODULES = new Set(["common", "types", "utils"]);
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
        /from\s+['"]\.\.\/handlers\//, // Explicit full path
      ];

      // Actually, we can just ban importing any OTHER handler by name
      const otherHandlers = handlers
        .filter((x) => x !== h)
        .map((x) => x.replace(".ts", ""))
        .filter((name) => !SHARED_HANDLER_MODULES.has(name));
      const specificDeny = otherHandlers.map(
        (oh) => new RegExp(`from\\s+['"].*${oh}(\\.js)?['"]`),
      );

      const errors = checkFile(
        fullPath,
        specificDeny,
        "Handlers should not import each other",
      );
      if (errors.length > 0) {
        failure = true;
        console.error(`❌ Handler Isolation Violation in ${h}:`);
        errors.forEach((e) => console.error(e));
      }
    }
  }

  const crestEventErrors = checkCrestTriggerEvents();
  if (crestEventErrors.length > 0) {
    failure = true;
    console.error("❌ Unknown crest trigger events:");
    crestEventErrors.forEach((e) => console.error(`   ${e}`));
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
