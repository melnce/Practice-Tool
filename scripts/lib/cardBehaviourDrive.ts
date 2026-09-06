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
  whenRunEffects,
  resetUidCounter,
} from "../../tests/harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { drawCard } from "../../src/core/utils.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  forceCompleteOrFizzlePendingTarget,
  resolvePendingTarget,
} from "../../src/logic/core/resolveTarget.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { attackLeader } from "../../src/logic/core/combat.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { consumeEarthSigils } from "../../src/logic/effects/ops/earth.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  fingerprintGameState,
  hashFingerprint,
} from "./cardBehaviourFingerprint.js";
import {
  applyGatePreparations,
  collectNamedGates,
  summarizeGateConditions,
  assertHarnessBoardCap,
  trimBoardToCap,
  HARNESS_BOARD_CAP,
  HARNESS_BOARD_RESERVE,
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
  | "super_evolve_unavailable"
  | "drive_threw"
  | "in_hand_event_undrivable";

export type ScenarioName =
  | "play"
  | "play_base"
  | "play_else"
  | "turn_boundary"
  | "evolve"
  | "super_evolve"
  | "vanilla_place"
  | "summon"
  | "in_hand";

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
  keywords?: unknown[];
  cant_play?: boolean;
};

export type DriveCardOptions = {
  isToken?: boolean;
};

function targetsHandSelectPool(target: string): boolean {
  const t = target.toLowerCase();
  if (t === "ally:hand" || t.startsWith("hand:")) return true;
  if (t.includes("hand_card")) return false;
  return t.includes(":hand");
}
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

export type HarnessArenaNeeds = {
  handKit: boolean;
  amuletKit: number;
  crystalspawnAlly: boolean;
  highCostAlly: boolean;
  namedBoardAllies: string[];
  reservesBoardSlot: boolean;
};

/** Data-derived arena prep selected per card (never a hard-coded id list). */
export function analyzeHarnessArenaNeeds(
  card: RawCard,
  gates: GateSpec[],
): HarnessArenaNeeds {
  let handKit = false;
  let crystalspawnAlly = false;
  let highCostAlly = false;
  const namedBoardAllies = new Set<string>();
  let amuletKit = 0;

  for (const g of gates) {
    if (g.condition === "amulet_count") {
      amuletKit = Math.max(amuletKit, g.count ?? 1);
    }
  }
  // Full amulet-board kit only when ≥3 amulets are required (Havencraft line).
  if (amuletKit < 3) amuletKit = 0;

  const playRoots: unknown[] = [...(card.fanfare ?? []), ...(card.spell ?? [])];
  const allRoots: unknown[] = [
    ...playRoots,
    ...(card.evolve ?? []),
    ...(card.superevolve ?? []),
    ...(card.triggers ?? []),
  ];

  walkEffects(playRoots, (obj) => {
    if (obj.optional === true) return;
    const target = String(obj.target ?? "");
    const op = String(obj.op ?? "");
    // Named follower required for keyword grants (e.g. Wings of Desire → Rulenye).
    if (op === "keyword" && obj.condition) {
      const c = obj.condition as Record<string, unknown>;
      if (String(c.name ?? "").trim()) namedBoardAllies.add(String(c.name));
    }
    // Discard-from-hand (implicit pool — no target string on the op).
    if (op === "discard" && String(obj.mode ?? "select") === "select") {
      handKit = true;
      return;
    }
    if (!targetsHandSelectPool(target)) return;
    if (op === "spellboost" || op === "stat" || op === "draw") return;
    if (obj.select === "all") return;
    if (op === "transform" && obj.mode === "random") return;
    const sel = obj.select ?? obj.select_count;
    if (op === "return" && obj.destination === "deck") {
      handKit = true;
      return;
    }
    if (op === "select" || sel != null) handKit = true;
  });

  walkEffects(playRoots, (obj) => {
    const target = String(obj.target ?? "").toLowerCase();
    const filter = obj.filter as Record<string, unknown> | undefined;
    if (
      (obj.op === "evolve" || obj.op === "select") &&
      target.includes("ally:follower") &&
      filter?.base_cost_gte != null &&
      Number(filter.base_cost_gte) >= 5
    ) {
      highCostAlly = true;
    }
  });

  walkEffects(allRoots, (obj) => {
    const target = String(obj.target ?? "").toLowerCase();

    const cond = obj.condition;
    if (
      (obj.op === "destroy" || obj.op === "select") &&
      target.includes("ally:follower") &&
      obj.condition
    ) {
      const c = obj.condition as Record<string, unknown>;
      if (String(c.name ?? "") === "Crystalspawn") crystalspawnAlly = true;
      if (String(c.name ?? "").trim()) namedBoardAllies.add(String(c.name));
      if (c.base_cost_gte != null && Number(c.base_cost_gte) >= 5) {
        highCostAlly = true;
      }
    }

    if (
      obj.op === "keyword" &&
      target.includes("ally:follower") &&
      obj.condition
    ) {
      const c = obj.condition as Record<string, unknown>;
      if (String(c.name ?? "").trim()) namedBoardAllies.add(String(c.name));
      if (c.base_cost_gte != null && Number(c.base_cost_gte) >= 5) {
        highCostAlly = true;
      }
    }

    if (obj.op === "gate" && obj.condition === "ally_matches") {
      if (obj.base_cost_gte != null && Number(obj.base_cost_gte) >= 5) {
        highCostAlly = true;
      }
    }
  });

  for (const g of gates) {
    if (g.condition === "board_name" && g.name) namedBoardAllies.add(g.name);
    if (g.condition === "ally_matches" && (g.base_cost_gte ?? 0) >= 5) {
      highCostAlly = true;
    }
  }

  const isSpell = String(card.type).toLowerCase() === "spell";
  // Hand kit only for spells (cluster-A skips). Follower/amulet fanfare hand
  // selects were already fingerprinted without extra hand cards.
  if (!isSpell) handKit = false;

  return {
    handKit,
    amuletKit,
    crystalspawnAlly,
    highCostAlly,
    namedBoardAllies: [...namedBoardAllies],
    reservesBoardSlot: !isSpell,
  };
}

function spellboostHandCard(): CardInstance {
  const sb = createCard(
    { name: "HarnessSpellboostable", type: "Spell", cost: 1 },
    "hand",
    "first",
  );
  (sb as any).keywords = [{ name: "Spellboost", effects: [] }];
  (sb as any).spellboostCount = 0;
  return sb;
}

function buildHandKit(): CardInstance[] {
  const high = createCard(
    {
      name: "HarnessHandHighCost",
      type: "Follower",
      cost: 5,
      attack: 3,
      defense: 3,
    },
    "hand",
    "first",
  );
  (high as any).base_cost = 5;
  return [
    createCard(
      {
        name: "HarnessHandFollower",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
      },
      "hand",
      "first",
    ),
    high,
    artifactFollower("HarnessHandArt", "first"),
    spellboostHandCard(),
    createCard(
      { name: "HarnessHandSpell", type: "Spell", cost: 1 },
      "hand",
      "first",
    ),
  ];
}

function applyArenaBoardPrep(needs: HarnessArenaNeeds): void {
  const maxAllied =
    HARNESS_BOARD_CAP - (needs.reservesBoardSlot ? HARNESS_BOARD_RESERVE : 0);

  if (needs.amuletKit > 0) {
    state.players.first.board = [];
    for (let i = 0; i < needs.amuletKit; i++) {
      state.players.first.board.push(
        createCard(
          {
            name: `HarnessAmulet${i + 1}`,
            type: "Amulet",
            cost: 1,
          },
          "board",
          "first",
        ),
      );
    }
  }

  const pushAlly = (spec: Record<string, unknown>) => {
    trimBoardToCap(state.players.first.board, maxAllied);
    state.players.first.board.push(createCard(spec as any, "board", "first"));
  };

  if (needs.crystalspawnAlly) {
    if (!state.players.first.board.some((c) => c.name === "Crystalspawn")) {
      pushAlly({
        name: "Crystalspawn",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
      });
    }
  }

  if (needs.highCostAlly) {
    const hasHigh = state.players.first.board.some((c) => {
      const bc =
        (c as any).base_cost !== undefined
          ? Number((c as any).base_cost)
          : Number(c.cost) || 0;
      return bc >= 5 && c.type === "Follower";
    });
    if (!hasHigh) {
      pushAlly({
        name: "HarnessBoardHighCost",
        type: "Follower",
        cost: 5,
        attack: 3,
        defense: 3,
        base_cost: 5,
      });
    }
  }

  for (const name of needs.namedBoardAllies) {
    if (!state.players.first.board.some((c) => c.name === name)) {
      pushAlly({
        name,
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
      });
    }
  }

  assertHarnessBoardCap("applyArenaBoardPrep");
}

function hasNonEmptyEffects(arr: unknown[] | undefined): boolean {
  return Array.isArray(arr) && arr.length > 0;
}

/** Lowest Enhance-tier cost that carries effects, or null if none. */
function lowestEnhanceTierCost(card: RawCard): number | null {
  if (!Array.isArray(card.keywords)) return null;
  let lowest = Infinity;
  for (const k of card.keywords) {
    if (!k || typeof k !== "object") continue;
    const kw = k as { name?: unknown; cost?: unknown; effects?: unknown };
    if (String(kw.name ?? "").toLowerCase() !== "enhance") continue;
    if (!Array.isArray(kw.effects) || kw.effects.length === 0) continue;
    const cost = Number(kw.cost);
    if (Number.isFinite(cost) && cost > 0 && cost < lowest) lowest = cost;
  }
  return Number.isFinite(lowest) ? lowest : null;
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

/** Follower enters the field via play/summon (not vanilla board placement). */
function hasAllyEnterTrigger(card: RawCard): boolean {
  let found = false;
  walkEffects(card.triggers ?? [], (obj) => {
    if (String(obj.event ?? "") === "ally_follower_enter") found = true;
  });
  return found;
}

type HandTriggerSpec = {
  event?: string;
  source?: string;
  condition?: Record<string, unknown>;
  effects?: unknown[];
};

function getHandTrigger(card: RawCard): HandTriggerSpec | null {
  for (const t of card.triggers ?? []) {
    if (!t || typeof t !== "object") continue;
    const trig = t as HandTriggerSpec;
    if (trig.source === "hand") return trig;
  }
  return null;
}

function hasHandSourceTrigger(card: RawCard): boolean {
  return getHandTrigger(card) != null;
}

function playGrantsCrestTurnBoundary(card: RawCard): boolean {
  const playRoots: unknown[] = [...(card.fanfare ?? []), ...(card.spell ?? [])];
  let found = false;
  walkEffects(playRoots, (obj) => {
    if (obj.op !== "crest" || obj.action !== "gain") return;
    walkEffects(obj.triggers ?? [], (t) => {
      const ev = String(t.event ?? "");
      if (ev === "end_of_turn" || ev === "start_of_turn") found = true;
    });
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
  if (lowestEnhanceTierCost(card) != null) {
    paths.push("play_base");
  }
  if (hasBoardTurnTrigger(card) || playGrantsCrestTurnBoundary(card)) {
    paths.push("turn_boundary");
  }
  if (hasNonEmptyEffects(card.evolve) || hasNonEmptyEffects(card.superevolve)) {
    paths.push("evolve");
  }
  if (hasNonEmptyEffects(card.superevolve)) {
    paths.push("super_evolve");
  }
  if (hasHandSourceTrigger(card)) {
    paths.push("in_hand");
  }
  const isFollower = String(card.type).toLowerCase() === "follower";
  if (
    paths.length === 0 &&
    isFollower &&
    hasAllyEnterTrigger(card) &&
    hasNonEmptyEffects(card.triggers)
  ) {
    paths.push("play");
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
  /** Override first-player PP (and maxPP). Default 10 — affords every Enhance tier. */
  firstPP?: number;
  arenaNeeds?: HarnessArenaNeeds;
}): void {
  resetUidCounter();
  state.gameStarted = true;
  const pp = opts.firstPP ?? 10;
  givenGameState({
    seed: HARNESS_SEED,
    activePlayer: opts.activePlayer ?? "first",
    turn: 1,
    roundCount: opts.roundCount ?? 8,
  })
    .withFirstHP(20)
    .withSecondHP(20)
    .withFirstPP(pp, pp)
    .withSecondPP(10, 10)
    .withFirstShadows(10)
    .withSecondShadows(10)
    .withFirstEvo(3)
    .withSecondEvo(3)
    .build();

  state.players.first.superEvoCharges = 3;
  state.players.second.superEvoCharges = 3;

  const needs = opts.arenaNeeds;
  const useAmuletKit = (needs?.amuletKit ?? 0) > 0;

  if (!useAmuletKit) {
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
  } else {
    state.players.second.board = [
      fillerFollower("ArenaEnemyA", "second", 2, 6),
      fillerFollower("ArenaEnemyB", "second", 3, 4),
    ];
  }

  if (needs) applyArenaBoardPrep(needs);

  const handExtras = [...(opts.extraHand ?? [])];
  if (needs?.handKit) handExtras.push(...buildHandKit());

  if (handExtras.length) {
    state.players.first.hand.push(...handExtras);
  }

  assertHarnessBoardCap("buildArena");
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
      const cond = obj.condition;
      if (
        cond &&
        typeof cond === "object" &&
        (cond as { has_keyword?: string }).has_keyword === "Spellboost"
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
  scenarioName: "play" | "play_else" | "play_base",
  opts: { firstPP?: number; arenaNeeds?: HarnessArenaNeeds } = {},
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  const extras = buildExtraHand(template);
  buildArena({
    extraHand: extras,
    roundCount: 8,
    firstPP: opts.firstPP,
    arenaNeeds: opts.arenaNeeds,
  });

  const playCard = createCard(cardId, "hand", "first");
  (playCard as any).cost = 0;
  (playCard as any).effectiveCost = 0;

  const prep = applyGatePreparations(gates, {
    mode,
    sourceCard: playCard,
  });
  const maxAllied = HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE;
  if (state.players.first.board.length > maxAllied) {
    trimBoardToCap(state.players.first.board, maxAllied);
  }
  assertHarnessBoardCap(`runPlayScenario:${scenarioName}:afterGatePrep`);

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
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  const raw = template as unknown as RawCard;
  const crestFromPlay =
    playGrantsCrestTurnBoundary(raw) && !hasBoardTurnTrigger(raw);

  if (crestFromPlay) {
    const extras = buildExtraHand(template);
    buildArena({
      extraHand: extras,
      roundCount: 8,
      activePlayer: "first",
      arenaNeeds,
    });
    const playCard = createCard(cardId, "hand", "first");
    (playCard as any).cost = 0;
    (playCard as any).effectiveCost = 0;
    const maxAllied = HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE;
    if (state.players.first.board.length > maxAllied) {
      trimBoardToCap(state.players.first.board, maxAllied);
    }
    const prep = applyGatePreparations(gates, {
      mode: "satisfy",
      sourceCard: playCard,
    });
    assertHarnessBoardCap("runTurnBoundaryScenario:crestPlay:afterGatePrep");
    state.players.first.hand = [playCard, ...state.players.first.hand];
    const outcome = whenPlayCard("first", 0);
    if (outcome.kind === "blocked") {
      return {
        skip: "play_blocked",
        detail: outcome.reason ?? "blocked",
      };
    }
    if (state.pendingTargetEffect) {
      const resolved = autoResolvePending();
      if (!resolved.ok) {
        return {
          skip: "unresolvable_pending",
          detail: resolved.reason ?? "pending_after_play",
        };
      }
    }
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

  buildArena({ roundCount: 8, activePlayer: "first", arenaNeeds });

  const host = createCard(cardId, "board", "first");
  if (host.type === "Follower") {
    host.defense = Math.max(Number(host.defense) || 1, 10);
    host.attack = Number(host.attack) || 0;
  }
  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: host,
  });
  assertHarnessBoardCap("runTurnBoundaryScenario:afterGatePrep");
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

function runEvolveLikeScenario(
  cardId: string,
  gates: GateSpec[],
  mode: "normal" | "super",
  scenarioName: "evolve" | "super_evolve",
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };
  if (String(template.type).toLowerCase() !== "follower") {
    const skipReason: SkipReason =
      mode === "super" ? "super_evolve_unavailable" : "evolve_unavailable";
    return { skip: skipReason, detail: "not_a_follower" };
  }

  buildArena({ roundCount: 8, activePlayer: "first", arenaNeeds });
  const host = createCard(cardId, "board", "first");
  host.defense = Math.max(Number(host.defense) || 1, 8);
  host.justPlayed = false;
  host.can_attack = false;
  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: host,
  });
  assertHarnessBoardCap(`run${scenarioName}Scenario:afterGatePrep`);
  trimBoardToCap(
    state.players.first.board,
    HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
  );
  state.players.first.board = [host, ...state.players.first.board];
  state.players.first.evoCharges = 3;
  state.players.first.superEvoCharges = 3;
  state.players.first.evoUsedThisTurn = false;

  try {
    dispatchAction(state, {
      type: "EVOLVE",
      player: "first",
      cardUid: host.uid,
      mode,
    });
  } catch (err) {
    const skipReason: SkipReason =
      mode === "super" ? "super_evolve_unavailable" : "evolve_unavailable";
    return {
      skip: skipReason,
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
    scenario: scenarioName,
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
  };
}

function runEvolveScenario(
  cardId: string,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  return runEvolveLikeScenario(cardId, gates, "normal", "evolve", arenaNeeds);
}

function runSuperEvolveScenario(
  cardId: string,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  return runEvolveLikeScenario(
    cardId,
    gates,
    "super",
    "super_evolve",
    arenaNeeds,
  );
}

function engageAmuletOnBoard(): CardInstance {
  return createCard(
    {
      name: "HarnessEngageAmulet",
      type: "Amulet",
      cost: 1,
      keywords: [
        {
          name: "Engage",
          sacrifice: true,
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    },
    "board",
    "first",
  );
}

function earthSigilOnBoard(): CardInstance {
  const sigil = createCard(
    {
      name: "Earth Sigil",
      type: "Amulet",
      cost: 2,
      counters: { earth: 2 },
    },
    "board",
    "first",
  );
  (sigil as any).counters = { earth: 2 };
  return sigil;
}

function resolvePendingOrFail(
  context: string,
): { ok: true } | { skip: SkipReason; detail: string } {
  if (!state.pendingTargetEffect) return { ok: true };
  const resolved = autoResolvePending();
  if (!resolved.ok) {
    return {
      skip: "unresolvable_pending",
      detail: `${context}:${resolved.reason ?? "pending"}`,
    };
  }
  return { ok: true };
}

function fireInHandTriggerEvent(
  event: string,
  handCard: CardInstance,
  handTrigger: HandTriggerSpec,
): { ok: true } | { skip: SkipReason; detail: string } {
  switch (event) {
    case "ally_super_evolve": {
      trimBoardToCap(
        state.players.first.board,
        HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
      );
      const host = fillerFollower("HarnessInHandSuperEvo", "first", 2, 8);
      host.justPlayed = false;
      state.players.first.board.push(host);
      state.players.first.evoCharges = 3;
      state.players.first.superEvoCharges = 3;
      state.players.first.evoUsedThisTurn = false;
      try {
        dispatchAction(state, {
          type: "EVOLVE",
          player: "first",
          cardUid: host.uid,
          mode: "super",
        });
      } catch (err) {
        return {
          skip: "super_evolve_unavailable",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      return resolvePendingOrFail("ally_super_evolve");
    }
    case "enemy_super_evolve": {
      whenEndTurn();
      let pending = resolvePendingOrFail("enemy_super_eot_pass");
      if (!("ok" in pending)) return pending;
      trimBoardToCap(
        state.players.second.board,
        HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
      );
      const host = fillerFollower("HarnessEnemySuperEvo", "second", 2, 8);
      host.justPlayed = false;
      state.players.second.board.push(host);
      state.players.second.evoCharges = 3;
      state.players.second.superEvoCharges = 3;
      state.players.second.evoUsedThisTurn = false;
      try {
        dispatchAction(state, {
          type: "EVOLVE",
          player: "second",
          cardUid: host.uid,
          mode: "super",
        });
      } catch (err) {
        return {
          skip: "super_evolve_unavailable",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      return resolvePendingOrFail("enemy_super_evolve");
    }
    case "ally_evolve": {
      trimBoardToCap(
        state.players.first.board,
        HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
      );
      const host = fillerFollower("HarnessInHandEvo", "first", 2, 8);
      host.justPlayed = false;
      state.players.first.board.push(host);
      state.players.first.evoCharges = 3;
      state.players.first.superEvoCharges = 3;
      state.players.first.evoUsedThisTurn = false;
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
      return resolvePendingOrFail("ally_evolve");
    }
    case "ally_follower_enter": {
      const minCost = Number(handTrigger.condition?.base_cost_gte ?? 5);
      const enter = createCard(
        {
          name: "HarnessInHandEnter",
          type: "Follower",
          cost: minCost,
          attack: 3,
          defense: 3,
          base_cost: minCost,
        },
        "hand",
        "first",
      );
      (enter as any).base_cost = minCost;
      (enter as any).cost = 0;
      (enter as any).effectiveCost = 0;
      state.players.first.hand.push(enter);
      trimBoardToCap(
        state.players.first.board,
        HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
      );
      const idx = state.players.first.hand.indexOf(enter);
      const outcome = whenPlayCard("first", idx);
      if (outcome.kind === "blocked") {
        return {
          skip: "play_blocked",
          detail: outcome.reason ?? "enter_play_blocked",
        };
      }
      return resolvePendingOrFail("ally_follower_enter");
    }
    case "ally_card_played": {
      const filler = createCard(
        { name: "HarnessInHandPlayFiller", type: "Spell", cost: 0 },
        "hand",
        "first",
      );
      (filler as any).cost = 0;
      (filler as any).effectiveCost = 0;
      state.players.first.hand.push(filler);
      const idx = state.players.first.hand.findIndex(
        (c) => c.uid === filler.uid,
      );
      const outcome = whenPlayCard("first", idx);
      if (outcome.kind === "blocked") {
        return {
          skip: "play_blocked",
          detail: outcome.reason ?? "ally_card_played_blocked",
        };
      }
      return resolvePendingOrFail("ally_card_played");
    }
    case "end_of_turn": {
      whenEndTurn();
      return resolvePendingOrFail("in_hand_first_eot");
    }
    case "when_drawn": {
      drawCard(state.players.first.hand, state.players.first.deck, "first");
      return { ok: true };
    }
    case "engage": {
      trimBoardToCap(
        state.players.first.board,
        HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
      );
      const amulet = engageAmuletOnBoard();
      state.players.first.board.push(amulet);
      const idx = getBoard(state, "first").indexOf(amulet);
      if (idx < 0) {
        return {
          skip: "in_hand_event_undrivable",
          detail: "engage_amulet_missing",
        };
      }
      try {
        engageAmulet("first", idx);
      } catch (err) {
        return {
          skip: "drive_threw",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      return resolvePendingOrFail("engage");
    }
    case "ally_earth_rite": {
      trimBoardToCap(
        state.players.first.board,
        HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
      );
      state.players.first.board.push(earthSigilOnBoard());
      if (!consumeEarthSigils("first")) {
        return {
          skip: "in_hand_event_undrivable",
          detail: "earth_sigil_consume_failed",
        };
      }
      return { ok: true };
    }
    case "on_fuse": {
      const filler = createCard(
        { name: "HarnessFuseMaterial", type: "Follower", cost: 1 },
        "hand",
        "first",
      );
      state.players.first.hand.push(filler);
      try {
        startFuseFromHand("first", handCard.uid);
      } catch (err) {
        return {
          skip: "in_hand_event_undrivable",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      if (state.pendingTargetEffect) {
        resolvePendingTarget(filler.uid);
        if (state.pendingTargetEffect) {
          forceCompleteOrFizzlePendingTarget();
        }
      }
      return resolvePendingOrFail("on_fuse");
    }
    case "ally_follower_leaves_field": {
      trimBoardToCap(
        state.players.first.board,
        HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
      );
      const victim = fillerFollower("HarnessLeaveVictim", "first", 1, 1);
      state.players.first.board.push(victim);
      whenRunEffects(
        [
          {
            op: "destroy",
            target: "ally:follower",
            filter: { uid: victim.uid },
          },
        ],
        "first",
        null,
      );
      return resolvePendingOrFail("ally_follower_leaves_field");
    }
    default:
      return {
        skip: "in_hand_event_undrivable",
        detail: `unsupported_event:${event}`,
      };
  }
}

function runInHandScenario(
  cardId: string,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };
  const raw = template as unknown as RawCard;
  const handTrigger = getHandTrigger(raw);
  if (!handTrigger) {
    return { skip: "in_hand_event_undrivable", detail: "no_hand_trigger" };
  }
  const event = String(handTrigger.event ?? "");
  if (!event) {
    return { skip: "in_hand_event_undrivable", detail: "missing_event" };
  }

  buildArena({ roundCount: 8, activePlayer: "first", arenaNeeds });
  const handCard = createCard(cardId, "hand", "first");
  if (event !== "on_fuse" && event !== "when_drawn") {
    (handCard as any).cost = handCard.cost ?? (Number(template.cost) || 0);
  }

  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: handCard,
  });
  const maxAllied = HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE;
  if (state.players.first.board.length > maxAllied) {
    trimBoardToCap(state.players.first.board, maxAllied);
  }
  assertHarnessBoardCap("runInHandScenario:afterGatePrep");

  if (event === "when_drawn") {
    state.players.first.deck.push(handCard);
  } else {
    state.players.first.hand = [handCard, ...state.players.first.hand];
  }

  const fired = fireInHandTriggerEvent(event, handCard, handTrigger);
  if (!("ok" in fired)) return fired;

  const detail = fingerprintGameState(state);
  return {
    scenario: "in_hand",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
  };
}

function runVanillaPlaceScenario(
  cardId: string,
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  buildArena({ roundCount: 3, arenaNeeds });
  const isSpell = String(template.type).toLowerCase() === "spell";
  if (isSpell) {
    const card = createCard(cardId, "hand", "first");
    (card as any).cost = 0;
    state.players.first.hand = [card, ...state.players.first.hand];
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
    trimBoardToCap(
      state.players.first.board,
      HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
    );
    const host = createCard(cardId, "board", "first");
    state.players.first.board = [host, ...state.players.first.board];
  }

  assertHarnessBoardCap("runVanillaPlaceScenario");

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

function hasEngageKeyword(card: CardInstance): boolean {
  const kws = (card as { keywords?: unknown[] }).keywords ?? [];
  for (const k of kws) {
    if (typeof k === "string" && k === "Engage") return true;
    if (
      k &&
      typeof k === "object" &&
      (k as { name?: string }).name === "Engage"
    ) {
      return true;
    }
  }
  return false;
}

function readyAttacker(card: CardInstance): void {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
}

function runSummonScenario(
  cardId: string,
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  buildArena({ roundCount: 8, activePlayer: "first", arenaNeeds });
  const card = makeCardFromDB(template, "first");
  pushToBoard(state.players.first.board, "first", card);

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

  const type = String(template.type).toLowerCase();
  if (type === "follower") {
    readyAttacker(card);
    const idx = getBoard(state, "first").indexOf(card);
    if (idx >= 0) {
      try {
        attackLeader(idx, "first", "second");
      } catch (err) {
        return {
          skip: "drive_threw",
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }
  } else if (type === "amulet") {
    if (hasEngageKeyword(card)) {
      const idx = getBoard(state, "first").indexOf(card);
      if (idx >= 0) {
        try {
          engageAmulet("first", idx);
        } catch (err) {
          return {
            skip: "drive_threw",
            detail: err instanceof Error ? err.message : String(err),
          };
        }
        if (state.pendingTargetEffect) {
          const resolved = autoResolvePending();
          if (!resolved.ok) {
            return {
              skip: "unresolvable_pending",
              detail: resolved.reason ?? "pending_after_engage",
            };
          }
        }
      }
    }
  }

  const detail = fingerprintGameState(state);
  return {
    scenario: "summon",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: [],
    gatesUnmet: [],
  };
}

/**
 * Drive one card through classified scenarios with gate preparation.
 */
export function driveCard(
  raw: RawCard,
  opts: DriveCardOptions = {},
): CardDriveResult {
  const id = String(raw.id);
  const name = raw.name ?? id;
  const template = getCardById(id);
  if (!template) {
    return { status: "skipped", id, name, reason: "card_not_in_registry" };
  }

  const gates = collectNamedGates(raw);
  const gateSummary = summarizeGateConditions(gates);
  const arenaNeeds = analyzeHarnessArenaNeeds(raw, gates);

  installModePicks();
  try {
    const paths =
      opts.isToken && raw.cant_play
        ? (["summon"] as ScenarioName[])
        : classifyPaths(raw);
    const scenarios: ScenarioResult[] = [];
    const failures: { skip: SkipReason; detail: string }[] = [];
    const satisfiedAll = new Set<string>();
    const unmetAll = new Set<string>(gateSummary.unpreparable);

    for (const path of paths) {
      let result: ScenarioResult | { skip: SkipReason; detail: string };
      try {
        if (path === "play") {
          result = runPlayScenario(id, gates, "satisfy", "play", {
            arenaNeeds,
          });
          // Also drive else_effects branches for preparable gates that have them.
          if (
            !isSkip(result) &&
            gateSummary.withElse.some((c) => gateSummary.preparable.includes(c))
          ) {
            const elseResult = runPlayScenario(id, gates, "deny", "play_else", {
              arenaNeeds,
            });
            if (!isSkip(elseResult)) {
              scenarios.push(elseResult);
              for (const c of elseResult.gatesSatisfied ?? [])
                satisfiedAll.add(c);
              for (const c of elseResult.gatesUnmet ?? []) unmetAll.add(c);
            }
          }
        } else if (path === "play_base") {
          const lowest = lowestEnhanceTierCost(raw);
          // PP strictly below the cheapest Enhance tier → base form only.
          const firstPP = lowest != null && lowest > 1 ? lowest - 1 : 0;
          result = runPlayScenario(id, gates, "satisfy", "play_base", {
            firstPP,
            arenaNeeds,
          });
        } else if (path === "turn_boundary")
          result = runTurnBoundaryScenario(id, gates, arenaNeeds);
        else if (path === "evolve")
          result = runEvolveScenario(id, gates, arenaNeeds);
        else if (path === "super_evolve")
          result = runSuperEvolveScenario(id, gates, arenaNeeds);
        else if (path === "in_hand")
          result = runInHandScenario(id, gates, arenaNeeds);
        else if (path === "summon") result = runSummonScenario(id, arenaNeeds);
        else result = runVanillaPlaceScenario(id, arenaNeeds);
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
      token?: true;
    }
  | {
      status: "partial";
      name: string;
      fingerprint: string;
      scenarios: { scenario: ScenarioName; fingerprint: string }[];
      gatesSatisfied?: string[];
      unmetGates: string[];
      token?: true;
    }
  | {
      status: "skipped";
      name: string;
      reason: SkipReason;
      detail?: string;
      token?: true;
    };

export type BehaviourBaseline = {
  /** Regenerated by `npm run cards:baseline` — never hand-edit. */
  _generated: string;
  version: number;
  seed: number;
  cardCount: number;
  tokenCount: number;
  covered: number;
  partial: number;
  skipped: number;
  skipReasons: Record<string, number>;
  unmetGateCounts: Record<string, number>;
  cards: Record<string, BaselineCardEntry>;
};

export type ToBaselineEntryOptions = {
  token?: boolean;
};

export function toBaselineEntry(
  result: CardDriveResult,
  opts: ToBaselineEntryOptions = {},
): BaselineCardEntry {
  const tokenFlag = opts.token ? { token: true as const } : {};
  if (result.status === "skipped") {
    return {
      status: "skipped",
      name: result.name,
      reason: result.reason,
      ...(result.detail ? { detail: result.detail } : {}),
      ...tokenFlag,
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
      ...tokenFlag,
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
    ...tokenFlag,
  };
}
