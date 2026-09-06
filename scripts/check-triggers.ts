#!/usr/bin/env tsx
/**
 * scripts/check-triggers.ts
 * Enforces architectural invariants for the Triggers module.
 */

import * as fs from "fs";
import * as path from "path";
import { TRIGGER_EVENT_NAMES } from "../src/logic/core/triggers/types.js";
import { loadCardsForGates } from "./lib/loadCards.js";

const BASE = "src/logic/core/triggers";
const HANDLERS_DIR = path.join(BASE, "handlers");

/** type shorthands on crest triggers — not TriggerEventName literals */
const CREST_TYPE_ALIASES = new Set(["end_of_turn_own", "start_of_turn_own"]);

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
  for (const { card } of loadCardsForGates()) {
    walkCardForCrestEvents(card, events);
  }
  events.add("select_mode");
  events.add("invoke");
  return events;
}

function walkCardForCrestEvents(obj: unknown, events: Set<string>): void {
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
  if (Array.isArray(obj))
    obj.forEach((entry) => walkCardForCrestEvents(entry, events));
  else
    Object.values(rec).forEach((entry) =>
      walkCardForCrestEvents(entry, events),
    );
}

function collectAllTriggerEvents(): Array<{
  cardId: string;
  cardName: string;
  jsonPath: string;
  event: string;
}> {
  const found: Array<{
    cardId: string;
    cardName: string;
    jsonPath: string;
    event: string;
  }> = [];

  for (const { card } of loadCardsForGates()) {
    walkTriggers(card, card, found, "");
  }

  return found;
}

function walkTriggers(
  node: unknown,
  card: { id: string; name: string },
  found: Array<{
    cardId: string;
    cardName: string;
    jsonPath: string;
    event: string;
  }>,
  pathPrefix: string,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => {
      walkTriggers(child, card, found, `${pathPrefix}[${index}]`);
    });
    return;
  }

  const record = node as Record<string, unknown>;
  if (Array.isArray(record.triggers)) {
    record.triggers.forEach((trigger, index) => {
      if (!trigger || typeof trigger !== "object") return;
      const trig = trigger as Record<string, unknown>;
      const event = String(trig.event ?? trig.type ?? "").trim();
      if (!event) return;
      const jsonPath = pathPrefix
        ? `${pathPrefix}.triggers[${index}]`
        : `triggers[${index}]`;
      found.push({
        cardId: card.id,
        cardName: card.name,
        event,
        jsonPath,
      });
    });
  }

  for (const [key, value] of Object.entries(record)) {
    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    walkTriggers(value, card, found, childPath);
  }
}

function checkCrestTriggerEvents(): string[] {
  const errors: string[] = [];
  const known = TRIGGER_EVENT_NAMES;

  for (const ev of collectCrestTriggerEvents()) {
    if (CREST_TYPE_ALIASES.has(ev)) continue;
    if (!known.has(ev as any)) {
      errors.push(
        `Unknown crest trigger event "${ev}" in card data — add to TriggerEventName and crest owner-scoping tests`,
      );
    }
  }

  return errors;
}

function checkAllTriggerEvents(): string[] {
  const errors: string[] = [];
  const known = TRIGGER_EVENT_NAMES;

  for (const entry of collectAllTriggerEvents()) {
    if (CREST_TYPE_ALIASES.has(entry.event)) continue;
    if (!known.has(entry.event as any)) {
      errors.push(
        `[${entry.cardId}] ${entry.cardName} — unknown trigger event "${entry.event}" at ${entry.jsonPath}`,
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

  const triggerEventErrors = checkAllTriggerEvents();
  if (triggerEventErrors.length > 0) {
    failure = true;
    console.error("❌ Unknown trigger events in card data:");
    triggerEventErrors.forEach((e) => console.error(`   ${e}`));
  } else {
    console.log("✅ All card trigger event names are recognized.");
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
