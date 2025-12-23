# Targeting Logic Architecture

**Status:** Architecture Frozen.

This module resolves target queries (strings like `"ally:follower"`, `"selected"`, `"hand"`) into actual arrays of `CardInstance`.
It replaces monolithic logic with a strict 3-stage pipeline: **Parse -> Resolve -> Filter**.

## 1. Module Responsibilities

| File         | Type             | Responsibility                                                                                                        |
| ------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `parser.ts`  | **Parser**       | Converts raw string spec -> `TargetQuery`. Normalizes aliases (e.g. `ally:hand` -> `hand`). Pure string manipulation. |
| `context.ts` | **Resolver**     | Converts `TargetQuery` -> Base `CardInstance[]`. Handles "Contexts" (Zones only). Returns initial set.                |
| `filters.ts` | **Pipeline**     | Applies predicates to the pool. Types, Stats, Tribes, Keywords, Ambush/Aura rules.                                    |
| `index.ts`   | **Orchestrator** | Re-exports members and composes the pipeline. Main entry point.                                                       |

## 2. Dependencies & Guardrails

We enforce **Strict Unidirectional Flow**:

- `parser.ts`, `context.ts`, `filters.ts` **MUST NOT IMPORT EACH OTHER**.
- They are leaf nodes. They only import types/state.
- `targeting.ts` (Orchestrator) is the only file that imports them all.

(Enforced by `scripts/check-targeting.ts`)

## 3. Invariants & Legacy Quirks

**MUST BE PRESERVED for Determinism:**

1. **Ordering**: Hand/Designers/Replay logic expects `[...board]` or `[...hand]` order unless explicitly randomized later. Do not change `getPool` return order.
2. **Ambush / Aura**: Is applied in `filters.ts` ONLY when `env.context.isTargetedEffect` is true.
   - It only blocks _ENEMY_ units.
   - It allows targeting your own Stealthed units (e.g. to buff them).
3. **`selected:*` Chaining**:
   - Nested effects often use `target: "selected"`.
   - Resolution prefers `context.targets` (explicit pass-down) > `state.pending.targets` (global selection).
   - This hierarchy allows "Select A -> Trigger Effect that hits A" flows.

## 4. Extension Rules

| Goal                                | Action                                                               |
| ----------------------------------- | -------------------------------------------------------------------- |
| **New Alias** (e.g. `my_graveyard`) | Add to `parser.ts`. Map it to a supported `side`.                    |
| **New Zone/Context**                | Add to `context.ts` (`CONTEXT_RESOLVERS`).                           |
| **New Filter** (e.g. `has_shield`)  | Add to `filters.ts` (`applyFilters`).                                |
| **New Selection UI Logic**          | Modify `engine.ts` or `selection.ts` (UI layer, not Core Targeting). |

**DO NOT** add logic back into `getPool` or `targeting.ts`. Use the sub-modules.
