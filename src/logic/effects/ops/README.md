# Ops Module Standard

**Status:** Conventions Frozen.

This document defines the standard structure for effect operations (`ops/`) and their sub-modules.

## 1. Standard Structure

For complex ops (>150 LOC or mixing concerns), split into:

```
ops/<opName>/
├── types.ts        # Types only (pure)
├── normalize.ts    # Normalize specs (pure)
├── calculator.ts   # Pure math/logic
│   or predicates.ts
├── core.ts         # Execution primitives
└── index.ts        # Barrel export

ops/<opName>.ts     # Thin facade/orchestrator
```

For simple ops (<150 LOC, single concern), keep as single file.

## 2. Dependency Direction

| Module                          | May Import                   | Must NOT Import      |
| ------------------------------- | ---------------------------- | -------------------- |
| `types.ts`                      | Core types only              | Anything else        |
| `normalize.ts`                  | types, pure utils            | State, UI, execution |
| `calculator.ts / predicates.ts` | types, pure utils            | State, UI, execution |
| `core.ts`                       | types, normalize, calculator | UI, other ops        |
| `<opName>.ts` (facade)          | All of the above             | —                    |

**Rule**: Pure modules must not import mutation/UI/ops modules.

## 3. When to Split

Split an op into sub-modules when:

- File exceeds **150 LOC**.
- File mixes **>1 concern** (calculation + execution + UI).
- Logic is **reusable** by other ops.

## 4. Existing Examples

| Op                   | Structure                                           | Notes                |
| -------------------- | --------------------------------------------------- | -------------------- |
| `buff/`              | `core.ts`, `orchestrator.ts`, `duration.ts`         | Full split           |
| `damage/`            | `calculator.ts`, `types.ts`                         | Calculator extracted |
| `targeting/` (core)  | `parser.ts`, `context.ts`, `filters.ts`, `types.ts` | Full split           |
| `cardFilter/` (core) | `types.ts`, `normalize.ts`, `predicates.ts`         | Pure filter module   |
| `draw.ts`            | Facade using CardFilter                             | Uses external module |

## 5. Guardrails

Architecture is enforced by:

- `scripts/check-buffs.ts`
- `scripts/check-targeting.ts`
- `scripts/check-damage.ts`
- `scripts/check-cardfilter.ts`

Run all with:

```bash
npm run check:arch
```

## 6. Adding a New Op

1. If simple: single `ops/<opName>.ts`.
2. If complex: create `ops/<opName>/` folder with standard structure.
3. Add guardrail script if purity is critical.
4. Update this README with new example.
