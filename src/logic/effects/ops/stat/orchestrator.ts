import { state } from "../../../../core/gameState.js";
import { getPool, highlightSelectable } from "../../../core/targeting.js";
import { cleanupDead } from "../../../core/cleanup.js";
import { logEvent } from "../../../../core/logger.js";
import { CardInstance, Player, Effect } from "../../../../core/types.js";
import { StatOp } from "./types.js";
import { filterBuffCandidates } from "./utils.js";
import { withBuffDuration } from "./duration.js";
import {
  applyStatBuff,
  setStatsBuff,
  applyKeywordBuff,
  applyAttacksPerTurnBuff,
  checkPostBuffTriggers,
} from "./core.js";
import { setPendingTarget } from "../../../core/pendingTarget/index.js";
import {
  handleStatSelf,
  handleDynamicStatSelf,
} from "../../../effects/self.js";

export function handleStatOrchestrator(
  eff: StatOp,
  owner: Player,
  sourceCard: CardInstance | null,
  effectsQueue: any,
  context: any = {},
): "done" | "pending" {
  // ========================================================================
  // STRICT VALIDATION
  // ========================================================================
  // For special modes (combo_repeat, double), mode is the required field
  // For standard buff path, require action AND target
  const hasMode = !!(eff as any).mode;
  const hasAction = !!eff.action;
  const hasTarget = eff.target !== undefined;

  if (!hasMode && !hasAction) {
    throw new Error(
      `[stat] Missing required field: "action". Must be "give" or "set". Effect: ${JSON.stringify(eff)}`,
    );
  }

  if (!hasMode && !hasTarget) {
    throw new Error(
      `[stat] Missing required field: "target". Effect: ${JSON.stringify(eff)}`,
    );
  }
  // ==========================================================================
  // MODE: COMBO_REPEAT - Repeat stat buff X times (X = current Combo count)
  // Replaces legacy combo_repeat_buff op
  // ==========================================================================
  if ((eff as any).mode === "combo_repeat") {
    const plays =
      owner === "blue"
        ? state.bluePlaysThisTurn || 0
        : state.redPlaysThisTurn || 0;
    if (plays <= 0) return "done";

    logEvent("comboRepeatBuff", { owner, plays });

    // Create inner buff effect without mode to avoid recursion
    const innerEff = { ...eff, mode: undefined } as StatOp;

    for (let i = 0; i < plays; i++) {
      const res = handleStatOrchestrator(
        innerEff,
        owner,
        sourceCard,
        effectsQueue,
        context,
      );
      if (res === "pending") return res;
    }
    return "done";
  }

  // ==========================================================================
  // MODE: DOUBLE - Double attack and defense of target followers
  // Replaces legacy double_stats_allies op
  // ==========================================================================
  if ((eff as any).mode === "double") {
    const pool = getPool(eff.target || "ally:follower", owner, sourceCard);

    for (const card of pool) {
      const curA = parseInt(String(card.attack)) || 0;
      const curD = parseInt(String(card.defense)) || 0;
      applyStatBuff(card, curA, curD, owner); // Doubling = add current value again
      checkPostBuffTriggers(card, curA, curD, owner);
      logEvent("doubleStats", {
        owner,
        target: card.name,
        uid: card.uid,
        attack: curA * 2,
        defense: curD * 2,
      });
    }

    cleanupDead();
    return "done";
  }

  // ==========================================================================
  // SPECIAL TARGETS: Handle unified buff targets that don't use getPool
  // ==========================================================================

  // target: "self" - Apply buff to the source card
  if (eff.target === "self" && sourceCard) {
    // Check if this is a dynamic buff (has attack_source or defense_source)
    if (eff.attack_source || eff.defense_source) {
      handleDynamicStatSelf(sourceCard, eff as Effect, owner);
    } else {
      handleStatSelf(sourceCard, eff as Effect);
    }
    return "done";
  }

  // ========================================================================
  // LEADER TARGET: ally:leader / enemy:leader
  // Set leader's defense (HP) using same stat primitives
  // ========================================================================
  const targetStr = String(eff.target || "").toLowerCase();
  if (targetStr === "ally:leader" || targetStr === "enemy:leader") {
    const targetOwner: Player =
      targetStr === "enemy:leader"
        ? owner === "blue"
          ? "red"
          : "blue"
        : owner;

    const action = eff.action;
    const defense = parseInt((eff.defense as any) ?? 0) || 0;

    if (action === "set") {
      // Set leader's max HP (defense)
      if (targetOwner === "blue") {
        state.blueMaxHP = defense;
        state.blueHP = Math.min(state.blueHP, state.blueMaxHP);
      } else {
        state.redMaxHP = defense;
        state.redHP = Math.min(state.redHP, state.redMaxHP);
      }
      logEvent("setLeaderMaxHP", { owner: targetOwner, maxHP: defense });
    }
    // Note: "give" action for leader stat buffs could be added in future
    return "done";
  }

  // target: "hand" - Apply buff to cards in hand (with optional filter)
  if (eff.target === "hand") {
    const hand = owner === "blue" ? state.blueHand : state.redHand;
    const a = parseInt((eff.attack as any) ?? 0) || 0;
    const d = parseInt((eff.defense as any) ?? 0) || 0;

    for (const card of hand) {
      // Apply filter if specified
      if (card.type !== "Follower") continue;
      if ((eff as any).class && card.class !== (eff as any).class) continue;
      if (
        (eff as any).tribe &&
        (!Array.isArray(card.tribes) ||
          !card.tribes.includes((eff as any).tribe))
      )
        continue;
      if (eff.condition?.class && card.class !== eff.condition.class) continue;
      if (
        eff.condition?.tribe &&
        (!Array.isArray(card.tribes) ||
          !card.tribes.includes(eff.condition.tribe))
      )
        continue;

      if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
      card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
      card.buffs.defense = Number(card.buffs.defense ?? 0) + d;
      card.attack = (parseInt(String(card.attack)) || 0) + a;
      card.defense = (parseInt(String(card.defense)) || 0) + d;

      logEvent("buffHand", { owner, target: card.name, uid: card.uid, a, d });
    }
    return "done";
  }

  // target: "last_added_to_hand" - Buff the last card added to hand
  if (eff.target === "last_added_to_hand") {
    const card = state.lastAddedToHand;
    if (!card) return "done";

    const a = parseInt((eff.attack as any) ?? 0) || 0;
    const d = parseInt((eff.defense as any) ?? 0) || 0;

    if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
    card.buffs.attack = Number(card.buffs.attack ?? 0) + a;
    card.buffs.defense = Number(card.buffs.defense ?? 0) + d;
    card.attack = (parseInt(String(card.attack)) || 0) + a;
    card.defense = (parseInt(String(card.defense)) || 0) + d;

    logEvent("buffLastAddedToHand", {
      owner,
      name: card.name,
      uid: card.uid,
      a,
      d,
    });
    return "done";
  }

  // ==========================================================================
  // STANDARD BUFF PATH: Use getPool for board-based targets
  // ==========================================================================

  // 1. Get raw pool
  const rawPool = getPool(
    eff.target as any,
    owner,
    null,
    eff.condition,
    context,
  );

  // 2. Filter candidates
  const pool = filterBuffCandidates(rawPool, eff, sourceCard);

  console.log(
    "BUFF pool uids:",
    pool.map((c) => c.uid),
    "source:",
    sourceCard?.uid,
    "include_self:",
    !!eff.include_self,
  );

  if (!pool.length) return "done";

  // 3. Selection
  if ((eff as any).select) {
    setPendingTarget({
      eff,
      owner,
      sourceCard,
      resumeEffects: effectsQueue,
      pool,
      targets: [],
      selectCount: parseInt((eff as any).select_count ?? 1),
      context,
    } as any);
    highlightSelectable(pool);
    return "pending";
  }

  // 4. Random Selection
  let chosen = pool;
  if (eff.random) {
    const k = Math.max(0, parseInt((eff.count as any) ?? 1, 10));
    if (k <= 0) return "done";

    chosen = [];
    const bag = [...pool];
    for (let i = 0; i < k && bag.length; i++) {
      const idx = state.rng.nextInt(bag.length);
      const picked = bag.splice(idx, 1)[0];
      if (picked) chosen.push(picked);
    }
    console.log(
      "[Buff] Random chose:",
      chosen.map((c) => c.uid),
    );
  }

  // 5. Apply Stats - REQUIRES explicit action field
  const mode = eff.random ? "random" : "all";
  const action = eff.action;

  if (!action) {
    console.warn(
      `[stat] Missing action field - must be "give" or "set". Effect:`,
      eff,
    );
  }

  for (const target of chosen) {
    if (action === "set") {
      // Set stats to fixed values
      const setA =
        eff.attack !== undefined ? parseInt(eff.attack as any) || 0 : null;
      const setD =
        eff.defense !== undefined ? parseInt(eff.defense as any) || 0 : null;
      setStatsBuff(target, setA, setD, owner);
    } else if (action === "give") {
      // Add stats (default behavior)
      withBuffDuration(target, eff, ({ attack: a, defense: d }) => {
        applyStatBuff(target, a, d, owner);
        logEvent("buff", {
          owner,
          target: target.name,
          uid: target.uid,
          a,
          d,
          mode,
        });

        // Post-buff triggers relate mainly to stats
        checkPostBuffTriggers(target, a, d, owner);
      });
    }

    // Apply keywords (for both add and set)
    applyKeywordBuff(target, eff, owner);

    // Apply attacks per turn
    applyAttacksPerTurnBuff(target, eff, owner);
  }

  // 6. Cleanup
  cleanupDead();
  return "done";
}
