import { state } from "../../../core/gameState.js";
import type { CardInstance } from "../../../core/types/index.js";
import type { TargetQuery, TargetingEnv, TargetContextKey } from "./types.js";
import { getHand, getBoard, opponentOf } from "../../../core/playerHelpers.js";
import { resolveUid, resolveUids } from "../../../core/uidResolver.js";

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
      // Prefer UID resolution, fallback to deprecated object ref
      if (env.context.enteringCardUid) {
        const card = resolveUid(env.context.enteringCardUid);
        return card ? [card] : [];
      }
      if (env.context.enteringCard) {
        return [env.context.enteringCard];
      }
      console.warn("[Targeting] entering_follower target used without context");
      return [];
    }
    if (q.specialContext === "played_card") {
      // For ally_follower_played triggers
      const ctx = env.context as any;
      if (ctx.playedCardUid) {
        const card = resolveUid(ctx.playedCardUid);
        return card ? [card] : [];
      }
      if (ctx.playedCard) {
        return [ctx.playedCard];
      }
      console.warn("[Targeting] played_card target used without context");
      return [];
    }
    if (q.specialContext === "clash_opponent") {
      const source = env.sourceCard;
      if (!source) return [];
      const ctx = env.context as any;
      const attacker = ctx.attackerUid
        ? resolveUid(ctx.attackerUid)
        : ctx.attacker;
      const defender = ctx.defenderUid
        ? resolveUid(ctx.defenderUid)
        : ctx.defender;
      if (!attacker || !defender) return [];
      const opponent =
        source.uid === attacker.uid
          ? defender
          : source.uid === defender.uid
            ? attacker
            : null;
      return opponent ? [opponent] : [];
    }
    return [];
  },

  // -------------------------------------------------------------------------
  // Selected (Pending Selection)
  // -------------------------------------------------------------------------

  selected: (q, env) => {
    // UID-based selection only
    if (env.context?.targetUids?.length) {
      return resolveUids(env.context.targetUids);
    }
    // Check pending target state
    if (Array.isArray(state.pendingTargetEffect?.targetUids)) {
      return resolveUids(state.pendingTargetEffect!.targetUids);
    }
    return [];
  },

  // -------------------------------------------------------------------------
  // Standard Zones
  // -------------------------------------------------------------------------

  attacker: (q, env) => {
    // Prefer UID resolution
    if (env.context?.attackerUid) {
      const card = resolveUid(env.context.attackerUid);
      return card ? [card] : [];
    }
    return env.context?.attacker ? [env.context.attacker] : [];
  },

  hand: (_q, env) => {
    const myHand = getHand(state, env.owner);
    return myHand || [];
  },

  enemy_hand: (_q, env) => {
    const oppHand = getHand(state, opponentOf(env.owner));
    return oppHand || [];
  },

  self: (q, env) => {
    return env.sourceCard ? [env.sourceCard] : [];
  },

  ally: (q, env) => {
    const myBoard = getBoard(state, env.owner);
    return (myBoard || []).filter((c) => c != null && typeof c === "object");
  },

  enemy: (q, env) => {
    const oppBoard = getBoard(state, opponentOf(env.owner));
    return (oppBoard || []).filter((c) => c != null && typeof c === "object");
  },

  any: (q, env) => {
    const myBoard = getBoard(state, env.owner);
    const oppBoard = getBoard(state, opponentOf(env.owner));
    return [...(myBoard || []), ...(oppBoard || [])].filter(
      (c) => c != null && typeof c === "object",
    );
  },

  unknown: () => [],
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
