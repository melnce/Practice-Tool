// src/logic/core/playCard/guardrails.test.ts
// Guardrail tests to prevent UI leakage into core modules

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CORE_MODULES = [
  "core.ts",
  "spell.ts",
  "follower.ts",
  "amulet.ts",
  "cost.ts",
  "preflight.ts",
  "history.ts",
  "specialCases.ts",
  "types.ts",
];

const FORBIDDEN_PATTERNS = [
  /import\s+.*adapter/, // No adapter imports
  /import\s+.*from\s+['"].*\/ui\//, // No UI imports
  /adapter\.render/, // No direct render calls
  /safeRender/, // No safeRender calls
  /HEADLESS/, // No HEADLESS checks
  // Note: console logging is a style concern, not an architectural boundary
];

const ALLOWED_EXCEPTIONS: Record<string, RegExp[]> = {
  // debugTimeline's recordEvent is allowed for debug purposes
  "spell.ts": [/recordEvent/],
};

describe("UI Leakage Guardrails", () => {
  const moduleDir = path.resolve(__dirname);

  for (const moduleName of CORE_MODULES) {
    it(`${moduleName} has no UI/render dependencies`, () => {
      const filePath = path.join(moduleDir, moduleName);

      // Skip if file doesn't exist (might be in dist)
      if (!fs.existsSync(filePath)) {
        // Try the src path
        const srcPath = path.resolve(
          __dirname,
          "../../../../src/logic/core/playCard",
          moduleName,
        );
        if (!fs.existsSync(srcPath)) {
          console.warn(`Skipping ${moduleName} - file not found`);
          return;
        }
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const exceptions = ALLOWED_EXCEPTIONS[moduleName] || [];

      for (const pattern of FORBIDDEN_PATTERNS) {
        // Check if this pattern matches any exception
        const isException = exceptions.some((exc) => {
          const match = content.match(pattern);
          return match && exc.test(match[0]);
        });

        if (!isException) {
          const match = content.match(pattern);
          if (match) {
            throw new Error(
              `${moduleName} contains forbidden pattern: ${pattern}\n` +
                `Found: "${match[0]}"\n` +
                `This violates the UI decoupling contract.`,
            );
          }
        }
      }
    });
  }

  it("Only index.ts should import adapter", () => {
    const indexPath = path.join(moduleDir, "index.ts");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      // index.ts SHOULD have adapter import
      expect(content).toMatch(/import.*adapter/);
    }
  });
});
