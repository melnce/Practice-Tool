// src/logic/effects/attacks.ts
import { logEvent } from "../../core/logger.js";
import { state } from "../../core/gameState.js";
import { getPool, highlightSelectable } from "../core/targeting.js";
import { setPendingTarget } from "../core/pendingTarget/index.js";
import { resolveUids } from "../../core/uidResolver.js";
import type { Effect, CardInstance, Player } from "../../core/types/index.js";

/**
 * Apply attacks_per_turn to one follower, optionally until end of turn.
 */
export function applyAttacksPerTurnToCard(
  target: CardInstance,
  n: number,
  untilEndOfTurn: boolean,
): void {
  logEvent("attacksPerTurn", {
    card: target.name,
    uid: target.uid,
    value: n,
    until_end_of_turn: untilEndOfTurn,
  });

  const prevPer = Number.isFinite(target.attacks_per_turn)
    ? target.attacks_per_turn!
    : Number.isFinite(target.attacks_left)
      ? target.attacks_left!
      : 1;
  const prevLeft = Number.isFinite(target.attacks_left)
    ? target.attacks_left!
    : prevPer;
  const inferredUsed = Math.max(0, prevPer - prevLeft);
  const used = Math.max(0, target.attacks_used_this_turn ?? inferredUsed);

  if (untilEndOfTurn) {
    // Stash only once so stacked EOT grants restore to the pre-temp baseline.
    if ((target as any).attacks_per_turn_pre_eot === undefined) {
      (target as any).attacks_per_turn_pre_eot = prevPer;
    }
  }

  target.attacks_per_turn = n;
  target.attacks_left = Math.max(0, n - used);

  if (target.hasStorm || target.hasRush || !target.justPlayed) {
    target.can_attack = (target.attacks_left ?? 0) > 0;
  }
}

/** Clear until-EOT attacks_per_turn grants (both boards at EOT boundary). */
export function clearTemporaryAttacksPerTurn(card: CardInstance): void {
  if ((card as any).attacks_per_turn_pre_eot === undefined) return;
  const restore = Number((card as any).attacks_per_turn_pre_eot) || 1;
  delete (card as any).attacks_per_turn_pre_eot;
  const used = Math.max(0, card.attacks_used_this_turn ?? 0);
  card.attacks_per_turn = restore;
  card.attacks_left = Math.max(0, restore - used);
  if (card.hasStorm || card.hasRush || !card.justPlayed) {
    card.can_attack = (card.attacks_left ?? 0) > 0;
  }
}

/**
 * Legacy entry: apply to sourceCard only.
 * Prefer handleAttacksPerTurn for targeted / EOT uses.
 */
export function applyAttacksPerTurn(
  eff: Effect & {
    value?: number;
    amount?: number;
    n?: number;
    [key: number]: number;
  },
  sourceCard: CardInstance | null,
) {
  if (!sourceCard) return;
  const n =
    parseInt(
      (eff.value ?? eff.count ?? eff.amount ?? eff.n ?? eff[0] ?? eff) as any,
    ) || 1;
  const untilEot = !!(eff as any).until_end_of_turn || !!(eff as any).until_eot;
  applyAttacksPerTurnToCard(sourceCard, n, untilEot);
}

/**
 * Full attacks_per_turn handler with optional target / select / random.
 */
export function handleAttacksPerTurn(
  eff: Effect,
  owner: Player,
  sourceCard: CardInstance | null,
  context: any = {},
): "done" | "pending" {
  const n =
    parseInt(
      String(
        (eff as any).value ??
          (eff as any).count ??
          (eff as any).amount ??
          (eff as any).n ??
          1,
      ),
      10,
    ) || 1;
  const untilEot = !!(eff as any).until_end_of_turn || !!(eff as any).until_eot;

  let targets: CardInstance[] = [];

  if (context?.targetUids?.length) {
    targets = resolveUids(context.targetUids).filter(
      (c): c is CardInstance => !!c && c.type === "Follower",
    );
  } else if (context?.targets?.length) {
    targets = (context.targets as CardInstance[]).filter(
      (c) => c?.type === "Follower",
    );
  } else if ((eff as any).target) {
    const pool = getPool(
      String((eff as any).target),
      owner,
      sourceCard,
      {
        ...(eff as any).filter,
        ...(eff as any).condition,
      },
      context,
    );
    const need = parseInt(String((eff as any).select ?? 0), 10) || 0;
    if (need > 0 && (eff as any).select_mode === "random") {
      const copy = [...pool];
      targets = [];
      for (let i = 0; i < need && copy.length; i++) {
        const idx = state.rng.nextInt(copy.length);
        targets.push(copy.splice(idx, 1)[0]!);
      }
    } else if (need > 0) {
      setPendingTarget({
        eff,
        owner,
        sourceCard,
        pool,
        poolUids: pool.map((c) => String(c.uid)),
        selectCount: need,
        targets: [],
        targetUids: [],
      } as any);
      highlightSelectable(pool);
      return "pending";
    } else {
      targets = pool;
    }
  } else if (sourceCard) {
    targets = [sourceCard];
  }

  for (const t of targets) {
    applyAttacksPerTurnToCard(t, n, untilEot);
  }
  return "done";
}
