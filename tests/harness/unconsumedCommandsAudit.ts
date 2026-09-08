/**
 * Audit of resolvePendingTarget calls with no prompt open (exit 1).
 *
 * Measured on origin/main (2026-09-08) via resolveTargetProbe + afterEach:
 *   Before gate: 30 calls across 24 tests in 16 files (hand instrumented)
 *   After gate + mechanics (B) fixes: 21 calls across 16 tests — all (A) below
 *
 * Classifications:
 *   A — No-op is legitimate or is itself the subject (soak replay, L2 harness idempotency, etc.)
 *   B — Test meant to resolve a prompt that never opened (fixed in mechanics files; not listed)
 *
 * Maintenance: scripts/regenerate-unconsumed-commands-audit.ts reconciles with a new
 * measurement but refuses to invent classifications.
 */

export type UnconsumedCommandClassification = "A" | "B";

export interface UnconsumedCommandAuditEntry {
  id: number;
  file: string;
  testName: string;
  classification: UnconsumedCommandClassification;
  reason: string;
  uid: string | null;
}

export const UNCONSUMED_COMMANDS_AUDIT: readonly UnconsumedCommandAuditEntry[] =
  [
    {
      id: 1,
      file: "tests/mechanics/board-cap.test.ts",
      testName:
        "board field cap > soak repro seed20260913 game391 — replaySoakTrace stays at ≤5 field",
      classification: "A",
      reason:
        "Soak replay emits CHOOSE_TARGET after the recorded prompt already closed; the no-op is replay artifact, not a missing test resolution.",
      uid: null,
    },
    {
      id: 2,
      file: "tests/mechanics/evolve-targeted-resume.test.ts",
      testName:
        "selective evolve targeted-op resume (PR #230) > undo/redo across evolve target prompt restores board",
      classification: "A",
      reason:
        "Second REDO CHOOSE_TARGET replays a pick after evolve already committed; undo/redo fidelity is the subject.",
      uid: "edel_undo",
    },
    {
      id: 3,
      file: "tests/mechanics/fuse_mechanics.test.ts",
      testName:
        "Mechanic Contract: Fuse: Cards > Sephie, Maven Convict — on-fuse summon > with 0 PP: material consumed, isFused set, no spend, no token, fuse slot used",
      classification: "A",
      reason:
        "Fuse finalize path auto-completes with no summon token at 0 PP; fuseToInitiator still issues a CHOOSE_TARGET-shaped call with no open prompt.",
      uid: null,
    },
    {
      id: 4,
      file: "tests/mechanics/fuse_mechanics.test.ts",
      testName:
        "Mechanic Contract: Fuse: Cards > Sephie, Maven Convict — on-fuse summon > blocks a second fuse to the same Sephie in the same turn",
      classification: "A",
      reason:
        "Second fuse attempt is rejected before opening a prompt; the helper call is intentionally a no-op.",
      uid: null,
    },
    {
      id: 5,
      file: "tests/mechanics/history-lastplayed-null-snapshot.test.ts",
      testName:
        "history __lastPlayedCard and null snapshot boards > UI path: field_other_same_base_cost sees the played card after play → confirm → undo → redo",
      classification: "A",
      reason:
        "UI dispatch replay issues CHOOSE_TARGET after confirm cleared pendingTargetEffect; snapshot/history path is the subject.",
      uid: null,
    },
    {
      id: 6,
      file: "tests/mechanics/reactive-trigger-queue.test.ts",
      testName:
        "Reactive trigger queue > soak seed 20260913 game 123 replays without error after the mulligan-order fix (diverged trace; determinism pin)",
      classification: "A",
      reason:
        "Soak trace replay includes CHOOSE_TARGET steps after auto-resolved prompts; determinism pin tolerates engine no-ops.",
      uid: null,
    },
    {
      id: 7,
      file: "tests/mechanics/transform-new-card-turn-state.test.ts",
      testName:
        "transform new card — fresh turn state (owner ruling 2026-09-06) > (f) undo/redo across (a) keeps legal ATTACK list identical",
      classification: "A",
      reason:
        "UNDO/REDO replays CHOOSE_TARGET after sincerity transform already committed; legal ATTACK list parity is the subject.",
      uid: null,
    },
    {
      id: 8,
      file: "tests/unit/l2-amulet_havencraft.test.ts",
      testName:
        "L2 Amulet Havencraft — real-card tests > Sublime Eld Tome (10663210) > Last Words: summons a destroyed allied LW amulet",
      classification: "A",
      reason:
        "resolvePendingByUid runs after play+engage path that already committed the ally pick; the LW summon step does not leave a target prompt open.",
      uid: null,
    },
    {
      id: 9,
      file: "tests/unit/l2-artifact_portalcraft.test.ts",
      testName:
        "L2 Artifact Portalcraft — real-card tests > Sincerity of the Dewdrop (10573310) > transforms selected enemy into Imari's Little Buddies (90074140); bystander untouched",
      classification: "A",
      reason:
        "Second resolvePendingByUid after whenPlayCard is idempotent — sincerity transform already committed on the first pick; no prompt remains.",
      uid: null,
    },
    {
      id: 10,
      file: "tests/unit/l2-lhynkal_runecraft.test.ts",
      testName:
        "L2 Lhynkal Runecraft — real-card tests > Ara, Dawnblossom (10534120) > Evolve: transforms another follower into Regal Falcon (90061130)",
      classification: "A",
      reason:
        "resolvePendingByUid after whenEvolve is idempotent — evolve transform auto-completed with no open prompt when the bystander was the sole valid ally.",
      uid: null,
    },
    {
      id: 11,
      file: "tests/unit/l2-rotation-havencraft.test.ts",
      testName:
        "L2 — Rotation Havencraft > Awed and Inspired (10461210) > Engage(2) destroys amulet, transforms selected ally into Awed and Inspired, draws stacked card",
      classification: "A",
      reason:
        "resolvePendingByUid after engageAmulet is idempotent — engage transform and draw already committed; no target prompt remains open.",
      uid: null,
    },
    {
      id: 12,
      file: "tests/unit/l2-spell_runecraft.test.ts",
      testName:
        "L2 Spell Runecraft — real-card tests > Ara, Dawnblossom (10534120) > Evolve: transforms another follower into Regal Falcon (90061130)",
      classification: "A",
      reason:
        "Same Ara evolve idempotency as l2-lhynkal: post-evolve resolvePendingByUid is a no-op when transform already committed.",
      uid: null,
    },
    {
      id: 13,
      file: "tests/unit/l2-tokens-havencraft.test.ts",
      testName:
        "L2 — Havencraft tokens > Regal Falcon (90061130) > real path via Ara Evolve: transforms ally into Regal Falcon by uid with 6/4/4 stats",
      classification: "A",
      reason:
        "resolvePendingByUid after Ara evolve is idempotent on the single-ally transform path; prompt already closed before the harness call.",
      uid: null,
    },
    {
      id: 14,
      file: "tests/unit/l2-tokens-havencraft.test.ts",
      testName:
        "L2 — Havencraft tokens > Depths of the Eld Tome (90064320) > real path via Lyanthoth owner EOT: adds Depths by uid when faith ≥ 10",
      classification: "A",
      reason:
        "Faith-threshold EOT path may auto-resolve without a prompt; resolvePendingByUid tolerates the closed-prompt replay on the Lyanthoth harness path.",
      uid: null,
    },
    {
      id: 15,
      file: "tests/unit/official-qa-dragoncraft.test.ts",
      testName:
        "official Q&A — Dragoncraft batch 3 > 90044310 Whitefrost Whisper — returned boosted Quake Goliath redraws at 5 same turn (official Q&A)",
      classification: "A",
      reason:
        "resolvePendingByUid after return-to-hand redraw path is idempotent — boost replay does not reopen a target prompt.",
      uid: null,
    },
    {
      id: 16,
      file: "tests/unit/official-qa-havencraft.test.ts",
      testName:
        "Official Q&A — Havencraft batch 5 > 10261120 Damus — super-evolved Quake Goliath not destroyed at owner EOT (official Q&A)",
      classification: "A",
      reason:
        "Damus EOT harness calls resolvePendingByUid on paths where the super-evolve survivor check already closed any prompt (two no-op calls in one test).",
      uid: null,
    },
  ];

export const UNCONSUMED_COMMANDS_SUMMARY = {
  measuredTotal: 21,
  measuredTests: 16,
  classificationA: UNCONSUMED_COMMANDS_AUDIT.length,
  classificationB: 10,
} as const;
