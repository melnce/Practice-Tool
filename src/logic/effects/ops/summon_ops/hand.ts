import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";

import { fireTrigger } from "../../../core/triggers.js";
import { applyKeywordsFromList } from "../../../core/keywords.js";
import { adapter } from "../../../../core/adapter.js";
import { CardInstance, Effect, Player } from "../../../../core/types.js";
import { highlightSelectable } from "../../../core/targeting.js"; // Targeting is external
import { initAmulet } from "./init.js";
import { pushToBoard } from "./core.js";
import { getEffectiveCost, nextId } from "./utils.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";

// =============== Hand Operations ===============

export function filterArtifactFollowersHand(owner: Player, maxCost: number) {
  const hand = owner === "blue" ? state.blueHand : state.redHand;
  return hand.filter(
    (c) =>
      c?.type === "Follower" &&
      Array.isArray(c?.tribes) &&
      c.tribes.includes("Artifact") &&
      getEffectiveCost(c) <= (maxCost ?? 999),
  );
}

export function summonFromHand(card: CardInstance, owner: Player): boolean {
  if (!card) return false;

  const hand = owner === "blue" ? state.blueHand : state.redHand;
  const board = owner === "blue" ? state.blueBoard : state.redBoard;

  // Must be in hand to be summoned from hand
  const idx = hand.indexOf(card);
  if (idx === -1) {
    console.warn("summonFromHand: Card not found in owner's hand", card.name);
    return false;
  }

  // Verify board space
  if (board.length >= 5) {
    console.warn("summonFromHand: Board is full");
    return false;
  }

  // Remove from hand
  hand.splice(idx, 1);

  // Update state to be 'board'
  card.zone = "board";
  card.selected = false;
  card.selectable = false;
  card.glow = false;

  // Initialize as if played/summoned
  if (card.type === "Follower") {
    // Ensure stats are numbers
    card.attack = parseInt(card.attack as any) || 0;
    card.defense = parseInt(card.defense as any) || 0;

    if (card.base_attack == null) card.base_attack = card.attack;
    if (card.base_defense == null) card.base_defense = card.defense;
    if (card.peak_defense == null) card.peak_defense = card.defense;

    // Apply keywords
    applyKeywordsFromList(card);

    // Turn state
    card.justPlayed = true;
    card.hasAttacked = false;
    card.attacks_per_turn = Number.isFinite(card.attacks_per_turn)
      ? card.attacks_per_turn!
      : 1;
    card.attacks_left = card.attacks_per_turn;

    // Combat flags
    if (card.hasStorm) {
      card.can_attack = true;
      card.can_attack_followers = true;
      card.isRush = false;
    } else if (card.hasRush) {
      card.can_attack = true;
      card.can_attack_followers = true;
      card.isRush = true;
    } else {
      card.can_attack = false;
      card.isRush = false;
      card.can_attack_followers = false;
    }
  } else if (card.type === "Amulet") {
    initAmulet(card);
  }

  if (pushToBoard(board, owner, card)) {
    logEvent("summonFromHand", { owner, card: card.name, uid: card.uid });
    if (state.lastSummoned) {
      state.lastSummoned.length = 0;
      state.lastSummoned.push(card);
    }
    adapter.render();
    return true;
  }

  return false;
}

export function summonExactCopyFromHand(
  srcCard: CardInstance,
  owner: Player,
  position = "right",
) {
  if (!srcCard) return null;

  // Deep clone the current hand object (keeps buffs/keywords/cost mods, etc.)
  const clone: CardInstance =
    typeof structuredClone === "function"
      ? structuredClone(srcCard)
      : JSON.parse(JSON.stringify(srcCard));

  // Normalize instance/placement fields
  clone.id = nextId();
  clone.zone = "board";
  clone.owner = owner;
  clone.selected = false;
  clone.selectable = false;
  clone.glow = false;

  // Ensure arrays exist
  clone.triggers = Array.isArray(clone.triggers) ? clone.triggers : [];
  clone.keywords = Array.isArray(clone.keywords) ? clone.keywords : [];
  clone.buffs = clone.buffs || {}; // keep object shape used elsewhere

  // --- Follower init (this is what was missing) ---
  if (clone.type === "Follower") {
    // Numbers
    clone.attack = parseInt(clone.attack as any) || 0;
    clone.defense = parseInt(clone.defense as any) || 0;

    // Base/peak
    if (clone.base_attack == null) clone.base_attack = clone.attack;
    if (clone.base_defense == null) clone.base_defense = clone.defense;
    if (clone.peak_defense == null) clone.peak_defense = clone.defense;

    // Apply keyword flags (sets hasRush/hasStorm/etc.) from the cloned keywords list
    applyKeywordsFromList(clone);

    // Turn-state
    clone.justPlayed = true;
    clone.hasAttacked = false;
    clone.attacks_per_turn = Number.isFinite(clone.attacks_per_turn)
      ? clone.attacks_per_turn!
      : 1;
    clone.attacks_left = clone.attacks_per_turn;

    // Combat flags
    if (clone.hasStorm) {
      clone.can_attack = true; // leaders & followers
      clone.isRush = false;
      clone.can_attack_followers = true;
    } else if (clone.hasRush) {
      clone.can_attack = true; // followers this turn
      clone.isRush = true;
      clone.can_attack_followers = true;
    } else {
      clone.can_attack = false;
      clone.isRush = false;
      clone.can_attack_followers = false;
    }
  }

  // Place on board (respect space)
  const board = owner === "blue" ? state.blueBoard : state.redBoard;
  if (!Array.isArray(board) || board.length >= 5) return null;

  if (position === "left") board.unshift(clone);
  else board.push(clone);

  logEvent("summonExactCopy", { owner, from: srcCard.name, uid: clone.uid });
  // Track last summoned
  if (state.lastSummoned) {
    state.lastSummoned.length = 0;
    state.lastSummoned.push(clone);
  }

  // Fire follower-enter hooks exactly like other summon paths
  if (clone.type === "Follower") {
    // medicalAssassinOnFollowerEnter(owner, clone);      // consistency with pushToBoard
    fireTrigger("ally_follower_enter", owner, { enteringCard: clone });
    fireTrigger("enemy_follower_enter", owner, { enteringCard: clone });
    // Ensure effect-based summons also trigger the Congregrant chain
    // handleCongregantOnEnter(owner, clone);
  }

  return clone;
}

export function handleSelectHandSummonArtifactCopy(
  eff: Effect,
  owner: Player,
  effectsQueue: any,
) {
  const maxCost = Number((eff as any).max_cost ?? 5);
  const hand = owner === "blue" ? state.blueHand : state.redHand;

  const pool = (hand || []).filter((c) => {
    if (!c || c.type !== "Follower") return false;
    const tribes = Array.isArray(c.tribes)
      ? c.tribes.map((t) => String(t).toLowerCase())
      : [];
    if (!tribes.includes("artifact")) return false;
    const base = parseInt(c?.cost as any, 10) || 0;
    const mod = parseInt(c?.cost_mod as any, 10) || 0;
    const effCost: number = Number.isFinite((c as any).effectiveCost)
      ? (c as any).effectiveCost
      : base + mod;
    return effCost <= maxCost;
  });

  if (!pool.length) return;

  setPendingTarget({
    eff: { ...eff, op: "select_hand_summon_artifact_copy" } as any, // resolved in resolveTarget.js
    owner,
    sourceCard: null,
    resumeEffects: effectsQueue,
    pool,
    targets: [],
    // ← respect JSON-specified select count
    selectCount: Math.max(
      1,
      parseInt((eff.select ?? (eff as any).select_count ?? 1) as any, 10),
    ),
    // optional: let user confirm multi-selects (shows the confirm button)
    requiresConfirmation: parseInt((eff.select ?? 1) as any, 10) > 1,
  });

  highlightSelectable(pool);
  return "pending";
}

export function handleSelectHandSummonArtifactCopiesEOT(
  eff: Effect,
  owner: Player,
  effectsQueue: any,
) {
  const maxCost = Number((eff as any).max_cost ?? 5);
  const hand = owner === "blue" ? state.blueHand : state.redHand;

  const pool = (hand || []).filter((c) => {
    if (!c || c.type !== "Follower") return false;
    const tribes = Array.isArray(c.tribes)
      ? c.tribes.map((t) => String(t).toLowerCase())
      : [];
    if (!tribes.includes("artifact")) return false;
    return getEffectiveCost(c) <= maxCost;
  });

  if (!pool.length) return;

  setPendingTarget({
    eff: {
      ...eff,
      op: "select_hand_summon_artifact_copies_eot_destroy",
    } as any,
    owner,
    sourceCard: null,
    resumeEffects: effectsQueue,
    pool,
    targets: [],
    selectCount: Math.max(
      1,
      parseInt((eff.select ?? (eff as any).select_count ?? 2) as any, 10),
    ),
  });
  highlightSelectable(pool);
  return "pending";
}
