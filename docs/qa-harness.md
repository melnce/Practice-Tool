# QA Harness (main branch)

Self-QA Playwright gauntlet for the **legacy UI** on `main`. The `ui-overhaul` branch is frozen; motion-specific checks are stubbed until resume.

## Running

```bash
npm run test:qa    # Playwright project `qa` only (10 tests)
npm run test:e2e   # Original 10 interactive specs (unchanged assertions)
```

Artifacts: `test-results/qa/artifacts/`, HTML report `test-results/qa/html/`, checkpoints `test-results/qa/checkpoints/`.

## Test bridge (`?test=1`)

`window.__svwbTest` is installed by `src/ui/qa/testBridge.ts` when the URL contains `?test=1`.

| API | Notes |
|-----|-------|
| `getState()` | Read-only `GameState` |
| `seedRng(seed)` | `resetGameState(seed)` — same seam as vitest |
| `loadDecks(blue, red, { drawOpening? })` | In-memory `RawDeck` JSON from `tests/e2e/qa/decks/` |
| `addToHand(player, cardId, count?)` | God arrange |
| `addToDeck(player, cardId, count?)` | God arrange (Last Words draw, etc.) |
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
5. **Console/pageerror** — `qaStep()` fails on any error after each action.

### Console filters (standing rule: every filter appears in every report)

| Exact match substring | Reason | Remove when |
|----------------------|--------|-------------|
| `Targeted op handler illegally invoked lifecycle function: clearSelectableFlags` | Dev-guard during fuse finalize on legacy main | `ui-overhaul` targeting contract lands |

## Deck loader paths

- Production: `loadBlueDeck` / `loadRedDeck` via `fetch(decks/*.json)`.
- QA: `loadDecksFromRaw` in `deckLoader.ts` (in-memory, no fetch).
- In-game `deckReplaceFromSet`: `handleDeck` in `src/logic/effects/deck.ts` only (not used by harness).

## God mode (boot.ts L87–170)

Existing: PP +/-, refill, max PP prompt, EP +/-, refill, evo count, combo, shadows.

Harness extends via `__svwbTest` only (no new god UI buttons required for QA). `SvwbPage.god()` clears `pendingTargetEffect` on hand/board reset and applies `setPP` after `advanceToTurn` so Enhance scenarios can pin PP below threshold.

## Scenario map

| Id | Focus |
|----|-------|
| S1 | Real mulligan (`starter_deck`), opening draw, play/attack/turns/lethal |
| S2 | Spell target, cancel invalid, Ralmia multi + 3-cap, leader target |
| S3 | Drag-then-click suppressor, loot/forest/generic/artifact fuse |
| S4 | EP/SEP evo drag, bonus PP early+late, Enhance below/at threshold |
| S5 | Engage, engage no-op same turn, countdown→0→Last Words |
| S6 | 9-hand burn, full board, ward spell, aura spell, intimidate attack block |
| S7 | Storm, rush, bane trade, drain attack/defend, barrier single-pop |
| S8 | Rapid input spam mid-resolution |

## Traceability (gap-closure)

| Mechanic / scenario | Hook | Status |
|---------------------|------|--------|
| Real mulligan | S1 `startGameFull` + `starter_deck` | ✅ gauntlet |
| Opening draw | S1 `loadDecks(..., drawOpening: true)` | ✅ gauntlet |
| Play / attack / turns / lethal | S1 fundamentals | ✅ gauntlet |
| Single-select spell | S2 | ✅ gauntlet |
| Cancel invalid target | S2 `clickInvalidTargetWhilePending` | ✅ gauntlet |
| Ralmia multi-select | S2 | ✅ gauntlet |
| Ralmia 3+ artifact cap | S2 `s2-ralmia-cap-3` | ✅ gauntlet |
| Leader spell target | S2 | ✅ gauntlet |
| S3 drag-then-click suppressor | S3 `dragHandCardThenClick` | ✅ gauntlet |
| Fuse loot / forest / generic / artifact | S3 | ✅ gauntlet |
| EP / SEP evo drag | S4 | ✅ gauntlet |
| Bonus PP early (r4) | S4 | ✅ gauntlet |
| Bonus PP late (r7, commit on end turn) | S4 | ✅ gauntlet |
| Enhance below threshold (2/2) | S4 `10001110` @ 3 PP | ✅ gauntlet |
| Enhance at threshold (5/5) | S4 @ 10 PP | ✅ gauntlet |
| Engage amulet | S5 | ✅ gauntlet |
| Engage no-op same turn | S5 | ✅ gauntlet |
| Countdown→0→Last Words | S5 `10161210` + deck seed | ✅ gauntlet |
| 9-hand burn | S6 | ✅ gauntlet |
| Full board cap | S6 | ✅ gauntlet |
| Ward (spell targets follower) | S6 `10001130` | ✅ gauntlet |
| Aura (spell cannot target) | S6 `10161140` | ✅ gauntlet |
| Intimidate (attack blocked) | S6 `10144120` | ✅ gauntlet |
| Storm face | S7 `10021110` | ✅ gauntlet |
| Rush | S7 `10021120` | ✅ gauntlet |
| Bane mutual trade | S7 `10153110` | ✅ gauntlet |
| Drain attack heals | S7 `10453110` | ✅ gauntlet |
| Drain defend no heal | S7 | ✅ gauntlet |
| Barrier single-pop | S7 `10161120` | ✅ gauntlet |
| Input spam stability | S8 | ✅ gauntlet |
| Hand drag-click guard (unit) | `tests/mechanics/hand-drag-click-guard.test.ts` | ✅ vitest |
| Multi-select UI memo contract | `tests/mechanics/multi-select-ui.test.ts` | ✅ vitest |
| FLIP / motion chrome | `awaitMotionSettled` stub | branch-only (`ui-overhaul`) |
| Memo coverage audit | `tests/ui/memo-coverage.test.ts` | branch-only (`ui-overhaul`) |

## Branch-only coverage (resume `ui-overhaul` later)

| Check | Hook |
|-------|------|
| FLIP hand-slot wrappers | `awaitMotionSettled` + DOM motion |
| `data-selectable` chrome | page object branch variant |
| Motion speed gear | manual + `prefers-reduced-motion` |
| Log uid-driven FX | classifier on branch; harness stays state/DOM |
| Fuse finalize dev-guard fix | remove `clearSelectableFlags` filter in `invariant.ts` |
