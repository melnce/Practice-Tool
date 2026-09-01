/* eslint-disable */
// src/ui/render.ts
import { renderZone } from "./zones.js";
import { updateCounts } from "./counts.js";
import { updateEvoButtonsUI } from "./evo.js";
import { makeLeaderDroppable, clearLeaderDroppable } from "./drag.js";
import { byId } from "./dom.js";
import { releaseImageLoads } from "./releaseImageLoads.js";

import { state } from "../core/gameState.js";
import type { GameState, Player, CardInstance } from "../core/types/index.js";
import { getWinner } from "../core/playerHelpers.js";
import { getGlobalCardIndex } from "../data/cardIndex.js";
import { collectSetIds, formatSetBadge } from "../data/formats.js";
import { maybeAdvanceScriptFromUi } from "./playerDispatch.js";
import { syncSeedDisplay } from "./seedDisplay.js";
import { refreshActiveTooltips } from "./tooltips.js";
import { getPuzzleSessionSnapshot } from "../core/puzzle/session.js";
import { syncFloatingCombatTextFromLogs } from "./floatingCombatText.js";
import { noteBlackboxRematch } from "./blackbox.js";

// Map player slot to visual DOM prefix (first -> blue, second -> red)
function domPrefix(player: Player): "blue" | "red" {
  return player === "first" ? "blue" : "red";
}

const ACTIVE_ON_BOTTOM_KEY = "svwb.activeOnBottom";

export function isActiveOnBottom(): boolean {
  try {
    return localStorage.getItem(ACTIVE_ON_BOTTOM_KEY) === "1";
  } catch {
    return false;
  }
}

export function setActiveOnBottom(on: boolean): void {
  try {
    localStorage.setItem(ACTIVE_ON_BOTTOM_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  syncBodyTurnClasses();
}

function syncBodyTurnClasses(): void {
  const body = document.body;
  if (!body) return;
  body.classList.toggle("active-first", state.activePlayer === "first");
  body.classList.toggle("active-second", state.activePlayer === "second");
  body.classList.toggle("active-on-bottom", isActiveOnBottom());
  body.classList.toggle("gameover", state.phase === "gameover");
}

export function render() {
  // headers
  const setText = (id: string, text: any) => {
    const el = byId(id);
    if (el) el.textContent = String(text);
  };
  setText("blueHP", state.players.first.hp);
  setText("redHP", state.players.second.hp);
  setText("bluePP", `${state.players.first.pp}/${state.players.first.maxPP}`);
  setText("redPP", `${state.players.second.pp}/${state.players.second.maxPP}`);
  setText("blueShadows", state.players.first.shadows);
  setText("redShadows", state.players.second.shadows);

  syncBodyTurnClasses();
  syncSeedDisplay();

  // zones - use activePlayer as source of truth for turn state
  const isFirstActive = state.activePlayer === "first";
  const gameLocked = state.phase === "gameover";
  renderZone(
    "blueHand",
    state.players.first.hand,
    state,
    render,
    isFirstActive && !gameLocked,
    (i) => {
      void import("./playerDispatch.js").then(({ playCardAtIndex }) => {
        playCardAtIndex("first", i);
      });
    },
  );
  renderZone("blueBoard", state.players.first.board, state, render);
  renderZone(
    "redHand",
    state.players.second.hand,
    state,
    render,
    !isFirstActive && !gameLocked,
    (i) => {
      void import("./playerDispatch.js").then(({ playCardAtIndex }) => {
        playCardAtIndex("second", i);
      });
    },
  );
  renderZone("redBoard", state.players.second.board, state, render);

  updateCounts(state);

  const blueLeader = byId("blueLeader");
  const redLeader = byId("redLeader");
  if (!blueLeader || !redLeader) return;

  if (
    state.phase !== "mulligan" &&
    state.phase !== "gameover" &&
    state.pendingTargetEffect?.canTargetLeader
  ) {
    // Show enemy leader as targetable - use activePlayer as source of truth
    const enemyLeader = state.activePlayer === "first" ? redLeader : blueLeader;
    enemyLeader.classList.add("selectable");
    enemyLeader.onclick = (e) => {
      e.stopPropagation();
      void import("./playerDispatch.js").then(({ chooseTargetAction }) => {
        const enemy = state.activePlayer === "first" ? "second" : "first";
        chooseTargetAction(state.activePlayer, {
          type: "leader",
          player: enemy,
        });
      });
    };
  } else {
    blueLeader.classList.remove("selectable");
    redLeader.classList.remove("selectable");
    blueLeader.onclick = null;
    redLeader.onclick = null;
  }

  // Render barrier badges for both leaders
  renderLeaderBarrierBadge("first");
  renderLeaderBarrierBadge("second");

  // Leader drop targets (disabled during mulligan / gameover)
  {
    const bl = byId("blueLeader");
    const rl = byId("redLeader");
    if (state.phase !== "mulligan" && state.phase !== "gameover") {
      if (bl) makeLeaderDroppable(bl, "first", state);
      if (rl) makeLeaderDroppable(rl, "second", state);
    } else {
      if (bl) clearLeaderDroppable(bl);
      if (rl) clearLeaderDroppable(rl);
    }
  }

  updateBoostPipsUI();

  // Selection mode visual state
  if (state.phase !== "mulligan" && state.pendingTargetEffect) {
    document.body.classList.add("select-mode");
  } else {
    document.body.classList.remove("select-mode");
  }

  updateEvoButtonsUI(state);
  updateCrestsUI("first", state);
  updateCrestsUI("second", state);

  // Disable/enable End Turn controls based on phase
  setEndTurnDisabled(state.phase === "mulligan" || state.phase === "gameover");

  //sidebars/lists
  renderListIfPresent("bluePlayedList", state.players.first.playedHistory);
  renderListIfPresent("redPlayedList", state.players.second.playedHistory);
  renderListIfPresent(
    "blueDestroyedList",
    state.players.first.destroyedHistory,
  );
  renderListIfPresent(
    "redDestroyedList",
    state.players.second.destroyedHistory,
  );
  wireHistoryImagePreviewOnce();

  // God Mode Visibility — either side on a test deck
  const godPanel = byId("blueGodMode");
  if (godPanel) {
    const isTesting = (file: string) =>
      /^0_.*\.json$/i.test(file) || /testing/i.test(file);
    const show =
      isTesting(String(state.players.first.deckFile || "")) ||
      isTesting(String(state.players.second.deckFile || ""));
    godPanel.style.display = show ? "block" : "none";
    const label = godPanel.querySelector(".god-target-label");
    if (label) {
      label.textContent =
        state.activePlayer === "first"
          ? "Target: Blue (1st)"
          : "Target: Red (2nd)";
    }
  }

  updateGameOverOverlay();
  refreshActiveTooltips();
  syncFloatingCombatTextFromLogs();

  // After paint, drive the sparring line if it's that side's turn.
  queueMicrotask(() => {
    try {
      maybeAdvanceScriptFromUi();
    } catch (e) {
      console.error("[Script] auto-advance failed", e);
    }
  });
}

function updateBoostPipsUI() {
  const ppBoostBtn = byId("redBoost") as HTMLButtonElement | null;
  const earlyPip = byId("boostPipEarly");
  const latePip = byId("boostPipLate");

  const earlyUsed = !!state.secondPlayerPPBoostUsedEarly;
  const lateUsed = !!state.secondPlayerPPBoostUsedLate;
  const isEarlyTier = state.roundCount <= 5;

  if (earlyPip) {
    earlyPip.classList.toggle("used", earlyUsed);
    earlyPip.classList.toggle("active-tier", isEarlyTier && !earlyUsed);
    earlyPip.title = earlyUsed
      ? "Early Bonus PP used (rounds 1–5)"
      : "Early Bonus PP (rounds 1–5)";
  }
  if (latePip) {
    latePip.classList.toggle("used", lateUsed);
    latePip.classList.toggle("active-tier", !isEarlyTier && !lateUsed);
    latePip.title = lateUsed
      ? "Late Bonus PP used (round 6+)"
      : "Late Bonus PP (round 6+)";
  }

  if (!ppBoostBtn) return;

  const alreadyUsed = (isEarlyTier && earlyUsed) || (!isEarlyTier && lateUsed);
  const isSecondPlayerTurn = state.activePlayer === "second";
  const locked = state.phase === "gameover" || state.phase === "mulligan";

  if (locked || alreadyUsed) {
    ppBoostBtn.disabled = true;
    ppBoostBtn.classList.add("disabled");
    if (alreadyUsed) ppBoostBtn.classList.add("used");
    else ppBoostBtn.classList.remove("used");
  } else if (!isSecondPlayerTurn) {
    ppBoostBtn.disabled = true;
    ppBoostBtn.classList.remove("used");
    ppBoostBtn.classList.add("disabled");
  } else {
    ppBoostBtn.disabled = false;
    ppBoostBtn.classList.remove("disabled");
    ppBoostBtn.classList.toggle("used", !!state.secondPlayerPPBoostPending);
  }
}

function updateGameOverOverlay() {
  // Overlay is created lazily — use getElementById so missing-id does not warn
  // on every render during normal play (byId logs available IDs on miss).
  let overlay = document.getElementById("gameOverOverlay");
  // Puzzle attempt owns the terminal UI — keep rematch from fighting Retry.
  const puzzleStatus = getPuzzleSessionSnapshot().status;
  const puzzleBusy =
    puzzleStatus === "active" ||
    puzzleStatus === "solved" ||
    puzzleStatus === "failed";

  if (state.phase !== "gameover" || puzzleBusy) {
    if (overlay) overlay.style.display = "none";
    return;
  }

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "gameOverOverlay";
    overlay.innerHTML = `
      <div class="gameover-card">
        <div class="gameover-title" id="gameOverTitle"></div>
        <div class="gameover-reason" id="gameOverReason"></div>
        <div class="gameover-actions">
          <button type="button" id="rematchSameSeedBtn">Rematch (same seed)</button>
          <button type="button" id="rematchNewSeedBtn">Rematch (new seed)</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay
      .querySelector("#rematchSameSeedBtn")
      ?.addEventListener("click", () => void rematch(true));
    overlay
      .querySelector("#rematchNewSeedBtn")
      ?.addEventListener("click", () => void rematch(false));
  }

  const winner = state.winner ?? getWinner(state);
  const title = document.getElementById("gameOverTitle");
  const reasonEl = document.getElementById("gameOverReason");
  if (title) {
    title.textContent =
      winner === "first"
        ? "First wins"
        : winner === "second"
          ? "Second wins"
          : "Draw";
  }
  if (reasonEl) {
    const why = state.gameOverReason === "deckout" ? "Deck-out" : "Lethal";
    reasonEl.textContent = why;
  }
  overlay.style.display = "flex";
}

async function rematch(keepSeed: boolean) {
  const blueSelect = document.getElementById(
    "blueDeckSelect",
  ) as HTMLSelectElement | null;
  const redSelect = document.getElementById(
    "redDeckSelect",
  ) as HTMLSelectElement | null;
  const seedInput = document.getElementById(
    "seedInput",
  ) as HTMLInputElement | null;

  // Black-box boundary sample before state reset — rematch staircase diagnostic.
  noteBlackboxRematch(keepSeed);

  const deckAId =
    blueSelect?.value ||
    state.players.first.deckFile?.replace(/\.json$/i, "") ||
    "starter_deck";
  const deckBId =
    redSelect?.value ||
    state.players.second.deckFile?.replace(/\.json$/i, "") ||
    "starter_deck";

  let seed: number | string;
  if (keepSeed) {
    // Prefer the literal match seed, then the input box
    if (state.seed !== undefined && state.seed !== null) {
      seed = state.seed;
    } else if (seedInput && seedInput.value.trim() !== "") {
      seed = Number(seedInput.value);
    } else {
      seed = Date.now();
    }
  } else {
    seed = Date.now();
    if (seedInput) seedInput.value = String(seed);
  }

  const engine = await import(/* webpackIgnore: true */ "../engine.js");
  await engine.startNewGame({ deckAId, deckBId, seed });
  void import("../boot/shareUrl.js").then(({ writeShareParams }) => {
    writeShareParams({ seed: state.seed, deckAId, deckBId });
  });
  void import("../core/positionStore.js").then(({ setSessionDeckIds }) => {
    setSessionDeckIds(deckAId, deckBId);
  });
}

// Helper: toggle End Turn buttons visibility and disabled state
function setEndTurnDisabled(disabled: boolean) {
  const blueBtn = document.getElementById("endTurnBlue") as HTMLButtonElement;
  const redBtn = document.getElementById("endTurnRed") as HTMLButtonElement;

  // During mulligan / gameover, hide both buttons
  if (disabled) {
    if (blueBtn) {
      blueBtn.style.display = "none";
      blueBtn.disabled = true;
    }
    if (redBtn) {
      redBtn.style.display = "none";
      redBtn.disabled = true;
    }
  } else {
    // Show the button for the active player, hide the other
    // Use activePlayer as the source of truth (not isFirstPlayerTurn)
    const isFirstActive = state.activePlayer === "first";
    if (blueBtn) {
      blueBtn.style.display = isFirstActive ? "inline-block" : "none";
      blueBtn.disabled = false;
    }
    if (redBtn) {
      redBtn.style.display = isFirstActive ? "none" : "inline-block";
      redBtn.disabled = false;
    }
  }

  // Also handle generic class-based buttons
  const classBtns = document.querySelectorAll(
    ".end-turn, [data-action='endTurn']",
  );
  classBtns.forEach((el) => {
    (el as HTMLButtonElement).disabled = disabled;
    el.classList.toggle("disabled", disabled);
    if (disabled) el.setAttribute("aria-disabled", "true");
    else el.removeAttribute("aria-disabled");
  });
}

function renderListIfPresent(id: string, arr: any[]) {
  const el = byId(id);
  if (!el) return;
  el.innerHTML = "";

  const list = document.createElement("ul");
  list.className = "hist-list";
  const items = Array.isArray(arr) ? arr : [];

  const index = getGlobalCardIndex();
  const allSetIds = index
    ? collectSetIds(
        [...index.byName.values()].map((c) => ({
          set: (c as { set?: unknown }).set,
        })),
      )
    : [];

  // Normalize and group by (name + cost) so variants with different costs won’t merge.
  const groups = new Map();
  for (const it of items) {
    const name = it?.name ?? "(unknown)";
    const cost =
      Number(
        it?.cost ?? it?.base_cost ?? it?.Cost ?? it?.card_cost ?? it?.["cost"],
      ) || 0;
    const key = `${name}||${cost}`;
    const g = groups.get(key) || {
      name,
      cost,
      count: 0,
      base_image: it?.base_image || null,
      set: it?.set,
    };
    g.count += 1;
    if (!g.base_image && it?.base_image) g.base_image = it.base_image;
    if (!g.set && it?.set) g.set = it.set;
    groups.set(key, g);
  }

  // Sort by cost asc, then name asc
  const sorted = Array.from(groups.values()).sort(
    (a: any, b: any) => a.cost - b.cost || a.name.localeCompare(b.name),
  );

  for (const g of sorted) {
    const li = document.createElement("li");
    li.className = "hist-item";
    if (g.base_image) li.dataset.img = g.base_image;

    // cost square
    const badge = document.createElement("span");
    badge.className = "cost-badge";
    badge.textContent = String(g.cost);

    const label = document.createElement("span");
    label.className = "hist-label";
    label.textContent = `${g.name} ×${g.count}`;

    const setBadge = formatSetBadge({ set: g.set }, allSetIds);
    if (setBadge) {
      const setEl = document.createElement("span");
      setEl.className = "hist-set";
      setEl.textContent = setBadge.text;
      setEl.title = setBadge.text;
      if (!setBadge.inRotation) setEl.dataset.older = "1";
      label.appendChild(document.createTextNode(" "));
      label.appendChild(setEl);
    }

    li.appendChild(badge);
    li.appendChild(label);
    list.appendChild(li);
  }
  el.appendChild(list);
}

// Create-once floating image preview + delegated document listeners
let __histPreviewEl: HTMLElement | null = null;
let __histPreviewWired = false;

function ensureHistoryPreviewEl() {
  if (__histPreviewEl) return __histPreviewEl;
  const div = document.createElement("div");
  div.id = "historyImgPreview";
  div.style.position = "fixed";
  div.style.display = "none";
  div.style.zIndex = "1000";
  div.style.pointerEvents = "none";
  div.style.border = "1px solid rgba(255,255,255,.1)";
  div.style.borderRadius = "10px";
  div.style.boxShadow = "0 8px 18px rgba(0,0,0,.45)";
  div.style.background = "rgba(12,14,18,.96)";
  div.style.padding = "6px";
  document.body.appendChild(div);
  __histPreviewEl = div;
  return div;
}

/** Attach hover preview handlers once (delegated on document). */
function wireHistoryImagePreviewOnce(): void {
  if (__histPreviewWired) return;
  __histPreviewWired = true;
  const preview = ensureHistoryPreviewEl();

  document.addEventListener("mousemove", (e) => {
    if (preview.style.display === "none") return;
    const w = 210;
    const h = 300;
    let x = e.clientX + 18;
    let y = e.clientY + 18;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x + w > vw) x = vw - w - 12;
    if (y + h > vh) y = vh - h - 12;
    preview.style.left = x + "px";
    preview.style.top = y + "px";
  });

  document.addEventListener("mouseover", (e) => {
    const li = (e.target as HTMLElement).closest(
      ".hist-item",
    ) as HTMLElement | null;
    if (!li) return;
    const url = li.dataset.img;
    if (!url) return;
    // Cancel any prior preview load before attaching a new one.
    releaseImageLoads(preview);
    preview.innerHTML = "";
    const img = new Image();
    img.width = 198;
    img.style.display = "block";
    img.style.borderRadius = "8px";
    img.referrerPolicy = "no-referrer";
    img.src = url;
    preview.appendChild(img);
    preview.style.display = "block";
  });

  document.addEventListener("mouseout", (e) => {
    const li = (e.target as HTMLElement).closest(".hist-item");
    if (!li) return;
    releaseImageLoads(preview);
    preview.innerHTML = "";
    preview.style.display = "none";
  });
}

// render.js — REPLACE updateCrestsUI with this
function updateCrestsUI(playerPrefix: "first" | "second", state: GameState) {
  const crests =
    playerPrefix === "first"
      ? state.players.first.crests || []
      : state.players.second.crests || [];
  // Use visual DOM prefix (blue/red) not semantic (first/second)
  const container = byId(`${domPrefix(playerPrefix)}Crests`);
  const tooltipEl = byId("cardTooltip");
  if (!container || !tooltipEl) return;

  // DOM order must match engine crest array order (firing order).
  const slots = Array.from(container.querySelectorAll(".crest-slot"));

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] as HTMLElement;
    const crestData = crests[i];

    // Clear previous content & listeners — cancel pending crest-art loads first
    // so ImageLoader cannot retain the prior slot subtree across updates.
    releaseImageLoads(slot);
    slot.innerHTML = "";
    slot.onmouseenter = null;
    slot.onmousemove = null;
    slot.onmouseleave = null;

    const getCrestCountdown = (c: any) => {
      const v = c?.countdown ?? c?.remaining ?? c?.turnsLeft ?? c?.turns;
      return Number.isFinite(Number(v)) ? Number(v) : null;
    };

    if (crestData) {
      const img = document.createElement("img");
      img.className = "crest-image";
      const primaryImage = crestData.image || "";
      const cardIdFromUrl =
        primaryImage.match(/\/(\d+)(?:_token)?\.webp(?:\?|$)/i)?.[1] ?? null;
      const fallbackCardId = cardIdFromUrl ?? "";
      if (primaryImage) {
        img.src = primaryImage;
        if (fallbackCardId) {
          const fallback = `https://static.dotgg.gg/shadowverse/cards/${fallbackCardId}.webp`;
          img.dataset.fallbackSrc = fallback;
          img.onerror = () => {
            if (img.dataset.fallbackApplied) {
              // Final failure (fallback also failed) — drop loader + closure.
              img.onerror = null;
              img.onload = null;
              return;
            }
            img.dataset.fallbackApplied = "1";
            const next = img.dataset.fallbackSrc || fallback;
            // Same URL as primary: don't start a second pending load.
            if (!next || next === img.currentSrc || next === img.src) {
              img.onerror = null;
              img.onload = null;
              return;
            }
            img.src = next;
          };
          img.onload = () => {
            img.onerror = null;
            img.onload = null;
          };
        }
      } else if (fallbackCardId) {
        img.src = `https://static.dotgg.gg/shadowverse/cards/${fallbackCardId}.webp`;
      }
      if (img.src) slot.appendChild(img);

      // bottom-right countdown badge
      const cd = getCrestCountdown(crestData);
      if (cd !== null) {
        const badge = document.createElement("div");
        badge.className = "crest-countdown";
        badge.textContent = String(Math.max(0, cd));
        slot.appendChild(badge);
      }

      // top-left faith counter (if any)
      const faithCount = Number(crestData?.counters?.faith ?? NaN);
      if (!Number.isNaN(faithCount)) {
        const fb = document.createElement("div");
        fb.className = "crest-countdown";
        fb.textContent = String(Math.max(0, faithCount));
        fb.style.left = "4px";
        fb.style.right = "auto";
        fb.style.top = "4px";
        fb.style.bottom = "auto";
        slot.appendChild(fb);
      }

      // tooltip
      if (crestData.description) {
        slot.onmouseenter = () => {
          let text = crestData.description ?? "";
          if (String(crestData.name || "").toLowerCase() === "faith") {
            const fc = Number(crestData?.counters?.faith ?? 0);
            text = `${crestData.name} — ${fc}\n${crestData.description ?? ""}`;
          }
          tooltipEl.textContent = text;
          tooltipEl.style.display = "block";
        };
        slot.onmousemove = (e) => {
          const isBlueSide = playerPrefix === "first";
          const offsetY = isBlueSide ? -tooltipEl.offsetHeight - 12 : 12;
          tooltipEl.style.left =
            Math.min(
              e.pageX + 12,
              window.innerWidth - tooltipEl.offsetWidth - 12,
            ) + "px";
          tooltipEl.style.top = Math.max(e.pageY + offsetY, 12) + "px";
        };
        slot.onmouseleave = () => {
          tooltipEl.style.display = "none";
        };
      }
    }
  }
}

function renderLeaderBarrierBadge(side: Player) {
  // Barrier badge lives on the HP readout on the outer-edge leader bar
  // (falls back to the bar itself if the readout is missing).
  const host =
    byId(`${domPrefix(side)}LeaderHp`) ?? byId(`${domPrefix(side)}Leader`);
  if (!host) return;

  // Cleanup old badges just in case
  host.querySelectorAll(".leader-barrier-badge").forEach((n) => n.remove());

  // Use nested player state for barrier check
  const hasBarrier = (state.players[side].leaderBarrier || 0) > 0;

  if (hasBarrier) {
    host.classList.add("has-leader-barrier");
  } else {
    host.classList.remove("has-leader-barrier");
  }
}
