/**
 * Ensures production `build/` is self-contained: the same root dirs the Vite
 * dev middleware serves must be copyable into the outDir (static hosts have no
 * configureServer middleware).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ROOT_STATIC_DIRS,
  copyRootStaticDirs,
} from "../../vite.root-static.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("deployable build static dirs", () => {
  it("allowlist matches the runtime-served roots (middleware spec)", () => {
    expect([...ROOT_STATIC_DIRS].sort()).toEqual(
      ["cards", "css", "decks", "images"].sort(),
    );
  });

  it("copyRootStaticDirs copies cards/decks/css runtime files into outDir", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "svwb-build-"));
    tempDirs.push(out);

    copyRootStaticDirs(ROOT, out);

    const required = [
      "cards/index.json",
      "cards/all.json",
      "cards/token_details.json",
      "decks/manifest.json",
      "decks/starter_deck.json",
      "css/base.css",
      "images/victory_card.png",
    ];
    for (const rel of required) {
      expect(fs.existsSync(path.join(out, rel)), `missing ${rel}`).toBe(true);
    }

    // At least one set JSON under cards/sets/
    const setsDir = path.join(out, "cards", "sets");
    expect(fs.existsSync(setsDir)).toBe(true);
    const setFiles = fs.readdirSync(setsDir).filter((f) => f.endsWith(".json"));
    expect(setFiles.length).toBeGreaterThan(0);
  });

  it("index.html and consistency.html declare noindex for low-key deploys", () => {
    for (const file of ["index.html", "consistency.html"]) {
      const html = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(html).toMatch(/<meta\s+name="robots"\s+content="noindex"\s*\/?>/i);
    }
  });

  it("when build/ exists after vite build, it contains the allowlisted runtime files", () => {
    const buildDir = path.join(ROOT, "build");
    if (!fs.existsSync(path.join(buildDir, "index.html"))) {
      // Build artifact absent in this run — copy helper coverage above is enough.
      return;
    }
    for (const dir of ROOT_STATIC_DIRS) {
      expect(
        fs.existsSync(path.join(buildDir, dir)),
        `build/${dir} missing — npm run build must copy ROOT_STATIC_DIRS`,
      ).toBe(true);
    }
    expect(fs.existsSync(path.join(buildDir, "cards", "index.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(buildDir, "decks", "manifest.json"))).toBe(
      true,
    );
  });
});
