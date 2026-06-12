// src/ui/drag.ts
import { getDragData, setDragData } from "./dom.js";
import { doAction } from "../core/history.js";
import { state } from "../core/gameState.js";
import type { CardInstance, Player } from "../core/types/index.js";

const logic = () => import(/* webpackIgnore: true */ "../logic/index.js");

export function wireFieldSlotDragHighlight(slots: HTMLElement[]): void {
  for (const slot of slots) {
    if (slot.dataset.dragHighlightWired) continue;
    slot.dataset.dragHighlightWired = "1";
    slot.addEventListener("dragenter", (e) => {
      e.preventDefault();
      const data = getDragData(e);
      if (data.startsWith("hand,")) slot.dataset.droppable = "true";
    });
    slot.addEventListener("dragleave", () => {
      delete slot.dataset.droppable;
    });
    slot.addEventListener("drop", () => {
      delete slot.dataset.droppable;
    });
  }
}

export function makeLeaderDroppable(
  leaderEl: HTMLElement,
  targetPlayer: Player,
) {
  leaderEl.ondragover = (e) => e.preventDefault();
  leaderEl.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);
    const [attackerPlayer, attackerIndex] = data.split(",");

    const isFirstActive = state.activePlayer === "first";
    if (
      (targetPlayer === "first" && isFirstActive) ||
      (targetPlayer === "second" && !isFirstActive)
    )
      return;
    if (!attackerIndex) return;

    void logic().then(({ attackLeader }) => {
      attackLeader(
        parseInt(attackerIndex || "0", 10),
        attackerPlayer as Player,
        targetPlayer,
      );
    });
  };
}

export function enableCardDragFromHand(
  div: HTMLElement,
  containerId: string,
) {
  div.draggable = true;
  div.ondragstart = (e) => {
    const uid = div.dataset.instanceId ?? div.dataset.uid ?? "";
    setDragData(e, `hand,${containerId},${uid}`);
  };
}

export function enableAttackerDrag(
  div: HTMLElement,
  player: Player,
  resolveIndex: () => number,
) {
  div.draggable = true;
  div.ondragstart = (e) => {
    const idx = resolveIndex();
    if (idx < 0) {
      e.preventDefault();
      return;
    }
    setDragData(e, `${player},${idx}`);
  };
}

export function enableBoardDropForOwnSide(
  div: HTMLElement,
  containerId: string,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);

    if (data.includes("NormalEvo") || data.includes("SuperEvo")) return;

    const [sourceType, sourceId, cardUid] = data.split(",");
    if (
      sourceType === "hand" &&
      sourceId === containerId.replace("Board", "Hand")
    ) {
      const player: Player = containerId === "blueBoard" ? "first" : "second";
      const hand = state.players[player].hand;
      const index = hand.findIndex((c: CardInstance) => c.uid === cardUid);
      if (index !== -1)
        void logic().then(({ playCard }) => playCard(hand, player, index));
    }
  };
}

export function enableCardEvoDrop(
  div: HTMLElement,
  containerId: string,
  rerender: () => void,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);
    if (!(data.includes("NormalEvo") || data.includes("SuperEvo"))) return;

    const cardUid = div.dataset.instanceId ?? div.dataset.uid ?? "";
    const isBlueSide = containerId === "blueBoard";
    const owner: Player = isBlueSide ? "first" : "second";
    const board = state.players[owner].board;
    const card = board.find((c) => c.uid === cardUid);
    if (!card || card.hasEvolved) return;

    const isNormal = data.includes("NormalEvo");
    const isFirstPlayerActive = state.activePlayer === "first";

    if (isBlueSide) {
      if (!isFirstPlayerActive) return;
      if (isNormal) {
        if (state.players.first.evoUsedThisTurn || !(state.players.first.evoCharges > 0)) return;
      } else {
        if (state.players.first.evoUsedThisTurn || !(state.players.first.superEvoCharges > 0))
          return;
      }
    } else {
      if (isFirstPlayerActive) return;
      if (isNormal) {
        if (state.players.second.evoUsedThisTurn || !(state.players.second.evoCharges > 0)) return;
      } else {
        if (state.players.second.evoUsedThisTurn || !(state.players.second.superEvoCharges > 0))
          return;
      }
    }

    const mode = isNormal ? "normal" : "super";
    doAction(
      isNormal ? "Evolve" : "Super Evolve",
      () => {
        void logic().then(({ handleEvolveSelf }) => {
          handleEvolveSelf(card, owner, { mode, spendPoint: true, runEvoEffects: true });
          rerender();
        });
      },
      {},
      { autoRender: false },
    );
  };
}

export function enableEnemyFollowerDrop(
  div: HTMLElement,
  defenderPlayer: Player,
  resolveDefenderIndex: () => number,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);
    const [attackerPlayer, attackerIndex] = data.split(",");
    const defenderIndex = resolveDefenderIndex();
    if (defenderIndex < 0) return;

    const defenders = state.players[defenderPlayer].board;
    const defender = defenders[defenderIndex];
    if (!defender) return;

    const hasWard = defenders.some(
      (c: CardInstance) => (c.hasWard ?? false) && Number(c.defense ?? 0) > 0,
    );
    if (hasWard && !defender.hasWard) return;
    if (defender.hasIntimidate && !defender.hasWard) return;

    void logic().then(({ attackFollower }) => {
      attackFollower(
        parseInt(attackerIndex || "0", 10),
        defenderIndex,
        attackerPlayer as Player,
        defenderPlayer,
      );
    });
  };
}
