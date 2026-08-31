// src/ui/drag.ts
/**
 * Game drag wiring — pointer-events only (mouse + touch share one path).
 * Payload string formats are unchanged from the former HTML5 DnD layer so
 * drop decision logic stays identical.
 */
import type { CardInstance, GameState, Player } from "../core/types/index.js";
import { reportBlockedOutcome } from "./outcomes.js";
import {
  playCardAction,
  attackAction,
  evolveAction,
  maybeAdvanceScriptFromUi,
} from "./playerDispatch.js";
import { getBoard } from "../core/playerHelpers.js";
import {
  attachPointerDragSource,
  setDropTarget,
  clearDropTarget,
  invokeDropOnElement,
} from "./pointerDragSession.js";
import { beginDragCardTooltip, endDragCardTooltip } from "./tooltips.js";

export { invokeDropOnElement };

export function makeLeaderDroppable(
  leaderEl: HTMLElement,
  targetPlayer: Player,
  state: GameState,
) {
  setDropTarget(
    leaderEl,
    (data) => {
      // Attacker payloads look like "first,0" — not hand / evo.
      if (data.startsWith("hand,") || data.includes("Evo")) return false;
      const [attackerPlayer] = data.split(",");
      return !!attackerPlayer && attackerPlayer === state.activePlayer;
    },
    (data) => {
      if (state.phase === "gameover") return;
      const [attackerPlayer, attackerIndex] = data.split(",");

      const isFirstActive = state.activePlayer === "first";
      if (
        (targetPlayer === "first" && isFirstActive) ||
        (targetPlayer === "second" && !isFirstActive)
      )
        return;
      if (!attackerIndex) return;

      if (attackerPlayer !== state.activePlayer) {
        reportBlockedOutcome({ kind: "blocked", reason: "Not your turn" });
        return;
      }

      const attacker = getBoard(state, attackerPlayer as Player)[
        parseInt(attackerIndex || "0", 10)
      ];
      if (!attacker) return;
      attackAction(attackerPlayer as Player, attacker.uid, {
        type: "leader",
        player: targetPlayer,
      });
      maybeAdvanceScriptFromUi();
    },
  );
}

export function clearLeaderDroppable(leaderEl: HTMLElement) {
  clearDropTarget(leaderEl);
}

export function enableCardDragFromHand(
  div: HTMLElement,
  card: CardInstance,
  containerId: string,
  draggable = true,
  handGesture?: {
    onFuseGesture: () => void;
    isInitiatorStillInHand: () => boolean;
  },
) {
  const owner: Player = containerId === "blueHand" ? "first" : "second";
  const opts: import("./pointerDragSession.js").DragSourceOptions = {
    payload: `hand,${containerId},${card.uid}`,
    kind: "hand",
    handContainerId: containerId,
    onDragBegan: () => beginDragCardTooltip(card, owner, div),
    onDragEnded: () => endDragCardTooltip(),
  };
  if (handGesture) {
    opts.onFuseGesture = () => handGesture.onFuseGesture();
    opts.isInitiatorStillInHand = handGesture.isInitiatorStillInHand;
  }
  attachPointerDragSource(div, opts, draggable);
}

export function enableAttackerDrag(
  div: HTMLElement,
  player: Player,
  boardIndex: number,
  card?: CardInstance,
) {
  const opts: import("./pointerDragSession.js").DragSourceOptions = {
    payload: `${player},${boardIndex}`,
    kind: "attacker",
  };
  if (card) {
    opts.onDragBegan = () => beginDragCardTooltip(card, player, div);
    opts.onDragEnded = () => endDragCardTooltip();
  }
  attachPointerDragSource(div, opts, true);
}

export function enableBoardDropForOwnSide(
  div: HTMLElement,
  containerId: string,
  _state: GameState,
) {
  setDropTarget(
    div,
    (data) => {
      if (data.includes("NormalEvo") || data.includes("SuperEvo")) return false;
      const [sourceType, sourceId, cardUid] = data.split(",");
      return (
        sourceType === "hand" &&
        sourceId === containerId.replace("Board", "Hand") &&
        !!cardUid
      );
    },
    (data) => {
      if (data.includes("NormalEvo") || data.includes("SuperEvo")) return;
      const [sourceType, sourceId, cardUid] = data.split(",");
      if (
        sourceType === "hand" &&
        sourceId === containerId.replace("Board", "Hand") &&
        cardUid
      ) {
        const player: Player = containerId === "blueBoard" ? "first" : "second";
        playCardAction(player, cardUid);
      }
    },
  );
}

export function enableCardEvoDrop(
  div: HTMLElement,
  containerId: string,
  card: CardInstance,
  state: GameState,
  _rerender: () => void,
) {
  setDropTarget(
    div,
    (data) => {
      if (!(data.includes("NormalEvo") || data.includes("SuperEvo")))
        return false;
      if (card.hasEvolved) return false;
      return true;
    },
    (data) => {
      if (!(data.includes("NormalEvo") || data.includes("SuperEvo"))) return;
      if (card.hasEvolved) return;

      const isBlueSide = containerId === "blueBoard";
      const isNormal = data.includes("NormalEvo");

      const isFirstPlayerActive = state.activePlayer === "first";
      if (isBlueSide) {
        if (!isFirstPlayerActive) return;
        if (isNormal) {
          if (
            state.players.first.evoUsedThisTurn ||
            !(state.players.first.evoCharges > 0)
          )
            return;
        } else {
          if (
            state.players.first.evoUsedThisTurn ||
            !(state.players.first.superEvoCharges > 0)
          )
            return;
        }
      } else {
        if (isFirstPlayerActive) return;
        if (isNormal) {
          if (
            state.players.second.evoUsedThisTurn ||
            !(state.players.second.evoCharges > 0)
          )
            return;
        } else {
          if (
            state.players.second.evoUsedThisTurn ||
            !(state.players.second.superEvoCharges > 0)
          )
            return;
        }
      }

      const owner: Player = isBlueSide ? "first" : "second";
      const mode = isNormal ? "normal" : "super";
      // Sync path: evolveAction → engine.dispatch → doAction (no await inside).
      evolveAction(owner, card.uid, mode);
    },
  );
}

export function enableEnemyFollowerDrop(
  div: HTMLElement,
  _attackerData: unknown,
  defenderIndex: number,
  state: GameState,
  isRedBoard: boolean,
) {
  setDropTarget(
    div,
    (data) => {
      if (data.startsWith("hand,") || data.includes("Evo")) return false;
      const [attackerPlayer] = data.split(",");
      return !!attackerPlayer && attackerPlayer === state.activePlayer;
    },
    (data) => {
      if (state.phase === "gameover") return;
      const [attackerPlayer, attackerIndex] = data.split(",");

      if (attackerPlayer !== state.activePlayer) {
        reportBlockedOutcome({ kind: "blocked", reason: "Not your turn" });
        return;
      }

      const defenderPlayer = isRedBoard ? "second" : "first";
      const defenders =
        defenderPlayer === "first"
          ? state.players.first.board
          : state.players.second.board;
      const defender = defenders[defenderIndex];
      if (!defender) return;

      const attacker = getBoard(state, attackerPlayer as Player)[
        parseInt(attackerIndex || "0", 10)
      ];
      if (!attacker) return;

      const hasWard = defenders.some(
        (c: CardInstance) => (c.hasWard ?? false) && Number(c.defense ?? 0) > 0,
      );
      if (hasWard && !defender.hasWard && !attacker.ignoresWard) return;
      if (defender.hasIntimidate && !defender.hasWard) return;

      attackAction(attackerPlayer as Player, attacker.uid, {
        type: "card",
        uid: defender.uid,
      });
    },
  );
}

export function enableEvoButtonDrag(btn: HTMLButtonElement, enabled: boolean) {
  attachPointerDragSource(
    btn,
    {
      payload: btn.id,
      kind: "evo",
    },
    enabled,
  );
}
