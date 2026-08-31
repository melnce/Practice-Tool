# Card-data drift inventory — 2026-08-31

PR 1 of the normalisation series. **No card data was changed.** This document records
measured drift, the canonical forms chosen for later PRs, and places where variants are
**not** synonyms.

Source pool: `cards/all.json` / `cards/sets/*.json` — **811 cards**.
Op-node counts below are from a full-tree walk of every card object.

**Standing instruction (owner, 2026-08-31):** card text is bible. Weight fragility —
_"the codebase is very fragile as it was built on sand and hope originally"_ — in every
judgement call. Prefer honest "blocked — needs X" over a plausible guess.

---

## Owner ruling — 2026-08-31

> **"card text is bible. it says at the end of YOUR turn so yes thats correct."**

A turn-boundary trigger whose printed text says _"at the start/end of YOUR turn"_ fires
**only on its owner's boundary**. Absent a recorded owner ruling to the contrary, the
printed text governs, and **the authored data is never itself evidence of intent**.

Implication for this inventory: bare board/hand authoring that contradicts "your turn"
text is a **bug**, not a deliberate both-boundaries choice — even if the JSON has been
shipping that way for months.

---

## Text-vs-scope sweep (all turn-boundary triggers)

Compared **all 82** turn-boundary triggers in the pool against the scoping sentence in
their own printed text (for crest triggers: the **crest's** description, not the granting
card's). **Do not re-derive these numbers** — they are the authoritative sweep for this
PR.

**78 of 82 already match.** Four did not:

| card                                        | authored                                                        | printed text                                                                                                   | verdict                           |
| ------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Dark Dimensions `10603210`**              | bare `event: end_of_turn`                                       | _"At the end of **your** turn, deal 2 damage to all non-Encroacher followers"_                                 | **BUG, reproduced**               |
| **Galleon, Earth Personified `10464110`**   | bare `event: end_of_turn`                                       | _"At the end of **your** turn, if you've unlocked super-evolution, evolve a random unevolved allied follower"_ | **BUG, same class**               |
| **Illamrita, Designated Target `10704110`** | bare `event: end_of_turn`, **granted to the opposing follower** | _"Give the opposing follower … 'At the end of **your** turn, banish this card.'"_                              | **subtle — open question below**  |
| Agent of the Testaments `10962110`          | `type: end_of_turn_own` (already correct for "your turn")       | —                                                                                                              | **false positive of the scanner** |

### Dark Dimensions `10603210` — BUG, reproduced

Amulet owned by `first`; running the end-of-turn boundary for `second` dealt 2 damage to
every follower on both boards. The AoE resolves **twice per round** instead of once.
Harness `turn_boundary` scenario covers this card (fingerprint captures the double-fire);
a later fix will fail `cards:verify` until the baseline is updated.

### Galleon `10464110` — BUG, same class

Same bare board `event: end_of_turn` vs _"your turn"_ text. Same engine path as Dark
Dimensions. Not fixed here — PR 2, per-card, against printed text.

### Illamrita `10704110` — open question (do not guess)

The trigger is **granted** to the opposing follower:

```json
{
  "event": "end_of_turn",
  "source": "board",
  "effects": [{ "op": "banish", "scope": "self" }]
}
```

"Your turn" in the quoted ability is from the **granted follower's controller's**
perspective — the opponent's turn as seen from Illamrita. Bare (both boundaries) is wrong
relative to that text, but the right fix depends on whether the engine attributes a
granted trigger's owner to the follower now carrying it.

**Blocked — needs:** confirm owner-of-record for a granted board trigger before choosing
`whose_turn: "owner"` vs any other spelling. Do not answer by guessing. Not fixed in PR 1.

### Agent of the Testaments `10962110` — known false positive

The text-vs-scope scanner grabbed _"Give this follower Ambush until the end of your
opponent's turn"_ — that is a **duration on a keyword**, not a trigger-scope sentence.
The card's actual turn trigger is already `type: end_of_turn_own` (owner-scoped; matches
intent).

**Recorded so nobody re-flags it.** The canonical-form gate is **shape-only** (JSON
spelling); it must never treat keyword-duration phrasing as trigger scope. Agent remains
on the turn-scope **spelling** worklist only because it uses `type: "*_own"` (canonical
migrate), not because its behaviour is wrong.

---

## Family 1 — Turn scoping

### Spellings found

| spelling                                                 | node count | notes                                                |
| -------------------------------------------------------- | ---------- | ---------------------------------------------------- |
| `type: "end_of_turn_own"`                                | 51         | `event` is **undefined** on all of them              |
| `type: "start_of_turn_own"`                              | 3          | same — `type` is the event carrier                   |
| `event` + `condition.whose_turn: "owner"` (turn events)  | 4          | canonical form                                       |
| `event` + `condition.whose_turn: "opponent"`             | 1          | canonical form for reactive                          |
| `event` + `condition.own_turn: true` (turn events)       | 3          | synonym of `whose_turn: "owner"`                     |
| bare `event: "end_of_turn"` / `start_of_turn` (no scope) | see below  | **zone-ambiguous** — see "Bare is ambiguous by zone" |

### `type: "*_own"` carries `event: undefined` — not a rename

All **54** `type: "*_own"` triggers have `event: undefined`. For those nodes, **`type` IS
the event carrier**. Migration is:

1. add `event: "end_of_turn"` or `"start_of_turn"`
2. add `condition: { whose_turn: "owner" }` (merge into existing condition object if any)
3. remove `type`

**Not a rename.** A gate or migration that only rewrites the key name will leave
`event: undefined` and break the card.

### Bare is ambiguous by zone — the single most valuable fix

Identical bare JSON means **opposite** things depending on zone:

| zone           | bare `event: end_of_turn` / `start_of_turn` means                |
| -------------- | ---------------------------------------------------------------- |
| **crest**      | owner-only (PR #109 default scoping via `crestTurnBoundaryRole`) |
| **board/hand** | **both** players' boundaries (`turnBoundary.ts` §213 bare path)  |

That ambiguity is exactly what hid Dark Dimensions: crest-shaped intuition ("bare = my
turn") does not apply on the board. **Canonical form must make intent explicit**
(`whose_turn: "owner" | "opponent"`) rather than relying on zone context. That is the
highest-value outcome of this whole exercise.

Absence of scope remains expressible for a true both-boundaries board/hand trigger — but
it must be **deliberate**, never inferred from shipping data when the printed text says
"your turn".

### Canonical form (chosen)

```json
{
  "event": "end_of_turn" | "start_of_turn",
  "condition": { "whose_turn": "owner" | "opponent" },
  "effects": [ ... ]
}
```

- Explicit `whose_turn` for owner-only / opponent-only.
- Bare board/hand only when text (or a recorded ruling) truly means both boundaries.
- Crest payloads should also be explicit going forward; do not depend on crest-default bare.

### Why

Printed text governs (owner ruling). Engine dual-path (`ownerRoleForTrigger` +
`evalCommonConditions`) already understands `whose_turn`. `type: "*_own"` hides the
missing `event` field. `own_turn` is a boolean synonym of `whose_turn: "owner"`. Explicit
scope removes the crest-vs-board bare trap.

### Deviating card ids (`type: "*_own"` or `own_turn` on turn events)

WARN-mode gate worklist for **spelling** migration (not all are behaviour bugs — most
already match "your turn" text via `*_own` / `own_turn`):

- `10072210` Puppet Theater — type: end_of_turn_own
- `10113210` Godwood Staff — type: end_of_turn_own
- `10133110` Juno, Visionary Alchemist — type: end_of_turn_own
- `10153110` Ceres, Blue Rose Maiden — type: end_of_turn_own
- `10153140` Balto, Dusk Bounty Hunter — type: end_of_turn_own
- `10174110` Eudie, Maiden Reborn — type: end_of_turn_own
- `10204120` Grimnir, Heavenly Gale — type: end_of_turn_own
- `10222110` Gelt, Intrepid Vice-Captain — type: end_of_turn_own
- `10233310` Pascale's Dance — type: end_of_turn_own
- `10261120` Damus, Oracle of Malice — type: end_of_turn_own
- `10304110` Mjerrabaine, Great Manifest — type: end_of_turn_own
- `10342110` Supplicant of Disdain — type: end_of_turn_own
- `10343110` Congregant of Disdain — type: end_of_turn_own
- `10361110` Devotee of Repose — type: end_of_turn_own
- `10362110` Supplicant of Repose — type: end_of_turn_own
- `10363110` Congregant of Repose — type: end_of_turn_own
- `10364110` Himeka, Heir to Repose — type: end_of_turn_own
- `10364120` Marwynn, Despair Manifest — type: end_of_turn_own
- `10402110` Yuni, Cosmic Legacy — type: end_of_turn_own
- `10411120` Manamel, Super Cutest — type: end_of_turn_own
- `10431120` Suframare, Wandering Tutor — type: end_of_turn_own
- `10451310` Valiant Edge — type: end_of_turn_own
- `10452110` Nezha, Soaring War God — type: end_of_turn_own
- `10453310` Corruption — type: end_of_turn_own
- `10454110` Fediel, Darkness Personified — type: end_of_turn_own
- `10461120` Lamretta, Sisterly Shepherd — type: end_of_turn_own
- `10523110` Unmoving Tactician — type: end_of_turn_own
- `10524110` Oluon, Raging Chariot — type: end_of_turn_own
- `10544110` Erntz, Governing Justice — type: end_of_turn_own
- `10564110` Sofina, Inspiring Strength — type: end_of_turn_own
- `10574110` Slaus, Revolving Wheel of Fortune — type: start_of_turn_own
- `10574110` Slaus, Revolving Wheel of Fortune — type: end_of_turn_own
- `10642120` Spiked Dragon — type: end_of_turn_own
- `10673110` Ludicrous Ordnance — type: end_of_turn_own
- `10703210` City of Babelon — type: end_of_turn_own
- `10704120` Altaro, Mayor of Babelon — type: end_of_turn_own
- `10713110` Frostbow Sniper — type: end_of_turn_own
- `10714110` Thestae, Anathema of Distortion — type: end_of_turn_own
- `10714120` Great Hart of the Glacial Realm — type: end_of_turn_own
- `10742120` Draconic Part-Timer — type: end_of_turn_own
- `10744110` Burnite, Anathema of Ash — type: start_of_turn_own
- `10744120` Dragon's Vale Elder — type: end_of_turn_own
- `10842110` Reef & Lolo, Serene Sirens — type: end_of_turn_own
- `10854120` Ceres, Liminal Rose — type: end_of_turn_own
- `10863210` Academy Hijinks — type: end_of_turn_own
- `10913310` Crimson Incense — type: end_of_turn_own
- `10954110` Istyndet vs. Mitilykket — type: end_of_turn_own
- `10954120` Garodeth vs. Zeth — type: end_of_turn_own
- `10962110` Agent of the Testaments — type: end_of_turn_own (spelling only; behaviour OK — see false positive)
- `10964110` Erralde, Signet Convict — type: end_of_turn_own

- `10434120` Cagliostro, Genius Alchemist — own_turn on start_of_turn
- `10441120` Mari, Meg's Bestie — own_turn on end_of_turn
- `10441310` Crescent Tube Ride — own_turn on end_of_turn

### Canonical already (`whose_turn` on turn events)

- `10433110` Elmott, Remembrance Aflame — whose_turn:owner on start_of_turn
- `10522120` Amphibian Goldmuncher — whose_turn:owner on end_of_turn
- `10524120` Unkei, Goldbloom — whose_turn:owner on end_of_turn
- `10903210` Azvaldt, Penitentiary of Chaos — whose_turn:owner on end_of_turn

- `10734110` Lilanthim, Anathema of Predation — whose_turn:opponent on end_of_turn

### Crest-nested bare turn events (text match via crest default — still migrate to explicit)

These appear as bare `event` under crest payloads. Crest bare SOT/EOT is currently
owner-scoped (PR #109), which is why most already match "your turn" in the crest text —
but relying on that default is the trap. Prefer explicit `whose_turn` in PR 2+:

- Sandalphon `10404110` (crest EOT restore)
- Rigor of the Nightblossom `10553310` (crest EOT)
- Burnite `10144110` (opponent crest SOT)
- Titania `10214110` (crest SOT)
- Bergent `10232110` (crest SOT)
- Charon `10254120` (crest SOT)

Do **not** apply the Dark Dimensions board fix blindly to these.

---

## Family 2 — Selection count

### Spellings found

| spelling                         | node count      |
| -------------------------------- | --------------- |
| `select: N`                      | majority (~241) |
| `select_count: N` (no `select`)  | 20              |
| both `select` and `select_count` | 0               |

### Canonical form

`select: N` only. Retire `select_count`.

### Why

Most readers use `eff.select ?? eff.select_count ?? 1` (targeting, mode, keyword,
summon-hand, stat). **Correction (PR 3):** that claim was false for
`returnHandToDeck.ts` / `bounce.ts`, which gated on truthy `select` then read
`select_count` only — so a card already authored as `select: N` (e.g. Cognitive
Shift `10711310`) silently got count 1. Fixed to the same `select ?? select_count`
order. One spelling; `select` is the majority and is now canonical in card data.

### Deviating card ids

- `10131310` Radiant Rainbow — op:select select_count:1
- `10132320` Snowman Army — op:select select_count:1
- `10242210` Pyrewyrm Blade — op:select select_count:1
- `10272120` Achim, Lord of Despair — op:select select_count:1
- `10403110` Gran & Djeeta, Valiant Skyfarers — op:mode select_count:1
- `10413310` Alfheimr — op:mode select_count:1
- `10423110` Golden Knight, True King's Blade — op:mode select_count:1
- `10423310` Knightly Ardor — op:mode select_count:1
- `10432310` Unleashed — op:mode select_count:1
- `10452130` Baal, Elemental Resonance — op:mode select_count:1
- `10532310` Kitty Cunning — op:mode select_count:2
- `10552120` Friendly Blue Ogre — op:select select_count:1
- `10564120` Kukishiro, Mistbloom — op:mode select_count:1 (×2 nodes)
- `10574110` Slaus, Revolving Wheel of Fortune — op:mode select_count:1 (×2 nodes)
- `10604110` Omegotep, the Dreaded One — op:mode select_count:2
- `10721310` Measured Attunement — op:select select_count:1
- `10931120` Key Spirit — op:select select_count:1
- `10953310` Reaper's Due — op:select select_count:1

### Not redundant — `select` + `count` on summon (do NOT flag as select-count drift)

These three carry both `select` and `count` on `op: "summon"` hand/artifact copy ops.
**Verified against engine:** hand-artifact copy uses `select ?? select_count` for the
selection size (`parseHandArtifactSelectCount` / `handleSelectHandSummonArtifactCopy`).
`count` is parsed into `UnifiedSummonSpec.count` for named/deck/etc. sources but is
**not read** by the hand-copy selection path. So `count` here is currently inert
alongside `select` — likely authoring echo of "select N / summon N", not a second
meaning. Still **not** a `select_count` synonym; leave for per-card cleanup (safe to
drop `count` only after confirming no other handler path).

- `10172320` Doomwright Resurgence — op:summon select:2 count:2
- `10174130` Ralmia, Sonic Boom — op:summon select:3 count:3
- `10572110` New-Age Cartographer — op:summon select:1 count:1

---

## Family 3 — Chosen-target effects

### Spellings found

| form                                     | role                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| flat `damage`+`select` (and peers)       | single effect consumes the selection (~64 flat damage+select; ~230 flat select ops overall) |
| nested `op: "select"` → `effects: [...]` | share one selection across 2+ consumers (10 nested→damage; 21 multi-child overall)          |

Flat and nested are **not interchangeable**. Nested is **required** when 2+ effects share
one selection (Elmott `10433110` silences _and_ damages the same target).

### Canonical rule (not a blanket conversion)

- **Flat** `{ op, target, select }` when a **single** effect consumes the selection.
- **Nested** `{ op: "select", effects: [A, B, ...] }` when **two or more** effects must
  share one selection.
- Nested with a single child that is `gate` / `mode` stays nested (branches share selection).
- Nested with a single child that does **not** use `selected:*` is not a flat candidate
  (selection may feed a different field — e.g. Cassius).

### Why

`check:select-target` already requires a selection ancestor for `selected:*` targets.
Forcing everything nested (or everything flat) would either break multi-effect shares or
add pointless wrappers.

### Deviating card ids (nested + single `selected:*` consumer → should be flat)

**Migrated in PR 4** (nested single-consumer → flat):

- `10432110` Ezecrain, Portent of Vengeance — flat damage+select:2
- `10433310` Alchemic Flare — flat damage+select:1
- `10552120` Friendly Blue Ogre — flat stat+select:1
- `10614110` Althenia, Nurturing Bloom — flat destroy+select:1
- `10664120` Lyanthoth, Eld Tome — flat destroy+select:3 + condition.not_self
  (pool-equivalence proven: nested `handleSelect` pool ≡ flat `handleDestroy`
  pool; play-path pending pool excludes Lyanthoth itself)
- `10741120` Carrier Wyvern — evolve only → flat stat+select:1 (fanfare already flat)
- `10953310` Reaper's Due — flat keyword+select:1

### Deferred — needs engine support before flatten

- `10602210` Encroached World — nested select → transform `into_source:enemy:deck`.
  **Deferred — flat form is not behaviour-equivalent today.** Flat
  `{op:transform, target:ally:hand, select:1, into_source:enemy:deck}` hits
  `transform.ts`'s `into_source === "enemy:deck"` branch, which auto-slices the
  pool (`pool.slice(0, selectN)`) and never calls `setPendingTarget`. Nested
  `op:select` is what opens the hand-selection UI. Proven by
  `batch14_owner_rulings_final8` (Encroached World Engage) going red under the
  flat form and green when left nested. Gate excludes this id until the flat
  `into_source` path learns pending select.

### Harness note — `gameTick` is dispatch-depth sensitive

PR 4's flatten moved fingerprints for **5 cards / 6 scenarios**
(Ezecrain play, Alchemic Flare play, Friendly Blue Ogre play+evolve,
Lyanthoth play, Reaper's Due play). Diffing the full `fingerprintGameState`
detail (not the hash) showed the **only** differing field was `gameTick`
(flat is 1–3 ticks cheaper). Every board, hand, deck, graveyard, banish,
crest, counter, keyword, HP, and `pending` field was byte-identical.
`gameTick` counts internal effect-dispatch hops; removing the nested
`op:select` wrapper removes a hop — so the move is expected and not
player-visible. Baseline regenerated for that reason
(`npm run cards:baseline`).

A future shape-only refactor should expect the same and verify the same
way: dump the fingerprint **detail** and diff the JSON — do not trust the
hash alone. Possible follow-up: drop `gameTick` from `fingerprintGameState`
so the harness ignores pure dispatch-depth changes — **do not do that in
this series**; it would invalidate every baseline recorded so far.

### Correctly nested (2+ shared consumers) — do not "fix"

- `10032110` Remi & Rami, Two-Faced Witch — effects: [evolve, stat]
- `10131310` Radiant Rainbow — effects: [spellboost, draw]
- `10132320` Snowman Army — effects: [stat, stat]
- `10242210` Pyrewyrm Blade — effects: [stat, keyword]
- `10262310` Divine Guard — effects: [stat, damage]
- `10272120` Achim, Lord of Despair — effects: [banish, summon]
- `10332210` Institute of Truth — effects: [cost, stat]
- `10333310` Illusory Conjuration — effects: [cost, destroy]
- `10354110` Sham-Nacha, Heir to Entwining — effects: [destroy, add_to_hand]
- `10364110` Himeka, Heir to Repose — effects: [stat, keyword]
- `10433110` Elmott, Remembrance Aflame — effects: [keyword, damage]
- `10442310` Maximum Love Bomb — effects: [damage, stat]
- `10443310` Primal Beast Absorption — effects: [banish, add_to_hand]
- `10474120` Beelzebub, Supreme King — effects: [keyword, damage]
- `10564110` Sofina, Inspiring Strength — effects: [evolve, stat]
- `10652310` Allure of the Mightiest — effects: [banish, summon]
- `10663210` Sublime Eld Tome — effects: [destroy, gate]
- `10664110` Kandima, Sublime Hatred — effects: [destroy, gate]
- `10671310` Advent of the Eld Axe — effects: [damage, gate]
- `10721310` Measured Attunement — effects: [damage, gate]
- `10861110` Lilium, Witch of the Tomes — effects: [keyword, damage]

---

## Deliberately NOT drift

Variants that look similar but mean different things — **do not bulk-normalise**.

| pair                                                                            | why not synonyms                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `player: "opponent"` (7 uses) vs `target: "enemy:*"` (~400 uses)                | whole-player effect vs board/zone targeting                                         |
| `condition: "string"` (~176, named gate) vs `condition: {obj}` (~68, predicate) | different concepts; normalising either is a bug                                     |
| flat `damage`+`select` (~64) vs nested `op:"select"`→`damage` (~10)             | nested required when 2+ effects share one selection (Elmott)                        |
| `select` + `count` on summon (3 cards)                                          | `count` is summon multiplicity / inert echo — not `select_count`                    |
| keyword-duration _"until the end of your (opponent's) turn"_                    | **not** a turn-boundary trigger scope (Agent of the Testaments false positive)      |
| crest bare vs board bare                                                        | same JSON, opposite engine meaning — migrate to explicit `whose_turn`, don't equate |

`player: "opponent"` cards:

- `10144110` Burnite, Anathema of Flame — op:crest
- `10221310` Lucrative Deal — op:draw
- `10314110` Krulle, Heir to Unkilling — op:crest
- `10453310` Corruption — op:crest
- `10574110` Slaus, Revolving Wheel of Fortune — op:crest
- `10744110` Burnite, Anathema of Ash — op:crest
- `10832110` Sammy & Marie, Flowers of Joy — op:draw

---

## Harness coverage (PR 1)

Committed baseline: `baselines/card-behaviour.json`

**Do not hand-edit.** Regenerate with `npm run cards:baseline` (same rule as
`cards/all.json`). The file carries `_generated` with that instruction.

|             |                                                       |
| ----------- | ----------------------------------------------------- |
| seed        | 42                                                    |
| version     | 2 (gate-aware)                                        |
| **covered** | **770** — every named gate driven, or none present    |
| **partial** | **26** — drove something; unmet gate conditions named |
| **skipped** | **15** — could not drive (`play_blocked` + reason)    |
| total       | 811                                                   |

### Approach — (a) drive gates where cheap, (b) honest remainder

Drive reachable gate branches where cheap: the arena prepares `combo`, `overflow`,
`necromancy`, `rally`, `pp_at_least`, `max_pp` / `both_max_pp`, `amulet_count`,
`spellboost_count`, `super_evo_unlocked`, `evolved_allied` / `super_evolved_allied`,
`evolved_self` / `super_evolved_self`, `highlander`, `no_ally_attacked`,
`ally_attacked_leader_last_turn`, `skybound_art`, `hand_count` / `hand_count_lte`,
`leader_defense_*`, `has_fuse_materials` / `fused_this_turn`. Gates with
`else_effects` also get a `play_else` deny pass so both branches fingerprint.

Conditions we cannot honestly arrange (`unique_tribe_enters`, `self_cost`,
`ally_matches`, `selected_matches`, …) leave the card as **`partial`** with those
names listed — never as a fake `covered`. A flat "802 covered" was lying the same
way `replay:check` once compared `undefined === undefined`.

### Re-proof (gated branch)

May, Journey Elf `10012110` was the false-covered example (combo:3 gate wrapping all
effects). After the change she is `covered` with `gatesSatisfied: ["combo"]`. Mutating
the combo-branch damage `3 → 9` yields:

```
DIFF — 1 card(s) changed:
  10012110  May, Journey Elf
    [scenario_changed] play: 1391c75b → 231ce51c
```

Restore → OK. The harness no longer vacuous-passes gated no-ops.

Earlier proofs still hold: Alchemic Flare damage and Searing Firenewt target-side flips
detect exactly one card.

Scripts: `npm run cards:baseline` / `npm run cards:verify`.
**Not** wired into `npm run check` yet — propose adding after the first migration PR
lands and the baseline has survived real edits (e.g. as a post-`check:card-text` soft
step, then harden).

---

## Gate

`npm run check:canonical-form` — exit 0 always unless `--fail`.

Per-family filters: `--gate=turn-scope|select-count|chosen-target`.

**Shape-only.** Does not parse card text. Must not treat keyword-duration phrasing
(_"until the end of your opponent's turn"_) as trigger scope — that class of error is
documented under Agent of the Testaments above.

**Hard-fail in `npm run check` (all three families migrated):**

- `check:canonical-form:turn-scope` → `--gate=turn-scope --fail`
- `check:canonical-form:select-count` → `--gate=select-count --fail`
- `check:canonical-form:chosen-target` → `--gate=chosen-target --fail`

---

## Proposed later PR split

1. ~~**PR 2 — turn-scope migration**~~ — landed.
2. ~~**PR 3 — select_count → select**~~ — landed.
3. ~~**PR 4 — nested single-consumer → flat**~~ — landed.
