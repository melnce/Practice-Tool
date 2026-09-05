/**
 * Harness for reactive-trigger timing matrix (context × event).
 * Observable: watcher card `counters.earth` via counter op (nothing else touches it).
 */
import { expect } from "vitest";
import type {
  Effect,
  CardInstance,
  PlayerSlot,
} from "../../src/core/types/index.js";
import { state } from "../../src/core/gameState.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { getBoard, getHand, setHP } from "../../src/core/playerHelpers.js";
import { handleFillBoardChainDecay } from "../../src/logic/effects/ops/summon_ops/chain.js";
import { fuse_finalize_loot } from "../../src/logic/effects/ops/fuse/fuse.loot.js";
import {
  canUndo,
  captureSnapshot,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import {
  maskCanonicalSnapshot,
  canonicalJson,
} from "../../src/bench/soakEnv.js";
import { createCard, givenGameState, resetUidCounter } from "./builders.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";

const WATCHER_TICK: Effect = {
  op: "counter",
  action: "add",
  key: "earth",
  amount: 1,
};

/** Real card name in cards/all.json — used by matrix summon raisers. */
export const MATRIX_SUMMON_NAME = "Goblin";

// ---------------------------------------------------------------------------
// Event / context catalog
// ---------------------------------------------------------------------------

export const REACTIVE_EVENTS = [
  "ally_follower_enter",
  "enemy_follower_enter",
  "ally_follower_played",
  "ally_follower_leaves_field",
  "enemy_follower_leaves_field",
  "ally_ward_destroyed",
  "ally_evolve",
  "ally_draw",
  "when_drawn",
  "ally_spell_played",
  "ally_card_played",
  "ally_amulet_destroyed",
  "leader_damaged",
  "leader_restored",
  "self_damaged",
  "self_buffed_up",
  "enhanced_play",
  "engage",
] as const;

export type ReactiveEvent = (typeof REACTIVE_EVENTS)[number];

export const CORE_EVENTS: ReactiveEvent[] = [
  "ally_follower_enter",
  "ally_follower_leaves_field",
  "ally_draw",
  "leader_damaged",
];

export type RaisingContext =
  | "C1_fanfare"
  | "C2_spell"
  | "C3_engage"
  | "C4_evolve"
  | "C4_super_evolve"
  | "C5_target_handler"
  | "C6_target_resume"
  | "C7_deferred_lw"
  | "C8_combat_lw"
  | "C9_strike"
  | "C10_eot"
  | "C11_sot"
  | "C12_crest"
  | "C13_mode"
  | "C14_enhance"
  | "C15_nesting";

export const ALL_CONTEXTS: RaisingContext[] = [
  "C1_fanfare",
  "C2_spell",
  "C3_engage",
  "C4_evolve",
  "C4_super_evolve",
  "C5_target_handler",
  "C6_target_resume",
  "C7_deferred_lw",
  "C8_combat_lw",
  "C9_strike",
  "C10_eot",
  "C11_sot",
  "C12_crest",
  "C13_mode",
  "C14_enhance",
  "C15_nesting",
];

const PLAY_FIRED_BEFORE_BODY: ReactiveEvent[] = [
  "ally_spell_played",
  "ally_card_played",
  "enhanced_play",
];

const PLAY_ONLY_EVENTS: ReactiveEvent[] = [
  "ally_follower_played",
  ...PLAY_FIRED_BEFORE_BODY,
];

// ---------------------------------------------------------------------------
// Watcher / raiser helpers
// ---------------------------------------------------------------------------

/** Watcher board owner for matrix cells (context-aware for SOT / leader events). */
export function watcherOwnerForEvent(
  event: ReactiveEvent,
  context?: RaisingContext,
): PlayerSlot {
  if (event === "leader_damaged") return "second";
  if (event === "leader_restored") return "first";
  if (context === "C11_sot" && event.startsWith("ally_")) return "second";
  return "first";
}

export function makeMatrixWatcher(
  event: ReactiveEvent,
  owner: PlayerSlot,
  opts: { leadingGate?: boolean; zone?: "board" | "hand" | "deck" } = {},
): CardInstance {
  const trigger: Record<string, unknown> = {
    event,
    source: event === "when_drawn" ? "hand" : "board",
    effects: [WATCHER_TICK],
  };
  if (event === "ally_follower_enter" || event === "enemy_follower_enter") {
    trigger.condition = { name: "Goblin" };
  }
  if (
    event === "ally_follower_leaves_field" ||
    event === "enemy_follower_leaves_field"
  ) {
    trigger.condition = { name: "LeaveVictim" };
  }
  if (opts.leadingGate) {
    trigger.effects = [
      {
        op: "gate",
        condition: "leader_defense_lte",
        count: 15,
        effects: [WATCHER_TICK],
      },
    ];
  }
  const zone = opts.zone ?? (event === "when_drawn" ? "deck" : "board");
  const card = createCard(
    {
      name: `Watcher:${event}`,
      type: event === "when_drawn" ? "Spell" : "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      counters: { earth: 0 },
      triggers: [trigger],
    },
    zone,
    owner,
  );
  if (zone === "board") applyKeywordsFromList(card);
  return card;
}

export function watcherEarth(owner: PlayerSlot, watcherUid: string): number {
  const zones = [
    ...getBoard(state, owner),
    ...state.players[owner].hand,
    ...state.players[owner].deck,
    ...state.players[owner].graveyard,
  ];
  const card = zones.find((c) => c?.uid === watcherUid);
  return Number(card?.counters?.earth ?? 0);
}

export interface MatrixNamedSummonExpectation {
  boardOwner: PlayerSlot;
  name: string;
}

/** Where a matrix raiser's named summon should land (null = no named enter summon). */
export function matrixNamedSummonExpectation(input: {
  event?: ReactiveEvent | string;
  context?: string;
  axis?: string;
  actionPlayer?: PlayerSlot;
  onOwnerTurn?: boolean;
}): MatrixNamedSummonExpectation | null {
  const { event, axis, actionPlayer = "first", onOwnerTurn = true } = input;
  if (event !== "ally_follower_enter" && event !== "enemy_follower_enter") {
    return null;
  }
  if (axis === "turn" && event === "ally_follower_enter" && !onOwnerTurn) {
    return {
      boardOwner: enemyWatcherOwner(actionPlayer),
      name: MATRIX_SUMMON_NAME,
    };
  }
  if (event === "enemy_follower_enter") {
    return {
      boardOwner: enemyWatcherOwner(actionPlayer),
      name: MATRIX_SUMMON_NAME,
    };
  }
  return { boardOwner: actionPlayer, name: MATRIX_SUMMON_NAME };
}

export function assertMatrixNamedSummonPresent(
  exp: MatrixNamedSummonExpectation,
): void {
  expect(
    getBoard(state, exp.boardOwner).some((c) => c?.name === exp.name),
  ).toBe(true);
}

export function raiseEffects(
  event: ReactiveEvent,
  ctx: { watcherUid?: string } = {},
): Effect[] {
  switch (event) {
    case "ally_follower_enter":
      return [{ op: "summon", source: "named", name: "Goblin", count: 1 }];
    case "enemy_follower_enter":
      return [
        {
          op: "summon",
          source: "named",
          name: "Goblin",
          count: 1,
          owner: "enemy",
        },
      ];
    case "ally_follower_leaves_field":
      return [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LeaveVictim" },
        },
      ];
    case "enemy_follower_leaves_field":
      return [
        {
          op: "destroy",
          target: "enemy:follower",
          filter: { name: "LeaveVictim" },
        },
      ];
    case "ally_ward_destroyed":
      return [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "WardVictim" },
        },
      ];
    case "ally_evolve":
      return [
        {
          op: "evolve",
          target: "ally:follower",
          filter: { name: "EvoVictim" },
          spend_point: false,
        },
      ];
    case "ally_draw":
      return [{ op: "draw", source: "deck", count: 1 }];
    case "when_drawn":
      return [{ op: "draw", source: "deck", count: 1 }];
    case "ally_amulet_destroyed":
      return [
        {
          op: "destroy",
          target: "ally:amulet",
          filter: { name: "AmuletVictim" },
        },
      ];
    case "leader_damaged":
      return [{ op: "damage", target: "enemy:leader", amount: 1 }];
    case "leader_restored":
      return [{ op: "restore", target: "leader", amount: 1 }];
    case "self_damaged":
      return [
        {
          op: "damage",
          target: "ally:follower",
          condition: { name: `Watcher:self_damaged` },
          amount: 1,
          distribution: "all",
        },
      ];
    case "self_buffed_up":
      return [
        {
          op: "stat",
          action: "give",
          target: "ally:follower",
          filter: { uid: ctx.watcherUid },
          attack: 1,
          defense: 0,
        },
      ];
    default:
      return [];
  }
}

export function skipReason(
  context: RaisingContext,
  event: ReactiveEvent,
): string | null {
  if (context === "C8_combat_lw" && event !== "ally_follower_enter") {
    return "C8 is one combat-LW cell only (rest covered elsewhere)";
  }
  if (context === "C15_nesting" && event !== "ally_draw") {
    return "C15 nesting family uses ally_follower_enter → ally_draw chain";
  }
  if (PLAY_ONLY_EVENTS.includes(event)) {
    if (context === "C2_spell" && PLAY_FIRED_BEFORE_BODY.includes(event)) {
      return "play event fires before spell body";
    }
    if (context === "C1_fanfare" && event === "ally_follower_played") {
      return "ally_follower_played fires after fanfare, not during";
    }
    if (context === "C1_fanfare" && PLAY_FIRED_BEFORE_BODY.includes(event)) {
      return "play event fires before fanfare body";
    }
    if (context === "C14_enhance" && event === "enhanced_play") {
      return "enhanced_play fires before enhance tier body";
    }
    if (
      !["C1_fanfare", "C2_spell", "C14_enhance"].includes(context) &&
      PLAY_ONLY_EVENTS.includes(event)
    ) {
      return "no play-from-hand op in effect bodies";
    }
  }
  if (event === "engage" && context === "C3_engage") {
    return "engage event fires before engage body";
  }
  if (
    event === "engage" &&
    context !== "C3_engage" &&
    context !== "C12_crest"
  ) {
    return "engage event only from engage action or crest watching engage";
  }
  if (event === "when_drawn" && context === "C11_sot") {
    return "when_drawn requires draw during SOT body, not start_of_turn trigger";
  }
  if (event === "ally_draw" && context === "C11_sot") {
    return "turn draw step also fires ally_draw after SOT body (step 8)";
  }
  if (
    ["self_damaged", "self_buffed_up"].includes(event) &&
    ["C8_combat_lw", "C9_strike"].includes(context)
  ) {
    return "self_* events require non-combat damage for this matrix";
  }
  if (raiseEffects(event).length === 0 && !PLAY_ONLY_EVENTS.includes(event)) {
    return `no raiser effect for ${event}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Board support cards
// ---------------------------------------------------------------------------

function leaveVictim(owner: PlayerSlot, name = "LeaveVictim") {
  const c = createCard(
    { name, type: "Follower", cost: 1, attack: 1, defense: 1 },
    "board",
    owner,
  );
  applyKeywordsFromList(c);
  c.peak_defense = Number(c.defense);
  return c;
}

function selectVictim(owner: PlayerSlot) {
  const c = leaveVictim(owner, "SelectVictim");
  c.defense = 3;
  c.peak_defense = 3;
  return c;
}

function wardVictim(owner: PlayerSlot) {
  const c = createCard(
    {
      name: "WardVictim",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 2,
      keywords: ["Ward"],
    },
    "board",
    owner,
  );
  applyKeywordsFromList(c);
  c.peak_defense = Number(c.defense);
  return c;
}

function evoVictim(owner: PlayerSlot) {
  const c = createCard(
    {
      name: "EvoVictim",
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      canEvolve: true,
      hasEvolved: false,
    },
    "board",
    owner,
  );
  applyKeywordsFromList(c);
  c.peak_defense = Number(c.defense);
  return c;
}

function amuletVictim(owner: PlayerSlot) {
  return createCard(
    { name: "AmuletVictim", type: "Amulet", cost: 1, countdown: 2 },
    "board",
    owner,
  );
}

function deckFiller(owner: PlayerSlot, name = "DrawFiller") {
  return createCard({ name, type: "Spell", cost: 1 }, "deck", owner);
}

export function installEventSupport(
  event: ReactiveEvent,
  watcher: CardInstance,
): void {
  const wOwner = watcher.owner as PlayerSlot;
  const board = getBoard(state, wOwner);
  switch (event) {
    case "ally_follower_leaves_field":
      board.push(leaveVictim(wOwner));
      break;
    case "ally_ward_destroyed":
      board.push(wardVictim(wOwner));
      break;
    case "enemy_follower_leaves_field":
      getBoard(state, "second").push(leaveVictim("second"));
      break;
    case "ally_evolve":
      board.push(evoVictim(wOwner));
      state.players[wOwner].evoCharges = 2;
      break;
    case "ally_amulet_destroyed":
      board.push(amuletVictim(wOwner));
      break;
    case "when_drawn":
      state.players[wOwner].deck.push(deckFiller(wOwner, "PadBelowDraw"));
      state.players[wOwner].deck.push(watcher);
      break;
    case "ally_draw":
      state.players[wOwner].deck.unshift(deckFiller(wOwner, "DrawTop"));
      break;
    case "leader_damaged":
      setHP(state, "second", 20);
      break;
    case "leader_restored":
      setHP(state, wOwner, 10);
      break;
    case "self_damaged":
    case "self_buffed_up":
      if (!board.includes(watcher)) board.push(watcher);
      watcher.defense = 3;
      watcher.peak_defense = 3;
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Context card builders
// ---------------------------------------------------------------------------

function raiserFollowerInHand(effects: Effect[], name = "Raiser") {
  return createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 1,
      fanfare: effects,
    },
    "hand",
    "first",
  );
}

function raiserSpellInHand(effects: Effect[]) {
  return createCard(
    {
      name: "RaiserSpell",
      type: "Spell",
      cost: 1,
      spell: effects,
    },
    "hand",
    "first",
  );
}

function raiserEngageAmulet(effects: Effect[]) {
  const c = createCard(
    {
      name: "EngageRaiser",
      type: "Amulet",
      cost: 1,
      countdown: 99,
      keywords: [{ name: "Engage", cost: 0, effects }],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
  return c;
}

function raiserEvoFollower(effects: Effect[], superEvo = false) {
  const c = createCard(
    {
      name: "EvoRaiser",
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      canEvolve: true,
      hasEvolved: false,
      ...(superEvo ? { superevolve: effects } : { evolve: effects }),
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
  c.peak_defense = Number(c.defense);
  return c;
}

function raiserEotFollower(effects: Effect[]) {
  const c = createCard(
    {
      name: "EotRaiser",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 1,
      triggers: [{ type: "end_of_turn_own", effects }],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
  return c;
}

function raiserSotFollower(effects: Effect[]) {
  const c = createCard(
    {
      name: "SotRaiser",
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 1,
      triggers: [{ type: "start_of_turn_own", effects }],
    },
    "board",
    "second",
  );
  applyKeywordsFromList(c);
  return c;
}

function raiserStrikeFollower(effects: Effect[]) {
  const c = createCard(
    {
      name: "StrikeRaiser",
      type: "Follower",
      cost: 3,
      attack: 3,
      defense: 5,
      justPlayed: false,
      can_attack: true,
      can_attack_followers: true,
      attacks_left: 1,
      triggers: [{ event: "strike", effects }],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
  c.peak_defense = Number(c.defense);
  return c;
}

function lwVictimWithEffects(effects: Effect[]) {
  const c = createCard(
    {
      name: "LwVictim",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      keywords: [{ name: "LastWords", effects }],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
  c.peak_defense = Number(c.defense);
  return c;
}

// ---------------------------------------------------------------------------
// Matrix cell runner
// ---------------------------------------------------------------------------

export interface MatrixRunResult {
  watcherUid: string;
  watcherOwner: PlayerSlot;
  pendingPrompt: boolean;
  summonExpectation?: MatrixNamedSummonExpectation | null;
}

export interface MatrixCellOptions {
  context: RaisingContext;
  event: ReactiveEvent;
  leadingGate?: boolean;
}

export function runMatrixCell(opts: MatrixCellOptions): MatrixRunResult {
  const { context, event, leadingGate } = opts;
  resetUidCounter();
  setHistoryEnabled(true);
  resetHistory();
  (globalThis as any).HEADLESS = true;

  const roundCount = context === "C4_super_evolve" ? 8 : 6;
  givenGameState({ seed: 77, activePlayer: "first", roundCount })
    .withFirstPP(10, 10)
    .withFirstEvo(2)
    .build();
  state.gameStarted = true;
  state.phase = "main";

  const watcherOwner = watcherOwnerForEvent(event, context);
  let watcherUid = "";

  if (context === "C15_nesting") {
    const w2 = makeMatrixWatcher("ally_draw", "first");
    watcherUid = w2.uid;
    getBoard(state, "first").push(w2);
    installEventSupport("ally_draw", w2);
    const w1 = createCard(
      {
        name: "W1",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            source: "board",
            condition: { name: "Goblin" },
            effects: raiseEffects("ally_draw"),
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(w1);
    getBoard(state, "first").push(w1);
  } else {
    const zone = event === "when_drawn" ? "deck" : "board";
    const watcher = makeMatrixWatcher(event, watcherOwner, {
      leadingGate,
      zone,
    });
    watcherUid = watcher.uid;
    if (event === "when_drawn") {
      installEventSupport(event, watcher);
    } else {
      getBoard(state, watcherOwner).push(watcher);
      installEventSupport(event, watcher);
    }
  }

  if (leadingGate) {
    setHP(state, watcherOwner, 12);
  }

  const raise = raiseEffects(event, { watcherUid });
  let pendingPrompt = false;

  const dispatch = (action: Parameters<typeof engineDispatch>[1]) => {
    engineDispatch(state, action);
  };

  switch (context) {
    case "C1_fanfare": {
      const raiser = raiserFollowerInHand(raise);
      state.players.first.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      break;
    }
    case "C2_spell": {
      const raiser = raiserSpellInHand(raise);
      state.players.first.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      break;
    }
    case "C3_engage": {
      const amulet = raiserEngageAmulet(raise);
      state.players.first.board.push(amulet);
      dispatch({ type: "ENGAGE", player: "first", cardUid: amulet.uid });
      break;
    }
    case "C4_evolve": {
      const evo = raiserEvoFollower(raise, false);
      state.players.first.board.push(evo);
      dispatch({ type: "EVOLVE", player: "first", cardUid: evo.uid });
      break;
    }
    case "C4_super_evolve": {
      const evo = raiserEvoFollower(raise, true);
      state.players.first.board.push(evo);
      state.players.first.superEvoCharges = 1;
      dispatch({
        type: "EVOLVE",
        player: "first",
        cardUid: evo.uid,
        mode: "super",
      });
      break;
    }
    case "C5_target_handler": {
      const victim = selectVictim("first");
      state.players.first.board.push(victim);
      const raiser = raiserFollowerInHand([
        {
          op: "select",
          target: "ally:follower",
          select: 1,
          effects: raise,
        },
      ]);
      state.players.first.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      pendingPrompt = !!state.pendingTargetEffect;
      if (pendingPrompt) {
        dispatch({
          type: "CHOOSE_TARGET",
          target: { type: "card", uid: victim.uid },
        });
        pendingPrompt = !!state.pendingTargetEffect;
      }
      break;
    }
    case "C6_target_resume": {
      const victim = selectVictim("first");
      state.players.first.board.push(victim);
      const raiser = raiserFollowerInHand([
        {
          op: "damage",
          target: "ally:follower",
          select: 1,
          amount: 1,
        },
        ...raise,
      ]);
      state.players.first.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      pendingPrompt = !!state.pendingTargetEffect;
      if (pendingPrompt) {
        dispatch({
          type: "CHOOSE_TARGET",
          target: { type: "card", uid: victim.uid },
        });
        pendingPrompt = !!state.pendingTargetEffect;
      }
      break;
    }
    case "C7_deferred_lw": {
      const lw = lwVictimWithEffects(raise);
      state.players.first.board.push(lw);
      const raiser = raiserFollowerInHand([
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LwVictim" },
        },
      ]);
      state.players.first.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      break;
    }
    case "C8_combat_lw": {
      const defender = leaveVictim("second", "Blocker");
      defender.attack = 3;
      defender.defense = 3;
      defender.peak_defense = 3;
      state.players.second.board.push(defender);
      const attacker = createCard(
        {
          name: "CombatAttacker",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 1,
          justPlayed: false,
          can_attack: true,
          can_attack_followers: true,
          attacks_left: 1,
          keywords: [{ name: "LastWords", effects: raise }],
        },
        "board",
        "first",
      );
      applyKeywordsFromList(attacker);
      attacker.peak_defense = 1;
      state.players.first.board.push(attacker);
      dispatch({
        type: "ATTACK",
        player: "first",
        attackerUid: attacker.uid,
        defender: { type: "card", uid: defender.uid },
      });
      break;
    }
    case "C9_strike": {
      const defender = leaveVictim("second", "Blocker");
      defender.defense = 5;
      defender.peak_defense = 5;
      state.players.second.board.push(defender);
      const striker = raiserStrikeFollower(raise);
      state.players.first.board.push(striker);
      dispatch({
        type: "ATTACK",
        player: "first",
        attackerUid: striker.uid,
        defender: { type: "card", uid: defender.uid },
      });
      break;
    }
    case "C10_eot": {
      const eot = raiserEotFollower(raise);
      state.players.first.board.push(eot);
      dispatch({ type: "END_TURN" });
      break;
    }
    case "C11_sot": {
      const sot = raiserSotFollower(raise);
      state.players.second.board.push(sot);
      dispatch({ type: "END_TURN" });
      break;
    }
    case "C12_crest": {
      const crestTrigger =
        event === "ally_draw"
          ? { event: "ally_spell_played" as const, effects: raise }
          : { event: "ally_draw" as const, effects: raise };
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: "MatrixCrest",
          triggers: [crestTrigger],
        } as any,
        "first",
      );
      const spellBody =
        event === "ally_draw"
          ? ([] as Effect[])
          : [{ op: "draw", source: "deck", count: 1 } as Effect];
      const drawSpell = raiserSpellInHand(spellBody);
      state.players.first.hand.push(drawSpell);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: drawSpell.uid });
      break;
    }
    case "C13_mode": {
      const raiser = raiserFollowerInHand([
        {
          op: "mode",
          pick: "random",
          options: [{ label: "Raise", effects: raise }],
        },
      ]);
      state.players.first.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      break;
    }
    case "C14_enhance": {
      const raiser = createCard(
        {
          name: "EnhanceRaiser",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          enhanceTiers: [{ cost: 5, effects: raise }],
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(raiser);
      state.players.first.pp = 5;
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      break;
    }
    case "C15_nesting": {
      const raiser = raiserFollowerInHand([
        { op: "summon", source: "named", name: "Goblin", count: 1 },
      ]);
      state.players.first.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "first", cardUid: raiser.uid });
      break;
    }
    default:
      break;
  }

  const summonExpectation = matrixNamedSummonExpectation({
    event,
    context,
    actionPlayer: "first",
  });

  return { watcherUid, watcherOwner, pendingPrompt, summonExpectation };
}

export function assertReactiveInvariants(
  watcherUid: string,
  watcherOwner: PlayerSlot,
  opts: {
    pendingPrompt?: boolean;
    leadingGate?: boolean;
    expectFired?: boolean;
    event?: ReactiveEvent;
    context?: RaisingContext;
  } = {},
): void {
  const {
    pendingPrompt = false,
    leadingGate = false,
    expectFired = true,
    event,
    context,
  } = opts;
  const summonExp =
    expectFired && event
      ? matrixNamedSummonExpectation({
          event,
          context,
          actionPlayer: watcherOwner,
        })
      : null;
  if (summonExp) {
    assertMatrixNamedSummonPresent(summonExp);
  }
  const earth = watcherEarth(watcherOwner, watcherUid);
  if (expectFired && !leadingGate) {
    expect(earth).toBe(1);
  } else if (leadingGate) {
    expect(earth).toBe(1);
  }
  expect(getResolutionQueue().length).toBe(0);
  expect((state as any)._drainingResolutionQueue).toBeFalsy();
  if (!pendingPrompt) {
    expect(state.pendingTargetEffect).toBeUndefined();
  }
  expect(canUndo()).toBe(true);
  const historyMask = [
    "gameTick",
    "__debugId",
    "__lastPlayedCard",
    "__lastSelected",
    "insertionTs",
    "rally",
    "followerEnterHistory",
    "playedHistory",
    "playedBaseCostsThisMatch",
    "zoneVersion",
  ];
  const before = maskCanonicalSnapshot(
    canonicalJson(captureSnapshot()),
    historyMask,
  );
  dispatchAction(state, { type: "UNDO" });
  dispatchAction(state, { type: "REDO" });
  const after = maskCanonicalSnapshot(
    canonicalJson(captureSnapshot()),
    historyMask,
  );
  expect(after).toBe(before);
}

export function buildMatrixCells(): Array<{
  context: RaisingContext;
  event: ReactiveEvent;
  label: string;
}> {
  const cells: Array<{
    context: RaisingContext;
    event: ReactiveEvent;
    label: string;
  }> = [];
  const seen = new Set<string>();

  const add = (context: RaisingContext, event: ReactiveEvent) => {
    const key = `${context}|${event}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ context, event, label: `${context} × ${event}` });
  };

  for (const context of ALL_CONTEXTS) {
    for (const event of CORE_EVENTS) {
      add(context, event);
    }
  }
  for (const event of REACTIVE_EVENTS) {
    add("C1_fanfare", event);
    add("C7_deferred_lw", event);
  }

  return cells;
}

/** @deprecated use makeMatrixWatcher */
export const makeShadowWatcher = makeMatrixWatcher;

// ---------------------------------------------------------------------------
// V2 matrix — enemy-side, hand, turn ownership, nesting, zone pins, remaining
// ---------------------------------------------------------------------------

export const V2_REMAINING_EVENTS = [
  "on_fuse",
  "loot_fused",
  "loot_played",
  "ally_earth_rite",
  "invoke",
  "select_mode",
  "ally_ward_destroyed",
  "ally_amulet_destroyed",
  "engage",
] as const;

export type V2RemainingEvent = (typeof V2_REMAINING_EVENTS)[number];

export const V2_HAND_EVENTS = [
  "ally_follower_enter",
  "ally_super_evolve",
  "ally_evolve",
  "ally_draw",
  "ally_spell_played",
  "ally_card_played",
  "ally_follower_leaves_field",
  "ally_earth_rite",
  "leader_damaged",
] as const;

export type V2HandEvent = (typeof V2_HAND_EVENTS)[number];

/** Hand events with a printed `"source": "hand"` trigger in cards/all.json. */
export const HAND_EVENTS_WITH_CARD_POOL_SOURCE: Partial<
  Record<V2HandEvent, string[]>
> = {
  ally_follower_enter: ["Calge-Danthla", "Eld Crystals", "Unfeeling Eld Axe"],
  ally_super_evolve: [
    "Fairy Fencer",
    "Wise Guardian Dragon",
    "Mari, Meg's Bestie",
  ],
  ally_evolve: ["Floral Offering"],
  ally_follower_leaves_field: ["Bayle, Luxglaive Warrior"],
  ally_card_played: ["Hien", "Redolent Revenant"],
  ally_earth_rite: ["Heel, My Dearie", "Bottomless Gluttony"],
};

export const ENEMY_SIDE_ENTER_CONTEXTS: RaisingContext[] = [
  "C1_fanfare",
  "C2_spell",
  "C3_engage",
  "C4_evolve",
  "C4_super_evolve",
  "C5_target_handler",
  "C7_deferred_lw",
  "C8_combat_lw",
  "C10_eot",
  "C11_sot",
  "C12_crest",
  "C13_mode",
  "C14_enhance",
];

export type V2ExtraContext = "C_chain_summon" | "C_play_enter";

export type LeaveMode =
  | "destroy"
  | "bounce"
  | "banish"
  | "banish_on_death"
  | "transform"
  | "return";

export type TurnOwnershipMode = "owner" | "opponent";

export type OpponentContext =
  | "C_opponent_fanfare"
  | "C_opponent_spell_destroy"
  | "C_opponent_combat_lw"
  | "C_opponent_sot";

export type V2Context = RaisingContext | V2ExtraContext | OpponentContext;

export const NESTING_CONTEXTS: RaisingContext[] = [
  "C1_fanfare",
  "C5_target_handler",
  "C7_deferred_lw",
  "C8_combat_lw",
  "C10_eot",
];

export interface V2WatcherOptions {
  zone?: "board" | "hand";
  whoseTurn?: TurnOwnershipMode;
  side?: "ally" | "enemy";
}

export function enemyWatcherOwner(actor: PlayerSlot): PlayerSlot {
  return actor === "first" ? "second" : "first";
}

export function makeV2Watcher(
  event: ReactiveEvent | V2RemainingEvent,
  owner: PlayerSlot,
  opts: V2WatcherOptions = {},
): CardInstance {
  const zone = opts.zone ?? "board";
  const trigger: Record<string, unknown> = {
    event,
    source: zone,
    effects: [WATCHER_TICK],
  };
  if (opts.whoseTurn) {
    trigger.condition = {
      ...(trigger.condition as object),
      whose_turn: opts.whoseTurn,
    };
  }
  if (event === "ally_follower_enter" || event === "enemy_follower_enter") {
    trigger.condition = {
      ...(trigger.condition as object),
      name: "Goblin",
    };
  }
  if (
    event === "ally_follower_leaves_field" ||
    event === "enemy_follower_leaves_field"
  ) {
    trigger.condition = {
      ...(trigger.condition as object),
      name: "LeaveVictim",
    };
  }
  if (event === "enemy_follower_defense_down") {
    trigger.condition = {
      ...(trigger.condition as object),
      name: "LeaveVictim",
    };
  }
  const card = createCard(
    {
      name: `V2Watcher:${event}`,
      type: zone === "hand" ? "Follower" : "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      counters: { earth: 0 },
      triggers: [trigger],
    },
    zone,
    owner,
  );
  if (zone === "board") applyKeywordsFromList(card);
  return card;
}

export function raiseLeaveEffects(
  mode: LeaveMode,
  victimSide: "ally" | "enemy",
): Effect[] {
  const target = victimSide === "ally" ? "ally:follower" : "enemy:follower";
  const filter = { name: "LeaveVictim" };
  switch (mode) {
    case "destroy":
      return [{ op: "destroy", target, filter }];
    case "bounce":
      return [{ op: "return", destination: "hand", target, filter }];
    case "banish":
      return [{ op: "banish", target, filter }];
    case "banish_on_death":
      return [{ op: "destroy", target, filter }];
    case "transform":
      return [
        {
          op: "transform",
          target,
          filter,
          into: "Goblin",
        },
      ];
    case "return":
      return [{ op: "return", destination: "deck", target, filter }];
    default:
      return [];
  }
}

export function raiseRemainingEventEffects(
  event: V2RemainingEvent,
  ctx: { watcherUid?: string } = {},
): Effect[] {
  switch (event) {
    case "on_fuse":
      return [{ op: "fuse", target: "self" } as Effect];
    case "loot_fused":
      return [{ op: "fuse", target: "self", kind: "loot" } as Effect];
    case "loot_played":
      return [
        {
          op: "draw",
          source: "deck",
          count: 0,
        },
      ];
    case "ally_earth_rite":
      return [{ op: "earth_rite", amount: 1 } as Effect];
    case "invoke":
      return [{ op: "draw", source: "deck", count: 1 }];
    case "select_mode":
      return [
        {
          op: "mode",
          pick: "random",
          options: [{ label: "A", effects: [] }],
        },
      ];
    case "ally_ward_destroyed":
      return raiseEffects("ally_ward_destroyed");
    case "ally_amulet_destroyed":
      return raiseEffects("ally_amulet_destroyed");
    case "engage":
      return raiseEffects("engage");
    default:
      return [];
  }
}

export function v2HandSkipReason(
  event: V2HandEvent,
  context?: V2Context,
): string | null {
  if (event === "ally_draw") {
    return "engine does not dispatch ally_draw to hand (no cards/all.json hand source)";
  }
  if (event === "ally_spell_played") {
    return "engine does not dispatch ally_spell_played to hand (no cards/all.json hand source)";
  }
  if (event === "leader_damaged") {
    return "engine does not dispatch leader_damaged to hand (no cards/all.json hand source)";
  }
  if (event === "ally_super_evolve" && context !== "C_play_enter") {
    return "ally_super_evolve hand listener requires super-evolve in same action";
  }
  if (event === "ally_earth_rite" && context === "C10_eot") {
    return "earth rite consume not raised from EOT body for hand listener";
  }
  if (context === "C_play_enter" && event === "ally_follower_leaves_field") {
    return "play-enter path does not leave";
  }
  if (context === "C_play_enter" && event === "ally_evolve") {
    return "play-enter path does not evolve";
  }
  if (context === "C_play_enter" && event === "ally_super_evolve") {
    return "play-enter path does not super-evolve";
  }
  if (context === "C_play_enter" && event === "ally_earth_rite") {
    return "play-enter path does not consume earth sigils";
  }
  return null;
}

export function v2EnemyEnterSkipReason(context: V2Context): string | null {
  if (context === "C_chain_summon") {
    return "chain_fill fires enemy_follower_enter once per decay clone (not exactly-once)";
  }
  if (context === "C11_sot") {
    return "SOT-on-second summon does not reach first-side enemy_enter watcher in harness";
  }
  return null;
}

export function v2EnemyLeaveSkipReason(leaveMode: LeaveMode): string | null {
  if (leaveMode === "transform") {
    return "transform does not raise leaves_field (transform.ts — no enter/leave triggers)";
  }
  if (leaveMode === "return") {
    return "return destination deck is hand→deck only; board leave not constructible";
  }
  return null;
}

export function v2RemainingSkipReason(
  context: RaisingContext,
  event: V2RemainingEvent,
): string | null {
  if (event === "invoke") {
    if (context === "C11_sot") return null;
    if (context === "C10_eot") return null;
    return "invoke only fires from deck scan at turn boundary (start/end of turn)";
  }
  if (event === "on_fuse" && context !== "C3_engage") {
    return "on_fuse not raised by loot fuse_finalize in this harness";
  }
  if (event === "on_fuse" && context === "C3_engage") {
    return "on_fuse/loot_fused not raised from engage action in harness";
  }
  if (event === "loot_fused" && context === "C3_engage") {
    return "on_fuse/loot_fused not raised from engage action in harness";
  }
  if (event === "loot_fused") {
    return null;
  }
  if (event === "loot_played") {
    if (context !== "C2_spell") {
      return "loot_played fires on spell play path only";
    }
  }
  if (
    (event === "ally_ward_destroyed" || event === "ally_amulet_destroyed") &&
    (context === "C10_eot" || context === "C11_sot")
  ) {
    return "ward/amulet destroy not constructible at turn boundary in this harness";
  }
  if (event === "invoke" && (context === "C10_eot" || context === "C11_sot")) {
    return null;
  }
  if (
    event === "engage" &&
    context !== "C3_engage" &&
    context !== "C12_crest"
  ) {
    return skipReason(context, "engage");
  }
  if (event === "ally_earth_rite" && context === "C11_sot") {
    return "earth rite via consume not wired to SOT body in this harness";
  }
  if (
    (event === "on_fuse" || event === "loot_fused") &&
    (context === "C10_eot" || context === "C11_sot")
  ) {
    return "fuse finalize not constructible at turn boundary in this harness";
  }
  return null;
}

function installLeaveVictim(owner: PlayerSlot, mode: LeaveMode): CardInstance {
  if (mode === "banish_on_death") {
    const c = leaveVictim(owner, "LeaveVictim");
    c.keywordState = { ...(c.keywordState ?? {}), banishOnDeath: true };
    return c;
  }
  if (mode === "ally_ward_destroyed") {
    return wardVictim(owner);
  }
  return leaveVictim(owner);
}

function installRemainingSupport(
  event: V2RemainingEvent,
  watcherOwner: PlayerSlot,
): void {
  switch (event) {
    case "ally_ward_destroyed":
      getBoard(state, watcherOwner).push(wardVictim(watcherOwner));
      break;
    case "ally_amulet_destroyed":
      getBoard(state, watcherOwner).push(amuletVictim(watcherOwner));
      break;
    case "ally_earth_rite": {
      const sigil = createCard(
        {
          name: "Earth Sigil",
          type: "Amulet",
          cost: 1,
          counters: { earth: 2 },
        },
        "board",
        watcherOwner,
      );
      getBoard(state, watcherOwner).push(sigil);
      break;
    }
    case "on_fuse":
    case "loot_fused": {
      const material = createCard(
        {
          name: "Gilded Blade",
          type: "Spell",
          cost: 1,
          tribes: ["Loot"],
        },
        "hand",
        watcherOwner,
      );
      const initiator = createCard(
        {
          name: "FuseInitiator",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
          fuseTarget: true,
          fuseMaterials: ["Gilded Blade"],
          fuse_recipes: [{ filters: [{ type: "Spell", tribe: "Loot" }] }],
        },
        "hand",
        watcherOwner,
      );
      state.players[watcherOwner].hand.push(material, initiator);
      break;
    }
    case "loot_played": {
      const lootSpell = createCard(
        {
          name: "Gilded Blade",
          type: "Spell",
          cost: 1,
          tribes: ["Loot"],
          spell: [{ op: "draw", source: "deck", count: 1 }],
        },
        "hand",
        watcherOwner,
      );
      state.players[watcherOwner].hand.unshift(lootSpell);
      break;
    }
    case "invoke": {
      const invokeCard = createCard(
        {
          name: "InvokeProbe",
          type: "Follower",
          cost: 3,
          attack: 1,
          defense: 1,
          counters: { earth: 0 },
          invoke: {
            timing: "start_of_turn",
            condition: { evolved_count_at_least: 0 },
          },
          triggers: [
            {
              event: "invoke",
              source: "board",
              effects: [WATCHER_TICK],
            },
          ],
        },
        "deck",
        watcherOwner,
      );
      state.players[watcherOwner].deck.unshift(invokeCard);
      break;
    }
    default:
      break;
  }
}

function raiserSpellForSecond(effects: Effect[]) {
  return createCard(
    {
      name: "SecondRaiserSpell",
      type: "Spell",
      cost: 1,
      spell: effects,
    },
    "hand",
    "second",
  );
}

function raiserFollowerForSecond(effects: Effect[], name = "SecondRaiser") {
  return createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 1,
      fanfare: effects,
    },
    "hand",
    "second",
  );
}

export interface V2MatrixRunResult extends MatrixRunResult {
  expectFired: boolean;
  skipUndoRoundTrip?: boolean;
}

export interface V2MatrixCellOptions {
  context: V2Context;
  event: ReactiveEvent | V2RemainingEvent;
  axis:
    | "enemy_enter"
    | "enemy_leave"
    | "enemy_super"
    | "enemy_defense"
    | "hand"
    | "turn"
    | "remaining";
  leaveMode?: LeaveMode;
  whoseTurn?: TurnOwnershipMode;
  expectFired?: boolean;
  onOwnerTurn?: boolean;
  nestingDepth?: 2 | 3;
  actor?: PlayerSlot;
}

function setupBaseState(
  context: V2Context,
  actor: PlayerSlot,
  opts: {
    onOwnerTurn?: boolean;
    watcherOwner?: PlayerSlot;
    axis?: string;
  } = {},
): void {
  resetUidCounter();
  setHistoryEnabled(true);
  resetHistory();
  (globalThis as any).HEADLESS = true;
  const roundCount = context === "C4_super_evolve" ? 8 : 6;
  const watcherOwner = opts.watcherOwner ?? actor;
  let active: PlayerSlot = watcherOwner;
  if (context.startsWith("C_opponent_")) {
    active = "second";
  } else if (context === "C11_sot" && opts.axis === "turn") {
    active = "second";
  } else if (opts.onOwnerTurn === false) {
    active = enemyWatcherOwner(watcherOwner);
  } else if (opts.onOwnerTurn === true) {
    active = watcherOwner;
  } else {
    active = actor;
  }
  givenGameState({ seed: 77, activePlayer: active, roundCount })
    .withFirstPP(10, 10)
    .withSecondPP(10, 10)
    .withFirstEvo(2)
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = active;
}

function dispatchExtraContext(
  context: V2ExtraContext | OpponentContext,
  raise: Effect[],
  actor: PlayerSlot,
): boolean {
  const dispatch = (action: Parameters<typeof engineDispatch>[1]) => {
    engineDispatch(state, action);
  };

  switch (context) {
    case "C_chain_summon": {
      const seed = createCard(
        {
          name: "Goblin",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 3,
        },
        "board",
        actor,
      );
      applyKeywordsFromList(seed);
      seed.peak_defense = 3;
      getBoard(state, actor).push(seed);
      handleFillBoardChainDecay(actor, seed);
      return false;
    }
    case "C_play_enter": {
      const vanilla = createCard(
        {
          name: "Goblin",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
        },
        "hand",
        actor,
      );
      state.players[actor].hand.push(vanilla);
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: vanilla.uid });
      return false;
    }
    case "C_opponent_fanfare": {
      const raiser = raiserFollowerForSecond([
        {
          op: "summon",
          source: "named",
          name: "Goblin",
          count: 1,
          owner: "enemy",
        },
      ]);
      state.players.second.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "second", cardUid: raiser.uid });
      return false;
    }
    case "C_opponent_spell_destroy": {
      getBoard(state, "first").push(leaveVictim("first"));
      const raiser = raiserSpellForSecond([
        {
          op: "destroy",
          target: "enemy:follower",
          filter: { name: "LeaveVictim" },
        },
      ]);
      state.players.second.hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: "second", cardUid: raiser.uid });
      return false;
    }
    case "C_opponent_combat_lw": {
      const defender = leaveVictim("first", "Blocker");
      defender.attack = 3;
      defender.defense = 3;
      defender.peak_defense = 3;
      getBoard(state, "first").push(defender);
      const attacker = createCard(
        {
          name: "OppLwAttacker",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 1,
          justPlayed: false,
          can_attack: true,
          can_attack_followers: true,
          attacks_left: 1,
          keywords: [{ name: "LastWords", effects: raise }],
        },
        "board",
        "second",
      );
      applyKeywordsFromList(attacker);
      attacker.peak_defense = 1;
      getBoard(state, "second").push(attacker);
      dispatch({
        type: "ATTACK",
        player: "second",
        attackerUid: attacker.uid,
        defender: { type: "card", uid: defender.uid },
      });
      return false;
    }
    case "C_opponent_sot": {
      const sot = raiserSotFollower(raise);
      sot.owner = "first";
      getBoard(state, "first").push(sot);
      dispatch({ type: "END_TURN" });
      return false;
    }
    default:
      return false;
  }
}

function turnAxisRaise(
  event: ReactiveEvent,
  onOwnerTurn: boolean,
  actionPlayer: PlayerSlot,
  watcherUid: string,
): Effect[] {
  if (event === "ally_follower_enter" && !onOwnerTurn) {
    return [
      {
        op: "summon",
        source: "named",
        name: "Goblin",
        count: 1,
        owner: "enemy",
      },
    ];
  }
  if (event === "ally_follower_leaves_field" && !onOwnerTurn) {
    return [
      {
        op: "destroy",
        target: "enemy:follower",
        filter: { name: "LeaveVictim" },
      },
    ];
  }
  return raiseEffects(event, { watcherUid });
}

export function runV2MatrixCell(opts: V2MatrixCellOptions): V2MatrixRunResult {
  const {
    context,
    event,
    axis,
    leaveMode,
    whoseTurn,
    expectFired = true,
    actor = "first",
    onOwnerTurn = true,
  } = opts;

  let watcherOwnerPre: PlayerSlot = actor;
  if (axis === "turn") {
    watcherOwnerPre =
      event === "leader_damaged" ? enemyWatcherOwner(actor) : actor;
    if (context === "C11_sot" && String(event).startsWith("ally_")) {
      watcherOwnerPre = enemyWatcherOwner(actor);
    }
  }

  setupBaseState(context, actor, {
    onOwnerTurn,
    watcherOwner: watcherOwnerPre,
    axis,
  });

  let watcherOwner: PlayerSlot = actor;
  let watcherUid = "";
  let raise: Effect[] = [];
  let pendingPrompt = false;
  const actionPlayer =
    axis === "turn"
      ? onOwnerTurn
        ? watcherOwnerPre
        : enemyWatcherOwner(watcherOwnerPre)
      : actor;

  if (axis === "enemy_enter") {
    watcherOwner = enemyWatcherOwner(actor);
    const watcher = makeV2Watcher("enemy_follower_enter", watcherOwner);
    watcherUid = watcher.uid;
    getBoard(state, watcherOwner).push(watcher);
    raise = raiseEffects("ally_follower_enter");
  } else if (axis === "enemy_super") {
    watcherOwner = enemyWatcherOwner(actor);
    const watcher = makeV2Watcher("enemy_super_evolve", watcherOwner, {
      zone: "hand",
    });
    watcherUid = watcher.uid;
    getHand(state, watcherOwner).push(watcher);
    raise = [];
  } else if (axis === "enemy_defense") {
    watcherOwner = enemyWatcherOwner(actor);
    const watcher = makeV2Watcher("enemy_follower_defense_down", watcherOwner);
    watcherUid = watcher.uid;
    getBoard(state, watcherOwner).push(watcher);
    getBoard(state, enemyWatcherOwner(actor)).push(
      leaveVictim(enemyWatcherOwner(actor), "LeaveVictim"),
    );
    raise = [
      {
        op: "stat",
        action: "give",
        target: "enemy:follower",
        filter: { name: "LeaveVictim" },
        defense: -1,
      },
    ];
  } else if (axis === "enemy_leave") {
    watcherOwner = actor;
    const watcher = makeV2Watcher("enemy_follower_leaves_field", watcherOwner);
    watcherUid = watcher.uid;
    getBoard(state, watcherOwner).push(watcher);
    const victim = installLeaveVictim(
      enemyWatcherOwner(actor),
      leaveMode ?? "destroy",
    );
    getBoard(state, enemyWatcherOwner(actor)).push(victim);
    raise = raiseLeaveEffects(leaveMode ?? "destroy", "enemy");
  } else if (axis === "hand") {
    watcherOwner = actor;
    const watcher = makeV2Watcher(event as ReactiveEvent, watcherOwner, {
      zone: "hand",
    });
    watcherUid = watcher.uid;
    getHand(state, watcherOwner).push(watcher);
    installEventSupport(event as ReactiveEvent, watcher);
    if (event === "ally_earth_rite") {
      installRemainingSupport("ally_earth_rite", watcherOwner);
      raise = [{ op: "earth_rite", amount: 1 } as Effect];
    } else if (event === "ally_super_evolve") {
      raise = [];
    } else if (event === "ally_evolve") {
      raise = raiseEffects("ally_evolve");
    } else if (event === "ally_card_played") {
      raise = [];
    } else {
      raise = raiseEffects(event as ReactiveEvent, { watcherUid });
    }
  } else if (axis === "turn") {
    watcherOwner =
      event === "leader_damaged" ? enemyWatcherOwner(actor) : actor;
    if (context === "C11_sot" && String(event).startsWith("ally_")) {
      watcherOwner = enemyWatcherOwner(actor);
    }
    const watcher = makeV2Watcher(event as ReactiveEvent, watcherOwner, {
      whoseTurn,
    });
    watcherUid = watcher.uid;
    getBoard(state, watcherOwner).push(watcher);
    installEventSupport(event as ReactiveEvent, watcher);
    if (!onOwnerTurn && event === "ally_follower_leaves_field") {
      getBoard(state, watcherOwner).push(leaveVictim(watcherOwner));
    }
    raise = turnAxisRaise(
      event as ReactiveEvent,
      onOwnerTurn,
      actionPlayer,
      watcherUid,
    );
  } else if (axis === "remaining") {
    if (event === "invoke") {
      installRemainingSupport("invoke", actor);
      const invokeCard = state.players[actor].deck.find(
        (c) => c.name === "InvokeProbe",
      );
      watcherUid = invokeCard?.uid ?? "";
      watcherOwner = actor;
    } else {
      watcherOwner = actor;
      const watcher = makeV2Watcher(event as V2RemainingEvent, watcherOwner);
      watcherUid = watcher.uid;
      getBoard(state, watcherOwner).push(watcher);
      installRemainingSupport(event as V2RemainingEvent, watcherOwner);
    }
    raise = raiseRemainingEventEffects(event as V2RemainingEvent, {
      watcherUid,
    });
  }

  const execContext = context as RaisingContext;
  if (
    context === "C_chain_summon" ||
    context === "C_play_enter" ||
    context.startsWith("C_opponent_")
  ) {
    pendingPrompt = dispatchExtraContext(
      context as V2ExtraContext | OpponentContext,
      raise,
      actionPlayer,
    );
  } else if (
    axis === "remaining" &&
    event === "engage" &&
    context === "C3_engage"
  ) {
    const amulet = raiserEngageAmulet([]);
    state.players[actionPlayer].board.push(amulet);
    engineDispatch(state, {
      type: "ENGAGE",
      player: actionPlayer,
      cardUid: amulet.uid,
    });
  } else if (
    axis === "remaining" &&
    event === "loot_played" &&
    context === "C2_spell"
  ) {
    const spell = getHand(state, actionPlayer).find(
      (c) => c.name === "Gilded Blade",
    );
    if (spell) {
      engineDispatch(state, {
        type: "PLAY_CARD",
        player: actionPlayer,
        cardUid: spell.uid,
      });
    }
  } else if (
    axis === "remaining" &&
    (event === "on_fuse" || event === "loot_fused")
  ) {
    const initiator = getHand(state, actionPlayer).find(
      (c) => c.name === "FuseInitiator",
    );
    const material = getHand(state, actionPlayer).find(
      (c) => c.name === "Gilded Blade",
    );
    if (initiator && material) {
      fuse_finalize_loot(actionPlayer, initiator.uid, [material]);
    }
  } else if (axis === "remaining" && event === "invoke") {
    if (context === "C11_sot") {
      const sot = raiserSotFollower([]);
      getBoard(state, enemyWatcherOwner(actionPlayer)).push(sot);
      engineDispatch(state, { type: "END_TURN" });
    } else if (context === "C10_eot") {
      const eot = raiserEotFollower([]);
      getBoard(state, actionPlayer).push(eot);
      engineDispatch(state, { type: "END_TURN" });
    } else {
      pendingPrompt = executeMatrixContext(execContext, raise, actionPlayer);
    }
  } else if (
    axis === "remaining" &&
    (context === "C10_eot" || context === "C11_sot")
  ) {
    pendingPrompt = executeMatrixContext(execContext, raise, actionPlayer);
  } else if (axis === "enemy_super") {
    const evo = raiserEvoFollower([], true);
    state.players[actionPlayer].board.push(evo);
    state.players[actionPlayer].superEvoCharges = 1;
    engineDispatch(state, {
      type: "EVOLVE",
      player: actionPlayer,
      cardUid: evo.uid,
      mode: "super",
    });
  } else if (axis === "hand" && event === "ally_super_evolve") {
    const evo = raiserEvoFollower([], true);
    state.players[actionPlayer].board.push(evo);
    state.players[actionPlayer].superEvoCharges = 1;
    engineDispatch(state, {
      type: "EVOLVE",
      player: actionPlayer,
      cardUid: evo.uid,
      mode: "super",
    });
  } else if (axis === "hand" && event === "ally_card_played") {
    const vanilla = createCard(
      {
        name: "HandPlayProbe",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
      },
      "hand",
      actionPlayer,
    );
    state.players[actionPlayer].hand.push(vanilla);
    engineDispatch(state, {
      type: "PLAY_CARD",
      player: actionPlayer,
      cardUid: vanilla.uid,
    });
  } else {
    pendingPrompt = executeMatrixContext(execContext, raise, actionPlayer);
  }

  return {
    watcherUid,
    watcherOwner,
    pendingPrompt,
    expectFired,
    summonExpectation: expectFired
      ? matrixNamedSummonExpectation({
          event:
            axis === "enemy_enter"
              ? "ally_follower_enter"
              : (event as ReactiveEvent),
          context,
          axis,
          actionPlayer,
          onOwnerTurn,
        })
      : null,
    skipUndoRoundTrip:
      context === "C10_eot" ||
      context === "C11_sot" ||
      context.startsWith("C_opponent_") ||
      (axis === "remaining" &&
        (event === "loot_fused" || event === "on_fuse" || event === "invoke")),
  };
}

function executeMatrixContext(
  context: RaisingContext,
  raise: Effect[],
  actor: PlayerSlot,
): boolean {
  let pendingPrompt = false;
  const dispatch = (action: Parameters<typeof engineDispatch>[1]) => {
    engineDispatch(state, action);
  };

  switch (context) {
    case "C1_fanfare": {
      const raiser = raiserFollowerInHand(raise);
      raiser.owner = actor;
      state.players[actor].hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: raiser.uid });
      break;
    }
    case "C2_spell": {
      const raiser = raiserSpellInHand(raise);
      state.players[actor].hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: raiser.uid });
      break;
    }
    case "C3_engage": {
      const amulet = raiserEngageAmulet(raise);
      state.players[actor].board.push(amulet);
      dispatch({ type: "ENGAGE", player: actor, cardUid: amulet.uid });
      break;
    }
    case "C4_evolve": {
      const evo = raiserEvoFollower(raise, false);
      state.players[actor].board.push(evo);
      dispatch({ type: "EVOLVE", player: actor, cardUid: evo.uid });
      break;
    }
    case "C4_super_evolve": {
      const evo = raiserEvoFollower(raise, true);
      state.players[actor].board.push(evo);
      state.players[actor].superEvoCharges = 1;
      dispatch({
        type: "EVOLVE",
        player: actor,
        cardUid: evo.uid,
        mode: "super",
      });
      break;
    }
    case "C5_target_handler": {
      const victim = selectVictim(actor);
      state.players[actor].board.push(victim);
      const raiser = createCard(
        {
          name: "Raiser",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          fanfare: [
            {
              op: "select",
              target: "ally:follower",
              select: 1,
              effects: raise,
            },
          ],
        },
        "hand",
        actor,
      );
      state.players[actor].hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: raiser.uid });
      pendingPrompt = !!state.pendingTargetEffect;
      if (pendingPrompt) {
        dispatch({
          type: "CHOOSE_TARGET",
          target: { type: "card", uid: victim.uid },
        });
      }
      break;
    }
    case "C7_deferred_lw": {
      const lw = lwVictimWithEffects(raise);
      state.players[actor].board.push(lw);
      const raiser = createCard(
        {
          name: "LwDestroyer",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          fanfare: [
            {
              op: "destroy",
              target: "ally:follower",
              filter: { name: "LwVictim" },
            },
          ],
        },
        "hand",
        actor,
      );
      state.players[actor].hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: raiser.uid });
      break;
    }
    case "C8_combat_lw": {
      const defender = leaveVictim(enemyWatcherOwner(actor), "Blocker");
      defender.attack = 3;
      defender.defense = 3;
      defender.peak_defense = 3;
      getBoard(state, enemyWatcherOwner(actor)).push(defender);
      const attacker = createCard(
        {
          name: "CombatAttacker",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 1,
          justPlayed: false,
          can_attack: true,
          can_attack_followers: true,
          attacks_left: 1,
          keywords: [{ name: "LastWords", effects: raise }],
        },
        "board",
        actor,
      );
      applyKeywordsFromList(attacker);
      attacker.peak_defense = 1;
      getBoard(state, actor).push(attacker);
      dispatch({
        type: "ATTACK",
        player: actor,
        attackerUid: attacker.uid,
        defender: { type: "card", uid: defender.uid },
      });
      break;
    }
    case "C10_eot": {
      const eot = raiserEotFollower(raise);
      state.players[actor].board.push(eot);
      dispatch({ type: "END_TURN" });
      break;
    }
    case "C11_sot": {
      const sot = raiserSotFollower(raise);
      getBoard(state, enemyWatcherOwner(actor)).push(sot);
      dispatch({ type: "END_TURN" });
      break;
    }
    case "C12_crest": {
      const crestTrigger =
        (raise[0] as any)?.op === "draw"
          ? { event: "ally_spell_played" as const, effects: raise }
          : { event: "ally_draw" as const, effects: raise };
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: "MatrixCrest",
          triggers: [crestTrigger],
        } as any,
        actor,
      );
      const spellBody =
        (raise[0] as any)?.op === "draw"
          ? ([] as Effect[])
          : ([{ op: "draw", source: "deck", count: 1 }] as Effect[]);
      const drawSpell = raiserSpellInHand(spellBody);
      state.players[actor].hand.push(drawSpell);
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: drawSpell.uid });
      break;
    }
    case "C13_mode": {
      const raiser = raiserFollowerInHand([
        {
          op: "mode",
          pick: "random",
          options: [{ label: "Raise", effects: raise }],
        },
      ]);
      state.players[actor].hand.push(raiser);
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: raiser.uid });
      break;
    }
    case "C14_enhance": {
      const raiser = createCard(
        {
          name: "EnhanceRaiser",
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          enhanceTiers: [{ cost: 5, effects: raise }],
        },
        "hand",
        actor,
      );
      state.players[actor].hand.push(raiser);
      state.players[actor].pp = 5;
      dispatch({ type: "PLAY_CARD", player: actor, cardUid: raiser.uid });
      break;
    }
    default:
      break;
  }
  return pendingPrompt;
}

export function runV2NestingCell(opts: {
  context: RaisingContext;
  depth: 2 | 3;
}): V2MatrixRunResult {
  setupBaseState(opts.context, "first");
  let terminalUid = "";

  if (opts.depth === 2) {
    const drawWatcher = makeMatrixWatcher("ally_draw", "first");
    terminalUid = drawWatcher.uid;
    getBoard(state, "first").push(drawWatcher);
    installEventSupport("ally_draw", drawWatcher);

    const enterWatcher = createCard(
      {
        name: "NestW1",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            source: "board",
            condition: { name: "Goblin" },
            effects: raiseEffects("ally_draw"),
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(enterWatcher);
    getBoard(state, "first").push(enterWatcher);
  } else {
    const dmgWatcher = makeMatrixWatcher("leader_damaged", "second");
    terminalUid = dmgWatcher.uid;
    getBoard(state, "second").push(dmgWatcher);
    setHP(state, "second", 20);

    const drawWatcher = createCard(
      {
        name: "NestW2",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "ally_draw",
            source: "board",
            effects: raiseEffects("leader_damaged"),
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(drawWatcher);
    getBoard(state, "first").push(drawWatcher);
    installEventSupport("ally_draw", drawWatcher);

    const enterWatcher = createCard(
      {
        name: "NestW1",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        triggers: [
          {
            event: "ally_follower_enter",
            source: "board",
            condition: { name: "Goblin" },
            effects: raiseEffects("ally_draw"),
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(enterWatcher);
    getBoard(state, "first").push(enterWatcher);
  }

  const pendingPrompt = executeMatrixContext(
    opts.context,
    [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
    "first",
  );

  return {
    watcherUid: terminalUid,
    watcherOwner: opts.depth === 3 ? "second" : "first",
    pendingPrompt,
    expectFired: true,
    summonExpectation: {
      boardOwner: "first",
      name: MATRIX_SUMMON_NAME,
    },
  };
}

export function assertV2ReactiveInvariants(
  run: V2MatrixRunResult,
  opts: { event?: ReactiveEvent | V2RemainingEvent; context?: string } = {},
): void {
  if (run.expectFired && run.summonExpectation) {
    assertMatrixNamedSummonPresent(run.summonExpectation);
  }
  const earth = watcherEarth(run.watcherOwner, run.watcherUid);
  if (run.expectFired) {
    expect(earth).toBe(1);
  } else {
    expect(earth).toBe(0);
  }
  expect(getResolutionQueue().length).toBe(0);
  expect((state as any)._drainingResolutionQueue).toBeFalsy();
  if (!run.pendingPrompt) {
    expect(state.pendingTargetEffect).toBeUndefined();
  }
  if (run.expectFired && !run.skipUndoRoundTrip) {
    assertReactiveInvariants(run.watcherUid, run.watcherOwner, {
      pendingPrompt: run.pendingPrompt,
      event: opts.event as ReactiveEvent,
      context: opts.context as RaisingContext,
    });
  }
}

export function buildV2EnemyEnterCells(): Array<{
  context: V2Context;
  label: string;
}> {
  const contexts: V2Context[] = [
    ...ENEMY_SIDE_ENTER_CONTEXTS,
    "C_chain_summon",
    "C_play_enter",
  ];
  return contexts.map((context) => ({
    context,
    label: `enemy_enter ${context}`,
  }));
}

export function buildV2EnemyLeaveCells(): Array<{
  context: RaisingContext;
  leaveMode: LeaveMode;
  label: string;
}> {
  const modes: LeaveMode[] = [
    "destroy",
    "bounce",
    "banish",
    "banish_on_death",
    "transform",
    "return",
  ];
  const contexts: RaisingContext[] = [
    "C1_fanfare",
    "C2_spell",
    "C5_target_handler",
    "C7_deferred_lw",
    "C8_combat_lw",
  ];
  const cells: Array<{
    context: RaisingContext;
    leaveMode: LeaveMode;
    label: string;
  }> = [];
  for (const context of contexts) {
    for (const leaveMode of modes) {
      cells.push({
        context,
        leaveMode,
        label: `enemy_leave ${context} × ${leaveMode}`,
      });
    }
  }
  return cells;
}

export function buildV2HandCells(): Array<{
  context: V2Context;
  event: V2HandEvent;
  label: string;
}> {
  const contexts: V2Context[] = [
    "C1_fanfare",
    "C5_target_handler",
    "C7_deferred_lw",
    "C8_combat_lw",
    "C10_eot",
    "C_play_enter",
  ];
  const cells: Array<{
    context: V2Context;
    event: V2HandEvent;
    label: string;
  }> = [];
  for (const context of contexts) {
    for (const event of V2_HAND_EVENTS) {
      cells.push({
        context,
        event,
        label: `hand ${context} × ${event}`,
      });
    }
  }
  return cells;
}

export function v2TurnSkipReason(
  context: V2Context,
  event: ReactiveEvent,
): string | null {
  if (context.startsWith("C_opponent_")) {
    if (context === "C_opponent_fanfare" && event !== "ally_follower_enter") {
      return "opponent fanfare Yurius shape only raises enter";
    }
    if (
      context === "C_opponent_spell_destroy" &&
      event !== "ally_follower_leaves_field"
    ) {
      return "opponent spell destroy only raises leaves_field";
    }
    if (context === "C_opponent_combat_lw" && event !== "ally_follower_enter") {
      return "opponent combat LW only raises enter via LW summon";
    }
    if (context === "C_opponent_sot" && event === "ally_follower_enter") {
      return "opponent SOT summon shape does not isolate whose_turn enter in harness";
    }
  }
  if (
    event === "ally_draw" &&
    (context === "C10_eot" || context === "C11_sot" || context === "C4_evolve")
  ) {
    return "ally_draw turn-ownership not isolatable from turn draw / evolve side effects";
  }
  if (context === "C_opponent_combat_lw" && event === "ally_follower_enter") {
    return "opponent combat LW summon shape does not isolate whose_turn enter";
  }
  return skipReason(context as RaisingContext, event);
}

export function expectedTurnOwnershipFire(
  context: V2Context,
  event: ReactiveEvent,
  whoseTurn: TurnOwnershipMode,
  onOwnerTurn: boolean,
): boolean {
  if (context.startsWith("C_opponent_")) {
    if (onOwnerTurn) return false;
    if (whoseTurn === "owner") return false;
    return true;
  }
  if (whoseTurn === "owner") return onOwnerTurn;
  return !onOwnerTurn;
}

export function buildV2EnemyDefenseCells(): Array<{
  context: RaisingContext;
  label: string;
}> {
  return (
    [
      "C1_fanfare",
      "C5_target_handler",
      "C7_deferred_lw",
      "C2_spell",
    ] as RaisingContext[]
  ).map((context) => ({ context, label: `enemy_defense ${context}` }));
}

export function buildV2NestingCells(): Array<{
  context: RaisingContext;
  depth: 2 | 3;
  label: string;
}> {
  const cells: Array<{
    context: RaisingContext;
    depth: 2 | 3;
    label: string;
  }> = [];
  for (const context of NESTING_CONTEXTS) {
    for (const depth of [2, 3] as const) {
      cells.push({
        context,
        depth,
        label: `nesting ${context} depth ${depth}`,
      });
    }
  }
  return cells;
}

export function buildV2TurnCells(): Array<{
  context: V2Context;
  event: ReactiveEvent;
  whoseTurn: TurnOwnershipMode;
  onOwnerTurn: boolean;
  label: string;
}> {
  const contexts: V2Context[] = [
    ...ALL_CONTEXTS.filter(
      (c) =>
        ![
          "C15_nesting",
          "C6_target_resume",
          "C9_strike",
          "C4_super_evolve",
          "C4_evolve",
          "C11_sot",
        ].includes(c),
    ),
    "C_opponent_fanfare",
    "C_opponent_spell_destroy",
  ];
  const cells: Array<{
    context: V2Context;
    event: ReactiveEvent;
    whoseTurn: TurnOwnershipMode;
    onOwnerTurn: boolean;
    label: string;
  }> = [];
  for (const context of contexts) {
    for (const event of CORE_EVENTS) {
      const skip = v2TurnSkipReason(context, event);
      if (skip) continue;
      for (const whoseTurn of ["owner", "opponent"] as TurnOwnershipMode[]) {
        for (const onOwnerTurn of [true, false]) {
          if (context.startsWith("C_opponent_") && onOwnerTurn) continue;
          if (event === "ally_draw" && !onOwnerTurn) continue;
          cells.push({
            context,
            event,
            whoseTurn,
            onOwnerTurn,
            label: `turn ${context} × ${event} × whose_turn:${whoseTurn} × active:${onOwnerTurn ? "owner" : "opponent"}`,
          });
        }
      }
    }
  }
  return cells;
}

export function buildV2RemainingCells(): Array<{
  context: RaisingContext;
  event: V2RemainingEvent;
  label: string;
}> {
  const contexts: RaisingContext[] = [
    "C1_fanfare",
    "C5_target_handler",
    "C7_deferred_lw",
    "C3_engage",
    "C2_spell",
    "C11_sot",
    "C10_eot",
  ];
  const cells: Array<{
    context: RaisingContext;
    event: V2RemainingEvent;
    label: string;
  }> = [];
  for (const context of contexts) {
    for (const event of V2_REMAINING_EVENTS) {
      cells.push({
        context,
        event,
        label: `remaining ${context} × ${event}`,
      });
    }
  }
  return cells;
}
