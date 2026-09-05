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
import { getBoard, setHP } from "../../src/core/playerHelpers.js";
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

  return { watcherUid, watcherOwner, pendingPrompt };
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
  } = opts;
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
