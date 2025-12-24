import { state } from "../../../core/gameState.js";
import { CardInstance } from "../../../core/types.js";
import { TargetQuery, TargetingEnv, TargetContextKey } from "./types.js";
import { getHand, getBoard, opponentOf } from "../../../core/playerHelpers.js";

type ResolverFn = (query: TargetQuery, env: TargetingEnv) => CardInstance[];

export const CONTEXT_RESOLVERS: Record<TargetContextKey, ResolverFn> = {
  // -------------------------------------------------------------------------
  // Special Contexts
  // -------------------------------------------------------------------------

  special: (q, env) => {
    if (q.specialContext === "last_summoned") {
      const ls = (state as any).lastSummoned;
      return Array.isArray(ls) ? ls : ls ? [ls] : [];
    }
    if (q.specialContext === "entering_follower") {
      if (env.context.enteringCard) {
        return [env.context.enteringCard];
      }
      console.warn("[Targeting] entering_follower target used without context");
      return [];
    }
    return [];
  },

  // -------------------------------------------------------------------------
  // Selected (Pending Selection)
  // -------------------------------------------------------------------------

  selected: (q, env) => {
    // LEGACY: Nested selection hierarchy.
    // Prefer context.targets (pass-down) over state.pending (global).
    const chosen = Array.isArray(env.context?.targets)
      ? env.context.targets
      : Array.isArray(state.pendingTargetEffect?.targets)
        ? state.pendingTargetEffect!.targets
        : [];

    return (chosen || []).filter(Boolean);
  },

  // -------------------------------------------------------------------------
  // Standard Zones
  // -------------------------------------------------------------------------

  attacker: (q, env) => {
    return env.context?.attacker ? [env.context.attacker] : [];
  },

  hand: (_q, env) => {
    const myHand = getHand(state, env.owner);
    return myHand || [];
  },

  self: (q, env) => {
    return env.sourceCard ? [env.sourceCard] : [];
  },

  ally: (q, env) => {
    const myBoard = getBoard(state, env.owner);
    return myBoard || [];
  },

  enemy: (q, env) => {
    const oppBoard = getBoard(state, opponentOf(env.owner));
    return oppBoard || [];
  },

  any: (q, env) => {
    const myBoard = getBoard(state, env.owner);
    const oppBoard = getBoard(state, opponentOf(env.owner));
    return [...(myBoard || []), ...(oppBoard || [])];
  },
};

export function resolveBasePool(
  query: TargetQuery,
  env: TargetingEnv,
): CardInstance[] {
  const resolver = CONTEXT_RESOLVERS[query.side];
  if (resolver) {
    return resolver(query, env);
  }
  // Fallback (legacy seemed to default to ally/board if unknown, but parser forces valid side)
  return [];
}















