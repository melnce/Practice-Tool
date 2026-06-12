# QA Harness (main branch)

Self-QA Playwright gauntlet for the **legacy UI** on `main`. The `ui-overhaul` branch is frozen; motion-specific checks are stubbed until resume.

## Running

```bash
npm run test:qa    # Playwright project `qa` only
npm run test:e2e   # Original 10 interactive specs (unchanged assertions)
```

Artifacts: `test-results/qa/artifacts/`, HTML report `test-results/qa/html/`, checkpoints `test-results/qa/checkpoints/`.

## Test bridge (`?test=1`)

`window.__svwbTest` is installed by `src/ui/qa/testBridge.ts` when the URL contains `?test=1`.

| API | Notes |
|-----|-------|
| `getState()` | Read-only `GameState` |
| `seedRng(seed)` | `resetGameState(seed)` — same seam as vitest |
| `loadDecks(blue, red)` | In-memory `RawDeck` JSON from `tests/e2e/qa/decks/` |
| `addToHand(player, cardId)` | God arrange |
| `summonToBoard(player, cardId)` | Respects 5-slot cap |
| `setPP` / `setEP` / `setSEP` / `setLeaderHP` | God arrange |
| `advanceToTurn(round, activePlayer?)` | Sets round, PP, EP/SEP gates |
| `render()` / `endTurn()` | UI sync |

RNG: no separate `seedRng` in engine — browser uses `resetGameState` or `#seedInput` + `startNewGame`.

## Portability rules

1. **Selectors only in** `tests/e2e/qa/pageObject.ts` (`SEL` + `SvwbPage`). Scenarios must not use raw CSS.
2. **Assertions on state + DOM only** — never log payload fields (enriched uids live on `ui-overhaul` branch only).
3. **`awaitMotionSettled()`** — no-op stub in `tests/e2e/qa/awaitMotion.ts`; call before every `verifyDomMatchesState`. On `ui-overhaul`, replace with real motion drain.
4. **`verifyDomMatchesState()`** — hand counts, board uid order, leader HP, PP, shadows, EP button labels, visible follower atk/def/countdown.
5. **Console/pageerror** — `qaStep()` fails on any error after each action. One known main-branch dev-guard message from fuse finalize (`clearSelectableFlags` during dispatch) is filtered in `invariant.ts` until the targeting contract fix lands on `ui-overhaul`.

## Deck loader paths

- Production: `loadBlueDeck` / `loadRedDeck` via `fetch(decks/*.json)`.
- QA: `loadDecksFromRaw` in `deckLoader.ts` (in-memory, no fetch).
- In-game `deckReplaceFromSet`: `handleDeck` in `src/logic/effects/deck.ts` only (not used by harness).

## God mode (boot.ts L87–170)

Existing: PP +/-, refill, max PP prompt, EP +/-, refill, evo count, combo, shadows.

Harness extends via `__svwbTest` only (no new god UI buttons required for QA).

## Scenario map

| Id | File | Focus |
|----|------|-------|
| S1 | `gauntlet.spec.ts` | Mulligan, play, attack, turns, lethal |
| S2 | | Targeting, Ralmia multi-select, leader |
| S3 | | Fuse loot / forest / generic / artifact |
| S4 | | EP/SEP, evo drag, bonus PP |
| S5 | | Engage amulet |
| S6 | | 9-hand burn, full board |
| S7 | | Storm, rush keywords |
| S8 | | Input spam stability |

## Branch-only coverage (resume `ui-overhaul` later)

| Check | Hook |
|-------|------|
| FLIP hand-slot wrappers | `awaitMotionSettled` + DOM motion |
| `data-selectable` chrome | page object branch variant |
| Motion speed gear | manual + `prefers-reduced-motion` |
| Log uid-driven FX | classifier on branch; harness stays state/DOM |
| Memo coverage | `tests/ui/memo-coverage.test.ts` on branch |
