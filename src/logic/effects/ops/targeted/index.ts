/* eslint-disable */
import { state } from "../../../../core/gameState.js";
import { runEffects } from "../../../core/effects/index.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { dealDamage } from "../../../core/barrier.js";
import { applyKeyword, handleRemoveKeyword } from "../../../core/keywords.js";
import { transformTarget, transformHandTarget } from "../transform.js";
import { destroyTarget } from "../destroy/index.js";
import { banishCard } from "../banish/index.js";
import { bounceToHand } from "../bounce.js";
import { resolveReturnHandToDeck } from "../returnHandToDeck.js";
// clearSelectableFlags is NOT imported because handlers must not use it.
import { fireTrigger } from "../../../core/triggers.js";
import { resolveAmountWithOverflow } from "../damage/index.js";
import { handleFuse } from "../fuse/unified.js";
import { handleEvolveSelf } from "../evolve.js";
import { summonExactCopyFromHand } from "../summon_ops/hand.js";
import { setStatsBuff } from "../stat/core.js";
import { logEvent } from "../../../../core/logger.js";
import { doAction } from "../../../../core/history.js";
import type { CardInstance } from "../../../../core/types/index.js";
import { getHand, getGraveyard, getBoard, addShadows, getHP, setHP, opponentOf } from "../../../../core/playerHelpers.js";
import { resolveUids } from "../../../../core/uidResolver.js";
import type {
  TargetedOpContext,
  DispatchResult,
} from "../../../core/targeting/types.js";
import { startDispatch, endDispatch, runWithBypass } from "../../../core/targeting/guards.js";
type TargetedOpHandler = (ctx: TargetedOpContext) => DispatchResult;
const TARGETED_OP_HANDLERS: Map<string, TargetedOpHandler> = new Map();

// Accessors for testing
export function __getRegisteredTargetedOps(): string[] {
  return Array.from(TARGETED_OP_HANDLERS.keys());
}
export function __registerMockHandler(op: string, handler: TargetedOpHandler) {
  TARGETED_OP_HANDLERS.set(op, handler);
}

/**
 * Executes the handler for the given operation.
 *
 * CONTRACT/SAFEGUARDS:
 * - Activates `guardLifecycle` tripwires during execution.
 * - Validates handler existence (throws detailed error if missing).
 * - Returns `DispatchResult` ("handled" or "paused") to guide Orchestrator cleanup.
 * - Handlers must be pure state mutators (no side effects on UI/Lifecycle).
 * - See docs/targeting-contract.md
 */
export function dispatchTargetedOp(opCtx: TargetedOpContext): DispatchResult {
  const handler = TARGETED_OP_HANDLERS.get(opCtx.eff.op);
  if (!handler) {
    const errorMsg = [
      `[dispatchTargetedOp] Unknown op: "${opCtx.eff.op}"`,
      `Source: ${opCtx.sourceCard?.name || "Unknown"} (${opCtx.sourceCard?.uid})`,
      `Owner: ${opCtx.owner}`,
      `TargetUids: ${opCtx.targetUids.join(", ")}`,
    ].join(" | ");
    throw new Error(errorMsg);
  }

  try {
    startDispatch(opCtx.eff.op);
    return handler(opCtx);
  } finally {
    endDispatch();
  }
}

// =============================================================================
// Handler Definitions - UID-Only Targeting
// Contract: Handlers mutate state only. No cleanup, no resumeEffects, no render.
// All handlers use resolveUids() to get CardInstance[] from targetUids.
// =============================================================================

TARGETED_OP_HANDLERS.set("damage", (ctx) => {
  const { eff, owner, sourceCard, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const amt = resolveAmountWithOverflow(eff, owner, { sourceCard });
  if (amt) {
    for (const target of targets) {
      if (target.type === "Follower") dealDamage(target, amt);
    }
    cleanupDead();
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("transform", (ctx) => {
  const { eff, owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const intoName = String(eff.into ?? (eff as any).name ?? "").trim();
  const target = targets?.[0];
  if (!target || !intoName) return { kind: "handled" };
  const firstHand = getHand(state, "first");
  const secondHand = getHand(state, "second");
  if (firstHand.includes(target) || secondHand.includes(target))
    transformHandTarget(target, intoName);
  else transformTarget(target, intoName);
  logEvent("transform", { owner, target: target.name, into: intoName });
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("keyword", (ctx) => {
  const { eff, targetUids, owner } = ctx;
  const targets = resolveUids(targetUids);
  const action = (eff as any).action || "grant";

  if (action === "remove") {
    // Remove keywords from targets
    const keywordsToRemove = (eff as any).keywords || [];
    for (const target of targets) {
      for (const kw of keywordsToRemove) {
        const name = (typeof kw === "string" ? kw : kw?.name) || "";
        if (name) handleRemoveKeyword({ keywords: [name] } as any, owner, [target]);
      }
    }
  } else {
    // Default: grant keywords to targets
    for (const target of targets) {
      for (const k of (eff as any).keywords || []) {
        const name = (typeof k === "string" ? k : k?.name) || "";
        const opts = typeof k === "object" ? { ...k } : {};
        opts.request_owner = owner;
        applyKeyword(target, name, opts);
      }
    }
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("discard_select_hand", (ctx) => {
  const { owner, targetUids } = ctx;
  const hand = getHand(state, owner);
  const grave = getGraveyard(state, owner);
  const discarded: CardInstance[] = [];

  for (const uid of targetUids) {
    const idx = hand.findIndex((c) => c.uid === uid);
    if (idx !== -1) {
      const [d] = hand.splice(idx, 1);
      if (d) {
        grave.push(d);
        discarded.push(d);
      }
    }
  }

  if (targetUids.length > 0) {
    addShadows(state, owner, targetUids.length);
  }
  if (discarded.length) {
    state.lastDiscardedCosts = discarded.map(
      (c) => parseInt(c.cost as any, 10) || 0,
    );
    state.lastDiscardedCost = state.lastDiscardedCosts[0] || 0;
  }
  for (const dc of discarded) {
    if (Array.isArray((dc as any).on_discard))
      runEffects([...(dc as any).on_discard], owner, dc);
  }
  return { kind: "handled" };
});

// Unified discard op - same logic as discard_select_hand
TARGETED_OP_HANDLERS.set("discard", (ctx) => {
  const { owner, targetUids } = ctx;
  const hand = getHand(state, owner);
  const grave = getGraveyard(state, owner);
  const discarded: CardInstance[] = [];

  for (const uid of targetUids) {
    const idx = hand.findIndex((c) => c.uid === uid);
    if (idx !== -1) {
      const [d] = hand.splice(idx, 1);
      if (d) {
        grave.push(d);
        discarded.push(d);
      }
    }
  }

  if (targetUids.length > 0) {
    addShadows(state, owner, targetUids.length);
  }
  if (discarded.length) {
    state.lastDiscardedCosts = discarded.map(
      (c) => parseInt(c.cost as any, 10) || 0,
    );
    state.lastDiscardedCost = state.lastDiscardedCosts[0] || 0;
  }
  for (const dc of discarded) {
    if (Array.isArray((dc as any).on_discard))
      runEffects([...(dc as any).on_discard], owner, dc);
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("stat", (ctx) => {
  const { eff, owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const action = (eff as any).action || "give";
  const a = parseInt((eff as any).attack || 0) || 0;
  const d = parseInt((eff as any).defense || 0) || 0;
  const rawTribes = (eff as any).tribes
    ? Array.isArray((eff as any).tribes)
      ? (eff as any).tribes
      : [(eff as any).tribes]
    : (eff as any).tribe
      ? [(eff as any).tribe]
      : null;
  const tribeOk = (card: CardInstance) => {
    if (!rawTribes) return true;
    const want = rawTribes.map((t: any) => String(t).toLowerCase());
    return (
      Array.isArray(card.tribes) &&
      card.tribes.some((tr) => want.includes(String(tr).toLowerCase()))
    );
  };
  for (const target of targets.filter(tribeOk)) {
    // Handle action: "set" - sets stats to fixed values
    if (action === "set") {
      const setA = (eff as any).attack !== undefined ? a : null;
      const setD = (eff as any).defense !== undefined ? d : null;
      setStatsBuff(target, setA, setD, owner);
      continue;
    }

    // Default: action "give" - adds to stats
    if (!target.buffs) target.buffs = { attack: 0, defense: 0 };
    target.buffs.attack = (target.buffs.attack ?? 0) + a;
    target.buffs.defense = (target.buffs.defense ?? 0) + d;
    target.attack = Math.max(0, (parseInt(target.attack as any) || 0) + a);
    target.defense = (parseInt(target.defense as any) || 0) + d;
    target.peak_defense = Math.max(
      target.peak_defense ?? (target.defense as number),
      target.defense as number,
    );
    if (!target.potential_attack)
      target.potential_attack = Number(target.base_attack || target.attack);
    if (!target.potential_defense)
      target.potential_defense = Number(target.base_defense || target.defense);
    target.potential_attack += a;
    target.potential_defense += d;
    if (d < 0 && target.type === "Follower") {
      const firstBoard = getBoard(state, "first");
      const secondBoard = getBoard(state, "second");
      const targetOwner = firstBoard.includes(target)
        ? "first"
        : secondBoard.includes(target)
          ? "second"
          : null;
      if (targetOwner)
        fireTrigger("enemy_follower_defense_down", owner as any, { target });
    }
  }
  cleanupDead();
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("banish", (ctx) => {
  const { owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  for (const target of targets) {
    banishCard(target);
    logEvent("banish", { owner, target: target.name });
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("return", (ctx) => {
  const { owner, targetUids, eff } = ctx;
  const targets = resolveUids(targetUids);
  const destination = (eff as any).destination ?? "hand";
  for (const target of targets) {
    if (destination === "hand") {
      bounceToHand(target);
      logEvent("bounce", { owner, target: target.name });
    } else if (destination === "deck") {
      resolveReturnHandToDeck(target, owner);
      logEvent("returnToDeck", { owner, target: target.name });
    }
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("remove_keyword", (ctx) => {
  const { eff, owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const { select: _s, ...payload } = eff;
  handleRemoveKeyword(payload as any, owner, targets);
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("destroy", (ctx) => {
  const { owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  for (const target of targets) {
    const firstBoard = getBoard(state, "first");
    const secondBoard = getBoard(state, "second");
    const targetOwner = firstBoard.includes(target)
      ? "first"
      : secondBoard.includes(target)
        ? "second"
        : owner;
    if (destroyTarget(target, targetOwner, "targeted"))
      logEvent("destroy", { owner, target: target.name });
  }
  cleanupDead();
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("destroy_then", (ctx) => {
  const { eff, owner, sourceCard, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  let destroyedCount = 0;
  for (const target of targets) {
    const firstBoard = getBoard(state, "first");
    const secondBoard = getBoard(state, "second");
    const targetOwner = firstBoard.includes(target)
      ? "first"
      : secondBoard.includes(target)
        ? "second"
        : owner;
    if (destroyTarget(target, targetOwner, "destroy_then")) {
      destroyedCount++;
      logEvent("destroy", { owner, target: target.name });
    }
  }
  cleanupDead();
  if (destroyedCount > 0 && Array.isArray((eff as any).effects)) {
    runEffects([...(eff as any).effects], owner, sourceCard, {
      targetUids,
    });
  }
  return { kind: "handled" };
});

// Damage handler with fallback_leader support
TARGETED_OP_HANDLERS.set("damage", (ctx) => {
  const { eff, owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const target = targets[0];
  const amt = (eff as any).amount as number;
  const oppOwner = opponentOf(owner);
  if (!target) {
    if ((eff as any).fallback_leader) {
      setHP(state, oppOwner, Math.max(0, getHP(state, oppOwner) - amt));
    }
  } else if (target.type === "Follower") {
    dealDamage(target, amt);
    cleanupDead();
  } else if (target.type === "Leader") {
    setHP(state, oppOwner, Math.max(0, getHP(state, oppOwner) - amt));
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("super_evolve_ally", (ctx) => {
  const { owner, sourceCard, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const target = targets?.[0];
  if (!target) return { kind: "handled" };
  if (sourceCard && target.uid === sourceCard.uid) return { kind: "handled" };
  if (target.hasEvolved) return { kind: "handled" };
  handleEvolveSelf(target, owner, { mode: "super", spendPoint: false });
  logEvent("evolve", { owner, target: target.name, mode: "super" });
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("super_evolve_self", (ctx) => {
  const { owner, sourceCard } = ctx;
  if (!sourceCard) return { kind: "handled" };
  handleEvolveSelf(sourceCard, owner, { mode: "super", spendPoint: false });
  logEvent("evolve", { owner, target: sourceCard.name, mode: "super" });
  return { kind: "handled" };
});

// Unified evolve handler for targeted selection resumption
TARGETED_OP_HANDLERS.set("evolve", (ctx) => {
  const { eff, owner, sourceCard, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const mode = (eff as any).mode || "normal";

  for (const target of targets) {
    if (!target || target.type !== "Follower" || target.hasEvolved) continue;
    if (sourceCard && (eff as any).filter?.not_self && target.uid === sourceCard.uid) continue;

    handleEvolveSelf(target, owner, { mode, spendPoint: false });
    logEvent("evolve", { owner, target: target.name, mode });
  }

  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("evolve_and_buff", (ctx) => {
  const { eff, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const target = targets[0];
  if (!target) return { kind: "handled" };
  if (!target.base_attack)
    target.base_attack = parseInt(target.attack as any) || 0;
  if (!target.base_defense)
    target.base_defense = parseInt(target.defense as any) || 0;
  if (!target.buffs) target.buffs = { attack: 0, defense: 0 };
  (target as any).base_attack += 2;
  (target as any).base_defense += 2;
  target.attack = (target as any).base_attack;
  target.defense = (target as any).base_defense;
  const a = parseInt((eff as any).attack || 0) || 0;
  const d = parseInt((eff as any).defense || 0) || 0;
  target.buffs.attack = (target.buffs.attack ?? 0) + a;
  target.buffs.defense = (target.buffs.defense ?? 0) + d;
  (target as any).attack += a;
  (target as any).defense += d;
  target.potential_attack = Number(target.attack);
  target.potential_defense = Number(target.defense);
  target.peak_defense = Math.max(
    target.peak_defense ?? (target.defense as number),
    target.defense as number,
  );
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("fuse", (ctx) => {
  const { eff, owner, sourceCard, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  handleFuse(eff as any, owner, sourceCard, [], { targetUids });
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("nested_effects", (ctx) => {
  const { eff, owner, sourceCard, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  doAction(
    "Resolve Targets",
    () => {
      for (const target of targets) {
        for (const nestedEff of (eff as any).effects || []) {
          if (nestedEff.op === "set_stats") {
            if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

            if (nestedEff.attack !== undefined) {
              target.attack = parseInt(nestedEff.attack);
              target.potential_attack = target.attack as number;
              target.base_attack = target.attack as number;
              target.buffs.attack = 0;
            }
            if (nestedEff.defense !== undefined) {
              target.defense = parseInt(nestedEff.defense);
              target.potential_defense = target.defense as number;
              target.base_defense = target.defense as number;
              target.peak_defense = target.defense as number;
              target.buffs.defense = 0;
            }
          } else {
            runWithBypass(() => {
              runEffects([nestedEff], owner, target, { targetUids: [target.uid] });
            });
          }
        }
      }
    },
    { op: eff?.op, owner, source: sourceCard?.name },
    { autoRender: true },
  );
  return { kind: "handled" };
});

// Handler for cost modification on selected cards
TARGETED_OP_HANDLERS.set("cost", (ctx) => {
  const { eff, targetUids } = ctx;
  const targets = resolveUids(targetUids);
  const mode = (eff as any).mode || "reduce";
  const amount = parseInt((eff as any).amount) || 1;
  const minCost = (eff as any).minCost ?? (eff as any).min_cost ?? 0;

  for (const target of targets) {
    if (!target) continue;

    // Track base cost if not already set
    if (target.base_cost === undefined) {
      target.base_cost = parseInt(String(target.cost)) || 0;
    }

    const currentCost = parseInt(String(target.cost)) || 0;

    switch (mode) {
      case "reduce":
        target.cost = Math.max(minCost, currentCost - amount);
        break;
      case "set":
        target.cost = Math.max(0, amount);
        break;
      case "increase":
        target.cost = currentCost + amount;
        break;
    }
  }

  return { kind: "handled" };
});

// Handler for summoning copies of artifacts selected from hand
TARGETED_OP_HANDLERS.set("select_hand_summon_artifact_copy", (ctx) => {
  const { owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);

  for (const target of targets) {
    summonExactCopyFromHand(target, owner, "right");
  }

  cleanupDead();
  return { kind: "handled" };
});

// Handler for summoning copies from hand with EOT destroy (Doomwright Resurgence)
TARGETED_OP_HANDLERS.set("select_hand_summon_artifact_copies_eot_destroy", (ctx) => {
  const { owner, targetUids } = ctx;
  const targets = resolveUids(targetUids);

  for (const target of targets) {
    const copy = summonExactCopyFromHand(target, owner, "right");
    if (copy) {
      // Grant "destroy at end of opponent's turn" trigger
      if (!Array.isArray(copy.triggers)) {
        copy.triggers = [];
      }
      copy.triggers.push({
        type: "end_of_turn",
        condition: { whose_turn: "opponent" },
        effects: [{ op: "destroy", target: "self" }],
      } as any);
    }
  }

  cleanupDead();
  return { kind: "handled" };
});
