// src/ui/drag.ts
import { getDragData, setDragData } from "./dom.js";
import type { CardInstance, GameState, Player } from "../core/types/index.js";
import { reportBlockedOutcome } from "./outcomes.js";
import {
  playCardAction,
  attackAction,
  evolveAction,
  maybeAdvanceScriptFromUi,
} from "./playerDispatch.js";
import { getBoard } from "../core/playerHelpers.js";

export function makeLeaderDroppable(
  leaderEl: HTMLElement,
  targetPlayer: Player,
  state: GameState,
) {
  leaderEl.ondragover = (e) => e.preventDefault();
  leaderEl.ondrop = (e) => {
    e.preventDefault();
    if (state.phase === "gameover") return;
    const data = getDragData(e);
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
  };
}

export function enableCardDragFromHand(
  div: HTMLElement,
  card: CardInstance,
  containerId: string,
  draggable = true,
) {
  div.draggable = draggable;
  if (!draggable) {
    div.ondragstart = null;
    return;
  }
  div.ondragstart = (e) => setDragData(e, `hand,${containerId},${card.uid}`);
}

export function enableAttackerDrag(
  div: HTMLElement,
  player: Player,
  boardIndex: number,
) {
  div.draggable = true;
  div.ondragstart = (e) => setDragData(e, `${player},${boardIndex}`);
}

export function enableBoardDropForOwnSide(
  div: HTMLElement,
  containerId: string,
  _state: GameState,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);

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
  };
}

export function enableCardEvoDrop(
  div: HTMLElement,
  containerId: string,
  card: CardInstance,
  state: GameState,
  _rerender: () => void,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);
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
  };
}

export function enableEnemyFollowerDrop(
  div: HTMLElement,
  _attackerData: any,
  defenderIndex: number,
  state: GameState,
  isRedBoard: boolean,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    if (state.phase === "gameover") return;
    const data = getDragData(e);
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
  };
}
