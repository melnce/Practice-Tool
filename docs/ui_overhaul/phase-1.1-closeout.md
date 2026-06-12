# Phase 1.1 Closeout — CSS Load Map

## Stylesheets still linked (`index.html`)

| File | Status | Load-bearing selectors / role |
|------|--------|-------------------------------|
| `css/base.css` | **Kept** | `body` reset (`#111` bg superseded by arena); `select, button` base sizing |
| `css/buttons.css` | **Kept** | `.evo-btn`, `.normal-evo`, `.super-evo`, `#endTurnBlue/Red` pill geometry, `#redBoost` base, `.leader-container` inline-flex |
| `css/cards.css` | **Kept** | `.card` 100×150 dimensions; `.keyword-icon*`, `.ward-overlay`, `.ambush-overlay`, `.barrier-overlay`, `.barrier-flash`; hand glow classes (`.playPulse`, `.enhancePulse`, etc. from `computeHandGlow`); legacy `.card-stats` (superseded on board by chrome stat-plates but still on some paths) |
| `css/layout.css` | **Kept** | `#turnControls` positioning (partially overridden by arena); `.board-zone` min-height; `.floating-stats`; crest/history spacing — low conflict with arena |
| `css/utility.css` | **Kept** | `.hidden` only |
| `css/modern-theme.css` | **UNHOOKED** (Phase 1.1) | Was overriding `#appRoot`, `#controlPanel`, `#turnControls`, `.card`, `.select-mode .card.selectable` — migrated essentials to `arena.css` / `chrome.css` |
| `css/animation.css` | **Never linked** | File exists; zero runtime load. Phase 1 zero-motion: not imported. Inline animations remain in `cards.css` (legacy keyword FX) — not Phase 2 motion tokens. |
| `index.html` inline `<style>` | **Kept** | History drawer (`.drawer`, `.hamburger-btn`, `.hist-list`, `.cost-badge`) — no token file yet for drawer |
| `src/ui/styles/tokens.css` | **Kept** (via `boot.ts`) | Canonical variables |
| `src/ui/styles/arena.css` | **Kept** | Layout, slots, leaders, turn UI, control panel, tooltip |
| `src/ui/styles/chrome.css` | **Kept** | Card `data-*` presentation, crests, selection dim |

## Rendered elements must not depend on `modern-theme.css`

Confirmed: link removed from `index.html`. Control panel, turn controls, tooltip, select-mode dim, crest slots covered in arena/chrome.
