/**
 * Resolve a script step against live state → PlayerAction (UID-based).
 * Throws ScriptDivergeError when the referenced card is missing.
 */

import type {
  GameState,
  Player,
  PlayerAction,
} from "../../core/types/index.js";
import { getHand, getBoard, opponentOf } from "../../core/playerHelpers.js";
import { resolveCardRef } from "../../core/script/identity.js";
import type { ScriptStep, ScriptCardRef } from "../../core/script/types.js";
import { ScriptDivergeError } from "../../core/script/types.js";

function isLeaderRef(
  ref: { kind: "leader" } | ScriptCardRef,
): ref is { kind: "leader" } {
  return "kind" in ref && ref.kind === "leader";
}

function asCardRef(ref: { kind: "leader" } | ScriptCardRef): ScriptCardRef {
  if (isLeaderRef(ref)) {
    throw new Error("expected card ref");
  }
  return ref;
}

export function scriptStepToAction(
  gameState: GameState,
  scriptedSide: Player,
  step: ScriptStep,
  stepIndex: number,
): PlayerAction {
  switch (step.op) {
    case "END_TURN":
      return { type: "END_TURN" };
    case "PLAY_CARD": {
      const card = resolveCardRef(
        getHand(gameState, scriptedSide),
        step.card,
        "PLAY_CARD",
        stepIndex,
        step,
      );
      return {
        type: "PLAY_CARD",
        player: scriptedSide,
        cardUid: card.uid,
      };
    }
    case "ATTACK": {
      const attacker = resolveCardRef(
        getBoard(gameState, scriptedSide),
        step.attacker,
        "ATTACK attacker",
        stepIndex,
        step,
      );
      if (isLeaderRef(step.defender)) {
        return {
          type: "ATTACK",
          player: scriptedSide,
          attackerUid: attacker.uid,
          defender: { type: "leader", player: opponentOf(scriptedSide) },
        };
      }
      const def = resolveCardRef(
        getBoard(gameState, opponentOf(scriptedSide)),
        asCardRef(step.defender),
        "ATTACK defender",
        stepIndex,
        step,
      );
      return {
        type: "ATTACK",
        player: scriptedSide,
        attackerUid: attacker.uid,
        defender: { type: "card", uid: def.uid },
      };
    }
    case "EVOLVE": {
      const card = resolveCardRef(
        getBoard(gameState, scriptedSide),
        step.card,
        "EVOLVE",
        stepIndex,
        step,
      );
      return {
        type: "EVOLVE",
        player: scriptedSide,
        cardUid: card.uid,
        mode: step.mode,
      };
    }
    case "ENGAGE": {
      const card = resolveCardRef(
        getBoard(gameState, scriptedSide),
        step.card,
        "ENGAGE",
        stepIndex,
        step,
      );
      return {
        type: "ENGAGE",
        player: scriptedSide,
        cardUid: card.uid,
      };
    }
    case "BONUS_PP":
      return { type: "BONUS_PP", player: scriptedSide };
    case "CHOOSE_TARGET": {
      if (isLeaderRef(step.target)) {
        return {
          type: "CHOOSE_TARGET",
          player: scriptedSide,
          target: { type: "leader", player: opponentOf(scriptedSide) },
        };
      }
      const targetRef = asCardRef(step.target);
      // Target may be on either board — search both, prefer enemy then ally.
      const enemyBoard = getBoard(gameState, opponentOf(scriptedSide));
      const allyBoard = getBoard(gameState, scriptedSide);
      let card;
      try {
        card = resolveCardRef(
          enemyBoard,
          targetRef,
          "CHOOSE_TARGET",
          stepIndex,
          step,
        );
      } catch {
        card = resolveCardRef(
          allyBoard,
          targetRef,
          "CHOOSE_TARGET",
          stepIndex,
          step,
        );
      }
      return {
        type: "CHOOSE_TARGET",
        player: scriptedSide,
        target: { type: "card", uid: card.uid },
      };
    }
    case "CHOOSE_MODE":
      return {
        type: "CHOOSE_MODE",
        player: scriptedSide,
        indices: step.indices.slice(),
      };
    case "TOGGLE_MULLIGAN": {
      const card = resolveCardRef(
        getHand(gameState, scriptedSide),
        step.card,
        "TOGGLE_MULLIGAN",
        stepIndex,
        step,
      );
      return {
        type: "TOGGLE_MULLIGAN",
        player: scriptedSide,
        cardUid: card.uid,
      };
    }
    case "CONFIRM_MULLIGAN":
      return { type: "CONFIRM_MULLIGAN", player: scriptedSide };
    default: {
      const _exhaustive: never = step;
      throw new ScriptDivergeError(
        stepIndex,
        null,
        `Unknown step: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
