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

  const MIME: Record<string, string> = {
    ".json": "application/json",
    ".html": "text/html",
    ".css": "text/css",
  };

  function mockResponse(
    ok: boolean,
    body: string,
    filePath?: string,
    status = ok ? 200 : 404,
  ) {
    const ext = filePath ? path.extname(filePath).toLowerCase() : ".json";
    const contentType = MIME[ext] ?? "application/octet-stream";
    return {
      ok,
      status,
      statusText: ok ? "OK" : "Not Found",
      headers: {
        get(name: string) {
          if (name.toLowerCase() === "content-type") return contentType;
          return null;
        },
      },
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  }

  (global as any).fetch = async (url: string) => {
    const cleanUrl = url
      .split("?")[0]
      .replace(/^[./]+/, "")
      .replace(/^\//, "");

    const potentialPath = path.resolve(process.cwd(), cleanUrl);

    if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
      const content = fs.readFileSync(potentialPath, "utf-8");
      return mockResponse(true, content, potentialPath);
    }

    // Fallback stub decks for integration tests
    if (
      url.includes("sample_blue") ||
      url.includes("sample_red") ||
      url.includes("starter_deck")
    ) {
      const stub = JSON.stringify({
        cards: [{ name: "Goblin", count: 40 }],
      });
      return mockResponse(true, stub, "stub.json");
    }

    console.warn(`Mock fetch 404: ${url} -> ${potentialPath}`);
    return mockResponse(false, "", undefined, 404);
  };
}

// NOTE: Do NOT reset card database in beforeEach here!
// Mechanics tests use beforeAll to initialize the card DB, and beforeEach runs after beforeAll,
// which would wipe the DB before each test runs. Individual test files should handle their own
// reset if needed.

export {};
