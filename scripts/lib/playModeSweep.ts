/**
 * Play-mode cost-boundary sweep.
 *
 * Drives every Enhance / Crystallize / Accelerate card through
 * `whenPlayCard` → `playCardNoRender` at every PP boundary that
 * matters. Never plays a card by calling an effect handler or
 * `pickEnhanceTiers` — those paths have produced wrong conclusions
 * in this repo before.
 *
 * State identity uses `hashGameState` (src/core/stateHash.ts), not
 * the shallow `captureStateSnapshot` helper.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { isCardDatabaseInitialized } from "../../src/data/cardIndex.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { state } from "../../src/core/gameState.js";
import {
  getLogs,
  clearLogs,
  setConsoleMirroring,
} from "../../src/core/logger.js";
import {
  getPP,
  getBoard,
  getHand,
  getGraveyard,
  getCrests,
  getBanish,
} from "../../src/core/playerHelpers.js";
import { resolvePlayCost } from "../../src/logic/core/playCard/cost.js";
import type { PlayCostPlan } from "../../src/logic/core/playCard/cost.js";
import type { PlayOutcome } from "../../src/logic/core/playCard/types.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
} from "../../tests/harness/builders.js";
import "../../src/logic/core/effects/index.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..", "..");
export const ALL_CARDS_PATH = path.join(ROOT, "cards", "all.json");
export const FILLER_DECK_ID = "10111310";
export const SWEEP_SEED = 42;
export const STATE_HASH_FN = "hashGameState" as const;

export const INVARIANT_IDS = ["I1", "I2", "I3", "I4", "I5", "I6"] as const;
export type InvariantId = (typeof INVARIANT_IDS)[number];

export type AlternateKind = "accelerate" | "crystallize";
export type PlayCostMode = "enhance" | "normal" | "accelerate" | "crystallize";

export type SweepKeywordKind = "Enhance" | "Crystallize" | "Accelerate";

export type AlternateSpec = { kind: AlternateKind; cost: number };

export type SweepCard = {
  id: string;
  name: string;
  type: string;
  description: string;
  cost: number;
  enhanceTiers: number[];
  alternates: AlternateSpec[];
  keywords: SweepKeywordKind[];
};

export type ExpectedRoute =
  | { mode: "enhance"; cost: number; enhanceTiers: number[] }
  | { mode: "normal"; cost: number }
  | { mode: "accelerate"; cost: number }
  | { mode: "crystallize"; cost: number }
  | { mode: "rejected" };

export type PlanSummary = {
  mode: PlayCostMode;
  cost: number;
  enhanceTiers: number[];
  alternate: { kind: string; cost: number } | null;
  effectivePlayCost: number;
};

export type InvariantCheck = {
  id: InvariantId;
  passed: boolean;
  applicable: boolean;
  expected: unknown;
  observed: unknown;
  detail: string;
};

export type PlayLogEvent = {
  type: string;
  details: Record<string, unknown>;
};

export type PlayEventSummary = {
  recoveredPP: number;
  extraSpendPP: number;
  drawn: number;
  addedToHand: number;
  bounced: number;
  discarded: number;
  returnedToDeck: number;
  removedNames: string[];
  removedUids: string[];
};

export type SweepCaseRecord = {
  cardId: string;
  name: string;
  printedType: string;
  description: string;
  cardEnhanceTiers: number[];
  cardNormalCost: number;
  cardAlternates: AlternateSpec[];
  pp: number;
  boardFull: boolean;
  plan: PlanSummary;
  expectedRoute: ExpectedRoute;
  ppBefore: number;
  ppAfter: number;
  accepted: boolean;
  rejected: boolean;
  outcomeKind: "done" | "paused" | "blocked" | "threw";
  outcomeReason: string | null;
  boardBefore: number;
  boardAfter: number;
  handBefore: number;
  handAfter: number;
  graveyardBefore: number;
  graveyardAfter: number;
  crestBefore: number;
  crestAfter: number;
  extraSummons: number;
  playEvents: PlayLogEvent[];
  recoveredPP: number;
  extraSpendPP: number;
  drawn: number;
  addedToHand: number;
  bounced: number;
  discarded: number;
  returnedToDeck: number;
  playedCardRemovedByLog: boolean;
  playedCardOnOwnBoard: boolean;
  cardInGraveyard: boolean;
  cardInBanish: boolean;
  exception: string | null;
  hashBefore: string;
  hashAfter: string;
  hashFn: typeof STATE_HASH_FN;
  checks: Record<InvariantId, InvariantCheck>;
};

export type SweepReport = {
  generatedAt: string;
  hashFn: typeof STATE_HASH_FN;
  engineRule: string;
  cardCount: number;
  cards: SweepCard[];
  caseCount: number;
  runtimeMs: number;
  cases: SweepCaseRecord[];
  failures: Record<InvariantId, SweepCaseRecord[]>;
  failureCount: number;
  alternateFormWhenAffordable: {
    id: string;
    name: string;
    type: string;
    normalCost: number;
    alternates: AlternateSpec[];
    note: string;
  }[];
};

export const ENGINE_RULE_QUOTE =
  "src/logic/core/playCard/cost.ts resolvePlayCost(card, availablePP) returns a plan " +
  '{ mode: "enhance" | "normal" | "accelerate" | "crystallize", cost, enhanceTiers, ' +
  "alternate, effectivePlayCost }: Enhance whenever at least one tier is affordable " +
  "(pickEnhanceTiers; all affordable tiers are returned; cost = the highest affordable " +
  "tier), unless the player has the crest passive suppress_fanfare_enhance; otherwise " +
  "normal when availablePP >= effectivePlayCost; otherwise an alternate form via " +
  "pickAlternateForm (src/helpers/alternateForm.ts: activates when PP is below the " +
  "normal effective cost but at or above an alternate cost; highest payable alternate " +
  "wins); otherwise normal (unaffordable — the play must be rejected).";

type RawKeyword = {
  name?: unknown;
  cost?: unknown;
  effects?: unknown;
  amuletKeywords?: unknown;
};

type RawCard = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  cost?: unknown;
  description?: unknown;
  keywords?: unknown;
};

function keywordName(k: unknown): string {
  if (!k || typeof k !== "object") return "";
  return String((k as RawKeyword).name ?? "");
}

function keywordCost(k: unknown): number | null {
  if (!k || typeof k !== "object") return null;
  const n = Number((k as RawKeyword).cost);
  return Number.isFinite(n) ? n : null;
}

/** Parse Enhance / Crystallize / Accelerate entries from a keywords array. */
export function parsePlayModeKeywords(keywords: unknown): {
  enhanceTiers: number[];
  alternates: AlternateSpec[];
  kinds: SweepKeywordKind[];
} {
  const enhanceTiers: number[] = [];
  const alternates: AlternateSpec[] = [];
  const kindSet = new Set<SweepKeywordKind>();
  const list = Array.isArray(keywords) ? keywords : [];
  for (const k of list) {
    const name = keywordName(k).toLowerCase();
    const cost = keywordCost(k);
    if (name === "enhance") {
      kindSet.add("Enhance");
      if (cost != null && cost > 0) enhanceTiers.push(cost);
    } else if (name === "crystallize") {
      kindSet.add("Crystallize");
      if (cost != null && cost >= 0) {
        alternates.push({ kind: "crystallize", cost });
      }
    } else if (name === "accelerate") {
      kindSet.add("Accelerate");
      if (cost != null && cost >= 0) {
        alternates.push({ kind: "accelerate", cost });
      }
    }
  }
  enhanceTiers.sort((a, b) => a - b);
  alternates.sort((a, b) => b.cost - a.cost);
  return { enhanceTiers, alternates, kinds: [...kindSet] };
}

export function loadSweepCards(
  allJsonPath: string = ALL_CARDS_PATH,
): SweepCard[] {
  const raw = JSON.parse(fs.readFileSync(allJsonPath, "utf-8"));
  if (!Array.isArray(raw)) {
    throw new Error("cards/all.json is not an array");
  }
  const out: SweepCard[] = [];
  for (const card of raw as RawCard[]) {
    if (!card || typeof card.id !== "string") continue;
    const parsed = parsePlayModeKeywords(card.keywords);
    if (!parsed.kinds.length) continue;
    out.push({
      id: card.id,
      name: String(card.name ?? card.id),
      type: String(card.type ?? ""),
      description: String(card.description ?? ""),
      cost: Number(card.cost) || 0,
      enhanceTiers: parsed.enhanceTiers,
      alternates: parsed.alternates,
      keywords: parsed.kinds,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/**
 * For every threshold T take {T−1, T, T+1}, add 10, clip to 0…10,
 * de-duplicate, sort.
 */
export function buildPpGrid(thresholds: number[]): number[] {
  const set = new Set<number>();
  for (const t of thresholds) {
    if (!Number.isFinite(t)) continue;
    for (const delta of [-1, 0, 1]) {
      const v = t + delta;
      if (v >= 0 && v <= 10) set.add(v);
    }
  }
  set.add(10);
  return [...set].sort((a, b) => a - b);
}

export function thresholdsForCard(card: SweepCard): number[] {
  return [
    card.cost,
    ...card.enhanceTiers,
    ...card.alternates.map((a) => a.cost),
  ];
}

/**
 * Documented play-route rule, computed from keyword costs + PP.
 * Independent of `pickEnhanceTiers` / `resolvePlayCost`.
 */
export function expectedRouteFromSpec(
  spec: {
    enhanceTiers: number[];
    normalCost: number;
    alternates: AlternateSpec[];
  },
  pp: number,
): ExpectedRoute {
  const affordable = spec.enhanceTiers
    .filter((t) => t > 0 && pp >= t)
    .slice()
    .sort((a, b) => a - b);
  if (affordable.length) {
    return {
      mode: "enhance",
      cost: affordable[affordable.length - 1]!,
      enhanceTiers: affordable,
    };
  }
  if (pp >= spec.normalCost) {
    return { mode: "normal", cost: spec.normalCost };
  }
  let best: AlternateSpec | null = null;
  for (const alt of spec.alternates) {
    if (pp >= alt.cost && (!best || alt.cost > best.cost)) best = alt;
  }
  if (best) {
    return { mode: best.kind, cost: best.cost };
  }
  return { mode: "rejected" };
}

export function summarizePlan(plan: PlayCostPlan): PlanSummary {
  return {
    mode: plan.mode,
    cost: plan.cost,
    enhanceTiers: (plan.enhanceTiers ?? []).map((t) => t.cost),
    alternate: plan.alternate
      ? { kind: plan.alternate.kind, cost: plan.alternate.cost }
      : null,
    effectivePlayCost: plan.effectivePlayCost,
  };
}

function sameNumberList(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function check(
  id: InvariantId,
  applicable: boolean,
  passed: boolean,
  expected: unknown,
  observed: unknown,
  detail: string,
): InvariantCheck {
  return {
    id,
    passed: applicable ? passed : true,
    applicable,
    expected,
    observed,
    detail,
  };
}

function eventPlayer(details: Record<string, unknown>): string | undefined {
  if (typeof details.owner === "string") return details.owner;
  if (typeof details.player === "string") return details.player;
  if (typeof details.from === "string") return details.from;
  return undefined;
}

function isPlayerEvent(
  details: Record<string, unknown>,
  player: string,
): boolean {
  const who = eventPlayer(details);
  return who == null || who === player;
}

function pushUnique(list: string[], value: unknown): void {
  if (typeof value !== "string" || !value) return;
  if (!list.includes(value)) list.push(value);
}

/**
 * Fold play-path `logEvent` rows into the I1'/I6' correction terms.
 * Per-card `draw` events (uid/card) win over a preceding `{ count }` so
 * unified draw + drawCard are not double-counted.
 */
export function summarizePlayEvents(
  events: PlayLogEvent[],
  player: string = "first",
): PlayEventSummary {
  let recoveredPP = 0;
  let extraSpendPP = 0;
  let addedToHand = 0;
  let bounced = 0;
  let discarded = 0;
  let returnedToDeck = 0;
  const removedNames: string[] = [];
  const removedUids: string[] = [];
  const perCardDraws: PlayLogEvent[] = [];
  const countOnlyDraws: PlayLogEvent[] = [];

  for (const ev of events) {
    const d = ev.details ?? {};
    switch (ev.type) {
      case "recoverPP":
        if (isPlayerEvent(d, player)) {
          recoveredPP += Number(d.amount) || 0;
        }
        break;
      case "spendPP":
        if (isPlayerEvent(d, player)) {
          extraSpendPP += Number(d.amount) || 0;
        }
        break;
      case "draw":
        if (!isPlayerEvent(d, player)) break;
        if (d.uid != null || d.card != null) perCardDraws.push(ev);
        else if (typeof d.count === "number") countOnlyDraws.push(ev);
        break;
      case "add_to_hand":
        if (isPlayerEvent(d, player)) addedToHand += 1;
        break;
      case "bounceToHand":
        if (isPlayerEvent(d, player)) {
          bounced += 1;
          pushUnique(removedNames, d.name);
          pushUnique(removedUids, d.oldUid);
        }
        break;
      case "bounce":
        pushUnique(removedNames, d.target);
        break;
      case "discard":
        if (isPlayerEvent(d, player)) discarded += Number(d.count) || 0;
        break;
      case "returnHandToDeck":
        if (isPlayerEvent(d, player)) {
          returnedToDeck += 1;
          pushUnique(removedNames, d.card);
          pushUnique(removedUids, d.uid);
        }
        break;
      case "returnHandToDeckAll":
      case "returnHandToDeckRandom":
        if (isPlayerEvent(d, player)) returnedToDeck += Number(d.count) || 0;
        break;
      case "destroy":
      case "destroyQueued":
        pushUnique(removedNames, d.target ?? d.card);
        pushUnique(removedUids, d.uid);
        break;
      case "death":
      case "banish":
        pushUnique(removedNames, d.card ?? d.target);
        pushUnique(removedUids, d.uid);
        break;
      default:
        break;
    }
  }

  const drawn =
    perCardDraws.length > 0
      ? perCardDraws.length
      : countOnlyDraws.reduce(
          (sum, ev) => sum + (Number(ev.details.count) || 0),
          0,
        );

  return {
    recoveredPP,
    extraSpendPP,
    drawn,
    addedToHand,
    bounced,
    discarded,
    returnedToDeck,
    removedNames,
    removedUids,
  };
}

export function playedCardNamedInRemovalLog(
  summary: PlayEventSummary,
  played: { name: string; uid: string },
): boolean {
  return (
    summary.removedUids.includes(played.uid) ||
    summary.removedNames.includes(played.name)
  );
}

/** Capture `logEvent` rows emitted during `fn` even under HEADLESS. */
export function capturePlayEvents(fn: () => void): PlayLogEvent[] {
  const g = globalThis as { HEADLESS?: boolean };
  const prevHeadless = g.HEADLESS;
  g.HEADLESS = false;
  setConsoleMirroring(false);
  clearLogs();
  try {
    fn();
    return getLogs().map((entry) => ({
      type: String(entry.type ?? ""),
      details: (entry.details ?? {}) as Record<string, unknown>,
    }));
  } finally {
    g.HEADLESS = prevHeadless;
    setConsoleMirroring(false);
    clearLogs();
  }
}

function applyEventSummary(
  rec: SweepCaseRecord,
  played?: { name: string; uid: string },
): void {
  const summary = summarizePlayEvents(rec.playEvents);
  rec.recoveredPP = summary.recoveredPP;
  rec.extraSpendPP = summary.extraSpendPP;
  rec.drawn = summary.drawn;
  rec.addedToHand = summary.addedToHand;
  rec.bounced = summary.bounced;
  rec.discarded = summary.discarded;
  rec.returnedToDeck = summary.returnedToDeck;
  rec.playedCardRemovedByLog = played
    ? playedCardNamedInRemovalLog(summary, played)
    : rec.playedCardRemovedByLog;
}

/** I1': accepted ⇒ ppAfter === ppBefore − plan.cost + Σ recoverPP − Σ spendPP */
export function checkI1(rec: SweepCaseRecord): InvariantCheck {
  const expected =
    rec.ppBefore - rec.plan.cost + rec.recoveredPP - rec.extraSpendPP;
  if (!rec.accepted) {
    return check(
      "I1",
      false,
      true,
      "n/a (play not accepted)",
      { ppAfter: rec.ppAfter },
      "I1 applies only to accepted plays",
    );
  }
  return check(
    "I1",
    true,
    rec.ppAfter === expected,
    expected,
    rec.ppAfter,
    `accepted ⇒ ppAfter === ppBefore − plan.cost + recoveredPP − extraSpendPP (${rec.ppBefore} − ${rec.plan.cost} + ${rec.recoveredPP} − ${rec.extraSpendPP})`,
  );
}

/**
 * I2: plan matches the documented rule (or the play is rejected when
 * nothing is affordable).
 */
export function checkI2(rec: SweepCaseRecord): InvariantCheck {
  const expected = expectedRouteFromSpec(
    {
      enhanceTiers: rec.cardEnhanceTiers,
      normalCost: rec.cardNormalCost,
      alternates: rec.cardAlternates,
    },
    rec.pp,
  );
  if (expected.mode === "rejected") {
    const planClaimsSpecialForm =
      rec.plan.mode === "enhance" ||
      rec.plan.mode === "accelerate" ||
      rec.plan.mode === "crystallize";
    return check(
      "I2",
      true,
      rec.rejected === true && !planClaimsSpecialForm,
      { mode: "rejected" },
      {
        rejected: rec.rejected,
        mode: rec.plan.mode,
        cost: rec.plan.cost,
        enhanceTiers: rec.plan.enhanceTiers,
      },
      "no affordable Enhance / normal / alternate ⇒ play rejected and plan is not a special form",
    );
  }
  const modeOk = rec.plan.mode === expected.mode;
  const costOk = rec.plan.cost === expected.cost;
  const tiersOk =
    expected.mode !== "enhance" ||
    sameNumberList(rec.plan.enhanceTiers, expected.enhanceTiers);
  const passed = modeOk && costOk && tiersOk;
  return check(
    "I2",
    true,
    passed,
    expected,
    {
      mode: rec.plan.mode,
      cost: rec.plan.cost,
      enhanceTiers: rec.plan.enhanceTiers,
    },
    "plan mode/cost/tiers match the documented resolvePlayCost rule",
  );
}

/** I3: rejected ⇒ state hash unchanged and pp unchanged */
export function checkI3(rec: SweepCaseRecord): InvariantCheck {
  if (!rec.rejected) {
    return check(
      "I3",
      false,
      true,
      "n/a (play not rejected)",
      { hashAfter: rec.hashAfter, ppAfter: rec.ppAfter },
      "I3 applies only to rejected plays",
    );
  }
  const hashOk = rec.hashAfter === rec.hashBefore;
  const ppOk = rec.ppAfter === rec.ppBefore;
  return check(
    "I3",
    true,
    hashOk && ppOk,
    { hash: rec.hashBefore, pp: rec.ppBefore },
    { hash: rec.hashAfter, pp: rec.ppAfter },
    "rejected ⇒ hashGameState unchanged and pp unchanged",
  );
}

/**
 * I4 (full board only):
 * - follower or Crystallize-amulet play is rejected, board unchanged
 * - Accelerate at an affordable alternate cost is accepted
 * - a spell's Enhance is not rejected for a full board
 */
export function checkI4(rec: SweepCaseRecord): InvariantCheck {
  if (!rec.boardFull) {
    return check(
      "I4",
      false,
      true,
      "n/a (board not full)",
      { boardAfter: rec.boardAfter },
      "I4 applies only to the full-board case",
    );
  }

  const planIsAccelerate = rec.plan.mode === "accelerate";
  const planIsCrystallize = rec.plan.mode === "crystallize";
  const printedPermanent =
    rec.printedType === "Follower" || rec.printedType === "Amulet";
  const playsAsPermanent =
    !planIsAccelerate && (planIsCrystallize || printedPermanent);
  const isSpellEnhance =
    rec.printedType === "Spell" && rec.plan.mode === "enhance";

  if (playsAsPermanent) {
    const boardUnchanged = rec.boardAfter === rec.boardBefore;
    return check(
      "I4",
      true,
      rec.rejected === true && boardUnchanged,
      { rejected: true, boardAfter: rec.boardBefore },
      {
        rejected: rec.rejected,
        boardAfter: rec.boardAfter,
        reason: rec.outcomeReason,
      },
      "full board: follower / Crystallize-amulet play is rejected and board is unchanged",
    );
  }

  if (planIsAccelerate) {
    return check(
      "I4",
      true,
      rec.accepted === true,
      { accepted: true },
      {
        accepted: rec.accepted,
        reason: rec.outcomeReason,
        kind: rec.outcomeKind,
      },
      "full board: Accelerate at an affordable alternate cost is accepted (needs no slot)",
    );
  }

  if (isSpellEnhance) {
    const blockedByBoard = rec.outcomeReason === "Board is full.";
    return check(
      "I4",
      true,
      blockedByBoard === false,
      { rejectedForBoardFull: false },
      { reason: rec.outcomeReason, rejected: rec.rejected },
      "full board: a spell's Enhance is unaffected by the board",
    );
  }

  return check(
    "I4",
    false,
    true,
    "n/a",
    { mode: rec.plan.mode, type: rec.printedType },
    "full-board I4 has no branch for this plan/type",
  );
}

/** I5: no exception escapes a play */
export function checkI5(rec: SweepCaseRecord): InvariantCheck {
  return check(
    "I5",
    true,
    rec.exception === null,
    null,
    rec.exception,
    "no exception escapes whenPlayCard / resolvePlayCost",
  );
}

/**
 * I6': accepted ⇒ handAfter === handBefore − 1 + draws + add_to_hand +
 * bounceToHand − discards − returnHandToDeck. Follower/amulet: the played
 * card is on the own board unless a logged bounce/return/destroy names it.
 * Spell/Accelerate: the card is in the graveyard or banished.
 */
export function checkI6(rec: SweepCaseRecord): InvariantCheck {
  if (!rec.accepted) {
    return check(
      "I6",
      false,
      true,
      "n/a (play not accepted)",
      { handAfter: rec.handAfter, boardAfter: rec.boardAfter },
      "I6 applies only to accepted plays",
    );
  }

  const expectedHand =
    rec.handBefore -
    1 +
    rec.drawn +
    rec.addedToHand +
    rec.bounced -
    rec.discarded -
    rec.returnedToDeck;
  const handOk = rec.handAfter === expectedHand;
  const isSpellPlay =
    rec.plan.mode === "accelerate" || rec.printedType === "Spell";

  if (isSpellPlay) {
    const destOk = rec.cardInGraveyard || rec.cardInBanish;
    return check(
      "I6",
      true,
      handOk && destOk,
      {
        handAfter: expectedHand,
        inGraveyardOrBanish: true,
      },
      {
        handAfter: rec.handAfter,
        cardInGraveyard: rec.cardInGraveyard,
        cardInBanish: rec.cardInBanish,
        drawn: rec.drawn,
        addedToHand: rec.addedToHand,
        bounced: rec.bounced,
      },
      "accepted spell/Accelerate ⇒ hand delta matches logged draw/add/bounce/discard/return and the card is in the graveyard or banished",
    );
  }

  const boardOk = rec.playedCardOnOwnBoard || rec.playedCardRemovedByLog;
  return check(
    "I6",
    true,
    handOk && boardOk,
    {
      handAfter: expectedHand,
      playedCardOnOwnBoard: !rec.playedCardRemovedByLog,
    },
    {
      handAfter: rec.handAfter,
      playedCardOnOwnBoard: rec.playedCardOnOwnBoard,
      playedCardRemovedByLog: rec.playedCardRemovedByLog,
      boardAfter: rec.boardAfter,
      extraSummons: rec.extraSummons,
      drawn: rec.drawn,
      addedToHand: rec.addedToHand,
      bounced: rec.bounced,
    },
    "accepted follower/amulet ⇒ hand delta matches logged draw/add/bounce/discard/return; played card on board unless a logged bounce/return/destroy names it",
  );
}

export function evaluateInvariants(
  rec: SweepCaseRecord,
): Record<InvariantId, InvariantCheck> {
  return {
    I1: checkI1(rec),
    I2: checkI2(rec),
    I3: checkI3(rec),
    I4: checkI4(rec),
    I5: checkI5(rec),
    I6: checkI6(rec),
  };
}

/**
 * Minimal record for unit-testing the invariant functions. Callers
 * override the fields under test; everything else is a harmless default.
 */
export function syntheticSweepCase(
  overrides: Partial<SweepCaseRecord> = {},
): SweepCaseRecord {
  const base: SweepCaseRecord = {
    cardId: "SYNTH",
    name: "Synthetic",
    printedType: "Follower",
    description: "Synthetic probe card.",
    cardEnhanceTiers: [7],
    cardNormalCost: 5,
    cardAlternates: [],
    pp: 7,
    boardFull: false,
    plan: {
      mode: "enhance",
      cost: 7,
      enhanceTiers: [7],
      alternate: null,
      effectivePlayCost: 5,
    },
    expectedRoute: { mode: "enhance", cost: 7, enhanceTiers: [7] },
    ppBefore: 7,
    ppAfter: 0,
    accepted: true,
    rejected: false,
    outcomeKind: "done",
    outcomeReason: null,
    boardBefore: 0,
    boardAfter: 1,
    handBefore: 1,
    handAfter: 0,
    graveyardBefore: 0,
    graveyardAfter: 0,
    crestBefore: 0,
    crestAfter: 0,
    extraSummons: 0,
    playEvents: [],
    recoveredPP: 0,
    extraSpendPP: 0,
    drawn: 0,
    addedToHand: 0,
    bounced: 0,
    discarded: 0,
    returnedToDeck: 0,
    playedCardRemovedByLog: false,
    playedCardOnOwnBoard: true,
    cardInGraveyard: false,
    cardInBanish: false,
    exception: null,
    hashBefore: "aaaa",
    hashAfter: "bbbb",
    hashFn: STATE_HASH_FN,
    checks: {} as Record<InvariantId, InvariantCheck>,
  };
  const merged = { ...base, ...overrides };
  if (overrides.plan) {
    merged.plan = { ...base.plan, ...overrides.plan };
  }
  if (overrides.playEvents) {
    applyEventSummary(merged, { name: merged.name, uid: "synth" });
    if (overrides.recoveredPP !== undefined) {
      merged.recoveredPP = overrides.recoveredPP;
    }
    if (overrides.extraSpendPP !== undefined) {
      merged.extraSpendPP = overrides.extraSpendPP;
    }
    if (overrides.drawn !== undefined) merged.drawn = overrides.drawn;
    if (overrides.addedToHand !== undefined) {
      merged.addedToHand = overrides.addedToHand;
    }
    if (overrides.bounced !== undefined) merged.bounced = overrides.bounced;
    if (overrides.discarded !== undefined) {
      merged.discarded = overrides.discarded;
    }
    if (overrides.returnedToDeck !== undefined) {
      merged.returnedToDeck = overrides.returnedToDeck;
    }
    if (overrides.playedCardRemovedByLog !== undefined) {
      merged.playedCardRemovedByLog = overrides.playedCardRemovedByLog;
    }
  }
  merged.expectedRoute = expectedRouteFromSpec(
    {
      enhanceTiers: merged.cardEnhanceTiers,
      normalCost: merged.cardNormalCost,
      alternates: merged.cardAlternates,
    },
    merged.pp,
  );
  merged.checks = evaluateInvariants(merged);
  return merged;
}

export async function ensureSweepCardDb(): Promise<void> {
  if (!isCardDatabaseInitialized()) {
    await initCardDatabaseNode();
  }
}

function boardFillers(cardName: string): { name: string; type: "Follower" }[] {
  const out: { name: string; type: "Follower" }[] = [];
  for (let i = 0; i < 5; i++) {
    const name = `SweepFiller${i}`;
    if (name === cardName) {
      throw new Error(`Filler name collided with card under test: ${cardName}`);
    }
    out.push({ name, type: "Follower" });
  }
  return out;
}

function deckFillers(): string[] {
  return Array.from({ length: 10 }, () => FILLER_DECK_ID);
}

function zoneHasUid(zone: CardInstance[], uid: string): boolean {
  return zone.some((c) => c?.uid === uid);
}

function summarizeException(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function runSweepCase(
  card: SweepCard,
  pp: number,
  boardFull: boolean,
): SweepCaseRecord {
  resetUidCounter();

  const board = boardFull ? boardFillers(card.name) : [];
  givenGameState({
    seed: SWEEP_SEED,
    activePlayer: "first",
    turn: 1,
    roundCount: 10,
  })
    .withFirstHand([card.id])
    .withFirstBoard(board)
    .withFirstPP(pp, 10)
    .withFirstDeck(deckFillers())
    .withSecondDeck(deckFillers())
    .withFirstHP(20)
    .withSecondHP(20)
    .build();

  state.gameStarted = true;
  state.phase = "main";

  const hand = getHand(state, "first");
  const instance = hand[0];
  if (!instance) {
    throw new Error(`Sweep case built with empty hand for ${card.id}`);
  }
  const uid = instance.uid;

  const live = parsePlayModeKeywords(instance.keywords);
  const cardEnhanceTiers = live.enhanceTiers.length
    ? live.enhanceTiers
    : card.enhanceTiers;
  const cardAlternates = live.alternates.length
    ? live.alternates
    : card.alternates;
  const cardNormalCost =
    typeof instance.cost === "number" ? instance.cost : card.cost;

  let plan: PlanSummary = {
    mode: "normal",
    cost: cardNormalCost,
    enhanceTiers: [],
    alternate: null,
    effectivePlayCost: cardNormalCost,
  };
  let exception: string | null = null;

  try {
    plan = summarizePlan(resolvePlayCost(instance, pp));
  } catch (err) {
    exception = summarizeException(err);
  }

  const expectedRoute = expectedRouteFromSpec(
    {
      enhanceTiers: cardEnhanceTiers,
      normalCost: cardNormalCost,
      alternates: cardAlternates,
    },
    pp,
  );

  const ppBefore = getPP(state, "first");
  const boardBefore = getBoard(state, "first").length;
  const handBefore = getHand(state, "first").length;
  const graveyardBefore = getGraveyard(state, "first").length;
  const crestBefore = getCrests(state, "first").length;
  const hashBefore = hashGameState(state);

  let outcomeKind: SweepCaseRecord["outcomeKind"] = "threw";
  let outcomeReason: string | null = null;

  let playEvents: PlayLogEvent[] = [];
  if (exception === null) {
    try {
      playEvents = capturePlayEvents(() => {
        const outcome: PlayOutcome = whenPlayCard("first", 0);
        outcomeKind = outcome.kind;
        outcomeReason =
          outcome.kind === "blocked" ? (outcome.reason ?? null) : null;
      });
    } catch (err) {
      exception = summarizeException(err);
      outcomeKind = "threw";
    }
  }

  const ppAfter = getPP(state, "first");
  const boardAfter = getBoard(state, "first").length;
  const handAfter = getHand(state, "first").length;
  const graveyardAfter = getGraveyard(state, "first").length;
  const crestAfter = getCrests(state, "first").length;
  const hashAfter = hashGameState(state);
  const ownBoard = getBoard(state, "first");
  const playedCardOnOwnBoard = zoneHasUid(ownBoard, uid);
  const cardInGraveyard = zoneHasUid(getGraveyard(state, "first"), uid);
  const cardInBanish = zoneHasUid(getBanish(state, "first"), uid);
  const extraSummons = Math.max(0, boardAfter - boardBefore - 1);

  const accepted = outcomeKind === "done" || outcomeKind === "paused";
  const rejected = outcomeKind === "blocked";

  const rec: SweepCaseRecord = {
    cardId: card.id,
    name: card.name,
    printedType: card.type,
    description: card.description,
    cardEnhanceTiers,
    cardNormalCost,
    cardAlternates,
    pp,
    boardFull,
    plan,
    expectedRoute,
    ppBefore,
    ppAfter,
    accepted,
    rejected,
    outcomeKind,
    outcomeReason,
    boardBefore,
    boardAfter,
    handBefore,
    handAfter,
    graveyardBefore,
    graveyardAfter,
    crestBefore,
    crestAfter,
    extraSummons,
    playEvents,
    recoveredPP: 0,
    extraSpendPP: 0,
    drawn: 0,
    addedToHand: 0,
    bounced: 0,
    discarded: 0,
    returnedToDeck: 0,
    playedCardRemovedByLog: false,
    playedCardOnOwnBoard,
    cardInGraveyard,
    cardInBanish,
    exception,
    hashBefore,
    hashAfter,
    hashFn: STATE_HASH_FN,
    checks: {} as Record<InvariantId, InvariantCheck>,
  };
  applyEventSummary(rec, { name: card.name, uid });
  rec.checks = evaluateInvariants(rec);
  return rec;
}

export function emptyFailureMap(): Record<InvariantId, SweepCaseRecord[]> {
  return { I1: [], I2: [], I3: [], I4: [], I5: [], I6: [] };
}

export function collectFailures(
  cases: SweepCaseRecord[],
): Record<InvariantId, SweepCaseRecord[]> {
  const failures = emptyFailureMap();
  for (const rec of cases) {
    for (const id of INVARIANT_IDS) {
      if (!rec.checks[id].passed) failures[id].push(rec);
    }
  }
  return failures;
}

export function cardsWhereAlternateSuppressedWhenAffordable(
  cards: SweepCard[],
): SweepReport["alternateFormWhenAffordable"] {
  return cards
    .filter((c) => c.alternates.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      normalCost: c.cost,
      alternates: c.alternates,
      note:
        "Engine offers Crystallize/Accelerate only when PP < normal effective cost. " +
        "When the follower is affordable the alternate form is not offered.",
    }));
}

export function runPlayModeSweep(
  cards: SweepCard[] = loadSweepCards(),
): SweepReport {
  const started = Date.now();
  const cases: SweepCaseRecord[] = [];
  for (const card of cards) {
    const pps = buildPpGrid(thresholdsForCard(card));
    for (const pp of pps) {
      for (const boardFull of [false, true]) {
        cases.push(runSweepCase(card, pp, boardFull));
      }
    }
  }
  const failures = collectFailures(cases);
  let failureCount = 0;
  for (const id of INVARIANT_IDS) failureCount += failures[id].length;

  return {
    generatedAt: new Date().toISOString(),
    hashFn: STATE_HASH_FN,
    engineRule: ENGINE_RULE_QUOTE,
    cardCount: cards.length,
    cards,
    caseCount: cases.length,
    runtimeMs: Date.now() - started,
    cases,
    failures,
    failureCount,
    alternateFormWhenAffordable:
      cardsWhereAlternateSuppressedWhenAffordable(cards),
  };
}

function yesNo(v: boolean): string {
  return v ? "yes" : "no";
}

function checksCell(rec: SweepCaseRecord): string {
  const passed: string[] = [];
  const failed: string[] = [];
  for (const id of INVARIANT_IDS) {
    if (rec.checks[id].passed) passed.push(id);
    else failed.push(id);
  }
  if (!failed.length) return `pass ${passed.join(",")}`;
  return `FAIL ${failed.join(",")} / ok ${passed.join(",")}`;
}

export function formatSweepMarkdown(report: SweepReport): string {
  const ids = report.cards.map((c) => c.id);
  const lines: string[] = [];
  lines.push("# Play-mode cost-boundary sweep");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Runtime: ${report.runtimeMs} ms`);
  lines.push(`Cards: **${report.cardCount}**`);
  lines.push(
    `Cases: **${report.caseCount}** (card × PP × {empty, full board})`,
  );
  lines.push(`State hash: \`${report.hashFn}\``);
  lines.push(`Failures: **${report.failureCount}**`);
  lines.push("");
  lines.push("## Engine rule (quoted, not paraphrased)");
  lines.push("");
  lines.push(`> ${report.engineRule}`);
  lines.push("");
  lines.push("## Cards under test");
  lines.push("");
  lines.push(ids.join(", "));
  lines.push("");
  lines.push(
    "| id | name | type | keywords | enhance tiers | alternates | cost |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of report.cards) {
    const alts =
      c.alternates.map((a) => `${a.kind} ${a.cost}`).join(", ") || "—";
    const tiers = c.enhanceTiers.length ? c.enhanceTiers.join(", ") : "—";
    lines.push(
      `| ${c.id} | ${c.name} | ${c.type} | ${c.keywords.join("+")} | ${tiers} | ${alts} | ${c.cost} |`,
    );
  }
  lines.push("");
  lines.push("## Owner question (not decided here)");
  lines.push("");
  lines.push(
    "In the real client, when the player can afford the follower, can they still choose Crystallize / Accelerate? " +
      "This engine currently offers the alternate form **only** when the follower is unaffordable. " +
      "Cards that question applies to:",
  );
  lines.push("");
  if (!report.alternateFormWhenAffordable.length) {
    lines.push("_None — no Crystallize/Accelerate cards in the pool._");
  } else {
    lines.push("| id | name | normal cost | alternates |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of report.alternateFormWhenAffordable) {
      const alts = c.alternates.map((a) => `${a.kind} ${a.cost}`).join(", ");
      lines.push(`| ${c.id} | ${c.name} | ${c.normalCost} | ${alts} |`);
    }
  }
  lines.push("");
  lines.push("## I1 / I6 reconciliation");
  lines.push("");
  lines.push(
    "I1' is `ppAfter === ppBefore − plan.cost + Σ recoverPP − Σ spendPP` from " +
      "`logEvent` rows emitted during `whenPlayCard`. I6' is " +
      "`handAfter === handBefore − 1 + draws + add_to_hand + bounceToHand − discards − returnHandToDeck`, " +
      "and a follower/amulet must stay on the board unless a logged bounce/return/destroy names it. " +
      "Explained deltas are recorded in `recoveredPP`, `drawn`, `addedToHand`, `bounced`.",
  );
  lines.push("");
  lines.push("## Failures by invariant");
  lines.push("");
  for (const id of INVARIANT_IDS) {
    const rows = report.failures[id];
    lines.push(`### ${id} — ${rows.length} failing case(s)`);
    lines.push("");
    if (!rows.length) {
      lines.push("_none_");
      lines.push("");
      continue;
    }
    lines.push("| id | name | pp | board | expected | observed |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const rec of rows) {
      const chk = rec.checks[id];
      lines.push(
        `| ${rec.cardId} | ${rec.name} | ${rec.pp} | ${rec.boardFull ? "full" : "empty"} | ${JSON.stringify(chk.expected)} | ${JSON.stringify(chk.observed)} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Every case");
  lines.push("");
  lines.push(
    "| id | name | pp | board | mode | cost | accepted | recoveredPP | drawn | addedToHand | bounced | checks |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const rec of report.cases) {
    lines.push(
      `| ${rec.cardId} | ${rec.name} | ${rec.pp} | ${rec.boardFull ? "full" : "empty"} | ${rec.plan.mode} | ${rec.plan.cost} | ${yesNo(rec.accepted)} | ${rec.recoveredPP} | ${rec.drawn} | ${rec.addedToHand} | ${rec.bounced} | ${checksCell(rec)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function reportDir(root: string = ROOT): string {
  return path.join(root, "reports", "play-mode-sweep");
}

export function writeSweepReports(
  report: SweepReport,
  root: string = ROOT,
): { md: string; json: string } {
  const dir = reportDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const mdPath = path.join(dir, "latest.md");
  const jsonPath = path.join(dir, "latest.json");
  fs.writeFileSync(mdPath, formatSweepMarkdown(report));
  const jsonBody = {
    generatedAt: report.generatedAt,
    hashFn: report.hashFn,
    engineRule: report.engineRule,
    cardCount: report.cardCount,
    cardIds: report.cards.map((c) => c.id),
    cards: report.cards,
    caseCount: report.caseCount,
    runtimeMs: report.runtimeMs,
    failureCount: report.failureCount,
    failures: Object.fromEntries(
      INVARIANT_IDS.map((id) => [
        id,
        report.failures[id].map((rec) => ({
          cardId: rec.cardId,
          name: rec.name,
          pp: rec.pp,
          boardFull: rec.boardFull,
          expected: rec.checks[id].expected,
          observed: rec.checks[id].observed,
          detail: rec.checks[id].detail,
          description: rec.description,
        })),
      ]),
    ),
    alternateFormWhenAffordable: report.alternateFormWhenAffordable,
    cases: report.cases.map((rec) => ({
      cardId: rec.cardId,
      name: rec.name,
      pp: rec.pp,
      boardFull: rec.boardFull,
      mode: rec.plan.mode,
      cost: rec.plan.cost,
      enhanceTiers: rec.plan.enhanceTiers,
      alternate: rec.plan.alternate,
      accepted: rec.accepted,
      rejected: rec.rejected,
      outcomeKind: rec.outcomeKind,
      outcomeReason: rec.outcomeReason,
      ppBefore: rec.ppBefore,
      ppAfter: rec.ppAfter,
      boardBefore: rec.boardBefore,
      boardAfter: rec.boardAfter,
      handBefore: rec.handBefore,
      handAfter: rec.handAfter,
      extraSummons: rec.extraSummons,
      recoveredPP: rec.recoveredPP,
      drawn: rec.drawn,
      addedToHand: rec.addedToHand,
      bounced: rec.bounced,
      extraSpendPP: rec.extraSpendPP,
      exception: rec.exception,
      hashBefore: rec.hashBefore,
      hashAfter: rec.hashAfter,
      checks: Object.fromEntries(
        INVARIANT_IDS.map((id) => [
          id,
          {
            passed: rec.checks[id].passed,
            applicable: rec.checks[id].applicable,
            expected: rec.checks[id].expected,
            observed: rec.checks[id].observed,
          },
        ]),
      ),
    })),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(jsonBody, null, 2)}\n`);
  return { md: mdPath, json: jsonPath };
}
