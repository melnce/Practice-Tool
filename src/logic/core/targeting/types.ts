import type {
  CardInstance,
  Player,
  Effect,
} from "../../../core/types/index.js";

// Re-export shared types (type-only to avoid circular deps)
export type { CardInstance, Player, Effect };

// -----------------------------------------------------------------------------
// Modern Targeting Types (UID-Only)
// -----------------------------------------------------------------------------

/**
 * Context passed through effect execution.
 *
 * Uses UID-only targeting for determinism and serialization.
 * Use resolveUid() to get CardInstance when needed.
 */
export interface TargetContext {
  // UID-based targeting (preferred - use when available)
  targetUids?: string[];

  // Source card (kept for convenience - frequently accessed)
  sourceCard?: CardInstance | null;
  sourceCardUid?: string;

  // Entering card context (for triggers)
  enteringCardUid?: string;

  // Targeting metadata
  isTargetedEffect?: boolean;
  selectCount?: number;

  // Combat context (UIDs)
  attackerUid?: string;
  defenderUid?: string;

  // Cross-effect communication
  variables?: Record<string, number | string>;

  /**
   * Play preflight only: uid of the card being evaluated for play.
   * While checking playability the card is treated as in no zone — excluded
   * from every target pool (hand pools especially).
   */
  playingCardUid?: string;

  // Adapter for rendering
  adapter?: { render: () => void };

  // Injected runEffects function
  runner?: (...args: any[]) => any;

  // --------------------------------------------------------------------------
  // DEPRECATED - Object refs for backward compatibility during migration
  // Use UID-based fields above instead
  // --------------------------------------------------------------------------
  /** @deprecated Use targetUids */
  targets?: CardInstance[];
  /** @deprecated Use enteringCardUid */
  enteringCard?: CardInstance;
  /** @deprecated Use attackerUid */
  attacker?: CardInstance;
  /** @deprecated Use defenderUid */
  defender?: CardInstance;
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
    | "enemy_hand"
    | "any"
    | "self"
    | "selected"
    | "special"
    | "attacker"
    | "unknown";
  specialContext?:
    | "entering_follower"
    | "last_summoned"
    | "played_card"
    | "clash_opponent"
    | undefined;
  typeFilter?: "follower" | "amulet" | "spell" | undefined;
  condition: any;
  excludeSelf?: boolean; // "other:X" targets exclude the source card
}

// Closed union for Context Resolvers
export type TargetContextKey =
  | "special"
  | "selected"
  | "hand"
  | "enemy_hand"
  | "self"
  | "ally"
  | "enemy"
  | "any"
  | "attacker"
  | "unknown";

// Closed union for Filter Keys (for documentation/consts if needed)
export type TargetFilterKey = "follower" | "amulet" | "spell";

export type TargetSide = TargetContextKey; // Side maps 1:1 to context resolver keys

// -----------------------------------------------------------------------------
// Targeted Operation Context (UID-Only)
// -----------------------------------------------------------------------------

/**
 * Context for targeted operation execution.
 * Uses UID-only targeting for determinism.
 */
export interface TargetedOpContext {
  eff: Effect;
  owner: Player;
  sourceCard: CardInstance | null;
  targetUids: string[];
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
  | { kind: "error"; reason: string };
