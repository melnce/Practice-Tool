# Main Recovery — Layer Split of `2782efb`

## Why this document exists

The UI overhaul freeze commit `2782efb` squashed **pre-overhaul engine work** and **Phase 1–2 presentation work** into a single parent (`75f4b4e`). Git history has no commit for the engine-only tip. Main was recovered by **layer split**: engine from `2782efb`, presentation from `75f4b4e`.

## Source matrix

| Path                                  | Source                          | Notes                                                              |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `src/logic/**`                        | `2782efb`                       | Full engine layer                                                  |
| `src/core/**`                         | `2782efb`                       | Includes ralmia/targeting/combat fixes                             |
| `src/helpers/**`                      | `2782efb`                       |                                                                    |
| `cards/**`                            | `2782efb`                       | Card data + sync                                                   |
| `tests/audit/**`                      | `2782efb`                       | 569 audit tests                                                    |
| `tests/mechanics/**`                  | `2782efb`                       | 305 mechanics tests incl. guard + hand-trigger-scope               |
| `docs/**` (except `ui_overhaul/`)     | `2782efb`                       | Rulebook, audit reports, llm-guide                                 |
| `docs/ui_overhaul/**`                 | **Excluded**                    | Removed after checkout                                             |
| `src/ui/zones/dragClickGuard.ts`      | `2782efb` verbatim              | Frozen suppressor module                                           |
| `src/ui/zones/handlers.ts`            | `75f4b4e` + patch               | Guard attach only (see below)                                      |
| All other `src/ui/**`                 | `75f4b4e`                       | Legacy rebuild-every-render UI                                     |
| `src/boot/**`, `index.html`, `css/**` | `75f4b4e`                       |                                                                    |
| `src/data/**`                         | `75f4b4e` except `cardIndex.ts` | Harness adds `loadDecksFromRaw` later                              |
| `src/data/cardIndex.ts`               | `2782efb`                       | Required for card stat coercion; audit 569/569                     |
| `tests/e2e/**`                        | `75f4b4e`                       | None at base; harness cherry-pick adds specs                       |
| `package.json`                        | Hand-merge                      | `test:audit`, audit scripts; **no** fontsource                     |
| `vitest.config.ts`                    | Hand-merge                      | `tests/audit/**` excluded; **no** `tests/ui/**`                    |
| `vitest.audit.config.ts`              | `2782efb`                       |                                                                    |
| Audit scripts                         | `2782efb`                       | `check-tokens-sync`, `check-card-text`, `audit-super-evolve-dedup` |

### Excluded from main entirely

- `docs/ui_overhaul/**`
- `src/ui/styles/{tokens,arena,chrome,motion}.css`
- `src/ui/motion/**`
- `src/ui/render/reconcile.ts`
- `tests/ui/**`
- `@fontsource/*` dependencies

## Handlers patch (`75f4b4e` → composed main)

Minimal change: import `createHandDragClickSuppressor` and route hand-card **left-click fuse** through `guard.attach()` instead of a raw `click` listener. Right-click play, target selection, board interactions unchanged. Left-click fuse behavior at `75f4b4e` is preserved; the guard only suppresses the spurious click after an aborted drag.

## Post-recovery UI fix (memoization)

`src/ui/zones/memoization.ts` on composed main: invalidate cached card VMs when `pendingTargetEffect.targetUids`, `__mulliganSelectable`, or `phase`/`mulliganStage` change. Required so legacy UI shows selectable/selected state for multi-select (Ralmia), mulligan toggles, and fuse partner highlights under engine contracts from `2782efb`.

## Import verification

Grep on `src/logic`, `src/core`, `src/helpers`, `tests/audit`, `tests/mechanics`: **no** imports of `src/ui/motion`, `src/ui/render/reconcile`, or `src/ui/styles`. Expected UI import in mechanics: `hand-drag-click-guard.test.ts` → `dragClickGuard.ts`.

## Related branches (unchanged)

- `ui-overhaul@2782efb` — full Phase 1–2 freeze (frozen)
- `qa-harness@419acac` — self-QA harness (cherry-picked after this recovery)
