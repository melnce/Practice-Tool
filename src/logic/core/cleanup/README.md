# Death/Cleanup Orchestration

**Status:** Architecture Frozen.

This module handles the removal of dead (0 or negative defense) followers and triggers their Last Words effects.

## 1. What `cleanupDead` Does

1. Iterates both boards (`blueBoard`, `redBoard`).
2. Identifies followers with `defense <= 0`.
3. For each dead follower:
   - Fires `last_words` triggers.
   - Removes the card from the board.
4. Fires global `on_death` triggers (aura-style effects).

## 2. When To Call `cleanupDead`

Call **ONCE** at the end of each discrete damage/destroy phase:

| Phase                    | Example                                |
| ------------------------ | -------------------------------------- |
| After damage application | `dealDamage(...)` → `cleanupDead()`    |
| After destroy effect     | `handleDestroy(...)` → `cleanupDead()` |
| After combat resolution  | Combat damage → `cleanupDead()`        |
| End of turn cleanup      | `endTurn()` → `cleanupDead()`          |
| After multi-hit effects  | Full sequence → `cleanupDead()` once   |

## 3. When NOT To Call

- **Mid-loop during multi-damage**: Call once after the loop, not per-hit.
- **Inside pure calculation modules**: Never (violates purity).
- **From UI/render code**: Never.

## 4. Allowed Callers (Policy)

Only these orchestrator modules may call `cleanupDead`:

| File                                      | Purpose                  |
| ----------------------------------------- | ------------------------ |
| `ops/damage.ts`                           | Damage ops               |
| `ops/destroy.ts`                          | Destroy effects          |
| `ops/engage.ts`                           | Amulet engagement        |
| `ops/targeted/index.ts`                   | Targeted op dispatch     |
| `ops/buff.ts`, `ops/buff/orchestrator.ts` | Stat buffs that may kill |
| `effects/doubleStats.ts`                  | Stat doubling            |
| `core/turns.ts`                           | Turn phase orchestration |
| `core/combat.ts`                          | Combat resolution        |
| `core/effects/domains/combat.ts`          | Combat effect handlers   |

Other modules must NOT import or call `cleanupDead` directly.

(Enforced by `scripts/check-cleanupdead.ts`)

## 5. Legacy Notes

- Cleanup timing is replay-critical. Do not change WHEN cleanup occurs.
- Some multi-hit effects call cleanup per-hit intentionally (e.g., random damage with Last Words interaction).
