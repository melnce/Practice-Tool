/**
 * Headless Node stubs for scripts that call startNewGame / browser deck loaders.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function installHeadlessGlobals(): void {
  const noop = () => {};
  if (typeof (globalThis as any).window === "undefined") {
    (globalThis as any).window = {
      addEventListener: noop,
      removeEventListener: noop,
      location: { search: "" },
      cardDatabase: {},
      APP_ROOT: "/",
    };
  }
  if (typeof (globalThis as any).document === "undefined") {
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
  }
}

export async function installFsFetch(): Promise<void> {
  const fs = await import("fs");
  const path = await import("path");
  const MIME: Record<string, string> = {
    ".json": "application/json",
    ".html": "text/html",
  };
  (globalThis as any).fetch = async (url: string) => {
    const cleanUrl = String(url)
      .split("?")[0]!
      .replace(/^[./]+/, "")
      .replace(/^\//, "");
    const potentialPath = path.resolve(ROOT, cleanUrl);
    if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
      const content = fs.readFileSync(potentialPath, "utf-8");
      const ext = path.extname(potentialPath).toLowerCase();
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get(name: string) {
            if (name.toLowerCase() === "content-type")
              return MIME[ext] ?? "application/octet-stream";
            return null;
          },
        },
        text: async () => content,
        json: async () => JSON.parse(content),
      };
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
      text: async () => "",
      json: async () => {
        throw new Error("not found");
      },
    };
  };
}

export async function installHeadlessNode(): Promise<void> {
  installHeadlessGlobals();
  await installFsFetch();
}
