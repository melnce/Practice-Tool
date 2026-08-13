/**
 * Puzzle authoring / attempt UI — composition over Save Pos + goals + checker.
 * No board editor; author by playing into a position then declaring the goal.
 */
import {
  savePuzzle,
  listPuzzles,
  deletePuzzle,
  downloadPuzzleJson,
  importPuzzleFromJson,
  onPuzzleLibraryChange,
  getPuzzleSessionSnapshot,
  onPuzzleSessionChange,
  stopPuzzle,
  PuzzleSchemaError,
  type PuzzleGoal,
  type PuzzleDefinition,
} from "../core/puzzle/index.js";
import { savePosition } from "../core/positionStore.js";
import {
  getScriptRuntimeSnapshot,
  getRecordingDocument,
} from "../logic/script/runtime.js";
import {
  beginPuzzleAttempt,
  retryPuzzleAttempt,
} from "../logic/puzzle/runtime.js";
import { showToast } from "./toast.js";
import { state } from "../core/gameState.js";
import type { PlayerSlot } from "../core/types/index.js";
import { adapter } from "../core/adapter.js";

function kickScriptIfNeeded(): void {
  void import("./playerDispatch.js").then(({ maybeAdvanceScriptFromUi }) => {
    maybeAdvanceScriptFromUi();
  });
}

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function refreshPuzzleSelect(): void {
  const sel = $("puzzleSelect") as HTMLSelectElement | null;
  if (!sel) return;
  const previous = sel.value;
  const items = listPuzzles();
  sel.innerHTML = "";
  if (items.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no puzzles)";
    sel.appendChild(opt);
    sel.disabled = true;
  } else {
    sel.disabled = false;
    for (const p of items) {
      const opt = document.createElement("option");
      opt.value = p.id;
      const goalLabel =
        p.goal.type === "survive_n_turns"
          ? `survive ${p.goal.n}`
          : p.goal.type === "clear_enemy_board"
            ? "clear board"
            : "lethal";
      opt.textContent = `${p.title} · ${goalLabel} · ≤${p.turnLimit}T`;
      sel.appendChild(opt);
    }
    if (previous && items.some((p) => p.id === previous)) {
      sel.value = previous;
    }
  }
  updatePuzzleButtons();
}

function selectedPuzzleId(): string | null {
  const sel = $("puzzleSelect") as HTMLSelectElement | null;
  if (!sel || !sel.value) return null;
  return sel.value;
}

function updatePuzzleButtons(): void {
  const has = !!selectedPuzzleId();
  for (const id of ["loadPuzzleBtn", "deletePuzzleBtn", "exportPuzzleBtn"]) {
    const btn = $(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = !has;
  }
  const snap = getPuzzleSessionSnapshot();
  const retryBtn = $("retryPuzzleBtn") as HTMLButtonElement | null;
  if (retryBtn) {
    retryBtn.disabled = snap.status === "idle";
  }
}

function goalLabel(goal: PuzzleGoal): string {
  if (goal.type === "enemy_leader_hp_0") return "Enemy leader to 0";
  if (goal.type === "clear_enemy_board") return "Clear enemy board";
  return `Survive ${goal.n} turns`;
}

function refreshPuzzleStatus(): void {
  const el = $("puzzleStatus");
  if (!el) return;
  const snap = getPuzzleSessionSnapshot();
  el.classList.remove("active", "diverged", "solved");
  if (snap.status === "idle") {
    el.textContent = "Puzzle: none";
  } else if (snap.status === "solved") {
    const best = snap.bestAttempt
      ? ` · best ${snap.bestAttempt.cardsPlayed}c/${snap.bestAttempt.ppSpent}pp`
      : "";
    el.textContent = `Solved: ${snap.title} · ${snap.cardsPlayed}c/${snap.ppSpent}pp${best}`;
    el.classList.add("solved");
  } else if (snap.status === "failed") {
    el.textContent = `Failed: ${snap.title} · ${snap.failReason ?? "limit"}`;
    el.classList.add("diverged");
  } else {
    el.textContent = `Puzzle: ${snap.title} · ${snap.turnsUsed}/${snap.turnLimit}T · ${goalLabel(snap.goal!)}`;
    el.classList.add("active");
  }
  updatePuzzleButtons();
  updatePuzzleOverlay();
}

function updatePuzzleOverlay(): void {
  const snap = getPuzzleSessionSnapshot();
  let overlay = $("puzzleResultOverlay");
  if (snap.status !== "solved" && snap.status !== "failed") {
    if (overlay) overlay.style.display = "none";
    return;
  }
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "puzzleResultOverlay";
    overlay.innerHTML = `
      <div class="gameover-card puzzle-result-card">
        <div class="gameover-title" id="puzzleResultTitle"></div>
        <div class="gameover-reason" id="puzzleResultReason"></div>
        <div class="gameover-actions">
          <button type="button" id="puzzleOverlayRetryBtn">Retry</button>
          <button type="button" id="puzzleOverlayDismissBtn">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay
      .querySelector("#puzzleOverlayRetryBtn")
      ?.addEventListener("click", () => {
        onRetry();
      });
    overlay
      .querySelector("#puzzleOverlayDismissBtn")
      ?.addEventListener("click", () => {
        if (overlay) overlay.style.display = "none";
      });
  }
  const title = $("puzzleResultTitle");
  const reason = $("puzzleResultReason");
  if (title) {
    title.textContent =
      snap.status === "solved" ? "Puzzle solved" : "Puzzle failed";
  }
  if (reason) {
    if (snap.status === "solved") {
      const best = snap.bestAttempt
        ? `Best: ${snap.bestAttempt.cardsPlayed} cards / ${snap.bestAttempt.ppSpent} PP`
        : "";
      reason.textContent = `${snap.title} — ${snap.cardsPlayed} cards, ${snap.ppSpent} PP. ${best}`;
    } else {
      reason.textContent = `${snap.title} — ${snap.failReason ?? "Failed"}`;
    }
  }
  overlay.style.display = "flex";
}

function promptGoal(): { goal: PuzzleGoal; turnLimit: number } | null {
  const raw = prompt(
    "Goal: lethal | clear | survive N\nExamples: lethal, clear, survive 3",
    "lethal",
  );
  if (raw === null) return null;
  const text = raw.trim().toLowerCase();
  let goal: PuzzleGoal;
  if (text === "lethal" || text === "enemy_leader_hp_0") {
    goal = { type: "enemy_leader_hp_0" };
  } else if (text === "clear" || text === "clear_enemy_board") {
    goal = { type: "clear_enemy_board" };
  } else {
    const m = text.match(/^survive\s+(\d+)$/);
    if (!m) {
      showToast("Goal must be lethal, clear, or survive N");
      return null;
    }
    goal = { type: "survive_n_turns", n: Number(m[1]) };
  }

  if (goal.type === "survive_n_turns") {
    return { goal, turnLimit: goal.n };
  }

  const limitRaw = prompt("Turn limit (solver turns):", "1");
  if (limitRaw === null) return null;
  const turnLimit = Number(limitRaw);
  if (!Number.isInteger(turnLimit) || turnLimit < 1) {
    showToast("Turn limit must be a positive integer");
    return null;
  }
  return { goal, turnLimit };
}

function readSolverSide(): PlayerSlot {
  const sel = $("puzzleSolverSelect") as HTMLSelectElement | null;
  return sel?.value === "second" ? "second" : "first";
}

function onSavePuzzle(): void {
  if (
    !state.gameStarted &&
    state.phase !== "main" &&
    state.phase !== "playing"
  ) {
    // Allow saving mid-practice even if flags vary; still require a real board.
    if (!state.players?.first || !state.players?.second) {
      showToast("Start a game and play into a position first");
      return;
    }
  }
  const title = prompt("Puzzle title:", "Puzzle");
  if (title === null) return;
  const descriptionRaw = prompt("Description (optional):", "");
  if (descriptionRaw === null) return;
  const parsed = promptGoal();
  if (!parsed) return;

  const solverSide = readSolverSide();
  // Snapshot current board as the embedded starting position.
  const position = savePosition(`puzzle:${title.trim() || "Untitled"}`, {
    meta: {
      turnNumber: state.turnNumber ?? 0,
      roundCount: state.roundCount ?? 1,
      activePlayer: state.activePlayer,
      phase: state.phase ?? null,
    },
  });

  const scriptSnap = getScriptRuntimeSnapshot();
  const doc = scriptSnap.doc || getRecordingDocument();
  const input: Parameters<typeof savePuzzle>[0] = {
    title: title.trim() || "Untitled puzzle",
    solverSide,
    turnLimit: parsed.turnLimit,
    goal: parsed.goal,
    position,
  };
  if (descriptionRaw.trim()) input.description = descriptionRaw.trim();
  if (doc) {
    // Prefer a script whose side is the opponent.
    const enemy = solverSide === "first" ? "second" : "first";
    if (doc.scriptedSide === enemy || doc.scriptedSide === solverSide) {
      input.opponentScript = structuredClone(doc);
      input.scriptCursor = scriptSnap.progress?.cursor ?? 0;
    }
  }
  if (!input.opponentScript) {
    showToast(
      "Warning: no opponent script — puzzle is only well-posed if the opponent never acts",
      4200,
    );
  }

  try {
    const record = savePuzzle(input);
    refreshPuzzleSelect();
    const sel = $("puzzleSelect") as HTMLSelectElement | null;
    if (sel) sel.value = record.id;
    updatePuzzleButtons();
    showToast(`Saved puzzle “${record.title}”`);
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function onLoadPuzzle(): void {
  const id = selectedPuzzleId();
  if (!id) return;
  try {
    const puzzle = beginPuzzleAttempt(id);
    showToast(`Puzzle “${puzzle.title}” — ${goalLabel(puzzle.goal)}`);
    adapter.render();
    kickScriptIfNeeded();
    refreshPuzzleStatus();
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function onRetry(): void {
  try {
    if (!retryPuzzleAttempt()) {
      showToast("No active puzzle to retry");
      return;
    }
    showToast("Retry — starting position restored");
    adapter.render();
    kickScriptIfNeeded();
    refreshPuzzleStatus();
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function onDelete(): void {
  const id = selectedPuzzleId();
  if (!id) return;
  const items = listPuzzles();
  const cur = items.find((p) => p.id === id);
  if (!confirm(`Delete puzzle “${cur?.title ?? id}”?`)) return;
  deletePuzzle(id);
  const snap = getPuzzleSessionSnapshot();
  if (snap.puzzleId === id) stopPuzzle();
  refreshPuzzleSelect();
  refreshPuzzleStatus();
  showToast("Deleted");
}

function onExport(): void {
  const id = selectedPuzzleId();
  if (!id) return;
  try {
    downloadPuzzleJson(id);
    showToast("Exported puzzle JSON");
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function onImportFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result ?? "");
      const record = importPuzzleFromJson(text);
      refreshPuzzleSelect();
      const sel = $("puzzleSelect") as HTMLSelectElement | null;
      if (sel) sel.value = record.id;
      updatePuzzleButtons();
      showToast(`Imported “${record.title}”`);
    } catch (e) {
      const msg =
        e instanceof PuzzleSchemaError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      showToast(msg, 3200);
      console.error("[Puzzle] Import failed:", e);
    }
  };
  reader.onerror = () => showToast("Failed to read file");
  reader.readAsText(file);
}

export function initPuzzlePanel(): void {
  const saveBtn = $("savePuzzleBtn");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", () => onSavePuzzle());
  $("loadPuzzleBtn")?.addEventListener("click", () => onLoadPuzzle());
  $("retryPuzzleBtn")?.addEventListener("click", () => onRetry());
  $("deletePuzzleBtn")?.addEventListener("click", () => onDelete());
  $("exportPuzzleBtn")?.addEventListener("click", () => onExport());

  const importBtn = $("importPuzzleBtn");
  const importInput = $("importPuzzleInput") as HTMLInputElement | null;
  importBtn?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file) onImportFile(file);
    importInput.value = "";
  });

  ($("puzzleSelect") as HTMLSelectElement | null)?.addEventListener(
    "change",
    () => updatePuzzleButtons(),
  );

  onPuzzleLibraryChange(() => refreshPuzzleSelect());
  onPuzzleSessionChange(() => refreshPuzzleStatus());
  refreshPuzzleSelect();
  refreshPuzzleStatus();
}

export type { PuzzleDefinition };
