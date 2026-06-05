/**
 * Audit test setup — loads real card database for card-text-derived behavioral tests.
 */
import "../fixtures/setup.js";
import { beforeAll } from "vitest";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";

beforeAll(async () => {
  await initCardDatabaseNode();
});

export {};
