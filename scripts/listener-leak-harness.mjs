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
 * Usage:
 *   npm run build && npx tsx scripts/listener-leak-harness.mjs
 *
 * Env:
 *   LISTENER_LEAK_CYCLES=30     stress cycles (default 30)
 *   LISTENER_LEAK_PORT=8882     static server port
 *   LISTENER_LEAK_SEED=424242   fixed game seed
 *   LISTENER_LEAK_RETAIN=1      inject intentional retain-on-replace (self-test)
 *   LISTENER_LEAK_DUMP_SNAPSHOT=1  always dump detached retainer summary
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
const DUMP_SNAPSHOT =
  process.env.LISTENER_LEAK_DUMP_SNAPSHOT === "1" || INJECT_RETAIN;
const SAMPLE_EVERY = Number(process.env.LISTENER_LEAK_SAMPLE_EVERY || 10);
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
 */
const MIN_STARTUP_NODE_DELTA = 40;
const MIN_CARDS_AT_START = 8;
/**
 * Fail-closed: after start+GC, retained mulligan DOM looks like the
 * LISTENER_LEAK_RETAIN=1 baseline (~+420 nodes / ~+230 listeners over
 * pre-start). Clean post-GC start is ~+100 nodes / ~+80 listeners.
 * A soak that already looks retain-shaped at start must not PASS.
 */
const MAX_STARTUP_NODE_DELTA = 250;
const MAX_STARTUP_LISTENER_DELTA = 160;
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

/** Track replaced/removed nodes via WeakRef so post-GC survival is measurable. */
async function installWeakRefProbe(page) {
  await page.evaluate(() => {
    if (window.__leakWeakProbe) return;
    window.__leakWeakProbe = {
      refs: [],
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
    return {
      phase: s?.phase ?? null,
      gameStarted: !!s?.gameStarted,
      turn: s?.turnNumber ?? null,
      active: s?.activePlayer ?? null,
      cards: document.querySelectorAll(".card").length,
      handCards: document.querySelectorAll("#blueHand .card, #redHand .card")
        .length,
      boardCards: document.querySelectorAll("#blueBoard .card, #redBoard .card")
        .length,
      histItems: document.querySelectorAll(".hist-item").length,
      allElements: document.querySelectorAll("*").length,
    };
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

async function startGame(page, { blue, red, seed }) {
  await withSettingsDrawer(page, async () => {
    const ids = await page.evaluate(() =>
      [...document.getElementById("blueDeckSelect").options]
        .map((o) => o.value)
        .filter(Boolean),
    );
    if (!ids.includes(blue) || !ids.includes(red)) {
      throw new Error(
        `Deck ids missing (want ${blue}, ${red}; have ${ids.join(", ")})`,
      );
    }
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
  const header = "| checkpoint | DOM nodes | JS event listeners | JS heap |";
  const sep = "|---|---:|---:|---:|";
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    console.log(
      `| ${r.checkpoint} | ${r.nodes} | ${r.listeners} | ${r.heapMb} MB |`,
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

  /** Lower is better. Prefer strong property edges toward Window/Array roots. */
  function edgeScore(r) {
    if (r.type === "weak") return 1000;
    if (r.type === "context") return 80;
    const fromName = strings[nodes[r.from * nfc + nameI]];
    if (r.type === "property") {
      if (fromName === "Window" || fromName === "Object") return 0;
      if (
        fromName === "Array" ||
        fromName === "system / Map" ||
        fromName === "system / Set"
      )
        return 1;
      return 2;
    }
    if (r.type === "element" || r.type === "shortcut") return 20;
    return 40;
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

  const samples = [];
  for (const ord of detDivOrds.slice(0, 5)) {
    const path = [];
    let cur = ord;
    const seen = new Set();
    for (let d = 0; d < 12; d++) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const cand = (retainers[cur] || []).filter(
        (r) => !seen.has(r.from) && r.type !== "weak",
      );
      if (!cand.length) {
        path.push({ root: describe(cur) });
        break;
      }
      cand.sort((a, b) => edgeScore(a) - edgeScore(b));
      const pick = cand[0];
      path.push({
        node: describe(cur),
        via: `${pick.type}:${pick.name}`,
        from: describe(pick.from),
      });
      cur = pick.from;
      const fromName = strings[nodes[cur * nfc + nameI]];
      if (fromName === "Window" || fromName === "(GC roots)") break;
    }
    samples.push({
      node: describe(ord),
      retainerCount: (retainers[ord] || []).filter((r) => r.type !== "weak")
        .length,
      path,
    });
  }

  return {
    detachedness2Count: det2,
    detachedDivLike: detDivOrds.length,
    topDetachedNames: [...detNameCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    topRetainingEdges: [...edgeAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    topRetainingFromNames: [...fromAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20),
    samples,
  };
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
  await cdp.send("HeapProfiler.enable");

  const rows = [];
  let liveStart = null;
  let turnAtStart = null;

  try {
    await page.goto(`http://127.0.0.1:${PORT}/?test=1`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(() => !!window.__svwbTest);

    // Always install WeakRef probe (independent of INJECT_RETAIN).
    await installWeakRefProbe(page);

    await forceGc(cdp, page);
    const preStart = {
      checkpoint: "pre-start + GC",
      ...(await sampleMetrics(cdp)),
      live: await readLiveState(page),
    };
    console.log("Live pre-start:", preStart.live, preStart);

    await startGame(page, {
      blue: "swordcraft_rally",
      red: "abysscraft_necromancy",
      seed: SEED,
    });
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

    const startupNodeDelta = rows[0].nodes - preStart.nodes;
    const startupListenerDelta = rows[0].listeners - preStart.listeners;

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

    // Fail-closed: retain-shaped post-start baseline (matches reporter's 1490/328
    // and LISTENER_LEAK_RETAIN=1) means GC failed or leak already present.
    if (!INJECT_RETAIN) {
      assertLiveGame(
        "startup-not-retain-shaped-nodes",
        startupNodeDelta <= MAX_STARTUP_NODE_DELTA,
        `startup node delta ${startupNodeDelta} exceeds ${MAX_STARTUP_NODE_DELTA} (retain-shaped / GC ineffective)`,
      );
      assertLiveGame(
        "startup-not-retain-shaped-listeners",
        startupListenerDelta <= MAX_STARTUP_LISTENER_DELTA,
        `startup listener delta ${startupListenerDelta} exceeds ${MAX_STARTUP_LISTENER_DELTA} (retain-shaped / GC ineffective)`,
      );
    }

    let totalEnded = 0;
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      totalEnded += await endTurns(page, 3);
      await hoverAllCards(page);
      await undoRedo(page);

      if (cycle === 1) {
        const liveAfter1 = await readLiveState(page);
        const probeAfter1 = await readWeakRefProbe(page);
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
        assertLiveGame(
          "dom-churn-happened",
          probeAfter1.replaces + probeAfter1.removes > 0,
          `replaces=${probeAfter1.replaces} removes=${probeAfter1.removes}`,
        );
      }

      if (cycle % SAMPLE_EVERY === 0 || cycle === CYCLES) {
        await forceGc(cdp, page);
        const live = await readLiveState(page);
        const probe = await readWeakRefProbe(page);
        rows.push({
          checkpoint: `after ${cycle} cycles + GC`,
          ...(await sampleMetrics(cdp)),
          live,
          weakRef: probe,
        });
        console.log(
          `Live after ${cycle}:`,
          live,
          rows[rows.length - 1],
          "weakRef",
          probe,
        );

        if (!INJECT_RETAIN) {
          assertLiveGame(
            `weakref-cleared-cycle-${cycle}`,
            probe.alive <= MAX_ALIVE_WEAKREFS,
            `alive=${probe.alive} tracked=${probe.tracked} replaces=${probe.replaces} (replaced nodes surviving GC)`,
          );
        }
      }
    }

    console.log("=== DOM / listener retention harness ===");
    console.log(
      `Seed: ${SEED}  Cycles: ${CYCLES}  Sample every: ${SAMPLE_EVERY}  InjectRetain: ${INJECT_RETAIN}`,
    );
    console.log(
      `Chrome: ${CHROME}  Ended turns: ${totalEnded}  Start cards: ${liveStart.cards}`,
    );
    printTable(rows);

    const analysis = analyzePostGcTrend(rows);
    console.log("");
    console.log("Analysis:");
    console.log(JSON.stringify(analysis, null, 2));

    if (DUMP_SNAPSHOT || analysis.nodesLeaking || analysis.listenersLeaking) {
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
          "FAIL: post-GC node/listener counts grow linearly (retention leak)",
        );
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
