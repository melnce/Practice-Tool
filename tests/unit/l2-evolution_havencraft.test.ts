/**
 * L2 real-card tests — Evolution Havencraft deck (14 cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
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
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { restoreLeaderHP } from "../../src/logic/effects/ops/restore/primitives.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getCrests,
  getSuperEvoCharges,
  getGraveyard,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const ACADEMY_HIJINKS = "10863210";
const LILIUM = "10861110";
const LYRIA = "10403120";
const TRIDENT = "10763210";
const TROUE = "10461110";
const SOFINA = "10564110";
const ZOE = "10864120";
const ERRALDE = "10964110";
const JURATIO = "10963210";
const SANDALPHON = "10404110";
const VICHE = "10862120";
const EXECUTOR = "10963110";
const VERDILIA = "10864110";
const OLIVIA = "10804120";

const DRAW_TOP = "10111310"; // Fairy Convocation
const DRAW_SECOND = "10021110"; // Flashstep Quickblader
const BIG_FOLLOWER = "10002120"; // Caravan Mammoth (cost 7)
const SMALL_FOLLOWER = "10001110"; // Indomitable Fighter (cost 2)
const THREE_COST_FOLLOWER = "10002110"; // Arriet, Luxminstrel (cost 3)
const ENGAGE_AMULET = "10161210"; // Serene Sanctuary (Engage 1)
const FILLER = "10111310";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    hp?: number;
    active?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
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

function allyFollower(
  name = "Ally",
  atk = 2,
  def = 2,
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function wardAlly(name = "WardAlly") {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 2,
      defense: 2,
      keywords: ["Ward"],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
  c.peak_defense = 2;
  state.players.first.board.push(c);
  return c;
}

function evolvedAlly(name = "EvolvedAlly") {
  const c = allyFollower(name);
  c.hasEvolved = true;
  c.isEvolved = true;
  return c;
}

function superEvolvedAlly(name = "SuperAlly") {
  const c = allyFollower(name);
  c.hasEvolved = true;
  c.isEvolved = true;
  c.evoType = "super";
  return c;
}

describe("L2 — Evolution Havencraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Academy Hijinks (10863210)", () => {
    const printed =
      "Countdown (2) / At the end of your turn, draw a card and, if there's an evolved allied follower on the field, restore 1 defense to your leader. If there's a super-evolved allied follower on the field, restore 2 defense instead.";

    it("enters play with Countdown (2)", () => {
      setupTurn(R5, { hand: [ACADEMY_HIJINKS], pp: 2 });
      whenPlayCard("first", 0);
      const hijinks = findOnBoard("first", "Academy Hijinks")!;
      expect(Number(hijinks.countdown)).toBe(2);
      expect(printed).toContain("Countdown (2)");
    });

    it("owner's EOT draws stacked deck card; without evolved ally leader HP unchanged", () => {
      setupTurn(R5, {
        hand: [ACADEMY_HIJINKS],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 2,
        hp: 15,
      });
      whenPlayCard("first", 0);
      const hpBefore = getHP(state, "first");
      whenEndTurn();
      expect(handIds()).toContain(DRAW_TOP);
      expect(getHP(state, "first")).toBe(hpBefore);
      expect(printed).toContain("draw a card");
    });

    it("owner's EOT with evolved (not super) ally restores 1 defense", () => {
      setupTurn(R5, {
        hand: [ACADEMY_HIJINKS],
        deck: [DRAW_TOP],
        pp: 2,
        hp: 15,
      });
      whenPlayCard("first", 0);
      evolvedAlly();
      const hpBefore = getHP(state, "first");
      whenEndTurn();
      expect(getHP(state, "first")).toBe(hpBefore + 1);
      expect(handIds()).toContain(DRAW_TOP);
    });

    it("owner's EOT with super-evolved ally restores 2 defense instead of 1", () => {
      setupTurn(R5, {
        hand: [ACADEMY_HIJINKS],
        deck: [DRAW_TOP],
        pp: 2,
        hp: 15,
      });
      whenPlayCard("first", 0);
      superEvolvedAlly();
      const hpBefore = getHP(state, "first");
      whenEndTurn();
      expect(getHP(state, "first")).toBe(hpBefore + 2);
    });

    it("opponent's EOT does not draw or heal from Academy Hijinks", () => {
      setupTurn(R5, {
        hand: [ACADEMY_HIJINKS],
        deck: [DRAW_TOP],
        pp: 2,
        hp: 15,
        active: "second",
      });
      whenPlayCard("first", 0);
      evolvedAlly();
      const hpBefore = getHP(state, "first");
      const handBefore = handIds();
      runEndOfTurnBoundary("second");
      expect(handIds()).toEqual(handBefore);
      expect(getHP(state, "first")).toBe(hpBefore);
    });
  });

  describe("Lilium, Witch of the Tomes (10861110)", () => {
    const printed =
      "Last Words: Draw a card. / Evolve: Select an enemy follower on the field, remove all abilities from it, and deal it 2 damage.";

    it("Last Words draws the top stacked deck card", () => {
      setupTurn(R5, {
        hand: [LILIUM],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 2,
      });
      whenPlayCard("first", 0);
      const lilium = findOnBoard("first", "Lilium, Witch of the Tomes")!;
      lilium.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(printed).toContain("Last Words: Draw a card");
    });

    it("Evolve silences selected enemy and deals 2 damage; bystander keeps abilities and HP", () => {
      setupTurn(R5, { hand: [LILIUM], pp: 2 });
      state.players.first.evoCharges = 2;
      const target = enemyFollower(2, 5, "Target");
      applyKeywordsFromList(target);
      target.hasWard = true;
      const bystander = enemyFollower(2, 5, "Bystander");
      applyKeywordsFromList(bystander);
      bystander.hasWard = true;
      whenPlayCard("first", 0);
      const lilium = findOnBoard("first", "Lilium, Witch of the Tomes")!;
      whenEvolve(lilium, "first");
      resolvePendingByUid(target.uid);
      expect(target.hasWard).toBeFalsy();
      expect(Number(target.defense)).toBe(3);
      expect(bystander.hasWard).toBe(true);
      expect(Number(bystander.defense)).toBe(5);
    });
  });

  describe("Lyria, Skydestined (10403120)", () => {
    const printed =
      "Enhance(8): Draw a follower that costs 7 or more. Recover 7 play points / Barrier";

    it("without 8 PP: summons Lyria with Barrier on board", () => {
      setupTurn(R5, { hand: [LYRIA], pp: 2 });
      whenPlayCard("first", 0);
      const lyria = findOnBoard("first", "Lyria, Skydestined")!;
      expect(lyria).toBeTruthy();
      expect(lyria.hasBarrier).toBe(true);
      expect(handIds()).not.toContain(BIG_FOLLOWER);
    });

    it("Enhance(8): draws cost-7+ follower and recovers 7 PP; still summons Lyria", () => {
      setupTurn(R10, {
        hand: [LYRIA],
        deck: [SMALL_FOLLOWER, BIG_FOLLOWER],
        pp: 8,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(BIG_FOLLOWER);
      expect(handIds()).not.toContain(SMALL_FOLLOWER);
      expect(findOnBoard("first", "Lyria, Skydestined")).toBeTruthy();
      expect(getPP(state, "first")).toBe(7);
      expect(printed).toContain("Recover 7 play points");
    });
  });

  describe("Trident of Eroding Tides (10763210)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 4 damage. / Engage: Destroy this card. Select an enemy follower on the field and deal it 2 damage.";

    it("Fanfare deals 4 to selected enemy; bystander untouched", () => {
      setupTurn(R5, { hand: [TRIDENT], pp: 3 });
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(6);
    });

    it("Engage destroys Trident and deals 2 to selected enemy; bystander untouched", () => {
      setupTurn(R5, { hand: [TRIDENT], pp: 3 });
      const target = enemyFollower(2, 6, "EngageTarget");
      const bystander = enemyFollower(2, 6, "EngageBystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const tridentIdx = state.players.first.board.findIndex(
        (c) => c.name === "Trident of Eroding Tides",
      );
      engageAmulet("first", tridentIdx);
      resolvePendingByUid(target.uid);
      expect(findOnBoard("first", "Trident of Eroding Tides")).toBeFalsy();
      expect(Number(target.defense)).toBe(0);
      expect(Number(bystander.defense)).toBe(6);
    });
  });

  describe("Troue, Heroic Visionary (10461110)", () => {
    const printed =
      "Storm. / Whenever you Engage an amulet, give this follower Drain.";

    it("has Storm on board", () => {
      setupTurn(R5, { hand: [TROUE], pp: 3 });
      whenPlayCard("first", 0);
      const troue = findOnBoard("first", "Troue, Heroic Visionary")!;
      applyKeywordsFromList(troue);
      expect(troue.hasStorm).toBe(true);
    });

    it("without Engaging an amulet: does not gain Drain", () => {
      setupTurn(R5, { hand: [TROUE], pp: 3 });
      whenPlayCard("first", 0);
      const troue = findOnBoard("first", "Troue, Heroic Visionary")!;
      expect(troue.hasDrain).toBeFalsy();
    });

    it("Engaging an amulet grants Drain to Troue", () => {
      setupTurn(R6, { hand: [ENGAGE_AMULET, TROUE], pp: 4 });
      const troue = createCard(TROUE, "board", "first");
      applyKeywordsFromList(troue);
      troue.peak_defense = troue.defense;
      state.players.first.board = [troue];
      whenPlayCard("first", 0);
      const amuletIdx = state.players.first.board.findIndex(
        (c) => c.type === "Amulet" && c.name === "Serene Sanctuary",
      );
      engageAmulet("first", amuletIdx);
      expect(troue.hasDrain).toBe(true);
    });
  });

  describe("Sofina, Inspiring Strength (10564110)", () => {
    const printed =
      "Fanfare: Select a Mode to activate. / 1. Evolve this follower. / 2. Evolve another random unevolved allied follower with Ward and give it +1/+1. / Ward / At the end of your turn, if this follower is evolved, give all other followers on the field -1/-1.";

    it("has Ward", () => {
      setupTurn(R6, { hand: [SOFINA], pp: 4 });
      whenPlayCard("first", 0);
      const sofina = findOnBoard("first", "Sofina, Inspiring Strength")!;
      applyKeywordsFromList(sofina);
      expect(sofina.hasWard).toBe(true);
    });

    it("mode 1: evolves Sofina", () => {
      setupTurn(R6, { hand: [SOFINA], pp: 4 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const sofina = findOnBoard("first", "Sofina, Inspiring Strength")!;
      expect(sofina.hasEvolved).toBe(true);
    });

    it("mode 2: evolves a random unevolved Ward ally and gives it +1/+1", () => {
      setupTurn(R6, { hand: [SOFINA], pp: 4 });
      const ward = wardAlly("WardPick");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(ward.hasEvolved).toBe(true);
      // Evolve +2/+2 then mode +1/+1 on a 2/2 Ward ally → 5/5
      expect(Number(ward.attack)).toBe(5);
      expect(Number(ward.defense)).toBe(5);
    });

    it("owner's EOT when evolved: gives other followers -1/-1", () => {
      setupTurn(R6, { hand: [SOFINA], pp: 4 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const ally = allyFollower("Other", 3, 3);
      const sofina = findOnBoard("first", "Sofina, Inspiring Strength")!;
      const sofinaAtkBefore = Number(sofina.attack);
      whenEndTurn();
      expect(Number(ally.attack)).toBe(2);
      expect(Number(ally.defense)).toBe(2);
      expect(Number(sofina.attack)).toBe(sofinaAtkBefore);
    });

    it("owner's EOT when not evolved: other followers unchanged", () => {
      setupTurn(R6, { pp: 4 });
      const sofina = createCard(SOFINA, "board", "first");
      sofina.peak_defense = sofina.defense;
      applyKeywordsFromList(sofina);
      state.players.first.board = [sofina];
      const ally = allyFollower("Other", 3, 3);
      expect(sofina.hasEvolved).toBeFalsy();
      whenEndTurn();
      expect(Number(ally.attack)).toBe(3);
      expect(Number(ally.defense)).toBe(3);
    });
  });

  describe("Zoe, Dazzling Hope (10864120)", () => {
    const printed =
      "Fanfare: Select a Mode to activate. Deal 3 damage to this follower. / 1. Deal 3 damage to all enemy followers. / 2. Deal 3 damage to the enemy leader. / 3. Restore 3 defense to your leader. / Evolve: Gain Crest: Zoe, Dazzling Hope.";

    it("mode 1: self takes 3 then all enemy followers take 3", () => {
      setupTurn(R6, { hand: [ZOE], pp: 5 });
      const a = enemyFollower(2, 5, "A");
      const b = enemyFollower(2, 5, "B");
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      const zoe = findOnBoard("first", "Zoe, Dazzling Hope")!;
      expect(Number(zoe.defense)).toBe(1);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
    });

    it("mode 2: self takes 3 then enemy leader takes 3", () => {
      setupTurn(R6, { hand: [ZOE], pp: 5, hp: 20 });
      const hpEnemyBefore = getHP(state, "second");
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const zoe = findOnBoard("first", "Zoe, Dazzling Hope")!;
      expect(Number(zoe.defense)).toBe(1);
      expect(getHP(state, "second")).toBe(hpEnemyBefore - 3);
    });

    it("mode 2: Zoe survives at 1 defense and is on the board", () => {
      setupTurn(R6, { hand: [ZOE], pp: 5 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const zoe = findOnBoard("first", "Zoe, Dazzling Hope")!;
      expect(zoe).toBeTruthy();
      expect(Number(zoe.defense)).toBe(1);
    });

    it("mode 3 restores leader then deals 3 to Zoe — 10864120: printed Fanfare deals 3 to self; observed restore without self damage", () => {
      setupTurn(R6, { hand: [ZOE], pp: 5, hp: 15 });
      const hpBefore = getHP(state, "first");
      setScriptedModePickProvider(() => [2]);
      whenPlayCard("first", 0);
      const zoe = findOnBoard("first", "Zoe, Dazzling Hope")!;
      expect(getHP(state, "first")).toBe(hpBefore + 3);
      expect(Number(zoe.defense)).toBe(1);
    });

    it("Evolve gains Crest: Zoe, Dazzling Hope — 10864120: evolve crest not applied", () => {
      setupTurn(R6, { hand: [ZOE], pp: 5 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      const zoe = findOnBoard("first", "Zoe, Dazzling Hope")!;
      state.players.first.evoCharges = 2;
      whenEvolve(zoe, "first");
      expect(
        getCrests(state, "first").some((c) => c.name === "Zoe, Dazzling Hope"),
      ).toBe(true);
    });

    it("crest Last Words at countdown 0 summons a Zoe, Dazzling Hope that is evolved", () => {
      setupTurn(R6, { pp: 5 });
      const zoe = createCard(ZOE, "board", "first");
      state.players.first.board.push(zoe);
      state.players.first.evoCharges = 2;
      whenEvolve(zoe, "first");
      expect(
        getCrests(state, "first").some((c) => c.name === "Zoe, Dazzling Hope"),
      ).toBe(true);
      const boardBefore = thenBoard("first").length;
      whenEndTurn();
      whenEndTurn();
      expect(thenBoard("first").length).toBe(boardBefore + 1);
      const summoned = thenBoard("first").find((c) => c.uid !== zoe.uid);
      expect(summoned).toBeTruthy();
      expect(summoned!.name).toBe("Zoe, Dazzling Hope");
      expect(summoned!.hasEvolved).toBe(true);
      expect(Number(summoned!.attack)).toBe(4);
      expect(Number(summoned!.defense)).toBe(6);
    });
  });

  describe("Erralde, Signet Convict (10964110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. / Evolve: Gain Crest: Erralde, Signet Convict.";

    it("Fanfare destroys selected enemy; bystander remains", () => {
      setupTurn(R8, { hand: [ERRALDE], pp: 6 });
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getBoard(state, "second").some((c) => c.uid === bystander.uid),
      ).toBe(true);
      expect(
        getGraveyard(state, "second").some((c) => c.uid === target.uid),
      ).toBe(true);
    });

    it("Evolve gains Crest: Erralde, Signet Convict", () => {
      setupTurn(R8, { hand: [ERRALDE], pp: 6 });
      enemyFollower(2, 5);
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const erralde = findOnBoard("first", "Erralde, Signet Convict")!;
      state.players.first.evoCharges = 2;
      whenEvolve(erralde, "first");
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Erralde, Signet Convict",
        ),
      ).toBe(true);
    });
  });

  describe("Juratio (10963210)", () => {
    const printed =
      "Fanfare: Destroy all followers. / Engage (1): Destroy this card. Draw a card. Restore 1 defense to your leader.";

    it("Fanfare destroys all allied and enemy followers", () => {
      setupTurn(R8, { hand: [JURATIO], pp: 6 });
      allyFollower();
      enemyFollower(2, 4);
      whenPlayCard("first", 0);
      expect(
        getBoard(state, "first").filter((c) => c.type === "Follower").length,
      ).toBe(0);
      expect(getBoard(state, "second").length).toBe(0);
    });

    it("Engage (1): destroys Juratio, draws stacked card, restores 1 leader defense", () => {
      setupTurn(R8, {
        hand: [JURATIO],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 7,
        hp: 18,
      });
      whenPlayCard("first", 0);
      const hpBefore = getHP(state, "first");
      const juratioIdx = state.players.first.board.findIndex(
        (c) => c.name === "Juratio",
      );
      engageAmulet("first", juratioIdx);
      expect(findOnBoard("first", "Juratio")).toBeFalsy();
      expect(handIds()).toContain(DRAW_TOP);
      expect(getHP(state, "first")).toBe(hpBefore + 1);
    });
  });

  describe("Sandalphon, Primarch Successor (10404110)", () => {
    const printed =
      'Activates in deck. At the start of your turn, if allied followers have evolved at least 6 times this match, Invoke this card. / When this card is Invoked, gain Crest: Sandalphon, Primarch Successor and return this card to hand / Fanfare: Super Skybound Art- Do this 5 times: "Deal 2 damage to a random enemy."';

    it("start of turn with fewer than 6 evolves: does not invoke from deck", () => {
      setupTurn(R6, { hand: [], deck: [SANDALPHON, FILLER], pp: 6 });
      state.players.first.evoCount = 5;
      whenEndTurn();
      whenEndTurn();
      expect(handIds()).not.toContain(SANDALPHON);
      expect(deckIds()).toContain(SANDALPHON);
    });

    it("start of turn with 6+ evolves: invokes, gains crest, returns to hand", () => {
      setupTurn(R6, { hand: [], deck: [SANDALPHON, FILLER], pp: 6 });
      state.players.first.evoCount = 6;
      whenEndTurn();
      whenEndTurn();
      expect(handIds()).toContain(SANDALPHON);
      expect(deckIds()).not.toContain(SANDALPHON);
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Sandalphon, Primarch Successor",
        ),
      ).toBe(true);
      expect(thenBoard("first").length).toBe(0);
    });

    it("Fanfare Super Skybound Art: 5 hits of 2 damage to random enemies", () => {
      setupTurn(R10, { hand: [SANDALPHON], pp: 6 });
      const sand = getHand(state, "first").find((c) => c.id === SANDALPHON)!;
      sand.skyboundArtEvolvesWitnessed = 15;
      enemyFollower(2, 20, "Wall");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const wall = getBoard(state, "second")[0]!;
      const followerDmg = 20 - Number(wall.defense);
      const leaderDmg = 20 - getHP(state, "second");
      expect(followerDmg + leaderDmg).toBe(10);
    });
  });

  describe("Viche, Abyssal Researcher (10862120)", () => {
    const printed =
      "Activates in hand. Whenever an allied follower super-evolves, reduce the cost of this card by 3. / Rush / Bane";

    it("has Rush and Bane in hand", () => {
      setupTurn(R8, { hand: [VICHE], pp: 6 });
      const viche = getHand(state, "first").find((c) => c.id === VICHE)!;
      applyKeywordsFromList(viche);
      expect(viche.hasRush).toBe(true);
      expect(viche.hasBane).toBe(true);
    });

    it("when ally super-evolves: reduces in-hand cost by 3", () => {
      setupTurn(R8, { hand: [VICHE], pp: 6 });
      const viche = () => getHand(state, "first").find((c) => c.id === VICHE)!;
      expect(getEffectiveCost(viche())).toBe(6);
      const ally = allyFollower();
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(ally, "first");
      expect(getEffectiveCost(viche())).toBe(3);
    });

    it("when ally only normal-evolves: does not reduce in-hand cost", () => {
      setupTurn(R8, { hand: [VICHE], pp: 6 });
      const viche = () => getHand(state, "first").find((c) => c.id === VICHE)!;
      expect(getEffectiveCost(viche())).toBe(6);
      const ally = allyFollower();
      state.players.first.evoCharges = 2;
      whenEvolve(ally, "first");
      expect(getEffectiveCost(viche())).toBe(6);
    });
  });

  describe("Executor of the Vow (10963110)", () => {
    const printed =
      "Fanfare: Restore 2 defense to your leader. / Ward / During your turn, whenever your leader's defense is restored, destroy a random enemy follower. / Super-Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare restores 2 defense; has Ward", () => {
      setupTurn(R8, { hand: [EXECUTOR], pp: 7, hp: 15 });
      const hpBefore = getHP(state, "first");
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(hpBefore + 2);
      const exec = findOnBoard("first", "Executor of the Vow")!;
      applyKeywordsFromList(exec);
      expect(exec.hasWard).toBe(true);
    });

    it("during your turn leader restore destroys a random enemy follower", () => {
      setupTurn(R8, { hand: [EXECUTOR], pp: 7, hp: 15 });
      enemyFollower(2, 4, "Victim");
      whenPlayCard("first", 0);
      state.players.first.hp = 15;
      restoreLeaderHP("first", 1);
      expect(getBoard(state, "second").length).toBe(0);
    });

    it("during opponent's turn leader restore does not destroy enemy followers", () => {
      setupTurn(R8, { hand: [EXECUTOR], pp: 7, hp: 15, active: "second" });
      enemyFollower(2, 4, "Safe");
      whenPlayCard("first", 0);
      state.players.first.hp = 15;
      runEndOfTurnBoundary("second");
      restoreLeaderHP("first", 1);
      expect(getBoard(state, "second").length).toBe(1);
    });

    it("Super-Evolve replicates Fanfare restore (additional +2)", () => {
      setupTurn(R8, { hand: [EXECUTOR], pp: 7, hp: 15 });
      whenPlayCard("first", 0);
      const exec = findOnBoard("first", "Executor of the Vow")!;
      const hpAfterFanfare = getHP(state, "first");
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(exec, "first");
      expect(getHP(state, "first")).toBe(hpAfterFanfare + 2);
    });
  });

  describe("Verdilia & Castelle, Sisters (10864110)", () => {
    const printed =
      "Fanfare: Summon a random follower that costs 2 or less from your deck and super-evolve it. / Super-Evolve: Gain Crest: Verdilia & Castelle, Sisters.";

    it("Fanfare summons a cost-2-or-less follower from deck (identity)", () => {
      setupTurn(R8, {
        hand: [VERDILIA],
        deck: [SMALL_FOLLOWER],
        pp: 7,
      });
      whenPlayCard("first", 0);
      expect(deckIds()).not.toContain(SMALL_FOLLOWER);
      expect(thenBoard("first").some((c) => c.id === SMALL_FOLLOWER)).toBe(
        true,
      );
    });

    it("Fanfare summons a ≤2-cost follower from deck and super-evolves it (+3/+3, evoType super)", () => {
      setupTurn(R8, {
        hand: [VERDILIA],
        deck: [SMALL_FOLLOWER],
        pp: 7,
      });
      // withFirstDeck pads with synthetic PadF* cards not in the DB; force one real candidate.
      state.players.first.deck = [createCard("10001110", "deck", "first")];
      whenPlayCard("first", 0);
      expect(deckIds()).not.toContain(SMALL_FOLLOWER);
      const summoned = thenBoard("first").find((c) => c.id === SMALL_FOLLOWER);
      expect(summoned).toBeTruthy();
      expect(summoned!.hasEvolved).toBe(true);
      expect(summoned!.evoType).toBe("super");
      expect(Number(summoned!.attack)).toBe(5);
      expect(Number(summoned!.defense)).toBe(5);
    });

    it("Fanfare with only >2-cost follower in deck summons nothing", () => {
      setupTurn(R8, {
        hand: [VERDILIA],
        deck: [THREE_COST_FOLLOWER],
        pp: 7,
      });
      state.players.first.deck = [
        createCard(THREE_COST_FOLLOWER, "deck", "first"),
      ];
      const deckBefore = deckIds();
      whenPlayCard("first", 0);
      expect(deckIds()).toEqual(deckBefore);
      expect(thenBoard("first").some((c) => c.id === THREE_COST_FOLLOWER)).toBe(
        false,
      );
    });

    it("Super-Evolve gains Crest: Verdilia & Castelle, Sisters", () => {
      setupTurn(R8, { hand: [VERDILIA], pp: 7 });
      whenPlayCard("first", 0);
      const verdilia = findOnBoard("first", "Verdilia & Castelle, Sisters")!;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(verdilia, "first");
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Verdilia & Castelle, Sisters",
        ),
      ).toBe(true);
    });
  });

  describe("Olivia, Proud Dark Angel (10804120)", () => {
    const printed = "Fanfare: Recover 2 super-evolution points. / Ward";

    it("Fanfare recovers 2 super-evolution points", () => {
      setupTurn(R10, { hand: [OLIVIA], pp: 9 });
      state.players.first.superEvoCharges = 0;
      whenPlayCard("first", 0);
      expect(getSuperEvoCharges(state, "first")).toBe(2);
    });

    it("has Ward on board", () => {
      setupTurn(R10, { hand: [OLIVIA], pp: 9 });
      whenPlayCard("first", 0);
      const olivia = findOnBoard("first", "Olivia, Proud Dark Angel")!;
      applyKeywordsFromList(olivia);
      expect(olivia.hasWard).toBe(true);
    });
  });
});
