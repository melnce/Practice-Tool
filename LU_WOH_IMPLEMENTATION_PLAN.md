# Lu Woh, Light Personified - Implementation Plan & Handover

## Goal
Implement the "Lu Woh, Light Personified" crest:
> **Crest:** Countdown (2). Whenever an enemy follower with Storm attacks a leader, give it -3/-0 until the end of the turn.

## Architectural Changes Implemented

### 1. New Trigger Event: `leader_attacked`
**File:** `src/logic/core/triggers/types.ts`
- Added `leader_attacked` to `TriggerEventName`.
- This event is distinct from `leader_damaged` (which fires *after* damage).
- **Purpose:** To allow interception of an attack on the leader *before* damage is calculated, specifically for effects like Lu Woh that modify the attacker's stats.

### 2. Trigger Dispatching in Combat
**File:** `src/logic/core/combat.ts`
- **Location:** Inside `_attackLeaderCore` function.
- **Change:**
  ```typescript
  // Fire leader_attacked for the defender (allows crests to react)
  fireTrigger("leader_attacked", defenderPlayer, { attacker });
  ```
- **Context:** The trigger is fired for the `defenderPlayer` (the one being attacked), allowing their Crests/effects to respond.
- **Timing:** Placed *before* `applyLeaderDamage`.

### 3. Targeting Context: `attacker`
**File:** `src/logic/core/targeting/context.ts` & `src/logic/core/targeting/parser.ts`
- **Feature:** Added support for `target: "attacker"` in effect definitions.
- **Logic:**
  - **Parser:** Detects `attacker` keyword.
  - **Resolver:** Looks up `context.attacker` from the trigger context and returns it as the target pool.
- **Why:** Allows the Crest effect ("give **it** -3/-0") to dynamically target the card initiating the attack.

### 4. Trigger Dispatcher Registration
**File:** `src/logic/core/triggers/dispatcher.ts`
- Registered `leader_attacked` to use `handleGenericEvent` (which processes Crests and Board triggers).

---

## The Lu Woh Crest Definition
This is the JSON structure verified to represent the card's logic:

```typescript
const luWohCrestEffect = {
    op: "gain_crest",
    name: "Lu Woh, Light Personified",
    countdown: 2,
    triggers: [
        {
            event: "leader_attacked",
            condition: {
                has_keyword: "Storm", // Only triggers on Storm followers
                is_ally: false       // Only triggers on Enemy followers
            },
            effects: [
                {
                    op: "buff",
                    target: "attacker", // Targets the context.attacker
                    attack: -3,
                    defense: 0,
                    until_end_of_turn: true
                }
            ]
        }
    ]
};
```

---

## Current Status & The "Race Condition" Issue

### The Problem
During testing (`tests/unit/scenarios/lu_woh.test.ts`), the functionality failed:
- **Expected:** Storm attacker gets -3 Attack -> Damage is reduced.
- **Actual:** Storm attacker gets -3 Attack -> Damage is **NOT** reduced (Leader took full damage).

### Root Cause Analysis
The engine's `fireTrigger` pushes effects to a queue (`state.effectQueue` or similar via `processCandidateTriggers`). It does **not** always execute them synchronously immediately if a queue is already processing or if the architecture defers execution.

In `_attackLeaderCore`:
1. `fireTrigger("leader_attacked", ...)` -> Pushes "Buff -3 Attack" to the queue.
2. `applyLeaderDamage(...)` -> Calculates damage using **current** stats (queue hasn't drained yet!).
3. Queue drains -> Attacker gets -3 Attack (too late for this specific damage instance).

### Recommended Fix
You must ensure the effect queue is flushed/processed *between* firing the trigger and calculating damage.

**Option A (Force Execution):**
If the engine supports a "blocking" trigger:
- Verify if `fireTrigger` can be awaited or if there is a `processQueue()` function exposed in `src/logic/core/effects/queue.ts` or `index.ts`.
- Call that processing function immediately after `fireTrigger`.

**Option B (Calculate Damage Late):**
Re-read the attacker's stats *inside* `applyLeaderDamage` or pass a lambda/callback to `applyLeaderDamage` that resolves the damage amount *after* triggers run.
- *Current:* `const damage = effectiveAtk(attacker); applyLeaderDamage(..., damage);`
- *Change:* Pass the `attacker` to `applyLeaderDamage` and let it calculate damage *after* any potential "intercept" triggers have run (if `applyLeaderDamage` were to handle the trigger, which it doesn't currently).

**Preferred Solution (Sync Check):**
In `src/logic/core/combat.ts`:
```typescript
// 1. Fire Trigger
fireTrigger("leader_attacked", defenderPlayer, { attacker });

// 2. FORCE QUEUE DRAIN (Pseudo-code, find actual engine method)
// import { processEffects } from '../effects/index.js';
// processEffects(defenderPlayer);

// 3. Re-calculate Damage
// The buff might have changed the attack!
attacker.attack = parseInt(attacker.attack) || 0; // Refresh from state
const damage = effectiveAtk(attacker);

// 4. Apply
applyLeaderDamage(defenderPlayer, damage);
```

**Verification:**
The unit test `tests/unit/scenarios/lu_woh.test.ts` (which I created) is the perfect reproduction case. Once the "Expected: 18, Received: 15" error is gone, the fix is valid.

---

## Files Changed (Summary)
1. `src/logic/core/triggers/types.ts` (+`leader_attacked`)
2. `src/logic/core/triggers/conditions.ts` (Fallback to `context.attacker`)
3. `src/logic/core/triggers.ts` (Owner calc fallback to `attacker`)
4. `src/logic/core/triggers/dispatcher.ts` (Register handler)
5. `src/logic/core/targeting/parser.ts` (Parse `attacker` target)
6. `src/logic/core/targeting/context.ts` (Resolve `attacker` context)
7. `src/logic/core/combat.ts` (Fire the trigger)

Good luck!
