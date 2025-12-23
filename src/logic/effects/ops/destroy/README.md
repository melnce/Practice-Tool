# Destroy Module

Unified destroy operations for the Practice Tool.

## Overview

This module handles all card destroy effects through a single unified handler.
Follows the same pattern as the draw and damage modules.

## Architecture

```
destroy/
├── index.ts       - Barrel exports
├── types.ts       - UnifiedDestroySpec, normalization
├── unified.ts     - handleDestroy() entry point
├── primitives.ts  - Protection checks, core destroy logic
└── README.md      - This file
```

## Usage

### Card JSON Format

All destroy effects use `"op": "destroy"` with `distribution` field:

```json
{
  "op": "destroy",
  "target": "enemy:follower",
  "distribution": "direct",  // "direct" | "all" | "random" | "highest"
  "count": 1,                // For random/highest
  "select": 1,               // Require user selection
  "condition": { ... }       // Optional filter
}
```

### Distribution Modes

| Mode    | Description                       |
| ------- | --------------------------------- |
| direct  | Destroy specific target (default) |
| all     | Destroy all matching targets      |
| random  | Random target selection           |
| highest | Destroy target with highest stat  |

### Special Scopes

| Scope          | Legacy Op                   |
| -------------- | --------------------------- |
| self           | destroy_self                |
| allied_amulets | destroy_allied_amulets      |
| defender       | destroy_defender_if_damaged |

### Examples

**Targeted destroy:**

```json
{ "op": "destroy", "target": "enemy:follower", "select": 1 }
```

**Destroy all:**

```json
{ "op": "destroy", "target": "enemy:follower", "distribution": "all" }
```

**Random destroy:**

```json
{
  "op": "destroy",
  "target": "enemy:follower",
  "distribution": "random",
  "count": 2
}
```

**Destroy highest attack:**

```json
{
  "op": "destroy",
  "target": "enemy:follower",
  "distribution": "highest",
  "stat": "attack"
}
```

**Destroy with follow-up effects:**

```json
{
  "op": "destroy",
  "target": "ally:card",
  "select": 1,
  "effects": [{ "op": "draw", "count": 1 }]
}
```
