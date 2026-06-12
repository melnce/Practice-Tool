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
import type { Effect } from "../../../core/types/index.js";
import { getModeBonus } from "../../../core/playerHelpers.js";
import { consumePlayFollowerResume } from "../../core/playCard/followerResume.js";
import { resumeDeferredDeathIfIdle } from "../../core/cleanup.js";

// Import types if needed, or define locally if specific to mode
// ChooseEffect?
// For now, I will typify 'eff' as any to avoid breaking, but better to use Effect and safe access.
// Actually, I should use Effect & { options?: any[], select_count?: number, unique?: boolean }
// But for now, safe property access is enough.

import type { EffectCtx } from "../../core/effects/registry.js";

/** Modes pick count = base (select / select_count) + leader modeBonus (Faith Sham-Nacha). */
export function resolveModeSelectCount(
  eff: Effect & { select_count?: number; select?: number },
  owner: Player,
): number {
  const options = Array.isArray((eff as any)?.options) ? (eff as any).options : [];
  const baseSelect = Math.max(
    1,
    parseInt(String((eff as any)?.select_count ?? (eff as any)?.select ?? 1), 10) || 1,
  );
  const bonus = getModeBonus(state, owner);
  return Math.min(options.length, baseSelect + bonus);
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

  // ==== AI / Headless path (no modal) ====
  const isAIMode = () => {
    // Your spectator sets these during AI searches/turns (see AlphaVanillaSpectator) :contentReference[oaicite:3]{index=3}
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
    if (combined.length) {
      runEffects(combined, owner, sourceCard);
    }
    if (effectsQueue && effectsQueue.length) {
      runEffects(effectsQueue, owner, sourceCard);
    }
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
    // One undo step for the whole choice confirmation
    doAction(
      "Confirm Choice",
      () => {
        logEvent("chooseFinalize", { owner, picked: picked.length });
        fireTrigger("select_mode", owner, { sourceCard: sourceCard || null });

        // Flatten effects of all picked options in pick order
        const combined: Effect[] = [];
        for (const opt of picked) {
          const fizzled =
            opt?.requires?.earth_rite && paidByOpt.get(opt) === false;
          if (fizzled) continue; // nothing happens
          if (Array.isArray(opt.effects) && opt.effects.length)
            combined.push(...opt.effects);
        }

        if (combined.length) {
          runEffects([...combined], owner, sourceCard);
        }

        if (effectsQueue && effectsQueue.length) {
          runEffects([...effectsQueue], owner, sourceCard);
        }

        consumePlayFollowerResume();
        resumeDeferredDeathIfIdle();
      },
      { owner, picks: picked.map((p) => p?.label || p?.name || "(opt)") },
      { autoRender: true },
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
  pickOnce(available);
  return "pending"; // Return pending to pause effect chain while modal is shown
}















