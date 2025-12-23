#!/usr/bin/env tsx
/**
 * scripts/check-architecture.ts
 * Unified architecture guardrail runner.
 * Runs all individual check scripts and reports aggregated results.
 */

import { execSync } from "child_process";

const SCRIPTS = [
  { name: "Buff", script: "scripts/check-buffs.ts" },
  { name: "Targeting", script: "scripts/check-targeting.ts" },
  { name: "Damage", script: "scripts/check-damage.ts" },
  { name: "CardFilter", script: "scripts/check-cardfilter.ts" },
  { name: "CleanupDead", script: "scripts/check-cleanupdead.ts" },
  { name: "PendingTarget", script: "scripts/check-pendingtarget.ts" },
  { name: "EffectsRegistry", script: "scripts/check-effects-registry.ts" },
];

console.log("🏛️  Running Architecture Guardrails...\n");

let allPassed = true;
const results: { name: string; passed: boolean; output: string }[] = [];

for (const check of SCRIPTS) {
  try {
    const output = execSync(`npx tsx ${check.script}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    results.push({ name: check.name, passed: true, output });
    console.log(`✅ ${check.name}: PASSED`);
  } catch (e: any) {
    allPassed = false;
    const output = e.stdout?.toString() || e.stderr?.toString() || e.message;
    results.push({ name: check.name, passed: false, output });
    console.log(`❌ ${check.name}: FAILED`);
    console.log(output);
  }
}

console.log("\n" + "=".repeat(50));
if (allPassed) {
  console.log("✅ All architecture checks passed.");
  process.exit(0);
} else {
  console.error("⛔ Some architecture checks failed.");
  process.exit(1);
}
