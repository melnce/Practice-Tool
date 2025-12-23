# Targeting Contract & Guard Bypasses

## 1. Handler Responsibilities

Targeted operation handlers (`src/logic/effects/ops/targeted/index.ts`) MUST be **Pure State Mutators**.

### Rules

- **DO verify** targets and inputs.
- **DO mutate** `state` (e.g. `target.attack += 1`, `state.blueShadows--`).
- **DO NOT** trigger UI updates (`adapter.render`).
- **DO NOT** run lifecycle events (`runEffects`, `cleanupDead`, `checkWinCondition`).
- **DO NOT** cleanup targeting state (`pendingTargetEffect`, `selectableFlags`).

### Enforcement

- **Tripwires**: The `guardLifecycle` function throws if any forbidden function is called while a handler is active.
- **Environment**: Tripwires are active in **Development** and **Test** environments only.

## 2. Orchestrator Responsibilities

The Orchestrator (`src/logic/core/resolveTarget.ts`) manages the system lifecycle around the handler.

### Contract

- **Dispatch**: Calls `dispatchTargetedOp(ctx)`.
- **Result "handled"**: The Orchestrator **MUST** perform cleanup (`clearSelectableFlags`), resume pending effects (`runEffects`), and trigger a render.
- **Result "paused"**: The Orchestrator **must NOT** perform cleanup. Ownership is transferred (e.g. to a UI selection modal).

## 3. Guard Bypasses

In rare cases (like `nested_effects`), a handler strictly needs to invoke the lifecycle (e.g. running sub-effects).

### Valid Bypasses

Only the following operations are whitelisted to bypass the guard:

- `nested_effects`
- `safe_but_nested` (Test Only)

### How to Bypass

Use `runWithBypass(() => { ... })` imported from `guards.ts`.
This temporarily disables the guard, runs the callback, and restores the guard.
**Requirement**: The current operation (passed to `startDispatch`) MUST be in the allowlist, otherwise `runWithBypass` throws.
