// src/logic/evolveUtils.ts
import { runEffects } from "./core/effects/index.js";
import { handleEvolveSelf } from "./effects/ops/evolve.js";
import { adapter } from "../core/adapter.js";
import { state } from "../core/gameState.js";
import { fireTrigger } from "./core/triggers.js";
import { logEvent } from "../core/logger.js";
import { CardInstance, Player, Effect } from "../core/types.js";

// debounce UI updates so we don't spam render during chained effects
let __raf: number | null = null;
function queueRender() {
  if (typeof window === "undefined") return; // headless sim
  if (__raf) cancelAnimationFrame(__raf);
  __raf = requestAnimationFrame(() => {
    __raf = null;
    try {
      adapter.render();
    } catch {
      /* ignore */
    }
  });
}

export function canEvolve(
  owner: Player,
  card: CardInstance,
  mode: "normal" | "super" = "normal",
) {
  if (!card || card.type !== "Follower") return false;
  if (card.hasEvolved) return false;

  const isBlue = owner === "blue";

  // Unlock rounds (red earlier than blue)
  const normalUnlocked = isBlue ? state.roundCount >= 5 : state.roundCount >= 4;
  const superUnlocked = isBlue ? state.roundCount >= 7 : state.roundCount >= 6;

  // Per-turn limit
  const usedThisTurn = isBlue
    ? state.blueEvoUsedThisTurn
    : state.redEvoUsedThisTurn;

  if (mode === "super") {
    const charges = isBlue
      ? state.blueSuperEvoCharges
      : state.redSuperEvoCharges;
    return superUnlocked && !usedThisTurn && charges > 0;
  } else {
    const charges = isBlue ? state.blueEvoCharges : state.redEvoCharges;
    return normalUnlocked && !usedThisTurn && charges > 0;
  }
}

export function onEvolve(
  card: CardInstance,
  owner: Player,
  mode: "normal" | "super",
  { spendPoint = true, skipEffects = false } = {},
) {
  if (!card) return;

  // Update evolution state FIRST (before running effects)
  card.hasEvolved = true;
  card.evoType = mode === "super" ? "super" : "normal";

  // Get the correct evolve object based on mode
  const evolveObj = mode === "super" ? card.superevolve : card.evolve;
  const isBlue = owner === "blue";
  const spendCounters = () => {
    if (!spendPoint) return;
    if (mode === "super") {
      // Only decrement super evolution charges for super evolves
      if (isBlue) {
        state.blueSuperEvoCharges = Math.max(0, state.blueSuperEvoCharges - 1);
        state.blueEvoUsedThisTurn = true;
      } else {
        state.redSuperEvoCharges = Math.max(0, state.redSuperEvoCharges - 1);
        state.redEvoUsedThisTurn = true;
      }
    } else {
      // Only decrement normal evolution charges for normal evolves
      if (isBlue) {
        state.blueEvoCharges = Math.max(0, state.blueEvoCharges - 1);
        state.blueEvoUsedThisTurn = true;
      } else {
        state.redEvoCharges = Math.max(0, state.redEvoCharges - 1);
        state.redEvoUsedThisTurn = true;
      }
    }
  };

  const fireEvoTriggers = () => {
    if (mode === "super") {
      // Two distinct hooks by design
      fireTrigger("ally_super_evolve", owner, { enteringCard: card });
      fireTrigger("enemy_super_evolve", owner, { enteringCard: card });
    }
  };

  if (skipEffects) {
    // Just spend counters & trigger, no card effects
    spendCounters();
    fireEvoTriggers();
    logEvent("evolve", {
      owner,
      card: card.name,
      uid: card.uid,
      mode,
      via: "skipEffects",
    });
    queueRender();
    return;
  }

  // Even with no evolve effects defined, we still spend counters & fire triggers once.
  if (!evolveObj) {
    spendCounters();
    fireEvoTriggers();
    logEvent("evolve", {
      owner,
      card: card.name,
      uid: card.uid,
      mode,
      via: "noEffects",
    });
    queueRender();
    return;
  }

  let effectsToRun: Effect[] = [];

  // Back-compat: either array or {effects:[]}
  if (Array.isArray(evolveObj)) {
    effectsToRun = [...evolveObj];
  } else if (Array.isArray(evolveObj.effects)) {
    effectsToRun = [...evolveObj.effects];
  }

  // Determine if evolve effects should run:
  // - Player-initiated evolves (spendPoint=true) always run effects ("Evolve:" cards)
  // - Effect-initiated evolves only run if card has evolve_trigger_always flag ("When this evolves" cards)
  const fromPlayer = spendPoint;
  const alwaysTrigger = card.evolve_trigger_always === true;
  const shouldRunScript = fromPlayer || alwaysTrigger;

  // Run effects only if conditions are met
  if (effectsToRun.length > 0 && shouldRunScript) {
    runEffects(effectsToRun, owner, card);
  }

  // NEW: Notify Skybound Art cards in hand
  import("./effects/skybound.js")
    .then(({ incrementSkyboundArt }) => {
      incrementSkyboundArt(owner);
    })
    .catch((e) => console.error("Failed to load skybound module:", e));

  // Track total evolves (Moved from effects/ops/evolve.ts)
  if (owner === "blue") state.blueEvoCount = (state.blueEvoCount || 0) + 1;
  else state.redEvoCount = (state.redEvoCount || 0) + 1;
  logEvent("evolveCount", {
    owner,
    count: owner === "blue" ? state.blueEvoCount : state.redEvoCount,
  });

  spendCounters();
  fireEvoTriggers();
  logEvent("evolve", {
    owner,
    card: card.name,
    uid: card.uid,
    mode,
    via: "withEffects",
  });
  queueRender();
}

export function superEvolveAllyFromContext(
  owner: Player,
  sourceCard: CardInstance | null,
  context: any,
) {
  // Prefer selected target; allow bare uid or stale object
  const sel =
    (context &&
      (context.selectedCard || (context.targets && context.targets[0]))) ||
    null;
  if (!sel) return;

  function findOnBoardByUid(uid: number) {
    const zones = [
      ...(state.blueBoard || []),
      ...(state.redBoard || []),
      ...(state.blueBackrow || []),
      ...(state.redBackrow || []),
    ];
    return zones.find((c) => c && c.uid === uid) || null;
  }

  const target =
    typeof sel === "string"
      ? findOnBoardByUid(Number(sel)) // Convert string uid to number if needed? Wait, uids are numbers usually. Assuming string for now.
      : findOnBoardByUid(sel.uid) || sel;

  if (!target) return;
  if (sourceCard && target.uid === sourceCard.uid) return; // not self
  if (target.hasEvolved) return; // must be unevolved

  // Single source of truth: +3/+3, evo flags, rush-if-no-storm, triggers (skip card script)
  handleEvolveSelf(target, owner, {
    mode: "super",
    spendPoint: false,
    runEvoEffects: false,
  });

  logEvent("superEvolve", { owner, card: target.name, uid: target.uid });

  adapter.render();
}
