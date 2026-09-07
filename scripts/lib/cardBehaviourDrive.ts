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
import {
  attackFollower,
  attackLeader,
  effectiveAttackEligibility,
  recomputeAttackFlags,
} from "../../src/logic/core/combat.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { consumeEarthSigils } from "../../src/logic/effects/ops/earth.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { resolvePlayCost } from "../../src/logic/core/playCard/cost.js";
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
  | "in_hand"
  | "destroy"
  | "engage"
  | "combat"
  | "accelerate"
  | "crystallize"
  | "crystallize_engage"
  | "crystallize_death";

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

function isLastWordsKeywordName(name: string): boolean {
  const n = name.toLowerCase().replace(/\s+/g, "");
  return n === "lastwords" || n === "last_words";
}

/** Last Words / last_words keyword on this card's board form (not nested Crystallize amulet text). */
function keywordEntryHasDeathEffects(k: unknown): boolean {
  if (typeof k === "string") return isLastWordsKeywordName(k);
  if (!k || typeof k !== "object") return false;
  const kw = k as { name?: unknown; effects?: unknown[] };
  if (!isLastWordsKeywordName(String(kw.name ?? ""))) return false;
  return Array.isArray(kw.effects) && kw.effects.length > 0;
}

function hasLastWordsKeywordEffects(card: RawCard): boolean {
  for (const k of card.keywords ?? []) {
    if (keywordEntryHasDeathEffects(k)) return true;
  }
  return false;
}

function hasLastWordsTriggerEffects(card: RawCard): boolean {
  for (const t of card.triggers ?? []) {
    if (!t || typeof t !== "object") continue;
    const trig = t as { event?: string; type?: string; effects?: unknown[] };
    const ev = String(trig.event ?? trig.type ?? "").toLowerCase();
    if (ev !== "last_words") continue;
    if (hasNonEmptyEffects(trig.effects)) return true;
  }
  return false;
}

/** Top-level last_words script (compiler output) on this card form. */
function hasLastWordsScript(card: RawCard): boolean {
  const lw = (card as { last_words?: unknown[] }).last_words;
  return hasNonEmptyEffects(lw);
}

/**
 * Board triggers that fire when this card leaves the field (death-adjacent).
 * Excludes watchers on other cards leaving (e.g. Lifestealer, Bayle in hand).
 */
function hasLeavesFieldDeathTrigger(card: RawCard): boolean {
  for (const t of card.triggers ?? []) {
    if (!t || typeof t !== "object") continue;
    const trig = t as {
      event?: string;
      type?: string;
      source?: string;
      effects?: unknown[];
    };
    if (trig.source !== "board") continue;
    const ev = String(trig.event ?? trig.type ?? "").toLowerCase();
    if (!ev.includes("leaves_field") && !ev.includes("leave_field")) continue;
    if (!hasNonEmptyEffects(trig.effects)) continue;
    // Self-leave only: effect targets self or has no off-board condition naming others.
    let targetsSelf = false;
    walkEffects(trig.effects, (obj) => {
      const target = String(obj.target ?? "").toLowerCase();
      if (target === "self" || target.includes("this")) targetsSelf = true;
    });
    if (targetsSelf) return true;
  }
  return false;
}

/** Data-derived: card should be destroyed in harness to exercise on-death effects. */
export function hasDestroyOnDeathEffects(card: RawCard): boolean {
  return (
    hasLastWordsKeywordEffects(card) ||
    hasLastWordsTriggerEffects(card) ||
    hasLastWordsScript(card) ||
    hasLeavesFieldDeathTrigger(card)
  );
}

function isEngageKeywordName(name: string): boolean {
  return name.toLowerCase() === "engage";
}

/** Engage keyword on this card's board form with a non-empty effect list. */
function keywordEntryHasEngageEffects(k: unknown): boolean {
  if (typeof k === "string") return isEngageKeywordName(k);
  if (!k || typeof k !== "object") return false;
  const kw = k as { name?: unknown; effects?: unknown[] };
  if (!isEngageKeywordName(String(kw.name ?? ""))) return false;
  return Array.isArray(kw.effects) && kw.effects.length > 0;
}

export function hasEngageKeywordEffects(card: RawCard): boolean {
  for (const k of card.keywords ?? []) {
    if (keywordEntryHasEngageEffects(k)) return true;
  }
  return false;
}

function hasEngageTriggerEffects(card: RawCard): boolean {
  for (const t of card.triggers ?? []) {
    if (!t || typeof t !== "object") continue;
    const trig = t as { event?: string; type?: string; effects?: unknown[] };
    const ev = String(trig.event ?? trig.type ?? "").toLowerCase();
    if (ev !== "engage") continue;
    if (hasNonEmptyEffects(trig.effects)) return true;
  }
  return false;
}

/** Data-derived: card carries Engage keyword effects or an engage trigger. */
export function hasEngageAbility(card: RawCard): boolean {
  return hasEngageKeywordEffects(card) || hasEngageTriggerEffects(card);
}

const COMBAT_TRIGGER_EVENTS = new Set(["strike", "follower_strike", "clash"]);

function hasCombatTriggerEntryEffects(card: RawCard): boolean {
  for (const t of card.triggers ?? []) {
    if (!t || typeof t !== "object") continue;
    const trig = t as { event?: string; type?: string; effects?: unknown[] };
    const ev = String(trig.event ?? trig.type ?? "").toLowerCase();
    if (!COMBAT_TRIGGER_EVENTS.has(ev)) continue;
    if (hasNonEmptyEffects(trig.effects)) return true;
  }
  return false;
}

/** Data-derived: card carries strike / follower_strike / clash trigger effects. */
export function hasCombatTriggerEffects(card: RawCard): boolean {
  return hasCombatTriggerEntryEffects(card);
}

function isAccelerateKeywordName(name: string): boolean {
  return name.toLowerCase() === "accelerate";
}

function isCrystallizeKeywordName(name: string): boolean {
  return name.toLowerCase() === "crystallize";
}

type AccelerateFormSpec = { cost: number; effects: unknown[] };
type CrystallizeFormSpec = { cost: number; amuletKeywords: unknown[] };

function getAccelerateForm(card: RawCard): AccelerateFormSpec | null {
  for (const k of card.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const kw = k as { name?: unknown; cost?: unknown; effects?: unknown[] };
    if (!isAccelerateKeywordName(String(kw.name ?? ""))) continue;
    if (!Array.isArray(kw.effects) || kw.effects.length === 0) continue;
    const cost = Number(kw.cost);
    if (!Number.isFinite(cost) || cost < 0) continue;
    return { cost, effects: kw.effects };
  }
  return null;
}

function getCrystallizeForm(card: RawCard): CrystallizeFormSpec | null {
  for (const k of card.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const kw = k as {
      name?: unknown;
      cost?: unknown;
      amuletKeywords?: unknown[];
    };
    if (!isCrystallizeKeywordName(String(kw.name ?? ""))) continue;
    if (!Array.isArray(kw.amuletKeywords) || kw.amuletKeywords.length === 0) {
      continue;
    }
    const cost = Number(kw.cost);
    if (!Number.isFinite(cost) || cost < 0) continue;
    return { cost, amuletKeywords: kw.amuletKeywords };
  }
  return null;
}

/** Data-derived: Accelerate keyword with a non-empty effects array. */
export function hasAccelerateForm(card: RawCard): boolean {
  return getAccelerateForm(card) != null;
}

/** Data-derived: Crystallize keyword with a non-empty amuletKeywords array. */
export function hasCrystallizeForm(card: RawCard): boolean {
  return getCrystallizeForm(card) != null;
}

function hasCrystallizeAmuletEngage(card: RawCard): boolean {
  const form = getCrystallizeForm(card);
  if (!form) return false;
  for (const k of form.amuletKeywords) {
    if (keywordEntryHasEngageEffects(k)) return true;
  }
  return false;
}

function hasCrystallizeAmuletLastWords(card: RawCard): boolean {
  const form = getCrystallizeForm(card);
  if (!form) return false;
  for (const k of form.amuletKeywords) {
    if (keywordEntryHasDeathEffects(k)) return true;
  }
  return false;
}

function crystallizeAmuletEngageCost(card: RawCard): number {
  const form = getCrystallizeForm(card);
  if (!form) return 0;
  for (const k of form.amuletKeywords) {
    if (!k || typeof k !== "object") continue;
    const kw = k as { name?: unknown; cost?: unknown };
    if (!isEngageKeywordName(String(kw.name ?? ""))) continue;
    return Number(kw.cost ?? 0);
  }
  return 0;
}

function printedBaseCost(card: RawCard): number {
  const n = Number(card.cost);
  if (Number.isFinite(n)) return n;
  return parseInt(String(card.cost ?? ""), 10) || 0;
}

function alternateFormFirstPP(
  alternateCost: number,
  printedCost: number,
  extraPP = 0,
): number | { skip: SkipReason; detail: string } {
  const firstPP = alternateCost + extraPP;
  if (alternateCost >= printedCost) {
    return { skip: "drive_threw", detail: "alternate_cost_not_below_printed" };
  }
  if (firstPP >= printedCost) {
    return {
      skip: "drive_threw",
      detail: "alternate_pp_setup_not_below_printed",
    };
  }
  return firstPP;
}

function engageCostFromRaw(card: RawCard): number {
  for (const k of card.keywords ?? []) {
    if (!k || typeof k !== "object") continue;
    const kw = k as { name?: unknown; cost?: unknown };
    if (!isEngageKeywordName(String(kw.name ?? ""))) continue;
    return Number(kw.cost ?? 0);
  }
  return 0;
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

/** True when a classified scenario fingerprints the subject card entering the field. */
function scenarioPlacesSubjectOnBoard(scenario: ScenarioName): boolean {
  switch (scenario) {
    case "in_hand":
      return false;
    case "play":
    case "play_base":
    case "play_else":
    case "evolve":
    case "super_evolve":
    case "vanilla_place":
    case "summon":
    case "turn_boundary":
    case "destroy":
    case "engage":
    case "combat":
    case "accelerate":
    case "crystallize":
    case "crystallize_engage":
    case "crystallize_death":
      return true;
    default:
      return false;
  }
}

function hasScenarioPlacingOnBoard(paths: ScenarioName[]): boolean {
  return paths.some(scenarioPlacesSubjectOnBoard);
}

export function classifyPaths(card: RawCard): ScenarioName[] {
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
  if (hasDestroyOnDeathEffects(card)) {
    paths.push("destroy");
  }
  if (hasEngageAbility(card)) {
    paths.push("engage");
  }
  if (hasCombatTriggerEffects(card)) {
    paths.push("combat");
  }
  if (hasAccelerateForm(card)) {
    paths.push("accelerate");
  }
  if (hasCrystallizeForm(card)) {
    paths.push("crystallize");
    if (hasCrystallizeAmuletEngage(card)) {
      paths.push("crystallize_engage");
    }
    if (hasCrystallizeAmuletLastWords(card)) {
      paths.push("crystallize_death");
    }
  }
  const isFollower = String(card.type).toLowerCase() === "follower";
  if (
    isFollower &&
    hasAllyEnterTrigger(card) &&
    hasNonEmptyEffects(card.triggers) &&
    !paths.includes("play")
  ) {
    paths.push("play");
  }
  if (!hasScenarioPlacingOnBoard(paths)) {
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

/** Zero-cost sacrifice Engage helper — keywords applied so engageAmulet sees hasEngage. */
function engageAmuletOnBoard(): CardInstance {
  const card = createCard(
    {
      name: "HarnessEngageAmulet",
      type: "Amulet",
      cost: 1,
      keywords: [
        {
          name: "Engage",
          cost: 0,
          sacrifice: true,
          effects: [{ op: "draw", source: "deck", count: 1 }],
        },
      ],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(card);
  return card;
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

function runDestroyScenario(
  cardId: string,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  buildArena({ roundCount: 8, activePlayer: "first", arenaNeeds });

  trimBoardToCap(
    state.players.first.board,
    HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
  );

  const host = makeCardFromDB(template, "first");
  if (host.type === "Follower") {
    host.justPlayed = false;
    host.defense = Math.max(Number(host.defense) || 1, 3);
  }

  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: host,
  });

  if (!pushToBoard(state.players.first.board, "first", host)) {
    return { skip: "play_blocked", detail: "board_full" };
  }

  assertHarnessBoardCap("runDestroyScenario:beforeDestroy");

  const hostOnBoard = getBoard(state, "first").find((c) => c.uid === host.uid);
  if (!hostOnBoard) {
    return { skip: "drive_threw", detail: "host_missing_after_place" };
  }

  if (!destroyTarget(hostOnBoard, "first", "harness_destroy")) {
    return { skip: "drive_threw", detail: "destroy_target_failed" };
  }
  cleanupDead();
  flushDeferredDeathBatch();

  const pending = resolvePendingOrFail("destroy_after_death");
  if (!("ok" in pending)) return pending;

  const detail = fingerprintGameState(state);
  return {
    scenario: "destroy",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
  };
}

/** Prefer the plain arena follower over Ward/other targets for stable trades. */
function arenaEnemyADefenderIndex(): number {
  const board = getBoard(state, "second");
  const idx = board.findIndex((c) => c.name === "ArenaEnemyA");
  return idx >= 0 ? idx : 0;
}

/** Ward blocks non-Ward targets — strip it so ArenaEnemyA is attackable. */
function clearEnemyWardBlockers(): void {
  for (const card of getBoard(state, "second")) {
    if (card.type !== "Follower") continue;
    if (!card.hasWard) continue;
    card.hasWard = false;
    if (Array.isArray((card as any).keywords)) {
      (card as any).keywords = (card as any).keywords.filter(
        (k: unknown) =>
          !(
            k === "Ward" ||
            (k &&
              typeof k === "object" &&
              (k as { name?: string }).name === "Ward")
          ),
      );
    }
  }
}

function prepareCombatAttacker(card: CardInstance): void {
  card.justPlayed = false;
  card.hasAttacked = false;
  const per = Number.isFinite(card.attacks_per_turn)
    ? (card.attacks_per_turn as number)
    : 1;
  card.attacks_left = per;
  card.attacks_used_this_turn = 0;
  applyKeywordsFromList(card);
  recomputeAttackFlags(card);
}

function combatAttackObserved(
  attacker: CardInstance,
  defender: CardInstance,
  before: {
    defenderDef: number;
    attacksUsed: number;
    attacksLeft: number;
  },
): boolean {
  const defAfter = parseInt(defender.defense as any, 10) || 0;
  const attacksUsedAfter = attacker.attacks_used_this_turn ?? 0;
  const attacksLeftAfter =
    attacker.attacks_left ??
    (Number.isFinite(attacker.attacks_per_turn)
      ? (attacker.attacks_per_turn as number)
      : 1);
  return (
    attacksUsedAfter > before.attacksUsed ||
    defAfter < before.defenderDef ||
    attacksLeftAfter < before.attacksLeft ||
    !!attacker.hasAttacked
  );
}

function runCombatScenario(
  cardId: string,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  buildArena({ roundCount: 8, activePlayer: "first", firstPP: 10, arenaNeeds });

  trimBoardToCap(
    state.players.first.board,
    HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
  );

  const host = makeCardFromDB(template, "first");
  prepareCombatAttacker(host);

  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: host,
  });

  if (!pushToBoard(state.players.first.board, "first", host)) {
    return { skip: "play_blocked", detail: "board_full" };
  }

  assertHarnessBoardCap("runCombatScenario:beforeAttack");

  const hostOnBoard = getBoard(state, "first").find((c) => c.uid === host.uid);
  if (!hostOnBoard) {
    return { skip: "drive_threw", detail: "host_missing_after_place" };
  }

  prepareCombatAttacker(hostOnBoard);
  if (!effectiveAttackEligibility(hostOnBoard)) {
    return { skip: "drive_threw", detail: "attacker_cannot_attack" };
  }

  clearEnemyWardBlockers();

  const attackerIdx = getBoard(state, "first").indexOf(hostOnBoard);
  const defenderIdx = arenaEnemyADefenderIndex();
  const defenderBoard = getBoard(state, "second");
  const defender = defenderBoard[defenderIdx];
  if (!defender || defender.type !== "Follower") {
    return { skip: "drive_threw", detail: "defender_missing" };
  }

  const before = {
    defenderDef: parseInt(defender.defense as any, 10) || 0,
    attacksUsed: hostOnBoard.attacks_used_this_turn ?? 0,
    attacksLeft:
      hostOnBoard.attacks_left ??
      (Number.isFinite(hostOnBoard.attacks_per_turn)
        ? (hostOnBoard.attacks_per_turn as number)
        : 1),
  };

  const outcome = attackFollower(attackerIdx, defenderIdx, "first", "second");
  if (outcome.kind === "blocked") {
    return {
      skip: "drive_threw",
      detail: `attack_blocked:${outcome.reason}`,
    };
  }

  const defenderAfter = defenderBoard[defenderIdx] ?? defender;
  if (!combatAttackObserved(hostOnBoard, defenderAfter, before)) {
    return { skip: "drive_threw", detail: "attack_did_not_resolve" };
  }

  const pending = resolvePendingOrFail("combat_after");
  if (!("ok" in pending)) return pending;

  const detail = fingerprintGameState(state);
  return {
    scenario: "combat",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
  };
}

function runEngageScenario(
  cardId: string,
  raw: RawCard,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  const ownEngage = hasEngageKeywordEffects(raw);
  const engageCost = ownEngage ? engageCostFromRaw(raw) : 0;
  const firstPP = Math.max(10, engageCost + 2);

  buildArena({ roundCount: 8, activePlayer: "first", firstPP, arenaNeeds });

  trimBoardToCap(
    state.players.first.board,
    HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE,
  );

  const host = makeCardFromDB(template, "first");
  if (host.type === "Follower") {
    host.justPlayed = false;
  }

  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: host,
  });

  if (!pushToBoard(state.players.first.board, "first", host)) {
    return { skip: "play_blocked", detail: "board_full" };
  }

  assertHarnessBoardCap("runEngageScenario:beforeEngage");

  let engageIndex = -1;
  if (ownEngage) {
    const hostOnBoard = getBoard(state, "first").find(
      (c) => c.uid === host.uid,
    );
    if (!hostOnBoard) {
      return { skip: "drive_threw", detail: "host_missing_after_place" };
    }
    engageIndex = getBoard(state, "first").indexOf(hostOnBoard);
  } else {
    const helper = engageAmuletOnBoard();
    state.players.first.board.push(helper);
    engageIndex = getBoard(state, "first").indexOf(helper);
  }

  if (engageIndex < 0) {
    return { skip: "drive_threw", detail: "engage_target_missing" };
  }

  const ppBefore = state.players.first.pp;
  try {
    engageAmulet("first", engageIndex);
  } catch (err) {
    return {
      skip: "drive_threw",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (engageCost > 0 && state.players.first.pp >= ppBefore) {
    return { skip: "drive_threw", detail: "engage_cost_not_paid" };
  }

  const pending = resolvePendingOrFail("engage_after");
  if (!("ok" in pending)) return pending;

  const detail = fingerprintGameState(state);
  return {
    scenario: "engage",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: prep.satisfied,
    gatesUnmet: prep.unmet,
  };
}

function findPlayedCard(uid: string): CardInstance | undefined {
  const zones = [
    ...state.players.first.hand,
    ...state.players.first.board,
    ...state.players.first.graveyard,
    ...state.players.first.banish,
    ...state.players.second.hand,
    ...state.players.second.board,
    ...state.players.second.graveyard,
    ...state.players.second.banish,
  ];
  return zones.find((c) => c.uid === uid);
}

function findCrystallizeAmuletOnBoard(
  cardId: string,
  name: string,
): CardInstance | undefined {
  return getBoard(state, "first").find(
    (c) => c.id === cardId || c.name === name,
  );
}

function setupAlternateFormPlay(
  cardId: string,
  expectedMode: "accelerate" | "crystallize",
  firstPP: number,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
):
  | {
      playCard: CardInstance;
      prep: { satisfied: string[]; unmet: string[] };
    }
  | { skip: SkipReason; detail: string } {
  const template = getCardById(cardId);
  if (!template) return { skip: "card_not_in_registry", detail: cardId };

  const extras = buildExtraHand(template);
  buildArena({
    extraHand: extras,
    roundCount: 8,
    firstPP,
    arenaNeeds,
  });

  const playCard = createCard(cardId, "hand", "first");
  const plan = resolvePlayCost(playCard, state.players.first.pp);
  if (plan.mode !== expectedMode) {
    return { skip: "drive_threw", detail: "alternate_form_not_selected" };
  }

  const prep = applyGatePreparations(gates, {
    mode: "satisfy",
    sourceCard: playCard,
  });
  const maxAllied = HARNESS_BOARD_CAP - HARNESS_BOARD_RESERVE;
  if (state.players.first.board.length > maxAllied) {
    trimBoardToCap(state.players.first.board, maxAllied);
  }
  assertHarnessBoardCap(`runAlternateForm:${expectedMode}:afterGatePrep`);

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

  const played = findPlayedCard(playCard.uid);
  const playedAs = (played as { playedAs?: string } | undefined)?.playedAs;
  if (playedAs !== expectedMode) {
    return { skip: "drive_threw", detail: "alternate_form_not_selected" };
  }

  return { playCard, prep };
}

function runAccelerateScenario(
  cardId: string,
  raw: RawCard,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const form = getAccelerateForm(raw);
  if (!form) return { skip: "drive_threw", detail: "no_accelerate_form" };
  const printedCost = printedBaseCost(raw);
  const ppSetup = alternateFormFirstPP(form.cost, printedCost);
  if (typeof ppSetup !== "number") return ppSetup;

  const played = setupAlternateFormPlay(
    cardId,
    "accelerate",
    ppSetup,
    gates,
    arenaNeeds,
  );
  if (!("playCard" in played)) return played;

  const pending = resolvePendingOrFail("accelerate_after");
  if (!("ok" in pending)) return pending;

  const detail = fingerprintGameState(state);
  return {
    scenario: "accelerate",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: played.prep.satisfied,
    gatesUnmet: played.prep.unmet,
  };
}

function runCrystallizeScenario(
  cardId: string,
  raw: RawCard,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const form = getCrystallizeForm(raw);
  if (!form) return { skip: "drive_threw", detail: "no_crystallize_form" };
  const printedCost = printedBaseCost(raw);
  const ppSetup = alternateFormFirstPP(form.cost, printedCost);
  if (typeof ppSetup !== "number") return ppSetup;

  const played = setupAlternateFormPlay(
    cardId,
    "crystallize",
    ppSetup,
    gates,
    arenaNeeds,
  );
  if (!("playCard" in played)) return played;

  const pending = resolvePendingOrFail("crystallize_after");
  if (!("ok" in pending)) return pending;

  const detail = fingerprintGameState(state);
  return {
    scenario: "crystallize",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: played.prep.satisfied,
    gatesUnmet: played.prep.unmet,
  };
}

function runCrystallizeEngageScenario(
  cardId: string,
  raw: RawCard,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const form = getCrystallizeForm(raw);
  if (!form) return { skip: "drive_threw", detail: "no_crystallize_form" };
  const printedCost = printedBaseCost(raw);
  const engageCost = crystallizeAmuletEngageCost(raw);
  const ppSetup = alternateFormFirstPP(form.cost, printedCost, engageCost);
  if (typeof ppSetup !== "number") return ppSetup;

  const played = setupAlternateFormPlay(
    cardId,
    "crystallize",
    ppSetup,
    gates,
    arenaNeeds,
  );
  if (!("playCard" in played)) return played;

  const amulet = findCrystallizeAmuletOnBoard(cardId, raw.name ?? cardId);
  if (!amulet || amulet.type !== "Amulet") {
    return { skip: "drive_threw", detail: "crystallize_amulet_missing" };
  }

  const engageIndex = getBoard(state, "first").indexOf(amulet);
  if (engageIndex < 0) {
    return { skip: "drive_threw", detail: "engage_target_missing" };
  }

  const ppBefore = state.players.first.pp;
  try {
    engageAmulet("first", engageIndex);
  } catch (err) {
    return {
      skip: "drive_threw",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (engageCost > 0 && state.players.first.pp >= ppBefore) {
    return { skip: "drive_threw", detail: "engage_cost_not_paid" };
  }

  const pending = resolvePendingOrFail("crystallize_engage_after");
  if (!("ok" in pending)) return pending;

  const detail = fingerprintGameState(state);
  return {
    scenario: "crystallize_engage",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: played.prep.satisfied,
    gatesUnmet: played.prep.unmet,
  };
}

function runCrystallizeDeathScenario(
  cardId: string,
  raw: RawCard,
  gates: GateSpec[],
  arenaNeeds?: HarnessArenaNeeds,
): ScenarioResult | { skip: SkipReason; detail: string } {
  const form = getCrystallizeForm(raw);
  if (!form) return { skip: "drive_threw", detail: "no_crystallize_form" };
  const printedCost = printedBaseCost(raw);
  const ppSetup = alternateFormFirstPP(form.cost, printedCost);
  if (typeof ppSetup !== "number") return ppSetup;

  const played = setupAlternateFormPlay(
    cardId,
    "crystallize",
    ppSetup,
    gates,
    arenaNeeds,
  );
  if (!("playCard" in played)) return played;

  const amulet = findCrystallizeAmuletOnBoard(cardId, raw.name ?? cardId);
  if (!amulet || amulet.type !== "Amulet") {
    return { skip: "drive_threw", detail: "crystallize_amulet_missing" };
  }

  if (!destroyTarget(amulet, "first", "harness_crystallize_death")) {
    return { skip: "drive_threw", detail: "destroy_target_failed" };
  }
  cleanupDead();
  flushDeferredDeathBatch();

  const pending = resolvePendingOrFail("crystallize_death_after");
  if (!("ok" in pending)) return pending;

  const detail = fingerprintGameState(state);
  return {
    scenario: "crystallize_death",
    fingerprint: hashFingerprint(detail),
    detail,
    gatesSatisfied: played.prep.satisfied,
    gatesUnmet: played.prep.unmet,
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
        else if (path === "destroy")
          result = runDestroyScenario(id, gates, arenaNeeds);
        else if (path === "engage")
          result = runEngageScenario(id, raw, gates, arenaNeeds);
        else if (path === "combat")
          result = runCombatScenario(id, gates, arenaNeeds);
        else if (path === "accelerate")
          result = runAccelerateScenario(id, raw, gates, arenaNeeds);
        else if (path === "crystallize")
          result = runCrystallizeScenario(id, raw, gates, arenaNeeds);
        else if (path === "crystallize_engage")
          result = runCrystallizeEngageScenario(id, raw, gates, arenaNeeds);
        else if (path === "crystallize_death")
          result = runCrystallizeDeathScenario(id, raw, gates, arenaNeeds);
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
