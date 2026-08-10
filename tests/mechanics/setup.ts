/**
 * @file Mechanics Test Setup
 *
 * This setup file initializes the card database for mechanic tests
 * that require real card lookups (e.g., summon with named tokens).
 *
 * Import this in mechanic tests that need the card registry:
 *   import "./setup.js";
 */

import "../fixtures/setup.js";
import { beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";

// Initialize card database once before all mechanic tests
beforeAll(async () => {
  await initCardDatabaseNode();
});

export {};
