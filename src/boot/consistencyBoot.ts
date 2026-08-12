/**
 * Browser boot for the consistency / mulligan trainer page.
 * Loads decks + card DB, drives stats (Web Worker) and drill UI.
 */
import { loadCardDatabase } from "../data/cardDatabase.js";
import { getGlobalCardIndex } from "../data/cardIndex.js";
import type { DeckManifest, DeckManifestEntry } from "../data/deckManifest.js";
import {
  CRAFT_CLASSES,
  dealDrillHand,
  keepAllPolicy,
  keepListPolicy,
  resolveDeckToSimCards,
  revealDrillPaths,
  uniqueDeckKeys,
  type Condition,
  type ConsistencyConfig,
  type ConsistencyResult,
  type DrillDeal,
  type Seat,
  type SimCard,
} from "../consistency/index.js";
import type {
  ConsistencyWorkerRequest,
  ConsistencyWorkerResponse,
} from "../consistency/consistencyWorker.js";

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const deckCache = new Map<string, SimCard[]>();
const uniqueByDeck = new Map<string, SimCard[]>();
let currentDeal: DrillDeal | null = null;
let keepFlags: boolean[] = [true, true, true, true];

let worker: Worker | null = null;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    new URL("../consistency/consistencyWorker.ts", import.meta.url),
    { type: "module" },
  );
  return worker;
}

async function fetchManifest(): Promise<DeckManifestEntry[]> {
  const res = await fetch("decks/manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const manifest = (await res.json()) as DeckManifest;
  return (manifest.entries ?? []).filter((e) => e.category === "deck");
}

async function loadDeck(id: string): Promise<SimCard[]> {
  const cached = deckCache.get(id);
  if (cached) return cached;
  const index = getGlobalCardIndex();
  if (!index) throw new Error("Card database not ready");
  const res = await fetch(`decks/${id}.json`);
  if (!res.ok) throw new Error(`Deck ${id}: ${res.status}`);
  const raw = await res.json();
  const resolved = resolveDeckToSimCards(raw, index, `${id}.json`);
  deckCache.set(id, resolved.cards);
  uniqueByDeck.set(id, uniqueDeckKeys(resolved.cards));
  return resolved.cards;
}

function populateDeckSelects(entries: DeckManifestEntry[]): void {
  for (const selId of ["statsDeck", "drillDeck"] as const) {
    const sel = $(selId) as unknown as HTMLSelectElement;
    sel.innerHTML = "";
    for (const d of entries) {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.label || d.id;
      sel.appendChild(opt);
    }
  }
  const opp = $("drillOpp") as unknown as HTMLSelectElement;
  for (const c of CRAFT_CLASSES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    opp.appendChild(opt);
  }
}

function renderChips(
  container: HTMLElement,
  cards: readonly SimCard[],
  selected: Set<string>,
  onToggle: (key: string) => void,
): void {
  container.innerHTML = "";
  for (const c of cards) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip${selected.has(c.key) ? " on" : ""}`;
    btn.textContent = `${c.cost} — ${c.name}`;
    btn.addEventListener("click", () => onToggle(c.key));
    container.appendChild(btn);
  }
}

const keepSelected = new Set<string>();
const condSelected = new Set<string>();

async function refreshChipPools(): Promise<void> {
  const id = ($("statsDeck") as unknown as HTMLSelectElement).value;
  await loadDeck(id);
  const uniques = uniqueByDeck.get(id) ?? [];
  renderChips($("keepChips"), uniques, keepSelected, (key) => {
    if (keepSelected.has(key)) keepSelected.delete(key);
    else keepSelected.add(key);
    void refreshChipPools();
  });
  renderChips($("condChips"), uniques, condSelected, (key) => {
    if (condSelected.has(key)) condSelected.delete(key);
    else condSelected.add(key);
    void refreshChipPools();
  });
}

function buildCondition(): Condition {
  const mode = ($("condMode") as unknown as HTMLSelectElement).value;
  const keys = [...condSelected];
  const atLeast = Number(
    ($("condAtLeast") as unknown as HTMLInputElement).value,
  );
  const costA = Number(($("condCostA") as unknown as HTMLInputElement).value);
  const costB = Number(($("condCostB") as unknown as HTMLInputElement).value);

  if (mode === "cost_and") {
    return {
      kind: "and",
      of: [
        { kind: "costs", costs: [costA], atLeast: 1 },
        { kind: "costs", costs: [costB], atLeast: 1 },
      ],
    };
  }
  if (mode === "specific") {
    if (keys.length === 0) {
      throw new Error(
        "Select at least one card for the specific-card condition",
      );
    }
    return { kind: "cards", keys, atLeast: 1 };
  }
  if (mode === "cards_or_costs") {
    if (keys.length === 0) {
      throw new Error("Select cards for the OR condition");
    }
    return {
      kind: "or",
      of: [
        { kind: "cards", keys, atLeast: Math.max(1, atLeast) },
        {
          kind: "and",
          of: [
            { kind: "costs", costs: [costA], atLeast: 1 },
            { kind: "costs", costs: [costB], atLeast: 1 },
          ],
        },
      ],
    };
  }
  // cards_at_least
  if (keys.length === 0) {
    throw new Error("Select at least one card for the condition");
  }
  return { kind: "cards", keys, atLeast: Math.max(1, atLeast) };
}

function parseSeed(raw: string): number | string {
  const t = raw.trim();
  if (!t) return Date.now();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n >>> 0;
  }
  return t;
}

function buildConfig(): ConsistencyConfig {
  const mullKind = ($("statsMull") as unknown as HTMLSelectElement).value;
  const mulligan =
    mullKind === "keep_list"
      ? keepListPolicy([...keepSelected])
      : keepAllPolicy();
  return {
    seat: ($("statsSeat") as unknown as HTMLSelectElement).value as Seat,
    mulligan,
    turnHorizon: Number(
      ($("statsHorizon") as unknown as HTMLInputElement).value,
    ),
    iterations: Number(($("statsIters") as unknown as HTMLInputElement).value),
    seed: parseSeed(
      ($("statsSeed") as unknown as HTMLInputElement).value || "42",
    ),
  };
}

function showStatsResult(result: ConsistencyResult): void {
  const table = $("statsTable");
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const openingRow = document.createElement("tr");
  openingRow.innerHTML = `<td>Opening (post-mull)</td><td>${(result.probabilityOpening * 100).toFixed(2)}%</td>`;
  tbody.appendChild(openingRow);
  for (let t = 1; t <= result.turnHorizon; t++) {
    const tr = document.createElement("tr");
    const p = result.probabilityByTurn[t] ?? 0;
    tr.innerHTML = `<td>Turn ${t}</td><td>${(p * 100).toFixed(2)}%</td>`;
    tbody.appendChild(tr);
  }
  table.classList.remove("hidden");

  const spark = $("statsSpark");
  spark.classList.remove("hidden");
  const pts: string[] = [];
  const vals = [result.probabilityOpening];
  for (let t = 1; t <= result.turnHorizon; t++) {
    vals.push(result.probabilityByTurn[t] ?? 0);
  }
  const w = 100;
  const h = 100;
  for (let i = 0; i < vals.length; i++) {
    const x = vals.length === 1 ? 0 : (i / (vals.length - 1)) * w;
    const y = h - vals[i]! * h;
    pts.push(`${x},${y}`);
  }
  spark.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline fill="none" stroke="#0f6b5c" stroke-width="2" points="${pts.join(" ")}" /></svg>`;

  $("statsMeta").textContent =
    `seed ${result.seed} · ${result.iterations.toLocaleString()} iters · ${result.elapsedMs.toFixed(0)} ms`;
}

function runStats(): void {
  const err = $("statsError");
  err.classList.add("hidden");
  err.textContent = "";
  let condition: Condition;
  let config: ConsistencyConfig;
  try {
    condition = buildCondition();
    config = buildConfig();
  } catch (e) {
    err.textContent = e instanceof Error ? e.message : String(e);
    err.classList.remove("hidden");
    return;
  }

  const deckId = ($("statsDeck") as unknown as HTMLSelectElement).value;
  const btn = $("runStats") as unknown as HTMLButtonElement;
  btn.disabled = true;
  $("statsMeta").textContent = "Running…";

  void loadDeck(deckId)
    .then((deck) => {
      const w = ensureWorker();
      return new Promise<ConsistencyResult>((resolve, reject) => {
        const onMsg = (ev: MessageEvent<ConsistencyWorkerResponse>) => {
          w.removeEventListener("message", onMsg);
          const data = ev.data;
          if (data.type === "result") resolve(data.result);
          else reject(new Error(data.message));
        };
        w.addEventListener("message", onMsg);
        const req: ConsistencyWorkerRequest = {
          type: "run",
          deck,
          condition,
          config,
        };
        w.postMessage(req);
      });
    })
    .then((result) => {
      showStatsResult(result);
    })
    .catch((e: unknown) => {
      err.textContent = e instanceof Error ? e.message : String(e);
      err.classList.remove("hidden");
      $("statsMeta").textContent = "";
    })
    .finally(() => {
      btn.disabled = false;
    });
}

function renderDrillHand(): void {
  const root = $("drillHand");
  root.innerHTML = "";
  if (!currentDeal) return;
  currentDeal.opening.forEach((card, i) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `card-tile ${keepFlags[i] ? "keep" : "mull"}`;
    tile.innerHTML = `<div class="cost">Cost ${card.cost}</div><div class="name">${card.name}</div><div class="hint">${keepFlags[i] ? "KEEP" : "MULLIGAN"}</div>`;
    tile.addEventListener("click", () => {
      keepFlags[i] = !keepFlags[i];
      renderDrillHand();
    });
    root.appendChild(tile);
  });
}

function dealNewHand(): void {
  const deckId = ($("drillDeck") as unknown as HTMLSelectElement).value;
  const seedRaw = ($("drillSeed") as unknown as HTMLInputElement).value;
  void loadDeck(deckId).then((deck) => {
    currentDeal = dealDrillHand(
      deck,
      seedRaw.trim() ? parseSeed(seedRaw) : Date.now(),
    );
    keepFlags = [true, true, true, true];
    ($("revealBtn") as unknown as HTMLButtonElement).disabled = false;
    ($("nextHand") as unknown as HTMLButtonElement).disabled = false;
    $("drillCompare").classList.add("hidden");
    $("drillCompare").innerHTML = "";
    const opp = ($("drillOpp") as unknown as HTMLSelectElement).value;
    $("drillMeta").textContent =
      `seed ${currentDeal.seed}` + (opp ? ` · vs ${opp}` : "");
    renderDrillHand();
  });
}

function revealDrill(): void {
  if (!currentDeal) return;
  const turns = Number(($("drillTurns") as unknown as HTMLInputElement).value);
  const keepIndices = keepFlags
    .map((k, i) => (k ? i : -1))
    .filter((i) => i >= 0);
  const reveal = revealDrillPaths(currentDeal, keepIndices, turns);
  const root = $("drillCompare");
  root.classList.remove("hidden");

  const fmt = (cards: SimCard[]) =>
    cards.map((c) => `<li>${c.cost} — ${c.name}</li>`).join("");

  root.innerHTML = `
    <div>
      <h3>${reveal.yourPath.label}</h3>
      <div class="meta">Hand after mulligan</div>
      <ul class="draw-list">${fmt(reveal.yourPath.hand)}</ul>
      <div class="meta" style="margin-top:8px">Draws (turns 1–${turns})</div>
      <ul class="draw-list">${fmt(reveal.yourPath.draws)}</ul>
    </div>
    <div>
      <h3>${reveal.keepAllPath.label}</h3>
      <div class="meta">Hand (no mulligan)</div>
      <ul class="draw-list">${fmt(reveal.keepAllPath.hand)}</ul>
      <div class="meta" style="margin-top:8px">Draws (turns 1–${turns})</div>
      <ul class="draw-list">${fmt(reveal.keepAllPath.draws)}</ul>
    </div>
  `;
}

function wireTabs(): void {
  const statsBtn = $("tabStats");
  const drillBtn = $("tabDrill");
  const panelStats = $("panelStats");
  const panelDrill = $("panelDrill");
  statsBtn.addEventListener("click", () => {
    statsBtn.classList.add("active");
    drillBtn.classList.remove("active");
    panelStats.classList.remove("hidden");
    panelDrill.classList.add("hidden");
  });
  drillBtn.addEventListener("click", () => {
    drillBtn.classList.add("active");
    statsBtn.classList.remove("active");
    panelDrill.classList.remove("hidden");
    panelStats.classList.add("hidden");
  });
}

function wireCondModeVisibility(): void {
  const mode = $("condMode") as unknown as HTMLSelectElement;
  const sync = () => {
    const v = mode.value;
    $("atLeastWrap").classList.toggle(
      "hidden",
      v === "cost_and" || v === "specific",
    );
    $("costAWrap").classList.toggle(
      "hidden",
      v === "cards_at_least" || v === "specific",
    );
    $("costBWrap").classList.toggle(
      "hidden",
      v === "cards_at_least" || v === "specific",
    );
  };
  mode.addEventListener("change", sync);
  sync();
}

async function main(): Promise<void> {
  await loadCardDatabase();
  const entries = await fetchManifest();
  populateDeckSelects(entries);
  await refreshChipPools();
  wireTabs();
  wireCondModeVisibility();

  $("statsDeck").addEventListener("change", () => {
    keepSelected.clear();
    condSelected.clear();
    void refreshChipPools();
  });
  $("statsMull").addEventListener("change", () => {
    const kind = ($("statsMull") as unknown as HTMLSelectElement).value;
    $("keepListBox").classList.toggle("hidden", kind !== "keep_list");
  });
  $("keepListBox").classList.toggle(
    "hidden",
    ($("statsMull") as unknown as HTMLSelectElement).value !== "keep_list",
  );

  $("runStats").addEventListener("click", () => runStats());
  $("dealHand").addEventListener("click", () => dealNewHand());
  $("nextHand").addEventListener("click", () => {
    ($("drillSeed") as unknown as HTMLInputElement).value = "";
    dealNewHand();
  });
  $("revealBtn").addEventListener("click", () => revealDrill());
}

void main();
