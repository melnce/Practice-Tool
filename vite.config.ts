import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { ROOT_STATIC_DIRS, copyRootStaticDirs } from "./vite.root-static.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

export { ROOT_STATIC_DIRS, copyRootStaticDirs } from "./vite.root-static.js";

/** Serve css/cards/decks/images from repo root without exposing src/ as raw static files. */
function serveRootStaticDirs(dirs: readonly string[]): Plugin {
  const MIME: Record<string, string> = {
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".html": "text/html",
  };

  let outDirAbs = path.join(ROOT, "build");
  let isBuild = false;

  return {
    name: "serve-root-static-dirs",
    configResolved(config) {
      outDirAbs = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = (req.url ?? "").split("?")[0];
        if (!raw || raw.includes("..")) return next();

        const rel = raw.startsWith("/") ? raw.slice(1) : raw;
        const abs = path.join(ROOT, rel);

        const allowed =
          dirs.some((d) => rel === d || rel.startsWith(`${d}/`)) ||
          rel.startsWith("css/");

        if (!allowed || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          return next();
        }

        const ext = path.extname(abs).toLowerCase();
        res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
        fs.createReadStream(abs).pipe(res);
      });
    },
    closeBundle() {
      // Build only — keep configureServer middleware unchanged for dev.
      if (!isBuild) return;
      copyRootStaticDirs(ROOT, outDirAbs, dirs);
    },
  };
}

export default defineConfig({
  root: ".",
  // Do NOT set publicDir to "." — that serves src/*.ts as raw static files (breaks the browser).
  publicDir: false,
  server: {
    port: 5173,
    open: true,
    fs: { allow: [ROOT] },
  },
  plugins: [serveRootStaticDirs(ROOT_STATIC_DIRS)],
  resolve: {
    // TS sources use `.js` extensions in import specifiers (NodeNext ESM convention).
    // Vite resolves `./foo.js` → `foo.ts` when only the `.ts` file exists.
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@data": path.resolve(__dirname, "src/data"),
      "@logic": path.resolve(__dirname, "src/logic"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@helpers": path.resolve(__dirname, "src/helpers"),
      "@ops": path.resolve(__dirname, "src/logic/effects/ops"),
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        consistency: path.resolve(__dirname, "consistency.html"),
      },
    },
  },
});
