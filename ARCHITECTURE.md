# Architecture Overview

This document provides a high-level overview of the game engine architecture and links to detailed module contracts.

## Core Execution Flow

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌────────────┐
│  playCard   │ -> │ effects[]    │ -> │  runEffects   │ -> │ op handler │
│  (pipeline) │    │ (fanfare)    │    │  (dispatcher) │    │ (registry) │
└─────────────┘    └──────────────┘    └───────────────┘    └────────────┘
                                              │
                                              v
                                       ┌─────────────────┐
                                       │ "pending" pause │
                                       │ (target select) │
                                       └─────────────────┘
```

### Key Paths

| Flow | Entry | Key Files |
|------|-------|-----------|
| Play Card | `playCard/<type>.ts` | `follower.ts`, `spell.ts`, `amulet.ts` |
| Effect Dispatch | `runEffects()` | `logic/core/effects/index.ts` |
| Target Selection | `setPendingTarget()` | `logic/core/pendingTarget/` |
| Death Cleanup | `cleanupDead()` | `logic/core/cleanup.ts` |
| Trigger Events | `fireTrigger()` | `logic/core/triggers/` |

### Lifecycle Rules

1. **Effects** run top-to-bottom via `queue.shift()`.
2. **Pending target** pauses the queue until user selects.
3. **cleanupDead()** is called by orchestrators, not ops.
4. **Triggers** fire after state mutations, may enqueue effects.

---

## Key Subsystems

| Module | Contract | Purpose |
|--------|----------|---------|
| Effects Registry | [README](src/logic/core/effects/README.md) | Op registration, dispatch, sealing |
| Ops Standard | [README](src/logic/effects/ops/README.md) | Structure rules for ops modules |
| Triggers | [README](src/logic/core/triggers/README.md) | Event system, listener patterns |
| Targeting | [README](src/logic/core/targeting/README.md) | Pool building, selection UI |
| PendingTarget | [README](src/logic/core/pendingTarget/README.md) | Target selection lifecycle |
| Cleanup | [README](src/logic/core/cleanup/README.md) | Death processing policy |
| CardFilter | [README](src/logic/core/cardFilter/README.md) | Draw/search filter predicates |
| Buff | [README](src/logic/effects/ops/buff/README.md) | Buff application patterns |
| Damage | [README](src/logic/effects/ops/damage/README.md) | Damage calculator policy |

---

## Guardrails

### Commands

```bash
npm run check:arch      # Run all architecture checks
npm run check:boundaries # Boundary + trigger checks
npm run replay:check    # Replay determinism
```

### Check Scripts (`scripts/`)

| Script | Enforces |
|--------|----------|
| `check-buffs.ts` | Buff import restrictions |
| `check-targeting.ts` | Targeting import policy |
| `check-damage.ts` | Damage calculator access |
| `check-cardfilter.ts` | CardFilter module usage |
| `check-cleanupdead.ts` | cleanupDead call allowlist |
| `check-pendingtarget.ts` | pendingTarget write policy |
| `check-effects-registry.ts` | Registry integrity |
| `check-architecture.ts` | Unified runner |

### CI Enforcement

`.github/workflows/ci.yml` runs `npm run check:arch` as a mandatory gate.

---

## Extension Recipes

### Add a New Op

1. Add op name to `src/logic/core/effects/opTypes.ts` (`ALL_OPS`).
2. Add type to `src/core/types.ts` (`EffectOp` union).
3. Register handler in appropriate `domains/*.ts`:
   ```ts
   registerOp("my_op", (eff, ctx) => { ... });
   ```
4. Run `npm run check:arch` to verify.

### Add a New Trigger Event

1. Add key to `src/logic/core/triggers/keys.ts`.
2. Add handler in `triggers/dispatcher.ts` if needed.
3. Call `fireTrigger("my_event", owner, context)` from orchestrator.

### Add a New Targeting Filter

1. Add predicate to `src/logic/core/targeting/filters.ts`.
2. Register in pool builder if it's a new target specifier.

### Add a New Card Filter Key

1. Add to `src/logic/core/cardFilter/types.ts`.
2. Implement in `predicates.ts`.
3. Update `normalize.ts` if needed.

### Add a New Pending Target Flow

1. Use `setPendingTarget({ ... })` from your op.
2. Handle resolution in `resolveTarget.ts` if custom logic needed.
3. See `pendingTarget/README.md` for lifecycle.

---

## Directory Structure

```
src/
├── core/           # State, types, adapter, logger
├── logic/
│   ├── core/       # Engine infrastructure
│   │   ├── effects/    # Dispatcher + registry
│   │   ├── triggers/   # Event system
│   │   ├── targeting/  # Pool building
│   │   ├── pendingTarget/ # Selection lifecycle
│   │   ├── cardFilter/ # Draw filter predicates
│   │   ├── cleanup.ts  # Death processing
│   │   └── playCard/   # Card play pipeline
│   └── effects/
│       └── ops/        # Effect operation handlers
└── ui/             # Rendering (separate layer)
```
