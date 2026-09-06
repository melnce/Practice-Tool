/**
 * Faith crest bootstrap — scan starting deck/hand for Faith packages
 * (DotGG specific_effect_type: 4) and grant the matching crest.
 *
 * Extends the Sham-Nacha-only path in startGame: any card that carries a Faith
 * specific_effect bootstraps `Faith: <card name>` with an increment trigger
 * derived from the printed skill_text (Modes / evolve / Enhanced play /
 * Crystalspawn enter / amulet destroy).
 */

import type { CardInstance, Effect, Player } from "../../core/types/index.js";
import type { CrestTrigger } from "../effects/crest.js";
import { runEffects } from "../core/effects/index.js";

export const FAITH_EFFECT_TYPE = 4;
export const FAITH_IMAGE = "images/crests/faith.png";
export const FAITH_COUNTER = "faith";

export type FaithIncrementKind =
  | "select_mode"
  | "ally_evolve"
  | "enhanced_play"
  | "crystalspawn_enter"
  | "ally_amulet_destroyed";

export interface FaithPackage {
  crestName: string;
  sourceCardName: string;
  sourceCardId: string;
  description: string;
  increment: FaithIncrementKind;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<hr\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Infer Faith increment event from DotGG / bible skill_text. */
export function inferFaithIncrement(skillText: string): FaithIncrementKind {
  const plain = stripHtml(skillText).toLowerCase();

  if (plain.includes("select") && plain.includes("mode")) {
    return "select_mode";
  }
  if (plain.includes("enhanced")) {
    return "enhanced_play";
  }
  if (plain.includes("crystalspawn") && plain.includes("enters")) {
    return "crystalspawn_enter";
  }
  if (plain.includes("amulet") && plain.includes("destroyed")) {
    return "ally_amulet_destroyed";
  }
  if (plain.includes("evolves") || plain.includes("evolve")) {
    return "ally_evolve";
  }

  // Safe default matching Sham-Nacha / Modes Faith
  return "select_mode";
}

export function faithCrestNameForCard(cardName: string): string {
  return `Faith: ${cardName}`;
}

function findFaithSpecificEffect(
  card: CardInstance,
): { skill_text?: string; name?: string } | null {
  for (const raw of asArray<Record<string, unknown>>(
    (card as any).specific_effects,
  )) {
    if (Number(raw?.specific_effect_type) === FAITH_EFFECT_TYPE) {
      return raw as { skill_text?: string; name?: string };
    }
  }
  return null;
}

/** Collect unique Faith packages from a player's starting deck + hand. */
export function collectFaithPackages(
  deck: CardInstance[],
  hand: CardInstance[],
): FaithPackage[] {
  const seen = new Set<string>();
  const out: FaithPackage[] = [];

  for (const card of [...(deck || []), ...(hand || [])]) {
    if (!card) continue;
    const se = findFaithSpecificEffect(card);
    if (!se) continue;

    const crestName = faithCrestNameForCard(String(card.name));
    if (seen.has(crestName)) continue;
    seen.add(crestName);

    const skill = String(se.skill_text || "");
    const increment = inferFaithIncrement(skill);
    const plain = stripHtml(skill);
    const description =
      plain ||
      "Faith starts at 0. Increase Faith when the printed Faith condition occurs.";

    out.push({
      crestName,
      sourceCardName: String(card.name),
      sourceCardId: String(card.id || ""),
      description,
      increment,
    });
  }

  return out;
}

function incrementTrigger(
  pkg: FaithPackage,
): CrestTrigger & { event: string; condition?: Record<string, unknown> } {
  const addCounter: Effect = {
    op: "crest",
    action: "add_counter",
    crest: pkg.crestName,
    counter: FAITH_COUNTER,
    amount: 1,
  } as Effect;

  switch (pkg.increment) {
    case "select_mode":
      return {
        event: "select_mode",
        condition: { own_turn: true },
        effects: [addCounter],
      };
    case "ally_evolve":
      return {
        event: "ally_evolve",
        effects: [addCounter],
      };
    case "enhanced_play":
      return {
        event: "enhanced_play",
        effects: [addCounter],
      };
    case "crystalspawn_enter":
      return {
        event: "ally_follower_enter",
        condition: { name: "Crystalspawn" },
        effects: [addCounter],
      };
    case "ally_amulet_destroyed":
      return {
        event: "ally_amulet_destroyed",
        effects: [addCounter],
      };
  }
}

export function buildFaithGainEffect(pkg: FaithPackage): Effect {
  return {
    op: "crest",
    action: "gain",
    name: pkg.crestName,
    image: FAITH_IMAGE,
    description: pkg.description,
    is_faith: true,
    triggers: [incrementTrigger(pkg)],
  } as Effect;
}

/** Grant all Faith crests implied by deck/hand for one player. */
export function bootstrapFaithForPlayer(
  owner: Player,
  deck: CardInstance[],
  hand: CardInstance[],
): FaithPackage[] {
  const packages = collectFaithPackages(deck, hand);
  for (const pkg of packages) {
    runEffects([buildFaithGainEffect(pkg)], owner, null, {
      targets: [],
      targetUids: [],
    });
  }
  return packages;
}
