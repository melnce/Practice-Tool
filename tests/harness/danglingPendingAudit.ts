/**
 * Audit of tests that end with `state.pendingTargetEffect` still set.
 *
 * Measured on origin/main (2026-09-08) via temporary afterEach in
 * tests/fixtures/setup.ts + full `npx vitest run -c vitest.config.ts`:
 *   56 dangling / 4227 passing / 326 files — suite GREEN.
 *
 * Classifications (this file is the authority — headline counts must match it):
 *   A (53) — Prompt-is-the-subject: pending state, pool, snapshot/undo, or lifecycle.
 *       Correct as written. Proposed **allowlist** for the strict-choose gate: each (A)
 *       entry is allowlisted with its `reason`; an entry that stops reproducing must fail.
 *   B (3)  — Silently unresolved: plays a card, asserts an outcome, leaves a prompt open
 *       so a card clause never ran and existing assertions did not cover it.
 *       **Never allowlisted** — must be fixed (resolve the prompt or rewrite the test).
 *
 * Imported by nothing yet — inert data until the gate PR wires it in. Do not resolve
 * prompts or change assertions based on this file alone.
 */

export type DanglingPendingClassification = "A" | "B";

export interface DanglingPendingAuditEntry {
  /** 1-based row id matching measurement order. */
  id: number;
  file: string;
  testName: string;
  classification: DanglingPendingClassification;
  /** One-line reason for the classification. */
  reason: string;
  /**
   * For (B) only: the card clause that never executed because the prompt was
   * left open. Null for (A).
   */
  unresolvedClause: string | null;
  /**
   * For (B) only: whether existing assertions would still pass if the dangling
   * clause had run to completion. Null for (A).
   */
  assertionsWouldStillPass: boolean | null;
  /**
   * For (B) only: notable under-coverage finding when assertionsWouldStillPass
   * is false or the gap is especially misleading. Null for (A).
   */
  finding: string | null;
}

/** Full table of 56 tests ending with pendingTargetEffect set (measurement 2026-09-08). */
export const DANGLING_PENDING_AUDIT: readonly DanglingPendingAuditEntry[] = [
  {
    id: 1,
    file: "tests/mechanics/multi-discard-position.test.ts",
    testName:
      "save after first pick → restore → remaining picks match uninterrupted run",
    classification: "A",
    reason:
      "Snapshot round-trip for multi-discard prompts; Goddess branch deliberately stops after two of three picks to compare mid-prompt restore.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 2,
    file: "tests/mechanics/multi-discard-position.test.ts",
    testName:
      "(b) restored mid-prompt snapshot reports first pick in targetUids",
    classification: "A",
    reason:
      "Asserts picksAreCommitted and targetUids after applySnapshot without completing remaining picks.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 3,
    file: "tests/mechanics/multi-discard-position.test.ts",
    testName:
      "(d) uncommitted multi-pick prompt restores with no picks (f9a55e6)",
    classification: "A",
    reason:
      "Tests uncommitted-pick snapshot sanitization: in-flight pick cleared on restore when picksAreCommitted is false.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 4,
    file: "tests/mechanics/position-roundtrip.test.ts",
    testName:
      "save while target prompt open → load → prompt open with no picks",
    classification: "A",
    reason:
      "Position save/load of an open multi-select damage prompt with sanitized targetUids.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 5,
    file: "tests/mechanics/board-cap.test.ts",
    testName:
      "soak repro seed20260913 game391 — replaySoakTrace stays at ≤5 field",
    classification: "A",
    reason:
      "Soak trace replay pinned at fixture endpoint; open discard prompt is inherited trace state, not an effect the test asserts.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 6,
    file: "tests/unit/l2-cutthroat_portalcraft.test.ts",
    testName:
      "Evolve (normal): destroys exactly 2 of 3 Ward enemies; non-Ward survives",
    classification: "B",
    reason:
      "Plays Asher, never resolves Fanfare Ward-selection, then evolves and asserts destroy outcomes on pre-keyworded Ward followers.",
    unresolvedClause:
      "Fanfare: Select an enemy follower on the field and give it Ward.",
    assertionsWouldStillPass: true,
    finding:
      "Ward targets were seeded via applyKeywordsFromList, so evolve destroy-2-Ward assertions pass without Fanfare running; if Fanfare ran and gave Ward to the non-Ward follower, board count assertions could fail.",
  },
  {
    id: 7,
    file: "tests/unit/l2-amulet_havencraft.test.ts",
    testName: "Engage: destroys this card on the field",
    classification: "B",
    reason:
      "Resolves initial Fanfare, engages Earrings (destroy runs), but never resolves Engage-replicated Fanfare hand-return prompt; only asserts amulet left the board.",
    unresolvedClause:
      "Engage: Destroy this card. Replicate Fanfare — select a card in your hand, return it to deck, and draw a card.",
    assertionsWouldStillPass: true,
    finding:
      "Destroy-on-engage runs before replicate opens the return prompt; assertions only check board absence, not return/draw.",
  },
  {
    id: 8,
    file: "tests/unit/official-qa-havencraft.test.ts",
    testName:
      "10261110 Cleric of Crushing — cannot select Orchis when Lloyd is super-evolved (official Q&A)",
    classification: "A",
    reason:
      "Tests Lloyd pool-eligibility and validateTargetSelection on the open evolve-destroy prompt; resolution intentionally omitted.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 9,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "(c) either-side choose: enemy Lloyd blocks allied followers (Dark Side)",
    classification: "A",
    reason:
      "Tests Lloyd forced-target validation on an open Dark Side prompt without completing selection.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 10,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName: "(e) two Lloyds: either may be the first pick",
    classification: "A",
    reason:
      "Tests getForcedFirstPicks pool contents and validation on an open Advent Eld Axe prompt.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 11,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName: "(f) auto-select path picks Lloyd first when in pool",
    classification: "A",
    reason:
      "Unit-tests pickRandomTargets forced-first behavior; dangling pending is incidental leakage from prior test (e) in the same file (no reset between tests).",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 12,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "(i) own Lloyd on board: any:follower select does not force own Lloyd or allies",
    classification: "A",
    reason:
      "Tests that own-side Lloyd does not force targeting on any:follower select; asserts pool/selectability/validation only.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 13,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "(ii) own Lloyd on board: ally:follower select (Soul Tuning) does not force",
    classification: "A",
    reason:
      "Tests Soul Tuning ally:follower pool with own Lloyd present; asserts no forced picks and free ally selection.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 14,
    file: "tests/mechanics/lloyd-forced-selection.test.ts",
    testName:
      "(iii) both sides Lloyd: any:follower select forces enemy Lloyd only",
    classification: "A",
    reason:
      "Tests enemy-Lloyd-only forcing when both sides have Lloyd; asserts forced picks and validation on open prompt.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 15,
    file: "tests/mechanics/history-lastplayed-null-snapshot.test.ts",
    testName:
      "captureSnapshot() during paused deferred Last Words prompt has no null board slots",
    classification: "A",
    reason:
      "Tests snapshot integrity during a paused deferred Last Words nested_effects prompt.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 16,
    file: "tests/mechanics/history-snapshot-aliasing.test.ts",
    testName:
      "__lastSelected is cleared on undo after nested_effects target resolution",
    classification: "A",
    reason:
      "Tests history/undo behavior around nested_effects target resolution; pending restored by undo is the subject.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 17,
    file: "tests/unit/soak_history_ring.test.ts",
    testName:
      "play → choose (0 commits) → confirm with nested commit: ring counts and deep chain lands on before",
    classification: "A",
    reason:
      "Tests history ring commit accounting for choose-then-confirm nested_effects flow; ends after undo with prompt reopened.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 18,
    file: "tests/mechanics/dragon_meta_bugs.test.ts",
    testName:
      "evolve selection pool includes Gilnelise; fanfare pool excludes her",
    classification: "A",
    reason:
      "Tests fanfare vs evolve selection pool membership via poolUids(); ends on open evolve prompt after clearing fanfare pending.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 19,
    file: "tests/unit/name_filter_targeting.test.ts",
    testName:
      "selection pool is only Obsessed Test Subject (not unrelated allies)",
    classification: "A",
    reason:
      "Tests Enamored Researcher evolve selection pool name filter; asserts poolNames only, no resolution.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 20,
    file: "tests/unit/name_filter_targeting.test.ts",
    testName: "selection pool is only Obsessed Test Subject after fuse",
    classification: "A",
    reason:
      "Tests Ecstatic Scholar super-evolve selection pool name filter after fuse; asserts pool composition only.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 21,
    file: "tests/mechanics/target-prompt-undo.test.ts",
    testName:
      "captureSnapshot clears pending targetUids and __uiSelectable flags",
    classification: "A",
    reason:
      "Tests snapshot sanitization of pending targetUids and UI flags on a synthetic open prompt.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 22,
    file: "tests/mechanics/target-prompt-undo.test.ts",
    testName:
      "click one target of two, undo confirm step → prompt open with empty targetUids",
    classification: "A",
    reason:
      "Tests undo sanitization of targetUids on a two-pick confirm prompt (engineDispatch path).",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 23,
    file: "tests/mechanics/target-prompt-undo.test.ts",
    testName:
      "click one target of two, undo confirm step → prompt open with empty targetUids",
    classification: "A",
    reason:
      "Same undo-sanitization contract via dispatchAction path (duplicate describe block).",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 24,
    file: "tests/mechanics/leader-restored-fires-on-zero.test.ts",
    testName:
      "positive control: no crest means full-HP restore does not damage leader",
    classification: "B",
    reason:
      "Engages Darkhaven Grace without resolving allied-follower selection; asserts leader HP unchanged as positive control for Burnite crest absence.",
    unresolvedClause:
      "Engage (1): Select an allied follower on the field and give it +1/+1. Restore 1 defense to your leader.",
    assertionsWouldStillPass: true,
    finding:
      "Vacuous as a control: Engage never completes (no resolvePendingTarget), so restore never fires and HP stays 20 because nothing happened — passes identically whether or not the effect runs (verified: adding resolvePendingTarget(ally.uid) still yields hp=20). A positive control that passes because the controlled-for thing never happened is worse than no control. Sibling test ~20 lines above (Burnite crest at full HP) uses the same setup with resolvePendingTarget before asserting — that is the correct pattern; fix here is one line. First item for the follow-up PR.",
  },
  {
    id: 25,
    file: "tests/unit/damage_add_amount_once.test.ts",
    testName:
      "after selectable damage opens, stored eff has baked amount and no re-addable add_amount",
    classification: "A",
    reason:
      "Tests pending eff shape (baked amount, stripped add_amount) before target resolution.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 26,
    file: "tests/unit/damage_add_amount_once.test.ts",
    testName:
      "Stormy Blast N=2: pending eff amount is 4 and add_amount is stripped",
    classification: "A",
    reason:
      "Tests Stormy Blast pending eff bake invariant at N=2 before any target is chosen.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 27,
    file: "tests/mechanics/fuse-gear-lifecycle.test.ts",
    testName:
      "one Confirm Targets undo step per prompt; undo reopens with committed pick",
    classification: "A",
    reason:
      "Tests gear_multi fuse undo reopening with picksAreCommitted and committed targetUids (engineDispatch path).",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 28,
    file: "tests/mechanics/fuse-gear-lifecycle.test.ts",
    testName:
      "one Confirm Targets undo step per prompt; undo reopens with committed pick",
    classification: "A",
    reason:
      "Same fuse undo/reopen contract via dispatchAction path (duplicate describe block).",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 29,
    file: "tests/mechanics/lloyd-only-when-eligible.test.ts",
    testName:
      "super-evolved Lloyd + super-evolved Orchis: Orchis refused, Lloyd selectable",
    classification: "A",
    reason:
      "Tests Cleric evolve destroy pool eligibility when super Lloyd blocks Orchis; asserts validation only.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 30,
    file: "tests/mechanics/lloyd-only-when-eligible.test.ts",
    testName:
      "positive control: generic enemy-follower select with unevolved Lloyd — only Lloyd",
    classification: "A",
    reason:
      "Positive control for generic enemy-follower targeting with unevolved Lloyd; tests forced Lloyd validation on open prompt.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 31,
    file: "tests/mechanics/lloyd-only-when-eligible.test.ts",
    testName:
      "would allow Orchis if Lloyd were enforced from the whole board, not the pool",
    classification: "A",
    reason:
      "Sabotage-proof pool-derivation test: asserts Orchis is selectable when Lloyd fails evolve filter despite being on board.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 32,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName: "throws when any function is reachable from pendingTargetEffect",
    classification: "A",
    reason:
      "Tests snapshot dropped-function gate throws on pendingTargetEffect.mysteryHook.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 33,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName:
      "fuse confirm_needed pending carries confirmKey, not a function (#315)",
    classification: "A",
    reason:
      "Tests fuse confirmKey registry and snapshot safety after partial fuse pick.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 34,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName: "paused mid-prompt commit with empty picks passes the gate",
    classification: "A",
    reason:
      "Tests ephemeral gate allows commit while paused mid-prompt with empty targetUids.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 35,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName: "snapshot preserves targetUids when picksAreCommitted",
    classification: "A",
    reason: "Tests snapshot preserves committed targetUids on pending prompts.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 36,
    file: "tests/mechanics/snapshot-ephemeral-gate.test.ts",
    testName: "snapshot clears targetUids when picksAreCommitted is false",
    classification: "A",
    reason: "Tests snapshot clears uncommitted targetUids on pending prompts.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 37,
    file: "tests/unit/hand-select-effects.test.ts",
    testName:
      "offers only Artifact followers in hand, not spells or non-Artifact cards",
    classification: "A",
    reason:
      "Tests Cassius hand-selection pool object filter; asserts pool names only.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 38,
    file: "tests/unit/hand-select-effects.test.ts",
    testName:
      "still applies leftmost string filter after object filters are merged",
    classification: "A",
    reason:
      "Regression on select op pool filtering via handleSelect; asserts returned pool after pending open.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 39,
    file: "tests/mechanics/alt-form-base-cost.test.ts",
    testName:
      "Jailor normal play (6 PP): ladder records 6; follower on board base cost 6",
    classification: "A",
    reason:
      "Subject is playedBaseCosts ladder and on-board base_cost on normal play; explicitly expects outcome.kind paused before Fanfare resolves.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 40,
    file: "tests/unit/transform-into-source-select.test.ts",
    testName:
      "Engage opens pending selection over hand; nothing transforms until pick",
    classification: "A",
    reason:
      "Tests Encroached World Engage opens hand transform prompt and that no cards transform before pick.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 41,
    file: "tests/scenarios/selection_resolution.test.ts",
    testName: "pauses with pendingTargetEffect when no targets are provided",
    classification: "A",
    reason:
      "Golden scenario asserting runEffects returns pending and sets pendingTargetEffect.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 42,
    file: "tests/mechanics/multi-select-ui.test.ts",
    testName: "first partial pick should trigger render (continue path)",
    classification: "A",
    reason:
      "Tests UI render firing after first partial pick on a two-select damage prompt.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 43,
    file: "tests/mechanics/multi-select-ui.test.ts",
    testName:
      "memoization invalidates when targetUids gains a pick (isSelected)",
    classification: "A",
    reason:
      "Tests memoized view-model isSelected updates when targetUids gains a pick.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 44,
    file: "tests/mechanics/honest_playable_glow.test.ts",
    testName: "non-Aura enemy present: green glow and play proceeds",
    classification: "A",
    reason:
      "Subject is honest playable glow and that play proceeds (paused outcome); discard/destroy clauses are out of scope.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 45,
    file: "tests/unit/lyanthoth-pool-equivalence.test.ts",
    testName:
      "direct handlers: flat pool matches nested pool and excludes self",
    classification: "A",
    reason:
      "Proof that flat destroy and nested select produce identical pools excluding self.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 46,
    file: "tests/unit/lyanthoth-pool-equivalence.test.ts",
    testName: "play path (flat form): pending pool excludes Lyanthoth",
    classification: "A",
    reason:
      "Tests Lyanthoth fanfare play-path pool excludes self via flat destroy form.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 47,
    file: "tests/unit/destroy-filter-merge.test.ts",
    testName:
      "filter.not_self overrides condition.not_self:false in destroy pool",
    classification: "A",
    reason:
      "Tests destroy pool filter merge precedence via handleDestroy pending pool.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 48,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName: "should require selecting ALL artifacts when 2 in hand",
    classification: "A",
    reason: "Tests Ralmia selectCount UX when fewer artifacts than cap.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 49,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName: "should require selecting ALL artifacts when 3 in hand",
    classification: "A",
    reason:
      "Tests Ralmia selectCount equals hand size when exactly 3 artifacts.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 50,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName: "should allow choosing 3 when 4 or more artifacts in hand",
    classification: "A",
    reason: "Tests Ralmia selectCount capped at 3 when 4+ artifacts available.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 51,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName: "should allow choosing 3 when 5 artifacts in hand",
    classification: "A",
    reason: "Same selectCount=3 cap contract with 5 artifacts in hand.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 52,
    file: "tests/mechanics/ralmia-selection.test.ts",
    testName: "should not require confirmation for artifact copy selection",
    classification: "A",
    reason:
      "Tests requiresConfirmation:false on Ralmia hand-artifact copy prompt.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 53,
    file: "tests/golden/pendingTarget.lifecycle.test.ts",
    testName: "setPendingTarget creates pending state",
    classification: "A",
    reason:
      "Golden lifecycle test for setPendingTarget / isPendingTarget / getPendingTarget.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 54,
    file: "tests/golden/pendingTarget.lifecycle.test.ts",
    testName: "targets can be accumulated before resolution",
    classification: "A",
    reason:
      "Golden test that pending.targets accumulates picks before resolution.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 55,
    file: "tests/unit/return_select_canonical.test.ts",
    testName:
      "Cognitive Shift 10711310: text says 'Select 2 cards' → selectCount must be 2",
    classification: "A",
    reason:
      "Tests return-to-deck handler honors canonical select:2 spelling via selectCount.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
  {
    id: 56,
    file: "tests/unit/return_select_canonical.test.ts",
    testName: "select:2 yields selectCount 2 (bounce / return-to-hand path)",
    classification: "A",
    reason:
      "Tests return-to-hand handler honors canonical select:2 via selectCount.",
    unresolvedClause: null,
    assertionsWouldStillPass: null,
    finding: null,
  },
];

/** Summary counts derived from DANGLING_PENDING_AUDIT. */
export const DANGLING_PENDING_SUMMARY = {
  measuredTotal: DANGLING_PENDING_AUDIT.length,
  classificationA: DANGLING_PENDING_AUDIT.filter(
    (e) => e.classification === "A",
  ).length,
  classificationB: DANGLING_PENDING_AUDIT.filter(
    (e) => e.classification === "B",
  ).length,
} as const;

/** (B) entries only — must be fixed, never allowlisted. Gate flags anything not in (A). */
export const SILENTLY_UNRESOLVED = DANGLING_PENDING_AUDIT.filter(
  (e) => e.classification === "B",
);
