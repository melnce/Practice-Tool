// Shared FUSE player-action routine (engine + core dispatch entrypoints).
import { state } from "../../core/gameState.js";
import type { Player, CardInstance } from "../../core/types/index.js";
import { getHand } from "../../core/playerHelpers.js";
import { doAction } from "../../core/history.js";
import { runEffects } from "./effects/index.js";
import { startFuseFromHand } from "../index.js";
import {
  alreadyFusedThisTurn,
  hasFuseCardsCapability,
  handOf,
} from "../effects/ops/fuse/types.js";

function hasFuseRecipes(card: CardInstance): boolean {
  return Array.isArray(card.fuse_recipes) && card.fuse_recipes.length > 0;
}

function hasSpecialFuse(card: CardInstance): boolean {
  return (
    card.name === "Gear of Ambition" ||
    card.name === "Gear of Remembrance" ||
    card.name === "Ominous Artifact α"
  );
}

function hasFortifierFuse(card: CardInstance): boolean {
  return (
    Array.isArray(card.fuse) &&
    card.fuse.some((op) => op?.op === "fuse" && op?.type === "fortifier")
  );
}

function usesRecipePickerPath(card: CardInstance): boolean {
  return (
    hasFuseRecipes(card) || hasSpecialFuse(card) || hasFuseCardsCapability(card)
  );
}

function filterByPartnerFilters(
  candidates: CardInstance[],
  filters: any[] = [],
): CardInstance[] {
  if (!Array.isArray(filters) || filters.length === 0) return candidates;

  const pass = (c: CardInstance, f: any) => {
    if (f.zone && f.zone !== "hand") return false;
    const cType = String(c?.type || "").toLowerCase();
    const cClass = String(c?.class || "").toLowerCase();
    const wantType = String(f.type ?? f.type_eq ?? "").toLowerCase();
    const wantClass = String(f.class ?? f.class_eq ?? "").toLowerCase();
    if (wantType && cType !== wantType) return false;
    if (wantClass && cClass !== wantClass) return false;
    if (Array.isArray(f.name_in) && !f.name_in.includes(c.name)) return false;
    if (f.tribe && !(Array.isArray(c.tribes) && c.tribes.includes(f.tribe)))
      return false;
    return true;
  };

  return candidates.filter((c) => filters.some((f) => pass(c, f)));
}

function hasRecipePartners(owner: Player, initiator: CardInstance): boolean {
  if (hasFuseCardsCapability(initiator)) {
    return handOf(owner).some((c) => c?.uid !== initiator.uid);
  }
  if (
    initiator.name === "Gear of Ambition" ||
    initiator.name === "Gear of Remembrance"
  ) {
    return handOf(owner).some(
      (c) =>
        c.uid !== initiator.uid &&
        (c?.name === "Gear of Ambition" || c?.name === "Gear of Remembrance"),
    );
  }
  if (initiator.name === "Ominous Artifact α") {
    const needsBeta = !initiator.fusedArtifacts?.beta;
    const needsGamma = !initiator.fusedArtifacts?.gamma;
    return handOf(owner).some(
      (c) =>
        c.uid !== initiator.uid &&
        ((c.name === "Ominous Artifact β" && needsBeta) ||
          (c.name === "Ominous Artifact γ" && needsGamma)),
    );
  }
  const recipes = initiator.fuse_recipes;
  if (!Array.isArray(recipes) || recipes.length === 0) return false;
  const hand = handOf(owner).filter((c) => c?.uid !== initiator.uid);
  for (const r of recipes) {
    const pool = filterByPartnerFilters(hand, r.partner_filters);
    if (pool.length) return true;
  }
  return false;
}

function hasFortifierPartners(owner: Player, initiator: CardInstance): boolean {
  return handOf(owner).some(
    (c) =>
      c?.uid !== initiator?.uid &&
      Array.isArray(c?.tribes) &&
      c.tribes.some((t) => String(t).toLowerCase() === "artifact"),
  );
}

/** Whether the owner may initiate fuse on this hand card (matches UI fuse affordance). */
export function canFuse(player: Player, cardUid: string): boolean {
  if (state.activePlayer !== player) return false;
  if (state.phase !== "main" && state.phase !== "playing") return false;

  const hand = getHand(state, player);
  const card = hand.find((c) => c?.uid === cardUid);
  if (!card) return false;
  if (alreadyFusedThisTurn(card)) return false;

  if (usesRecipePickerPath(card)) return hasRecipePartners(player, card);
  if (hasFortifierFuse(card)) return hasFortifierPartners(player, card);
  return false;
}

/** Apply fuse from hand — same routing as UI handleFuse, with fortifier wrapped in history. */
export function fuseFromHand(
  player: Player,
  cardUid: string,
  options: { autoRender?: boolean } = {},
): void {
  const hand = getHand(state, player);
  const card = hand.find((c) => c?.uid === cardUid);
  const meta = { player, uid: cardUid, name: card?.name };
  const autoRender = options.autoRender ?? true;

  if (!card || usesRecipePickerPath(card)) {
    doAction(
      "Fuse",
      () => {
        startFuseFromHand(player, cardUid);
      },
      meta,
      { autoRender },
    );
    return;
  }

  if (hasFortifierFuse(card)) {
    doAction(
      "Fuse",
      () => {
        runEffects(
          [{ op: "fuse", type: "fortifier", initiator_uid: cardUid } as any],
          player,
          card,
        );
      },
      meta,
      { autoRender },
    );
  }
}
