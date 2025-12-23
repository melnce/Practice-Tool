# PlayCard Contract

> Subsystem: `src/logic/core/playCard/`  
> Status: **Maintenance Mode**  
> Last Updated: 2025-12-16

---

## Entry Points

| Function             | Purpose                | Renders | History |
| -------------------- | ---------------------- | ------- | ------- |
| `playCard()`         | Main API for UI/engine | ✓       | ✓       |
| `playCardNoRender()` | Tests, headless mode   | ✗       | ✗       |
| `playCardCore()`     | Raw logic (internal)   | ✗       | ✗       |

---

## PlayOutcome Contract

```typescript
type PlayOutcome =
  | { kind: "blocked"; reason?: string }
  | { kind: "paused" }
  | { kind: "done" };
```

### `blocked`

- **Meaning**: Card cannot be played
- **State**: No mutation (PP, hand, board, history unchanged)
- **Causes**: Wrong turn, insufficient PP, no valid target, cant_play flag, board full

### `paused`

- **Meaning**: Targeting/selection requested mid-play
- **State**: Partial mutation occurred, `state.pendingTargetEffect` is set
- **Next**: Caller must handle target selection, then resolution continues

### `done`

- **Meaning**: Card fully resolved
- **State**: PP paid, card removed from hand, effects executed, history entry added
- **Next**: Caller should render

---

## Ownership Rules

1. **Core logic never renders**  
   `core.ts`, `spell.ts`, `follower.ts`, `amulet.ts` must not import adapter or call render.

2. **Wrapper owns history + render**  
   Only `index.ts` calls `beginAction/commitAction` and `adapter.render()`.

3. **Preflight runs before payment**  
   `canPlayCard()` is called before any state mutation.

4. **ID-based checks only**  
   Card-specific logic uses `CARD_PREFLIGHT[cardId]`, not name comparisons.

---

## When NOT to Use `playCardNoRender`

- In production UI code
- When history tracking is required
- When other systems expect render callbacks

Use `playCard()` for all normal gameplay.

---

## Maintenance Rules

1. Changes to core modules require updating invariant tests
2. New card-specific logic must use card ID, not name
3. UI/render calls must stay in `index.ts` only
4. Run `npm test` before committing any changes
