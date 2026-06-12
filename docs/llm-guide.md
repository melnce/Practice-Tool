# LLM Contributor Guide

## Where to start

- **New Card**: Add entry to the set file under `cards/sets/` (canonical source), then run `npm run cards:update` to regenerate `cards/all.json`.
- **New Effect**: Check `src/logic/effects/ops/`. If operation (e.g., `banish`) exists, reuse it. If not, add new `.ts` file in `ops/`.
- **Rule Change**: Modify `src/logic/core/turns.ts` or `src/logic/index.ts`.
- **UI Bug**: Check `src/ui/render.ts` or `src/ui/zones.ts`.

## Do / Don't

### DO

- **Use `src/engine.ts`** as the main entry point for game control.
- **Add tests** when adding new logic. `npm test` must pass.
- **Use `.js` extensions** for all relative imports in `src/`.

### Engine API

- `startNewGame(options: StartGameOptions)`: Resets game. Options:
  - `deckAId` (string): Deck filename without path (e.g. `"starter_deck"`).
  - `deckBId` (string): Deck filename without path.
  - `seed` (number | string): **Required** for determinism. Browser entry (`boot.ts`) generates one when the seed field is empty.
  ```typescript
  await startNewGame({
    deckAId: "starter_deck",
    deckBId: "starter_deck",
    seed: 12345,
  });
  ```
- `dispatch(state, action)`: Mutates state. Use `PlayerAction` types.
  - `PLAY_CARD`: Play a card from hand. `{ type: "PLAY_CARD", player: "first", cardUid: "..." }`
  - `ATTACK`: Attack a target. `{ type: "ATTACK", player: "first", attackerUid: "...", defender: { type: "card", uid: "..." } }`
  - `CHOOSE_TARGET`: Select a target for pending effect. `{ type: "CHOOSE_TARGET", player: "first", target: { type: "card", uid: "..." } }`
- `getState()`: Returns current state (Read-Only).
- **Do not mutate state directly** in UI or Boot.
- **Invariants**: `dispatch` enforces GameState validity in dev/test (throws errors if state is corrupted).

### Architecture Guardrails

- **Core/Logic must NOT import UI**.
- `npm run check:boundaries` validates this.

### DO NOT

- **Do NOT edit `node_modules/`**.
- **Do NOT import DOM types** in `src/core/` or `src/logic/` (keep logic pure).
- **Do NOT introduce path aliases** in `tsconfig.json`. Use strict relative paths (Vite/vitest may use aliases for convenience; source imports stay relative).

## Invariants

1.  **GameState** is a singleton defined in `src/core/gameState.ts` (`state`).
2.  **Mutations** must go through `src/logic/` functions. Do not mutate `state` directly in UI code.
3.  **RNG** must use `src/core/rng.ts` for deterministic replays.

## Preferred Workflow

1.  Read `src/engine.ts` to understand available actions.
2.  Make changes in `src/`.
3.  Run `npm run dev` and open `http://localhost:5173/` (Vite serves `index.html` + transforms `src/`).
4.  Run `npm test`.

## Commands

- **Dev Server**: `npm run dev` (starts Vite with HMR).
- **Test**: `npm test` (runs `vitest`).
- **Type Check**: `npm run typecheck` (checks types without emitting).
- **Replay**: `npm run replay:check` (deterministic shuffle + golden scenarios).
- **Card data sync**: `npm run check:cards` (verifies `cards/all.json` matches merged `cards/sets/`).
- **Card text sync**: `npm run check:card-text` (JSON structure vs description; use `-- --set 10000_basic` per batch).
- **Audit tests**: `npm run test:audit` (card-text/rulebook behavioral tests; failures = bug reports).

## Card data (single source of truth)

**Hand-edit only:**

| Path | Role |
|---|---|
| `cards/sets/*.json` | Main card pool — one file per expansion set |
| `cards/token_details.json` | Token / summoned-card definitions |
| `cards/vanilla_lab_set.json` | Lab / test-only overlay cards (optional) |

**Generated — never hand-edit:**

| Path | Role |
|---|---|
| `cards/all.json` | Merged runtime pool (`npm run cards:update`) |
| `cards/index.json` | Set id → file path map (same script) |

**Guards:**

| Command | Role |
|---|---|
| `npm run cards:update` | Regenerate `all.json` + `index.json` after set edits |
| `npm run check:cards` | CI — fails if aggregates drift from `cards/sets/` |
| `npm run cards:watch` | Watches sets + tokens + vanilla lab set; auto-runs merge |

Runtime loads `all.json` + `token_details.json` + `vanilla_lab_set.json` via `src/data/cardDatabase.ts` (browser) / `cardLoaderNode.ts` (tests).

**Super-evolve data (owner locked):** 80 DUPLICATE → empty `superevolve[]`; 5 INSTEAD → `superEvolveReplaces: true`; 2 DISTINCT (Amorous Drain-only super, Velharia dual banish). Evolve “replicate fanfare” cards use `{ "op": "replicate", "zone": "fanfare" }`.

Legacy export layouts (`card_sets/`, `card_details.json`, `classes/`, `seperate_*.py`) were removed — do not recreate unless regenerating export-only views from sets.

## Deck files (canonical)

| Path | Role |
|---|---|
| `decks/*.json` | Deck lists (most are gitignored locally; `starter_deck.json` is tracked). |
| `npm run decks:discover` | Scans `decks/*.json` and writes `decks/manifest.json` for the UI dropdown (runs automatically on `npm run dev` / `npm run build`). |
| `npm run check:decks` | Validates every discovered deck parses cleanly and every card resolves against `cards/all.json`. |

Excluded from discovery: `index.json`, `all_cards.json`, `manifest.json`. Files matching `0_testing_*` appear under a **Test decks** optgroup in the UI.

## Card behavior audit (Brief 8)

**Authoritative references (in order):**

1. Card `description` text (JSON)
2. `docs/svwb_rulebook_formatted.md` — rules oracle for interpretation
3. Owner — only for gaps the rulebook does not cover or internal contradictions

**Never** assert from current engine output. Failing audit tests are bug reports, not things to silence.

| Command | Role |
|---|---|
| `npm run check:card-text -- --set 10000_basic` | Mechanical JSON ↔ description sync |
| `npm run test:audit` | Card-text + rulebook primitive behavioral tests (quarantined from `npm test`) |
| `npm run audit:superevolve-dedup` | Report cards with both evolve/superevolve arrays (no JSON edits) |

Audit tests live in `tests/audit/`. Batch reports classify cards **A** (pass/fail), **B** (ambiguous), **C** (hidden interaction). Reconcile B/C against the rulebook first; cite section and proceed without re-asking the owner when resolved.

**Resolved global rules (rulebook):**

- **Reanimate(N):** search cost N → N−1 → … → 0 (never upward); none eligible → no summon (§763).
- **Bounce:** returned follower reverts to base stats; granted keywords lost (§891).
- **Super-Evolve:** +3/+3; owner-turn destroy immunity + damage→0; 1 leader damage when killing a follower (§933); on super, fire `evolve[]` + `superevolve[]` unless `superEvolveReplaces: true` or Super-Evolve text says **"instead"** (§747). Duplicate JSON → empty `superevolve[]` (dedup applied). **Replicate:** `{ op: "replicate", zone: "fanfare" }` re-runs live fanfare with fresh targeting.
- **Overflow:** max PP ≥ 7; second-player bonus PP temp orb does not count (§769).
- **Max PP:** cap 10; natural turn progression and `gain_max` effects cannot exceed 10 (rulebook §229, §326; owner confirmed).
- **Zero damage:** a 0-damage instance still counts as “taking damage” for on-damage triggers if the follower survives (rulebook — Damage Events).

### Batch 1 — owner rulings (recorded)

Use these instead of re-asking. Rulebook still applies where not contradicted.

| Topic | Ruling |
|-------|--------|
| **LW summon (Royal Coachwoman)** | Death frees the slot; Knight summons even on a full 5-wide board. Two Knights on full board → only one fits. |
| **Arriet "instead"** | Super-Evolve restore 4 **replaces** Evolve restore 2 (no stack). |
| **Gentle Treant** | Combo self-evolve on Fanfare → can Strike **followers** same turn (not leader). |
| **May, Journey Elf** | Combo (3) checked when played; 3rd card that round → Fanfare damage fires. |
| **Selwyn** | Player selects 1 enemy if multiple valid. |
| **Rusty** | Draw all copies from **deck only**. |
| **Dazzling Runeknight** | Both modes work; Earth Rite mode needs a sigil to have effect (choosable with no sigil = no effect). |
| **Draconic Berserker super** | 4 damage to **each** enemy follower. |
| **Dragonsign** | Draw at 9 or 10 max PP (9→10 triggers draw; at 10 only draw). |
| **Chaos Cyclone Reanimate(N)** | Copy from cemetery; cost N→N−1→…→0; random on ties (same as §763). |
| **Amorous Necromancer super** | Ghosts summoned without Drain gain Drain. |
| **Winged Warrior Evolve** | May reselect a different ally for Fanfare replication. |
| **Ironfist Priest** | **Current** defense for ≤3 check. |
| **Detective's Lens** | Remove Ward from any enemy follower (even if it has none). |
| **Adventurers' Guild bounce** | **Resolved (§891):** granted Rush is lost on bounce — returned follower reverts to base copy without granted keywords. |
| **Wild Profusion** | Pixie tribe includes Fairy; 1 random dmg to enemy follower on allied Pixie enter (Ward irrelevant). |
| **Bug Alert** | Return own field card; 2 dmg random **enemy followers** only; Ward/Lloyd irrelevant to random. |
| **Ancestral Crown** | Any allied follower enter; multiple crowns stack. |
| **Blaze Destroyer** | Spellboost **hand only**; +1 per spell played plus any spellboost X on that spell/effect. |
| **Remi & Rami super** | Golem evolve does **not** spend EP. |
| **Devious Lesser Mummy** | Necromancy(4): needs 4+ shadows; auto-spend; no opt-out. |
| **Avian/Winged Statue** | Countdown 0 → destroy + LW; negative countdown irrelevant. |
| **Sacred Griffon** | Storm non-stacking; **your** Engage only. |
| **Mecha Cavalier super** | "2 instead" → summon **2** (not 1+2). |
| **Puppet Theater** | Countdown at start of turn; EOT hand triggers alternate with countdown ticks. |
| **Max PP cap** | Hard cap **10 max PP**. After reaching 10, every later turn stays at 10/10 (turn 1000 = still 10 max). Bonus PP gives extra usable PP for one turn only; does not raise max PP. |

### Batch 2 — Dragoncraft (template for other classes)

**Scope:** Dragoncraft in sets `10001`–`10004` (49 cards). Basic set (`10000`) in Batch 1. Audit file: `tests/audit/batch02_dragoncraft.test.ts`. Owner rulings: `tests/audit/batch02_dragoncraft_ruled.test.ts`.

**Per-class pass checklist:** classify A/B/C from card text + rulebook; reuse primitives; build states via plays/turn-ends (aligned `roundCount` + `maxPP` + `permPP`); assertions from text/rulebook only; reds stay failing until a dedicated fix pass.

| Topic | Ruling |
|-------|--------|
| **Zooey Enhance (10)** | (a) Set leader **max defense to 1** — current HP clamped to new max; idempotent; heals cannot exceed 1. (b) **Max 0 damage per instance** to your leader until **opponent’s end of turn** (combat or effects); cap clears after opponent EOT (leader can remain 1/1). |
| **Raging Lightning Overflow** | 3 damage to **every leader** whose defense equals the **highest among all leaders** (includes your leader; tied leaders all take 3). |
| **Mari** | Hand: when a **3 base-cost** ally **super-evolves**, Mari’s cost → **0 until your EOT** (once per turn; stays 0 if more supers). Board EOT: **+1/+1** to one **random super-evolved** ally (any base cost, any turn it super-evolved). |
| **Azurifrit on-damage** | On **your turn**, each time it **takes damage** (including **0**) and survives → **1** to enemy leader; **each instance** separate; **3 activations per turn** max. |
| **Zero damage** | A **0-damage instance** still counts as “taking damage” for on-damage triggers (rulebook §Combat — Damage Events). |

### Foundational mechanics (Batch 3 fix pass 1)

Primitive tests: `tests/audit/primitives_batch3_foundations.test.ts`.

| Mechanic | Definition | Code touchpoints |
|----------|------------|------------------|
| **Crest countdown / LW / EOT** | Countdown ticks at owner **turn start**; destroyed at 0; LW on destroy; EOT at owner’s end of turn | `crest.ts` (`tickCrests`, `destroyCrest`, `processCrestEvent`), `turns.ts` |
| **Skybound Art gauge** | `gauge = roundCount + skyboundArtEvolvesWitnessed` (in-hand witnesses only); SA ≥10, SSA ≥15 | `skybound.ts`, `gates.ts` `handleSkyboundArtGate` |
| **Faith + Modes** | +1 Faith per **selection event** (`select_mode` once per `handleMode` finalize); `resolveModeSelectCount` = base `select`/`select_count` + `modeBonus`; `pay_counter` spends Faith | `mode.ts`, `startGame.ts`, `crest/unified.ts` |
| **Effect evolve** | Skips plain **Evolve:** (`evolve[]` without `evolve_trigger_always`); still runs **When this evolves** (`evolve_trigger_always: true`, 7 cards). Proposed per-effect `on_any_evolve` if mixed arrays appear — **sign-off pending, not in data** | `resolveEvolveScriptToRun` in `evolveUtils.ts`, `evolveFollowerByEffect` |

**`evolve_trigger_always` inventory (7):** Edelweiss (10133130), Liu Feng (10143120), Mukan (10153130), Gildaria (10224110), Manamel (10411120), Cupitan (10413110), Izmir (10442110). All other `evolve[]` cards (82) are EP-only Evolve lines.

### Batch 3 — Abysscraft (sets 10001–10004)

**Scope:** 49 non-basic Abysscraft cards. Basic set in Batch 1. Audit: `tests/audit/batch03_abysscraft.test.ts`. B/C: `tests/audit/batch03_abysscraft_ruled.test.ts`.

**Classification (card text + rulebook):** A = 42 behavioral tests; B/C = 7 escalations (faith/mode/random/dual-crest/SSA).

**Primitives reused:** Necromancy (§757), Reanimate (§763), banish (§154–160), zero-damage, numeric stats, replicate, Engage, Enhance, crest. **New:** consolidated shadow fuel in `primitives_batch1.test.ts` (destroy / spell / discard +1; banish / transform do not).

**Abysscraft red queue (audit pass; do not silence):**

| Card / area | Tag | Issue |
|-------------|-----|--------|
| Rayvn evolve destroy×2 (10251110) | **engine-bug-candidate** | `select: 2` destroy does not remove both enemies after targeting. |
| Belial Fanfare `other:follower` (10454120) | **engine-bug-candidate** | 10 damage does not hit enemy followers. |

**Fixed (C2/C1 hand-scope):** Board triggers (`end_of_turn_own`, etc.) no longer fire from hand during turn-boundary collection — only `trigger.source: "hand"` qualifies on the hand tier. Guard: `tests/mechanics/hand-trigger-scope.test.ts`; Fediel audit farming loop restored.
| Sham-Nacha faith pay (10354110) | **data/engine** | Requires preloaded Faith crest + `pay_counter` path. |
| Screaming and Loathing 2-mode (10353310) | **engine-bug-candidate** | `select: 2` mode spell may not complete in HEADLESS. |
| Nezha EOT random hits (10452110) | **engine-bug-candidate** | `end_of_turn` trigger damage sequence not firing in harness. |
| Transform → named token (primitive) | **engine-bug-candidate** | `into: Skeleton` does not resolve token name on enemy follower. |
| Rulenye add_to_hand (10354120) | **data/op-spec** | Mode 1 `add_to_hand` missing required `count` in JSON. |
| Baal mode 1 random ally buff (10452130) | **engine-bug-candidate** | Self +1/+1 OK; `ally:follower` random +1/+1 not applied. |

**Dragoncraft red queue (fix pass; do not silence):**

| Card / area | Tag | Issue |
|-------------|-----|--------|
| Goldennote Melody (10142310) | **engine-bug-candidate** | Draw 2 from spell fanfare — only 1 card enters hand with 2-card deck. |
| Intent Dragonewt Princess (10242110) | **engine-bug-candidate** | Super-ally gate OK; draw 2 fires as +1 only. |
| Draconic Strike (10243310) | **data/op-spec** | JSON `action: "reduce"`; dispatcher requires `mode`. |
| Pyrewyrm Blade (10242210) | **engine-bug-candidate** | Engage +1/+1 OK; granted Last Words not on follower (`hasLastWords`). |
| Supplicant of Disdain (10342110) | **engine-bug-candidate** | EOT restore uses `target: "leader"` without `player` / composite target. |
| Maximum Love Bomb (10442310) | **engine-bug-candidate** | Selected follower damage not applied. |
| Primal Beast Absorption (10443310) | **data/op-spec** | `add_to_hand` target `selection:any` invalid (expects `selected`). |
| Raging Lightning Overflow leaders (10341310) | **engine-bug-candidate** | `all:leader` + `by_stat` not implemented; early `includes("leader")` path hits one leader. |
| Zooey damage cap (10444120) | **engine-bug-candidate** | Cap stored on `blueLeaderMaxDamageCap`; `applyLeaderDamage` reads `players[].leaderMaxDamageCap`. |
| Azurifrit 3-activation cap (10344110) | **engine-bug-candidate** | No per-turn activation limit on `self_damaged` trigger (ruling: max 3/turn). |
| Mari hand cost (10441120) | **engine-bug-candidate** | `ally_super_evolve` + `cost` modify may not zero hand Mari (test uses `getEffectiveCost`). |

### Batch 4 — Swordcraft (sets 10001–10004)

**Scope:** 49 non-basic Swordcraft cards. Basic set in Batch 1. Audit: `tests/audit/batch04_swordcraft.test.ts`. B/C: `tests/audit/batch04_swordcraft_ruled.test.ts`.

**Classification (card text + rulebook):** A = 36 behavioral tests; B/C = 11 escalations; stats-only (no test) = 3 (Nightshadow Ambush, Feather, Fiorito Ambush+Bane).

**B/C cards:** Ernesta replicate (10121120), Ignominious `super_evo_unlocked` gate (10121150), Ironcrown Majesty mode (10122310), Gelt EOT `super_evolved_allied` gate (10222110), Gildaria Rally(20)+super+enter ping (10224110), Lair Engage mode (10322210), Returning Slash fuse gate (10323310), Octrice crest (10324120), Golden Knight mode/Enhance(9) (10423110), Knightly Ardor mode+EP (10423310), Seofon Skybound/SSA (10424120).

**Primitives:** Rally §780 in `tests/audit/primitives_batch4_rally.test.ts` (increment on play/summon, `handleRallyGate`, fanfare self-exclusion via gate check before increment). Gildaria `evolve_trigger_always` (2 Rush Steelclad Knights) in same file.

**Swordcraft fix pass (Batch 4):** `npm run test:audit` **265/265 green**. Primitives: `primitives_batch4_rally.test.ts`, `primitives_batch4_fuse.test.ts`.

**Engine:** Loot fuse partners leave hand without graveyard/shadows; `has_fuse_materials` gate; `handleSuperEvoGate` shared for `super_evo_unlocked`; fuse_finalize uses canonical `damage` + gate draw; trigger `super_evolution_unlocked` uses same helper.

**Data:** Peppy Scout evolve `not_self`; Golden Knight restore `player: "self"`.

**Tests:** Lyrala expects +1 per Officer enter (19 then 20); Albert Enhance keyword index + defense check; Peppy resolves ally uid; Returning Slash deck top = `pop()` end; Golden Knight full Enhance bundle + restore.

**Swordcraft red queue — cleared (was audit pass):**

### Batch 5 — Havencraft (sets 10001–10004)

**Scope:** 49 non-basic Havencraft cards. Basic set in Batch 1. Audit: `tests/audit/batch05_havencraft.test.ts`. B/C: `tests/audit/batch05_havencraft_ruled.test.ts`.

**Classification (card text + rulebook):** A = 34 behavioral tests; B/C = 14 escalations; stats-only (keyword assert) = 1 (Holy Shieldmaiden Ward+Barrier).

**B/C cards:** Skullfane (10163110), Maeve LW amulet copy (10162130), Rodeo (10164110), Aether (10264110), Wilbert (10264120), Maddening Benison (10263310), Temple of Repose (10362210), Winged Lion Statue (10362220), Shining Disenchantment (10363210), Himeka (10364110), Marwynn (10364120), Skyfaring Vessel (10462210), De La Fille mode Engage (10463210), Vira SSA (10464120).

**Primitives:** Engage §290–294 in `tests/audit/primitives_batch5_engage.test.ts` (Serene Sanctuary same-turn + once/turn + PP; Darkhaven Grace target; Dose sacrifice).

**Fix pass (Batch 5):** `npm run test:audit` — **316/316 green** (51 Havencraft + rest of audit). `npm run check:cards` OK.

**Per-card resolution (test-fix / data / engine):**

| Card | Tag | Resolution |
|------|-----|------------|
| Marwynn (10364120) | **data** | `add_to_hand` Torrent `count: 1`. |
| Shining Disenchantment (10363210) | **data** | LW `restore` + `player: "self"`. |
| Jeanne (10164120) | **test-fix** | Assert surviving DEF after 6 AoE (8→2), not empty board. |
| Cleric of Crushing (10261110) | **test-fix** | §561 Ward: may attack Ward follower; non-Ward blocked while Ward up. |
| Pact (10163210) | **test-fix** | PP for Engage; LW via countdown 0 + `cleanupDead` (once/turn Engage). |
| Unholy Vessel (10163220) | **test-fix** + **data** | Engage amulet index; `target: "any:follower"`. |
| Damus (10261120) | **data** + **test-fix** | `grant_trigger` fanfare; optional pending resolve. |
| Divine Guard (10262310) | **test-fix** | Split stat + `selected_defense` damage (card text). |
| Agnes (10263110) | **test-fix** | `attackFollower` uses Agnes board index (amulets before her). |
| Blinding Faith (10361310) | **data** | `distribution: "all"` on spell + Enhance; `Enhance` name; restore `player: "self"`. |
| Knight of the Holy Order (10361120) | **data** + **engine** | restore `player: "self"`; `handleStatSelf` fires `self_buffed_up`. |
| Awed and Inspired (10461210) | **test-fix** + **engine** | Engage PP; transform `select` auto-pick / ally uid. |
| Sophia (10462120) | **test-fix** + **data** | Fanfare `filter` + deck `filter` alias in `summon_ops/deck.ts`. |
| Tikoh (10463110) | **data** | Engage listener restore `player: "self"`. |
| Galleon (10464110) | **test-fix** + **engine** | `fireTrigger("end_of_turn")`; evolve `select_mode: "random"` + filters. |
| Maeve (10162130) | **test-fix** | `cleanupDead` import; graveyard highest-cost amulet path OK. |
| Aether (10264110) | **test-fix** | Deck IDs all ≤3 followers (was 4/5-cost cards in deck). |
| Wilbert (10264120) | **test-fix** + **data** + **engine** | Holy Cavalier token; `ally_follower_enter`; `entering_follower` stat route. |

**B/C provisional-green confirmed against card text (not pass-only):**

| Card | Reading checked |
|------|-----------------|
| Skullfane (10163110) | Fanfare: X = amulets destroyed; X damage all enemies. |
| Maeve (10162130) | LW: highest base-cost destroyed allied amulet (Darkhaven over Serene). |
| Rodeo (10164110) | Fanfare: discard 1, 3 distinct amulets ≤3; Super: destroy highest ATK then 1 to all. |
| Maddening Benison (10263310) | Restore 10; crest LW 10 to your leader at countdown 0. |
| Temple of Repose (10362210) | Engage advance by crest count; LW restore 2 + leader Barrier. |
| Winged Lion Statue (10362220) | Engage (1) advance; LW Falcon + Tiger. |
| Shining Disenchantment (10363210) | Engage by crest count; LW 4 split + restore 4 self. |
| Himeka (10364110) | Fanfare crest; Super sets enemy follower ATK to 4. |
| Marwynn (10364120) | Fanfare Torrent; Evolve Marwynn crest. |
| Skyfaring Vessel (10462210) | Hand Engage discount; Engage evolves unevolved ally. |
| De La Fille (10463210) | Mode 1 destroy random enemy; Mode 2 draw 2. |
| Vira (10464120) | Fanfare banish 2; SSA super-evolve at gauge ≥15. |
| Aether (10264110) | 3 unique ≤3 deck; Super +0/+2 and Aura on other allies. |
| Wilbert (10264120) | LW 2 Holy Cavalier; Evolve crest +1/+2 on Ward enters. |

**Engine primitives touched:** Engage (green batch 5); `entering_follower` stat; evolve random EOT; deck `filter`/`filters`; trigger keyword plural; `handleStatSelf` → `self_buffed_up`.

### Batch 6 — Forestcraft (sets 10001–10004)

**Scope:** 49 non-basic Forestcraft cards. Basic set (7 cards) in Batch 1 (`batch01_basic.test.ts`, `batch01_ruled_cards.test.ts` — Gentle Treant / May Combo owner rulings). Audit: `tests/audit/batch06_forestcraft.test.ts`. B/C: `tests/audit/batch06_forestcraft_ruled.test.ts`.

**Classification (card text + rulebook; no dedicated Combo rulebook section — Batch 1 owner rulings + `playsThisTurn` in `playCardCore`):**

| Tier | Count | Notes |
|------|-------|--------|
| A | 37 | Behavioral tests in `batch06_forestcraft.test.ts` |
| B/C | 12 | `batch06_forestcraft_ruled.test.ts` |
| Stats-only | 0 | Wildheart Rush covered in A |

**B/C cards:** Capricious Sprite replicate (10111120), Opulent Rose Queen transform (10114120), Bayle hand cost (10113130), Amataz Pixie hand (10114130), Fairy Fencer hand (10212120), Garden's Allure Fuse (10213310), Lymaga (10214120), Devotee/Supplicant replicate (10311110, 10312110), Congregant copy (10313110), Krulle (10314110), Alfheimr mode/SSA (10413310).

**Primitives:**

| Primitive | File | Reused / new |
|-----------|------|----------------|
| Combo (`playsThisTurn`, `handleComboGate`, threshold on 3rd play) | `primitives_batch6_combo.test.ts` | **New** |
| Manamel / Cupitan `evolve_trigger_always` on effect-evolve | `primitives_batch6_forest_evolve_always.test.ts` | **New** (pattern from batch 3 Mukan, batch 4 Gildaria) |
| Bleed EOT (`to_leader` / `to_self`) | `primitives_batch6_bleed.test.ts` | **New** |
| Fairy/token summon, crests, Engage, Enhance, Skybound, modes | Prior `primitives_batch3_foundations`, batch 4/5 | **Reused** |

**Fix pass:** `npm run test:audit` **370/370 green** (Batch 6 + `primitives_batch6_bleed.test.ts`). `npm run check:cards` OK.

| Card / area | Layer | Fix |
|-------------|-------|-----|
| Kou & You (10411110), Alfheimr (10413310) | **data** | `restore` + `player: "self"` in `10004_skybound-dragons.json`. |
| Chloe (10412110) | **data** + **engine** | Enhance `summon` `source: "hand"`; `summon` op returns `pending`; single legal hand follower auto-summons. |
| Garden's Allure (10213310) | **data** + **engine** | Fused spell `draw` + `source: "deck"` in `fuse.forest.ts`; tests supply deck. |
| Eradicating Arrow (10313310) | **engine** | `repeat_effect` + `count_source: "combo"` + `effects[]` array. |
| Godwood Staff (10113210) | **test** | EOT draw needs deck in harness (Combo gate + `end_of_turn_own` already correct). |
| Ambush / Eradicating (lethal) | **test** | Assert follower destroyed (0 DEF or off board), not `board[0]` after `cleanupDead`. |
| Supplicant (10312110) | **data** | `superevolve` → `{ op: "replicate", zone: "fanfare" }`. |
| Congregant (10313110) | **engine** | `deferEnter` + `then` before enter; `applyFilters` skips self-exclusion for `ally:last_summoned`. |
| Lymaga (10214120) | **engine** | `applyKeywordBuff` on targeted `stat` handler (`cant_attack` + `opponent_turn_end`, bleed grant). |
| Bleed | **engine** + **primitive** | `apply.ts` mirrors `hasBleed`/`bleed`; EOT via `endTurnBlue()` in `primitives_batch6_bleed.test.ts`. |

**B/C provisional-green (7) — confirmed vs card text after fix pass:** Capricious Sprite replicate Fanfare on Evolve (10111120); Opulent Rose Queen hand transform (10114120); Bayle hand cost (10113130); Amataz Pixie hand (10114130); Fairy Fencer hand (10212120); Devotee replicate Fanfare on Evolve (10311110); Krulle Fanfare + Super crest (10314110).

**Primitives:** Combo `primitives_batch6_combo.test.ts`; Manamel/Cupitan `primitives_batch6_forest_evolve_always.test.ts`; bleed `primitives_batch6_bleed.test.ts` — all green.

### Batch 7 — Runecraft (sets 10001–10004)

**Scope:** 49 non-basic Runecraft cards. Basic set (7) in Batch 1. Audit: `tests/audit/batch07_runecraft.test.ts`. B/C: `tests/audit/batch07_runecraft_ruled.test.ts`.

| Tier | Count | Notes |
|------|-------|--------|
| A | 30 | Behavioral tests in `batch07_runecraft.test.ts` |
| B/C | 19 | `batch07_runecraft_ruled.test.ts` |

**B/C cards:** Sagelight Teachings mode (10132310), William (10132130), Juno (10133110), Edelweiss (10133130), Homework Time! (10133310), Kuon (10134110), Dimension Climb (10134310), Melvie (10231110), Enchanting Perfumer (10232120), Norman (10234120), Devotee of Truth (10331110), Supplicant of Truth (10332110), Congregant of Truth (10333110), Ascetic of Wuxing (10331120), Illusory Conjuration (10333310), Raio (10334120), Unleashed (10432310), Mireille & Risette (10432120), Cagliostro (10434120).

**Primitives:**

| Primitive | File | Status |
|-----------|------|--------|
| Spellboost §757 + Rune stress | `primitives_batch1.test.ts`, `primitives_batch7_spellboost_rune.test.ts` | **green** |
| Earth Rite §804 | `primitives_batch7_earth_rite.test.ts` | **4/4 green** |
| Edelweiss `evolve_trigger_always` | `primitives_batch7_edelweiss_evolve_always.test.ts` | **green** |
| Crests, Engage, modes, replicate, Skybound | Prior batches | Reused in card tests |

**Audit pass (pre-fix):** 425 green / 3 red — card tests green while primitives flagged Spellboost stat/cost and Edelweiss PP (see fix pass).

**Fix pass:** `npm run test:audit` — **438 green** (canonical all-green total as of Runecraft close-out). Breakdown: 49 A-tier card tests + 26 B/C ruled (19 listed cards + Institute cost-trigger + restore-scope + Illusory full spell + extras) + Batch 1–7 primitives and cross-class checks. Mid-pass counts (433 / 434 / 437) were intermediate runs before the final B/C additions settled.

| Area | Tag | Resolution |
|------|-----|------------|
| Spellboost `effects[]` (stat/cost on spell play) | **engine-fix** | `spellboost.ts`: dispatch in-hand `stat`/`cost` via `handleStat` / `handleCost` (avoids index cycle); case-insensitive keyword name. Card tests: Runeblade +1/+1, Emmylou cost −1 (`batch07_runecraft.test.ts`). Use **Foresight (10031310)** as spell filler in spellboost tests — Stormy Blast is blocked without an enemy follower. |
| Edelweiss PP on effect-evolve (10133130) | **test-fix** | Engine already ran `pp` recover; primitive wrongly expected `ppBefore + 2` after paying 4-cost card. Assert **2 PP** (0 spent remainder + recover 2). B/C ruled test already correct. |
| `cost` op `selected:follower` + `action` alias | **engine-fix** | `cost/types.ts`: map `selected:*` → `selected`; map `action` → `mode` (Illusory, Institute Engage). |
| Devotee `self_cost` gate + restore | **engine-fix** | `restore/types.ts`: default `player: "self"` only for bare `target: "leader"` (not `enemy:leader` — composite path sets `player: "opponent"`). B/C: positive gate at modified cost 1; ruled test proves enemy leader is not silently healed. |
| Supplicant / Congregant `self_cost` | **test-extend** | Added printed-cost negative cases alongside modified-cost positives. |
| Illusory Conjuration (10333310) | **test-extend** | Full spell: `resolvePendingTarget(dev.uid)` → +1 effective cost + destroy (same `selected:follower` cost path as Institute Engage). |
| Institute of Truth (10332210) | **test-extend** | B/C ruled: `ally_follower_played` + `cost_changed` → draw + countdown advance (A-tier still has Engage +1/+1). |

**B/C card-text confirmation (item 3):**

| Card | Text exercised | Tag |
|------|----------------|-----|
| Sagelight 10132310 | Mode 1 sigils; Mode 2 leader restore | ok |
| William 10132130 | Fanfare X = spellboost count AoE | ok (pre-boost via `spellboostHand`) |
| Juno 10133110 | Fanfare X = earth stack damage | ok |
| Edelweiss 10133130 | Earth Rite evolve + 4 dmg + 2 PP recover | ok |
| Homework 10133310 | 5× spellboost → transform | ok |
| Kuon 10134110 | Three shikigami names | ok |
| Dimension Climb 10134310 | On Spellboost cost −1 | ok |
| Melvie 10231110 | Brew always; sigils only with super-evo ally | ok (+ negative) |
| Perfumer 10232120 | Evolve replicate fanfare dmg + sigil | ok |
| Norman 10234120 | Evolve replicate mode 0 + golems | ok |
| Devotee 10331110 | `self_cost` 2 gate both branches | ok |
| Supplicant 10332110 | `self_cost` 5 gate + 3 dmg others | ok |
| Congregant 10333110 | `self_cost` 3 gate summon copies | ok |
| Ascetic 10331120 | Evolve replicate fanfare summon | ok |
| Illusory 10333310 | Hand cost +1 + random destroy | ok |
| Raio 10334120 | Fanfare random spell → Ersatz | ok |
| Unleashed 10432310 | Mode 1 draw + random 4 dmg | ok (mode pick injected) |
| Mireille 10432120 | Fanfare token + Earth Rite dual evolve | ok |
| Cagliostro 10434120 | 2 sigils + Ars Magna to hand | ok |
| Institute 10332210 | Cost-changed follower → draw + CD advance | ok (related; Engage in A-tier) |

**Residual gaps (low priority):** Sagelight mode 3 (Earth Rite AoE), Homework/William via real spell chain only (not blocking), Unleashed mode 2/3 not isolated.

**Alfheimr test note (Batch 6):** SSA branch uses `gauge = roundCount + skyboundArtEvolvesWitnessed >= 15`. `R10` is max-PP alignment only; witnesses `= 5` at round 10 hits SSA (not SA at ~10). `R15` was an undefined variable typo, not a gauge workaround.

### Batch 8 — Portalcraft (sets 10001–10004)

**Scope:** 49 non-basic Portalcraft cards (`1017…` / `1027…` / `1037…` / `1047…`). Basic Portal (7) in Batch 1. Artifact / Puppetry / Gear tokens (`90xxx`) exercised only via parent cards.

**Audit:** `tests/audit/batch08_portalcraft.test.ts` (A-tier). **B/C:** `tests/audit/batch08_portalcraft_ruled.test.ts`.

| Tier | Count | Notes |
|------|-------|--------|
| A | 22 | Behavioral tests in `batch08_portalcraft.test.ts` |
| B/C | 27 | Ruled escalations in `batch08_portalcraft_ruled.test.ts`; all **un-skipped** (fix pass 2026-05-31) |

**Classification (A = 22):** 10171110, 10171120, 10171130, 10171310, 10171320, 10172110, 10172130, 10172310, 10173210, 10174110, 10174120, 10271110, 10272310, 10273310, 10274110, 10371120, 10371310, 10372120, 10471110, 10471120, 10471130, 10472310.

**B/C list (26) — one-line reading:**

| ID | Reading |
|----|---------|
| 10171140 | Once/turn: allied Puppetry enter → Bane |
| 10172120 | Evolve replicates Fanfare (Puppet to hand) |
| 10172320 | Select 2 Artifact ≤5 in hand → summon copies, opponent-EOT destroy on copies |
| 10173110 | Evolve replicates Fanfare (both Gears) |
| 10173120 | Mode: draw 2 / heal 4; Evolve destroy enemy; SE destroy 2 |
| 10173130 | Fanfare 3 Enhanced Puppet; Evolve grant Ward + LW 2 to leader on Puppetry allies |
| 10173140 | Evolve: summon copy of Artifact ≤5 in hand |
| 10174130 | Fanfare: select up to 3 Artifact ≤5, summon copies; SE +1/+1 all allied Artifacts |
| 10271120 | Fanfare if super-evo ally: Puppet +3/+0 |
| 10271210 | Engage (3) sacrifice: summon Artifact ≤5 copy, copy gets opponent-EOT destroy |
| 10272110 | Fanfare: transform Puppetry in hand → Doll Slayer |
| 10272120 | Evolve: banish enemy ≤4 ATK, summon exact copy |
| 10273110 | Evolve: Ward + can't be destroyed by abilities on selected Artifact in hand |
| 10274120 | Fanfare summon Artifact copy; SE 2 attacks/turn |
| 10371110 | Fanfare: +X/+X (other allies), destroy other allies |
| 10372110 | Fanfare destroy other ally → 2 random dmg; Evolve replicate |
| 10372210 | Fanfare destroy other ally → draw 2; LW draw 1 |
| 10373110 | Fanfare: destroy X random enemies (X = other allies), destroy other allies |
| 10373310 | Destroy allied card → summon White Psalm |
| 10374110 | SE: X dmg to enemy leader (X = other allies), destroy other allies |
| 10374120 | Fanfare Melodious Monody; Evolve summon White Psalm |
| 10472110 | Skybound Art: evolve another unevolved ally + self; Clash 3 dmg |
| 10472120 | Mode: 3× random 4 dmg / 4 to leader |
| 10473110 | Fanfare: AoE X = selected Artifact ATK; LW Fortifier |
| 10473310 | 3 dmg all enemies; SSA 6 |
| 10474110 | Fanfare 6×1 random; buff enemy hand +1/+0; SA crest |
| 10474120 | Fanfare: select 2 enemies, silence + 9 dmg; leader takes +1 |

**Primitives:**

| Primitive | File | Status |
|-----------|------|--------|
| Artifact tokens (8), Gears `cant_play`, fuse transform/waste, α+β+γ→Ω, Flight of Icarus, Dirk Fortifier | `primitives_batch8_artifact.test.ts` | **green** |
| Puppetry tribe, Puppet Shield, Noah puppets, Vier → Doll Slayer | `primitives_batch8_puppetry.test.ts` | **green** |
| No Resonance on Portal inventory; no `evolve_trigger_always` on Portal | `primitives_batch8_portal_watch.test.ts` | **green** |
| Clash (`event: clash` → `clash_opponent` damage in follower combat) | `primitives_batch8_clash.test.ts` | **green** |
| Loot fuse (draw) | `primitives_batch4_fuse.test.ts` | Reused — Portal fuse **does not draw** (transform/waste) |

**Fix pass (2026-05-31):** `npm run test:audit` — **505 passed** (505 total). Nine formerly failing B/C tests un-skipped and green by correct means.

| Card / area | Tag | Fix |
|-------------|-----|--------|
| Alouette 10173140, Karula 10274120, Ralmia 10174130 | **engine-fix** | `summon source:hand mode:copy`: fast-path single Artifact, `requiresConfirmation: false` on pending; board assertions corrected to **1 copy** (card text) |
| Catapult 10271210 | **reconcile** | Same op path; EOT handler was already green (`requiresConfirmation` omitted). Non-EOT path unified — not proof the broken path worked |
| Cassius 10473110 | **engine-fix** | Parser: `ally:hand_card` → hand pool; `{selected.attack}` via `selectedCard` in damage context |
| Wasteland 10372210, Supplicant 10372110 | **engine-fix** | Targeted `destroy` queues `then` on `resumeEffects` (no illegal `runEffects` inside handler) |
| Tsubasa 10471120 | **engine-fix** | `boost_skybound_art_hand` bumps `skyboundArtEvolvesWitnessed` on all hand cards |
| Ilsa 10472120 | **test-fix** | `HEADLESS = false` + `injectAdapter({ showChoiceModal: (_, cb) => cb(1) })` before play (global HEADLESS was routing to AI mode 1) |
| Beelzebub 10474120 | **test-fix** | Drive both UIDs like Rayvn; card data `select: 2` synced via `cards:update` |
| Lishenna 10374120 | **data-fix** | Fanfare `add_to_hand` Melodious Monody: `"count": 1` in set JSON + `cards:update` |

**Surprises:** Catapult green masked hand-copy gap (EOT vs confirmation-gated pending). Beelzebub needed `select: 2` in loaded DB for multi-select count — test-only UID driving insufficient when `parseSelectConfig` read `select` not `count`.

**Data hygiene (close-out):** `check:cards` now fails if any `op: "select"` uses bare `count` or lacks `select`/`select_count`. Fixed in sets: Ezecrain 10432110 (`select: 2` — exposed Batch 7 test resolving only one target), Elmott 10433110 (`select: 1`), Maximum Love Bomb 10442310, Primal Beast Absorption 10443310, Remi & Rami 10032110, Beelzebub redundant `count` removed.

**B/C card-text confirmation (remaining 18 + destruction cluster retest):**

| Card | Text exercised | Tag |
|------|----------------|-----|
| Medical Assassin 10171140 | Fanfare Enhanced Puppet; Puppetry enter Bane once/turn | ok |
| Lovestruck 10172120 | Evolve replicate Fanfare → Puppet to hand | ok |
| Miriam 10173110 | Evolve replicate Fanfare → both Gears | ok |
| Engineblade 10271110 | Evolve replicate Fanfare → Striker on board | ok |
| Doomwright 10172320 | Select 2 Artifact copies + opponent-EOT destroy trigger | ok |
| Sylvia 10173120 | Mode 1 draw 2 (HEADLESS auto-picks mode 1 ≡ index 0) | ok |
| Liam 10173130 | Fanfare 3 Enhanced Puppet | ok |
| Alouette 10173140 | Evolve 1 Artifact copy (≤5) | ok |
| Karula 10274120 | Fanfare 1 Artifact copy | ok |
| Ralmia 10174130 | Select up to 3 Artifact copies | ok |
| Orchis 10174120 | Puppetry enter Storm + Bane while on board | ok |
| Puppet Cat 10271120 | Super-evo ally gate → Puppet +3/+0 | ok |
| Catapult 10271210 | Engage sacrifice → Artifact copy on board | ok |
| Vier 10272110 | Fanfare transform Puppetry → Doll Slayer | ok |
| Achim 10272120 | Evolve banish ≤4 ATK enemy + copy on board | ok |
| Carnelia 10273110 | Evolve Ward + indestructible on hand Artifact | ok |
| Zwei 10274110 | Puppetry enter Ward while on board | ok |
| Devotee 10371110 | +1/+1 per other ally; destroy others (5/5 with 1 ally) | ok |
| Supplicant 10372110 | Destroy ally **then** 2 random dmg to enemy | ok (retest) |
| Wasteland 10372210 | Destroy ally **then** draw 2 | ok (retest) |
| Congregant 10373110 | X random enemy destroys + clear allies (X=1) | ok (retest) |
| Soprano 10373310 | Destroy ally + summon White Psalm | ok (retest) |
| Axia 10374110 | Super: X leader dmg + clear allies (X=1) | ok (new) |
| Lishenna 10374120 | Fanfare Monody; Evolve White Psalm | ok |
| Eustace 10472110 | Skybound Art- dual evolve (ally + self); Clash 3 via `attackFollower` | ok |
| Ilsa 10472120 | Mode 2: 4 to enemy leader | ok (test) |
| Cassius 10473110 | AoE X = selected Artifact ATK | ok |
| Chaos Legion 10473310 | 3 dmg all enemies | ok |
| Lu Woh 10474110 | 6×1 random to followers | ok |
| Beelzebub 10474120 | Select 2 silence + 9 each | ok (test + data) |
| Ancient Cannon 10173210 | on_fuse → 2 random enemy dmg | ok |

**Batch 8 closed:** `npm run test:audit` **509/509 green**; `npm run check:cards` green with select-op guard. Clash primitive + Eustace B/C test confirm `event: "clash"` fires in follower combat (not a new mechanic gap).

### Batch 9 — Neutral non-basic (sets 10001–10004)

**Scope:** 29 Neutral cards (class digit `0`, excluding `10000_basic`). Audit: `tests/audit/batch09_neutral.test.ts` (A), `tests/audit/batch09_neutral_ruled.test.ts` (B/C).

**Roster (29):**

| Set | IDs |
|-----|-----|
| 10001 Legends Rise | 10101110 Ruby, 10101120 Vigilant Detective, 10101310 Goblin Foray, 10102110 Apollo, 10102310 Seraphic Tidings, 10103110 Phildau, 10103310 Divine Thunder, 10104110 Olivia, 10104120 Ruler of Cocytus |
| 10002 Infinity Evolved | 10201110 Twinblade Goblin, 10201310 Dark Side, 10202110 Cheretta, 10203110 Reina, 10203120 Hnikar, 10204110 Odin, 10204120 Grimnir |
| 10003 Heirs of the Omen | 10301110 Apostle, 10301310 Greatness Ascended, 10302110 Inspirational One, 10303110 Dogged One, 10303210 Tablet of Tribulations, 10304110 Mjerrabaine, 10304120 Gilnelise |
| 10004 Skybound Dragons | 10401110 Katalina, 10401120 Vyrn, 10402110 Yuni, 10403110 Gran & Djeeta, 10403120 Lyria, 10404110 Sandalphon |

**Classification:** **18 A** / **11 B/C** (62% A — higher reuse than Portal’s 47%).

| Tier | Count | Cards |
|------|-------|-------|
| **A** | 18 | Ruby, Vigilant Detective, Goblin Foray, Apollo, Seraphic Tidings, Phildau, Divine Thunder, Ruler of Cocytus, Twinblade, Dark Side, Cheretta, Reina, Odin, Grimnir (crest gain), Apostle, Greatness Ascended, Gilnelise (stat), Katalina (SA damage), Vyrn |
| **B/C** | 11 | Olivia, Hnikar, Inspirational One, Dogged One, Tablet, Mjerrabaine, Yuni, Katalina (damage cap), Gran & Djeeta, Lyria, Sandalphon |

**B/C one-line readings:**

| ID | Reading |
|----|---------|
| 10104110 Olivia | Fanfare draw 2 + restore 2 + recover 2 PP; Super-Evolve selects another unevolved ally (not self). |
| 10203120 Hnikar | Enhance (5) evolves self; Last Words if evolved → 4 to random enemy follower. |
| 10302110 Inspirational One | In hand: on enemy super-evolve → gain Bane on this card. |
| 10303110 Dogged One | In hand: on enemy super-evolve → gain Storm on this card. |
| 10303210 Tablet | Fanfare banish all deck duplicates (keep singletons); Engage draw 1. |
| 10304110 Mjerrabaine | Evolve crest: replace deck (set minus self), deckout = win; EOT discard all but Great Testimony + draw 6. |
| 10402110 Yuni | Aura EOT: restore 1 to all allies. |
| 10401110 Katalina | Max 3 damage per instance (follower keyword cap). |
| 10403110 Gran & Djeeta | Mode pick; Skybound Art- self-evolve at 10 witnessed. |
| 10403120 Lyria | Enhance (8): search follower cost ≥7 + recover 7 PP. |
| 10404110 Sandalphon | Deck invoke at 6 ally evolves: crest + return to hand; SSA fanfare 5×2 random. |

**Primitives exercised:** Ward, Storm, Rush, replicate, skybound_art gate, super_evo_unlocked / super_evolved_allied gates, crest gain, banish select, deck replace (list + from_set), highlander, mode, Enhance, engage, damage cap keyword, invoke-from-deck.

**New primitive tests:** `primitives_batch9_deck_duplicates.test.ts` (**green**), `primitives_batch9_enemy_super_evolve_hand.test.ts` (**green**).

**Fix pass (2026-05-31):** `npm run test:audit` **542/542 green**.

| Item | Tag | Fix |
|------|-----|-----|
| `enemy_super_evolve` hand listeners | **engine-fix** | `fireTrigger("enemy_super_evolve", owner, …)` — activePlayer is super-evolver; existing `process.ts` / `zones.ts` predicates now route to opponent-side listeners |
| Inspirational One / Dogged One + primitive | **verify** | Hand gains Bane/Storm on opponent super-evolve |
| Yuni `restore target: "allies"` | **engine-fix** | Bare `"allies"` defaults `player: "self"`; allies dispatch uses `targetPlayer` |
| Sandalphon invoke | **test-fix** | Deck `[Sandalphon, …fillers]` — tail-draw leaves Sandalphon in deck for invoke scan |
| Olivia / Hnikar / Tablet / Mjerrabaine / Katalina / Gran / Lyria | **test-fix** | B/C assertions cover full card text |

**Batch 9 closed:** A **18/18**; B/C **11/11**; audit **542/542**.

**Artifact token family (data):** Gear of Ambition, Gear of Remembrance, Striker Artifact, Fortifier Artifact, Ominous Artifact α/β/γ, Masterwork Artifact Ω (`90071210`–`90074110`).

**Puppetry token family (data):** Puppet, Enhanced Puppet, Doll Slayer, Lloyd, Victoria (`90071110`, `90071120`, `90072130`, + Lloyd/Victoria IDs in `token_details.json`).
