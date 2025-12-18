# Damage Module Architecture

**Status:** Architecture Frozen.

This module handles all damage-related operations (dealing damage, overflow mechanics, split damage, random damage).
It separates pure calculation from execution side-effects.

## 1. Module Responsibilities

| File | Type | Responsibility |
|------|------|----------------|
| `calculator.ts` | **Pure** | Resolves damage amounts. Handles overflow detection. No state mutation. |
| `types.ts` | **Types** | `DamageOp`, `DamageContext`, `ResolvedDamage`. |
| `index.ts` | **Barrel** | Re-exports for external consumers. |
| `../damage.ts` | **Orchestrator** | Execution logic: target resolution, apply damage, call cleanup. |

## 2. Invariants (MUST NOT CHANGE)

1. **Overflow Semantics**:
   - `amount_overflow` or `overflow_amount` OVERRIDES `amount` when player is overflowing.
   - `add_amount` is ALWAYS added on top (regardless of overflow state).
   - Calculator never mutates state.

2. **Execution Order**:
   - Targets selected (if `select > 0`) → Amount calculated → Damage applied per-target → `cleanupDead()`.
   - `cleanupDead()` is called exactly once after all damage in a single handler invocation.

3. **Determinism**:
   - Same targets, same order, same amounts for identical game state + RNG seed.

## 3. Dependency Guardrails

(`scripts/check-damage.ts` enforces this)

- `calculator.ts` MAY import: `types.ts`, shared pure helpers (`overflow.js`, `values.js`).
- `calculator.ts` MUST NOT import: game state, cleanup, targeting, UI/adapter.
- `damage.ts` (orchestrator) may import everything needed for execution.

## 4. Purity Invariants

- `calculator.ts` **MUST NOT** mutate state.
- `calculator.ts` **MUST NOT** import from `src/logic/effects/` or any execution/UI modules.

**Policy A (Calculator Import Policy):**
- Only `damage.ts`, `damage/index.ts`, and `targeted/index.ts` may import from `damage/calculator` or `damage/index`.
- Other ops must NOT directly import the calculator.
- (Enforced by `scripts/check-damage.ts`)

## 5. Extension Rules

| Goal | Action |
|------|--------|
| **New overflow/math rule** | `calculator.ts` only. Keep pure. |
| **New damage branching** (e.g., immunity like Ward) | `damage.ts` only. |
| **New damage type** (e.g., "poison") | If pure calc → `calculator.ts`. If execution → `damage.ts`. |

**DO NOT** add state mutation to `calculator.ts`.
