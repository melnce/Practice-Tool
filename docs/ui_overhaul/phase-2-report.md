# Phase 2 — Motion System Report

## A1 — Log payload enrichment

| Site | Fields added | Notes |
|------|----------------|-------|
| `combat.ts:295` attack | `attackerUid`, `defenderUid` | From `attacker` / `defender` locals |
| `combat.ts:147` baneDestroy | `killerUid`, `victimUid` | From `source` / `target` |
| `combat.ts:172,436` drainRestore | `sourceUid` | From `source` / `attacker` |
| `cleanup.ts:274` destroyQueued | `uid` | `c.uid` |
| `cleanup.ts:321` death | `uid` | `c.uid` |
| `cleanup.ts:341` lastWords | `uid` | `c.uid` |
| `countdown/unified.ts:98` countdownChange (card) | `uid` | `card.uid` |
| `counters.ts:117,140` countdownChange (card) | `uid` | `sourceCard.uid` |
| `counters.ts:53+` counterChange | — | **Already had `uid`** |
| `engage.ts:156` countdownZero | — | **Already had `uid`** |
| `countdown/unified.ts:118,132` countdownChange (crest) | — | **Not in scope** — `Crest` has no stable uid (name+owner only) |
| `counters.ts:167` countdownChange (crest) | — | **Not in scope** — same |
| `crest.ts:363` countdownChange (crest) | — | **Not in scope** — same |
| `fuse.loot.ts` fuseConsume | `initiatorUid`, `consumedUids` | From `initiator` / `used` |
| `fuse.forest.ts` fuseConsume | `initiatorUid`, `consumedUids` | From `initiator` / `partners` |
| `fuse.loot.ts` fuseFinalize | `initiatorUid`, `partnerUids` | From `initiator` / `used` |
| `fuse.forest.ts` fuseFinalize | `initiatorUid`, `partnerUids` | From `initiator` / `partners` |
| `fuse.ts` fuseFinalize | `initiatorUid`, `partnerUid` | From `iCard` / `pCard` |
| `fuse.artifact.ts` fuseFinalize (×3) | `initiatorUid`, `partnerUids` | From `initiator` / `partners` |
| `fuseOpen` | — | **Already has `initiatorUid`** |
| `process.ts:160` trigger | `cardUid` | `card?.uid` when present |
| `core/utils.ts:191` draw (per-card) | — | **Already had `uid`** — all `drawCard()` paths emit this |
| `turns.ts:258` / `draw/unified.ts:62` draw (op-level) | — | **No change** — per-card event covers motion; op-level is aggregate metadata |
| `targeted/index.ts` banish/destroy/bounce | — | **Confirmed** — `banishCard()` / `destroyTarget()` / `bounceToHand()` each log uid-bearing primitives independently; name-only targeted logs left unchanged |

## A8/A7 confirmations

- **Draw paths:** Every real card draw goes through `drawCard()` → `logEvent("draw", { uid })` at `core/utils.ts:191`. Turn start, mulligan, draw ops, and multi-draw loops all call `drawCard()`; op-level `{ count }` logs are supplementary only.
- **Targeted destroy/banish/bounce:** `targeted/index.ts` handlers call `destroyTarget`, `banishCard`, `bounceToHand` which emit `destroy`/`banish`/`bounceToHand` with uids before the redundant name-only logs.

## A2 — Memo field matrix

| Chrome field (dom.ts) | Before (`isCardSame`) | After |
|----------------------|------------------------|-------|
| cost gem / shownCost | `cost` only | + `costMod`, spellboost snapshot |
| atk/def plates | `atk`, `def`, `buffs` | + `baseAtk`, `baseDef` |
| stat tints | derived from above | covered by base+stat fields |
| countdown chip | `countdown` | unchanged |
| keyword chips | `keywordsLen` only | + `keywordFlags` (storm/rush/bane/drain/ambush/aura/intimidate/barrier/ward) |
| evolved / super | `evolved` only | + `evoType` |
| engage-ready / used | partial `kwStateHash` | expanded `kwStateHash` + `hasEngage` |
| selectable / selected | `selectable`, `targetSelected` | unchanged |
| ready / exhausted | `attacked`, partial kw | + `canAttackFlag`, `justPlayed` |
| ward dataset | via keywordsLen | + `keywordFlags` |
| playable / glow | PP in `StateArgs` only | + `costMod`, spellboost (PP still in state) |
| class / rarity / type | missing | + `classKey`, `rarity`, `cardType` |
| skybound meter | missing | + `skybound` |
| icarus buff | missing | + `icarusBuff` |
| counters | `counters` | unchanged |
| mulligan | `mulligan` | unchanged |

`tests/ui/memo-coverage.test.ts` — 12 field mutations, each asserts same node repaints.

## Architecture delivered

| Module | Role |
|--------|------|
| `src/ui/motion/motion.ts` | Settings (Normal/Fast/Instant), `motionEnabled()`, `dur()`, `animate()`, gear popover |
| `src/ui/motion/flip.ts` | `captureRects`, `captureElements`, `computeInvertTransform`, `playMoves` |
| `src/ui/motion/classifier.ts` | `classify()`, `drainLog()` → `MotionPlan` |
| `src/ui/motion/playback.ts` | `playExits`, `playEntries`, `playPops`, corpse cap 12 |
| `src/ui/motion/wrapRender.ts` | `wrapRender()` pipeline injected in `boot.ts` |
| `src/ui/styles/motion.css` | FX, hand-slot, settings popover (no legacy `css/*` edits) |

**Hand FLIP:** `.hand-slot` wrapper carries `data-instance-id`; inner `.card` gets `--fan-rot` only.

**Render pipeline:** `captureRects` → `realRender()` → `drainLog` → `classify` → exits → FLIP → entries → pops. Ring gap → instant settle. Mid-action renders animate their own delta.

## Files changed (rationale)

| File | Rationale |
|------|-----------|
| `src/logic/core/combat.ts`, `cleanup.ts`, `triggers/process.ts` | A1 uid enrichment |
| `src/logic/effects/counters.ts`, `countdown/unified.ts` | A1 card countdown uids |
| `src/logic/effects/ops/fuse/*.ts` | A1 fuse consume/finalize uids |
| `src/ui/zones/memoization.ts` | A2 memo convergence |
| `src/ui/zones/index.ts` | Hand `.hand-slot` wrapper for FLIP |
| `src/ui/drag.ts`, `handlers.ts` | `dataset.uid` fallback for hand cards |
| `src/ui/styles/arena.css` | Remove fan rotation from `.card` (moved to wrapper) |
| `src/ui/styles/motion.css` | New motion styles |
| `src/ui/motion/*` | Motion system |
| `src/boot/boot.ts` | Wrap render, import motion.css, wire settings |
| `index.html` | Motion gear popover in control panel |
| `tests/ui/*.test.ts` | motion-guard, flip-math, classifier, memo-coverage; cross-zone hand-slot |
| `docs/ui_overhaul/phase-2-report.md` | This report |

## Test output

```
tests/ui:        31 passed (7 files)
tests/mechanics: 305 passed
test:audit:      passed
check:cards:     passed
build:           passed
test:e2e:        10 passed
```

## E2e failures (resolved)

Initial run: **6 failed** — all `TypeError: 'var(--ease-out)' is not a valid value for easing` (WAAPI does not accept CSS variables). **Classified: behavioral** (motion implementation bug, not selector drift). Fixed by resolving token easings to cubic-bezier literals in `motion.ts`. Re-run: **10/10 passed**, zero console errors.

## Durations outside token scale

- **Draw arc / bounce fly:** `--dur-slow` (320ms) — arc trajectories need slightly longer than `--dur-base` for readability.
- **Damage/heal pops:** `--dur-cine` (650ms) — floating numerals need hang time before fade.

All other FX use `--dur-fast` (120ms), `--dur-base` (200ms), or `--dur-slow` (320ms).
