// src/boot/boot.ts
// Ensure global handlers (useRedBoost, endTurnBlue/Red) are registered
import * as engine from "../engine.js";

// Entry points
import { render } from "../ui/render.js";
import { wireClick } from "../ui/dom.js";
import { showChoiceModal } from "../ui/choiceModal.js";
import { injectAdapter } from "../core/adapter.js";
import { endTurnBlue, endTurnRed } from "../logic/core/turns.js";
// @ts-ignore
import { useRedBoost } from "../logic/boosts.js";

// Expose globals for UI onclick handlers
(window as any).endTurnBlue = endTurnBlue;
(window as any).endTurnRed = endTurnRed;
(window as any).useRedBoost = useRedBoost;

// Initialize Logic -> UI Adapter
injectAdapter({ render, showChoiceModal });

window.addEventListener("DOMContentLoaded", () => {
    // @ts-ignore
    wireClick("startGameBtn", async () => {
        await engine.startNewGame();
    });

    try { render(); } catch (_) { }

    // Ctrl/Cmd+Z (undo), Ctrl+Y or Cmd+Shift+Z (redo)
    engine.initHotkeys();

    // If you later add buttons with IDs 'undoBtn'/'redoBtn', this will enable/disable them
    engine.onHistoryUpdate(({ canUndo, canRedo }) => {
        const u = document.getElementById("undoBtn") as HTMLButtonElement | null;
        const r = document.getElementById("redoBtn") as HTMLButtonElement | null;
        if (u) u.disabled = !canUndo;
        if (r) r.disabled = !canRedo;
    });
});


// Suppress browser context menu on game surface (cards/boards/leaders/buttons)
document.addEventListener('contextmenu', (e) => {
    const el = e.target as HTMLElement;
    if (
        el.closest('.card') ||
        el.closest('.zone') ||
        el.closest('.leader') ||
        el.closest('.evo-btn')
    ) {
        e.preventDefault();
    }
}, { capture: true });

function toLabel(file: string) {
    return file
        .replace(/^.*\//, '')
        .replace(/\.json$/i, '')
        .replace(/_deck$/i, '')
        .replace(/_/g, ' ');
}

async function listDeckFiles() {
    // 1) Preferred: parse directory listing HTML (works on Live Server/Express/nginx autoindex)
    try {
        const r = await fetch('decks/', { cache: 'no-cache' });
        if (r.ok) {
            const html = await r.text();
            const files = [...html.matchAll(/href="([^"]+\.json)"/gi)]
                .map(m => decodeURIComponent(m[1]))
                .map(name => name.split('/').pop())        // keep only filename
                .filter(name => name && !/manifest\.json$/i.test(name) && !/decks_index\.json$/i.test(name));
            // @ts-ignore
            if (files.length) return [...new Set(files)];
        }
    } catch { }
    // 2) Fallback: decks_index.json (if your deckbuilder created it)
    try {
        const r = await fetch('decks/decks_index.json', { cache: 'no-cache' });
        if (r.ok) {
            const arr = await r.json();
            if (Array.isArray(arr) && arr.length) {
                return [...new Set(arr.map(x => String(x).replace(/^decks\//, '').split('/').pop()))];
            }
        }
    } catch { }
    // 3) Last resort: still show example so UI works
    return ['example_deck.json'];
}

async function populateDeckSelects() {
    const files = await listDeckFiles(); // array of filenames like "Sword_Midrange_deck.json"
    const blue = document.getElementById('blueDeckSelect');
    const red = document.getElementById('redDeckSelect');
    if (!blue || !red) return;

    for (const el of [blue, red]) {
        el.innerHTML = '';
        for (const f of files) {
            if (!f) continue;
            const opt = document.createElement('option');
            opt.value = f.replace(/\.json$/i, '');  // loader tolerates base or full
            opt.textContent = toLabel(f);
            el.appendChild(opt);
        }
    }
}


window.addEventListener('DOMContentLoaded', populateDeckSelects);
