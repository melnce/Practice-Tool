/**
 * Audit of resolvePendingTarget calls with no prompt open (exit 1).
 *
 * Measured on origin/main (2026-09-08) via resolveTargetProbe + afterEach in
 * tests/fixtures/setup.ts (keys use task.fullTestName when present):
 *   Before gate: 30 calls across 24 tests in 16 files (hand instrumented)
 *   After gate + L2 resolveOpenPendingTarget + mechanics fixes: 8 (A) rows below
 *
 * Classifications:
 *   A — No-op is legitimate or is itself the subject (soak replay CHOOSE_TARGET, etc.)
 *   B — Test meant to resolve a prompt that never opened (fixed in mechanics files)
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
  ];

export const UNCONSUMED_COMMANDS_SUMMARY = {
  measuredTotal: UNCONSUMED_COMMANDS_AUDIT.length,
  classificationA: UNCONSUMED_COMMANDS_AUDIT.filter(
    (e) => e.classification === "A",
  ).length,
  classificationB: UNCONSUMED_COMMANDS_AUDIT.filter(
    (e) => e.classification === "B",
  ).length,
} as const;
