import { state } from "../../../../core/gameState.js";
import { logEvent } from "../../../../core/logger.js";

import { applyKeywordsFromList } from "../../../core/keywords.js";
import { recomputeAttackFlags } from "../../../core/combat.js";
import type {
  CardInstance,
  Effect,
  Player,
} from "../../../../core/types/index.js";
import { highlightSelectable } from "../../../core/targeting.js"; // Targeting is external
import { initAmulet } from "./init.js";
import { finishFollowerEnter, pushToBoard, boardHasRoom } from "./core.js";
import { stampBoardEntryTs } from "../../../core/triggers/utils.js";
import { getEffectiveCost } from "./utils.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";
import { getHand, getBoard } from "../../../../core/playerHelpers.js";

// =============== Hand Operations ===============

/** Parse select / select_count / boolean select for hand Artifact copy ops. */
function parseHandArtifactSelectCount(
  eff: Effect & Record<string, any>,
  defaultMax: number,
): number {
  const raw = eff.select ?? eff.select_count;
  if (raw === true) return 1;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n > 0) return n;
  return defaultMax;
}

export function filterArtifactFollowersHand(owner: Player, maxCost: number) {
  const hand = getHand(state, owner);
  return hand.filter(
    (c) =>
      c?.type === "Follower" &&
      Array.isArray(c?.tribes) &&
      c.tribes.includes("Artifact") &&
      getEffectiveCost(c) <= (maxCost ?? 999),
  );
}

export function summonFromHand(
  card: CardInstance,
  owner: Player,
  opts?: { deferEnter?: boolean },
): boolean {
  if (!card) return false;

  const hand = getHand(state, owner);
  const board = getBoard(state, owner);

  // Must be in hand to be summoned from hand
  const idx = hand.indexOf(card);
  if (idx === -1) {
    console.warn("summonFromHand: Card not found in owner's hand", card.name);
    return false;
  }

  // Verify board space (real cards, not null death placeholders)
  if (!boardHasRoom(board)) {
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
    if (card.hasStorm || card.hasRush) {
      card.can_attack_followers = true;
    } else {
      card.can_attack_followers = false;
    }
    recomputeAttackFlags(card);
  } else if (card.type === "Amulet") {
    initAmulet(card);
  }

  if (
    pushToBoard(
      board,
      owner,
      card,
      opts?.deferEnter ? { deferEnter: true } : undefined,
    )
  ) {
    logEvent("summonFromHand", { owner, card: card.name, uid: card.uid });
    if (state.lastSummoned) {
      state.lastSummoned.length = 0;
      state.lastSummoned.push(card);
    }
    // Render removed - UI orchestrator handles rendering
    return true;
  }

  return false;
}

export function summonExactCopyFromHand(
  srcCard: CardInstance,
  owner: Player,
  position = "right",
  opts?: { deferEnter?: boolean },
) {
  if (!srcCard) return null;

  // Deep clone the current hand object (keeps buffs/keywords/cost mods, etc.)
  const clone: CardInstance =
    typeof structuredClone === "function"
      ? structuredClone(srcCard)
      : structuredClone(srcCard);

  // Normalize instance identity/placement — must mint a new uid (same discipline
  // as summonExactCopy / chain). Reusing the hand card's uid leaves one
  // identity in two zones (hand + board). Keep template id from srcCard so
  // copies remain identifiable (boardIds / "copies of X" counting); only uid
  // is instance-scoped.
  clone.uid = state.rng.makeUid();
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
    if (clone.hasStorm || clone.hasRush) {
      clone.can_attack_followers = true;
    } else {
      clone.can_attack_followers = false;
    }
    recomputeAttackFlags(clone);
  }

  // Place on board (respect space; fills null holes from deferred deaths)
  const board = getBoard(state, owner);
  if (!boardHasRoom(board)) return null;

  stampBoardEntryTs(clone);
  if (!pushToBoard(board, owner, clone, { deferEnter: true })) {
    return null;
  }

  logEvent("summonExactCopy", { owner, from: srcCard.name, uid: clone.uid });
  // Track last summoned
  if (state.lastSummoned) {
    state.lastSummoned.length = 0;
    state.lastSummoned.push(clone);
  }

  // Rally + enter triggers — deferred when invoked from targeted handlers
  // (orchestrator calls finishFollowerEnter after handler returns).
  if (!opts?.deferEnter) {
    finishFollowerEnter(clone, owner);
  }

  return clone;
}

export function handleSelectHandSummonFollower(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: any,
): string | void {
  const hand = getHand(state, owner);
  const pool = (hand || []).filter((c) => c?.type === "Follower");
  if (!pool.length) return;

  const selectCount = Math.max(
    1,
    parseInt(String(eff.select ?? (eff as any).select_count ?? 1), 10) || 1,
  );

  if (pool.length === 1 && selectCount === 1) {
    summonFromHand(pool[0]!, owner);
    return;
  }

  if (pool.length === 1 && selectCount === 1) {
    summonExactCopyFromHand(pool[0]!, owner);
    return;
  }

  setPendingTarget({
    eff: { ...eff, op: "select_hand_summon_follower" } as any,
    owner,
    sourceCard,
    resumeEffects: effectsQueue,
    pool,
    targets: [],
    selectCount,
    requiresConfirmation: false,
    enforceMinSelectCount: selectCount > 1,
    enforceMaxSelectCount: true,
  });

  highlightSelectable(pool);
  return "pending";
}

export function handleSelectHandSummonArtifactCopy(
  eff: Effect,
  owner: Player,
  effectsQueue: any,
) {
  const maxCost = Number((eff as any).max_cost ?? 5);
  const hand = getHand(state, owner);

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

  const maxRequired = parseHandArtifactSelectCount(eff, 3);
  const selectCount = pool.length <= maxRequired ? pool.length : maxRequired;

  if (pool.length === 1 && selectCount === 1) {
    summonExactCopyFromHand(pool[0]!, owner);
    return;
  }

  setPendingTarget({
    eff: { ...eff, op: "select_hand_summon_artifact_copy" } as any, // resolved in resolveTarget.js
    owner,
    sourceCard: null,
    resumeEffects: effectsQueue,
    pool,
    targets: [],
    selectCount,
    requiresConfirmation: false,
    enforceMinSelectCount: selectCount > 1,
    enforceMaxSelectCount: true,
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
  const hand = getHand(state, owner);

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
