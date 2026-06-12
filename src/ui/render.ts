/* eslint-disable */
// src/ui/render.ts
import { renderZone } from "./zones.js";
import { updateCounts } from "./counts.js";
import { updateEvoButtonsUI } from "./evo.js";
import { makeLeaderDroppable } from "./drag.js";
import { byId } from "./dom.js";

import { state } from "../core/gameState.js";
import type { GameState, Player, CardInstance } from "../core/types/index.js";

// Map player slot to visual DOM prefix (first -> blue, second -> red)
function domPrefix(player: Player): "blue" | "red" {
  return player === "first" ? "blue" : "red";
}

const logic = () => import(/* webpackIgnore: true */ "../logic/index.js");

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

  // zones - use activePlayer as source of truth for turn state
  const isFirstActive = state.activePlayer === "first";
  renderZone("blueHand", state.players.first.hand, state, render, isFirstActive, (uid) => {
    const hand = state.players.first.hand;
    const i = hand.findIndex((c) => c.uid === uid);
    if (i !== -1) void logic().then(({ playCard }) => playCard(hand, "first", i));
  });
  renderZone("blueBoard", state.players.first.board, state, render);
  renderZone("redHand", state.players.second.hand, state, render, !isFirstActive, (uid) => {
    const hand = state.players.second.hand;
    const i = hand.findIndex((c) => c.uid === uid);
    if (i !== -1) void logic().then(({ playCard }) => playCard(hand, "second", i));
  });
  renderZone("redBoard", state.players.second.board, state, render);

  updateCounts(state);

  const blueLeader = byId("blueLeader");
  const redLeader = byId("redLeader");
  if (!blueLeader || !redLeader) return;

  if (
    state.phase !== "mulligan" &&
    state.pendingTargetEffect?.canTargetLeader
  ) {
    // Show enemy leader as targetable - use activePlayer as source of truth
    const enemyLeader = state.activePlayer === "first" ? redLeader : blueLeader;
    enemyLeader.classList.add("selectable");
    enemyLeader.onclick = (e) => {
      e.stopPropagation();
      void logic().then(({ resolvePendingTarget }) =>
        resolvePendingTarget("leader"),
      );
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

  // Leader drag-drop setup (disabled during mulligan)
  if (state.phase !== "mulligan") {
    makeLeaderDroppable(byId("blueLeader")!, "first");
    makeLeaderDroppable(byId("redLeader")!, "second");
  }

  document.body.dataset.activePlayer = state.activePlayer;

  updateLeaderPlates(state);

  // PP Boost button for second player - ID is "redBoost" in HTML
  const ppBoostBtn = byId("redBoost") as HTMLButtonElement;
  if (ppBoostBtn) {
    // Determine if boost has been used for this round tier
    const alreadyUsed =
      (state.roundCount <= 5 && state.secondPlayerPPBoostUsedEarly) ||
      (state.roundCount > 5 && state.secondPlayerPPBoostUsedLate);

    // Only enable on second player's turn
    const isSecondPlayerTurn = state.activePlayer === "second";

    if (alreadyUsed) {
      // Permanently greyed out after use
      ppBoostBtn.disabled = true;
      ppBoostBtn.classList.add("used", "disabled");
    } else if (!isSecondPlayerTurn) {
      // Greyed out during first player's turn
      ppBoostBtn.disabled = true;
      ppBoostBtn.classList.remove("used");
      ppBoostBtn.classList.add("disabled");
    } else {
      // Available on second player's turn
      ppBoostBtn.disabled = false;
      ppBoostBtn.classList.remove("disabled");
      ppBoostBtn.classList.toggle("used", !!state.secondPlayerPPBoostPending);
    }
  }

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
  setEndTurnDisabled(state.phase === "mulligan");

  //sidebars/lists
  renderListIfPresent("bluePlayedList", state.players.first.playedHistory);
  renderListIfPresent("redPlayedList", state.players.second.playedHistory);
  renderListIfPresent("blueDestroyedList", state.players.first.destroyedHistory);
  renderListIfPresent("redDestroyedList", state.players.second.destroyedHistory);

  // God Mode Visibility
  const godPanel = byId("blueGodMode");
  if (godPanel) {
    const file = String(state.players.first.deckFile || "");
    const isTesting = /^0_.*\.json$/i.test(file) || /testing/i.test(file);
    godPanel.style.display = isTesting ? "block" : "none";
  }
}

// Helper: toggle End Turn buttons visibility and disabled state
function setEndTurnDisabled(disabled: boolean) {
  const blueBtn = document.getElementById("endTurnBlue") as HTMLButtonElement;
  const redBtn = document.getElementById("endTurnRed") as HTMLButtonElement;

  // During mulligan, hide both buttons
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
      blueBtn.dataset.yourTurn = isFirstActive ? "true" : "false";
    }
    if (redBtn) {
      redBtn.style.display = isFirstActive ? "none" : "inline-block";
      redBtn.disabled = false;
      redBtn.dataset.yourTurn = !isFirstActive ? "true" : "false";
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
    };
    g.count += 1;
    if (!g.base_image && it?.base_image) g.base_image = it.base_image;
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

    li.appendChild(badge);
    li.appendChild(label);
    list.appendChild(li);
  }
  el.appendChild(list);

  // Attach hover preview for any hist-item under this container
  wireHistoryImagePreview(el);
}

// Create-once floating image preview
let __histPreviewEl: HTMLElement | null = null;
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

function wireHistoryImagePreview(scopeEl: HTMLElement) {
  const preview = ensureHistoryPreviewEl();
  scopeEl.addEventListener("mousemove", (e) => {
    if (preview.style.display === "none") return;
    // position to the right of cursor, clamped to viewport
    const w = 210;
    const h = 300; // preview size
    let x = e.clientX + 18;
    let y = e.clientY + 18;
    const vw = window.innerWidth,
      vh = window.innerHeight;
    if (x + w > vw) x = vw - w - 12;
    if (y + h > vh) y = vh - h - 12;
    preview.style.left = x + "px";
    preview.style.top = y + "px";
  });

  scopeEl.addEventListener("mouseover", (e) => {
    const li = (e.target as HTMLElement).closest(".hist-item") as HTMLElement;
    if (!li) return;
    const url = li.dataset.img;
    if (!url) return;
    const preview = ensureHistoryPreviewEl();
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

  scopeEl.addEventListener("mouseout", (e) => {
    const li = (e.target as HTMLElement).closest(".hist-item");
    if (!li) return;
    const preview = ensureHistoryPreviewEl();
    preview.style.display = "none";
  });
}

// render.js — add this helper above updateCrestsUI
function orderedCrestSlots(container: HTMLElement, side: Player) {
  const slots = Array.from(container.querySelectorAll(".crest-slot"));
  if (!slots.length) return [];

  // Group by visual row using Y (top) and sort deterministic by X (left)
  const rows: { top: number; items: { el: Element; left: number }[] }[] = [];
  const EPS = 2; // tolerate tiny pixel differences
  for (const el of slots) {
    const r = el.getBoundingClientRect();
    const top = r.top;
    const left = r.left;
    let row = rows.find((x) => Math.abs(x.top - top) < EPS);
    if (!row) {
      row = { top, items: [] };
      rows.push(row);
    }
    row.items.push({ el, left });
  }

  // Sort rows by screen Y:
  //  - BLUE: lower row (bigger top) first (near the player), then upper row
  //  - RED:  upper row (smaller top) first, then lower row (mirror)
  rows.sort((a, b) => (side === "first" ? b.top - a.top : a.top - b.top));

  // In each row:
  //  - BLUE: left → right
  //  - RED:  right → left (mirror across vertical axis)
  const ordered: Element[] = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.left - b.left);
    if (side === "second") row.items.reverse();
    for (const it of row.items) ordered.push(it.el);
  }
  return ordered;
}

// render.js — REPLACE updateCrestsUI with this
function updateCrestsUI(playerPrefix: "first" | "second", state: GameState) {
  const crests =
    playerPrefix === "first" ? state.players.first.crests || [] : state.players.second.crests || [];
  // Use visual DOM prefix (blue/red) not semantic (first/second)
  const container = byId(`${domPrefix(playerPrefix)}Crests`);
  const tooltipEl = byId("cardTooltip");
  if (!container || !tooltipEl) return;

  // Determine true on-screen order of slots
  const slotOrder = orderedCrestSlots(container, playerPrefix);
  const slots = slotOrder.length
    ? slotOrder
    : container.querySelectorAll(".crest-slot");

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] as HTMLElement;
    const crestData = crests[i];

    // Clear previous content & listeners
    slot.innerHTML = "";
    slot.onmouseenter = null;
    slot.onmousemove = null;
    slot.onmouseleave = null;

    const getCrestCountdown = (c: any) => {
      const v = c?.countdown ?? c?.remaining ?? c?.turnsLeft ?? c?.turns;
      return Number.isFinite(Number(v)) ? Number(v) : null;
    };

    if (crestData && crestData.image) {
      const img = document.createElement("img");
      img.src = crestData.image;
      img.className = "crest-image";
      slot.appendChild(img);

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

function updateLeaderPlates(gs: GameState) {
  updateOneLeaderPlate("first", gs);
  updateOneLeaderPlate("second", gs);
}

function updateOneLeaderPlate(side: Player, gs: GameState) {
  const prefix = domPrefix(side);
  const plate = byId(`${prefix}LeaderPlate`);
  const hpEl = byId(`${prefix}HP`);
  if (!plate || !hpEl) return;

  const p = gs.players[side];
  hpEl.textContent = String(p.hp);
  plate.dataset.class = "neutral";
  plate.toggleAttribute("data-damaged", p.hp < 20);

  const deckEl = plate.querySelector(`[data-leader-deck]`);
  if (deckEl) deckEl.textContent = String(p.deck.length);

  const handBacks = plate.querySelector("[data-hand-backs]");
  if (handBacks) {
    handBacks.replaceChildren();
    const n = Math.min(p.hand.length, 5);
    for (let i = 0; i < n; i++) {
      const b = document.createElement("span");
      b.className = "hand-back";
      handBacks.appendChild(b);
    }
  }

  const epRow = plate.querySelector("[data-ep-pips]");
  if (epRow) {
    epRow.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement("span");
      pip.className = "ep-pip";
      pip.dataset.filled = i < (p.evoCharges ?? 0) ? "true" : "false";
      epRow.appendChild(pip);
    }
    for (let i = 0; i < 2; i++) {
      const pip = document.createElement("span");
      pip.className = "ep-pip";
      pip.dataset.super = "true";
      pip.dataset.filled = i < (p.superEvoCharges ?? 0) ? "true" : "false";
      epRow.appendChild(pip);
    }
  }
}

function renderLeaderBarrierBadge(side: Player) {
  const host = byId(`${domPrefix(side)}Leader`);
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














