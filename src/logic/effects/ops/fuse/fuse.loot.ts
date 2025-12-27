// src/logic/effects/ops/fuse/fuse.loot.ts
import { state } from "../../../../core/gameState.js";
import { clearSelectableFlags } from "../../../core/targeting.js";
import { fireTrigger } from "../../../core/triggers.js";
import { logEvent } from "../../../../core/logger.js";
import type { Player, CardInstance } from "../../../../core/types/index.js";
import { alreadyFusedThisTurn, handOf, graveOf } from "./types.js";

// Returning Slash, etc.
export function fuse_finalize_loot(
  owner: Player,
  initiator_uid: string,
  partners: CardInstance[],
) {
  const hand = handOf(owner);
  const grave = graveOf(owner);

  const initiator = hand.find((c) => c?.uid === initiator_uid);
  if (!initiator) {
    clearSelectableFlags();
    // Render removed - UI layer
    return;
  }

  if (alreadyFusedThisTurn(initiator)) {
    console.warn("[Fuse] This copy already fused this turn.");
    logEvent("fuseBlocked", {
      owner,
      reason: "already_fused_this_turn",
      initiator: initiator?.name,
    });
    clearSelectableFlags();
    // Render removed - UI layer
    return "done";
  }

  // Only allow actual Loot spells (keep your stricter set if desired)
  const ALLOWED = new Set([
    "Gilded Blade",
    "Gilded Goblet",
    "Gilded Boots",
    "Gilded Necklace",
  ]);
  const used = (partners || []).filter(
    (p) =>
      p?.type === "Spell" &&
      Array.isArray(p?.tribes) &&
      p.tribes.includes("Loot") &&
      ALLOWED.has(p?.name),
  );

  // Track unique fused names on this specific copy (for X = different names use-cases)
  const prev = Array.isArray(initiator._fusedLootNames)
    ? initiator._fusedLootNames
    : [];
  const next = new Set(prev.map(String));
  for (const p of used) next.add(String(p.name || ""));
  initiator._fusedLootNames = Array.from(next);

  // Consume selected Loot cards
  for (const p of used) {
    const idx = hand.findIndex((c) => c?.uid === p.uid);
    if (idx !== -1) {
      const [taken] = hand.splice(idx, 1);
      if (taken) grave.push(taken);
    }
  }

  logEvent("fuseConsume", {
    owner,
    kind: "loot",
    initiator: initiator.name,
    used: used.map((x) => x.name),
  });

  // Fire exactly ONCE per fuse action on this initiator this TURN.
  // A card can only "fuse" once per turn by rule; treat multi-select as a single fuse.
  if (initiator.__lootFuseTurn !== state.roundCount) {
    initiator.__lootFuseTurn = state.roundCount;
    try {
      // Single ping; include count only as metadata (listeners should NOT loop).
      fireTrigger("loot_fused", owner, {
        initiator,
        kind: "loot",
        count: used.length,
      });
    } catch {
      /* no-op */
    }
  }

  // Mutate spell text/effects on this copy
  const baseSpell: any[] = [
    { op: "damage_random", target: "enemy:follower", amount: 2 },
    { op: "add_to_hand", name: "Gilded Blade", count: 1 },
  ];
  if (used.length >= 1) baseSpell.push({ op: "draw", count: 1 });

  initiator.spell = baseSpell;
  initiator.isFused = used.length >= 1;
  initiator.__lootFuseCount = used.length;
  initiator.lastFuseRound = state.roundCount;

  logEvent("fuseFinalize", {
    owner,
    kind: "loot",
    initiator: initiator.name,
    partners: used.length,
    result: "fused_loot",
  });

  // Bookkeeping
  state.lastFuse = {
    owner,
    initiator_name: initiator?.name,
    partners_count: used.length,
    result_name: "fused_loot",
    targets: "merge",
  };
  try {
    fireTrigger?.("on_fuse", owner, {
      initiator,
      partners: used,
      result: { result_card_name: "fused_loot" },
    });
  } catch {
    /* no-op */
  }

  clearSelectableFlags();
  // Render removed - UI layer
}















