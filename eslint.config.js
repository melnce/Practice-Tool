/**
 * ESLint config optimized for iterative LLM-driven development.
 *
 * Design goals:
 * - Catch real bugs early (async, logic errors)
 * - Avoid stylistic noise that blocks refactors
 * - Allow exploration while enforcing discipline where it matters
 * - All suppressions must explain themselves
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // ---------------------------------------------------------------------------
  // Global ignores
  // ---------------------------------------------------------------------------
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/tests/legacy/**",
    ],
  },

  // ---------------------------------------------------------------------------
  // Base JS rules (applies to JS + TS)
  // ---------------------------------------------------------------------------
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      // Prevent obvious logic bugs
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },

  // ---------------------------------------------------------------------------
  // TypeScript recommended baseline
  // ---------------------------------------------------------------------------
  ...tseslint.configs.recommended,

  // ---------------------------------------------------------------------------
  // TypeScript overrides – tuned for an evolving codebase + LLMs
  // ---------------------------------------------------------------------------
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      // 🔴 REQUIRED for typed rules like no-floating-promises
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow exploration while refactoring / prototyping
      "@typescript-eslint/no-explicit-any": "off",

      // Force intentional suppressions (agents must explain themselves)
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 5,
        },
      ],

      // Reduce noise but keep signal
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // ---------------------------------------------------------------------
      // 🔴 HIGH-VALUE BUG PREVENTION (KEEP THESE ON)
      // ---------------------------------------------------------------------

      // Agents frequently forget to await async calls
      "@typescript-eslint/no-floating-promises": "error",

      // Prevent `await` on non-promises (common hallucination)
      "@typescript-eslint/await-thenable": "error",
    },
  },
]);
