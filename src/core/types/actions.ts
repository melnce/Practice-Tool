// =============================================================================
// ACTION TYPES
// =============================================================================

import type { Player } from "./player.js";

// Action Payloads
export type TargetSpec =
    | { type: "card"; uid: string }
    | { type: "leader"; player: Player };

export type PlayCardAction = {
    type: "PLAY_CARD";
    player: Player;
    cardUid: string;
};

export type AttackAction = {
    type: "ATTACK";
    player: Player;
    attackerUid: string;
    defender: TargetSpec;
};

export interface ChooseTargetAction {
    type: "CHOOSE_TARGET";
    player: Player;
    target: TargetSpec;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION TYPE MAPPING - Closed-world union with type-level assertions
// ─────────────────────────────────────────────────────────────────────────────

// Step 1: Define all action types as string literal union
export type ActionType =
    | "UNDO"
    | "REDO"
    | "RESET_HISTORY"
    | "END_TURN"
    | "PLAY_CARD"
    | "ATTACK"
    | "CHOOSE_TARGET";

// Step 2: Define the canonical type mapping (ActionType -> Action interface)
export interface ActionByType {
    UNDO: { type: "UNDO" };
    REDO: { type: "REDO" };
    RESET_HISTORY: { type: "RESET_HISTORY" };
    END_TURN: { type: "END_TURN" };
    PLAY_CARD: PlayCardAction;
    ATTACK: AttackAction;
    CHOOSE_TARGET: ChooseTargetAction;
}

// Step 3: Type assertions to enforce totality and exactness
type _AssertActionTotal = ActionType extends keyof ActionByType ? true : never;
type _AssertActionReverse = keyof ActionByType extends ActionType
    ? true
    : never;
type _AssertActionExact = {
    [K in ActionType]: ActionByType[K]["type"] extends K
    ? K extends ActionByType[K]["type"]
    ? true
    : never
    : never;
};
type _AssertActionExactAll = _AssertActionExact[ActionType] extends true
    ? true
    : never;

// Force evaluation
const _actionChecks: [
    _AssertActionTotal,
    _AssertActionReverse,
    _AssertActionExactAll,
] = [true, true, true];

// Step 4: The Union Type (derived from mapping)
export type PlayerAction = ActionByType[ActionType];

// Legacy aliases for compatibility
export type HistoryAction =
    | ActionByType["UNDO"]
    | ActionByType["REDO"]
    | ActionByType["RESET_HISTORY"];
export type GameAction = ActionByType["END_TURN"];
