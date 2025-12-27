import type { CardInstance, GameState } from "../../core/types/index.js";
import type { ZoneContext, CardViewModel } from "./types.js";
import { previewHandStats } from "../../helpers/enhance.js";
import { computeHandGlow } from "../helpers/glow.js";

const SPELLBOOST_KEYS = [
  "spellboostCount",
  "spellBoostCount",
  "spellboosts",
  "spell_boosts",
  "spellboost_counter",
] as const;

function getSpellboostCount(card: CardInstance): number | null {
  if (!card) return null;

  const keywords = (card.keywords || []) as Array<string | { name: string }>;
  const hasSpellboost = keywords.some((k) => {
    const name = typeof k === "string" ? k : k?.name;
    return name?.toLowerCase() === "spellboost";
  });

  if (!hasSpellboost) return null;

  for (const key of SPELLBOOST_KEYS) {
    if (key in card) {
      const val = (card as Record<string, unknown>)[key];
      if (typeof val === "number") {
        return val;
      }
      if (typeof val === "string" && Number.isFinite(Number(val))) {
        return Number(val);
      }
    }
  }
  return 0;
}

interface TierPreview {
  shownCost?: number;
  atkDisp?: number;
  defDisp?: number;
  tier?: { cost: number; effects?: unknown[] };
}

export function createCardViewModel(
  card: CardInstance,
  idx: number,
  ctx: ZoneContext,
  state: GameState,
): CardViewModel {
  const isFollower = card.type === "Follower";
  const isSpell = card.type === "Spell";
  const isBlue = ctx.owner === "first";

  const availablePP = ctx.isHand
    ? ctx.isBlueHand
      ? state.players.first.pp
      : state.players.second.pp
    : 0;

  let shownCost = Number(card.cost) || 0;
  let atkDisp = Math.max(0, Number(card.attack) || 0);
  let defDisp = Number(card.defense) || 0;

  let tier: { cost: number; effects?: unknown[] } | null = null;

  if (ctx.isHand) {
    // Explicitly cast the result of previewHandStats to expected shape
    const preview = previewHandStats(card, availablePP) as TierPreview;

    shownCost = Number(preview.shownCost) || 0;
    atkDisp = Number(preview.atkDisp) || 0;
    defDisp = Number(preview.defDisp) || 0;

    if (preview.tier) {
      tier = preview.tier;
    }

    if (!tier) {
      const handMod = Number(card.cost_mod) || 0;
      shownCost = Math.max(0, shownCost + handMod);
    }
  }

  // Glow Logic
  let glowClass: string | undefined;
  if (!ctx.isBoard) {
    // Fix: Use activePlayer for strictness, avoids boolean desync
    const isPlayersTurn = ctx.owner === state.activePlayer;

    // Debug Log (remove later if spammy, but needed for bug)
    // if (card.name === "Test") console.log("[VM] Glow Check:", { owner: ctx.owner, active: state.activePlayer, isPlayersTurn });
    const { glowClass: gc } = computeHandGlow(card, {
      state,
      owner: ctx.owner,
      isPlayersTurn,
      availablePP,
      isSpell,
      tier,
      shownCost,
    });
    glowClass = gc || undefined;
  }

  // Stat colors (Follower only)
  let isDamaged = false;
  let isBuffed = false;
  let isDebuffed = false;
  let isAtkBuffed = false;
  let isAtkDebuffed = false;
  let isDefBuffed = false;

  if (isFollower) {
    const buffs = card.buffs || { attack: 0, defense: 0 };
    const buffAtk = Number(buffs.attack) || 0;
    const buffDef = Number(buffs.defense) || 0;

    if (ctx.isHand) {
      isAtkBuffed = buffAtk > 0;
      isAtkDebuffed = buffAtk < 0;
      isDefBuffed = buffDef > 0;
    } else {
      const baseAttack =
        card.base_attack != null
          ? Number(card.base_attack)
          : Number(card.attack) || 0;
      const baseDefense =
        card.base_defense != null
          ? Number(card.base_defense)
          : Number(card.defense) || 0;

      if (atkDisp > baseAttack) isAtkBuffed = true;
      if (atkDisp < baseAttack) isAtkDebuffed = true;

      const maxHP = baseDefense + buffDef;
      isDamaged = defDisp < maxHP;

      if (!isDamaged && defDisp > baseDefense) isDefBuffed = true;
    }

    isBuffed = isAtkBuffed || isDefBuffed;
    isDebuffed = isAtkDebuffed;
  }

  // Interaction Flags
  let canAttack = false;
  let isRush = false;

  // Strict checks for board interaction
  const isMyBoard =
    (ctx.containerId === "blueBoard" && isBlue) ||
    (ctx.containerId === "redBoard" && !isBlue);
  // Explicit turn check using activePlayer to fix "glow on opponent turn" for board units
  const isMyTurn = ctx.owner === state.activePlayer;

  if (
    ctx.isBoard &&
    isFollower &&
    card.can_attack &&
    !card.hasAttacked &&
    isMyBoard &&
    isMyTurn
  ) {
    const ks = card.keywordState || {};
    const hasCantAttack = !!(
      ks.cantAttack ||
      ks.cantAttackFollowers ||
      ks.cantAttackLeaders ||
      ks.hasCantAttack
    );
    if (!hasCantAttack) {
      canAttack = true;
      if (card.isRush && card.justPlayed) isRush = true;
    }
  }

  // Engage Logic
  let canEngage = false;
  let engageCost = 0;

  if (card.type === "Amulet") {
    engageCost = Number(card.keywordState?.engageCost ?? card.engageCost ?? 0);
    if (!ctx.isMulligan && ctx.isBoard && card.hasEngage) {
      const ks = card.keywordState;
      const enoughPP = isBlue
        ? state.players.first.pp >= engageCost
        : state.players.second.pp >= engageCost;
      const oncePerTurn = card.engageOncePerTurn !== false;
      const alreadyEngaged = !!ks?.engagedThisTurn;
      const readyThisTurn = !oncePerTurn || !alreadyEngaged;
      // Use activePlayer as source of truth
      const isFirstActive = state.activePlayer === "first";
      const isMyTurn = (isBlue && isFirstActive) || (!isBlue && !isFirstActive);

      canEngage = isMyTurn && enoughPP && readyThisTurn;
    }
  }

  // Selection
  let isSelected = false;
  if (ctx.isMulligan && card.__mulliganSelected) {
    isSelected = true;
  } else if (!ctx.isMulligan) {
    // Check if card is in pending targets - check both object refs and UIDs for compatibility
    const targets = state.pendingTargetEffect?.targets;
    const targetUids = state.pendingTargetEffect?.targetUids;

    if (
      Array.isArray(targets) &&
      targets.some((t: { uid?: string }) => t?.uid === card.uid)
    ) {
      isSelected = true;
    } else if (
      Array.isArray(targetUids) &&
      targetUids.includes(card.uid)
    ) {
      isSelected = true;
    }
  }

  return {
    card,
    idx,
    uid: card.uid,
    shownCost,
    atkDisp,
    defDisp,
    glowClass,
    isDamaged,
    isBuffed,
    isDebuffed,
    isAtkBuffed,
    isAtkDebuffed,
    isDefBuffed,
    isEvo: !!card.hasEvolved,
    isSuperEvo: !!(card.hasEvolved && card.evoType === "super"),
    isSpell,
    hasWard: !!card.hasWard,
    spellboostCount: getSpellboostCount(card),
    countdown:
      card.hasCountdown && Number.isFinite(Number(card.countdown))
        ? Number(card.countdown)
        : null,
    icarusBuff: card.__icarusBuff,
    canAttack,
    isRush,
    canEngage,
    engageCost,
    isSelected,
    isSelectable: ctx.isMulligan
      ? !!card.__mulliganSelectable
      : !!card.__uiSelectable,
    isMulliganSelected: !!card.__mulliganSelected,
  };
}














