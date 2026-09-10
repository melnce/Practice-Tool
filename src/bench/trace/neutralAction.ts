// src/bench/trace/neutralAction.ts — SoakAction → NeutralAction

import type {
  GameState,
  CardInstance,
  Player,
} from "../../core/types/index.js";
import type { SoakAction } from "../soakEnv.js";
import { getLegalSoakActions, sortSoakActions } from "../soakEnv.js";
import { getBoard, getHand, opponentOf } from "../../core/playerHelpers.js";
import type { NeutralAction } from "./types.js";
import { playerToTrace } from "./canonicalState.js";

function boardSlot(state: GameState, player: Player, uid: string): number {
  const board = getBoard(state, player);
  return board.findIndex((c) => c?.uid === uid);
}

function handPos(state: GameState, player: Player, uid: string): number {
  const hand = getHand(state, player);
  return hand.findIndex((c) => c?.uid === uid);
}

function cardIdAt(state: GameState, uid: string): string {
  for (const p of ["first", "second"] as const) {
    for (const zone of ["hand", "board"] as const) {
      const arr = zone === "hand" ? getHand(state, p) : getBoard(state, p);
      const c = arr.find((x) => x?.uid === uid);
      if (c?.id) return String(c.id);
    }
  }
  return uid;
}

export function soakActionToNeutral(
  action: SoakAction,
  state: GameState,
  ctx?: {
    mulliganSwap?: [boolean, boolean, boolean, boolean];
    fusePartners?: number[];
  },
): NeutralAction | null {
  switch (action.type) {
    case "TOGGLE_MULLIGAN":
      return null;
    case "CONFIRM_MULLIGAN": {
      const swap = ctx?.mulliganSwap ?? ([false, false, false, false] as const);
      return {
        mulligan: {
          player: playerToTrace(action.player),
          swap: [...swap] as [boolean, boolean, boolean, boolean],
        },
      };
    }
    case "PLAY_CARD": {
      const pos = handPos(state, action.player, action.cardUid);
      return {
        play: {
          player: playerToTrace(action.player),
          hand_pos: pos < 0 ? 0 : pos,
          card: cardIdAt(state, action.cardUid),
        },
      };
    }
    case "ATTACK": {
      const slot = boardSlot(state, action.player, action.attackerUid);
      const target =
        action.defender.type === "leader"
          ? "leader"
          : {
              slot: boardSlot(
                state,
                opponentOf(action.player),
                action.defender.uid,
              ),
            };
      return {
        attack: {
          player: playerToTrace(action.player),
          attacker_slot: slot < 0 ? 0 : slot,
          target,
        },
      };
    }
    case "CHOOSE_TARGET": {
      const player = action.player;
      if (action.target.type === "leader") {
        return {
          choose: { player: playerToTrace(player), option: "leader" },
        };
      }
      const uid = action.target.uid;
      const hand = getHand(state, player);
      const inHand = hand.some((c) => c?.uid === uid);
      if (inHand) {
        return {
          choose: {
            player: playerToTrace(player),
            option: { card: cardIdAt(state, uid) },
          },
        };
      }
      const enemy = opponentOf(player);
      const slot = boardSlot(state, enemy, uid);
      if (slot >= 0) {
        return {
          choose: {
            player: playerToTrace(player),
            option: { slot },
          },
        };
      }
      const selfSlot = boardSlot(state, player, uid);
      return {
        choose: {
          player: playerToTrace(player),
          option: { slot: selfSlot < 0 ? 0 : selfSlot },
        },
      };
    }
    case "EVOLVE": {
      const slot = boardSlot(state, action.player, action.cardUid);
      return {
        evolve: {
          player: playerToTrace(action.player),
          slot: slot < 0 ? 0 : slot,
          super: action.mode === "super",
        },
      };
    }
    case "ENGAGE": {
      const slot = boardSlot(state, action.player, action.cardUid);
      return {
        engage: {
          player: playerToTrace(action.player),
          slot: slot < 0 ? 0 : slot,
        },
      };
    }
    case "BONUS_PP":
      return { bonus_pp: { player: "b" } };
    case "CHOOSE_MODE":
      return {
        choose: {
          player: playerToTrace(action.player),
          option: { mode: action.indices[0] ?? 0 },
        },
      };
    case "CONFIRM_TARGETS":
      return {
        confirm: { player: playerToTrace(state.activePlayer) },
      };
    case "FUSE": {
      const hostPos = handPos(state, action.player, action.cardUid);
      return {
        fuse: {
          player: playerToTrace(action.player),
          host_pos: hostPos < 0 ? 0 : hostPos,
          partner_pos: ctx?.fusePartners ?? [],
        },
      };
    }
    case "END_TURN":
      return { end_turn: { player: playerToTrace(state.activePlayer) } };
    case "FORCE_COMPLETE_PENDING":
      return null;
    default:
      return null;
  }
}

function neutralSortKey(action: NeutralAction): string {
  return JSON.stringify(action);
}

export function sortNeutralActions(actions: NeutralAction[]): NeutralAction[] {
  return [...actions].sort((a, b) =>
    neutralSortKey(a).localeCompare(neutralSortKey(b)),
  );
}

export function getLegalNeutralActions(state: GameState): NeutralAction[] {
  const soak = sortSoakActions(getLegalSoakActions());
  const out: NeutralAction[] = [];
  for (const a of soak) {
    const n = soakActionToNeutral(a, state);
    if (n) out.push(n);
  }
  return sortNeutralActions(out);
}

export function findCardInZones(
  state: GameState,
  uid: string,
): { zone: string; player: Player; card: CardInstance } | null {
  for (const p of ["first", "second"] as const) {
    for (const [zone, getter] of [
      ["hand", () => getHand(state, p)],
      ["board", () => getBoard(state, p)],
      ["deck", () => state.players[p].deck],
      ["cemetery", () => state.players[p].graveyard],
    ] as const) {
      const arr = getter();
      const c = arr.find((x) => x?.uid === uid);
      if (c) return { zone, player: p, card: c };
    }
  }
  return null;
}
