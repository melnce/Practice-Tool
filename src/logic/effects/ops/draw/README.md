# Draw Module

Unified draw operations for the Practice Tool.

## Overview

This module handles all card draw effects through a single unified handler.
The design follows the same pattern as the damage module unification.

## Architecture

```
draw/
├── index.ts       - Barrel exports
├── types.ts       - UnifiedDrawSpec, normalization, validation
├── unified.ts     - handleUnifiedDraw() entry point
├── primitives.ts  - Low-level deck/hand operations
└── README.md      - This file
```

## Usage

### Card JSON Format

All draw effects use `"op": "draw"` with optional parameters:

```json
{
  "op": "draw",
  "count": 1,              // number | "all" | "combo" (default: 1)
  "player": "self",        // "self" | "opponent" (default: "self")
  "filters": { ... },      // CardFilterSpec (default: null)
  "mode": "topmost",       // "topmost" | "random" (default: "topmost")
  "keywords": ["Storm"]    // Keywords to apply (default: [])
}
```

### Examples

**Simple draw:**

```json
{ "op": "draw", "count": 2 }
```

**Filtered draw (Adventurers' Guild):**

```json
{
  "op": "draw",
  "count": 1,
  "filters": { "type": "Follower" }
}
```

**Draw by name with keywords (Rusty):**

```json
{
  "op": "draw",
  "filters": { "name": "Rusty, Luxcard Trickster" },
  "count": "all",
  "keywords": ["Storm"]
}
```

**Opponent draws:**

```json
{ "op": "draw", "count": 1, "player": "opponent" }
```

**Combo-based draw:**

```json
{
  "op": "draw",
  "count": "combo",
  "filters": { "type": "Follower" }
}
```

## Filter Specification

The `filters` field uses the CardFilter module. Available predicates:

| Field    | Description                        |
| -------- | ---------------------------------- |
| name     | Exact card name (case-insensitive) |
| type     | "Follower" / "Spell" / "Amulet"    |
| class    | Craft name (e.g., "Swordcraft")    |
| cost_eq  | Cost equals N                      |
| cost_lte | Cost ≤ N                           |
| cost_gte | Cost ≥ N                           |
| tribe    | Has specific tribe                 |

## Implementation Notes

1. **Single entry point:** `handleUnifiedDraw()` handles ALL draw variants
2. **No legacy ops:** Old handlers have been removed
3. **Normalization:** All inputs are normalized to `UnifiedDrawSpec` before processing
4. **Mode precedence:** `mode` only matters when `filters` is specified

## Registration

Registered in `src/logic/core/effects/domains/resources.ts`:

```typescript
import { handleDraw } from "../../../effects/ops/draw/index.js";

registerOp("draw", (eff, ctx) => handleDraw(eff, ctx.owner));
```
