import { renderZone } from "@ui/zones.js";
import { updateCounts } from "@ui/counts.js";
import { updateEvoButtonsUI } from "@ui/evo.js";
import { makeLeaderDroppable } from "@ui/drag.js";
import { byId } from "@ui/dom.js";

import { state } from "@core/gameState.js";
const logic = () => import("@logic/index.js");


export function render() {

  // headers
  const setText = (id, text) => { const el = byId(id); if (el) el.textContent = String(text); };
  setText("blueHP", state.blueHP);
  setText("redHP", state.redHP);
  setText("bluePP", `${state.bluePP}/${state.blueMaxPP}`);
  setText("redPP", `${state.redPP}/${state.redMaxPP}`);
  setText("blueShadows", state.blueShadows);
  setText("redShadows", state.redShadows);

  // zones
  renderZone("blueHand", state.blueHand, state, render, state.isBlueTurn, (i) => logic().then(({ playCard }) => playCard(state.blueHand, "blue", i)));
  renderZone("blueBoard", state.blueBoard, state, render);
  renderZone("redHand", state.redHand, state, render, !state.isBlueTurn, (i) => logic().then(({ playCard }) => playCard(state.redHand, "red", i)));
  renderZone("redBoard", state.redBoard, state, render);

  updateCounts(state);

  const blueLeader = byId("blueLeader");
  const redLeader = byId("redLeader");

  if (state.phase !== "mulligan" && state.pendingTargetEffect?.canTargetLeader) {
    // Show enemy leader as targetable
    const enemyLeader = state.isBlueTurn ? redLeader : blueLeader;
    enemyLeader.classList.add("selectable");
    enemyLeader.onclick = (e) => {
      e.stopPropagation();
      logic().then(({ resolvePendingTarget }) => resolvePendingTarget("leader"));
    };
  } else {
    blueLeader.classList.remove("selectable");
    redLeader.classList.remove("selectable");
    blueLeader.onclick = null;
    redLeader.onclick = null;
  }

  // Render barrier badges for both leaders
  renderLeaderBarrierBadge("blue");
  renderLeaderBarrierBadge("red");

  // Leader drag-drop setup (disabled during mulligan)
  if (state.phase !== "mulligan") {
    makeLeaderDroppable(byId("blueLeader"), "blue", state);
    makeLeaderDroppable(byId("redLeader"), "red", state);
  }

  const redBoost = byId("redBoost");
  if (redBoost) {
    if (!state.redBoostUsedLate && state.roundCount > 5) {
      redBoost.disabled = false;
      redBoost.classList.toggle("used", !!state.redBoostPending);
    } else if (!state.redBoostUsedEarly && state.roundCount <= 5) {
      redBoost.disabled = false;
      redBoost.classList.toggle("used", !!state.redBoostPending);
    } else {
      redBoost.disabled = true;
      redBoost.classList.add("used");
    }
  }

  // Selection mode visual state
  if (state.phase !== "mulligan" && state.pendingTargetEffect) {
    document.body.classList.add("select-mode");
  } else {
    document.body.classList.remove("select-mode");
  }

  updateEvoButtonsUI(state);
  updateCrestsUI('blue', state);
  updateCrestsUI('red', state);

  // Disable/enable End Turn controls based on phase
  setEndTurnDisabled(state.phase === "mulligan");

  //sidebars/lists
  renderListIfPresent("bluePlayedList", state.bluePlayedHistory);
  renderListIfPresent("redPlayedList", state.redPlayedHistory);
  renderListIfPresent("blueDestroyedList", state.blueDestroyedHistory);
  renderListIfPresent("redDestroyedList", state.redDestroyedHistory);
}

// Helper: toggle End Turn buttons
function setEndTurnDisabled(disabled) {
  const ids = ["endTurnBlue", "endTurnRed"]; // no generic "endTurn" button in DOM
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = disabled;
    el.classList.toggle("disabled", disabled);
    if (disabled) el.setAttribute("aria-disabled", "true");
    else el.removeAttribute("aria-disabled");
  });
  const classBtns = document.querySelectorAll(".end-turn, [data-action='endTurn']");
  classBtns.forEach(el => {
    el.disabled = disabled;
    el.classList.toggle("disabled", disabled);
    if (disabled) el.setAttribute("aria-disabled", "true"); else el.removeAttribute("aria-disabled");
  });
}

function renderListIfPresent(id, arr) {
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
    const cost = Number(it?.cost ?? it?.base_cost ?? it?.Cost ?? it?.card_cost ?? it?.["cost"]) || 0;
    const key = `${name}||${cost}`;
    const g = groups.get(key) || { name, cost, count: 0, base_image: it?.base_image || null };
    g.count += 1;
    if (!g.base_image && it?.base_image) g.base_image = it.base_image;
    groups.set(key, g);
  }

  // Sort by cost asc, then name asc
  const sorted = Array.from(groups.values()).sort((a, b) => (a.cost - b.cost) || a.name.localeCompare(b.name));

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
let __histPreviewEl = null;
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

function wireHistoryImagePreview(scopeEl) {
  const preview = ensureHistoryPreviewEl();
  scopeEl.addEventListener("mousemove", (e) => {
    if (preview.style.display === "none") return;
    // position to the right of cursor, clamped to viewport
    const w = 210; const h = 300; // preview size
    let x = e.clientX + 18;
    let y = e.clientY + 18;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + w > vw) x = vw - w - 12;
    if (y + h > vh) y = vh - h - 12;
    preview.style.left = x + "px";
    preview.style.top = y + "px";
  });

  scopeEl.addEventListener("mouseover", (e) => {
    const li = e.target.closest(".hist-item");
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
    const li = e.target.closest(".hist-item");
    if (!li) return;
    const preview = ensureHistoryPreviewEl();
    preview.style.display = "none";
  });

}

// render.js — add this helper above updateCrestsUI
function orderedCrestSlots(container, side /* 'blue' | 'red' */) {
  const slots = Array.from(container.querySelectorAll('.crest-slot'));
  if (!slots.length) return [];

  // Group by visual row using Y (top) and sort deterministic by X (left)
  const rows = [];
  const EPS = 2; // tolerate tiny pixel differences
  for (const el of slots) {
    const r = el.getBoundingClientRect();
    const top = r.top;
    const left = r.left;
    let row = rows.find(x => Math.abs(x.top - top) < EPS);
    if (!row) {
      row = { top, items: [] };
      rows.push(row);
    }
    row.items.push({ el, left });
  }

  // Sort rows by screen Y:
  //  - BLUE: lower row (bigger top) first (near the player), then upper row
  //  - RED:  upper row (smaller top) first, then lower row (mirror)
  rows.sort((a, b) => side === 'blue' ? (b.top - a.top) : (a.top - b.top));

  // In each row:
  //  - BLUE: left → right
  //  - RED:  right → left (mirror across vertical axis)
  const ordered = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.left - b.left);
    if (side === 'red') row.items.reverse();
    for (const it of row.items) ordered.push(it.el);
  }
  return ordered;
}

// render.js — REPLACE updateCrestsUI with this
function updateCrestsUI(playerPrefix, state) {
  const crests = playerPrefix === 'blue' ? (state.blueCrests || []) : (state.redCrests || []);
  const container = byId(`${playerPrefix}Crests`);
  const tooltipEl = byId('cardTooltip');
  if (!container || !tooltipEl) return;

  // Determine true on-screen order of slots
  const slotOrder = orderedCrestSlots(container, playerPrefix);
  const slots = slotOrder.length ? slotOrder : container.querySelectorAll('.crest-slot');

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const crestData = crests[i];

    // Clear previous content & listeners
    slot.innerHTML = '';
    slot.onmouseenter = null;
    slot.onmousemove = null;
    slot.onmouseleave = null;

    const getCrestCountdown = (c) => {
      const v = c?.countdown ?? c?.remaining ?? c?.turnsLeft ?? c?.turns;
      return Number.isFinite(Number(v)) ? Number(v) : null;
    };

    if (crestData && crestData.image) {
      const img = document.createElement('img');
      img.src = crestData.image;
      img.className = 'crest-image';
      slot.appendChild(img);

      // bottom-right countdown badge
      const cd = getCrestCountdown(crestData);
      if (cd !== null) {
        const badge = document.createElement('div');
        badge.className = 'crest-countdown';
        badge.textContent = String(Math.max(0, cd));
        slot.appendChild(badge);
      }

      // top-left faith counter (if any)
      const faithCount = Number(crestData?.counters?.faith ?? NaN);
      if (!Number.isNaN(faithCount)) {
        const fb = document.createElement('div');
        fb.className = 'crest-countdown';
        fb.textContent = String(Math.max(0, faithCount));
        fb.style.left = '4px';
        fb.style.right = 'auto';
        fb.style.top = '4px';
        fb.style.bottom = 'auto';
        slot.appendChild(fb);
      }

      // tooltip
      if (crestData.description) {
        slot.onmouseenter = () => {
          let text = crestData.description;
          if (String(crestData.name || '').toLowerCase() === 'faith') {
            const fc = Number(crestData?.counters?.faith ?? 0);
            text = `${crestData.name} — ${fc}\n${crestData.description}`;
          }
          tooltipEl.textContent = text;
          tooltipEl.style.display = 'block';
        };
        slot.onmousemove = (e) => {
          const isBlueSide = playerPrefix === 'blue';
          const offsetY = isBlueSide ? -tooltipEl.offsetHeight - 12 : 12;
          tooltipEl.style.left = Math.min(e.pageX + 12, window.innerWidth - tooltipEl.offsetWidth - 12) + "px";
          tooltipEl.style.top = Math.max(e.pageY + offsetY, 12) + "px";
        };
        slot.onmouseleave = () => {
          tooltipEl.style.display = 'none';
        };
      }
    }
  }
}


function renderLeaderBarrierBadge(side) {
  const host = byId(side === "blue" ? "blueLeader" : "redLeader");
  if (!host) return;
  // remove old badge
  host.querySelectorAll(".leader-barrier-badge").forEach(n => n.remove());
  const charges = (state[side === "blue" ? "blueLeaderBarrier" : "redLeaderBarrier"] | 0);
  if (charges <= 0) return;
  const badge = document.createElement("div");
  badge.className = "leader-barrier-badge";
  badge.textContent = String(charges);
  Object.assign(badge.style, {
    position: "absolute",
    right: "6px",
    top: "6px",
    minWidth: "18px",
    height: "18px",
    padding: "0 4px",
    borderRadius: "9px",
    background: "rgba(135,206,250,0.95)",
    color: "#000",
    fontWeight: "900",
    fontSize: "12px",
    lineHeight: "18px",
    textAlign: "center",
    boxShadow: "0 0 4px rgba(0,0,0,0.6)",
    pointerEvents: "none",
    zIndex: "5"
  });
  host.style.position = "relative"; // ensure positioning context
  host.appendChild(badge);
}
