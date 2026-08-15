import fs from "node:fs";
import path from "node:path";

/**
 * Root dirs the app fetches at runtime. Dev middleware serves these; production
 * build must copy the same set into `build/` so static hosts (e.g. Vercel) work.
 * Do NOT flip `publicDir` to "." — that serves raw `src/*.ts` and breaks the browser.
 */
export const ROOT_STATIC_DIRS = ["css", "cards", "decks", "images"] as const;

/** Copy allowlisted runtime static dirs into the Vite outDir (self-contained deploy). */
export function copyRootStaticDirs(
  rootDir: string,
  outDir: string,
  dirs: readonly string[] = ROOT_STATIC_DIRS,
): void {
  for (const dir of dirs) {
    const src = path.join(rootDir, dir);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(outDir, dir), { recursive: true });
  }
}
