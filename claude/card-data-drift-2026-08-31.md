# Card-data drift inventory — 2026-08-31

PR 1 of the normalisation series. **No card data was changed.** This document records
measured drift, the canonical forms chosen for later PRs, and places where variants are
**not** synonyms.

Source pool: `cards/all.json` / `cards/sets/*.json` — **811 cards**.
Op-node counts below are from a full-tree walk of every card object.

---

## Family 1 — Turn scoping

### Spellings found

| spelling                                                 | node count | notes                                                                                      |
| -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `type: "end_of_turn_own"`                                | 51         | `event` is **undefined** on all of them                                                    |
| `type: "start_of_turn_own"`                              | 3          | same — `type` is the event carrier                                                         |
| `event` + `condition.whose_turn: "owner"` (turn events)  | 4          | canonical form                                                                             |
| `event` + `condition.whose_turn: "opponent"`             | 1          | canonical form for reactive                                                                |
| `event` + `condition.own_turn: true` (turn events)       | 3          | synonym of `whose_turn: "owner"`                                                           |
| bare `event: "end_of_turn"` / `start_of_turn` (no scope) | see below  | **deliberate** = fires on both players' boundaries for board/hand; crest bare = owner-only |

Confirmed: all 54 `type: "*_own"` nodes have `event: undefined`. Migrating
is **add-event + add-condition.whose_turn + remove-type**, not a rename.

### Canonical form (chosen)

```json
{
  "event": "end_of_turn" | "start_of_turn",
  "condition": { "whose_turn": "owner" | "opponent" },
  "effects": [ ... ]
}
```

- **Absence of `whose_turn` / `own_turn` / `*_own` on a board/hand trigger means
  "fires on both players' boundaries"** (`turnBoundary.ts` §213 bare path). That must
  stay expressible and must be deliberate.
- Crests differ: bare crest SOT/EOT is **owner-only** via `crestTurnBoundaryRole`. Do not
  apply board bare semantics to crest payloads.

### Why

Engine already prefers `event` + `condition.whose_turn` in dual enforcement
(`ownerRoleForTrigger` + `evalCommonConditions`). `type: "*_own"` is a shorthand that
hides the missing `event` field and blocks grepping by event name. `own_turn` is a
boolean synonym of `whose_turn: "owner"`.

### Deviating card ids (`type: "*_own"` or `own_turn` on turn events)

These are the WARN-mode gate worklist for turn-scope:

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
- `10962110` Agent of the Testaments — type: end_of_turn_own
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

Engine reads `eff.select ?? eff.select_count ?? 1` in targeting, mode, keyword, summon-hand,
and stat paths. One spelling; `select` is the majority.

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
- `10564120` Kukishiro, Mistbloom — op:mode select_count:1
- `10574110` Slaus, Revolving Wheel of Fortune — op:mode select_count:1
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

| form                                     | role                                                        |
| ---------------------------------------- | ----------------------------------------------------------- |
| flat `op` + `select`                     | single effect consumes the selection (~230 flat select ops) |
| nested `op: "select"` → `effects: [...]` | share one selection across 2+ consumers (21 multi-child)    |

### Canonical rule (not a blanket conversion)

- **Flat** `{ op, target, select }` when a **single** effect consumes the selection.
- **Nested** `{ op: "select", effects: [A, B, ...] }` when **two or more** effects must
  share one selection (e.g. Elmott silence + damage).
- Nested with a single child that is `gate` / `mode` stays nested (branches share selection).
- Nested with a single child that does **not** use `selected:*` is not a flat candidate
  (selection may feed a different field — e.g. Cassius).

### Why

Flat and nested are **not interchangeable**. `check:select-target` already requires a
selection ancestor for `selected:*` targets. Forcing everything nested (or everything
flat) would either break multi-effect shares or add pointless wrappers.

### Deviating card ids (nested + single `selected:*` consumer → should be flat)

- `10432110` Ezecrain, Portent of Vengeance — nested select → damage
- `10433310` Alchemic Flare — nested select → damage
- `10552120` Friendly Blue Ogre — nested select → stat
- `10602210` Encroached World — nested select → transform
- `10614110` Althenia, Nurturing Bloom — nested select → destroy
- `10664120` Lyanthoth, Eld Tome — nested select → destroy
- `10741120` Carrier Wyvern — nested select → stat
- `10953310` Reaper's Due — nested select → keyword

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

## Non-synonyms / per-card adjudication

Variants that look similar but mean different things — **do not bulk-normalise**.

### Confirmed behaviour bugs (owner sign-off required — not fixed in PR 1)

#### Dark Dimensions `10603210`

Printed: _"At the end of **your** turn, deal 2 damage to all non-Encroacher followers."_

Authored: bare `event: "end_of_turn"` on a **board** amulet.

Engine: `ownerRoleForTrigger` treats bare board turn events as firing on **both**
players' boundaries. Reproduced with harness builders (`seed=42`): amulet owned by
`first`, end-of-turn for `first` dealt 2 to all followers; end-of-turn for `second`
dealt another 2. **Fires twice per round** instead of once.

Harness covers this card via `turn_boundary` (fingerprint captures the double-fire).
Fixing later will correctly fail `cards:verify` until the baseline is updated.

#### Galleon, Earth Personified `10464110`

Printed: _"At the end of **your** turn, if you've unlocked super-evolution, …"_

Authored: bare `event: "end_of_turn"` on a **board** follower (same pattern as Dark
Dimensions). Same engine path — very likely the same double-fire bug. Covered by
`turn_boundary` scenario; not fixed here.

#### Illamrita, Designated Target `10704110` (related)

Follower Strike grants the **opposing** follower a board trigger
`event: "end_of_turn"` (bare) _"At the end of your turn, banish this card."_
On a board card, bare fires both boundaries — so the enchanted follower may banish
at the end of **both** turns. Needs owner ruling against the printed text before any
change.

### Crest-nested bare turn events (usually OK)

These appear as bare `event` in card JSON but live under crest payloads. Crest bare
SOT/EOT is **owner-scoped**, which typically matches "your turn" for the crest owner:

- Sandalphon `10404110` (crest EOT restore)
- Rigor of the Nightblossom `10553310` (crest EOT)
- Burnite `10144110` (opponent crest SOT)
- Titania `10214110` (crest SOT)
- Bergent `10232110` (crest SOT)
- Charon `10254120` (crest SOT)

Do not apply the Dark Dimensions fix blindly to these.

### Deliberately not drift

| pair                                                                                     | why not synonyms                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `player: "opponent"` (7 uses) vs `target: "enemy:*"` (316 cards)                         | whole-player effect vs board/zone targeting                                              |
| `condition: "string"` (169 cards, named gate) vs `condition: {…}` (130 cards, predicate) | different concepts; normalising either is a bug                                          |
| `select` + `count` on summon (3 cards)                                                   | `count` is summon multiplicity / inert echo — not `select_count`                         |
| nested `op:select` with 2+ effects                                                       | required for shared selection — not a minority bug                                       |
| bare board turn event                                                                    | deliberate "both boundaries" spelling — only wrong when text says "your/opponent's turn" |

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

|         |         |
| ------- | ------- |
| seed    | 42      |
| covered | **802** |
| skipped | **9**   |
| total   | 811     |

Skip reasons (honest — not silent passes):

- `play_blocked`: 9

Skipped cards (need specific targets / hand state the standard arena does not satisfy):

- `10021310` Way of the Maid — play_blocked: Spell requires a target but none are available.
- `10131310` Radiant Rainbow — play_blocked: Spell requires a card in hand with Spellboost.
- `10243310` Draconic Strike — play_blocked: Spell requires a target but none are available.
- `10272310` Flight of Icarus — play_blocked: Spell requires a Artifact follower target but none are available.
- `10333310` Illusory Conjuration — play_blocked: Spell requires a target but none are available.
- `10561310` Malice of the Mistbloom — play_blocked: Spell requires a target but none are available.
- `10673310` Unfeeling Eld Axe — play_blocked: Spell requires a target but none are available.
- `10711310` Cognitive Shift — play_blocked: Spell requires a target but none are available.
- `10853310` Ebb and Flow — play_blocked: Spell requires a target but none are available.

Deliberate mutation proof (Alchemic Flare `10433310` damage 4→9): `cards:verify`
reported **exactly one** diff (`play` fingerprint change) and nothing else; restore
returned to OK.

Scripts: `npm run cards:baseline` / `npm run cards:verify`.
**Not** wired into `npm run check` yet — propose adding after the first migration PR
lands and the baseline has survived real edits (e.g. as a post-`check:card-text` soft
step, then harden).

---

## Gate (WARN mode)

`npm run check:canonical-form` — exit 0 always unless `--fail`.

Per-family filters: `--gate=turn-scope|select-count|chosen-target`.

---

## Proposed later PR split

1. **PR 2 — turn-scope migration** (worklist above) + baseline update; fix Dark Dimensions /
   Galleon only with owner sign-off (may be a dedicated PR).
2. **PR 3 — select_count → select**.
3. **PR 4 — nested single-consumer → flat**.
