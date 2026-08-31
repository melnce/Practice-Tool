/**
 * Drive a single card's effects through the real engine and capture fingerprints.
 *
 * Honest coverage: cards that cannot be driven meaningfully are skipped with a
 * reason — never silently passed.
 */

import {
  givenGameState,
  createCard,
  whenPlayCard,
  whenEndTurn,
  resetUidCounter,
} from "../../tests/harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import type { CardInstance, Effect } from "../../src/core/types/index.js";
import {
  fingerprintGameState,
  hashFingerprint,
} from "./cardBehaviourFingerprint.js";

export const HARNESS_SEED = 42;
export const HARNESS_VERSION = 1;

export type SkipReason =
  | "card_not_in_registry"
  | "no_driveable_path"
  | "play_blocked"
  | "unresolvable_pending"
  | "evolve_unavailable"
  | "drive_threw";

export type ScenarioName =
  | "play"
  | "turn_boundary"
  | "evolve"
  | "vanilla_place";

export type ScenarioResult = {
  scenario: ScenarioName;
  fingerprint: string;
  detail: object;
};

export type CardDriveResult =
  | {
      status: "covered";
      id: string;
      name: string;
      scenarios: ScenarioResult[];
      fingerprint: string;
    }
  | {
      status: "skipped";
      id: string;
      name: string;
      reason: SkipReason;
      detail?: string;
    };

type RawCard = {
  id: string;
  name: string;
  type?: string;
  fanfare?: unknown[];
  spell?: unknown[];
  evolve?: unknown[];
  superevolve?: unknown[];
  triggers?: unknown[];
};

function walkEffects(
  node: unknown,
  visit: (obj: Record<string, unknown>) => void,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkEffects(child, visit);
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const value of Object.values(obj)) walkEffects(value, visit);
}

function hasNonEmptyEffects(arr: unknown[] | undefined): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

function hasBoardTurnTrigger(card: RawCard): boolean {
  let found = false;
  walkEffects(card.triggers ?? [], (obj) => {
    const type = obj.type;
    const event = obj.event;
    const isTurn =
      type === "end_of_turn_own" ||
      type === "start_of_turn_own" ||
      event === "end_of_turn" ||
      event === "start_of_turn";
    if (!isTurn) return;
    // Board / default (no source) / amulet countdown hosts — skip pure crest-only defs
    // nested under other cards; card.triggers are the host's own triggers.
    const source = obj.source;
    if (source === "crest" || source === "hand" || source === "deck") return;
    found = true;
  });
  return found;
}

function classifyPaths(card: RawCard): ScenarioName[] {
  const paths: ScenarioName[] = [];
  const isSpell = String(card.type).toLowerCase() === "spell";
  const playableEffects = isSpell
    ? hasNonEmptyEffects(card.spell)
    : hasNonEmptyEffects(card.fanfare);

  if (playableEffects || isSpell) {
    paths.push("play");
  }
  if (hasBoardTurnTrigger(card)) {
    paths.push("turn_boundary");
  }
  if (hasNonEmptyEffects(card.evolve) || hasNonEmptyEffects(card.superevolve)) {
    paths.push("evolve");
  }
  if (paths.length === 0) {
    paths.push("vanilla_place");
  }
  return paths;
}

function fillerFollower(
  name: string,
  owner: "first" | "second",
  atk = 2,
  def = 5,
): CardInstance {
  return createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: atk,
      defense: def,
    },
    "board",
    owner,
  );
}

function artifactFollower(
  name: string,
  owner: "first" | "second",
): CardInstance {
  return createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 1,
      tribes: ["Artifact"],
    },
    "hand",
    owner,
  );
}

/** Standard arena shared by all scenarios for a card. */
function buildArena(opts: {
  roundCount?: number;
  activePlayer?: "first" | "second";
  extraHand?: CardInstance[];
}): void {
  resetUidCounter();
  state.gameStarted = true;
  givenGameState({
    seed: HARNESS_SEED,
    activePlayer: opts.activePlayer ?? "first",
    turn: 1,
    roundCount: opts.roundCount ?? 8,
  })
    .withFirstHP(20)
    .withSecondHP(20)
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .withFirstShadows(10)
    .withSecondShadows(10)
    .withFirstEvo(3)
    .withSecondEvo(3)
    .build();

  state.players.first.superEvoCharges = 3;
  state.players.second.superEvoCharges = 3;

  const allyA = fillerFollower("ArenaAllyA", "first", 2, 6);
  const allyB = fillerFollower("ArenaAllyB", "first", 3, 4);
  const enemyA = fillerFollower("ArenaEnemyA", "second", 2, 6);
  const enemyB = fillerFollower("ArenaEnemyB", "second", 3, 4);
  // Ward + Artifact targets so spells that require them aren't skipped for empty pools.
  const allyWard = fillerFollower("ArenaAllyWard", "first", 1, 5);
  allyWard.hasWard = true;
  (allyWard as any).keywords = ["Ward"];
  const enemyWard = fillerFollower("ArenaEnemyWard", "second", 1, 5);
  enemyWard.hasWard = true;
  (enemyWard as any).keywords = ["Ward"];
  const enemyArt = createCard(
    {
      name: "ArenaEnemyArt",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 4,
      tribes: ["Artifact"],
    },
    "board",
    "second",
  );
  const allyArt = createCard(
    {
      name: "ArenaAllyArt",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 4,
      tribes: ["Artifact"],
    },
    "board",
    "first",
  );

  state.players.first.board = [allyA, allyB, allyArt, allyWard];
  state.players.second.board = [enemyA, enemyB, enemyWard, enemyArt];

  if (opts.extraHand?.length) {
    state.players.first.hand.push(...opts.extraHand);
  }
}

/**
 * Deterministically resolve pending target selection by always picking the
 * earliest pool UID still needed. Caps steps to avoid infinite loops.
 */
function autoResolvePending(maxSteps = 12): {
  ok: boolean;
  reason?: string;
} {
  let steps = 0;
  while (state.pendingTargetEffect && steps < maxSteps) {
    steps++;
    const pending = state.pendingTargetEffect;
    // Engine selection is UID-based (`targetUids`); `targets` may be stale/empty.
    if (!pending.targetUids) pending.targetUids = [];
    const already = new Set(pending.targetUids);
    const poolUids =
      pending.poolUids ??
      (pending.pool ?? []).map((c) => c?.uid).filter(Boolean);
    const nextUid = poolUids.find((uid) => uid && !already.has(uid));
    if (!nextUid) {
      if (pending.canTargetLeader && !already.has("leader")) {
        resolvePendingTarget("leader");
        continue;
      }
      return { ok: false, reason: "empty_or_exhausted_pool" };
    }
    resolvePendingTarget(nextUid);
  }
  if (state.pendingTargetEffect) {
    // confirm_needed can leave pending after enough picks — treat as stuck.
    if (state.pendingTargetEffect.requiresConfirmation) {
      return { ok: false, reason: "requires_confirmation" };
    }
    return { ok: false, reason: "pending_after_max_steps" };
  }
  return { ok: true };
}

function installModePicks(): void {
  // Always pick the first N options — deterministic across processes.
  setScriptedModePickProvider((req) => {
    const picks: number[] = [];
    for (let i = 0; i < req.selectCount && i < req.optionCount; i++) {
      picks.push(i);
    }
    return picks;
  });
}

function clearModePicks(): void {
  setScriptedModePickProvider(null);
}

function runPlayScenario(
  cardId: string,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  const extras: CardInstance[] = [];
  // Artifact hand-summon cards need Artifact followers in hand.
  let needsArtifact = false;
  walkEffects(
    [...(template.fanfare ?? []), ...(template.spell ?? [])],
    (obj) => {
      if (obj.op === "summon" && (obj as any).filter?.type === "Artifact") {
        needsArtifact = true;
      }
    },
  );
  if (needsArtifact) {
    extras.push(
      artifactFollower("HarnessArt1", "first"),
      artifactFollower("HarnessArt2", "first"),
      artifactFollower("HarnessArt3", "first"),
    );
  }

  // Spellboost consumers (e.g. Radiant Rainbow) need a spellboostable card in hand.
  let needsSpellboost = false;
  walkEffects(
    [...(template.fanfare ?? []), ...(template.spell ?? [])],
    (obj) => {
      if (
        obj.op === "spellboost" ||
        String(obj.target ?? "").includes("spellboost")
      ) {
        needsSpellboost = true;
      }
      if (
        typeof obj.condition === "string" &&
        obj.condition.includes("spellboost")
      ) {
        needsSpellboost = true;
      }
    },
  );
  if (needsSpellboost) {
    const sb = createCard(
      {
        name: "HarnessSpellboostable",
        type: "Spell",
        cost: 1,
        spellboost: 0,
      } as any,
      "hand",
      "first",
    );
    (sb as any).spellboostCount = 0;
    extras.push(sb);
  }

  buildArena({ extraHand: extras, roundCount: 8 });

  const playCard = createCard(cardId, "hand", "first");
  // Afford anything.
  (playCard as any).cost = 0;
  (playCard as any).effectiveCost = 0;
  state.players.first.hand = [playCard, ...state.players.first.hand];

  const outcome = whenPlayCard("first", 0);
  if (outcome.kind === "blocked") {
    return {
      skip: "play_blocked",
      detail: outcome.reason ?? "blocked",
    };
  }
  if (outcome.kind === "paused" || state.pendingTargetEffect) {
    const resolved = autoResolvePending();
    if (!resolved.ok) {
      return {
        skip: "unresolvable_pending",
        detail: resolved.reason ?? "pending",
      };
    }
  }

  const detail = fingerprintGameState(state);
  return {
    scenario: "play",
    fingerprint: hashFingerprint(detail),
    detail,
  };
}

function runTurnBoundaryScenario(
  cardId: string,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  buildArena({ roundCount: 8, activePlayer: "first" });

  const host = createCard(cardId, "board", "first");
  // Keep host alive through both EOTs when possible.
  if (host.type === "Follower") {
    host.defense = Math.max(Number(host.defense) || 1, 10);
    host.attack = Number(host.attack) || 0;
  }
  // Prepend so arena fillers remain as damage targets.
  state.players.first.board = [host, ...state.players.first.board];

  // End first's turn (active EOT for owner) then second's (reactive for bare).
  whenEndTurn();
  if (state.pendingTargetEffect) {
    const resolved = autoResolvePending();
    if (!resolved.ok) {
      return {
        skip: "unresolvable_pending",
        detail: `after_first_eot:${resolved.reason}`,
      };
    }
  }
  whenEndTurn();
  if (state.pendingTargetEffect) {
    const resolved = autoResolvePending();
    if (!resolved.ok) {
      return {
        skip: "unresolvable_pending",
        detail: `after_second_eot:${resolved.reason}`,
      };
    }
  }

  const detail = fingerprintGameState(state);
  return {
    scenario: "turn_boundary",
    fingerprint: hashFingerprint(detail),
    detail,
  };
}

function runEvolveScenario(
  cardId: string,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };
  if (String(template.type).toLowerCase() !== "follower") {
    return { skip: "evolve_unavailable", detail: "not_a_follower" };
  }

  buildArena({ roundCount: 8, activePlayer: "first" });
  const host = createCard(cardId, "board", "first");
  host.defense = Math.max(Number(host.defense) || 1, 8);
  host.justPlayed = false;
  host.can_attack = false;
  state.players.first.board = [host, ...state.players.first.board];
  state.players.first.evoCharges = 3;
  state.players.first.superEvoCharges = 3;

  try {
    dispatchAction(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: host.uid,
      mode: "normal",
    });
  } catch (err) {
    return {
      skip: "evolve_unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (state.pendingTargetEffect) {
    const resolved = autoResolvePending();
    if (!resolved.ok) {
      return {
        skip: "unresolvable_pending",
        detail: resolved.reason ?? "pending",
      };
    }
  }

  const detail = fingerprintGameState(state);
  return {
    scenario: "evolve",
    fingerprint: hashFingerprint(detail),
    detail,
  };
}

function runVanillaPlaceScenario(
  cardId: string,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  buildArena({ roundCount: 3 });
  const isSpell = String(template.type).toLowerCase() === "spell";
  if (isSpell) {
    const card = createCard(cardId, "hand", "first");
    (card as any).cost = 0;
    state.players.first.hand = [card];
    const outcome = whenPlayCard("first", 0);
    if (outcome.kind === "blocked") {
      return { skip: "play_blocked", detail: outcome.reason ?? "blocked" };
    }
    if (state.pendingTargetEffect) {
      const resolved = autoResolvePending();
      if (!resolved.ok) {
        return {
          skip: "unresolvable_pending",
          detail: resolved.reason ?? "pending",
        };
      }
    }
  } else {
    const host = createCard(cardId, "board", "first");
    state.players.first.board = [host, ...state.players.first.board];
  }

  const detail = fingerprintGameState(state);
  return {
    scenario: "vanilla_place",
    fingerprint: hashFingerprint(detail),
    detail,
  };
}

function isSkip(
  r: ScenarioResult | { skip: SkipReason; detail: string },
): r is { skip: SkipReason; detail: string } {
  return "skip" in r;
}

/**
 * Drive one card through every classified scenario. Covered if at least one
 * scenario produces a fingerprint; otherwise skipped with the first failure.
 */
export function driveCard(raw: RawCard): CardDriveResult {
  const id = String(raw.id);
  const name = raw.name ?? id;
  const template = getCardById(id);
  if (!template) {
    return { status: "skipped", id, name, reason: "card_not_in_registry" };
  }

  installModePicks();
  try {
    const paths = classifyPaths(raw);
    const scenarios: ScenarioResult[] = [];
    const failures: { reason: SkipReason; detail: string }[] = [];

    for (const path of paths) {
      let result: ScenarioResult | { skip: SkipReason; detail: string };
      try {
        if (path === "play") result = runPlayScenario(id);
        else if (path === "turn_boundary") result = runTurnBoundaryScenario(id);
        else if (path === "evolve") result = runEvolveScenario(id);
        else result = runVanillaPlaceScenario(id);
      } catch (err) {
        result = {
          skip: "drive_threw",
          detail: err instanceof Error ? err.message : String(err),
        };
      }

      if (isSkip(result)) {
        failures.push(result);
      } else {
        scenarios.push(result);
      }
    }

    if (scenarios.length === 0) {
      const first = failures[0];
      return {
        status: "skipped",
        id,
        name,
        reason: first?.skip ?? "no_driveable_path",
        detail: first?.detail,
      };
    }

    // Combined fingerprint over scenario name + per-scenario hash (stable order).
    const combined = scenarios
      .slice()
      .sort((a, b) => a.scenario.localeCompare(b.scenario))
      .map((s) => `${s.scenario}:${s.fingerprint}`)
      .join("|");

    return {
      status: "covered",
      id,
      name,
      scenarios: scenarios.map((s) => ({
        scenario: s.scenario,
        fingerprint: s.fingerprint,
        // Keep detail out of committed baseline — hash is enough; detail used for diffs.
        detail: s.detail,
      })),
      fingerprint: hashFingerprint({ combined }),
    };
  } finally {
    clearModePicks();
  }
}

/** Compact baseline entry (no full state dumps — those balloon the committed file). */
export type BaselineCardEntry =
  | {
      status: "covered";
      name: string;
      fingerprint: string;
      scenarios: { scenario: ScenarioName; fingerprint: string }[];
    }
  | {
      status: "skipped";
      name: string;
      reason: SkipReason;
      detail?: string;
    };

export type BehaviourBaseline = {
  version: number;
  seed: number;
  cardCount: number;
  covered: number;
  skipped: number;
  skipReasons: Record<string, number>;
  cards: Record<string, BaselineCardEntry>;
};

export function toBaselineEntry(result: CardDriveResult): BaselineCardEntry {
  if (result.status === "skipped") {
    return {
      status: "skipped",
      name: result.name,
      reason: result.reason,
      ...(result.detail ? { detail: result.detail } : {}),
    };
  }
  return {
    status: "covered",
    name: result.name,
    fingerprint: result.fingerprint,
    scenarios: result.scenarios.map((s) => ({
      scenario: s.scenario,
      fingerprint: s.fingerprint,
    })),
  };
}

/** Re-export Effect type touch so tsx keeps the import graph warm for evolve paths. */
export type { Effect };
