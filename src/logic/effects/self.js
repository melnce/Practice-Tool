import { state } from "@core/gameState.js";
import { applyKeyword } from "@logic/core/keywords.js";
import { handleBanish } from "@logic/effects/ops/banish.js";
import { resolveDestroy } from "@logic/effects/ops/destroy.js";
import { rand, makeUid } from "@core/rng.js";
import { logEvent } from "@core/logger.js";

export function handleBuffSelf(sourceCard, eff) {
  if (!sourceCard) return;
  const a = parseInt(eff.attack || 0) || 0;
  const d = parseInt(eff.defense || 0) || 0;

  if (a !== 0 || d !== 0) {
    logEvent("buffSelf", {
      card: sourceCard.name,
      uid: sourceCard.uid,
      attack: a,
      defense: d,
    });
  }

  // Ensure the buff tracking object exists
  if (!sourceCard.buffs) {
    sourceCard.buffs = { attack: 0, defense: 0 };
  }
  // Correctly track the buff amount
  sourceCard.buffs.attack += a;
  sourceCard.buffs.defense += d;

  // Update the card's current stats
  sourceCard.attack = (parseInt(sourceCard.attack) || 0) + a;
  sourceCard.defense = (parseInt(sourceCard.defense) || 0) + d;
  sourceCard.peak_defense = Math.max(
    sourceCard.peak_defense ?? sourceCard.defense,
    sourceCard.defense
  );

  // Track temporary buffs if specified
  if (eff.until_end_of_turn) {
    if (!sourceCard.temporaryBuffs) sourceCard.temporaryBuffs = [];
    sourceCard.temporaryBuffs.push({
      attack: a,
      defense: d,
      id: makeUid("buff_"),
    });
  }

  console.log(
    `%cAFTER BUFF SELF on ${sourceCard.name}:`,
    "color: cyan",
    {
      defense: sourceCard.defense,
      buffs: JSON.parse(JSON.stringify(sourceCard.buffs || null)),
    }
  );
}

// Add this new function to clear temporary buffs
export function clearTemporaryBuffs(card) {
  if (card.temporaryBuffs && card.temporaryBuffs.length > 0) {
    logEvent("buffsCleared", { card: card.name, uid: card.uid });
    let totalAttack = 0;
    let totalDefense = 0;

    // Calculate total temporary buffs
    card.temporaryBuffs.forEach((buff) => {
      totalAttack += buff.attack;
      totalDefense += buff.defense;
    });

    // Remove the temporary buffs from tracking
    if (card.buffs) {
      card.buffs.attack = Math.max(0, card.buffs.attack - totalAttack);
      card.buffs.defense = Math.max(0, card.buffs.defense - totalDefense);
    }

    // Update the card's stats
    card.attack = (parseInt(card.attack) || 0) - totalAttack;
    card.defense = Math.max(0, (parseInt(card.defense) || 0) - totalDefense);

    // Reset temporary buffs tracking
    card.temporaryBuffs = [];

    console.log(
      `%cCLEARED TEMPORARY BUFFS from ${card.name}:`,
      "color: orange",
      {
        attack: card.attack,
        defense: card.defense,
        buffs: JSON.parse(JSON.stringify(card.buffs || null)),
      }
    );
  }
}

/**
 * NEW: Applies a buff to the source card based on a dynamic game state value.
 */
export function handleDynamicBuffSelf(sourceCard, eff, owner) {
  if (!sourceCard || !owner) return;

  let a = parseInt(eff.attack || 0) || 0;
  let d = parseInt(eff.defense || 0) || 0;

  // Check for dynamic attack source
  if (eff.attack_source === "combo") {
    const combo =
      owner === "blue"
        ? state.bluePlaysThisTurn || 0
        : state.redPlaysThisTurn || 0;
    a += combo;
  }

  if (eff.attack_source === "count_in_hand" && eff.filter?.tribe) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const count = hand.filter(
      (c) => Array.isArray(c.tribes) && c.tribes.includes(eff.filter.tribe)
    ).length;
    a += count;
  }

  if (eff.attack_source === "count_allies") {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    // count followers excluding self if exclude_self is set
    const count = board.filter(
      (c) => c.type === "Follower" && (!eff.exclude_self || c.uid !== sourceCard.uid)
    ).length;
    a += count;
  }

  // Check for dynamic defense source - ADD THIS SECTION
  if (eff.defense_source === "combo") {
    const combo =
      owner === "blue"
        ? state.bluePlaysThisTurn || 0
        : state.redPlaysThisTurn || 0;
    d += combo;
  }

  if (eff.defense_source === "count_in_hand" && eff.filter?.tribe) {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const count = hand.filter(
      (c) => Array.isArray(c.tribes) && c.tribes.includes(eff.filter.tribe)
    ).length;
    d += count;
  }
  if (eff.defense_source === "count_allies") {
    const board = owner === "blue" ? state.blueBoard : state.redBoard;
    const count = board.filter(
      (c) => c.type === "Follower" && (!eff.exclude_self || c.uid !== sourceCard.uid)
    ).length;
    d += count;
  }

  if (a === 0 && d === 0) return; // No buff to apply

  logEvent("buffSelf", {
    card: sourceCard.name,
    uid: sourceCard.uid,
    attack: a,
    defense: d,
  });

  // Ensure the buff tracking object exists
  if (!sourceCard.buffs) {
    sourceCard.buffs = { attack: 0, defense: 0 };
  }

  // Track and apply the buff
  sourceCard.buffs.attack += a;
  sourceCard.buffs.defense += d;
  sourceCard.attack = (parseInt(sourceCard.attack) || 0) + a;
  sourceCard.defense = (parseInt(sourceCard.defense) || 0) + d;
  sourceCard.peak_defense = Math.max(
    sourceCard.peak_defense ?? sourceCard.defense,
    sourceCard.defense
  );

  // Track temporary buffs if specified
  if (eff.until_end_of_turn) {
    if (!sourceCard.temporaryBuffs) sourceCard.temporaryBuffs = [];
    sourceCard.temporaryBuffs.push({
      attack: a,
      defense: d,
      id: makeUid("buff_"),
    });
  }
}

export function handleDestroySelf(sourceCard) {
  if (sourceCard) {
    logEvent("destroySelf", { card: sourceCard?.name, uid: sourceCard?.uid });
    // Setting defense to 0 marks it for cleanup
    sourceCard.defense = 0;
  }
}

export function handleBanishSelf(sourceCard, owner) {
  if (sourceCard) {
    logEvent("banishSelf", { card: sourceCard?.name, uid: sourceCard?.uid });
    handleBanish(sourceCard, owner);
  }
}
