# UI Overhaul Phase 1 — Recon Report

Generated: 2026-06-12. Read-only survey of pre-overhaul architecture, with gate assessment for keyed reconciliation.

---

## 1. Render Model

### Entry points

| Entry | File:Line | Role |
|-------|-----------|------|
| `src/boot/boot.ts` | 6–7, 34–70 | DOMContentLoaded: `injectAdapter({ render, … })`, initial `render()`, hotkeys, god-mode buttons |
| `src/core/adapter.ts` | 14–40 | `adapter.render` default no-op; browser injects real `render` |
| `src/ui/render.ts` | 19–142 | **Primary render function** — headers, zones, leaders, PP boost, selection mode, evo UI, crests, history lists |

Engine and history call `adapter.render()` after state mutations (`src/core/history.ts:236,256,354,369`; `src/logic/mulligan.ts:49,99,149,177`; `src/logic/core/resolveTarget.ts:47,53,99`; fuse/play paths, etc.).

### State change → DOM pipeline

```
engine mutation → adapter.render() / doAction(autoRender)
  → render() [render.ts:19]
    → renderZone() per hand/board [zones/index.ts]
      → getMemoizedViewModel() [memoization.ts:107]
      → createCardElement / updateCardElement [dom.ts]  (Phase 1)
      → attachHandlers() once per node [handlers.ts]
    → updateCounts, updateEvoButtonsUI, leader/crest/history helpers [render.ts, counts.ts, evo.ts]
```

**Pre-Phase-1 zone strategy** (`zones/index.ts`, prior revision): keyed by `dataset.uid`, but **replaced entire card nodes** when memoized VM reference changed (`replaceChild`). History/crest zones used `innerHTML = ""` full wipe (`render.ts:180,354`).

**Phase 1 change**: `reconcileZone()` (`src/ui/render/reconcile.ts`) reuses nodes by `data-instance-id`, `update()` applies deltas only. Board uses five persistent `.field-slot` children (`zones/index.ts`).

### Render triggers (non-exhaustive)

- Every `doAction` commit with `autoRender: true` (`history.ts:236`)
- Explicit `adapter.render()` from logic (mulligan, fuse, resolveTarget, deckLoader, utils draw/burn)
- God-mode buttons in `boot.ts:87–170`
- Post-evolve `rerender()` callback in `drag.ts` (evo drop)
- Initial page load `boot.ts:70`

No `requestAnimationFrame` debounce in TypeScript path (legacy `gamelogic/evolveUtils.js` had RAF debounce; TS `src/logic/evolveUtils.ts` does not).

---

## 2. Identity

### Card instance IDs

- Engine assigns **`card.uid`** per instance (`src/core/types/cards.ts:24`; created during deck load / summon).
- UI exposed via **`div.dataset.uid`** in `dom.ts` (pre-overhaul `zones/dom.ts:26`).
- Phase 1 canonical key: **`data-instance-id`** (`reconcile.ts`, `dom.ts`).

### State read path

- `render()` reads `state` from `src/core/gameState.js` singleton (`render.ts:9`).
- Zones receive `CardInstance[]` from `state.players.{first,second}.hand|board` (`render.ts:34–41`).
- Each `CardInstance` carries `uid` — **no engine edit required** for stable keys.

### Memoization

`memoization.ts` caches `CardViewModel` per `CardInstance` object (WeakMap). VM includes `uid: card.uid` (`viewModel.ts:225`). Cache invalidation tracks card stats, selection flags, turn, pending target op, etc.

---

## 3. Presentation Event Surface

### A. `logEvent(type, details)` — `src/core/logger.ts:168`

In-memory ring buffer `_log[]`; mirrored to console. Entry shape:

```ts
{ id, ts: gameTick, type, session, turn, activePlayer, details, stateHash }
```

`getLogs()`, `downloadLogs()`, `window._gameLog` for inspection. UI does **not** subscribe today; Phase 2 can poll/subscribe.

**Event types observed in codebase** (emission sites in `src/`):

| Category | Types |
|----------|-------|
| Game lifecycle | `gameStart`, `mulliganStart`, `mulligan`, `startFirstTurn`, `startTurn`, `endTurn`, `resetStateInstance`, `deckLoad` |
| Card play | `playCard:start`, `playCard:outcome` |
| Draw/burn/deck | `draw`, `burn`, `deckout`, `discard`, `add_to_hand`, `add_to_hand_notFound`, `add_to_hand_noTarget`, `search`, `search_noFilter`, `search_noMatch`, `deckReplace`, `deckReplaceFromSet` |
| Combat | `attack`, `attackLeader`, `baneDestroy`, `drainRestore`, `piercingPing` |
| Damage/heal | `damage`, `damage_select`, `damageRandom`, `damageSplitDone`, `restoreLeader`, `restoreFollower`, `restore_unknown_target`, `restore_store_variable` |
| Destroy/banish/bounce | `destroy`, `destroy_select`, `destroyQueued`, `destroySelf`, `banish`, `banish_select`, `banishSelf`, `banishOnDeath`, `banish_all_copies_no_selected`, `bounce`, `bounceToHand`, `returnToDeck`, `returnToHand_select`, `returnHandToDeck`, `returnHandToDeckAll`, `returnHandToDeck_select`, `death`, `lastWords` |
| Stats/cost | `buff`, `buffSelf`, `buffHand`, `buffLastAddedToHand`, `buffsCleared`, `setStats`, `doubleStats`, `doubleStatsAllies`, `costChange`, `costChangeBulk`, `cost_select`, `comboAdd`, `comboRepeatBuff` |
| Evolve | `evolve`, `evolve_select`, `evolveCount`, `superEvolve` |
| Countdown/counters | `countdownChange`, `counterChange`, `countdownZero` |
| Fuse | `fuseOpen`, `fuseBlocked`, `fuseConsume`, `fuseFinalize` |
| Engage/sacrifice | `engageStart`, `engageSkipped`, `ppSpend`, `sacrifice` |
| Triggers | `trigger`, `triggerDeduped`, `triggerSkip` |
| Gates/conditions | `gate`, `gateBranch`, `necromancySpend`, `necromancyBlocked`, `highlanderCheck` |
| Choose/mode | `chooseOpen`, `choosePick`, `chooseFinalize`, `earthRiteFizzle` |
| Summon | `summon`, `summonFromHand`, `summonExactCopy`, `summonRandom`, `summon_unknown_source`, `summon_hand_unhandled`, `reanimatePick`, `reanimateSummon`, `reanimateNoTargets`, `reanimateNoCandidates`, `chainSpawn`, `invoke` |
| Leader | `leaderDamage`, `leaderDamageResistMod`, `leaderDamageCapped`, `setLeaderMaxHP`, `leaderBarrierGrant`, `leaderBarrierPop`, `leaderEffectExpired`, `modifyLeaderDamageReceived`, `setLeaderMaxDamageCap` |
| Crest | `gainCrest`, `crestExpire`, `crestComplete`, `crestDestroy`, `crestLastWords` |
| Resources | `recoverPP`, `recoverEP`, `boost` |
| Transform | `transform`, `transformInHand`, `transformRandomInHand`, `transformTarget`, `transformHandTarget` |
| Spellboost | `spellboost` |
| Targeting confirm | `targetsConfirmed` |
| History meta | `history_commit`, `history_step`, `history_undo`, `history_redo` |
| Misc | `repeatExpand`, `spellboost`, `attacksPerTurn`, `setLeaderMaxHP`, `earthConsume`, `earthSigilDestroyed`, `burn_to_grave`, `leader_restored` (via trigger path) |

### B. `fireTrigger(eventName, activePlayer, context)` — `src/logic/core/triggers.ts:57`

Union `TriggerEventName` in `src/logic/core/triggers/types.ts:22–60`:

`start_of_turn`, `end_of_turn`, `strike`, `follower_strike`, `leader_strike`, `clash`, `ally_follower_attacked`, `enemy_follower_attacked`, `leader_attacked`, `leader_damaged`, `leader_restored`, `ally_follower_enter`, `enemy_follower_enter`, `ally_follower_played`, `ally_follower_leaves_field`, `enemy_follower_leaves_field`, `ally_ward_destroyed`, `enemy_follower_defense_down`, `self_damaged`, `self_buffed_up`, `ally_super_evolve`, `enemy_super_evolve`, `engage`, `on_fuse`, `loot_fused`, `loot_played`, `invoke`, `select_mode`

`TriggerContext` (`types.ts:71+`) carries object refs **and** `*Uid` fields for determinism.

Processed in `dispatcher.ts` → `process.ts` (`logEvent("trigger", …)` at `process.ts:160`). UI does not listen.

### C. Adapter UI hooks — `src/core/adapter.ts`

| Method | Called from | Purpose |
|--------|-------------|---------|
| `render()` | history, logic | Full UI refresh |
| `showChoiceModal(options, cb)` | `mode.ts:210` | Choose / Modes dialog |
| `showTargetConfirmationButton(vm)` | `resolveTarget.ts:174` | Multi-select confirm |
| `hideTargetConfirmation()` | `resolveTarget.ts:86` | Clear confirm UI |
| `triggerConfirmButtonClick()` | logic (programmatic confirm) | Auto-confirm |

### D. `state.pendingTargetEffect` — interactive selection

Set via `src/logic/core/targeting.ts:138` (`highlightSelectable` at 151). Shape in `src/core/types/game.ts:47+`. UI reads:

- `card.__uiSelectable` / `__mulliganSelectable` flags on instances
- `pendingTargetEffect.targetUids`, `.targets`, `.canTargetLeader`
- `body.select-mode` class toggled in `render.ts:108–112`

### E. History / undo — `src/core/history.ts`

`onHistoryUpdate` callback (wired in `boot.ts:79–84`) for undo/redo button state only.

### F. No dedicated battle-log bus

“Battle log” in Phase 1 maps to the **left history drawer** (`index.html` history lists + `renderListIfPresent` in `render.ts:122–125`). Content = played/destroyed card aggregates, not `logEvent` stream.

---

## 4. Input Handler Map

| Interaction | File:Line | Attachment | State capture |
|-------------|-----------|------------|---------------|
| Hand left-click (fuse) | `handlers.ts` (dragClickGuard.attach) | per-node once | **Fixed Phase 1**: reads `state` + `uid` at fire time; legacy test fallback via `fuseCardFallback` WeakMap |
| Hand right-click (play) | `handlers.ts` contextmenu listener | per-node once | **Fixed**: `onPlayByUid(uid)` → index resolved in `render.ts` at click |
| Hand dragstart | `drag.ts:enableCardDragFromHand` | `div.ondragstart` | **Fixed**: reads `div.dataset.instanceId` at drag |
| Board drop (hand→board) | `drag.ts:enableBoardDropForOwnSide` | container `ondrop` once | **Fixed**: reads `state` at drop, resolves hand index by uid |
| Attack drag | `drag.ts:enableAttackerDrag` | `div.ondragstart` | **Fixed**: `resolveIndex()` at drag time |
| Attack drop (follower) | `drag.ts:enableEnemyFollowerDrop` | `div.ondrop` | **Fixed**: `resolveDefenderIndex()` at drop; live `state` for ward check |
| Attack drop (leader) | `drag.ts:makeLeaderDroppable` | `leaderEl.ondrop` | **Fixed**: live `state.activePlayer` |
| Evo button drag | `evo.ts:57–64` | per-button `ondragstart` | Reads disabled at drag (closure: button id only) |
| Evo drop on follower | `drag.ts:enableCardEvoDrop` | `div.ondrop` | **Fixed**: card uid from `div.dataset.instanceId` at drop |
| Engage (amulet) | `handlers.ts` contextmenu | per-node once | **Fixed**: live board + PP + engage flags; index resolved at fire |
| Mulligan toggle | `handlers.ts` click | per-node | uid → `actions.handleMulliganToggle` (logic finds card) |
| Mulligan confirm | `mulligan.ts:193,199` | `btn.onclick` per show | Calls `confirmMulligan(owner)` — live state |
| Target select (card) | `handlers.ts` click | per-node | uid → `resolvePendingTarget` |
| Target select (leader) | `render.ts:56–61` | **`enemyLeader.onclick` every render** | Re-bound each render; handler calls logic (no index) |
| Target confirm button | `targeting.ts:25` | per-show `addEventListener` | `vm.onConfirm` callback from logic |
| Choose/Modes | `choiceModal.ts:27–34` | per-modal buttons | `callback(index)` from logic |
| End turn | `index.html` onclick globals | HTML inline | `endTurnBlue`/`endTurnRed` → `turns.ts` |
| Bonus PP | `index.html` `useRedBoost()` | inline | `logic/boosts.ts` |
| Fuse partner select | logic-driven `__uiSelectable` + same click handler | per-node | uid-based |
| History drawer | `index.html:437–477` | toggle/scrim listeners | DOM only |
| Context menu suppress | `boot.ts:177–190` | document capture | DOM filter |
| God mode | `boot.ts:87–170` | `wireClick` once | Mutates `state` then `render()` |

### Drag-click suppressor (invariant)

`src/ui/zones/dragClickGuard.ts:12–33` — **unchanged**. Tests: `tests/mechanics/hand-drag-click-guard.test.ts` (5 cases).

---

## 5. CSS Organization

| File | Role |
|------|------|
| `css/base.css` | Global resets, typography base |
| `css/buttons.css` | Button primitives |
| `css/cards.css` | Legacy card layout, keywords, glow (~1100 lines) |
| `css/layout.css` | Zones, leaders, board, turn controls |
| `css/utility.css` | Helpers |
| `css/modern-theme.css` | `--bg-1`, `--panel`, sticky header overrides |
| `css/animation.css` | Motion (referenced by legacy) |
| `index.html` inline `<style>` | Drawer/hamburger/history list |

**Phase 1 additions** (loaded from `boot.ts`):

- `src/ui/styles/tokens.css` — canonical variables
- `src/ui/styles/arena.css` — layout, slots, leaders, turn UI
- `src/ui/styles/chrome.css` — card/board `data-*` presentation

**Conventions**: legacy hex/rgba still in older CSS files; Phase 1 new code uses tokens only. Many legacy rules in `cards.css` overlap (`.can-attack`, `.ward-overlay`) — retained for compatibility; chrome.css takes precedence where attributes overlap.

**Dead / low-use**: `.leader-zone`, `.stats-bar`, `.pp-container` in `layout.css` largely superseded by arena plates; `.placeholder` card class rarely emitted.

---

## 6. UI Tests (beyond drag-click guard)

| File | Environment | Coverage |
|------|-------------|----------|
| `tests/mechanics/hand-drag-click-guard.test.ts` | jsdom | 5 suppressor + fuse integration |
| `tests/mechanics/multi-select-ui.test.ts` | node | Target confirmation VM / pending state |
| `tests/mechanics/interactive-target-resolver.test.ts` | node | Target resolution + adapter mock |
| `tests/mechanics/fanfare-select-*.test.ts` | node | Selection pause contracts |
| `tests/mechanics/ralmia-selection.test.ts` | node | Multi-select rules |
| `tests/e2e/*.spec.ts` | playwright | Interactive play, target selection (browser) |
| **Phase 1 new** `tests/ui/reconciler.test.ts` | jsdom | Keyed reconciliation invariants |

---

## 7. Stop-and-Report Gate Assessment

### (a) Handlers closure-capture per-render state?

**Was true pre-Phase-1** for: hand play index (`render.ts` callback), fuse card object (`handlers.ts:77`), board indices in drag/drop (`drag.ts`), engage index, `enableCardEvoDrop` state snapshot, leader onclick rebound.

**Gate status: PROCEED** — fixes applied in UI-only files; handlers read **live `state`** and **uid** at event time. Documented above.

### (b) Render data expose stable instance ids?

**Yes** — `card.uid` on every `CardInstance`. No engine edit needed.

### (c) UI/engine entanglement preventing presentation-only work?

**No** — UI imports `state` and logic via dynamic `import()`; adapter pattern keeps logic free of UI imports. Shared `helpers/` (e.g. `previewHandStats`) used for display math only. Part 1 invariant is honorable.

---

## 8. Phase 1 Listener / State-Read Changes (explicit)

| File | Change |
|------|--------|
| `src/ui/zones/handlers.ts` | Handlers read `state` singleton; uid lookups; legacy 5-arg signature preserved for tests |
| `src/ui/drag.ts` | All drops/attacks read live `state`; uid from DOM; added `wireFieldSlotDragHighlight` |
| `src/ui/render.ts` | Play callbacks resolve index by uid at click; `makeLeaderDroppable` without state arg |
| `src/ui/zones/index.ts` | Reconcile-based render; board slots |
| `src/ui/zones/dom.ts` | `createCardElement` / `updateCardElement`; `data-instance-id` |
| `src/ui/render/reconcile.ts` | **New** keyed reconciler |

`createHandDragClickSuppressor()` and its tests: **untouched.**
