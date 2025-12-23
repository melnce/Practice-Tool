import { state } from "../../../core/gameState.js";
import { CardInstance } from "../../../core/types.js";
import { TargetQuery, TargetingEnv, TargetContextKey } from "./types.js";

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
        // LEGACY: Log preserved from legacy engine behavior
        console.log(
          `%c[Targeting] Found entering_follower: ${env.context.enteringCard.name}`,
          "color: green; font-weight: bold;",
        );
        return [env.context.enteringCard];
      }
      console.warn("entering_follower target used without context");
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

  hand: (q, env) => {
    const myHand = env.owner === "blue" ? state.blueHand : state.redHand;
    const pool = myHand || [];

    // Legacy logging
    if (!(globalThis as any).HEADLESS) {
      console.warn(`[getPool] Targeting Hand. Pool Size: ${pool.length}`);
    }
    return pool;
  },

  self: (q, env) => {
    return env.sourceCard ? [env.sourceCard] : [];
  },

  ally: (q, env) => {
    const myBoard = env.owner === "blue" ? state.blueBoard : state.redBoard;
    return myBoard || [];
  },

  enemy: (q, env) => {
    const oppBoard = env.owner === "blue" ? state.redBoard : state.blueBoard;
    return oppBoard || [];
  },

  any: (q, env) => {
    const myBoard = env.owner === "blue" ? state.blueBoard : state.redBoard;
    const oppBoard = env.owner === "blue" ? state.redBoard : state.blueBoard;
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
