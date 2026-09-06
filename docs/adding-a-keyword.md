# Adding a new keyword

End-to-end checklist for registering a keyword so card JSON, the engine, UI, replay hashing, and CI stay consistent. Read [`docs/keywords-contract.md`](keywords-contract.md) for runtime semantics.

---

## Asymmetry (read this first)

|                | Unknown **op**                                       | Unknown **keyword**                                                                                                   |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Runtime        | Throws when the effect tree is executed              | Used to be **`console.warn` + no-op** (`apply.ts:279`)                                                                |
| Card-data gate | `check:card-text` / architecture checks on `ALL_OPS` | **`npm run check:keyword-names`** (in `npm run check`) — fails if card JSON references a keyword not in `KEYWORD_MAP` |
| Replay / undo  | N/A (op never runs)                                  | **`src/core/stateHash.ts`** — see below                                                                               |

Adding an op without registering it fails loudly in CI. Adding a keyword handler without updating `stateHash.ts` **silently breaks** replay verification, undo checks, and soak determinism for any game state where that keyword’s runtime fields differ.

---

## Registration map

Every file that must change when adding keyword `<name>` (canonical snake_case key). “Breaks if omitted” = first symptom you hit.

| File                                                                       | What to add                                                                               | Breaks if omitted                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **`src/logic/core/keywords/apply.ts`** — `KEYWORD_MAP`                     | Handler `(card, opts) => { … }`                                                           | Keyword never applied; `check:keyword-names` fails once card data uses the name |
| **`src/logic/core/keywords/registry.ts`**                                  | Literal in `KeywordName` union; alias in `KEYWORD_ALIASES` if printed text differs        | Normalization inconsistent; aliases map to wrong key                            |
| **`src/logic/core/keywords/types.ts`** — `KeywordState`                    | Fields the keyword stores on `card.keywordState`                                          | Type errors; state clobbered or unreadable                                      |
| **`src/logic/core/keywords/has.ts`**                                       | `switch` case and/or keywords-array path                                                  | `has_keyword` filters / targeting miss the keyword                              |
| **`src/logic/core/keywords/remove.ts`**                                    | Branch in `removeKeywordFromSingleCard`                                                   | `remove_keyword` op leaves stale flags                                          |
| **`src/data/keywords.ts`**                                                 | `hasInherent*` helper if evergreen (description line only)                                | Ingest / index pass misses description-only keyword                             |
| **`src/data/cardIndex.ts`** — `processCard`                                | Call inherent helper; copy structured keyword effects (see Last Words / Countdown blocks) | Cards load without flags; wrong countdown/LW wiring                             |
| **`src/core/types/cards.ts`**                                              | Top-level boolean flags if the keyword mirrors to `card.has*`                             | TS types lag runtime shape                                                      |
| **`src/data/cardImplementationStatus.ts`**                                 | Entry in `EVERGREEN_KEYWORDS` if it is rules text without ops                             | Stub cards misclassified; ingest omits keyword string                           |
| **`src/core/stateHash.ts`** — `canonicalizeCard`                           | Flag or `keywordState` field in hash payload                                              | **Replay / undo / soak hash mismatch** — silent                                 |
| **`src/ui/zones/memoization.ts`**                                          | Bit in `keywordOverlayHash` if UI reads a new flag                                        | Board cards fail to re-render when keyword toggles                              |
| **`src/ui/overlays.ts`**                                                   | Icon / overlay branch in `applyKeywordOverlays`                                           | Keyword invisible on board                                                      |
| **`src/ui/tooltipFormat.ts`**                                              | Line styling if new keyword label pattern                                                 | Tooltip renders plain text                                                      |
| **`src/logic/core/playCard/`**                                             | Cost / legality if keyword is an alternate play mode (Accelerate, Enhance, Crystallize)   | Card unplayable or wrong cost                                                   |
| **`src/logic/effects/ops/keyword/unified.ts`**                             | Handler if keyword is granted or manipulated via `keyword` op                             | Scripted keyword ops no-op                                                      |
| **`src/logic/core/combat.ts`**, **`turns.ts`**, **`cleanup.ts`**, triggers | Consumption sites for combat / EOT / death hooks                                          | Keyword applies but never executes                                              |

Also update **`tests/unit/keyword-registration-checklist.test.ts`** — either wire the keyword into `stateHash` expectations or add a named exemption with reason (see that file).

### `stateHash.ts` today

`canonicalizeCard` (`src/core/stateHash.ts:119–139`) hashes **seven** keyword boolean flags:

`hasWard`, `ignoresWard`, `hasBane`, `hasDrain`, `hasStorm`, `hasRush`, `hasBarrier`

It does **not** hash `keywordState`, `hasAmbush`, `hasIntimidate`, `hasLastWords`, countdown, spellboost, engage tiers, accelerate/crystallize/enhance tiers, etc. Fixing this is tracked separately — do not “fix” it inside a keyword PR without an explicit brief.

---

## Scale (empirical)

File counts under `src/` mentioning reference keywords (`.ts` files, ripgrep):

| Keyword      | Files |
| ------------ | ----: |
| `barrier`    |    17 |
| `drain`      |    17 |
| `ambush`     |     8 |
| `accelerate` |     7 |

Evergreen combat keywords touch combat, damage, UI overlays, and memoization. Mechanics keywords (Accelerate, Spellboost, Engage) also touch play-card preflight and alternate-form helpers. Budget more than one file.

---

## Step-by-step

### 1. Choose the canonical key

Use snake_case matching existing entries (`last_words`, `cant_be_destroyed`). Add display aliases to `KEYWORD_ALIASES` (`"last words"` → `last_words`).

### 2. Implement `KEYWORD_MAP` handler

```typescript
// src/logic/core/keywords/apply.ts
my_keyword: (c, opts) => {
  const ks = getKS(c);
  ks.hasMyKeyword = true;
  if (opts?.effects) ks.myKeywordEffects = opts.effects;
},
```

Structured card JSON shape (when not evergreen-only):

```json
{ "name": "MyKeyword", "cost": 2, "effects": [ … ] }
```

### 3. Extend `KeywordState` and card flags

Add fields to `KeywordState` in `types.ts`. If UI or combat reads a top-level `card.hasMyKeyword`, add it to `CardInstance` in `src/core/types/cards.ts`.

### 4. Wire presence and removal

- **`has.ts`** — add a `switch` case if the keyword uses flags outside `keywords[]`.
- **`remove.ts`** — clear flags and `keywordState` bits when `remove_keyword` runs.

### 5. Data layer

- Evergreen: add to `EVERGREEN_KEYWORDS` in `cardImplementationStatus.ts` + `hasInherent*` in `keywords.ts` + call in `cardIndex.ts` `processCard`.
- Structured-only: ensure `applyKeywordsFromList` path handles opts (already routes through `KEYWORD_MAP`).

### 6. UI

- **`overlays.ts`** — icon if shown on board.
- **`memoization.ts`** — include any new flag in `keywordOverlayHash` (see comment at line 45–48).
- **`tooltipFormat.ts`** — only if the keyword needs custom tooltip parsing.

### 7. State hash (mandatory decision)

Either:

- Add the relevant fields to `canonicalizeCard`, **or**
- Add an entry to `STATE_HASH_EXEMPTIONS` in `tests/unit/keyword-registration-checklist.test.ts` with a one-line reason and a link to the follow-up issue.

Do not leave the keyword unmentioned — that hides the blind spot the test exists to surface.

### 8. Play-card / op paths

If the keyword changes how a card is paid for or played:

- `src/logic/core/playCard/preflight.ts`, `cost.ts`, `core.ts`
- `src/helpers/alternateForm.ts`

If granted mid-game via effects:

- `src/logic/effects/ops/keyword/unified.ts`

### 9. CI

```bash
npm run check:keyword-names   # card data ↔ KEYWORD_MAP
npm test tests/unit/keyword-registration-checklist.test.ts
npm run check                 # full gate
```

---

## Current `KEYWORD_MAP` keys (31)

Registered handlers in `apply.ts` today:

`max_damage_cap`, `rush`, `storm`, `ward`, `ignores_ward`, `bane`, `drain`, `intimidate`, `ambush`, `barrier`, `banish_on_death`, `countdown`, `aura`, `taunt`, `last_words`, `cant_be_destroyed`, `trigger`, `rally`, `fanfare`, `strike`, `engage`, `enhance`, `accelerate`, `crystallize`, `spellboost`, `counter`, `skybound_art`, `pixie_enter`, `bleed`, `ally_enter`, `cant_attack`

---

## Related docs

- [`docs/adding-a-set.md`](adding-a-set.md) — ingest + stub trap (`check:card-status`, `cards:verify`)
- [`docs/keywords-contract.md`](keywords-contract.md) — `keywordState` as source of truth
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — op registration (parallel asymmetry for ops)
