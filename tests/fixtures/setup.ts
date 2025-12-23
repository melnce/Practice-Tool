// Mock global window object for browser-dependent code
if (typeof window === "undefined") {
  const noop = () => {};
  const win: any = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { search: "" },
    cardDatabase: {}, // used by cardDatabase.js
    APP_ROOT: "/",
  };
  try {
    (globalThis as any).window = win;
  } catch (e) {
    console.warn("Cannot set global.window");
  }
  try {
    (globalThis as any).document = {
      addEventListener: noop,
      removeEventListener: noop,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        classList: { add: noop, remove: noop, toggle: noop },
        appendChild: noop,
        append: noop,
        innerHTML: "",
        setAttribute: noop,
        getAttribute: () => null,
        textContent: "",
        dataset: {},
      }),
      body: {
        appendChild: noop,
        classList: { add: noop, remove: noop, toggle: noop },
      },
    };
  } catch (e) {
    console.warn("Cannot set global.document");
  }

  try {
    (globalThis as any).HEADLESS = true;
  } catch (e) {
    console.warn("Cannot set HEADLESS");
  }
  // The instruction seems to have a typo here.
  // If the intent was to assign window to document, it would overwrite the mock document.
  // Assuming the "from filesystem" was a misplaced comment for the next block.
  // If the intent was to add a new line, it should be syntactically correct.
  // Given the context, I will only apply the change to HEADLESS and keep the structure.
  // If `(globalThis as any).document = (globalThis as any).window;` was intended,
  // it would likely be a replacement for the mock document object, not an addition.
  // try { (globalThis as any).navigator = { userAgent: "node" }; } catch (e) { console.warn("Cannot set navigator"); }

  // Mock fetch to read from filesystem
  const fs = await import("fs");
  const path = await import("path");

  (global as any).fetch = async (url: string) => {
    // Handle /decks/... or /all_cards.json
    // Map URL path to local project root

    let valid = false;
    let filePath = "";

    const cleanUrl = url
      .split("?")[0]
      .replace(/^[./]+/, "")
      .replace(/^\//, "");

    // Try resolving relative to CWD (Project Root)
    const potentialPath = path.resolve(process.cwd(), cleanUrl);

    if (fs.existsSync(potentialPath)) {
      filePath = potentialPath;
      valid = true;
    }

    if (!valid) {
      // Fallback for missing decks
      if (url.includes("sample_blue") || url.includes("sample_red")) {
        return {
          ok: true,
          json: async () => ({
            cards: [{ name: "Goblin", count: 40 }],
          }),
        };
      }
      console.warn(`Mock fetch 404: ${url} -> ${potentialPath}`);
      return { ok: false, status: 404, statusText: "Not Found" };
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return {
      ok: true,
      json: async () => JSON.parse(content),
    };
  };
}

import { beforeEach } from "vitest";
import { resetCardDatabaseForTests } from "../../src/data/cardDatabase.js";

beforeEach(() => {
  resetCardDatabaseForTests();
});

export {};
