# Test Coverage Map

## Protected Coverage (High Confidence)
These areas are guarded by robust, typically deterministic tests that survived the reset.

### 1. State Integrity
- **Guard**: `tests/unit/checkStateIntegrity.test.ts`
- **Scope**:
    - Ensures `CardInstance` validation (correct enums, valid numerical ranges).
    - Checks for duplicate UIDs in active zones.
    - Validates `lastSummoned` and other transient state trackers.
    - Running `checkStateIntegrity(state)` after every test is a mandatory pattern.

### 2. Op Signatures and Determinism
- **Guard**: `tests/unit/ops-signatures.test.ts` (Sets 0-3)
- **Scope**:
    - Minimal verification of every registered Op (Damage, Heal, Buff, Summon, etc.).
    - Ensures input parameters produce predictable output state.
    - Tracks "Golden Invariants" via `tests/unit/op-signature-guard.test.ts`.

### 3. Replay Determinism
- **Guard**: `npm run replay:check`
- **Scope**:
    - Verifies that `GameDispatch` produces identical state sequences across re-runs.
    - Protects the core event loop and `makeUid`/RNG determinism.

## Coverage Gaps (Lost to Legacy)
These areas were covered by tests now moved to `tests/legacy/`. They represent potential blind spots until replacements are active.

### 1. Advanced Targeting Logic
- **Lost Tests**: `tests/unit/targeting.test.ts`, `tests/integration/keywords_targeting.test.ts`, `tests/unit/resolveTarget.confirm.test.ts`
- **Impact**: Logic for complex filters (`subset`, `exclude_keyword`), confirming targets with UI, and multi-stage selection is currently relying solely on "happy path" integration scenarios.

### 2. Turn Lifecycle & Delayed Triggers
- **Lost Tests**: `tests/integration/turns.test.ts`
- **Impact**: Detailed validation of "start of turn", "end of turn", and cleanup phases.
- **Mitigation**: `tests/scenarios/eot_delayed_triggers.test.ts` (New Phase 3) covers the critical "at end of turn" hook.

### 3. Combat Math Edge Cases
- **Lost Tests**: `tests/unit/damage.test.ts`, `tests/unit/buff.test.ts`
- **Impact**: Overflow handling, complex buff stacking order, and interaction with barriers/bane in niche scenarios. 
- **Note**: `damage.calculator.test.ts` (Golden) still covers the core math, but integration-level combat flows are reduced.

### 4. Integration-Level Mechanics
- **Lost Tests**: `mechanics.test.ts`, `chaos.test.ts`, `stormyBlast.test.ts`
- **Impact**: "Real world" interactions between multiple complex cards are less rigorously automated. The Engine is assumed correct if individual Ops are correct (Unit Tests) and Ops integrate correctly (Scenario Tests).
