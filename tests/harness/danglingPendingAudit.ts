/**
 * Audit of tests that end with `state.pendingTargetEffect` still set.
 *
 * Measured on origin/main (2026-09-08) via afterEach probe in
 * tests/fixtures/setup.ts + vitest run (keys use task.fullTestName when present):
 *   vitest.config.ts: 53 allowlisted test ends
 *   vitest.audit.config.ts: 19 additional test ends
 *   Combined allowlist keys: 72
 *
 * Both configs share setupFiles: ["./tests/fixtures/setup.ts"], so the strict-choose
 * afterEach gate covers both suites.
 *
 * Classifications:
 *   A — Prompt-is-the-subject: pending state, pool, snapshot/undo, or lifecycle.
 *   B — Silently unresolved (three fixed in I2; no longer in this table).
 *
 * Allowlist keys use file + fullTestName (suite path + it title). Renaming an
 * allowlisted test makes the gate fail rather than silently skipping coverage.
 */

export type DanglingPendingClassification = "A" | "B";

export interface DanglingPendingAuditEntry {
  id: number;
  file: string;
  testName: string;
  classification: DanglingPendingClassification;
  reason: string;
  unresolvedClause: string | null;
  assertionsWouldStillPass: boolean | null;
  finding: string | null;
}

export const DANGLING_PENDING_AUDIT: readonly DanglingPendingAuditEntry[] = [
  {
    id: 1,
    file: "tests/mechanics/multi-discard-position.test.ts",
    testName:
      "multi-discard position save/load (engineDispatch) > (a) 'Goddess of Starlight evolve' > save after first pick → restore → remaining picks match uninterrupted run",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 2,
    file: "tests/mechanics/multi-discard-position.test.ts",
    testName:
      "multi-discard position save/load (engineDispatch) > (b) restored mid-prompt snapshot reports first pick in targetUids",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 3,
    file: "tests/mechanics/multi-discard-position.test.ts",
    testName:
      "multi-discard position save/load (engineDispatch) > (d) uncommitted multi-pick prompt restores with no picks (f9a55e6)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 4,
    file: "tests/mechanics/board-cap.test.ts",
    testName:
      "board field cap > soak repro seed20260913 game391 — replaySoakTrace stays at ≤5 field",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 5,
    file: "tests/unit/official-qa-havencraft.test.ts",
    testName:
      "Official Q&A — Havencraft batch 5 > 10261110 Cleric of Crushing — cannot select Orchis when Lloyd is super-evolved (official Q&A)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 6,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "Lloyd forced first pick (pool-derived) > (c) either-side choose: enemy Lloyd blocks allied followers (Dark Side)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 7,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "Lloyd forced first pick (pool-derived) > (e) two Lloyds: either may be the first pick",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 8,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "Lloyd forced first pick (pool-derived) > (f) auto-select path picks Lloyd first when in pool",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 9,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "Lloyd forced first pick (pool-derived) > (i) own Lloyd on board: any:follower select does not force own Lloyd or allies",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 10,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "Lloyd forced first pick (pool-derived) > (ii) own Lloyd on board: ally:follower select (Soul Tuning) does not force",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 11,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "Lloyd forced first pick (pool-derived) > (iii) both sides Lloyd: any:follower select forces enemy Lloyd only",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 12,
    file: "tests/mechanics/history-lastplayed-null-snapshot.test.ts",
    testName:
      "history __lastPlayedCard and null snapshot boards > captureSnapshot() during paused deferred Last Words prompt has no null board slots",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 13,
    file: "tests/unit/soak_history_ring.test.ts",
    testName:
      "soak deep history ring accounting > play → choose (0 commits) → confirm with nested commit: ring counts and deep chain lands on before",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 14,
    file: "tests/mechanics/history-snapshot-aliasing.test.ts",
    testName:
      "engine dispatch history snapshot aliasing > __lastSelected is cleared on undo after nested_effects target resolution",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 15,
    file: "tests/mechanics/dragon_meta_bugs.test.ts",
    testName:
      "BUG 3 — Gilnelise evolve can target self; fanfare still excludes self > evolve selection pool includes Gilnelise; fanfare pool excludes her",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 16,
    file: "tests/mechanics/target-prompt-undo.test.ts",
    testName:
      "target prompt snapshot sanitization > captureSnapshot clears pending targetUids and __uiSelectable flags",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 17,
    file: "tests/mechanics/target-prompt-undo.test.ts",
    testName:
      "target prompt undo via engineDispatch > click one target of two, undo confirm step → prompt open with empty targetUids",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 18,
    file: "tests/mechanics/target-prompt-undo.test.ts",
    testName:
      "target prompt undo via dispatchAction > click one target of two, undo confirm step → prompt open with empty targetUids",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 19,
    file: "tests/unit/name_filter_targeting.test.ts",
    testName:
      "name filter on targeted selection pools > 10932110 Enamored Researcher — Evolve give Bane > selection pool is only Obsessed Test Subject (not unrelated allies)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 20,
    file: "tests/unit/name_filter_targeting.test.ts",
    testName:
      "name filter on targeted selection pools > 10933110 Ecstatic Scholar — Super-Evolve give Drain > selection pool is only Obsessed Test Subject after fuse",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 21,
    file: "tests/unit/damage_add_amount_once.test.ts",
    testName:
      "pending damage bake invariant — add_amount must not ride along > after selectable damage opens, stored eff has baked amount and no re-addable add_amount",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 22,
    file: "tests/unit/damage_add_amount_once.test.ts",
    testName:
      "pending damage bake invariant — add_amount must not ride along > Stormy Blast N=2: pending eff amount is 4 and add_amount is stripped",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 23,
    file: "tests/mechanics/fuse-gear-lifecycle.test.ts",
    testName:
      "gear multi-fuse lifecycle via engineDispatch > one Confirm Targets undo step per prompt; undo reopens with committed pick",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 24,
    file: "tests/mechanics/fuse-gear-lifecycle.test.ts",
    testName:
      "gear multi-fuse lifecycle via dispatchAction > one Confirm Targets undo step per prompt; undo reopens with committed pick",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 25,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName:
      "snapshot dropped function gate > throws when any function is reachable from pendingTargetEffect",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 26,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName:
      "snapshot dropped function gate > fuse confirm_needed pending carries confirmKey, not a function (#315)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 27,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName:
      "snapshot ephemeral gate enforcement > paused mid-prompt commit with empty picks passes the gate",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 28,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName:
      "snapshot ephemeral gate enforcement > snapshot preserves targetUids when picksAreCommitted",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 29,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName:
      "snapshot ephemeral gate enforcement > snapshot clears targetUids when picksAreCommitted is false",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 30,
    file: "tests/mechanics/lloyd-only-when-eligible.test.ts",
    testName:
      "Lloyd restriction — only when Lloyd is pool-eligible > super-evolved Lloyd + super-evolved Orchis: Orchis refused, Lloyd selectable",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 31,
    file: "tests/mechanics/lloyd-only-when-eligible.test.ts",
    testName:
      "Lloyd restriction — only when Lloyd is pool-eligible > positive control: generic enemy-follower select with unevolved Lloyd — only Lloyd",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 32,
    file: "tests/mechanics/lloyd-only-when-eligible.test.ts",
    testName:
      "Lloyd restriction — sabotage proof > would allow Orchis if Lloyd were enforced from the whole board, not the pool",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 33,
    file: "tests/unit/hand-select-effects.test.ts",
    testName:
      "Cassius 10473110 — select pool honors object filter > offers only Artifact followers in hand, not spells or non-Artifact cards",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 34,
    file: "tests/unit/hand-select-effects.test.ts",
    testName:
      "select op — object filter merge (regression) > still applies leftmost string filter after object filters are merged",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 35,
    file: "tests/unit/transform-into-source-select.test.ts",
    testName:
      "flat transform into_source enemy:deck + select > Engage opens pending selection over hand; nothing transforms until pick",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 36,
    file: "tests/mechanics/alt-form-base-cost.test.ts",
    testName:
      "Alternate-form played card base cost (2026-09-06) > Jailor normal play (6 PP): ladder records 6; follower on board base cost 6",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 37,
    file: "tests/mechanics/multi-select-ui.test.ts",
    testName:
      "Multi-select UI feedback > first partial pick should trigger render (continue path)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 38,
    file: "tests/mechanics/multi-select-ui.test.ts",
    testName:
      "Multi-select UI feedback > memoization invalidates when targetUids gains a pick (isSelected)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 39,
    file: "tests/unit/lyanthoth-pool-equivalence.test.ts",
    testName:
      "Lyanthoth pool equivalence — nested select vs flat destroy > direct handlers: flat pool matches nested pool and excludes self",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 40,
    file: "tests/unit/lyanthoth-pool-equivalence.test.ts",
    testName:
      "Lyanthoth pool equivalence — nested select vs flat destroy > play path (flat form): pending pool excludes Lyanthoth",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 41,
    file: "tests/scenarios/selection_resolution.test.ts",
    testName:
      "Scenario: Selection Resolution > pauses with pendingTargetEffect when no targets are provided",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 42,
    file: "tests/mechanics/honest_playable_glow.test.ts",
    testName:
      "Honest playable glow — Spilling Red vs Aura > non-Aura enemy present: green glow and play proceeds",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 43,
    file: "tests/unit/destroy-filter-merge.test.ts",
    testName:
      "destroy filter merge > filter.not_self overrides condition.not_self:false in destroy pool",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 44,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName:
      "Ralmia Artifact Selection > should require selecting ALL artifacts when 2 in hand",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 45,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName:
      "Ralmia Artifact Selection > should require selecting ALL artifacts when 3 in hand",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 46,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName:
      "Ralmia Artifact Selection > should allow choosing 3 when 4 or more artifacts in hand",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 47,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName:
      "Ralmia Artifact Selection > should allow choosing 3 when 5 artifacts in hand",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 48,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName:
      "Ralmia Artifact Selection > should not require confirmation for artifact copy selection",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 49,
    file: "tests/unit/return_select_canonical.test.ts",
    testName:
      "op:return destination:deck honours the canonical `select` spelling > Cognitive Shift 10711310: text says 'Select 2 cards' → selectCount must be 2",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 50,
    file: "tests/unit/return_select_canonical.test.ts",
    testName:
      "op:return destination:hand honours the canonical `select` spelling > select:2 yields selectCount 2 (bounce / return-to-hand path)",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 51,
    file: "tests/golden/pendingTarget.lifecycle.test.ts",
    testName:
      "Golden: PendingTarget Lifecycle > setPendingTarget creates pending state",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 52,
    file: "tests/golden/pendingTarget.lifecycle.test.ts",
    testName:
      "Golden: PendingTarget Lifecycle > targets can be accumulated before resolution",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 53,
    file: "tests/mechanics/position-roundtrip.test.ts",
    testName:
      "position round-trip shapes (engineDispatch) > save while target prompt open → load → prompt open with no picks",
    classification: "A",
    reason: "A",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 54,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — defense bound (≤3) > 10062110 Ironfist Priest — Evolve pool excludes enemies above 3 defense",
    classification: "A",
    reason:
      "Asserts evolve selection pool excludes out-of-filter enemies; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 55,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — defense bound (≤3) > 10672120 Timid Pioneer — Fanfare pool excludes enemies above 3 defense",
    classification: "A",
    reason:
      "Asserts fanfare pool excludes enemies above 3 defense; resolution intentionally omitted.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 56,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — defense bound (≤3) > 10862310 Lingering Threat — pool excludes enemies above 3 defense",
    classification: "A",
    reason:
      "Asserts spell pool excludes high-defense enemies; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 57,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — Artifact hand (≤5 cost) > 10172320 Doomwright Resurgence — pool is Artifact followers ≤5 only",
    classification: "A",
    reason:
      "Asserts hand selection pool is Artifact followers costing ≤5; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 58,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — Artifact hand (≤5 cost) > 10271210 Artifact Catapult — Engage pool is Artifact followers ≤5 only",
    classification: "A",
    reason:
      "Asserts Engage hand pool is Artifact followers ≤5; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 59,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — Artifact hand (≤5 cost) > 10572110 New-Age Cartographer — Super-Evolve pool is Artifact followers ≤5 only",
    classification: "A",
    reason:
      "Asserts Super-Evolve hand pool is Artifact followers ≤5; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 60,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — tribe / type hand selection > 10371120 Supersonic Fighter — Evolve pool is allied Artifact followers only",
    classification: "A",
    reason:
      "Asserts evolve pool is allied Artifact followers only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 61,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — tribe / type hand selection > 10332210 Institute of Truth — Engage pool is hand followers only",
    classification: "A",
    reason:
      "Asserts Engage hand pool is followers only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 62,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — tribe / type hand selection > 10741120 Carrier Wyvern — Evolve pool is hand followers only",
    classification: "A",
    reason:
      "Asserts evolve hand pool is followers only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 63,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — tribe / type hand selection > 10161110 Angelic Prism Priestess — Evolve pool is hand amulets only",
    classification: "A",
    reason:
      "Asserts evolve hand pool is amulets only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 64,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — tribe / type hand selection > 10131310 Radiant Rainbow — pool is On Spellboost cards only",
    classification: "A",
    reason:
      "Asserts hand pool is On Spellboost cards only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 65,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — tribe / type hand selection > 10521310 Extravagance — pool is hand spells only",
    classification: "A",
    reason: "Asserts hand pool is spells only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 66,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — Ward keyword pool > 10262310 Divine Guard — pool is allied followers with Ward only",
    classification: "A",
    reason:
      "Asserts pool is allied Ward followers only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 67,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — unevolved selection > 10104110 Olivia — Super-Evolve pool is unevolved allies only (excludes evolved)",
    classification: "A",
    reason:
      "Asserts Super-Evolve pool excludes evolved allies; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 68,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — unevolved selection > 10472110 Eustace — Skybound Art pool is unevolved allies only",
    classification: "A",
    reason:
      "Asserts Skybound Art pool is unevolved allies only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 69,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — unevolved selection > 10874120 Eudie — Evolve pool is unevolved allies only (excludes self)",
    classification: "A",
    reason:
      "Asserts evolve pool is unevolved allies excluding self; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 70,
    file: "tests/audit/negative_space_filters.test.ts",
    testName:
      "negative-space filters — Golem tribe selection > 10032110 Remi & Rami — Super-Evolve pool is allied Golem followers only",
    classification: "A",
    reason:
      "Asserts Super-Evolve pool is allied Golem followers only; pending pool is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 71,
    file: "tests/audit/alchemic_flare.test.ts",
    testName:
      "Alchemic Flare (10433310) — real card data > playing opens pending pool with exactly the two enemy followers",
    classification: "A",
    reason:
      "Asserts pending pool membership for Alchemic Flare; pool composition is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
];

export const DANGLING_PENDING_SUMMARY = {
  measuredTotal: DANGLING_PENDING_AUDIT.length,
  classificationA: DANGLING_PENDING_AUDIT.filter(
    (e) => e.classification === "A",
  ).length,
  classificationB: DANGLING_PENDING_AUDIT.filter(
    (e) => e.classification === "B",
  ).length,
} as const;

export const SILENTLY_UNRESOLVED = DANGLING_PENDING_AUDIT.filter(
  (e) => e.classification === "B",
);
