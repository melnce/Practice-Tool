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
import { summonExactCopyFromHand } from "../summon.js";
import { resolveAmountWithOverflow } from "../damage/index.js";
import { handleFuse } from "../fuse/unified.js";
import { handleEvolveSelf } from "../evolve.js";
import { logEvent } from "../../../../core/logger.js";
import { doAction } from "../../../../core/history.js";
import { CardInstance, Effect, Player } from "../../../../core/types.js";
import { isFirstPlayer, getHand, getGraveyard, getBoard, addShadows, getHP, setHP, opponentOf } from "../../../../core/playerHelpers.js";
import {
  TargetedOpContext,
  DispatchResult,
} from "../../../core/targeting/types.js";
import {
  startDispatch,
  endDispatch,
  runWithBypass,
} from "../../../core/targeting/guards.js";

type TargetedOpHandler = (ctx: TargetedOpContext) => DispatchResult;
const TARGETED_OP_HANDLERS: Map<string, TargetedOpHandler> = new Map();

// Accessors for testing
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
    // Step 2: Actionable Error
    const targetsSummary = opCtx.targets
      .map((t) => `${t.name}(${t.uid})`)
      .join(", ");
    const errorMsg = [
      `[dispatchTargetedOp] Unknown op: "${opCtx.eff.op}"`,
      `Source: ${opCtx.sourceCard?.name || "Unknown"} (${opCtx.sourceCard?.uid})`,
      `Owner: ${opCtx.owner}`,
      `Targets (${opCtx.targets.length}): ${targetsSummary}`,
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

// Handler Definitions
// Contract: Handlers mutate state only. No cleanup, no resumeEffects, no render.

TARGETED_OP_HANDLERS.set("damage", (ctx) => {
  const { eff, owner, sourceCard, targets } = ctx;
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
  const { eff, owner, targets } = ctx;
  const intoName = String(eff.into ?? (eff as any).name ?? "").trim();
  const target = targets?.[0];
  if (!target || !intoName) return { kind: "handled" }; // Failure to resolve is still "handled" (no-op)
  const firstHand = getHand(state, "first");
  const secondHand = getHand(state, "second");
  if (firstHand.includes(target) || secondHand.includes(target))
    transformHandTarget(target, intoName);
  else transformTarget(target, intoName);
  logEvent("transform", { owner, target: target.name, into: intoName });
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("keyword", (ctx) => {
  const { eff, targets, owner } = ctx;
  for (const target of targets) {
    for (const k of (eff as any).keywords || []) {
      const name = (typeof k === "string" ? k : k?.name) || "";
      const opts = typeof k === "object" ? { ...k } : {};
      opts.request_owner = owner;
      applyKeyword(target, name, opts);
    }
    // Note: UI badge injection removed - handled by UI layer via keywordState inspection
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("discard_select_hand", (ctx) => {
  const { owner, targets } = ctx;
  const hand = getHand(state, owner);
  const grave = getGraveyard(state, owner);
  const discarded: CardInstance[] = [];
  for (const t of targets) {
    const idx = hand.findIndex((c) => c.uid === t.uid);
    if (idx !== -1) {
      const [d] = hand.splice(idx, 1);
      if (d) {
        grave.push(d);
        discarded.push(d);
      }
    }
  }
  if (targets.length > 0) {
    addShadows(state, owner, targets.length);
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
  const { eff, owner, targets } = ctx;
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
  const { owner, targets } = ctx;
  for (const target of targets) {
    // Note: banishCard() in primitives.ts fires ally/enemy_follower_leaves_field
    banishCard(target);
    logEvent("banish", { owner, target: target.name });
  }
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("return", (ctx) => {
  const { owner, targets, eff } = ctx;
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
  const { eff, owner, targets } = ctx;
  const { select: _s, ...payload } = eff;
  handleRemoveKeyword(payload as any, owner, targets);
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("destroy", (ctx) => {
  const { owner, targets } = ctx;
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
  // State cleanup moved to Orchestrator
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("destroy_then", (ctx) => {
  const { eff, owner, sourceCard, targets } = ctx;
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
    // Run nested effects (immediate mutation)
    runEffects([...(eff as any).effects], owner, sourceCard, {
      selectedCard: targets?.[0] || null,
      targets,
    });
  }
  // State cleanup moved to Orchestrator
  return { kind: "handled" };
});

// Handler for damage effects with select (including fallback_leader)
TARGETED_OP_HANDLERS.set("damage", (ctx) => {
  const { eff, owner, targets } = ctx;
  const target = targets[0];
  const amt = (eff as any).amount as number;
  const oppOwner = opponentOf(owner);
  if (!target) {
    // No target selected - if fallback_leader is true, damage enemy leader
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
  const { owner, sourceCard, targets } = ctx;
  const target = targets?.[0];
  if (!target) return { kind: "handled" };
  if (sourceCard && target.uid === sourceCard.uid) return { kind: "handled" };
  if (target.hasEvolved) return { kind: "handled" };
  handleEvolveSelf(target, owner, { mode: "super", spendPoint: false });
  logEvent("evolve", { owner, target: target.name, mode: "super" });
  // adapter.render() moved to Orchestrator
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("super_evolve_self", (ctx) => {
  const { owner, sourceCard } = ctx;
  if (!sourceCard) return { kind: "handled" };
  handleEvolveSelf(sourceCard, owner, { mode: "super", spendPoint: false });
  logEvent("evolve", { owner, target: sourceCard.name, mode: "super" });
  return { kind: "handled" };
});

TARGETED_OP_HANDLERS.set("evolve_and_buff", (ctx) => {
  const { eff, targets } = ctx;
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

// Unified fuse handler - replaces 6 legacy fuse_finalize_* handlers
TARGETED_OP_HANDLERS.set("fuse", (ctx) => {
  const { eff, owner, sourceCard, targets } = ctx;
  handleFuse(eff as any, owner, sourceCard, [], { targets });
  return { kind: "handled" };
});

// Legacy summon handlers (select_hand_summon_artifact_copy, select_hand_summon_artifact_copies_eot_destroy)
// now routed through unified summon op with source: "hand"

TARGETED_OP_HANDLERS.set("nested_effects", (ctx) => {
  const { eff, owner, sourceCard, targets } = ctx;
  doAction(
    "Resolve Targets",
    () => {
      for (const target of targets) {
        for (const nestedEff of (eff as any).effects || []) {
          if (nestedEff.op === "set_stats") {
            // Ensure buffs object exists
            if (!target.buffs) target.buffs = { attack: 0, defense: 0 };

            if (nestedEff.attack !== undefined) {
              target.attack = parseInt(nestedEff.attack);
              target.potential_attack = target.attack as number;
              target.base_attack = target.attack as number;
              target.buffs.attack = 0; // Reset attack buff
            }
            if (nestedEff.defense !== undefined) {
              target.defense = parseInt(nestedEff.defense);
              target.potential_defense = target.defense as number;
              target.base_defense = target.defense as number;
              target.peak_defense = target.defense as number;
              target.buffs.defense = 0; // Reset defense buff - this fixes the damaged UI issue
            }
          } else {
            runWithBypass(() => {
              // Pass targets explicitly so downstream ops (like keyword) know what to affect
              runEffects([nestedEff], owner, target, { targets: [target] });
            });
          }
        }
      }

      // State cleanup moved to Orchestrator
    },
    { op: eff?.op, owner, source: sourceCard?.name },
    { autoRender: true },
  );
  return { kind: "handled" };
});















