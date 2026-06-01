/**
 * Cross-runtime environment access (browser / Vite, vitest, Node tsx).
 * Never reference the Node `process` global directly in browser-reachable code.
 * This module is the sole bridge to Node env vars.
 */

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
};

type NodeProcessEnv = Record<string, string | undefined>;

function viteEnv(): Record<string, string | boolean | undefined> | undefined {
  try {
    return (import.meta as ImportMetaWithEnv).env;
  } catch {
    return undefined;
  }
}

/** Node process.env when running under Node; undefined in browser. */
function nodeProcessEnv(): NodeProcessEnv | undefined {
  const proc = globalThis as typeof globalThis & {
    process?: { env?: NodeProcessEnv };
  };
  return proc.process?.env;
}

/** Read a string env var from Vite (`import.meta.env`) or Node (`process.env`). */
export function readEnv(key: string): string | undefined {
  const im = viteEnv();
  if (im) {
    const direct = im[key];
    if (typeof direct === "string") return direct;
    if (typeof direct === "boolean") return direct ? "1" : "0";

    const vitePrefixed = im[`VITE_${key}`];
    if (typeof vitePrefixed === "string") return vitePrefixed;
  }

  return nodeProcessEnv()?.[key];
}

/** True in dev builds (Vite DEV, or NODE_ENV !== production). */
export function isDev(): boolean {
  const im = viteEnv();
  if (im?.DEV === true) return true;
  if (im?.PROD === true) return false;
  if (typeof im?.MODE === "string") return im.MODE !== "production";

  const nodeEnv = readEnv("NODE_ENV");
  if (nodeEnv) return nodeEnv !== "production";

  return false;
}

/** When set (DISABLE_UID_ENRICH=1), skip trigger context UID enrichment (benchmarks). */
export function isUidEnrichDisabled(): boolean {
  return readEnv("DISABLE_UID_ENRICH") === "1";
}

/** When set (DISABLE_HISTORY=1), skip expensive history snapshots (benchmarks). */
export function isHistoryDisabled(): boolean {
  return readEnv("DISABLE_HISTORY") === "1";
}

/** For tests/scripts: set a Node env var (no-op when process is absent). */
export function setNodeEnv(key: string, value: string | undefined): void {
  const proc = globalThis as typeof globalThis & {
    process?: { env?: NodeProcessEnv };
  };
  if (!proc.process?.env) return;
  if (value === undefined) {
    delete proc.process.env[key];
  } else {
    proc.process.env[key] = value;
  }
}
