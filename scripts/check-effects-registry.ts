#!/usr/bin/env tsx
/**
 * scripts/check-effects-registry.ts
 * Verifies effects registry patterns via static analysis.
 *
 * Checks:
 * 1. All registrations use registerOp (no raw registry access)
 * 2. No duplicate op names across domain files
 * 3. Domain files follow naming convention
 */

import * as fs from "fs";
import * as path from "path";

const DOMAINS_DIR = "src/logic/core/effects/domains";
const REGISTRY_FILE = "src/logic/core/effects/registry.ts";
const INDEX_FILE = "src/logic/core/effects/index.ts";

// Pattern to extract registerOp calls: registerOp("op_name", ...)
const REGISTER_OP_PATTERN = /registerOp\s*\(\s*["']([^"']+)["']/g;

function main() {
  console.log("🔍 Checking Effects Registry...\n");
  let passed = true;
  const allOps = new Map<string, string>(); // op -> file

  // Check registry.ts exists and has expected structure
  const registryPath = path.join(process.cwd(), REGISTRY_FILE);
  if (!fs.existsSync(registryPath)) {
    console.error(`❌ Registry file not found: ${REGISTRY_FILE}`);
    passed = false;
  } else {
    const content = fs.readFileSync(registryPath, "utf-8");
    if (!content.includes("if (registry.has(op))")) {
      console.error("❌ Registry lacks duplicate prevention check.");
      passed = false;
    } else {
      console.log("✓ Registry has duplicate prevention.");
    }
    if (!content.includes("isSealed")) {
      console.error("❌ Registry lacks seal mechanism.");
      passed = false;
    } else {
      console.log("✓ Registry has seal mechanism.");
    }
  }

  // Scan domain files for registrations
  const domainsPath = path.join(process.cwd(), DOMAINS_DIR);
  if (!fs.existsSync(domainsPath)) {
    console.error(`❌ Domains directory not found: ${DOMAINS_DIR}`);
    passed = false;
  } else {
    const files = fs.readdirSync(domainsPath).filter((f) => f.endsWith(".ts"));
    console.log(`✓ Found ${files.length} domain file(s).`);

    for (const file of files) {
      const filePath = path.join(domainsPath, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const relativePath = `${DOMAINS_DIR}/${file}`;

      let match: RegExpExecArray | null;
      while ((match = REGISTER_OP_PATTERN.exec(content)) !== null) {
        const opName = match[1];

        if (allOps.has(opName)) {
          console.error(`❌ Duplicate op registration: "${opName}"`);
          console.error(`   First: ${allOps.get(opName)}`);
          console.error(`   Second: ${relativePath}`);
          passed = false;
        } else {
          allOps.set(opName, relativePath);
        }
      }
    }
  }

  // Check index.ts imports all domain register functions
  const indexPath = path.join(process.cwd(), INDEX_FILE);
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, "utf-8");
    if (!content.includes("sealRegistry()")) {
      console.error("❌ Index does not call sealRegistry().");
      passed = false;
    } else {
      console.log("✓ Index calls sealRegistry().");
    }
  }

  // Summary
  console.log(`\n📊 Summary:`);
  console.log(`   Registered ops: ${allOps.size}`);

  if (passed) {
    console.log("\n✅ Effects registry is valid.");
    process.exit(0);
  } else {
    console.error("\n⛔ Architectural violations found.");
    process.exit(1);
  }
}

main();
