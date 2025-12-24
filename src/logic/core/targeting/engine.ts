// src/logic/core/targeting/engine.ts
import { GameState } from "../../../core/types.js";
import { TargetingResult } from "./types.js";
import { validateTargetSelection } from "./validation.js";
import { toggleSelection } from "./selection.js";
import { getBoard, getHand } from "../../../core/playerHelpers.js";

/**
 * Core Targeting Engine.
 * Processes a click on a target (card or leader) and determines the next state.
 * Pure-ish: Mutates 'pending' state but has no side effects on game state otherwise.
 */
export function applyTargetClick(
  state: GameState,
  pending: any,
  uid: string | "leader",
): TargetingResult {
  // 1. Handle Leader Targeting
  if (uid === "leader") {
    if (pending.canTargetLeader) {
      // Add special leader target
      pending.targets.push({ type: "Leader" });

      // Leader targeting is always immediate execution in current logic?
      // resolveTarget.ts: "Continue with normal resolution" -> runs effect.
      return {
        kind: "execute",
        opCtx: {
          eff: pending.eff,
          owner: pending.owner,
          sourceCard: pending.sourceCard,
          targets: pending.targets,
          resumeEffects: pending.resumeEffects,
        },
      };
    } else {
      return { kind: "invalid", reason: "Cannot target leader." };
    }
  }

  // 2. Resolve Card Entity
  // (We rely on state lookups here. Orchestrator passed us 'state'.)
  const all = [
    ...getBoard(state, "first"),
    ...getBoard(state, "second"),
    ...getHand(state, "first"),
    ...getHand(state, "second"),
  ];
  const clickedTarget = all.find((c) => c.uid === uid);

  if (!clickedTarget) {
    return { kind: "invalid", reason: `Target not found: ${uid}` };
  }

  // 3. Validation (Pool & Rules)
  const validation = validateTargetSelection(state, pending, uid);
  if (!validation.ok) {
    return { kind: "invalid", reason: validation.reason || "Invalid target" };
  }

  // 4. Special Case: Fuse Finalization (Fortifier type)
  // (Clicking the source/initiator again confirms the selection)
  if (
    pending.eff?.op === "fuse" &&
    pending.eff?.action === "finalize" &&
    pending.eff?.type === "fortifier"
  ) {
    if (pending.sourceCard && uid === pending.sourceCard.uid) {
      if (pending.targets && pending.targets.length > 0) {
        return {
          kind: "execute",
          opCtx: {
            eff: pending.eff,
            owner: pending.owner,
            sourceCard: pending.sourceCard,
            targets: pending.targets,
            resumeEffects: pending.resumeEffects,
          },
        };
      }
      // If targets empty, fall through to selection (toggle source?)
      // resolveTarget.ts would toggle source if it was in pool.
    }
  }

  // 5. Toggle Selection
  const outcome = toggleSelection(pending, clickedTarget);

  if (outcome === "removed") {
    // If requiresConfirmation, update the button with new count
    if (pending.requiresConfirmation) {
      return { kind: "confirm_needed" };
    }
    // Otherwise just continue selection
    return { kind: "continue" };
  }

  // 6. Check Completion
  if (pending.requiresConfirmation) {
    // If we require confirmation, we enter "confirm_needed" state immediately after a valid selection?
    // resolveTarget.ts: "Show confirmation button... Wait for More Targets if Needed OR if we require manual confirmation"
    // line 336: "If we require confirmation, we stop here and wait for the button click"
    // So yes, we render and wait.
    return { kind: "confirm_needed" };
  }

  const requiredCount =
    typeof pending.selectCount === "number" &&
      Number.isFinite(pending.selectCount) &&
      pending.selectCount > 0
      ? pending.selectCount
      : 1;

  if (pending.targets.length < requiredCount) {
    return { kind: "continue" };
  }

  // 7. Complete & Auto-Execute
  return {
    kind: "execute",
    opCtx: {
      eff: pending.eff,
      owner: pending.owner,
      sourceCard: pending.sourceCard,
      targets: pending.targets,
      resumeEffects: pending.resumeEffects,
    },
  };
}















