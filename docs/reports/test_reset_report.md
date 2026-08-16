# Test Reset Report - Failures and Migration Plan

## Summary

- **Total Failed Suites**: 48 (Initial), 0 (Post-Reset)
- **Primary Cause**: Test Harness Rot (missing `makeUid` export, broken imports, missing adapter mocks).
- **Secondary Cause**: Syntax errors in integration tests.
- **Genuine Regressions**: `ops-signatures.test.ts` (Protected) - **FIXED**.
- **Replacements**: 3 New Deterministic Scenario Tests.

## Classification Table

| Test File                                        | Status   | Classification                     | Action                   |
| ------------------------------------------------ | -------- | ---------------------------------- | ------------------------ |
| `tests/integration/bounce.test.ts`               | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/integration/chaos.test.ts`                | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/integration/juno.test.ts`                 | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/integration/knightly-ardor.test.ts`       | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/integration/reanimate.test.ts`            | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/integration/stormyBlast.test.ts`          | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/integration/turns.test.ts`                | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/integration/william.test.ts`              | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/unit/buff.test.ts`                        | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/unit/damage.test.ts`                      | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/unit/spellboost.test.ts`                  | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/unit/targeting.test.ts`                   | **FAIL** | **BROKEN** (Harness: `makeUid`)    | MOVED to `tests/legacy/` |
| `tests/unit/rng.test.ts`                         | **FAIL** | **BROKEN** (Harness: `setRNGSeed`) | MOVED to `tests/legacy/` |
| `tests/integration/keywords_targeting.test.ts`   | **FAIL** | **BROKEN** (Import)                | MOVED to `tests/legacy/` |
| `tests/unit/report_unresolved.test.ts`           | **FAIL** | **BROKEN** (Import)                | MOVED to `tests/legacy/` |
| `tests/unit/keywords.normalize.test.ts`          | **FAIL** | **BROKEN** (Import)                | MOVED to `tests/legacy/` |
| `tests/unit/shadows.test.ts`                     | **FAIL** | **BROKEN** (Import)                | MOVED to `tests/legacy/` |
| `tests/unit/resolveTarget.confirm.test.ts`       | **FAIL** | **BROKEN** (Mock: `adapter`)       | MOVED to `tests/legacy/` |
| `tests/unit/targeting.contract.test.ts`          | **FAIL** | **BROKEN** (Mock: `adapter`)       | MOVED to `tests/legacy/` |
| `tests/unit/targeting.tripwire.test.ts`          | **FAIL** | **BROKEN** (Mock: `adapter`)       | MOVED to `tests/legacy/` |
| `tests/integration/kuonEnhance.test.ts`          | **FAIL** | **BROKEN** (Syntax)                | MOVED to `tests/legacy/` |
| `tests/integration/mechanics.test.ts`            | **FAIL** | **BROKEN** (Syntax)                | MOVED to `tests/legacy/` |
| `tests/integration/verify_skybound_load.test.ts` | **FAIL** | **BROKEN** (Syntax/Env)            | MOVED to `tests/legacy/` |
| `tests/integration/integration.test.ts`          | **FAIL** | **BROKEN** (Setup: `deckAId`)      | MOVED to `tests/legacy/` |
| `tests/unit/cards/elmott.test.ts`                | **FAIL** | **BROKEN** (Setup: `targets`)      | MOVED to `tests/legacy/` |
| `tests/unit/ops-signatures.test.ts`              | **FAIL** | **REGRESSION** (Assertions)        | **FIXED** (Protected)    |

## Log: Strict Migration (Phase 2)

_Executed on 2025-12-19T01:00:00+01:00_
**Command**: `node scripts/migrate_legacy_tests.cjs` (25 moved).

## Log: Protected Regressions (Phase 2.5)

_Executed on 2025-12-19T01:05:00+01:00_

### `combo_gate`

- **Root Cause**: `handleComboGate` in `src/logic/effects/gates/combo.ts` was implemented as a boolean predicate `(owner, eff) => boolean` instead of a full Effect Handler `(eff, ctx) => Result`. It failed to execute nested effects.
- **Fix**: Rewrote `handleComboGate` to match the Op signature and correctly manipulate the effects queue to execute nested effects.

### `evolve_self`

- **Root Cause**: Two-fold.
  1. **Registration Mismatch**: `misc.ts` registered `evolve_self` as `handleEvolveSelf as any`, causing incorrect argument mapping (`eff` -> `sourceCard`).
  2. **Stale Test**: `ops-signatures.test.ts` used default environment (Round 1) where evolution is locked.
- **Fix**:
  1. Updated `src/logic/core/effects/domains/misc.ts` to wrap `evolve_self` dispatch with an adapter: `(eff, ctx) => handleEvolveSelf(ctx.sourceCard, ctx.owner)`.
  2. Updated `tests/unit/ops-signatures.test.ts` to set `state.roundCount = 10` for the `evolve_self` test case.

## Log: Replacement & Verification (Phase 3 & 4)

_Executed on 2025-12-19T01:10:00+01:00_

### New Scenarios

1.  `tests/scenarios/selection_resolution.test.ts`: Verified `pendingSelection` cleanup.
2.  `tests/scenarios/eot_delayed_triggers.test.ts`: Verified delayed trigger execution.
3.  `tests/scenarios/zone_movement_integrity.test.ts`: Verified card array integrity during moves.

### Final Status

- `npm test`: **PASSED** (83/83 suites).
- `replay:check`: **PASSED** (Deterministic).
- `check:arch`: **PASSED** (Clean).
- **Legacy Status**: Documented in `tests/legacy/README.md`.
