// src/logic/effects/ops/mode.ts
import { state } from "../../../core/gameState.js";
import { adapter } from "../../../core/adapter.js";
import { hasEarthSigils, consumeEarthSigils } from "./earth.js";
// import { spellboostHand } from "./spellboost.js"; // Unused
// import { handleDrawFiltered } from "./draw.js"; // Unused
// import { handleReanimate } from "./reanimate.js"; // Unused
import { runEffects } from "../../core/effects/index.js";
import { fireTrigger } from "../../core/triggers.js";
import { logEvent } from "../../../core/logger.js";
import { doAction, appendStep } from "../../../core/history.js";
import type { Effect, Player } from "../../../core/types/index.js";
import { getModeBonus } from "../../../core/playerHelpers.js";
import { consumePlayFollowerResume } from "../../core/playCard/followerResume.js";
import { resumeDeferredDeathIfIdle } from "../../core/cleanup.js";
import {
  clearPendingModeChoice,
  setPendingModeChoice,
} from "../../core/resolutionPause.js";
import { evaluateCondition } from "../gates/conditions.js";
import { resolveUid } from "../../../core/uidResolver.js";
import type { UnifiedGateSpec } from "../gates/types.js";

function commitConfirmedModePicks(
  owner: Player,
  sourceCard: any,
  picked: any[],
  paidByOpt: Map<any, boolean>,
  resumeEffects: Effect[],
  scriptIndices: number[],
): void {
  recordScriptedModePicks(owner, scriptIndices);

  doAction(
    "Confirm Choice",
    () => {
      clearPendingModeChoice();
      logEvent("chooseFinalize", { owner, picked: picked.length });
      fireTrigger("select_mode", owner, { sourceCard: sourceCard || null });

      const combined: Effect[] = [];
      for (const opt of picked) {
        const fizzled =
          opt?.requires?.earth_rite && paidByOpt.get(opt) === false;
        if (fizzled) continue;
        if (Array.isArray(opt.effects) && opt.effects.length)
          combined.push(...opt.effects);
      }

      if (combined.length) {
        runEffects([...combined], owner, sourceCard);
      }

      if (resumeEffects.length) {
        runEffects([...resumeEffects], owner, sourceCard);
      }

      consumePlayFollowerResume();
      resumeDeferredDeathIfIdle();
    },
    { owner, picks: picked.map((p) => p?.label || p?.name || "(opt)") },
    { autoRender: true },
  );
}

/** History-safe mode pick (redo / engine CHOOSE_MODE without modal callback). */
export function applyPendingModePickIndex(index: number): void {
  const pending = state.pendingModeChoice;
  if (!pending?.options?.length) return;

  const partial = [...(pending.partialPickedIndices ?? []), index];
  if (partial.length < pending.selectCount) {
    pending.partialPickedIndices = partial;
    return;
  }

  const owner = pending.owner;
  const sourceCard = pending.sourceCardUid
    ? resolveUid(pending.sourceCardUid)
    : null;
  const picked: any[] = [];
  const paidByOpt = new Map<any, boolean>();
  for (const idx of partial) {
    const selected = pending.options[idx];
    if (!selected) continue;
    let paid = true;
    if (selected.requires?.earth_rite) {
      const need = parseInt(String(selected.requires.earth_rite), 10) || 1;
      paid = consumeEarthSigils(owner, need);
    }
    picked.push(selected);
    paidByOpt.set(selected, paid);
  }

  commitConfirmedModePicks(
    owner,
    sourceCard,
    picked,
    paidByOpt,
    pending.resumeEffects ?? [],
    [...partial],
  );
}

// Import types if needed, or define locally if specific to mode
// ChooseEffect?
// For now, I will typify 'eff' as any to avoid breaking, but better to use Effect and safe access.
// Actually, I should use Effect & { options?: any[], select_count?: number, unique?: boolean }
// But for now, safe property access is enough.

import type { EffectCtx } from "../../core/effects/registry.js";
import { enqueueManyFront } from "../../core/effects/queue.js";
import {
  getScriptedModePicks,
  recordScriptedModePicks,
} from "../../script/modeHook.js";

/** Modes pick count = base (select / select_count) + leader modeBonus (Faith Sham-Nacha). */
export function resolveModeSelectCount(eff: Effect, owner: Player): number {
  const options = Array.isArray((eff as any)?.options)
    ? (eff as any).options
    : [];
  const baseSelect = Math.max(
    1,
    parseInt(
      String((eff as any)?.select_count ?? (eff as any)?.select ?? 1),
      10,
    ) || 1,
  );
  const bonus = getModeBonus(state, owner);
  return Math.min(options.length, baseSelect + bonus);
}

function runAutomaticModePicks(
  picked: any[],
  owner: Player,
  sourceCard: any,
  ctx: EffectCtx,
  reason: "random" | "activate_all",
): "done" {
  const combined: Effect[] = [];
  for (const option of picked) {
    let paid = true;
    if (option?.requires?.earth_rite) {
      const need = parseInt(String(option.requires.earth_rite), 10) || 1;
      paid = consumeEarthSigils(owner, need);
    }
    if (paid && Array.isArray(option?.effects))
      combined.push(...option.effects);
  }

  appendStep(reason === "random" ? "Random Choice" : "Activate All Modes", {
    owner,
    picks: picked.map((p) => p?.label || p?.name || "(opt)"),
  });
  logEvent("chooseFinalize", { owner, picked: picked.length, [reason]: true });
  fireTrigger("select_mode", owner, { sourceCard: sourceCard || null });
  if (combined.length) enqueueManyFront(ctx, combined);
  return "done";
}

export function handleMode(eff: Effect, ctx: EffectCtx) {
  const { owner, sourceCard, queue: effectsQueue } = ctx;

  // console.group("[CHOICE DEBUG] Handling choose effect (multi-pick)");
  const options = Array.isArray((eff as any)?.options)
    ? (eff as any).options
    : [];
  const selectCount = resolveModeSelectCount(eff, owner);
  logEvent("chooseOpen", { owner, options: options.length, selectCount });
  const unique = (eff as any)?.unique !== false; // default true

  // Filter options by resource gates (e.g., Earth Rite) like before
  // All options remain available; Earth Rite cost will be attempted on pick
  const available = options;
  if (available.length === 0) {
    // console.warn("No options configured");
    // console.groupEnd();
    return;
  }

  const activateAllGate = (eff as any).activate_all_if;
  const activateAllByCount = Number(
    (eff as any).activate_all_if_ally_board_gte,
  );
  const shouldActivateAll =
    (activateAllGate &&
      typeof activateAllGate === "object" &&
      evaluateCondition(
        { op: "gate", ...activateAllGate } as UnifiedGateSpec,
        owner,
        sourceCard,
      )) ||
    (Number.isFinite(activateAllByCount) &&
      activateAllByCount > 0 &&
      evaluateCondition(
        {
          op: "gate",
          condition: "ally_matches",
          type: "Card",
          count: activateAllByCount,
        },
        owner,
        sourceCard,
      ));

  if (shouldActivateAll) {
    return runAutomaticModePicks(
      available,
      owner,
      sourceCard,
      ctx,
      "activate_all",
    );
  }

  const isRandomPick =
    String((eff as any).pick || "").toLowerCase() === "random" ||
    String((eff as any).distribution || "").toLowerCase() === "random";
  const isRandomUnused =
    String((eff as any).pick || "").toLowerCase() === "random_unused";
  if (isRandomUnused) {
    // Persistent without-replacement pool on the host (follower or crest).
    // Owner ruling (Slaus, provisional): pool is never replenished.
    const host = sourceCard as { usedModeIndices?: number[] } | null;
    if (!host) return;
    if (!Array.isArray(host.usedModeIndices)) host.usedModeIndices = [];
    const used = new Set(host.usedModeIndices);
    const remaining = available
      .map((opt: any, index: number) => ({ opt, index }))
      .filter((entry: { opt: any; index: number }) => !used.has(entry.index));
    if (!remaining.length) {
      logEvent("chooseUnusedEmpty", {
        owner,
        options: available.length,
        used: host.usedModeIndices.length,
      });
      return;
    }
    const chosenEntry = remaining[state.rng.nextInt(remaining.length)];
    if (!chosenEntry) return;
    host.usedModeIndices.push(chosenEntry.index);
    return runAutomaticModePicks(
      [chosenEntry.opt],
      owner,
      sourceCard,
      ctx,
      "random",
    );
  }
  if (isRandomPick) {
    const picked: any[] = [];
    const bag = available.slice();
    while (
      picked.length < selectCount &&
      (unique ? bag.length : available.length)
    ) {
      const pool = unique ? bag : available;
      const index = state.rng.nextInt(pool.length);
      const chosen = pool[index];
      if (!chosen) break;
      picked.push(chosen);
      if (unique) bag.splice(index, 1);
    }
    return runAutomaticModePicks(picked, owner, sourceCard, ctx, "random");
  }

  // ==== Scripted sparring line (explicit indices; never the heuristic AI) ====
  const scriptedPicks = getScriptedModePicks({
    owner,
    optionCount: available.length,
    selectCount,
  });
  if (scriptedPicks) {
    const picked: any[] = [];
    const paidByOpt = new Map();
    for (const idx of scriptedPicks) {
      const chosen = available[idx];
      if (!chosen) {
        throw new Error(
          `[Script] CHOOSE_MODE index ${idx} out of range (options=${available.length})`,
        );
      }
      let paid = true;
      if (chosen?.requires?.earth_rite) {
        const need = parseInt(chosen.requires.earth_rite) || 1;
        paid = consumeEarthSigils(owner, need);
      }
      picked.push(chosen);
      paidByOpt.set(chosen, paid);
      if (unique && picked.filter((p) => p === chosen).length > 1) {
        /* allow duplicate object refs only when unique=false */
      }
    }
    appendStep("Script Choice", {
      owner,
      picks: picked.map((p) => p?.label || p?.name || "(opt)"),
      indices: scriptedPicks,
    });
    logEvent("chooseFinalize", {
      owner,
      picked: picked.length,
      scripted: true,
    });
    fireTrigger("select_mode", owner, { sourceCard: sourceCard || null });
    const combined: Effect[] = [];
    for (const opt of picked) {
      const fizzled = opt?.requires?.earth_rite && paidByOpt.get(opt) === false;
      if (fizzled) continue;
      if (Array.isArray(opt.effects) && opt.effects.length)
        combined.push(...opt.effects);
    }
    if (combined.length) enqueueManyFront(ctx, combined);
    return "done";
  }

  // ==== AI / Headless path (no modal) ====
  const isAIMode = () => {
    // Soak exercises the modal path; real bots keep HEADLESS heuristic resolution.
    if (globalThis && (globalThis as any).__SVWB_INTERACTIVE_MODES__) {
      return false;
    }
    // Your spectator sets these during AI searches/turns (see AlphaVanillaSpectator)
    // If you later run bots without the spectator, you can flip HEADLESS yourself before resolving effects.
    return !!(
      globalThis &&
      ((globalThis as any).HEADLESS || (globalThis as any).AI_SUPPRESS_RENDER)
    );
  };

  // Tiny heuristic: favor immediate board impact & resources; slight penalty if ER cost can’t be paid.
  const scoreOption = (opt: any) => {
    let s = 0;
    const ops = Array.isArray(opt?.effects) ? opt.effects : [];
    for (const e of ops) {
      const op = String(e?.op || "").toLowerCase();
      if (
        op === "damage" ||
        op === "damage_all" ||
        op === "damage_random" ||
        op === "destroy" ||
        op === "destroy_all" ||
        op === "destroy_random"
      )
        s += 6;
      if (op === "summon_named" || op === "reanimate") s += 5;
      if (op === "stat") s += 3;
      if (op === "draw" || op === "draw_filtered" || op === "add_to_hand")
        s += 3;
      if (op === "recover_pp" || op === "gain_max_pp" || op === "restore_pp")
        s += 2;
      if (op === "leader_barrier" || op === "restore_defense" || op === "heal")
        s += 2;
      // small bias for effects mentioning enemy in target
      if (typeof e?.target === "string" && /enemy/i.test(e.target)) s += 1;
    }
    // Earth Rite affordability nudge
    if (opt?.requires?.earth_rite) {
      const need = parseInt(opt.requires.earth_rite) || 1;
      const canPay = hasEarthSigils ? hasEarthSigils(owner, need) : true;
      if (!canPay) s -= 4;
      else s += 1;
    }
    return s;
  };

  if (isAIMode()) {
    const picked: any[] = [];
    const paidByOpt = new Map();
    const pool = available.slice();

    while (picked.length < selectCount && pool.length) {
      // Enforce uniqueness if requested
      const candidates = unique
        ? pool.filter((o: any) => !picked.includes(o))
        : pool;
      if (!candidates.length) break;
      // Choose highest scoring remaining option
      candidates.sort((a: any, b: any) => scoreOption(b) - scoreOption(a));
      const chosen = candidates[0];
      // Attempt to pay ER (if required); if fail, we still pick but will fizzle later (matches human flow)
      let paid = true;
      if (chosen?.requires?.earth_rite) {
        const need = parseInt(chosen.requires.earth_rite) || 1;
        paid = consumeEarthSigils(owner, need);
      }
      picked.push(chosen);
      paidByOpt.set(chosen, paid);
      // remove from pool once chosen
      const i = pool.indexOf(chosen);
      if (i >= 0) pool.splice(i, 1);
    }

    // Record in parent action as a step, then execute inline (no nested action)
    appendStep("AI Choice", {
      owner,
      picks: picked.map((p) => p?.label || p?.name || "(opt)"),
      requiresER: picked.map((p) => !!p?.requires?.earth_rite),
    });
    logEvent("chooseFinalize", { owner, picked: picked.length, ai: true });
    fireTrigger("select_mode", owner, { sourceCard: sourceCard || null });
    const combined: Effect[] = [];
    for (const opt of picked) {
      const fizzled = opt?.requires?.earth_rite && paidByOpt.get(opt) === false;
      if (fizzled) continue;
      if (Array.isArray(opt.effects) && opt.effects.length)
        combined.push(...opt.effects);
    }
    if (combined.length) enqueueManyFront(ctx, combined);
    // Render removed - UI layer handles rendering
    // console.groupEnd();
    return "done";
  }
  // ==== /AI path ====

  // Keep direct references to chosen options for identity comparison
  const picked: any[] = [];
  // Track resource-payment outcome per option (e.g., Earth Rite)
  const paidByOpt = new Map();

  const finalize = () => {
    commitConfirmedModePicks(
      owner,
      sourceCard,
      picked,
      paidByOpt,
      effectsQueue ? [...effectsQueue] : [],
      picked.map((p) => available.indexOf(p)),
    );
  };

  const pickOnce = (pool: any[]) => {
    // Build the pool for this round (remove duplicates if unique)
    const roundPool = unique
      ? pool.filter((opt) => !picked.includes(opt))
      : pool.slice();

    if (roundPool.length === 0) {
      // console.warn("No options left to pick.");
      finalize();
      return;
    }

    adapter.showChoiceModal(roundPool, (selectedIndex: number) => {
      const selected = roundPool[selectedIndex];
      logEvent("choosePick", {
        owner,
        index: selectedIndex,
        requiresER: !!selected?.requires?.earth_rite,
      });
      if (!selected) {
        finalize();
        return;
      }

      // Try to pay Earth Rite; if it fails, we still proceed and fizzle later.
      let paid = true;
      if (selected.requires?.earth_rite) {
        paid = consumeEarthSigils(owner, selected.requires.earth_rite);
        if (!paid) {
          // console.warn("Earth Rite cost not paid – effect fizzles");
          logEvent("earthRiteFizzle", { owner, option: selected.label });
        }
      }

      // Record selection and payment result
      picked.push(selected);
      paidByOpt.set(selected, paid);

      if (picked.length < selectCount) {
        pickOnce(pool);
      } else {
        finalize();
      }
    });
  };

  // Start first round
  setPendingModeChoice({
    owner,
    optionCount: available.length,
    selectCount,
    options: structuredClone(available),
    ...(sourceCard?.uid ? { sourceCardUid: sourceCard.uid } : {}),
    resumeEffects: effectsQueue ? [...effectsQueue] : [],
  });
  pickOnce(available);
  return "pending"; // Return pending to pause effect chain while modal is shown
}
