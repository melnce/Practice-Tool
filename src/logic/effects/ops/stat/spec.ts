import { state } from "../../../../core/gameState.js";
import type { CardInstance, Player } from "../../../../core/types/index.js";
import type { StatOp } from "./types.js";
import { resolveDynamicValue } from "../../../core/values.js";
import {
  getPlaysThisTurn,
  getHand,
  getBoard,
  isFirstPlayer,
} from "../../../../core/playerHelpers.js";
import { countNamedEnters } from "../../../core/followerEnterHistory.js";
import { resolveStatDuration, type StatDuration } from "./duration.js";

export interface ResolvedStatSpec {
  attack: number;
  defense: number;
  duration: StatDuration;
}

export interface StatSpecContext {
  owner: Player;
  sourceCard: CardInstance | null;
}

function filterTribe(eff: StatOp): string | undefined {
  const filter = eff.filter;
  if (!filter || typeof filter !== "object" || Array.isArray(filter))
    return undefined;
  const tribe = (filter as { tribe?: string }).tribe;
  return typeof tribe === "string" ? tribe : undefined;
}

function excludeSelfFromCount(
  eff: StatOp,
  sourceCard: CardInstance | null,
): boolean {
  const cond = eff.condition;
  if (cond && typeof cond === "object" && !Array.isArray(cond)) {
    if ((cond as Record<string, unknown>).not_self === true) return true;
  }
  return false;
}

function resolveAttackSourceDelta(
  eff: StatOp,
  owner: Player,
  sourceCard: CardInstance | null,
): number {
  let delta = 0;
  const src = eff.attack_source;
  if (!src) return 0;

  if (src === "combo") {
    delta += getPlaysThisTurn(state, owner);
  } else if (src === "count_in_hand") {
    const tribe = filterTribe(eff);
    if (!tribe) return delta;
    const hand = getHand(state, owner);
    delta += hand.filter(
      (c) => Array.isArray(c.tribes) && c.tribes.includes(tribe),
    ).length;
  } else if (src === "count_allies") {
    const board = getBoard(state, owner);
    const skipSelf = excludeSelfFromCount(eff, sourceCard);
    delta += board.filter(
      (c) => c.type === "Follower" && (!skipSelf || c.uid !== sourceCard?.uid),
    ).length;
  } else if (src === "shikigami_deaths") {
    const pool = isFirstPlayer(owner)
      ? state.players.first.shikigamiDeathsThisTurn || []
      : state.players.second.shikigamiDeathsThisTurn || [];
    delta += (pool as any[]).reduce(
      (acc: number, x: any) => acc + (Number(x.base_attack ?? x.attack) || 0),
      0,
    );
  } else if (src === "named_enter_count") {
    const name = String(
      (eff as { name?: string }).name || sourceCard?.name || "",
    );
    delta += countNamedEnters(state, owner, name);
  }
  return delta;
}

function resolveDefenseSourceDelta(
  eff: StatOp,
  owner: Player,
  sourceCard: CardInstance | null,
): number {
  let delta = 0;
  const src = eff.defense_source;
  if (!src) return 0;

  if (src === "combo") {
    delta += getPlaysThisTurn(state, owner);
  } else if (src === "count_in_hand") {
    const tribe = filterTribe(eff);
    if (!tribe) return delta;
    const hand = getHand(state, owner);
    delta += hand.filter(
      (c) => Array.isArray(c.tribes) && c.tribes.includes(tribe),
    ).length;
  } else if (src === "count_allies") {
    const board = getBoard(state, owner);
    const skipSelf = excludeSelfFromCount(eff, sourceCard);
    delta += board.filter(
      (c) => c.type === "Follower" && (!skipSelf || c.uid !== sourceCard?.uid),
    ).length;
  } else if (src === "shikigami_deaths") {
    const pool = isFirstPlayer(owner)
      ? state.players.first.shikigamiDeathsThisTurn || []
      : state.players.second.shikigamiDeathsThisTurn || [];
    delta += (pool as any[]).reduce(
      (acc: number, x: any) => acc + (Number(x.base_defense ?? x.defense) || 0),
      0,
    );
  } else if (src === "named_enter_count") {
    const name = String(
      (eff as { name?: string }).name || sourceCard?.name || "",
    );
    delta += countNamedEnters(state, owner, name);
  }
  return delta;
}

/**
 * Resolves attack/defense (including dynamic templates and *_source fields)
 * and duration for a stat op. null attack/defense → 0 per resolveDynamicValue contract.
 */
export function normalizeStatSpec(
  eff: StatOp,
  ctx: StatSpecContext,
): ResolvedStatSpec {
  const valueCtx = { owner: ctx.owner, sourceCard: ctx.sourceCard };
  let attack = resolveDynamicValue(
    eff.attack as string | number | undefined,
    valueCtx,
  );
  let defense = resolveDynamicValue(
    eff.defense as string | number | undefined,
    valueCtx,
  );

  attack += resolveAttackSourceDelta(eff, ctx.owner, ctx.sourceCard);
  defense += resolveDefenseSourceDelta(eff, ctx.owner, ctx.sourceCard);

  return {
    attack,
    defense,
    duration: resolveStatDuration(eff),
  };
}

export function statOpHasKeywordOrAttacksGrant(eff: StatOp): boolean {
  const keywords = eff.keywords;
  const hasKeywords = Array.isArray(keywords) && keywords.length > 0;
  return (
    hasKeywords ||
    (eff as { attacks_per_turn?: unknown }).attacks_per_turn !== undefined
  );
}
