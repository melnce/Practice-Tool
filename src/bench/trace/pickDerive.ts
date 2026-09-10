// src/bench/trace/pickDerive.ts — derive semantic Pick[] from rolls + zone diff

import type { GameState, Player } from "../../core/types/index.js";
import type { RawRoll } from "./types.js";
import type { Pick } from "./types.js";

function isCardChose(chose: unknown): chose is {
  uid: string;
  card: string;
  zone: string;
  slot?: number;
  owner?: Player;
} {
  return (
    chose != null &&
    typeof chose === "object" &&
    "card" in (chose as object) &&
    "uid" in (chose as object)
  );
}

function classifyPickRoll(
  roll: RawRoll,
  before: GameState,
  activePlayer: Player,
): Pick | null {
  if (roll.m === "nextFloat") return null;

  if (roll.m === "shuffle") return null;

  if (roll.m === "draw") {
    return { what: "draw", chose: roll.card };
  }

  if (roll.m === "deck_pick") {
    return { what: "multiset_pick", among: "deck", chose: roll.card };
  }

  if (roll.m === "nextInt") {
    if (roll.site.includes("random_split.ts")) {
      return null; // handled by group
    }
    if (/core\/utils\.ts:(38|39)/.test(roll.site)) {
      return {
        what: "raw",
        kind: "shuffle",
        site: roll.site,
        n: roll.n,
        k: roll.k,
      };
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
    const cardId = chose.card;
    const zone = chose.zone;

    if (roll.site.includes("reanimate.ts")) {
      return { what: "reanimate", chose: cardId };
    }

    if (zone === "board" && chose.slot != null) {
      const owner = chose.owner ?? activePlayer;
      const among =
        owner !== activePlayer ? "enemy_followers" : "ally_followers";
      return {
        what: "random_target",
        among,
        chose: { slot: chose.slot },
      };
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

    return { what: "random_card", chose: cardId };
  }

  if (typeof chose === "string" || typeof chose === "number") {
    return null;
  }

  return null;
}

function tryConsumeRandomSplit(
  rolls: RawRoll[],
  start: number,
): { pick: Pick; next: number } | null {
  const roll = rolls[start];
  if (!roll || roll.m !== "nextInt" || !roll.site.includes("random_split.ts")) {
    return null;
  }
  const k = roll.k;
  const counts = new Array(k).fill(0);
  let j = start;
  while (j < rolls.length) {
    const r = rolls[j]!;
    if (r.m !== "nextInt" || !r.site.includes("random_split.ts")) break;
    if (r.k !== k) break;
    counts[r.n] = (counts[r.n] ?? 0) + 1;
    j++;
  }
  if (j <= start) return null;
  return { pick: { what: "random_split", chose: counts }, next: j };
}

export function derivePicks(rolls: RawRoll[], before: GameState): Pick[] {
  const picks: Pick[] = [];
  const active = before.activePlayer;
  let i = 0;

  while (i < rolls.length) {
    const split = tryConsumeRandomSplit(rolls, i);
    if (split) {
      picks.push(split.pick);
      i = split.next;
      continue;
    }

    const roll = rolls[i]!;
    const pick = classifyPickRoll(roll, before, active);
    if (pick) picks.push(pick);
    i++;
  }

  return picks;
}
