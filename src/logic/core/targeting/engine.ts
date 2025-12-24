// src/logic/core/targeting/engine.ts
import { GameState } from "../../../core/types.js";
import { TargetingResult } from "./types.js";
import { validateTargetSelection } from "./validation.js";
import { toggleSelectionUid } from "./selection.js";
import { getBoard, getHand } from "../../../core/playerHelpers.js";

/**
 * Core Targeting Engine (UID-Only).
 * Processes a click on a target (card or leader) and determines the next state.
 * Pure-ish: Mutates 'pending' state but has no side effects on game state otherwise.
 * 
 * Now uses targetUids instead of targets for UID-only targeting.
 */
export function applyTargetClick(
  state: GameState,
  pending: any,
  uid: string | "leader",
): TargetingResult {
  // Ensure targetUids array exists
  if (!pending.targetUids) pending.targetUids = [];

  // 1. Handle Leader Targeting
  if (uid === "leader") {
    if (pending.canTargetLeader) {
      // Add "leader" as a special UID
      pending.targetUids.push("leader");

      return {
        kind: "execute",
        opCtx: {
          eff: pending.eff,
          owner: pending.owner,
          sourceCard: pending.sourceCard,
          targetUids: [...pending.targetUids],
          resumeEffects: pending.resumeEffects,
        },
      };
    } else {
      return { kind: "invalid", reason: "Cannot target leader." };
    }
  }

  // 2. Verify target exists in state
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
  if (
    pending.eff?.op === "fuse" &&
    pending.eff?.action === "finalize" &&
    pending.eff?.type === "fortifier"
  ) {
    if (pending.sourceCard && uid === pending.sourceCard.uid) {
      if (pending.targetUids && pending.targetUids.length > 0) {
        return {
          kind: "execute",
          opCtx: {
            eff: pending.eff,
            owner: pending.owner,
            sourceCard: pending.sourceCard,
            targetUids: [...pending.targetUids],
            resumeEffects: pending.resumeEffects,
          },
        };
      }
    }
  }

  // 5. Toggle Selection (using UIDs)
  const outcome = toggleSelectionUid(pending.targetUids, uid);

  if (outcome === "removed") {
    if (pending.requiresConfirmation) {
      return { kind: "confirm_needed" };
    }
    return { kind: "continue" };
  }

  // 6. Check Completion
  if (pending.requiresConfirmation) {
    return { kind: "confirm_needed" };
  }

  const requiredCount =
    typeof pending.selectCount === "number" &&
      Number.isFinite(pending.selectCount) &&
      pending.selectCount > 0
      ? pending.selectCount
      : 1;

  if (pending.targetUids.length < requiredCount) {
    return { kind: "continue" };
  }

  // 7. Complete & Auto-Execute
  return {
    kind: "execute",
    opCtx: {
      eff: pending.eff,
      owner: pending.owner,
      sourceCard: pending.sourceCard,
      targetUids: [...pending.targetUids],
      resumeEffects: pending.resumeEffects,
    },
  };
}
