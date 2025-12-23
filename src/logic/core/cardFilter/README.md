# CardFilter Module

**Status:** Architecture Frozen.

A shared, reusable module for filtering card instances by properties (type, cost, stats, tribe, class).
Used by `draw.ts` (tutor effects) and potentially other search/filter effects.

## 1. Module Responsibilities

| File            | Type           | Responsibility                                                    |
| --------------- | -------------- | ----------------------------------------------------------------- |
| `types.ts`      | **Types**      | `CardFilterSpec`, `NormalizedCardFilter`, `CardPredicate`.        |
| `normalize.ts`  | **Normalizer** | Converts raw specs into normalized format. Handles aliases. Pure. |
| `predicates.ts` | **Builder**    | Builds a predicate function from normalized filter. Pure.         |
| `index.ts`      | **Barrel**     | Re-exports for external consumers.                                |

## 2. Supported Filter Keys

| Key                                           | Description                                            |
| --------------------------------------------- | ------------------------------------------------------ |
| `type`                                        | Card type (e.g., `follower`, `spell`, `amulet`).       |
| `class`                                       | Card class (e.g., `forestcraft`, `swordcraft`).        |
| `cost_eq`, `cost_lte`, `cost_gte`             | Cost comparisons.                                      |
| `attack_eq`, `attack_lte`, `attack_gte`       | Attack stat comparisons.                               |
| `defense_eq`, `defense_lte`, `defense_gte`    | Defense stat comparisons.                              |
| `tribe` / `tribes` / `tribe_in` / `tribes_in` | Tribe membership (OR logic: matches ANY listed tribe). |

## 3. Semantics (MUST NOT CHANGE)

1. **Stat Values Used**: CURRENT values (`c.cost`, `c.attack`, `c.defense`), not base values. This preserves existing tutor behavior.
2. **AND Logic**: All specified filters must pass. If `type=follower` and `cost_lte=3`, both must match.
3. **Tribe OR Logic**: If multiple tribes listed, card needs at least ONE matching tribe.
4. **Case Insensitive**: All string comparisons are lowercased.

## 4. Purity Invariants

- `normalize.ts` and `predicates.ts` **MUST NOT** mutate state.
- They **MUST NOT** import from `src/logic/effects/` or any execution/UI modules.
- (Enforced by `scripts/check-cardfilter.ts`)

## 5. Extension Rules

| Goal                           | Action                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| **New filter key**             | Update `types.ts` (add to spec), `normalize.ts` (parse it), `predicates.ts` (apply it). |
| **New alias for existing key** | Update `normalize.ts` only.                                                             |

**DO NOT** add filtering logic into `draw.ts` or other ops.
