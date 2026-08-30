/**
 * DOM / event-listener retention harness.
 *
 * Drives the built app headlessly through a fixed cycle shape, forces GC via
 * CDP HeapProfiler.collectGarbage before every sample, and judges the TREND
 * across checkpoints (linear post-GC growth) rather than pairwise % heuristics.
 *
 * CRITICAL: a soak that is not actually exercising a live game MUST fail.
 * We assert pre-start → post-start node movement, phase === "main", cards
 * present, and turn progress after the first cycle. A flat curve on a dead
 * page is a false negative and is rejected.
 *
 * Retention is judged by post-GC TREND across cycles and the WeakRef probe —
 * never by a hard-coded startup node budget (a full 9-card opening hand
 * legitimately adds hundreds of nodes).
 *
 * FAIL taxonomy (do not conflate):
 *   - "soak is not exercising a live game" → instrument/liveness failure
 *   - "retention leak detected" → the soak WAS live; WeakRef survivors / linear growth
 *
 * handCards in the table is the SUM of both players' hands (MAX_HAND=9 each).
 * Columns are labeled hand(both) / blueH / redH so 18 at mid-game is not an invariant break.
 *
 * Usage:
 *   npm run build && npx tsx scripts/listener-leak-harness.mjs
 *
 * Env:
 *   LISTENER_LEAK_CYCLES=30     stress cycles (default 30)
 *   LISTENER_LEAK_PORT=8882     static server port
 *   LISTENER_LEAK_SEED=424242   fixed game seed
 *   LISTENER_LEAK_BLUE_DECK / LISTENER_LEAK_RED_DECK  deck ids (defaults:
 *       runecraft_sephie_test_subject / portalcraft_artifact_rotation)
 *   LISTENER_LEAK_RETAIN=1      inject intentional retain-on-replace (self-test)
 *   LISTENER_LEAK_DUMP_SNAPSHOT=1  always dump detached retainer summary
 *   LISTENER_LEAK_PROBE=0       disable WeakRef probe entirely (metrics-only confound check)
 *   LISTENER_LEAK_SNAPSHOT=0    never take heap snapshots (also skips Debugger.enable)
 *   LISTENER_LEAK_ATTR=1        wrap addEventListener + IDL on* setters; tally by type+site
 *   LISTENER_LEAK_IMAGES=fulfil|fail|passthrough
 *       Image network regime (DEFAULT: fulfil). Card art loads from
 *       https://static.dotgg.gg/shadowverse/cards/<id>.webp — whether those
 *       requests succeed changes the post-GC curve dramatically:
 *         fulfil      → remote images replaced with a 1×1 PNG (CDN-independent PASS)
 *         fail        → leave remote image requests pending / hung (DEFAULT fail
 *                       style). Before PR #103 this grew ~1,485→27,442 nodes over
 *                       20 cycles; after cancel-on-detach it stays flat (~1,263).
 *                       Clean abort/404 does NOT reproduce the pre-fix leak —
 *                       only hang/block-without-response matches a sandbox that
 *                       drops CDN packets. Do NOT default fail-style to abort.
 *         passthrough → real network (debug only; non-deterministic)
 *       Default fulfil so agent VM vs blocked-CDN sandbox can never disagree again.
 *       Gate: images-fail (hang) must PASS on fixed main; must FAIL if the
 *       pending-ImageLoader cancel-on-detach fix is removed. images-fulfil PASS.
 *   LISTENER_LEAK_IMAGES_FAIL_STYLE=hang|abort|block|404|block+abort
 *       How fail breaks images (DEFAULT: hang). hang is the owner-sandbox regime.
 *       abort/404/block settle cleanly and do NOT reproduce the leak — a gate
 *       that used abort would give a false pass while the bug was present.
 *
 * Probe contract: window.__leakWeakProbe.refs holds WeakRef(node) ONLY — never
 * bare Element handles. A strongly-held Array of WeakRefs does not keep nodes
 * alive. LISTENER_LEAK_RETAIN is a separate intentional strong bucket.
 *
 * Cycle shape (fixed): 3 end-turns + hover every card in all four zones
 * + 4× Ctrl+Z + 4× Ctrl+Y. Samples after start and every 10 cycles.
 */
import { chromium } from "@playwright/test";
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { withSettingsDrawer } from "./settings-drawer-helpers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");
const OUT_DIR = join(ROOT, ".cache/leak-harness");
const CYCLES = Number(process.env.LISTENER_LEAK_CYCLES || 30);
const PORT = Number(process.env.LISTENER_LEAK_PORT || 8882);
const SEED = Number(process.env.LISTENER_LEAK_SEED || 424242);
const INJECT_RETAIN = process.env.LISTENER_LEAK_RETAIN === "1";
/** WeakRef replace/remove probe. Default ON. Set LISTENER_LEAK_PROBE=0 for metrics-only. */
const ENABLE_PROBE = process.env.LISTENER_LEAK_PROBE !== "0";
/**
 * Heap snapshots + Debugger.enable. Default ON when dumping.
 * Set LISTENER_LEAK_SNAPSHOT=0 to never snapshot (confound check: CDP snapshot
 * pinning). When off, WeakRef survivor early-exit is deferred to end-of-run
 * logging only so the full metrics curve is collected.
 */
const ENABLE_SNAPSHOT = process.env.LISTENER_LEAK_SNAPSHOT !== "0";
const DUMP_SNAPSHOT =
  ENABLE_SNAPSHOT &&
  (process.env.LISTENER_LEAK_DUMP_SNAPSHOT === "1" || INJECT_RETAIN);
const SAMPLE_EVERY = Number(process.env.LISTENER_LEAK_SAMPLE_EVERY || 10);
/** Wrap addEventListener + IDL on* setters; dump tallies at each sample. */
const ENABLE_LISTENER_ATTR = process.env.LISTENER_LEAK_ATTR === "1";
/** Remote card-art regime. Default fulfil pins CDN-independent healthy curve. */
const IMAGE_MODE = (() => {
  const raw = String(
    process.env.LISTENER_LEAK_IMAGES || "fulfil",
  ).toLowerCase();
  if (raw === "fail" || raw === "abort") return "fail";
  if (raw === "fulfil" || raw === "fulfill" || raw === "ok") return "fulfil";
  if (raw === "passthrough" || raw === "live") return "passthrough";
  console.warn(
    `LISTENER_LEAK_IMAGES=${raw} not recognized — using fulfil (CDN-independent)`,
  );
  return "fulfil";
})();
/** 1×1 transparent PNG for LISTENER_LEAK_IMAGES=fulfil. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Surviving class decks after pre-rotation removal (PR #101 / origin/main). */
const BLUE_DECK =
  process.env.LISTENER_LEAK_BLUE_DECK || "runecraft_sephie_test_subject";
const RED_DECK =
  process.env.LISTENER_LEAK_RED_DECK || "portalcraft_artifact_rotation";
const CHROME =
  process.env.CHROME_PATH ||
  (existsSync(
    "/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
  )
    ? "/home/ubuntu/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
    : existsSync("/opt/pw-browsers/chromium/chrome")
      ? "/opt/pw-browsers/chromium/chrome"
      : existsSync("/opt/google/chrome/chrome")
        ? "/opt/google/chrome/chrome"
        : "/usr/local/bin/google-chrome");

/** Post-GC growth per 10-cycle interval that counts as "material". */
const NODE_INTERVAL_THRESHOLD = 400;
const LISTENER_INTERVAL_THRESHOLD = 200;
/** Total post-GC growth start→end that counts as "material". */
const NODE_TOTAL_THRESHOLD = 800;
const LISTENER_TOTAL_THRESHOLD = 400;
/** Need this many intervals with material growth to call it linear. */
const MIN_GROWING_INTERVALS = 2;

/**
 * Live-game gates. A page that never started must not PASS.
 * Post-start nodes must exceed pre-start by this margin (cards rendered).
 * Do NOT hard-cap startup node/listener growth: a full 9-card opening hand
 * legitimately adds hundreds of nodes. Retention is judged by trend + WeakRef.
 */
const MIN_STARTUP_NODE_DELTA = 40;
const MIN_CARDS_AT_START = 8;
/** Without INJECT_RETAIN, surviving WeakRefs to replaced nodes after GC → leak. */
const MAX_ALIVE_WEAKREFS = 5;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
      let filePath = join(BUILD, decodeURIComponent(url.pathname));
      if (url.pathname.endsWith("/")) filePath = join(filePath, "index.html");
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
      });
      res.end(readFileSync(filePath));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function sampleMetrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const map = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  return {
    nodes: Math.round(map.Nodes ?? 0),
    listeners: Math.round(map.JSEventListeners ?? 0),
    heapMb: Number(((map.JSHeapUsedSize ?? 0) / (1024 * 1024)).toFixed(1)),
  };
}

async function forceGc(cdp, page) {
  await page.mouse.move(5, 5).catch(() => {});
  await page.evaluate(() => {
    if (typeof gc === "function") gc();
  });
  await cdp.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 80));
  await cdp.send("HeapProfiler.collectGarbage");
  await new Promise((r) => setTimeout(r, 80));
}

/**
 * Track replaced/removed nodes via WeakRef so post-GC survival is measurable.
 *
 * CRITICAL: probe.refs stores WeakRef(node) only — never the Element itself.
 * The Array is strongly reachable from window.__leakWeakProbe, but WeakRef
 * entries do not prevent GC of their targets. (Contrast LISTENER_LEAK_RETAIN,
 * which strongly pushes nodes into __leakRetainBucket.)
 */

/**
 * Attribute listener growth: wrap addEventListener AND IDL on* property
 * setters (tooltips use onmouseenter/onmousemove/onmouseleave — not addEventListener).
 * Tallies are cumulative installs since page load (not net of removes).
 */
async function installListenerAttribution(page) {
  await page.addInitScript(() => {
    if (window.__leakListenerAttr) return;
    const tallies = new Map(); // key -> count
    const byType = new Map();
    let total = 0;

    function siteFromStack(stack) {
      if (!stack) return "(no-stack)";
      const lines = String(stack)
        .split("\n")
        .map((l) => l.trim());
      for (const line of lines) {
        if (!line || line.startsWith("Error")) continue;
        if (line.includes("installListenerAttribution")) continue;
        if (line.includes("__leakListenerAttr")) continue;
        if (line.includes("addEventListener") && line.includes("native"))
          continue;
        // Strip leading "at "
        const cleaned = line.replace(/^at\s+/, "");
        // Prefer app bundle / src frames
        if (
          cleaned.includes("/assets/") ||
          cleaned.includes("/src/") ||
          cleaned.includes("main-") ||
          cleaned.includes("index-")
        ) {
          return cleaned.slice(0, 180);
        }
      }
      for (const line of lines) {
        if (!line || line.startsWith("Error")) continue;
        if (line.includes("__leakListenerAttr")) continue;
        return line.replace(/^at\s+/, "").slice(0, 180);
      }
      return "(unknown)";
    }

    function record(kind, type, stack) {
      total += 1;
      byType.set(type, (byType.get(type) || 0) + 1);
      const site = siteFromStack(stack);
      const key = `${kind}:${type} @ ${site}`;
      tallies.set(key, (tallies.get(key) || 0) + 1);
    }

    const proto = EventTarget.prototype;
    const origAdd = proto.addEventListener;
    proto.addEventListener = function leakAttrAdd(type, listener, options) {
      try {
        record("addEventListener", String(type), new Error().stack);
      } catch {
        /* ignore */
      }
      return origAdd.call(this, type, listener, options);
    };

    // IDL handler properties used by tooltips / face-down / crests / etc.
    const idlProps = [
      "onmouseenter",
      "onmousemove",
      "onmouseleave",
      "onmouseover",
      "onmouseout",
      "onclick",
      "oncontextmenu",
      "ondragstart",
      "ondragend",
      "ondragover",
      "ondrop",
      "onanimationend",
      "onerror",
    ];
    for (const prop of idlProps) {
      const desc =
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop) ||
        Object.getOwnPropertyDescriptor(Element.prototype, prop) ||
        Object.getOwnPropertyDescriptor(window, prop);
      // HTMLElement on* are typically on HTMLElement.prototype as accessors in Chrome
      let targetProto = HTMLElement.prototype;
      let existing = Object.getOwnPropertyDescriptor(targetProto, prop);
      if (!existing) {
        targetProto = Element.prototype;
        existing = Object.getOwnPropertyDescriptor(targetProto, prop);
      }
      if (!existing || !existing.set) {
        // Define a shadowing setter on HTMLElement that records then assigns
        try {
          Object.defineProperty(HTMLElement.prototype, prop, {
            configurable: true,
            enumerable: true,
            get:
              existing && existing.get
                ? existing.get
                : function () {
                    return this["__" + prop];
                  },
            set: function (fn) {
              try {
                if (typeof fn === "function") {
                  record("idl", prop.slice(2), new Error().stack);
                }
              } catch {
                /* ignore */
              }
              if (existing && existing.set) existing.set.call(this, fn);
              else this["__" + prop] = fn;
            },
          });
        } catch {
          /* ignore */
        }
        continue;
      }
      const origSet = existing.set;
      const origGet = existing.get;
      Object.defineProperty(targetProto, prop, {
        configurable: true,
        enumerable: existing.enumerable,
        get: origGet
          ? function () {
              return origGet.call(this);
            }
          : undefined,
        set: function (fn) {
          try {
            if (typeof fn === "function") {
              record("idl", prop.slice(2), new Error().stack);
            }
          } catch {
            /* ignore */
          }
          return origSet.call(this, fn);
        },
      });
    }

    window.__leakListenerAttr = {
      total() {
        return total;
      },
      snapshot() {
        const top = [...tallies.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([site, count]) => ({ count, site }));
        const types = [...byType.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([type, count]) => ({ count, type }));
        return { total, topSites: top, byType: types };
      },
    };
  });
}

async function readListenerAttribution(page) {
  return page.evaluate(() => {
    const a = window.__leakListenerAttr;
    if (!a) return null;
    return a.snapshot();
  });
}

async function installWeakRefProbe(page) {
  await page.evaluate(() => {
    if (window.__leakWeakProbe) return;
    window.__leakWeakProbe = {
      refs: [], // WeakRef<Element>[] — not Element[]
      replaces: 0,
      removes: 0,
    };
    const probe = window.__leakWeakProbe;
    const wrap = (proto, name, kind) => {
      const orig = proto[name];
      proto[name] = function leakWeakWrap(...args) {
        const oldNode = kind === "replace" ? args[1] : args[0];
        try {
          if (kind === "replace") probe.replaces += 1;
          else probe.removes += 1;
          if (oldNode && typeof WeakRef !== "undefined") {
            probe.refs.push(new WeakRef(oldNode));
            if (probe.refs.length > 8000) probe.refs.splice(0, 2000);
          }
        } catch {
          /* ignore */
        }
        return orig.apply(this, args);
      };
    };
    wrap(Element.prototype, "replaceChild", "replace");
    wrap(Element.prototype, "removeChild", "remove");
    // Face-down hand rebuild uses replaceChildren — track those too.
    const origRC = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function leakWeakReplaceChildren(
      ...nodes
    ) {
      try {
        for (const child of Array.from(this.children)) {
          probe.removes += 1;
          if (typeof WeakRef !== "undefined") {
            probe.refs.push(new WeakRef(child));
            if (probe.refs.length > 8000) probe.refs.splice(0, 2000);
          }
        }
      } catch {
        /* ignore */
      }
      return origRC.apply(this, nodes);
    };
  });
}

async function readWeakRefProbe(page) {
  return page.evaluate(() => {
    const p = window.__leakWeakProbe;
    if (!p) return { replaces: 0, removes: 0, tracked: 0, alive: 0 };
    let alive = 0;
    for (const ref of p.refs) {
      try {
        if (ref.deref()) alive += 1;
      } catch {
        /* ignore */
      }
    }
    return {
      replaces: p.replaces,
      removes: p.removes,
      tracked: p.refs.length,
      alive,
    };
  });
}

async function readLiveState(page) {
  return page.evaluate(() => {
    const s = window.gameState;
    const blueHand = document.querySelectorAll("#blueHand .card").length;
    const redHand = document.querySelectorAll("#redHand .card").length;
    const blueBoard = document.querySelectorAll("#blueBoard .card").length;
    const redBoard = document.querySelectorAll("#redBoard .card").length;
    // Fail-closed: if LISTENER_LEAK_RETAIN injector is present, surface it in
    // every sample so probe-off curves cannot be mistaken for an app leak.
    const retainBucket = window.__leakRetainBucket;
    return {
      phase: s?.phase ?? null,
      gameStarted: !!s?.gameStarted,
      turn: s?.turnNumber ?? null,
      active: s?.activePlayer ?? null,
      cards: document.querySelectorAll(".card").length,
      // Sum of both players' hands (MAX_HAND is per-player; 18 is normal late-game).
      handCardsBoth: blueHand + redHand,
      blueHand,
      redHand,
      boardCards: blueBoard + redBoard,
      blueBoard,
      redBoard,
      histItems: document.querySelectorAll(".hist-item").length,
      allElements: document.querySelectorAll("*").length,
      // Back-compat alias used by older log lines.
      handCards: blueHand + redHand,
      retainBucketLen: Array.isArray(retainBucket) ? retainBucket.length : null,
      // Ablation / retainer signal: tooltip session + floating combat trackers.
      ...(() => {
        try {
          const a = window.__svwbTest?.auditLeakRoots?.();
          if (!a) {
            return {
              tipExists: null,
              tipConnected: null,
              tipUid: null,
              floatTracked: null,
              floatDom: null,
              floatTimers: null,
            };
          }
          return {
            tipExists: !!a.tooltipSessionExists,
            tipConnected: a.tooltipSessionConnected,
            tipUid: a.tooltipSessionUid ?? null,
            floatTracked: a.floatingTracked ?? null,
            floatDom: a.floatingDom ?? null,
            floatTimers: a.floatingTimers ?? null,
          };
        } catch {
          return {
            tipExists: null,
            tipConnected: null,
            tipUid: null,
            floatTracked: null,
            floatDom: null,
            floatTimers: null,
          };
        }
      })(),
    };
  });
}

/**
 * Audit known JS roots that can retain detached card DOM. Printed on every
 * retention dump so we can name a file:line instead of DOMStringMap self-edges.
 */
async function auditKnownDomRoots(page) {
  return page.evaluate(() => {
    const out = {
      retainBucketLen: Array.isArray(window.__leakRetainBucket)
        ? window.__leakRetainBucket.length
        : null,
      weakProbeTracked: window.__leakWeakProbe?.refs?.length ?? null,
      weakProbeAlive: null,
      // Probe module-scope tooltip session via a temporary hook if exposed.
      activeSessionConnected: null,
      activeSessionExists: null,
      floatingActiveTargets: null,
      floatingActiveEls: null,
      windowElementArrayProps: [],
    };
    try {
      const refs = window.__leakWeakProbe?.refs;
      if (Array.isArray(refs)) {
        let alive = 0;
        for (const r of refs) {
          try {
            if (r && typeof r.deref === "function" && r.deref()) alive += 1;
          } catch {
            /* ignore */
          }
        }
        out.weakProbeAlive = alive;
      }
    } catch {
      /* ignore */
    }
    try {
      const audit = window.__svwbTest?.auditLeakRoots?.();
      if (audit) {
        out.activeSessionExists = !!audit.tooltipSessionExists;
        out.activeSessionConnected = audit.tooltipSessionConnected;
        out.floatingActiveTargets = audit.floatingTracked;
        out.floatingActiveEls = audit.floatingDom;
        out.floatingTimers = audit.floatingTimers;
        out.tooltipSessionUid = audit.tooltipSessionUid ?? null;
      }
    } catch {
      /* ignore */
    }
    // Scan enumerable window props for Arrays/Sets that hold Elements (common leak shape).
    try {
      for (const key of Object.getOwnPropertyNames(window)) {
        if (key === "__leakRetainBucket" || key === "__leakWeakProbe") continue;
        let v;
        try {
          v = window[key];
        } catch {
          continue;
        }
        if (!v) continue;
        if (
          Array.isArray(v) &&
          v.length > 0 &&
          v.some((x) => x instanceof Element)
        ) {
          out.windowElementArrayProps.push({
            key,
            len: v.length,
            detached: v.filter((x) => x instanceof Element && !x.isConnected)
              .length,
          });
        }
      }
    } catch {
      /* ignore */
    }
    return out;
  });
}

async function dismissOverlays(page) {
  for (let i = 0; i < 4; i++) {
    const choice = page.locator(".choice-option");
    if (
      await choice
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await choice
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(40);
      continue;
    }
    const selectable = page.locator(".card.selectable, .leader.selectable");
    if (
      await selectable
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await selectable
        .first()
        .click({ force: true })
        .catch(() => {});
      await page.waitForTimeout(40);
    }
    const confirm = page.locator("#targetingConfirmation button");
    if (
      await confirm
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await confirm
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(40);
      continue;
    }
    const pending = await page.evaluate(
      () => !!window.gameState?.pendingTargetEffect,
    );
    if (!pending) break;
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(40);
  }
}

async function confirmMulligans(page) {
  for (let i = 0; i < 6; i++) {
    const phase = await page.evaluate(() => window.gameState?.phase);
    if (phase !== "mulligan") return;
    if (
      await page
        .locator("#blueMulliganConfirm")
        .isVisible()
        .catch(() => false)
    ) {
      await page.locator("#blueMulliganConfirm").click();
      await page.waitForTimeout(120);
      continue;
    }
    if (
      await page
        .locator("#redMulliganConfirm")
        .isVisible()
        .catch(() => false)
    ) {
      await page.locator("#redMulliganConfirm").click();
      await page.waitForTimeout(120);
      continue;
    }
    await page.waitForTimeout(80);
  }
}

/**
 * Select decks by id (post PR #101: only rotation-legal class decks remain).
 * Returns the chosen { index, value, label } for each side so the soak log
 * can prove which decks actually ran.
 */
async function startGame(page, { blue, red, seed }) {
  let selection;
  await withSettingsDrawer(page, async () => {
    selection = await page.evaluate(
      ({ blueId, redId }) => {
        const read = (id, want) => {
          const sel = document.getElementById(id);
          const opts = [...sel.options];
          const o = opts.find((opt) => opt.value === want);
          if (!o) {
            throw new Error(
              `${id}: no option value=${want} (have ${opts.map((x) => x.value).join(",")})`,
            );
          }
          return {
            index: opts.indexOf(o),
            value: o.value,
            label: o.textContent.trim(),
          };
        };
        return {
          blue: read("blueDeckSelect", blueId),
          red: read("redDeckSelect", redId),
        };
      },
      { blueId: blue, redId: red },
    );
    await page.selectOption("#blueDeckSelect", blue);
    await page.selectOption("#redDeckSelect", red);
    await page.locator("#seedInput").fill(String(seed));
    await page.locator("#startGameBtn").click();
  });
  await page.waitForFunction(
    () =>
      window.gameState?.phase === "mulligan" ||
      window.gameState?.gameStarted === true,
    undefined,
    { timeout: 20000 },
  );
  return selection;
}

async function hoverAllCards(page) {
  const zones = ["#blueHand", "#redHand", "#blueBoard", "#redBoard"];
  for (const zone of zones) {
    const cards = page.locator(`${zone} .card`);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await cards
        .nth(i)
        .hover({ force: true })
        .catch(() => {});
      await page.waitForTimeout(5);
    }
  }
  const histItems = page.locator(".hist-item");
  const histCount = await histItems.count();
  for (let i = 0; i < Math.min(histCount, 30); i++) {
    await histItems
      .nth(i)
      .hover({ force: true })
      .catch(() => {});
    await page.waitForTimeout(5);
  }
}

async function endTurns(page, count = 3) {
  let ended = 0;
  for (let i = 0; i < count; i++) {
    await dismissOverlays(page);
    const btn = page
      .locator("#endTurnBlue:visible, #endTurnRed:visible")
      .first();
    if (!(await btn.count())) break;
    if (await btn.isDisabled().catch(() => true)) {
      await dismissOverlays(page);
    }
    if (await btn.isDisabled().catch(() => true)) break;
    await btn.click({ force: true });
    ended += 1;
    await page.waitForTimeout(120);
    await dismissOverlays(page);
  }
  return ended;
}

async function undoRedo(page) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Control+Z");
    await page.waitForTimeout(30);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Control+Y");
    await page.waitForTimeout(30);
  }
}

function printTable(rows) {
  const header =
    "| checkpoint | DOM nodes | JS event listeners | JS heap | hand(both) | blueH | redH | board | cards | phase | turn | retainBucket | tipExists | tipConnected | floatTracked | floatDom | floatTimers |";
  const sep =
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---|---:|---:|---:|";
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    const L = r.live || {};
    const bucket = L.retainBucketLen == null ? "—" : String(L.retainBucketLen);
    const tipEx = L.tipExists == null ? "?" : L.tipExists ? "yes" : "no";
    const tipConn =
      L.tipConnected == null ? "—" : L.tipConnected ? "yes" : "DETACHED";
    console.log(
      `| ${r.checkpoint} | ${r.nodes} | ${r.listeners} | ${r.heapMb} MB | ${L.handCardsBoth ?? L.handCards ?? "?"} | ${L.blueHand ?? "?"} | ${L.redHand ?? "?"} | ${L.boardCards ?? "?"} | ${L.cards ?? "?"} | ${L.phase ?? "?"} | ${L.turn ?? "?"} | ${bucket} | ${tipEx} | ${tipConn} | ${L.floatTracked ?? "?"} | ${L.floatDom ?? "?"} | ${L.floatTimers ?? "?"} |`,
    );
  }
}

/**
 * Trend judge: after forced GC, is growth linear and material across intervals?
 * Bounded one-time jumps (e.g. mid-game board filling) do not fail.
 */
export function analyzePostGcTrend(rows) {
  if (rows.length < 3) {
    return {
      pass: false,
      reason: "need at least 3 checkpoints",
      nodeDeltas: [],
      listenerDeltas: [],
    };
  }

  const nodeDeltas = [];
  const listenerDeltas = [];
  for (let i = 1; i < rows.length; i++) {
    nodeDeltas.push(rows[i].nodes - rows[i - 1].nodes);
    listenerDeltas.push(rows[i].listeners - rows[i - 1].listeners);
  }

  const growingNodeIntervals = nodeDeltas.filter(
    (d) => d > NODE_INTERVAL_THRESHOLD,
  ).length;
  const growingListenerIntervals = listenerDeltas.filter(
    (d) => d > LISTENER_INTERVAL_THRESHOLD,
  ).length;

  const totalNodeGrowth = rows[rows.length - 1].nodes - rows[0].nodes;
  const totalListenerGrowth =
    rows[rows.length - 1].listeners - rows[0].listeners;

  const nodesLeaking =
    growingNodeIntervals >= MIN_GROWING_INTERVALS &&
    totalNodeGrowth > NODE_TOTAL_THRESHOLD;
  const listenersLeaking =
    growingListenerIntervals >= MIN_GROWING_INTERVALS &&
    totalListenerGrowth > LISTENER_TOTAL_THRESHOLD;

  const pass = !nodesLeaking && !listenersLeaking;

  return {
    pass,
    nodesLeaking,
    listenersLeaking,
    nodeDeltas,
    listenerDeltas,
    totalNodeGrowth,
    totalListenerGrowth,
    growingNodeIntervals,
    growingListenerIntervals,
    thresholds: {
      NODE_INTERVAL_THRESHOLD,
      LISTENER_INTERVAL_THRESHOLD,
      NODE_TOTAL_THRESHOLD,
      LISTENER_TOTAL_THRESHOLD,
      MIN_GROWING_INTERVALS,
    },
  };
}

function assertLiveGame(label, cond, detail) {
  if (!cond) {
    const msg = `FAIL: soak is not exercising a live game (${label}): ${detail}`;
    console.error(msg);
    throw new Error(msg);
  }
}

/** Retention failure — the soak DID exercise a live game; the app leaked. */
function assertNoRetention(label, cond, detail) {
  if (!cond) {
    const msg = `FAIL: retention leak detected (${label}): ${detail}`;
    console.error(msg);
    const err = new Error(msg);
    err.isRetentionLeak = true;
    throw err;
  }
}

async function takeHeapSnapshot(cdp) {
  let chunks = "";
  const onChunk = (p) => {
    chunks += p.chunk;
  };
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", {
    reportProgress: false,
    captureNumericValue: true,
  });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  return JSON.parse(chunks);
}

/**
 * Summarise detachedness===2 nodes and sample retaining edge names.
 * Full path walking is best-effort — tagged measured where edges are counted.
 */
function summarizeDetachedRetainers(snap) {
  const meta = snap.snapshot.meta;
  const nodeFields = meta.node_fields;
  const edgeFields = meta.edge_fields;
  const nodeTypes = meta.node_types[nodeFields.indexOf("type")];
  const edgeTypes = meta.edge_types[edgeFields.indexOf("type")];
  const strings = snap.strings;
  const nodes = snap.nodes;
  const edges = snap.edges;
  const nfc = nodeFields.length;
  const efc = edgeFields.length;
  const typeI = nodeFields.indexOf("type");
  const nameI = nodeFields.indexOf("name");
  const idI = nodeFields.indexOf("id");
  const edgeCountI = nodeFields.indexOf("edge_count");
  const detI = nodeFields.indexOf("detachedness");
  const eTypeI = edgeFields.indexOf("type");
  const eNameI = edgeFields.indexOf("name_or_index");
  const eToI = edgeFields.indexOf("to_node");
  const nodeCount = nodes.length / nfc;

  const firstEdge = new Int32Array(nodeCount + 1);
  let ec = 0;
  for (let i = 0; i < nodeCount; i++) {
    firstEdge[i] = ec;
    ec += nodes[i * nfc + edgeCountI] * efc;
  }
  firstEdge[nodeCount] = ec;

  const retainers = Array.from({ length: nodeCount }, () => []);
  for (let from = 0; from < nodeCount; from++) {
    for (let e = firstEdge[from]; e < firstEdge[from + 1]; e += efc) {
      const to = edges[e + eToI] / nfc;
      if (to < 0 || to >= nodeCount) continue;
      const et = edgeTypes[edges[e + eTypeI]];
      const en = edges[e + eNameI];
      const name =
        et === "element" || et === "hidden"
          ? `[${en}]`
          : (strings[en] ?? String(en));
      retainers[to].push({ from, type: et, name });
    }
  }

  function describe(ord) {
    const b = ord * nfc;
    const typ = nodeTypes[nodes[b + typeI]];
    const name = strings[nodes[b + nameI]];
    const id = nodes[b + idI];
    const det = detI >= 0 ? nodes[b + detI] : 0;
    const short =
      typeof name === "string" && name.length > 80
        ? `${name.slice(0, 77)}...`
        : name;
    return `${typ}:${short}#${id}${det === 2 ? "(DET)" : ""}`;
  }

  const detNameCounts = new Map();
  const detDivOrds = [];
  let det2 = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (detI < 0 || nodes[i * nfc + detI] !== 2) continue;
    det2 += 1;
    const name = strings[nodes[i * nfc + nameI]];
    const key =
      typeof name === "string" && name.startsWith("<div")
        ? "HTMLDivElement(html)"
        : name;
    detNameCounts.set(key, (detNameCounts.get(key) || 0) + 1);
    if (
      name === "HTMLDivElement" ||
      (typeof name === "string" && name.startsWith("<div"))
    ) {
      detDivOrds.push(i);
    }
  }

  function isDetachedOrd(ord) {
    return detI >= 0 && nodes[ord * nfc + detI] === 2;
  }

  /** Native DOM wrappers / internal nodes are self-edges of the element — walk past them. */
  function isNativeDomWrapperName(name) {
    if (typeof name !== "string") return false;
    return (
      name === "DOMStringMap" ||
      name === "DOMTokenList" ||
      name === "NamedNodeMap" ||
      name === "CSSStyleDeclaration" ||
      name === "HTMLCollection" ||
      name === "NodeList" ||
      name === "InternalNode" ||
      name.startsWith("InternalNode") ||
      name === "Detached InternalNode" ||
      name === "system / Document" ||
      name === "system / Node"
    );
  }

  function isDevToolsNoiseName(name) {
    if (typeof name !== "string") return false;
    return (
      name.includes("DevTools") ||
      name.includes("devtools") ||
      name === "(Global handles)" ||
      name.includes("Global handles") ||
      name.includes("V8EventListener") ||
      name.includes("Inspector")
    );
  }

  function isGcRootName(name) {
    if (typeof name !== "string") return false;
    return (
      name === "Window" ||
      name === "(GC roots)" ||
      name.startsWith("Window /") ||
      name.startsWith("Window [") ||
      name.startsWith("Window / ") ||
      name.includes("JSGlobalObject")
    );
  }

  /**
   * Lower is better. Prefer edges that ESCAPE the detached island toward a
   * named JS root (Window property / Array / Map / Set / closure context),
   * walking PAST native DOM wrappers (DOMStringMap / DOMTokenList / InternalNode)
   * and preferring real app edges over DevTools Global-handle noise.
   */
  function edgeScore(r) {
    if (r.type === "weak") return 1000;
    const fromDet = isDetachedOrd(r.from);
    const islandPenalty = fromDet ? 200 : 0;
    const fromName = strings[nodes[r.from * nfc + nameI]];
    const fromType = nodeTypes[nodes[r.from * nfc + typeI]];
    const edgeName = String(r.name || "");

    // Strong preference for known app / injector roots by property name.
    if (
      r.type === "property" &&
      (/__leakRetain/i.test(edgeName) ||
        edgeName === "activeSession" ||
        edgeName === "activeByTarget" ||
        edgeName === "refs" ||
        edgeName === "__leakWeakProbe")
    ) {
      return islandPenalty + (isGcRootName(fromName) ? 0 : 1);
    }

    if (isDevToolsNoiseName(fromName) || isDevToolsNoiseName(edgeName)) {
      return islandPenalty + 500;
    }
    if (isNativeDomWrapperName(fromName)) {
      return islandPenalty + 400;
    }

    if (r.type === "property") {
      if (isGcRootName(fromName)) return islandPenalty + 0;
      if (
        fromName === "Array" ||
        fromName === "Object" ||
        fromName === "system / Map" ||
        fromName === "system / Set" ||
        fromName === "(GC roots)"
      )
        return islandPenalty + 1;
      if (fromType === "closure") return islandPenalty + 2;
      if (fromType === "object") return islandPenalty + 3;
      return islandPenalty + 5;
    }
    if (r.type === "context") {
      // Closure context — often the real retainer past the element.
      return islandPenalty + (fromType === "closure" ? 8 : 20);
    }
    if (r.type === "element" || r.type === "shortcut") {
      return islandPenalty + (fromDet ? 80 : 15);
    }
    if (r.type === "internal") {
      // Prefer skipping DevTools "internal: N / DevTools console" edges.
      if (/devtools/i.test(edgeName) || /console/i.test(edgeName)) {
        return islandPenalty + 480;
      }
      return islandPenalty + 30;
    }
    return islandPenalty + 50;
  }

  function walkRetainerPath(startOrd, maxDepth = 24) {
    const path = [];
    let cur = startOrd;
    const seen = new Set();
    for (let d = 0; d < maxDepth; d++) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const curName = strings[nodes[cur * nfc + nameI]];
      const cand = (retainers[cur] || []).filter(
        (r) => !seen.has(r.from) && r.type !== "weak",
      );
      if (!cand.length) {
        // Do not terminate on native wrappers — report as unresolved wrapper.
        if (isNativeDomWrapperName(curName)) {
          path.push({
            root: describe(cur),
            unresolvedNativeWrapper: true,
          });
        } else {
          path.push({ root: describe(cur) });
        }
        break;
      }
      cand.sort((a, b) => edgeScore(a) - edgeScore(b));
      // Prefer non-wrapper / non-devtools parents when scores tie-ish.
      let pick = cand[0];
      for (const c of cand.slice(0, 8)) {
        const fn = strings[nodes[c.from * nfc + nameI]];
        if (isNativeDomWrapperName(fn) || isDevToolsNoiseName(fn)) continue;
        if (edgeScore(c) <= edgeScore(pick) + 50) {
          pick = c;
          break;
        }
      }
      path.push({
        node: describe(cur),
        via: `${pick.type}:${pick.name}`,
        from: describe(pick.from),
        fromDetached: isDetachedOrd(pick.from),
        fromNativeWrapper: isNativeDomWrapperName(
          strings[nodes[pick.from * nfc + nameI]],
        ),
      });
      cur = pick.from;
      const fromName = strings[nodes[cur * nfc + nameI]];
      // Keep walking through native wrappers even if they look "root-like".
      if (isNativeDomWrapperName(fromName)) continue;
      if (isGcRootName(fromName)) break;
      // Meaningful Window property reached (e.g. Array <--property:__leakRetainBucket-- Window)
      // already broken via isGcRootName when we step onto Window.
    }
    return path;
  }

  const edgeAgg = new Map();
  const fromAgg = new Map();
  for (const ord of detDivOrds) {
    for (const r of retainers[ord] || []) {
      if (r.type === "weak") continue; // weak edges do not keep objects alive
      const ek = `${r.type}:${r.name}`;
      edgeAgg.set(ek, (edgeAgg.get(ek) || 0) + 1);
      const fn = strings[nodes[r.from * nfc + nameI]];
      const fk =
        typeof fn === "string" && fn.length > 60 ? `${fn.slice(0, 57)}...` : fn;
      fromAgg.set(fk, (fromAgg.get(fk) || 0) + 1);
    }
  }

  function normalizeDescribe(s) {
    return String(s)
      .replace(/#\d+/g, "#ID")
      .replace(/uid_[a-zA-Z0-9_-]+/g, "uid_*")
      .replace(/0x[0-9a-fA-F]+/g, "0x*")
      .replace(/element:\[\d+\]/g, "element:[*]")
      .replace(/id="[^"]+"/g, 'id="*"')
      .replace(/\s+/g, " ");
  }
  function pathShape(path) {
    return path
      .map((step) => {
        if (step.root) return `ROOT:${normalizeDescribe(step.root)}`;
        const via = String(step.via || "").replace(
          /element:\[\d+\]/g,
          "element:[*]",
        );
        return `${normalizeDescribe(step.node)} --${via}--> ${normalizeDescribe(step.from)}`;
      })
      .join(" | ");
  }
  function rootTip(path) {
    if (!path.length) return "(empty)";
    const last = path[path.length - 1];
    if (last.root) return normalizeDescribe(last.root);
    return normalizeDescribe(last.from || "?");
  }

  // Prefer WeakRef-survivor-marked cards, then any card root, then divs.
  const survivorOrds = [];
  const cardLikeOrds = [];
  for (const ord of detDivOrds) {
    const name = strings[nodes[ord * nfc + nameI]];
    if (typeof name !== "string") continue;
    const isCard =
      name.includes("data-uid") ||
      name.includes('class="card') ||
      name.includes('class=\\"card');
    const isSurvivor =
      name.includes("data-leak-survivor") ||
      name.includes('data-leak-survivor="1"');
    if (isSurvivor) survivorOrds.push(ord);
    else if (isCard) cardLikeOrds.push(ord);
  }
  const walkOrds = survivorOrds.length
    ? survivorOrds
    : cardLikeOrds.length
      ? cardLikeOrds
      : detDivOrds;

  const samples = [];
  for (const ord of walkOrds.slice(0, 8)) {
    const path = walkRetainerPath(ord);
    samples.push({
      node: describe(ord),
      retainerCount: (retainers[ord] || []).filter((r) => r.type !== "weak")
        .length,
      immediateRetainers: (retainers[ord] || [])
        .filter((r) => r.type !== "weak")
        .map((r) => ({
          via: `${r.type}:${r.name}`,
          from: describe(r.from),
          fromDetached: isDetachedOrd(r.from),
          score: edgeScore(r),
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 12),
      path,
      rootTip: rootTip(path),
    });
  }

  const shapeAgg = new Map();
  const shapeExamples = new Map();
  const tipAgg = new Map();
  const sampleLimit = Math.min(walkOrds.length, 200);
  for (const ord of walkOrds.slice(0, sampleLimit)) {
    const path = walkRetainerPath(ord);
    const shape = pathShape(path);
    shapeAgg.set(shape, (shapeAgg.get(shape) || 0) + 1);
    if (!shapeExamples.has(shape)) shapeExamples.set(shape, path);
    const tip = rootTip(path);
    tipAgg.set(tip, (tipAgg.get(tip) || 0) + 1);
  }
  const topPathShapes = [...shapeAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([shape, count]) => ({
      count,
      shape,
      examplePath: shapeExamples.get(shape),
    }));
  const topRootTips = [...tipAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tip, count]) => ({ count, tip }));

  return {
    detachedness2Count: det2,
    detachedDivLike: detDivOrds.length,
    walkedNodeCount: sampleLimit,
    survivorMarkedInSnap: survivorOrds.length,
    cardLikeInSnap: cardLikeOrds.length,
    topDetachedNames: [...detNameCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    topRetainingEdges: [...edgeAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    topRetainingFromNames: [...fromAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    topPathShapes,
    topRootTips,
    samples,
  };
}

async function markWeakRefSurvivors(page) {
  return page.evaluate(() => {
    const p = window.__leakWeakProbe;
    if (!p) return { marked: 0 };
    let marked = 0;
    for (const ref of p.refs) {
      try {
        const el = ref.deref();
        if (!el || !el.dataset) continue;
        el.dataset.leakSurvivor = "1";
        marked += 1;
      } catch {
        /* ignore */
      }
    }
    return { marked };
  });
}

/**
 * Sample DOMDebugger event-listener locations on WeakRef survivors (detached
 * nodes are not queryable via document — walk the probe WeakRefs via CDP).
 */
async function sampleSurvivorListenerLocations(cdp, page, limit = 24) {
  try {
    await cdp.send("Runtime.enable");
    await cdp.send("Debugger.enable");
  } catch {
    /* ignore */
  }

  const scriptUrls =
    cdp._leakScriptUrls instanceof Map ? cdp._leakScriptUrls : new Map();
  const onParsed = (p) => {
    if (p.scriptId) scriptUrls.set(p.scriptId, p.url || "(unknown)");
  };
  cdp.on("Debugger.scriptParsed", onParsed);

  const evalResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const p = window.__leakWeakProbe;
      if (!p) return null;
      const els = [];
      for (const ref of p.refs) {
        try {
          const el = ref.deref();
          if (el) els.push(el);
        } catch {}
        if (els.length >= ${limit}) break;
      }
      return els;
    })()`,
    returnByValue: false,
  });

  const arrayId = evalResult?.result?.objectId;
  if (!arrayId) {
    cdp.off("Debugger.scriptParsed", onParsed);
    return { sampled: 0, topLocations: [], samples: [] };
  }

  const props = await cdp.send("Runtime.getProperties", {
    objectId: arrayId,
    ownProperties: true,
  });
  const locCounts = new Map();
  const samples = [];
  let sampled = 0;

  for (const prop of props.result || []) {
    if (!/^\d+$/.test(prop.name) || !prop.value?.objectId) continue;
    sampled += 1;
    let listeners = [];
    try {
      const res = await cdp.send("DOMDebugger.getEventListeners", {
        objectId: prop.value.objectId,
      });
      listeners = res.listeners || [];
    } catch {
      continue;
    }
    for (const L of listeners) {
      const url = scriptUrls.get(L.scriptId) || `(scriptId:${L.scriptId})`;
      const key = `${L.type} @ ${url}:${(L.lineNumber ?? 0) + 1}:${(L.columnNumber ?? 0) + 1}`;
      locCounts.set(key, (locCounts.get(key) || 0) + 1);
      if (samples.length < 40) {
        samples.push({
          type: L.type,
          url,
          line: (L.lineNumber ?? 0) + 1,
          column: (L.columnNumber ?? 0) + 1,
          once: !!L.once,
          passive: !!L.passive,
        });
      }
    }
  }

  cdp.off("Debugger.scriptParsed", onParsed);

  const topLocations = [...locCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([loc, count]) => ({ count, loc }));

  return {
    sampled,
    listenerSampleCount: samples.length,
    topLocations,
    samples,
  };
}

/** Best-effort map from Vite build URL + line to a src/ file guess. */
function hintSrcFromListenerLoc(loc) {
  const s = String(loc);
  if (s.includes("dragClickGuard") || s.includes("zones/handlers")) {
    return "src/ui/zones/handlers.ts / dragClickGuard.ts";
  }
  if (s.includes("floatingCombatText")) return "src/ui/floatingCombatText.ts";
  if (s.includes("tooltips")) return "src/ui/tooltips.ts";
  if (s.includes("/assets/") && s.includes(".js:")) {
    return "bundled asset — use source map / listener type + retainer path";
  }
  return null;
}

/**
 * On retention failure: mark WeakRef survivors, sample listener locations,
 * force GC again, snapshot, and print dominant detached retaining-path shapes.
 */
async function dumpRetentionEvidence(
  cdp,
  page,
  { rows, probe, cycle, reason },
) {
  console.log("\n=== Phase 1 retainer dump (" + reason + ") ===");
  const knownRoots = await auditKnownDomRoots(page);
  console.log("Known DOM roots audit:", JSON.stringify(knownRoots, null, 2));
  if (knownRoots.retainBucketLen != null && knownRoots.retainBucketLen > 0) {
    console.log(
      `NOTE: window.__leakRetainBucket length=${knownRoots.retainBucketLen} — LISTENER_LEAK_RETAIN injector is retaining replaced nodes (self-test only).`,
    );
  }
  if (knownRoots.windowElementArrayProps?.length) {
    console.log(
      "Window props holding Elements:",
      JSON.stringify(knownRoots.windowElementArrayProps, null, 2),
    );
  }

  const marked = await markWeakRefSurvivors(page);
  console.log("Marked WeakRef survivors:", marked);

  const listenerLocs = await sampleSurvivorListenerLocations(cdp, page);
  console.log(
    "Survivor listener locations (CDP DOMDebugger):",
    JSON.stringify(
      listenerLocs.topLocations?.slice?.(0, 15) ?? listenerLocs,
      null,
      2,
    ),
  );

  await forceGc(cdp, page);
  const snap = await takeHeapSnapshot(cdp);
  const summary = summarizeDetachedRetainers(snap);
  const outPath = join(
    OUT_DIR,
    `retention-${reason}-c${cycle}-${Date.now()}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      { reason, cycle, probe, rows, knownRoots, listenerLocs, summary },
      null,
      2,
    ),
  );
  console.log(`Wrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        detachedness2Count: summary.detachedness2Count,
        detachedDivLike: summary.detachedDivLike,
        survivorMarkedInSnap: summary.survivorMarkedInSnap,
        cardLikeInSnap: summary.cardLikeInSnap,
        walkedNodeCount: summary.walkedNodeCount,
        topRootTips: summary.topRootTips,
        topDetachedNames: summary.topDetachedNames?.slice?.(0, 10),
        topRetainingEdges: summary.topRetainingEdges?.slice?.(0, 10),
        topRetainingFromNames: summary.topRetainingFromNames?.slice?.(0, 10),
        topPathShapes: summary.topPathShapes,
        sample0: summary.samples?.[0],
        sample1: summary.samples?.[1],
      },
      null,
      2,
    ),
  );

  console.log("\nRetainer shape attribution hints:");
  for (const s of summary.topPathShapes || []) {
    let tag = "could-not-determine";
    const sh = s.shape || "";
    if (sh.includes("__leakRetainBucket") || sh.includes("__leakRetain")) {
      tag = "measured: LISTENER_LEAK_RETAIN injector (self-test only)";
    } else if (sh.includes("activeSession")) {
      tag = "measured: tooltips.ts activeSession";
    } else if (
      sh.includes("activeByTarget") ||
      (sh.includes("system / Map") && sh.includes("floating"))
    ) {
      tag = "read-candidate: floatingCombatText.ts activeByTarget Map";
    } else if (
      /DOMStringMap|DOMTokenList|InternalNode|NamedNodeMap|CSSStyleDeclaration/.test(
        sh,
      )
    ) {
      tag =
        "native-wrapper-self-edge (walker should have skipped — treat as unresolved)";
    } else if (sh.includes("(Global handles)") || /DevTools/i.test(sh)) {
      tag = "devtools/global-handle noise (not an app retainer)";
    } else if (sh.includes("system / Map") || sh.includes("system / Set")) {
      tag = "measured: Map/Set GC root — resolve property name on path";
    } else if (sh.includes("EventListener") || sh.includes("V8EventListener")) {
      tag = "measured: EventListener retaining detached EventTarget";
    } else if (sh.includes("__leakWeakProbe") || sh.includes("WeakRef")) {
      tag = "instrument: WeakRef probe itself (ignore)";
    }
    console.log(`  [${s.count}x] ${tag}`);
    console.log(`       ${sh.slice(0, 320)}`);
  }
  if (summary.topRootTips?.length) {
    console.log("\nTop root tips:");
    for (const t of summary.topRootTips.slice(0, 10)) {
      console.log(`  [${t.count}x] ${t.tip}`);
    }
  }
  if (listenerLocs.topLocations?.length) {
    console.log("\nListener location → src hint:");
    for (const L of listenerLocs.topLocations.slice(0, 12)) {
      const hint = hintSrcFromListenerLoc(L.loc);
      console.log(`  [${L.count}x] ${L.loc}`);
      if (hint) console.log(`       → ${hint}`);
    }
  }
}

/**
 * How LISTENER_LEAK_IMAGES=fail breaks remote images.
 *   hang   — never respond (DEFAULT). Matches sandbox that drops CDN packets.
 *            Pre-PR-#103: start ~1478/328 → ~24× growth over 20 cycles.
 *            Post-fix (cancel pending ImageLoaders on detach): flat ~1,263.
 *   abort  — Playwright route.abort (clean failure — does NOT reproduce the leak)
 *   block  — CDP Network.setBlockedURLs (also clean — does NOT reproduce)
 *   404    — fulfill HTTP 404 (clean — does NOT reproduce)
 *   block+abort — CDP block + route abort (clean — does NOT reproduce)
 *
 * Empirically only pending/hung loads reproduce the owner-reported retention.
 * Keep hang as the default fail-style; an abort-based gate would false-pass.
 */
const IMAGE_FAIL_STYLE = (() => {
  const raw = String(
    process.env.LISTENER_LEAK_IMAGES_FAIL_STYLE || "hang",
  ).toLowerCase();
  if (["abort", "block", "hang", "404", "block+abort"].includes(raw))
    return raw;
  console.warn(
    `LISTENER_LEAK_IMAGES_FAIL_STYLE=${raw} not recognized — using hang`,
  );
  return "hang";
})();

/**
 * Pin the remote-image regime so soak results do not depend on whether the
 * runner can reach static.dotgg.gg (the confound that split agent vs reporter).
 *
 * fulfil — every remote image response is a 1×1 PNG (deterministic healthy).
 * fail   — break remote image requests (reproduces post-GC retention on main).
 * passthrough — real network (debug only; not for CI).
 *
 * Local app assets (same-origin) are never intercepted.
 */
async function installImageRegime(page, cdp, { mode, appOrigin }) {
  const stats = {
    mode,
    failStyle: mode === "fail" ? IMAGE_FAIL_STYLE : null,
    intercepted: 0,
    fulfilled: 0,
    aborted: 0,
    continued: 0,
    blockedUrls: false,
  };
  if (mode === "passthrough") {
    return stats;
  }

  const useBlock =
    mode === "fail" &&
    (IMAGE_FAIL_STYLE === "block" || IMAGE_FAIL_STYLE === "block+abort");
  const useRoute =
    mode === "fulfil" ||
    (mode === "fail" &&
      (IMAGE_FAIL_STYLE === "abort" ||
        IMAGE_FAIL_STYLE === "hang" ||
        IMAGE_FAIL_STYLE === "404" ||
        IMAGE_FAIL_STYLE === "block+abort"));

  if (useBlock && cdp) {
    await cdp.send("Network.enable").catch(() => {});
    await cdp.send("Network.setBlockedURLs", {
      urls: [
        "*static.dotgg.gg*",
        "*://static.dotgg.gg/*",
        "https://static.dotgg.gg/*",
      ],
    });
    stats.blockedUrls = true;
  }

  if (useRoute) {
    await page.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      const type = req.resourceType();
      const isImage =
        type === "image" || /\.(webp|png|jpe?g|gif|svg)(\?|#|$)/i.test(url);
      if (!isImage) {
        return route.continue();
      }
      // Same-origin / local static server — leave alone.
      if (
        url.startsWith(appOrigin) ||
        url.startsWith("http://127.0.0.1") ||
        url.startsWith("http://localhost") ||
        url.startsWith("data:") ||
        url.startsWith("blob:")
      ) {
        stats.continued += 1;
        return route.continue();
      }

      stats.intercepted += 1;
      if (mode === "fail") {
        if (IMAGE_FAIL_STYLE === "hang") {
          // Never settle — pending image load (do not continue/abort/fulfill).
          return;
        }
        if (IMAGE_FAIL_STYLE === "404") {
          stats.aborted += 1;
          return route.fulfill({
            status: 404,
            contentType: "text/plain",
            body: "listener-leak-harness: image fail regime",
          });
        }
        // abort or block+abort
        stats.aborted += 1;
        return route.abort("connectionfailed");
      }
      // fulfil
      stats.fulfilled += 1;
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: PNG_1X1,
      });
    });
  }

  return stats;
}

async function runHarness() {
  if (!existsSync(join(BUILD, "index.html"))) {
    console.error("Missing build/ — run npm run build first");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const server = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  if (INJECT_RETAIN) {
    await page.addInitScript(() => {
      window.__leakRetainBucket = [];
      const origReplace = Element.prototype.replaceChild;
      Element.prototype.replaceChild = function replaceChildLeak(
        newNode,
        oldNode,
      ) {
        try {
          window.__leakRetainBucket.push(oldNode);
        } catch {
          /* ignore */
        }
        return origReplace.call(this, newNode, oldNode);
      };
      const origRemove = Element.prototype.removeChild;
      Element.prototype.removeChild = function removeChildLeak(child) {
        try {
          window.__leakRetainBucket.push(child);
        } catch {
          /* ignore */
        }
        return origRemove.call(this, child);
      };
    });
  }

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  // collectGarbage needs HeapProfiler.enable; takeHeapSnapshot is separate.
  // Debugger.enable can surface DevTools/global-handle retainers — skip when
  // LISTENER_LEAK_SNAPSHOT=0 (confound check).
  await cdp.send("HeapProfiler.enable");
  cdp._leakScriptUrls = new Map();
  if (ENABLE_SNAPSHOT) {
    await cdp.send("Debugger.enable").catch(() => {});
    cdp.on("Debugger.scriptParsed", (p) => {
      if (p.scriptId) cdp._leakScriptUrls.set(p.scriptId, p.url || "(unknown)");
    });
  } else {
    console.log("Debugger.enable skipped (LISTENER_LEAK_SNAPSHOT=0)");
  }

  const rows = [];
  let liveStart = null;
  let turnAtStart = null;

  try {
    if (ENABLE_LISTENER_ATTR) {
      await installListenerAttribution(page);
      console.log(
        "Listener attribution: ON (addEventListener + IDL on* setters; LISTENER_LEAK_ATTR=1)",
      );
    }

    const appOrigin = `http://127.0.0.1:${PORT}`;
    const imageStats = await installImageRegime(page, cdp, {
      mode: IMAGE_MODE,
      appOrigin,
    });
    console.log(
      `Image regime: ${IMAGE_MODE}` +
        (IMAGE_MODE === "fail"
          ? ` (remote images BROKEN via ${IMAGE_FAIL_STYLE} — expect PASS on fixed main; FAIL if cancel-on-detach regresses)`
          : IMAGE_MODE === "fulfil"
            ? " (remote images → 1×1 PNG — CDN-independent healthy curve)"
            : " (passthrough — runner network dependent)"),
    );

    await page.goto(`${appOrigin}/?test=1`, {
      waitUntil:
        IMAGE_MODE === "fail" && IMAGE_FAIL_STYLE === "hang"
          ? "domcontentloaded"
          : "networkidle",
    });
    await page.waitForFunction(() => !!window.__svwbTest);

    // WeakRef probe (independent of INJECT_RETAIN). PROBE=0 → metrics-only confound check.
    if (ENABLE_PROBE) {
      await installWeakRefProbe(page);
      console.log(
        "WeakRef probe: ON (refs[] holds WeakRef(node) only — not Element handles)",
      );
    } else {
      console.log(
        "WeakRef probe: OFF (LISTENER_LEAK_PROBE=0) — metrics-only mode",
      );
    }
    console.log(
      `Heap snapshots: ${ENABLE_SNAPSHOT ? "ON (may dump at end/on fail)" : "OFF (LISTENER_LEAK_SNAPSHOT=0)"}`,
    );

    await forceGc(cdp, page);
    const preStart = {
      checkpoint: "pre-start + GC",
      ...(await sampleMetrics(cdp)),
      live: await readLiveState(page),
    };
    console.log("Live pre-start:", preStart.live, preStart);

    const deckSelection = await startGame(page, {
      blue: BLUE_DECK,
      red: RED_DECK,
      seed: SEED,
    });
    console.log("Decks selected:", JSON.stringify(deckSelection));
    await confirmMulligans(page);
    await page.waitForFunction(
      () => window.gameState?.phase === "main",
      undefined,
      { timeout: 15000 },
    );

    await page
      .locator("#historyToggle")
      .click()
      .catch(() => {});
    await page.waitForTimeout(100);

    await forceGc(cdp, page);
    liveStart = await readLiveState(page);
    turnAtStart = liveStart.turn;
    rows.push({
      checkpoint: "after start + GC",
      ...(await sampleMetrics(cdp)),
      live: liveStart,
    });
    console.log("Live after start:", liveStart, rows[0]);
    console.log(
      `auditLeakRoots @ start: tipExists=${liveStart.tipExists} tipConnected=${liveStart.tipConnected} tipUid=${liveStart.tipUid} floatTracked=${liveStart.floatTracked} floatDom=${liveStart.floatDom} floatTimers=${liveStart.floatTimers} retainBucket=${liveStart.retainBucketLen}`,
    );
    if (ENABLE_LISTENER_ATTR) {
      const attrStart = await readListenerAttribution(page);
      if (attrStart) {
        console.log(`listenerAttr @ start: totalInstalls=${attrStart.total}`);
        console.log("listenerAttr byType:", JSON.stringify(attrStart.byType));
        console.log(
          "listenerAttr topSites:",
          JSON.stringify(attrStart.topSites.slice(0, 15), null, 2),
        );
      }
    }

    const startupNodeDelta = rows[0].nodes - preStart.nodes;
    const startupListenerDelta = rows[0].listeners - preStart.listeners;
    console.log(
      `Startup deltas (info): nodes +${startupNodeDelta}, listeners +${startupListenerDelta} (not a fail threshold; full hands add hundreds)`,
    );
    if (INJECT_RETAIN) {
      console.log(
        `LISTENER_LEAK_RETAIN=1: retainBucketLen=${liveStart.retainBucketLen} — expect elevated start baseline (~1478 nodes / ~328 listeners) and linear growth (self-test).`,
      );
    } else if (
      liveStart.retainBucketLen != null &&
      liveStart.retainBucketLen > 0
    ) {
      throw new Error(
        `FAIL: soak is not exercising a live game (retain-injector-active-without-flag): retainBucketLen=${liveStart.retainBucketLen} but LISTENER_LEAK_RETAIN!=1 — aborting to avoid false retention signal`,
      );
    }

    // --- Live-game assertions (false-negative guard) ---
    assertLiveGame(
      "phase",
      liveStart.phase === "main",
      `phase=${liveStart.phase}`,
    );
    assertLiveGame(
      "gameStarted",
      liveStart.gameStarted === true,
      `gameStarted=${liveStart.gameStarted}`,
    );
    assertLiveGame(
      "cards-rendered",
      liveStart.cards >= MIN_CARDS_AT_START,
      `cards=${liveStart.cards}`,
    );
    assertLiveGame(
      "startup-node-delta-min",
      startupNodeDelta >= MIN_STARTUP_NODE_DELTA,
      `preStart.nodes=${preStart.nodes} start.nodes=${rows[0].nodes} delta=${startupNodeDelta}`,
    );

    let totalEnded = 0;
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      totalEnded += await endTurns(page, 3);
      await hoverAllCards(page);
      await undoRedo(page);

      // Sample audit BEFORE forceGc mouse-away — a tooltip session holding a
      // detached anchor only shows up while the pointer still implies hover.
      if (cycle % SAMPLE_EVERY === 0 || cycle === CYCLES || cycle === 1) {
        const preGcAudit = await readLiveState(page);
        console.log(
          `auditLeakRoots @ cycle ${cycle} pre-GC: tipExists=${preGcAudit.tipExists} tipConnected=${preGcAudit.tipConnected} tipUid=${preGcAudit.tipUid} floatTracked=${preGcAudit.floatTracked} floatDom=${preGcAudit.floatDom} floatTimers=${preGcAudit.floatTimers}`,
        );
        if (preGcAudit.tipExists && preGcAudit.tipConnected === false) {
          console.log(
            `SIGNAL: tooltip session exists with DETACHED anchor at cycle ${cycle} (uid=${preGcAudit.tipUid})`,
          );
        }
      }

      if (cycle === 1) {
        const liveAfter1 = await readLiveState(page);
        const probeAfter1 = ENABLE_PROBE
          ? await readWeakRefProbe(page)
          : { replaces: 0, removes: 0, tracked: 0, alive: 0 };
        assertLiveGame(
          "turn-progress-or-ends",
          totalEnded > 0 ||
            (liveAfter1.turn != null &&
              turnAtStart != null &&
              liveAfter1.turn !== turnAtStart) ||
            liveAfter1.cards >= MIN_CARDS_AT_START,
          `ended=${totalEnded} turn ${turnAtStart}→${liveAfter1.turn} cards=${liveAfter1.cards}`,
        );
        assertLiveGame(
          "still-main-or-gameover",
          liveAfter1.phase === "main" || liveAfter1.phase === "gameover",
          `phase=${liveAfter1.phase}`,
        );
        if (ENABLE_PROBE) {
          assertLiveGame(
            "dom-churn-happened",
            probeAfter1.replaces + probeAfter1.removes > 0,
            `replaces=${probeAfter1.replaces} removes=${probeAfter1.removes}`,
          );
        } else {
          console.log(
            "dom-churn assert skipped (probe off); live turn/card progress already checked",
          );
        }
      }

      if (cycle % SAMPLE_EVERY === 0 || cycle === CYCLES) {
        await forceGc(cdp, page);
        const live = await readLiveState(page);
        const probe = ENABLE_PROBE
          ? await readWeakRefProbe(page)
          : { replaces: 0, removes: 0, tracked: 0, alive: 0 };
        rows.push({
          checkpoint: `after ${cycle} cycles + GC`,
          ...(await sampleMetrics(cdp)),
          live,
          weakRef: ENABLE_PROBE ? probe : undefined,
        });
        console.log(
          `Live after ${cycle}:`,
          live,
          rows[rows.length - 1],
          ENABLE_PROBE ? "weakRef" : "weakRef:off",
          ENABLE_PROBE ? probe : "(disabled)",
        );
        console.log(
          `auditLeakRoots @ cycle ${cycle}: tipExists=${live.tipExists} tipConnected=${live.tipConnected} tipUid=${live.tipUid} floatTracked=${live.floatTracked} floatDom=${live.floatDom} floatTimers=${live.floatTimers} retainBucket=${live.retainBucketLen}`,
        );
        if (ENABLE_LISTENER_ATTR) {
          const attr = await readListenerAttribution(page);
          if (attr) {
            console.log(
              `listenerAttr @ cycle ${cycle}: totalInstalls=${attr.total}`,
            );
            console.log("listenerAttr byType:", JSON.stringify(attr.byType));
            console.log(
              "listenerAttr topSites:",
              JSON.stringify(attr.topSites.slice(0, 15), null, 2),
            );
          }
        }

        if (
          ENABLE_PROBE &&
          !INJECT_RETAIN &&
          probe.alive > MAX_ALIVE_WEAKREFS
        ) {
          // Retention signal. With SNAPSHOT=0, log and CONTINUE so the full
          // metrics curve can be compared against probe-off (confound check).
          // Mid-soak heap dumps can themselves pin objects via DevTools handles.
          if (!ENABLE_SNAPSHOT) {
            console.warn(
              `WARN: WeakRef survivors at cycle ${cycle}: alive=${probe.alive} tracked=${probe.tracked} replaces=${probe.replaces} (continuing — LISTENER_LEAK_SNAPSHOT=0; no mid-soak dump)`,
            );
          } else {
            console.error(
              `FAIL: retention leak detected (weakref-survivors-cycle-${cycle}): alive=${probe.alive} tracked=${probe.tracked} replaces=${probe.replaces} (replaced nodes surviving GC)`,
            );
            await dumpRetentionEvidence(cdp, page, {
              rows,
              probe,
              cycle,
              reason: "weakref-survivors",
            });
            process.exitCode = 1;
            return;
          }
        }
      }
    }

    console.log("=== DOM / listener retention harness ===");
    console.log(
      `Seed: ${SEED}  Cycles: ${CYCLES}  Sample every: ${SAMPLE_EVERY}  InjectRetain: ${INJECT_RETAIN}  Decks: ${BLUE_DECK}/${RED_DECK}  Probe: ${ENABLE_PROBE ? "on" : "off"}  Snapshot: ${ENABLE_SNAPSHOT ? "on" : "off"}  Images: ${IMAGE_MODE}`,
    );
    console.log(
      `Decks: blue=${deckSelection.blue.value} (${deckSelection.blue.label}) red=${deckSelection.red.value} (${deckSelection.red.label})`,
    );
    console.log(
      `Chrome: ${CHROME}  Ended turns: ${totalEnded}  Start cards: ${liveStart.cards} hand(both)=${liveStart.handCardsBoth ?? liveStart.handCards} blueH=${liveStart.blueHand} redH=${liveStart.redHand} board=${liveStart.boardCards}`,
    );
    printTable(rows);
    console.log(
      `Image intercept stats: mode=${imageStats.mode} failStyle=${imageStats.failStyle} blockedUrls=${imageStats.blockedUrls} intercepted=${imageStats.intercepted} fulfilled=${imageStats.fulfilled} aborted=${imageStats.aborted} continuedLocal=${imageStats.continued}`,
    );

    const analysis = analyzePostGcTrend(rows);
    console.log("");
    console.log("Analysis:");
    console.log(JSON.stringify(analysis, null, 2));

    if (
      ENABLE_SNAPSHOT &&
      (DUMP_SNAPSHOT || analysis.nodesLeaking || analysis.listenersLeaking)
    ) {
      console.log("\nTaking heap snapshot for detached retainer summary...");
      const snap = await takeHeapSnapshot(cdp);
      const summary = summarizeDetachedRetainers(snap);
      const outPath = join(OUT_DIR, `detached-summary-${Date.now()}.json`);
      writeFileSync(
        outPath,
        JSON.stringify({ rows, analysis, summary }, null, 2),
      );
      console.log(`Wrote ${outPath}`);
      console.log(
        JSON.stringify(
          {
            detachedness2Count: summary.detachedness2Count,
            detachedDivLike: summary.detachedDivLike,
            topDetachedNames: summary.topDetachedNames,
            topRetainingEdges: summary.topRetainingEdges,
            topRetainingFromNames: summary.topRetainingFromNames,
            sample0: summary.samples[0],
            sample1: summary.samples[1],
          },
          null,
          2,
        ),
      );
    }

    if (!analysis.pass) {
      if (analysis.reason === "need at least 3 checkpoints") {
        console.error(
          `FAIL: ${analysis.reason} (got ${rows.length}; raise LISTENER_LEAK_CYCLES or lower LISTENER_LEAK_SAMPLE_EVERY)`,
        );
      } else {
        console.error(
          "FAIL: retention leak detected (post-GC linear growth): nodesLeaking=" +
            analysis.nodesLeaking +
            " listenersLeaking=" +
            analysis.listenersLeaking,
        );
        if (ENABLE_SNAPSHOT) {
          await dumpRetentionEvidence(cdp, page, {
            rows,
            probe: ENABLE_PROBE
              ? await readWeakRefProbe(page)
              : { replaces: 0, removes: 0, tracked: 0, alive: 0 },
            cycle: CYCLES,
            reason: "trend-linear-growth",
          });
        } else {
          console.log(
            "(Skipping retainer dump — LISTENER_LEAK_SNAPSHOT=0; metrics table above is the confound check.)",
          );
        }
      }
      process.exitCode = 1;
      return;
    }
    console.log(
      "PASS: post-GC node/listener trend is flat (within thresholds); live-game checks passed",
    );
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

runHarness().catch((err) => {
  console.error(err);
  process.exit(1);
});
