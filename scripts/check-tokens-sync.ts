#!/usr/bin/env tsx
/**
 * Validates cards/token_details.json structure (hand-maintained source).
 * Run: npm run check:tokens
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, "../cards/token_details.json");

type Token = { id?: string; name?: string; type?: string };

function main() {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error("❌ Missing cards/token_details.json");
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8")) as Token[];
  if (!Array.isArray(tokens)) {
    console.error("❌ token_details.json must be an array");
    process.exit(1);
  }

  const names = new Set<string>();
  const ids = new Set<string>();
  let failed = false;

  for (const t of tokens) {
    if (!t.name) {
      console.error("❌ Token missing name:", t);
      failed = true;
      continue;
    }
    if (names.has(t.name)) {
      console.error(`❌ Duplicate token name: ${t.name}`);
      failed = true;
    }
    names.add(t.name);
    if (t.id) {
      if (ids.has(t.id)) {
        console.error(`❌ Duplicate token id: ${t.id}`);
        failed = true;
      }
      ids.add(t.id);
    }
  }

  if (failed) process.exit(1);
  console.log(`✅ token_details.json OK (${tokens.length} tokens)`);
}

main();
