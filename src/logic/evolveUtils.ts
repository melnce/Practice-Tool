// src/logic/evolveUtils.ts
import { runEffects } from "./core/effects/index.js";
import { handleEvolveSelf } from "./effects/ops/evolve.js";
import { state } from "../core/gameState.js";
import { fireTrigger } from "./core/triggers.js";
import { logEvent } from "../core/logger.js";
import { CardInstance, Player, Effect } from "../core/types/index.js";
import { isFirstPlayer, getEvoCharges, setEvoCharges, getSuperEvoCharges, setSuperEvoCharges, getEvoUsedThisTurn, setEvoUsedThisTurn, getEvoCount, incrementEvoCount, getBoard, getBackrow, opponentOf } from "../core/playerHelpers.js";
import { resolveUid } from "../core/uidResolver.js";

// Note: Rendering removed from logic layer - UI orchestrator handles all rendering

export function canEvolve(
  owner: Player,
  card: CardInstance,
  mode: "normal" | "super" = "normal",
) {
  if (!card || card.type !== "Follower") return false;
  if (card.hasEvolved) return false;

  const first = isFirstPlayer(owner);

  // Unlock rounds (second player earlier than first)
  const normalUnlocked = first ? state.roundCount >= 5 : state.roundCount >= 4;
  const superUnlocked = first ? state.roundCount >= 7 : state.roundCount >= 6;

  // Per-turn limit
  const usedThisTurn = getEvoUsedThisTurn(state, owner);

  if (mode === "super") {
    const charges = getSuperEvoCharges(state, owner);
    return superUnlocked && !usedThisTurn && charges > 0;
  } else {
    const charges = getEvoCharges(state, owner);
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
  const spendCounters = () => {
    if (!spendPoint) return;
    if (mode === "super") {
      // Only decrement super evolution charges for super evolves
      setSuperEvoCharges(state, owner, Math.max(0, getSuperEvoCharges(state, owner) - 1));
      setEvoUsedThisTurn(state, owner, true);
    } else {
      // Only decrement normal evolution charges for normal evolves
      setEvoCharges(state, owner, Math.max(0, getEvoCharges(state, owner) - 1));
      setEvoUsedThisTurn(state, owner, true);
    }
  };

  const fireEvoTriggers = () => {
    if (mode === "super") {
      // Fire ally trigger for owner, enemy trigger for opponent
      const opponent = opponentOf(owner);
      fireTrigger("ally_super_evolve", owner, { enteringCard: card });
      fireTrigger("enemy_super_evolve", opponent, { enteringCard: card });
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
  incrementEvoCount(state, owner);
  logEvent("evolveCount", {
    owner,
    count: getEvoCount(state, owner),
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
}

export function superEvolveAllyFromContext(
  owner: Player,
  sourceCard: CardInstance | null,
  context: any,
) {
  // UID-based selection only
  if (!context?.targetUids?.length) return;
  const sel = resolveUid(context.targetUids[0]);
  if (!sel) return;

  function findOnBoardByUid(uid: number) {
    const zones = [
      ...getBoard(state, "first"),
      ...getBoard(state, "second"),
      ...getBackrow(state, "first"),
      ...getBackrow(state, "second"),
    ];
    return zones.find((c) => c && Number(c.uid) === uid) || null;
  }

  const target =
    typeof sel === "string"
      ? findOnBoardByUid(Number(sel))
      : findOnBoardByUid(Number(sel.uid)) || sel;

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
}















