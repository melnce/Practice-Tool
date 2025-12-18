# Buff Module Architecture

**Status:** Architecture Frozen.

This module implements all "buff" operations (stat changes, keyword granting, attacks per turn settings). 
It replaces the old monolithic `handleBuff` with a modular, orchestrated approach.

## 1. Module Structure & Responsibilities

| File | Type | Responsibility |
|------|------|----------------|
| `orchestrator.ts` | **Router** | Main entry point (`handleBuffOrchestrator`). Handles filtering, selecting randomization, and sequencing the application. |
| `core.ts` | **Logic** | Pure application of stats (`applyStatBuff`), keywords (`applyKeywordBuff`), and post-buff triggers. **State mutation happens here.** |
| `duration.ts` | **Wrapper** | Handles temporary vs permanent logic. Wraps operations to schedule expiration. currently only `until_end_of_turn`. |
| `utils.ts` | **Helpers** | Pure functions for filtering targets (Tribes, Classes, Keywords). |
| `types.ts` | **Contracts** | Defines `BuffOp` and shared contexts. |
| `../buff.ts` | **Facade** | The public API imported by the rest of the engine. Also hosts **legacy specialized handlers** (HandTribe, HandClass). |

## 2. Duration Semantics

- **Temporary**: Currently only `until_end_of_turn` is supported.
- **Location**: Logic lives exclusively in `duration.ts` (`withBuffDuration`).
- **Rule**: Handlers (core/orchestrator) **MUST NOT** implement temporary logic inline. They simply apply the buff, and the wrapper handles tracking/reversion.

## 3. Buff Shapes

The `BuffOp` supports mixed shapes, processed in this order by the orchestrator:
1. **Stats**: `attack`, `defense` (numeric or string if dynamic).
2. **Keywords**: `keywords`, `keyword`, `has_keyword` (for filtering).
3. **Special**: `attacks_per_turn`, `set_attack_to`.

## 4. Extension Rules

| Goal | Where to modification |
|------|-----------------------|
| **New Stat Field** | `core.ts` (`applyStatBuff`), `types.ts`. |
| **New Keyword Logic** | `core.ts` (`applyKeywordBuff`) or core `keywords.ts`. |
| **New Filter** | `utils.ts` (`filterBuffCandidates`). |
| **New Duration** | `duration.ts` ONLY. |
| **New Special Handler** | Add a separate file or function in `../buff.ts` (facade). **DO NOT** mix into `core.ts`. |

## 5. Architectural Guardrails (Enforced by `scripts/check-buffs.ts`)

1. **Isolation**: `core.ts` must **NOT** import `orchestrator.ts` or the facade. It should be a leaf node (dependencies: `types`, `utils`, `logger`).
2. **Duration Control**: `duration.ts` is the **only** Buff module file allowed to import temporary tracking logic (if abstracted).
3. **Unified Entry**: Consumers should import `handleBuff` from the facade (`buff.ts`) or specific handlers, never deeply import `core.ts` directly for main logic.
