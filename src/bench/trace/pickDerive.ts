// src/bench/trace/pickDerive.ts — derive semantic Pick[] from rolls + zone diff

import type { GameState, Player } from "../../core/types/index.js";
import type { RawRoll } from "./types.js";
import type { Pick } from "./types.js";
import { getHand, getDeck } from "../../core/playerHelpers.js";

/** Cards that moved deck → hand during the action, per player, in draw order. */
export function computeDrawPicks(before: GameState, after: GameState): Pick[] {
  const picks: Pick[] = [];
  for (const player of ["first", "second"] as const) {
    const beforeDeckUids = new Set(getDeck(before, player).map((c) => c.uid));
    const beforeHandUids = new Set(getHand(before, player).map((c) => c.uid));
    for (const card of getHand(after, player)) {
      if (!card?.uid || beforeHandUids.has(card.uid)) continue;
      if (beforeDeckUids.has(card.uid)) {
        picks.push({ what: "draw", chose: String(card.id) });
      }
    }
  }
  return picks;
}

function isCardChose(chose: unknown): chose is {
  uid: string;
  card: string;
  zone: string;
} {
  return (
    chose != null &&
    typeof chose === "object" &&
    "card" in (chose as object) &&
    "uid" in (chose as object)
  );
}

function findBoardSlot(
  state: GameState,
  uid: string,
): { player: Player; slot: number } | null {
  for (const p of ["first", "second"] as const) {
    const board = state.players[p].board;
    const idx = board.findIndex((c) => c?.uid === uid);
    if (idx >= 0) return { player: p, slot: idx };
  }
  return null;
}

function classifyPickRoll(
  roll: RawRoll,
  before: GameState,
  activePlayer: Player,
): Pick | null {
  if (roll.m === "nextFloat") return null;

  if (roll.m === "shuffle") return null;

  if (roll.m === "nextInt") {
    if (roll.site.includes("random_split.ts")) {
      return null; // handled by group
    }
    return { what: "raw", site: roll.site, n: roll.n, k: roll.k };
  }

  if (roll.m !== "pick") return null;

  const chose = roll.chose;

  if (chose != null && typeof chose === "object" && "mode" in chose) {
    const mode = (chose as { mode: number }).mode;
    if (roll.site.includes("mode.ts")) {
      return { what: "random_unused", chose: { mode } };
    }
  }

  if (isCardChose(chose)) {
    const uid = chose.uid;
    const cardId = chose.card;
    const zone = chose.zone;

    if (roll.site.includes("reanimate.ts")) {
      return { what: "reanimate", chose: cardId };
    }

    const loc = findBoardSlot(before, uid);
    if (loc || zone === "board") {
      const slotInfo = loc ?? findBoardSlot(before, uid);
      if (slotInfo) {
        const among =
          slotInfo.player !== activePlayer
            ? "enemy_followers"
            : "ally_followers";
        return {
          what: "random_target",
          among,
          chose: { slot: slotInfo.slot },
        };
      }
    }

    if (zone === "hand" || zone === "deck" || zone === "graveyard") {
      if (
        roll.site.includes("draw/") ||
        roll.site.includes("targeted/") ||
        roll.site.includes("transform.ts")
      ) {
        return { what: "random_card", chose: cardId };
      }
      return {
        what: "multiset_pick",
        among: zone === "graveyard" ? "cemetery" : zone,
        chose: cardId,
      };
    }

    const boardLoc = findBoardSlot(before, uid);
    if (boardLoc) {
      return {
        what: "random_target",
        chose: { slot: boardLoc.slot },
      };
    }

    return { what: "random_card", chose: cardId };
  }

  if (typeof chose === "string" || typeof chose === "number") {
    return null;
  }

  return null;
}

function groupRandomSplit(rolls: RawRoll[]): Pick[] {
  const picks: Pick[] = [];
  let i = 0;
  while (i < rolls.length) {
    const roll = rolls[i]!;
    if (roll.m === "nextInt" && roll.site.includes("random_split.ts")) {
      const k = roll.k;
      const counts = new Array(k).fill(0);
      let j = i;
      while (j < rolls.length) {
        const r = rolls[j]!;
        if (r.m !== "nextInt" || !r.site.includes("random_split.ts")) break;
        if (r.k !== k) break;
        counts[r.n] = (counts[r.n] ?? 0) + 1;
        j++;
      }
      if (j > i) {
        picks.push({ what: "random_split", chose: counts });
        i = j;
        continue;
      }
    }
    i++;
  }
  return picks;
}

export function derivePicks(
  rolls: RawRoll[],
  before: GameState,
  after: GameState,
): Pick[] {
  const draws = computeDrawPicks(before, after);
  const splitPicks = groupRandomSplit(rolls);
  const active = before.activePlayer;
  const semantic: Pick[] = [];

  const splitConsumed = new Set<number>();
  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i]!;
    if (roll.m === "nextInt" && roll.site.includes("random_split.ts")) {
      splitConsumed.add(i);
    }
  }

  for (let i = 0; i < rolls.length; i++) {
    if (splitConsumed.has(i)) continue;
    const roll = rolls[i]!;
    const pick = classifyPickRoll(roll, before, active);
    if (pick) semantic.push(pick);
  }

  return [...draws, ...splitPicks, ...semantic];
}
