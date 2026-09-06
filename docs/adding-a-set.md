# Adding a new card set

Executable runbook for ingesting a Worlds Beyond expansion (~100 cards), authoring effects, and keeping CI honest. Read this before touching `cards/sets/`.

---

## Overview

| Step                    | Command                  | Output                                                        |
| ----------------------- | ------------------------ | ------------------------------------------------------------- |
| 1. Ingest collectibles  | `npm run ingest:cards`   | `cards/sets/<setId>_<slug>.json` + auto-rebuild of `all.json` |
| 2. Ingest tokens        | `npm run ingest:tokens`  | Updates `cards/token_details.json` (merge only)               |
| 3. Re-merge (if needed) | `npm run cards:update`   | Rebuilds `cards/all.json` + `cards/index.json` from sets      |
| 4. Sync gate            | `npm run check:cards`    | Byte-exact check that merge matches disk                      |
| 5. Author ops           | (hand-edit set JSON)     | Fanfare / spell / keywords / triggers trees                   |
| 6. Official metadata    | `npm run cards:official` | `cards/official-meta.json` — **after** steps 1–2              |
| 7. Behaviour baseline   | `npm run cards:baseline` | `baselines/card-behaviour.json`                               |
| 8. Verify baseline      | `npm run cards:verify`   | Diff against baseline                                         |
| 9. Upstream drift       | `npm run cards:drift`    | Compare local pool vs DotGG dump                              |

Supporting gates (also in `npm run check` where noted):

- `npm run check:card-status` — fails on `unimplemented` / `unknown_ops` collectibles (**in `check`**, with `--check`)
- `npm run check:card-text-full` — text-vs-JSON mechanical checks (warns for stubs)
- `npm run check:keyword-names` — card-data keywords must map to `KEYWORD_MAP`

`npm run cards:verify` is **not** wired into `npm run check` (see `scripts/card-behaviour.ts` header comment).

---

## 1. `npm run ingest:cards`

Runs `scripts/ingest-cards.ts`, which fetches:

- **Cards:** `https://api.dotgg.gg/cgfw/getcards?game=shadowverse` (`DOTGG_CARDS_URL` in `scripts/lib/ingestCards.ts`)
- **Set names:** `https://api.dotgg.gg/cgfw/getsets?game=shadowverse` (`DOTGG_SETS_URL`)
- **Cross-check (optional):** Cygames CardSet page (`CYGAMES_CARDSET_URL`) — warns on mismatch, does not block

Collectible rows (`setId` matching `100xx`, non-token) are bucketed into per-set files:

```
cards/sets/<setId>_<slug>.json
```

Example: `10009_revenants-of-azvaldt.json`. Slug comes from `setSlug()` on the resolved set name.

After a real write (not `--dry-run`), ingest **auto-runs the compile**: it imports `mergeSetsFromDisk` / `writeMergedCardsToDisk` from `scripts/mergeSets.ts` and rebuilds `cards/all.json` and `cards/index.json`. Pass `--no-cards-update` to skip that rebuild.

### Merge invariant (safe re-runs)

`mergeCardById()` in `scripts/lib/ingestCards.ts` never clobbers authored content:

1. **`AUTHORED_EFFECT_KEYS`** (lines 58–77) — if the key **exists on the existing card** (even as an empty array), ingest keeps it. Keys include `fanfare`, `spell`, `evolve`, `superevolve`, `triggers`, `keywords`, `invoke`, `on_discard`, `fuse`, etc.
2. **`CATALOG_KEYS`** (lines 80–95) — `name`, `cost`, stats, `type`, `class`, `rarity`, `tribes`, `description`, images, `set`, `url` fill **only when absent** on the existing card.
3. **`text_diff`** — if upstream `skill_text` differs from local `description`, ingest logs a `text_diff` change but **does not apply** the new text.

Re-running ingest on an authored set is therefore safe: ops and keywords you wrote stay put; new cards are appended; missing catalog fields get filled.

### Manual ingest edits (when upstream lags)

**`SET_NAME_FALLBACKS`** (`ingestCards.ts:42–45`) — when DotGG `set_name` is missing, the set display name falls back to the map entry, else the raw set id. Without an entry, set `10010` becomes `"[10010] 10010"` and the file `10010_10010.json`. Set `10009` already has `"Revenants of Azvaldt"`.

**`CARD_TYPE_OVERRIDES`** (`ingestCards.ts:51–55`) — correct DotGG `Spell` mislabels for Engage / Countdown / Last Words amulets (three ids hardcoded today).

Useful flags:

```bash
npm run ingest:cards -- --dry-run          # plan only
npm run ingest:cards -- --sets 10010       # one set
npm run ingest:cards -- --fixture scripts/fixtures/dotgg-cards-sample.json
```

---

## 2. `npm run ingest:tokens`

Runs `scripts/ingest-tokens.ts`. Fetches the same DotGG dump, targets token set `90000` (Basic A) and any token ids referenced by summon / add_to_hand / crest ops in the main pool.

Output file: **`cards/token_details.json`**.

This file is **hand-maintained between ingests** — same merge-by-id rules as set files. Ingest adds or fills missing token stubs; it does not overwrite authored token ops. Many token definitions still need manual authoring after ingest.

---

## 3. `npm run cards:update` and `npm run check:cards`

`npm run cards:update` runs `scripts/mergeSets.ts`: reads every `cards/sets/*.json`, concatenates into `cards/all.json`, writes `cards/index.json` (set id → file path map).

Run this after hand-editing set files if you used `--no-cards-update` or edited sets outside ingest.

`npm run check:cards` runs `scripts/check-cards-sync.ts` — **byte-exact** gate that `cards/all.json` and `cards/index.json` match what `mergeSetsFromDisk()` would produce. Fails if you edited sets but forgot to merge.

---

## 4. Authoring ops (ingest stub → playable card)

### What ingest emits (new card stub)

For a new follower, ingest (`mapDotggCardToRepo`) writes:

| Field         | Ingest value                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Identity      | `id`, `name`, `cost`, `attack`, `defense`, `type`, `class`, `rarity`, `tribes`                   |
| Text / assets | `description` (HTML stripped from `skill_text`), `base_image`, `evo_image`, `set`, `url`         |
| Effect stubs  | `evolve: []`, `superevolve: []`, `triggers: []`, `fanfare: []` (or `spell: []` for spells)       |
| Keywords      | Evergreen strings extracted from description lines (`Ward`, `Storm`, … via `EVERGREEN_KEYWORDS`) |

Spells get `spell: []` instead of `fanfare: []`.

### What a human writes

- Full **op trees** under `fanfare`, `spell`, `evolve`, `superevolve`, `triggers`, `invoke`, etc.
- Structured **keyword objects** for mechanics with costs/effects:

```json
{
  "name": "Accelerate",
  "cost": 1,
  "effects": [
    {
      "op": "damage",
      "target": "enemy:follower",
      "amount": 2,
      "count": 1,
      "distribution": "random_hits"
    }
  ]
}
```

Same shape for `Enhance`, `Engage`, `Crystallize`, `Countdown`, `LastWords`, `Spellboost`.

- **`description` hand-edits** when upstream text omits an alternate-form clause. `checkAlternateFormClauses` (`scripts/check-card-text.ts:785–801`) requires a matching `Accelerate (N):` or `Crystallize (N):` line in `description` whenever authored alternate-form ops exist — upstream `skill_text` often omits the Accelerate line even when the card has Accelerate on the printed card.

### Worked example — set 10009

**Ingest stub** (conceptual): id/name/stats/type/class/rarity/tribes/description/images/set/url, empty effect arrays, evergreen keyword strings only.

**Authored card** `10901110` Jailor of Antiquity (`cards/sets/10009_revenants-of-azvaldt.json`):

- Human wrote full `fanfare` damage ops (select + random follow-up).
- Human wrote structured `Accelerate` keyword with cost and effects.
- `description` includes `Accelerate (1): …` matching the authored keyword (required by `checkAlternateFormClauses`).
- Evergreen `Ward` stays as a string in `keywords[]`.

Cards with only `"keywords": ["Ward"]` and `"fanfare": []` remain **`unimplemented`** stubs until ops are authored.

---

## 5. Ordering constraint — ingest before `cards:official`

> **Warning:** Run **`npm run ingest:cards`** and **`npm run ingest:tokens`** _before_ **`npm run cards:official`**.

`npm run cards:official` refreshes `cards/official-meta.json` from the live official site. `tests/unit/official-qa.test.ts:225–230` asserts every catalog id in that file exists in `cards/all.json` or `cards/token_details.json`.

Refreshing official metadata **before** ingesting the new set leaves ~100 catalog ids with no local card row → ~100 test failures. Ingest first so local ids exist, then pull official metadata.

---

## 6. Behaviour baseline — `cards:baseline` / `cards:verify`

```bash
npm run cards:baseline   # record baselines/card-behaviour.json
npm run cards:verify     # compare current engine fingerprints
```

### What `covered` means

From `scripts/lib/cardBehaviourDrive.ts:4–7`:

> - **`covered`** — every named gate we found was driven (satisfied), or there were none
> - **`partial`** — drove something, but named gate branches remain unmet (listed)
> - **`skipped`** — could not drive meaningfully (with reason)

`covered` does **not** mean “faithful to full rules text”. A card whose only driven path is `vanilla_place` (place on board, hash state, trigger nothing) counts as `covered`.

As of the current baseline: **145 of 904** pooled cards are `covered` solely via the `vanilla_place` fallback (status `covered`, scenario `vanilla_place` in baseline entries).

`cards:verify` reports `new_in_current` for cards present in the pool but absent from the baseline — the signal that catches newly ingested stubs whose behaviour was never recorded.

---

## 7. `npm run cards:drift`

Runs `scripts/cards-drift.ts` against the upstream DotGG dump. Exit code from `computeExitCode` (`scripts/lib/cardsDrift.ts:609–620`):

**Exit 1** when any of:

- `missingInDump`, `missingInOurs`
- `statDrift` (cost/atk/defense mismatch)
- `textSemantic` (normalized rules text differs semantically)
- `altModeSemantic` (Accelerate/Crystallize/etc. clause drift)

**Exit 0** for wording-only / cosmetic text differences (not in the failure list above).

---

## 8. The stub-ingest trap

> ### ⚠️ A fresh ingest of ~100 stubs passes `npm run check` green
>
> This is intentional. `scripts/check-card-text.ts:1385–1388` downgrades effect-completeness findings to **`warn`** when `getImplementationStatus()` is `unimplemented`. Empty `fanfare: []` on a card with Fanfare text does not fail CI — it warns.
>
> **Two signals catch “ingested but not authored”:**
>
> | Signal                           | Command                                   | In `npm run check`?    |
> | -------------------------------- | ----------------------------------------- | ---------------------- |
> | Baseline diff for new cards      | `npm run cards:verify` → `new_in_current` | **No**                 |
> | Unimplemented collectibles count | `npm run check:card-status -- --check`    | **Yes** (as `--check`) |
>
> After ingesting set 10009, most cards started `unimplemented`; only evergreen-only or fully authored cards were `ops_present`. Plan authoring time accordingly — CI green ≠ playable set.

---

## 9. Rotation window vs shipped decks

**Rotation set window** (which expansion sets are “legal”) is **dynamic** — see `src/data/formats.ts`. Basic (`10000`) plus the six newest expansion set ids are computed from the card catalog; no hardcoded set-id list.

**Shipped deck ids** (the 17 reference decks in `src/bench/soakDecks.ts` `SHIPPED_DECK_IDS`) are **hardcoded** across the repo. Removing or replacing a rotated-out reference deck is a separate, enumerable job.

Files referencing those deck ids (search: `aggro_abysscraft`, `rally_swordcraft`, … — 17 ids), excluding `decks/*.json` bodies:

| Area                     | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git whitelist            | `.gitignore` (17 `!decks/<id>.json` entries)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| UI defaults              | `index.html`, `src/boot/deckSelection.ts`, `src/boot/gameStart.ts`, `src/ui/render.ts`, `src/ui/deckImportPanel.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Soak / bench             | `src/bench/soakDecks.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Data                     | `src/data/rawDeck.ts`, `decks/manifest.json` (generated; run `npm run decks:discover`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Scripts                  | `scripts/browser-verify-deck-import.ts`, `scripts/generate-attribution-table.mjs`, `scripts/listener-leak-harness.mjs`, `scripts/player-qa.mjs`, `scripts/playtest-deck-library.ts`, `scripts/soak-deck-antemaria.ts`, `scripts/soak-deck-ramp.ts`, `scripts/verify-static-deploy.ts`                                                                                                                                                                                                                                                                                                         |
| Unit tests — per-deck L2 | `tests/unit/l2-aggro_abysscraft.test.ts`, `l2-amulet_havencraft.test.ts`, `l2-antemaria_dragoncraft.test.ts`, `l2-artifact_portalcraft.test.ts`, `l2-barbaros_swordcraft.test.ts`, `l2-buff_forestcraft.test.ts`, `l2-cutthroat_portalcraft.test.ts`, `l2-evolution_forestcraft.test.ts`, `l2-evolution_havencraft.test.ts`, `l2-kukishiro_havencraft.test.ts`, `l2-lhynkal_runecraft.test.ts`, `l2-midrange_abysscraft.test.ts`, `l2-rally_swordcraft.test.ts`, `l2-ramp_dragoncraft.test.ts`, `l2-sephie_runecraft.test.ts`, `l2-spell_runecraft.test.ts`, `l2-thestae_forestcraft.test.ts` |
| Unit tests — rotation L2 | `tests/unit/l2-rotation-abysscraft.test.ts`, `l2-rotation-dragoncraft.test.ts`, `l2-rotation-forestcraft.test.ts`, `l2-rotation-havencraft.test.ts`, `l2-rotation-neutral.test.ts`, `l2-rotation-portalcraft.test.ts`, `l2-rotation-runecraft.test.ts`, `l2-rotation-swordcraft.test.ts`                                                                                                                                                                                                                                                                                                      |
| Unit tests — other       | `tests/unit/consistency.test.ts`, `deckLibrary.test.ts`, `decklistImport.test.ts`, `deckManifest.test.ts`, `deployable_build.test.ts`, `meta-decks.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Mechanics tests          | `tests/mechanics/history-roundtrip.test.ts`, `mulligan-draw-order.test.ts`, `mulligan-undo.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Docs                     | `docs/llm-guide.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Soak fixture JSON under `tests/fixtures/soak/` also embed deck ids but are repro artifacts, not maintenance sources.

Expect **~30+ touch points** when retiring a shipped deck — not a single config flip.

---

## Quick checklist

```bash
# 1. Ingest (creates set file + rebuilds all.json)
npm run ingest:cards
npm run ingest:tokens

# 2. Merge gate
npm run check:cards

# 3. Author ops in cards/sets/<new-set>.json (+ token_details.json as needed)
#    Fix SET_NAME_FALLBACKS / CARD_TYPE_OVERRIDES if upstream is wrong

# 4. Official metadata (after local ids exist)
npm run cards:official

# 5. Gates
npm run check:card-status -- --check   # no unimplemented collectibles
npm run check                           # full CI locally

# 6. Behaviour baseline (after ops compile)
npm run cards:baseline
npm run cards:verify

# 7. Upstream drift (optional, before PR)
npm run cards:drift
```
