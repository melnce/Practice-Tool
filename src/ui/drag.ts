// src/ui/drag.ts
import { getDragData, setDragData } from "./dom.js";
import { doAction } from "../core/history.js";
import type { CardInstance, GameState, Player } from "../core/types/index.js";

// External game logic hooks (keep same import paths as your project)
const logic = () => import(/* webpackIgnore: true */ "../logic/index.js");

export function makeLeaderDroppable(
  leaderEl: HTMLElement,
  targetPlayer: Player,
  state: GameState,
) {
  leaderEl.ondragover = (e) => e.preventDefault();
  leaderEl.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);
    const [attackerPlayer, attackerIndex] = data.split(",");

    // Only allow dropping attacker onto the opposite leader on the correct turn
    // Use activePlayer as source of truth
    const isFirstActive = state.activePlayer === "first";
    if (
      (targetPlayer === "first" && isFirstActive) ||
      (targetPlayer === "second" && !isFirstActive)
    )
      return;
    if (!attackerIndex) return;

    void logic().then(({ attackLeader }) => {
      attackLeader(
        parseInt(attackerIndex || "0"),
        attackerPlayer as Player,
        targetPlayer,
      );
    });
  };
}

export function enableCardDragFromHand(
  div: HTMLElement,
  card: CardInstance,
  containerId: string,
) {
  div.draggable = true;
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
  state: GameState,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);

    // Evo button drag payload
    if (data.includes("NormalEvo") || data.includes("SuperEvo")) return; // handled at card level

    // Hand -> board
    const [sourceType, sourceId, cardUid] = data.split(",");
    if (
      sourceType === "hand" &&
      sourceId === containerId.replace("Board", "Hand")
    ) {
      const player: Player = containerId === "blueBoard" ? "first" : "second";
      const hand =
        player === "first"
          ? state.players.first.hand
          : state.players.second.hand;
      const index = hand.findIndex((c: CardInstance) => c.uid === cardUid);
      if (index !== -1)
        void logic().then(({ playCard }) => playCard(hand, player, index));
    }
  };
}

export function enableCardEvoDrop(
  div: HTMLElement,
  containerId: string,
  card: CardInstance,
  state: GameState,
  rerender: () => void,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);
    if (!(data.includes("NormalEvo") || data.includes("SuperEvo"))) return;
    if (card.hasEvolved) return;

    const isBlueSide = containerId === "blueBoard";
    const isNormal = data.includes("NormalEvo");
    const isSuper = data.includes("SuperEvo");

    // Turn + charges + per-turn lock - use activePlayer as source of truth
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
    const actionName = isSuper ? "Super Evolve" : "Evolve";
    // Resolve dynamic import BEFORE opening history — doAction callbacks must be sync.
    void logic().then(({ handleEvolveSelf }) => {
      doAction(
        actionName,
        () => {
          // Use handleEvolveSelf as single source of truth for all evolve logic:
          // - Applies stat boosts (+2/+2 or +3/+3)
          // - Sets hasEvolved, evoType, rush/storm flags
          // - Spends evo charges and sets evoUsedThisTurn
          // - Runs evolve/superevolve effects
          // Rerender is called after evolve completes for immediate visual feedback
          handleEvolveSelf(card, owner, {
            mode,
            spendPoint: true,
            runEvoEffects: true,
          });
          rerender();
        },
        {},
        { autoRender: false },
      );
    });
  };
}

export function enableEnemyFollowerDrop(
  div: HTMLElement,
  attackerData: any,
  defenderIndex: number,
  state: GameState,
  isRedBoard: boolean,
) {
  div.ondragover = (e) => e.preventDefault();
  div.ondrop = (e) => {
    e.preventDefault();
    const data = getDragData(e);
    const [attackerPlayer, attackerIndex] = data.split(",");

    const defenderPlayer = isRedBoard ? "second" : "first";
    const defenders =
      defenderPlayer === "first"
        ? state.players.first.board
        : state.players.second.board;
    const defender = defenders[defenderIndex];
    if (!defender) return;

    const hasWard = defenders.some(
      (c: CardInstance) => (c.hasWard ?? false) && Number(c.defense ?? 0) > 0,
    );
    if (hasWard && !defender.hasWard) return;
    if (defender.hasIntimidate && !defender.hasWard) return;

    void logic().then(({ attackFollower }) => {
      attackFollower(
        parseInt(attackerIndex || "0"),
        defenderIndex,
        attackerPlayer as Player,
        defenderPlayer,
      );
    });
  };
}
