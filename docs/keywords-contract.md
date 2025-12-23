# Keywords Architecture Contract

This document defines the architectural rules for the keywords system located in `src/logic/core/keywords/`.

## 1. Canonical Naming

- **Single Source of Truth**: All keyword names are defined in `registry.ts`.
- **Normalization**: All external input (JSON, UI) must pass through `normalizeKeywordName`.
- **No Aliases in Logic**: Internal logic must use canonical `KeywordName` values (e.g., `last_words`, not `lastwords`).

## 2. Targeting Decoupling

- **No Direct Mutation**: Keywords modules MUST NOT write to `state.pendingTargetEffect` or call targeting UI helpers (`highlightSelectable`).
- **Request Protocol**: Effects that require user selection must return a `KeywordEffectResult`:
  ```typescript
  type KeywordEffectResult =
    | { kind: "done" }
    | { kind: "request_target"; request: PendingTargetRequest };
  ```
- **Orchestration**: The effect runner (`src/logic/core/effects/index.ts`) is responsible for interpreting `request_target` and updating the global targeting state.

## 3. State Management

- **Structured State**: Keyword data is stored in `card.keywordState` (typed as `KeywordState`), never as ad-hoc properties on `CardInstance`.
- **Initialization**: Use `getKS(card)` helper to access or initialize state safely.

## 4. Module Boundaries

- **Public API**: `index.ts` is the only allowed entry point for consumers.
- **Allowed Imports**: `types`, `registry`, `internal`, `apply`, `remove`.
- **Forbidden Imports**: `src/ui/*`, `src/logic/core/targeting.ts` (except types if needed).

## Example: Requesting a Target

**Incorrect (Legacy):**

```typescript
// BAD: Direct mutation
function handleBadKeyword(eff, owner) {
    state.pendingTargetEffect = { ... }; // PROHIBITED
}
```

**Correct:**

```typescript
// GOOD: Return request
function handleGoodKeyword(eff, owner, targets): KeywordEffectResult {
    if (eff.select) {
        return {
            kind: "request_target",
            request: { eff, owner, pool: targets, ... }
        };
    }
    return { kind: "done" };
}
```
