import { CardInstance, Player, Effect } from "../../../core/types.js";

// Re-export shared types
export { CardInstance, Player, Effect };

// -----------------------------------------------------------------------------
// New Refactor Types (Targeting Logic)
// -----------------------------------------------------------------------------

export interface TargetContext {
  // Core targeting fields
  targets?: CardInstance[];
  enteringCard?: CardInstance;
  isTargetedEffect?: boolean;
  selectCount?: number;

  // Combat context
  attacker?: CardInstance;
  defender?: CardInstance;

  // Source card reference
  sourceCard?: CardInstance | null;

  // Cross-effect communication
  variables?: Record<string, number | string>;

  // Adapter for rendering
  adapter?: { render: () => void };

  // Injected runEffects function
  runner?: (...args: any[]) => any;
}

export interface TargetingEnv {
  owner: Player;
  sourceCard: CardInstance | null;
  context: TargetContext;
}

export interface TargetQuery {
  raw: string;
  side:
  | "ally"
  | "enemy"
  | "hand"
  | "any"
  | "self"
  | "selected"
  | "special"
  | "attacker";
  specialContext?: "entering_follower" | "last_summoned" | undefined;
  typeFilter?: "follower" | "amulet" | "spell" | undefined;
  condition: any;
}

// Closed union for Context Resolvers
export type TargetContextKey =
  | "special"
  | "selected"
  | "hand"
  | "self"
  | "ally"
  | "enemy"
  | "any"
  | "attacker";

// Closed union for Filter Keys (for documentation/consts if needed)
export type TargetFilterKey = "follower" | "amulet" | "spell";

export type TargetSide = TargetContextKey; // Side maps 1:1 to context resolver keys

// -----------------------------------------------------------------------------
// Legacy / UI Engine Types (Restored)
// -----------------------------------------------------------------------------

export interface TargetedOpContext {
  eff: Effect;
  owner: Player;
  sourceCard: CardInstance | null;
  targets: CardInstance[];
  resumeEffects?: Effect[];
}

export type TargetingResult =
  | { kind: "invalid"; reason: string }
  | { kind: "continue" }
  | { kind: "confirm_needed" }
  | { kind: "execute"; opCtx: TargetedOpContext };

export type DispatchResult =
  | { kind: "handled" }
  | { kind: "paused" }
  | { kind: "error"; reason: string }; // Assuming error state exists or just omitted















