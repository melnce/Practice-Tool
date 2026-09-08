// src/logic/effects/self.ts
import { logEvent } from "../../core/logger.js";
import type { CardInstance, Effect, Player } from "../../core/types/index.js";
import {
  applyStatBuff,
  applyKeywordBuff,
  applyAttacksPerTurnBuff,
  checkPostBuffTriggers,
} from "./ops/stat/core.js";
import { banishCard } from "./ops/banish/index.js";
import {
  recordTemporaryStatBuff,
  rejectStatOpponentTurnEndNumericDelta,
} from "./ops/stat/duration.js";
import {
  normalizeStatSpec,
  statOpHasKeywordOrAttacksGrant,
} from "./ops/stat/spec.js";
import type { StatOp } from "./ops/stat/types.js";

export function handleStatSelf(
  sourceCard: CardInstance,
  eff: Effect,
  owner: Player = sourceCard.owner ?? "first",
) {
  const statEff = eff as StatOp;
  const spec = normalizeStatSpec(statEff, { owner, sourceCard });
  const { attack: a, defense: d, duration } = spec;

  if (a === 0 && d === 0 && !statOpHasKeywordOrAttacksGrant(statEff)) return;

  if (a !== 0 || d !== 0) {
    logEvent("buffSelf", {
      card: sourceCard.name,
      uid: sourceCard.uid,
      attack: a,
      defense: d,
    });
  }

  if (a !== 0 || d !== 0) {
    rejectStatOpponentTurnEndNumericDelta(statEff, a, d, "self");
    applyStatBuff(sourceCard, a, d, owner);

    if (a > 0 || d > 0) {
      if (sourceCard.type === "Follower" && sourceCard.owner) {
        checkPostBuffTriggers(sourceCard, a, d, sourceCard.owner);
      }
    }

    recordTemporaryStatBuff(sourceCard, a, d, duration);
  }

  applyKeywordBuff(sourceCard, statEff, owner);
  applyAttacksPerTurnBuff(sourceCard, statEff, owner);
}

// Add this new function to clear temporary buffs
export function clearTemporaryBuffs(card: CardInstance) {
  if (card.temporaryBuffs && card.temporaryBuffs.length > 0) {
    logEvent("buffsCleared", { card: card.name, uid: card.uid });
    let totalAttack = 0;
    let totalDefense = 0;

    card.temporaryBuffs.forEach((buff: { attack: number; defense: number }) => {
      totalAttack += buff.attack;
      totalDefense += buff.defense;
    });

    if (card.buffs) {
      card.buffs.attack = Math.max(0, (card.buffs.attack ?? 0) - totalAttack);
      card.buffs.defense = Math.max(
        0,
        (card.buffs.defense ?? 0) - totalDefense,
      );
    }

    card.attack = (parseInt(String(card.attack)) || 0) - totalAttack;
    card.defense = Math.max(
      0,
      (parseInt(String(card.defense)) || 0) - totalDefense,
    );

    card.temporaryBuffs = [];
  }
}

export function handleDestroySelf(sourceCard: CardInstance) {
  logEvent("destroySelf", { card: sourceCard.name, uid: sourceCard.uid });
  sourceCard.defense = 0;
  (sourceCard as any).pendingDestruction = true;
}

export function handleBanishSelf(sourceCard: CardInstance, _owner: Player) {
  logEvent("banishSelf", { card: sourceCard.name, uid: sourceCard.uid });
  banishCard(sourceCard);
}
