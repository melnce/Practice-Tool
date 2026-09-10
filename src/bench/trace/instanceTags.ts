// src/bench/trace/instanceTags.ts — granted (runtime-only) and traits projection

import type { CardInstance } from "../../core/types/index.js";
import { getGlobalCardIndex } from "../../data/cardIndex.js";
import {
  initFollower,
  initAmulet,
} from "../../logic/effects/ops/summon_ops/init.js";

const ENGINE_EVENT_TO_SCHEMA: Record<string, string> = {
  strike: "strike",
  follower_strike: "followerStrike",
  followerStrike: "followerStrike",
  clash: "clash",
  enter: "enter",
  leave: "leave",
  discarded: "discarded",
  invoked: "invoked",
  fused: "fused",
  start_of_turn: "startOfTurn",
  end_of_turn: "endOfTurn",
  ally_follower_enter: "when",
  enemy_follower_enter: "when",
  when_drawn: "when",
};

function triggerTagsFromCard(card: CardInstance): Set<string> {
  const tags = new Set<string>();
  const ks = card.keywordState;

  if (ks?.hasFanfare || (card.fanfare && card.fanfare.length > 0)) {
    tags.add("fanfare");
  }
  if (
    card.hasLastWords ||
    (ks?.lastWordsEffects?.length ?? 0) > 0 ||
    (card.lastWordsEffects?.length ?? 0) > 0
  ) {
    tags.add("lastWords");
  }
  if (card.hasEngage || ks?.hasEngage) tags.add("engage");
  if (ks?.hasSpellboost) tags.add("spellboost");
  if (card.enhanceTiers && card.enhanceTiers.length > 0) tags.add("enhance");
  const evolveFx = card.evolve;
  if (
    (Array.isArray(evolveFx) && evolveFx.length > 0) ||
    (!Array.isArray(evolveFx) &&
      evolveFx &&
      Array.isArray(evolveFx.effects) &&
      evolveFx.effects.length > 0)
  ) {
    tags.add("evolve");
  }
  const superEvolve = (card as { superEvolve?: unknown }).superEvolve;
  if (Array.isArray(superEvolve) && superEvolve.length > 0) {
    tags.add("superEvolve");
  }

  const allTriggers = [...(ks?.triggers ?? []), ...(card.triggers ?? [])];
  for (const t of allTriggers) {
    const ev = String(t?.event ?? t?.type ?? "").trim();
    if (!ev) continue;
    const mapped = ENGINE_EVENT_TO_SCHEMA[ev];
    if (mapped) tags.add(mapped);
  }

  return tags;
}

function freshInstance(cardId: string): CardInstance | null {
  const template = getGlobalCardIndex()?.byId.get(cardId);
  if (!template) return null;
  const card: CardInstance = structuredClone(template);
  card.uid = `trace-printed-${cardId}`;
  card.owner = "first";
  if (card.type === "Follower") initFollower(card);
  else if (card.type === "Amulet") initAmulet(card);
  return card;
}

export function grantedTags(card: CardInstance): string[] | undefined {
  const instance = triggerTagsFromCard(card);
  const fresh = freshInstance(String(card.id));
  if (!fresh) {
    return instance.size > 0 ? [...instance].sort() : undefined;
  }
  const printed = triggerTagsFromCard(fresh);
  const granted = [...instance].filter((t) => !printed.has(t)).sort();
  return granted.length > 0 ? granted : undefined;
}

export function traitsTags(card: CardInstance): string[] {
  const ks = card.keywordState;
  const traits: string[] = [];
  const add = (name: string) => traits.push(name);

  if (card.hasAmbush) add("ambush");
  if (card.hasAura) add("aura");
  if (card.hasBane) add("bane");
  if (card.hasBarrier || ks?.hasBarrier) add("barrier");
  if (ks?.cantAttackFollowers) add("cantAttackFollowers");
  if (ks?.cantAttackLeaders) add("cantAttackLeader");
  if (ks?.cannotBeDestroyed) add("cantBeDestroyedByAbilities");
  if ((card as { cantBePlayed?: boolean }).cantBePlayed) add("cantBePlayed");
  if (card.hasDrain) add("drain");
  if (card.ignoresWard || ks?.ignoresWard) add("ignoresWard");
  if (card.hasIntimidate) add("intimidate");
  if (card.hasRush || card.isRush) add("rush");
  if (card.hasStorm) add("storm");
  if (card.hasWard) add("ward");

  return traits.sort();
}
