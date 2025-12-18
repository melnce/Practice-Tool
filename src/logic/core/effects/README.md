# Effects Registry Module

**Status:** Architecture Frozen.

This module contains the centralized effect dispatcher and op registry.

## 1. How `runEffects` Works

```
effects[] → queue (shallow copy) → while loop → dispatchEffect(op) → handler
```

1. **Queue copy**: Creates a shallow copy to avoid mutation of the caller's array.
2. **Sequential execution**: Processes effects one at a time via `queue.shift()`.
3. **Handler dispatch**: Looks up handler from registry by `eff.op`.
4. **Result handling**:
   - `"pending"` → stops the queue (e.g., awaiting target selection).
   - Anything else → continues to next effect.
5. **Trace integration**: Emits trace events for replay determinism checks.

## 2. Registry Pattern

### Structure
```
registry.ts         - registerOp, getOp, sealRegistry
domains/
├── combat.ts       - damage, destroy, banish, heal ops
├── buffs.ts        - buff, keyword ops
├── board.ts        - summon, transform ops
├── resources.ts    - PP, shadows, crests
└── misc.ts         - select, choose, gates
```

### Registration Flow
1. Domain modules call `registerOp(opName, handler)` at import time.
2. `index.ts` imports all domains (triggers registration).
3. `sealRegistry()` locks the registry.
4. Bootstrap check validates `ALL_OPS` vs registered ops.

## 3. Extension Rules

| To Add | Action |
|--------|--------|
| New op | Add to `opTypes.ts` + register in appropriate `domains/*.ts` |
| New domain | Create `domains/<name>.ts`, export `register<Name>Effects()`, call from `index.ts` |

**Must NOT:**
- Add execution logic directly in `runEffects` (keep it thin).
- Register ops after seal (throws).
- Register duplicate ops (throws).

## 4. Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Ops typed | `registerOp<K>` enforces handler signature |
| No duplicates | Throws on duplicate registration |
| Complete coverage | Bootstrap check compares `ALL_OPS` vs registered |
| Sealed before run | Runtime assertion in `runEffects` |
| Queue order | FIFO (first-in-first-out via `shift()`) |
| Determinism | Effects must not use non-seeded randomness |

(Enforced by `scripts/check-effects-registry.ts`)
