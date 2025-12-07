// effects/cards/runecraft/chaos.js
import { state } from "@core/gameState.js";
import { handleDamageSplitFixed } from "@logic/effects/ops/damage.js";
import { render } from "@ui/render.js";
import { logEvent } from "@core/logger.js";

// Persist counters in state so undo/redo keeps them
function ensureChaosState() {
  if (!state.chaosCounters) state.chaosCounters = {};
  return state.chaosCounters;
}

export function handleChaosCounter(card) {
  if (!card) return;
  const counters = ensureChaosState();
  const cur = counters[card.uid] ?? 0;     // base X = 0
  counters[card.uid] = cur + 1;            // +1 per Spellboost
  card.currentChaosDamage = counters[card.uid]; // UI helper for preview
}

export function handleChaosSplitDamage(owner, sourceCard) {
  const counters = ensureChaosState();
  let x = 0;

  if (sourceCard?.uid && counters[sourceCard.uid]) {
    x = counters[sourceCard.uid];
  }
  if (x <= 0) return;

  // deterministic split between all enemy followers
  handleDamageSplitFixed(
    { op: "damage_split_fixed", target: "enemy:follower", amount: x },
    owner
  );

  logEvent("chaosSplitDamage", { owner, source: sourceCard?.name, amount: x });

  // cleanup after cast (snapshot-safe)
  delete counters[sourceCard.uid];
  sourceCard.currentChaosDamage = 0;

  // ensure UI updates immediately
  render();
}
