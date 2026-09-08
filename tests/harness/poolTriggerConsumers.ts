import { readFileSync } from "node:fs";
import { join } from "node:path";

export type TriggerConsumerSource = "hand" | "board" | "deck";

export type TriggerConsumerCounts = Record<
  TriggerConsumerSource,
  { count: number; cardIds: string[] }
>;

const CARD_FILES = [
  join(process.cwd(), "cards/all.json"),
  join(process.cwd(), "cards/token_details.json"),
];

function loadPoolCards(): Array<{
  id?: string;
  card_id?: string;
  triggers?: unknown[];
}> {
  const cards: Array<{ id?: string; card_id?: string; triggers?: unknown[] }> =
    [];
  for (const file of CARD_FILES) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    cards.push(...(list as typeof cards));
  }
  return cards;
}

function cardId(card: { id?: string; card_id?: string }): string {
  return String(card.id ?? card.card_id ?? "");
}

/** Count pool cards whose printed trigger listens to `event` from `source`. */
export function countPoolTriggerConsumers(
  event: string,
  source: TriggerConsumerSource,
  cards = loadPoolCards(),
): TriggerConsumerCounts {
  const result: TriggerConsumerCounts = {
    hand: { count: 0, cardIds: [] },
    board: { count: 0, cardIds: [] },
    deck: { count: 0, cardIds: [] },
  };
  for (const card of cards) {
    const id = cardId(card);
    if (!id) continue;
    for (const trigger of card.triggers ?? []) {
      const t = trigger as { event?: string; source?: string };
      if (t.event !== event) continue;
      const src = t.source as TriggerConsumerSource | undefined;
      if (!src || result[src] === undefined) continue;
      result[src].count += 1;
      result[src].cardIds.push(id);
    }
  }
  for (const src of Object.keys(result) as TriggerConsumerSource[]) {
    result[src].cardIds.sort();
  }
  return result;
}

/** Pinned counts for reactive-timing matrix skip gates (904-card pool). */
export const PINNED_POOL_TRIGGER_CONSUMER_COUNTS: Record<
  string,
  Record<TriggerConsumerSource, number>
> = {
  ally_draw: { hand: 0, board: 2, deck: 0 },
  ally_spell_played: { hand: 0, board: 5, deck: 0 },
  leader_damaged: { hand: 0, board: 0, deck: 0 },
  ally_earth_rite: { hand: 2, board: 0, deck: 0 },
  ally_super_evolve: { hand: 5, board: 1, deck: 0 },
  on_fuse: { hand: 1, board: 1, deck: 0 },
  loot_fused: { hand: 0, board: 1, deck: 0 },
  loot_played: { hand: 0, board: 1, deck: 0 },
  ally_ward_destroyed: { hand: 0, board: 1, deck: 0 },
  ally_amulet_destroyed: { hand: 0, board: 1, deck: 0 },
  ally_follower_leaves_field: { hand: 1, board: 0, deck: 0 },
  enemy_follower_leaves_field: { hand: 0, board: 0, deck: 0 },
  ally_follower_destroyed: { hand: 0, board: 1, deck: 0 },
  enemy_follower_destroyed: { hand: 0, board: 1, deck: 0 },
  invoke: { hand: 0, board: 0, deck: 0 },
  engage: { hand: 1, board: 3, deck: 0 },
};
