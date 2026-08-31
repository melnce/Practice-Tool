/**
 * Drive a single card's effects through the real engine and capture fingerprints.
 *
 * Honest coverage:
 * - `covered` — every named gate we found was driven (satisfied), or there were none
 * - `partial` — drove something, but named gate branches remain unmet (listed)
 * - `skipped` — could not drive meaningfully (with reason)
 *
 * Cheap gate conditions are prepared in-arena so gated branches actually execute.
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
import type { CardInstance } from "../../src/core/types/index.js";
import {
  fingerprintGameState,
  hashFingerprint,
} from "./cardBehaviourFingerprint.js";
import {
  applyGatePreparations,
  collectNamedGates,
  summarizeGateConditions,
  type GateSpec,
} from "./cardBehaviourGates.js";

export const HARNESS_SEED = 42;
/** v2: gate-aware coverage (covered / partial / skipped). */
export const HARNESS_VERSION = 2;

export type SkipReason =
  | "card_not_in_registry"
  | "no_driveable_path"
  | "play_blocked"
  | "unresolvable_pending"
  | "evolve_unavailable"
  | "drive_threw";

export type ScenarioName =
  | "play"
  | "play_else"
  | "turn_boundary"
  | "evolve"
  | "vanilla_place";

export type ScenarioResult = {
  scenario: ScenarioName;
  fingerprint: string;
  detail: object;
  gatesSatisfied?: string[];
  gatesUnmet?: string[];
};

export type CardDriveResult =
  | {
      status: "covered";
      id: string;
      name: string;
      scenarios: ScenarioResult[];
      fingerprint: string;
      gatesSatisfied: string[];
    }
  | {
      status: "partial";
      id: string;
      name: string;
      scenarios: ScenarioResult[];
      fingerprint: string;
      gatesSatisfied: string[];
      /** Named gate conditions whose branches were not executed */
      unmetGates: string[];
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
  const enemyA = fillerFollower("ArenaEnemyA", "second", 2, 6);
  const enemyB = fillerFollower("ArenaEnemyB", "second", 3, 4);
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

  // Keep first board lean (≤2) so gate prep can add evolved/amulet hosts
  // without hitting the 5-slot board cap before play.
  state.players.first.board = [allyA, allyWard];
  state.players.second.board = [enemyA, enemyB, enemyWard, enemyArt];
  // allyArt stays available as a hand Artifact when needed via buildExtraHand;
  // keep one allied Artifact on board for Artifact-target spells.
  state.players.first.board.push(allyArt);
  // Cap at 3 so amulet_count / evolved_allied still have room.

  if (opts.extraHand?.length) {
    state.players.first.hand.push(...opts.extraHand);
  }
}

function autoResolvePending(maxSteps = 12): {
  ok: boolean;
  reason?: string;
} {
  let steps = 0;
  while (state.pendingTargetEffect && steps < maxSteps) {
    steps++;
    const pending = state.pendingTargetEffect;
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
    if (state.pendingTargetEffect.requiresConfirmation) {
      return { ok: false, reason: "requires_confirmation" };
    }
    return { ok: false, reason: "pending_after_max_steps" };
  }
  return { ok: true };
}

function installModePicks(): void {
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

function buildExtraHand(template: {
  fanfare?: unknown[];
  spell?: unknown[];
}): CardInstance[] {
  const extras: CardInstance[] = [];
  let needsArtifact = false;
  let needsSpellboost = false;
  walkEffects(
    [...(template.fanfare ?? []), ...(template.spell ?? [])],
    (obj) => {
      if (obj.op === "summon" && (obj as any).filter?.type === "Artifact") {
        needsArtifact = true;
      }
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
  if (needsArtifact) {
    extras.push(
      artifactFollower("HarnessArt1", "first"),
      artifactFollower("HarnessArt2", "first"),
      artifactFollower("HarnessArt3", "first"),
    );
  }
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
  return extras;
}

function runPlayScenario(
  cardId: string,
  gates: GateSpec[],
  mode: "satisfy" | "deny",
  scenarioName: "play" | "play_else",
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  const extras = buildExtraHand(template);
  buildArena({ extraHand: extras, roundCount: 8 });

  const playCard = createCard(cardId, "hand", "first");
  (playCard as any).cost = 0;
  (playCard as any).effectiveCost = 0;

  const prep = applyGatePreparations(gates, {
    mode,
    sourceCard: playCard,
  });

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
    scenario: scenarioName,
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
  };
}

function runTurnBoundaryScenario(
  cardId: string,
  gates: GateSpec[],
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  buildArena({ roundCount: 8, activePlayer: "first" });

  const host = createCard(cardId, "board", "first");
  if (host.type === "Follower") {
    host.defense = Math.max(Number(host.defense) || 1, 10);
    host.attack = Number(host.attack) || 0;
  }
  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: host,
  });
  state.players.first.board = [host, ...state.players.first.board];

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
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
  };
}

function runEvolveScenario(
  cardId: string,
  gates: GateSpec[],
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
  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: host,
  });
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
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
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
    gatesSatisfied: [],
    gatesUnmet: [],
  };
}

function isSkip(
  r: ScenarioResult | { skip: SkipReason; detail: string },
): r is { skip: SkipReason; detail: string } {
  return "skip" in r;
}

/**
 * Drive one card through classified scenarios with gate preparation.
 */
export function driveCard(raw: RawCard): CardDriveResult {
  const id = String(raw.id);
  const name = raw.name ?? id;
  const template = getCardById(id);
  if (!template) {
    return { status: "skipped", id, name, reason: "card_not_in_registry" };
  }

  const gates = collectNamedGates(raw);
  const gateSummary = summarizeGateConditions(gates);

  installModePicks();
  try {
    const paths = classifyPaths(raw);
    const scenarios: ScenarioResult[] = [];
    const failures: { skip: SkipReason; detail: string }[] = [];
    const satisfiedAll = new Set<string>();
    const unmetAll = new Set<string>(gateSummary.unpreparable);

    for (const path of paths) {
      let result: ScenarioResult | { skip: SkipReason; detail: string };
      try {
        if (path === "play") {
          result = runPlayScenario(id, gates, "satisfy", "play");
          // Also drive else_effects branches for preparable gates that have them.
          if (
            !isSkip(result) &&
            gateSummary.withElse.some((c) => gateSummary.preparable.includes(c))
          ) {
            const elseResult = runPlayScenario(id, gates, "deny", "play_else");
            if (!isSkip(elseResult)) {
              scenarios.push(elseResult);
              for (const c of elseResult.gatesSatisfied ?? [])
                satisfiedAll.add(c);
              for (const c of elseResult.gatesUnmet ?? []) unmetAll.add(c);
            }
          }
        } else if (path === "turn_boundary")
          result = runTurnBoundaryScenario(id, gates);
        else if (path === "evolve") result = runEvolveScenario(id, gates);
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
        for (const c of result.gatesSatisfied ?? []) satisfiedAll.add(c);
        for (const c of result.gatesUnmet ?? []) unmetAll.add(c);
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

    // A condition that was satisfied in any scenario is no longer "unmet".
    for (const c of satisfiedAll) unmetAll.delete(c);
    // Unpreparable gates stay unmet forever.
    for (const c of gateSummary.unpreparable) unmetAll.add(c);

    const unmetGates = [...unmetAll].sort();
    const gatesSatisfied = [...satisfiedAll].sort();

    const combined = scenarios
      .slice()
      .sort((a, b) => a.scenario.localeCompare(b.scenario))
      .map((s) => `${s.scenario}:${s.fingerprint}`)
      .join("|");
    const fingerprint = hashFingerprint({ combined });

    const base = {
      id,
      name,
      scenarios: scenarios.map((s) => ({
        scenario: s.scenario,
        fingerprint: s.fingerprint,
        detail: s.detail,
        gatesSatisfied: s.gatesSatisfied,
        gatesUnmet: s.gatesUnmet,
      })),
      fingerprint,
      gatesSatisfied,
    };

    if (unmetGates.length > 0) {
      return { status: "partial", ...base, unmetGates };
    }
    return { status: "covered", ...base };
  } finally {
    clearModePicks();
  }
}

/** Compact baseline entry (no full state dumps). */
export type BaselineCardEntry =
  | {
      status: "covered";
      name: string;
      fingerprint: string;
      scenarios: { scenario: ScenarioName; fingerprint: string }[];
      gatesSatisfied?: string[];
    }
  | {
      status: "partial";
      name: string;
      fingerprint: string;
      scenarios: { scenario: ScenarioName; fingerprint: string }[];
      gatesSatisfied?: string[];
      unmetGates: string[];
    }
  | {
      status: "skipped";
      name: string;
      reason: SkipReason;
      detail?: string;
    };

export type BehaviourBaseline = {
  /** Regenerated by `npm run cards:baseline` — never hand-edit. */
  _generated: string;
  version: number;
  seed: number;
  cardCount: number;
  covered: number;
  partial: number;
  skipped: number;
  skipReasons: Record<string, number>;
  unmetGateCounts: Record<string, number>;
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
  if (result.status === "partial") {
    return {
      status: "partial",
      name: result.name,
      fingerprint: result.fingerprint,
      scenarios: result.scenarios.map((s) => ({
        scenario: s.scenario,
        fingerprint: s.fingerprint,
      })),
      gatesSatisfied: result.gatesSatisfied,
      unmetGates: result.unmetGates,
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
    gatesSatisfied: result.gatesSatisfied,
  };
}
