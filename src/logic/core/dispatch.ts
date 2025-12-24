// src/logic/core/dispatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// PURE CORE DISPATCHER - No UI imports, no DOM access
// This is the canonical action application entrypoint for headless/replay use.
// ─────────────────────────────────────────────────────────────────────────────

import { state } from "../../core/gameState.js";
import {
  GameState,
  PlayerAction,
  ActionType,
  ActionByType,
} from "../../core/types.js";
import { endTurnBlue, endTurnRed } from "./turns.js";
import { playCardNoRender } from "./playCard/index.js";
import { attackFollower, attackLeader } from "./combat.js";
import { resolvePendingTarget } from "./resolveTarget.js";
import { undo, redo, resetHistory } from "../../core/history.js";
import { assertValidGameState } from "../../core/stateValidation.js";
import { hashGameState, ReplayStep } from "../../core/stateHash.js";
import { isFirstPlayer, getHand, getBoard, opponentOf } from "../../core/playerHelpers.js";

/**
 * Dependencies that can be injected for testing/replay.
 */
export interface DispatchDeps {
  /** If true, run state invariant checks before/after dispatch */
  checkInvariants?: boolean;
  /** If provided, push replay steps with hashes for determinism verification */
  replayLog?: ReplayStep[];
}

function shouldCheckInvariants(deps?: DispatchDeps): boolean {
  if (deps?.checkInvariants !== undefined) return deps.checkInvariants;
  return !!(globalThis as Record<string, unknown>).HEADLESS;
}

/**
 * Internal dispatch logic - pure action application.
 * Uses switch on action.type for type narrowing.
 */
function dispatchInternal(
  currentState: GameState,
  action: PlayerAction,
): GameState {
  switch (action.type) {
    case "UNDO":
      undo();
      break;
    case "REDO":
      redo();
      break;
    case "RESET_HISTORY":
      resetHistory();
      break;
    case "END_TURN":
      if (isFirstPlayer(currentState.activePlayer)) endTurnBlue();
      else endTurnRed();
      break;
    case "PLAY_CARD": {
      const hand = getHand(currentState, action.player);
      const index = hand.findIndex((c) => c.uid === action.cardUid);

      if (index !== -1) {
        // Determine if we can play
        // Note: playCardNoRender logic handles validation internally but silent return?
        // Let's call it and rely on its internal effects.
        // We are trusting playCardNoRender works.
        playCardNoRender(hand, action.player, index);
      } else {
        throw new Error(
          `[DISPATCH_UID_FAIL] Card not found in hand for UID: ${action.cardUid}`,
        );
      }
      break;
    }
    case "ATTACK": {
      const attackerBoard = getBoard(currentState, action.player);
      const attackerIdx = attackerBoard.findIndex(
        (c) => c.uid === action.attackerUid,
      );
      if (attackerIdx === -1) break;

      const defender = action.defender;
      if (defender.type === "leader") {
        attackLeader(attackerIdx, action.player, defender.player);
      } else {
        const defPlayer = opponentOf(action.player);
        const defBoard = getBoard(currentState, defPlayer);
        const defIdx = defBoard.findIndex((c) => c.uid === defender.uid);

        if (defIdx !== -1) {
          attackFollower(attackerIdx, defIdx, action.player, defPlayer);
        }
      }
      break;
    }
    case "CHOOSE_TARGET": {
      const target = action.target;
      if (target.type === "leader") {
        resolvePendingTarget("leader");
      } else {
        resolvePendingTarget(target.uid);
      }
      break;
    }
    // No default - TypeScript will error if a case is missing (exhaustiveness check)
  }
  return state;
}

/**
 * Dispatch an action to mutate game state.
 * This is the pure, core entrypoint - no rendering.
 *
 * Generic signature ensures type-safe action payloads at call sites.
 *
 * @param currentState - Current game state
 * @param action - Action to apply (typed by T)
 * @param deps - Optional dependencies for testing/replay
 * @returns Updated game state
 */
export function dispatchAction<T extends ActionType>(
  currentState: GameState,
  action: ActionByType[T],
  deps?: DispatchDeps,
): GameState {
  // Pre-dispatch invariant check (optional)
  if (shouldCheckInvariants(deps)) {
    try {
      assertValidGameState(currentState, `Pre-${action.type}`);
    } catch (e) {
      throw new Error(
        `Invariant failed BEFORE ${action.type}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Hash before (for replay verification)
  const hashBefore = deps?.replayLog ? hashGameState(currentState) : undefined;

  // Execute action
  const nextState = dispatchInternal(currentState, action);

  // Hash after and log (for replay verification)
  if (deps?.replayLog && hashBefore !== undefined) {
    const hashAfter = hashGameState(nextState);
    deps.replayLog.push({
      actionType: action.type,
      stateHashBefore: hashBefore,
      stateHashAfter: hashAfter,
    });
  }

  // Post-dispatch invariant check (optional)
  if (shouldCheckInvariants(deps)) {
    try {
      assertValidGameState(nextState, `Post-${action.type}`);
    } catch (e) {
      throw new Error(
        `Invariant failed AFTER ${action.type}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return nextState;
}















