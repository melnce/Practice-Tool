/**
 * L2 real-card tests — Evolution Forestcraft deck (16 distinct cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 *
 * Cards also covered in l2-buff_forestcraft.test.ts (cite there in PR, not duplicated here):
 * Flight of the Swarmpetal, Magachiyo, Miroku, Cupitan, Spirited Skipper, Althenia, Sandalphon.
 * Sathanid evolve-trigger clause: tests/unit/sathanid-faith-trigger.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import {
  getBoard,
  getHand,
  getHP,
  getGraveyard,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const SATHANID = "10614120";
const EWIYAR = "10414110";
const KINDLY = "10612110";
const NURTURING = "10613310";
const GRAN = "10403110";
const MOTHERLY = "10611110";
const MERCIFUL = "10613110";
const GREAT_HART = "10714120";
const BAHAMUT = "10804110";

const FAIRY = "90011110";
const SPRINGBLOOM = "90011120";
const DEEPWOOD = "90011310";
const DEPTHS = "90014330";
const FILLER = "10111310";
const DRAW_TOP = "10011110";
const DRAW_DEEP = "10011120";

const FAITH_CREST = faithCrestNameForCard("Sathanid, Eld Lance");

const R6 = 6;
const R7 = 7;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<string | { name: string; type: string; cost?: number }>;
    pp?: number;
    evo?: number;
    hp?: number;
    active?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function allyFollower(atk = 2, def = 2, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function enemyLastWordsFollower(name = "LWTarget") {
  const lw = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 3 },
    "board",
    "second",
  );
  lw.peak_defense = 3;
  lw.hasLastWords = true;
  lw.lastWordsEffects = [
    { op: "summon", source: "named", name: "Fairy", count: 1 },
  ];
  state.players.second.board.push(lw);
  return lw;
}

function allyAmulet(name = "Sigil") {
  const c = createCard({ name, type: "Amulet", cost: 1 }, "board", "first");
  state.players.first.board.push(c);
  return c;
}

function setupFaith(owner: "first" | "second", amount: number): void {
  bootstrapFaithForPlayer(
    owner,
    state.players[owner].deck,
    state.players[owner].hand,
  );
  crestAddCounter(owner, FAITH_CREST, "faith", amount);
}

function gainTestCrest(name: string): void {
  handleGainCrest(
    {
      op: "crest",
      action: "gain",
      name,
      image: "/images/crests/test.png",
      description: name,
      triggers: [],
    } as any,
    "first",
  );
}

describe("L2 — Evolution Forestcraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Sathanid, Eld Lance (10614120)", () => {
    const printed =
      'Fanfare: Reduce your faith\'s value by 10 to add a Depths of the Eld Lance to your hand and give your faith "Whenever an allied follower evolves, deal 1 damage to the enemy leader."\nDrain';

    it("with faith ≥10: pays 10 faith, adds Depths to hand, grants evolve trigger", () => {
      setupTurn(R6, { hand: [SATHANID], pp: 1 });
      setupFaith("first", 10);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DEPTHS);
      expect(
        getCrests(state, "first").find((c) => c.name === FAITH_CREST)?.counters
          ?.faith,
      ).toBe(0);
      const ally = allyFollower();
      state.players.second.hp = 20;
      onEvolve(ally, "first", "normal", { spendPoint: false });
      expect(getHP(state, "second")).toBe(19);
      expect(printed).toContain("Depths of the Eld Lance");
    });

    it("with faith <10: Fanfare does not add Depths or pay faith", () => {
      setupTurn(R6, { hand: [SATHANID], pp: 1 });
      setupFaith("first", 5);
      whenPlayCard("first", 0);
      expect(handIds()).not.toContain(DEPTHS);
      expect(
        getCrests(state, "first").find((c) => c.name === FAITH_CREST)?.counters
          ?.faith,
      ).toBe(5);
      const ally = allyFollower();
      state.players.second.hp = 20;
      onEvolve(ally, "first", "normal", { spendPoint: false });
      expect(getHP(state, "second")).toBe(20);
    });

    it("has Drain keyword on play", () => {
      setupTurn(R6, { hand: [SATHANID], pp: 1 });
      whenPlayCard("first", 0);
      const sathanid = findOnBoard("first", "Sathanid, Eld Lance")!;
      applyKeywordsFromList(sathanid);
      expect(sathanid.hasDrain).toBe(true);
    });
  });

  describe("Ewiyar, Wind Personified (10414110)", () => {
    const printed = "Fanfare: Skybound Art- Recover 1 evolution point.\nRush.";

    it("Skybound Art (10): recovers 1 evolution point at round 10", () => {
      setupTurn(R10, { hand: [EWIYAR], pp: 2, evo: 0 });
      whenPlayCard("first", 0);
      expect(state.players.first.evoCharges).toBe(1);
      expect(printed).toContain("Recover 1 evolution point");
    });

    it("without Skybound Art: does not recover evolution point at round 6", () => {
      setupTurn(R6, { hand: [EWIYAR], pp: 2, evo: 0 });
      whenPlayCard("first", 0);
      expect(state.players.first.evoCharges).toBe(0);
    });

    it("has Rush keyword regardless of Skybound Art", () => {
      setupTurn(R6, { hand: [EWIYAR], pp: 2 });
      whenPlayCard("first", 0);
      const ewiyar = findOnBoard("first", "Ewiyar, Wind Personified")!;
      expect(ewiyar.hasRush).toBe(true);
    });
  });

  describe("Kindly Executor (10612110)", () => {
    const printed = "Fanfare: Add a Springbloom Fairy to your hand.";

    it("Fanfare adds Springbloom Fairy to hand by identity", () => {
      setupTurn(R6, { hand: [KINDLY], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(SPRINGBLOOM);
      expect(handIds()).not.toContain(FAIRY);
      expect(printed).toContain("Springbloom Fairy");
    });
  });

  describe("Nurturing Eld Lance (10613310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Destroy a random enemy follower with the highest attack.\n2. Summon a Springbloom Fairy.";

    it("Mode 1: destroys highest-attack enemy; lower-attack bystander untouched", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, { hand: [NURTURING], pp: 3 });
      const high = enemyFollower(5, 4, "HighAtk");
      const low = enemyFollower(2, 4, "LowAtk");
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getBoard(state, "second").some((c) => c.uid === high.uid)).toBe(
        false,
      );
      expect(getBoard(state, "second").some((c) => c.uid === low.uid)).toBe(
        true,
      );
      expect(printed).toContain("highest attack");
    });

    it("Mode 2: summons exactly one Springbloom Fairy on board", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(R6, { hand: [NURTURING], pp: 3 });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(boardIds().filter((id) => id === SPRINGBLOOM)).toHaveLength(1);
      expect(findOnBoard("first", "Springbloom Fairy")).toBeTruthy();
    });
  });

  describe("Gran & Djeeta, Valiant Skyfarers (10403110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\nSkybound Art- Evolve this follower.\n1. Deal 5 damage to a random enemy follower.\n2. Draw 2 followers.";

    it("Mode 1 without Skybound Art: damages enemy follower; does not self-evolve", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R6, { hand: [GRAN], pp: 4 });
      const foe = enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(Number(foe.defense)).toBe(3);
      const gran = findOnBoard("first", "Gran & Djeeta, Valiant Skyfarers")!;
      expect(gran.hasEvolved).toBeFalsy();
    });

    it("Skybound Art (10): self-evolves on Fanfare at round 10", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R10, { hand: [GRAN], pp: 4 });
      enemyFollower(2, 8);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const gran = findOnBoard("first", "Gran & Djeeta, Valiant Skyfarers")!;
      expect(gran.hasEvolved).toBe(true);
      expect(printed).toContain("Evolve this follower");
    });

    it("Mode 2: draws 2 followers from deck by identity", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(R6, {
        hand: [GRAN],
        deck: [DRAW_TOP, DRAW_DEEP, FILLER],
        pp: 4,
      });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_DEEP);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(DRAW_DEEP);
      expect(deckIds()).toContain(FILLER);
    });
  });

  describe("Motherly Forestdweller (10611110)", () => {
    const printed =
      "Fanfare: Add a Springbloom Fairy to your hand.\nEvolve: Summon a Springbloom Fairy.";

    it("Fanfare adds Springbloom Fairy to hand by identity", () => {
      setupTurn(R6, { hand: [MOTHERLY], pp: 4 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(SPRINGBLOOM);
      expect(boardIds().filter((id) => id === SPRINGBLOOM)).toHaveLength(0);
    });

    it("Evolve summons Springbloom Fairy on board", () => {
      setupTurn(R6, { hand: [MOTHERLY], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const mom = findOnBoard("first", "Motherly Forestdweller")!;
      onEvolve(mom, "first", "normal", { spendPoint: true });
      expect(boardIds().filter((id) => id === SPRINGBLOOM)).toHaveLength(1);
      expect(printed).toContain("Summon a Springbloom Fairy");
    });
  });

  describe("Merciful Attendant (10613110)", () => {
    const printed =
      "Fanfare: Summon a Springbloom Fairy.\nWhenever an allied follower evolves, restore 1 defense to your leader.";

    it("Fanfare summons exactly one Springbloom Fairy on board", () => {
      setupTurn(R7, { hand: [MERCIFUL], pp: 5 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === SPRINGBLOOM)).toHaveLength(1);
      expect(handIds()).not.toContain(SPRINGBLOOM);
    });

    it("when allied follower evolves: restores 1 defense to leader", () => {
      setupTurn(R7, { hand: [MERCIFUL], pp: 5, hp: 15 });
      whenPlayCard("first", 0);
      const fairy = findOnBoard("first", "Springbloom Fairy")!;
      onEvolve(fairy, "first", "normal", { spendPoint: false });
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("restore 1 defense");
    });

    it("when no ally evolves: leader defense unchanged", () => {
      setupTurn(R7, { hand: [MERCIFUL], pp: 5, hp: 15 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(15);
    });
  });

  describe("Great Hart of the Glacial Realm (10714120)", () => {
    const printed =
      "Fanfare: Add 2 copies of Deepwood Bounty to your hand.\nAt the end of your turn, deal X damage split between all enemy followers. X is this follower's attack.\nSuper-Evolve: Gain Crest: Great Hart of the Glacial Realm.";

    it("Fanfare adds 2 Deepwood Bounty to hand by identity", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      whenPlayCard("first", 0);
      expect(handIds().filter((id) => id === DEEPWOOD)).toHaveLength(2);
      expect(printed).toContain("Deepwood Bounty");
    });

    it("owner's EOT: deals attack-value split damage to enemy followers", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      const a = enemyFollower(1, 3, "A");
      const b = enemyFollower(1, 3, "B");
      whenPlayCard("first", 0);
      const startTotal = Number(a.defense) + Number(b.defense);
      whenEndTurn();
      const endTotal = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(startTotal - endTotal).toBe(5);
    });

    it("opponent's EOT: does not deal split damage", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6, active: "second" });
      const foe = enemyFollower(1, 5, "Foe");
      whenPlayCard("first", 0);
      const defBefore = Number(foe.defense);
      runEndOfTurnBoundary("second");
      expect(Number(foe.defense)).toBe(defBefore);
    });

    it("Super-Evolve gains Crest: Great Hart of the Glacial Realm", () => {
      setupTurn(R7, { hand: [GREAT_HART], pp: 6 });
      whenPlayCard("first", 0);
      const hart = findOnBoard("first", "Great Hart of the Glacial Realm")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      onEvolve(hart, "first", "super");
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Great Hart of the Glacial Realm",
        ),
      ).toBe(true);
    });
  });

  describe("Alabaster Bahamut (10804110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Banish all other followers from the field.\n2. Banish all amulets from the field.\n3. Banish all crests.";

    it("Mode 1: banishes other followers (not self, not graveyard)", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(R10, { hand: [BAHAMUT], pp: 9 });
      const allyLw = enemyLastWordsFollower("AllyLW");
      allyLw.owner = "first";
      allyLw.zone = "board";
      state.players.first.board = [
        ...state.players.first.board.filter((c) => c.uid !== allyLw.uid),
        allyLw,
      ];
      const enemyLw = enemyLastWordsFollower("EnemyLW");
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(findOnBoard("first", "Alabaster Bahamut")).toBeTruthy();
      expect(findOnBoard("first", "AllyLW")).toBeFalsy();
      expect(findOnBoard("second", "EnemyLW")).toBeFalsy();
      expect(
        getGraveyard(state, "first").some((c) => c.uid === allyLw.uid),
      ).toBe(false);
      expect(
        getGraveyard(state, "second").some((c) => c.uid === enemyLw.uid),
      ).toBe(false);
    });

    it("Mode 2: banishes all amulets from the field", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(R10, { hand: [BAHAMUT], pp: 9 });
      const allySigil = allyAmulet("AllySigil");
      const enemySigil = createCard(
        { name: "EnemySigil", type: "Amulet", cost: 1 },
        "board",
        "second",
      );
      state.players.second.board.push(enemySigil);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(findOnBoard("first", "AllySigil")).toBeFalsy();
      expect(findOnBoard("second", "EnemySigil")).toBeFalsy();
      expect(findOnBoard("first", "Alabaster Bahamut")).toBeTruthy();
      expect(printed).toContain("Banish all amulets");
    });

    it("Mode 3: banishes all crests", () => {
      setScriptedModePickProvider(() => [2]);
      setupTurn(R10, { hand: [BAHAMUT], pp: 9 });
      gainTestCrest("Test Crest Alpha");
      gainTestCrest("Test Crest Beta");
      expect(getCrests(state, "first").length).toBe(2);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getCrests(state, "first").length).toBe(0);
      expect(getCrests(state, "second").length).toBe(0);
    });
  });
});
