# Pending Target Selection Module

**Status:** Architecture Frozen.

This module centralizes access to `state.pendingTargetEffect`, which manages UI-driven target selection pauses.

## 1. What `pendingTargetEffect` Does

When an op requires user target selection:
1. Op sets `pendingTargetEffect` with pool, count, and resume callback.
2. Engine pauses effect resolution.
3. UI renders selectable targets.
4. User clicks targets → `resolveTarget` executes → clears pending.

## 2. API Functions

| Function | Purpose |
|----------|---------|
| `setPendingTarget(request)` | Initiates a target selection pause |
| `clearPendingTarget()` | Clears pending state after resolution |
| `getPendingTarget()` | Reads current pending state (safe for UI) |
| `isPendingTarget()` | Checks if selection is pending |

## 3. Write Access Policy

**ONLY** these modules may write to `pendingTargetEffect`:

| Module | Purpose |
|--------|---------|
| `core/pendingTarget/*.ts` | Facade functions |
| `core/targeting.ts` | `handleSelect` lifecycle |
| `core/resolveTarget.ts` | Clears after resolution |

**Ops** should call `setPendingTarget()` instead of direct assignment.

(Enforced by `scripts/check-pendingtarget.ts`)

## 4. Read Access

- **UI**: May read via `getPendingTarget()` or direct access for rendering.
- **playCard/***: May call `isPendingTarget()` for pause checks.
- **targeting/context.ts**: May read `targets` during resolution.

## 5. Ops Migration Complete

All ops now use `setPendingTarget()` instead of direct assignment.
The guardrail allowlist is restricted to core lifecycle modules only.
