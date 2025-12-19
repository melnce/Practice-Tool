# Architectural Analysis Report

## Executive Summary

This report identifies a critical **System Capability Gap** regarding leader interactions and clarifies the architectural role of displacement operations.

The primary finding is that the engine lacks a **Leader Damage Trigger**, making it impossible to implement reactive effects like "When your leader takes damage." This is not a bug in the damage application logic itself, which is internally consistent, but a missing feature in the event system.

A secondary analysis of the **Death Processing Lifecycle** confirms that direct board mutations in Banish/Bounce modules are **Intentional Displacement Operations**, correctly bypassing death processing to avoid triggering Last Words.

No major "God Object" issues were found with `gameState`, though its global nature requires disciplined access patterns.

## 1. Deep Dive: `cleanupDead` Consistency

**Status**: **Correct by Design**, with clear distinction between Death and Displacement.

### Policy & Invariants
The "Frozen" architecture requires `cleanupDead` to be called **once** after any batch of mutations that could reduce Follower defense to <= 0.
- **Authorized Callers**: Orchestrators (`damage.ts`, `destroy.ts`, `combat.ts`, etc.).
- **Timing**: Post-execution loop.

### Lifecycle Diagram
```
[Op Execution] -> [State Mutation (defense -= X)] -> [cleanupDead()]
                                                         |
                                                         v
                                              [Find Dead (def <= 0)]
                                                         |
                                                         v
                                             [Fire Last Words & Triggers]
                                                         |
                                                         v
                                                [Remove from Board]
```

### Call Site Inventory
| Module | Context | Status |
|--------|---------|--------|
| `damage.ts` | After damage loops | ✅ Compliant |
| `destroy.ts` | After destroy loops | ✅ Compliant |
| `combat.ts` | End of combat | ✅ Compliant |
| `turns.ts` | Start/End of turn | ✅ Compliant |

### Intentional Displacement Operations
The following modules perform direct `splice` operations on board arrays. These are **NOT** violations but intentional architectural patterns:

*   **Banish (`banish.ts`)**
*   **Bounce (`bounce.ts`)**
*   **Return to Deck (`returnHandToDeck.ts`)**

**Why this is safe**:
These operations represent **Displacement**, not Death.
*   They **MUST NOT** call `cleanupDead` because the entities are not "dying" (0 defense).
*   They **MUST NOT** fire Last Words or Death triggers.
*   They correctly handle their own lifecycle events (e.g., `follower_leaves_field`) and state removal.

### Recommendation
**Low Effort / High Impact**: Add a `check-bypass` script that forbids `splice` on board arrays outside of these specific "Displacement" and "Cleanup" modules. This prevents ad-hoc removal logic (which might accidentally skip death triggers) from creeping into other parts of the codebase.

## 2. Deep Dive: System Capability Gap (Leader Damage)

**Status**: **Functional Gap**.

### The Problem
The current Trigger System is fully consistent but incomplete.
*   **`applyLeaderDamage`**: Correctly updates state (`blueHP`/`redHP`), logs events, and checks barriers. It is the single source of truth for leader damage.
*   **Trigger System**: Has no event definition for leader damage. The existing `self_damaged` event is explicitly scoped to **Followers only** (via logic in `src/logic/core/triggers/handlers/self.ts`).

### Consequence
While the current code works perfectly for simple state updates, it blocks the implementation of an entire class of card mechanics:
*   *Impossible to implement*: "When your leader takes damage, draw a card."
*   *Impossible to implement*: "When your leader takes damage, give +1/+1 to all allies."

### Comparison: Follower vs Leader Damage
| Feature | Follower Damage (`dealDamage`) | Leader Damage (`applyLeaderDamage`) |
|---------|--------------------------------|-------------------------------------|
| State Update | ✅ | ✅ |
| Logging | ✅ | ✅ |
| Barrier Check | ✅ | ✅ |
| **Triggers** | ✅ (`self_damaged`) | ❌ **NONE** (Gap) |

### Recommendation
**Architectural Fix**:
1.  **Define Event**: Add a new trigger event `leader_damaged` (or generalize `self_damaged` to accept a `Leader` target).
2.  **Emit Event**: Update `applyLeaderDamage` to fire this new event.
3.  **Enforce**: Ensure all leader damage flows through this primitive (currently does, so this is just maintenance).

## 3. Other Observations

1.  **Direct `splice` in `destroy.ts`**: The `destroy` module performs direct `splice` for **Amulets**, bypassing the standard "mark defense 0 and let cleanup handle it" flow used for Followers. This inconsistency makes Amulet destruction harder to hook into (e.g., "When an amulet is destroyed" triggers rely on manual firing inside `destroy.ts` rather than a unified death processor).
2.  **`gameState` Singleton**: While a "God Object", its usage is fairly disciplined. The main risk is `state.activePlayer` which is implicit/missing in strict typing but relied upon in logic (e.g., `barrier.ts`).

## 4. Top 3 Next Actions

1.  **Close Capability Gap**: Implement the `leader_damaged` trigger event in `applyLeaderDamage`. This enables future reactive mechanics.
2.  **Standardize Amulet Destruction**: Refactor `destroy.ts` to mark Amulets for destruction (e.g., a `pendingDestruction` flag) and let `cleanupDead` handle the removal and trigger firing, unifying the lifecycle.
3.  **Hardening Script for Board Mutation**: Add a CI check that forbids `state.blueBoard.splice(...)` outside of `cleanup.ts`, `banish.ts`, `bounce.ts`, and `transform.ts`.

## 5. Top 3 Things NOT to Touch

1.  **`runEffects` Dispatcher Loop**: It is the core engine. It works. Rewriting it to be "cleaner" introduces massive regression risk for zero user-facing gain.
2.  **`cleanupDead` Timing**: Do not try to make cleanup "reactive" or "immediate". The "batch then cleanup" cadence is crucial for multi-target effect determinism.
3.  **Dependency Injection (`adapter`)**: It looks messy (`// @ts-ignore`), but replacing it with a "proper" DI container is a framework change that yields no gameplay value and risks breaking the UI layer.
