# Triggers Module

**Contract & Architecture Documentation**

> **Freezing Status:** This module's architecture is frozen. Do not refactor the core flow without a formal request.

## 1. Module Overview

The Triggers module orchestrates the game's event-driven logic (e.g., "Start of Turn", "On Attack", "When Played"). It is designed to be:

- **Deterministic**: Execution order is strict (Crests -> Board -> Hand).
- **Type-Safe**: All events are defined in `TriggerEventName`.
- **Auditable**: Every trigger firing can be traced via `DEBUG_TRIGGERS`.

### Core Responsibilities

- **`triggers.ts`**: The thin **Orchestrator**. It exposes `fireTrigger` as the public API. It delegates to specific sub-modules and does **not** contain event logic itself.
- **`dispatcher.ts`**: Maps `TriggerEventName` -> `EventHandler`. It constitutes the **Registry**.
- **`process.ts`**: The **Engine**. It handles the generic loop: Iteration -> Condition Check -> Tracking -> Execution.
- **`conditions.ts`**: **Filters**. Evaluates common conditions (e.g., `once_per_turn` generic checks, `attack_gte`, `tribe`, etc.).
- **`tracking.ts`**: **State**. Manages deduplication (`once_per_turn`, `loot_fused`) and statefulness.
- **`handlers/*`**: **Domain Logic**. specific logic for event groups (e.g. `combat.ts`, `turn.ts`, `fuse.ts`).

## 2. Invariants (MUST NOT CHANGE)

### a. Execution Order

Strictly enforced in `utils.ts` and `triggers.ts`:

1. **Crests** (Active Player)
2. **Zones/Board** (Active Player usually, but depends on event)
3. **Hand** (Active Player)

Within a group (e.g., Board), order implies timestamp/insertion order unless commonly specified otherwise.

### b. Tracking Semantics

- **`once_per_turn`**: Handled via hidden `__onceByTurn` state on CardInstances.
- **`loot_fused`**: Deduplicated **once per turn per initiator**. This ensures that fusing multiple Loot cards only fires the "On Loot Fuse" effect _once_ for that card.

### c. Legacy Exceptions (DO NOT CLEAN UP)

Certain events bypass standard condition checks for historical or specific gameplay reasons. These are marked with `// LEGACY:` in the code.

- **Clash**: Bypasses standard `evalCommonConditions` because Clash logic is evaluated differently (caller validation).
- **Fusion**: Often skips generic tracking to handle its own specific "one ping" rules.

## 3. Extension Rules

### Adding a new Trigger Event

1. **Types**: Add the new string literal to `TriggerEventName` in `types.ts`.
2. **Handler**: Create a handler in `handlers/` (or reuse `common.ts` if generic).
3. **Dispatch**: Register the specific string to the handler in `dispatcher.ts`.
4. **Constraints**:
   - **NEVER** modify `process.ts` to add event-specific `if (event === "new_thing")` blocks. Use a predicate function in the handler instead.
   - **NEVER** modify `tracking.ts` unless adding a new _global_ tracking mode (rare).

### Adding a new Tracking Mode

- Modify `tracking.ts` only.
- Ensure state is stored on the card instance transiently.

## 4. Debugging

`DEBUG_TRIGGERS` is available entirely for developer tracing. It has zero runtime cost when disabled.

- **Enable**: Run `window.__DEBUG_TRIGGERS.enable()` in console.
- **Logs**: Captures `event`, `card`, `triggerId`, `result` (fire/skip), and `reason`.
- **Access**: View trace via `window.__DEBUG_TRIGGERS.trace`.

## 5. Dependency Guardrails

To preserve modularity, the following import direction rules apply:

1. `tracking.ts` **MUST NOT** import from `handlers/*`.
2. `handlers/*` **MUST NOT** import from other `handlers/*`.
3. `process.ts` **MUST NOT** import from `handlers/*`.
4. `dispatcher.ts` is the **ONLY** core module allowed to import all handlers.

_Note: These rules are enforced via `scripts/check-triggers.ts` (if configured) or should be respected manually._
