/**
 * L2 real-card tests — rotation-legal Havencraft cards (31 cards).
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
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { restoreLeaderHP } from "../../src/logic/effects/ops/restore/primitives.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  destroyCardForLastWords,
  expireCountdownForLastWords,
} from "../harness/l2Dispatch.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Cards under test
const AWED_INSPIRED = "10461210";
const TIKOH = "10463110";
const TENETS = "10961110";
const LAMRETTA = "10461120";
const LINGERING_THREAT = "10862310";
const PROTECTIVE_SHELL = "10562210";
const ADVENT_ELD_TOME = "10661310";
const AGENT_TESTAMENTS = "10962110";
const GALLEON = "10464110";
const MIRACULOUS_ALMIRAJ = "10962120";
const PRESCIENT_PRIESTESS = "10561110";
const AVIAN_STATUE = "10061210";
const IRONFIST_PRIEST = "10062110";
const SARA = "10462110";
const SKYFARING_VESSEL = "10462210";
const SOPHIA = "10462120";
const VENERATING_DYER = "10662110";
const WINGED_WARRIOR = "10061130";
const GRANT = "10861130";
const SAINT_REHAB = "10563110";
const MISSIONARY = "10761120";
const PEGASUS_RIDER = "10662120";
const PERYTON = "10961120";
const SOULCURE_SISTER = "10061110";
const WORSHIPFUL_CRUSADER = "10663110";
const THERESA = "10861120";
const EDETH = "10862110";
const IMMOVABLE_PALADIN = "10562110";
const RODEO = "10764110";
const SACRED_GRIFFON = "10062120";
const VIRA = "10464120";

// Helpers / tokens
const HOLY_FALCON = "90061110";
const REGAL_FALCON = "90061130";
const RINGS_MOONLIGHT = "90064210";
const FOX_PURITY = "10061120";
const SERENE_SANCTUARY = "10161210";
const SARIISA = "10162110";
const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const R15 = 15;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    maxPP?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    seed?: number;
  } = {},
) {
  const max = opts.maxPP ?? Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
    state.players.first.superEvoPoints = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  const uid = pending?.poolUids?.[0] ?? String(pending?.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function boardCountById(
  id: string,
  player: "first" | "second" = "first",
): number {
  return thenBoard(player).filter((c) => c.id === id).length;
}

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
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
  atk: number,
  def: number,
  name = "Ally",
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

function wardAlly(name = "WardAlly", atk = 2, def = 2) {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: atk,
      defense: def,
      keywords: ["Ward"],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(c);
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

function amuletIndex(
  name: string,
  player: "first" | "second" = "first",
): number {
  return state.players[player].board.findIndex((c) => c.name === name);
}

function triggerLastWords(_amuletId: string, amuletName: string): void {
  const card = findOnBoard("first", amuletName)!;
  destroyCardForLastWords(card, "first");
}

describe("L2 — Rotation Havencraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    // no-op
  });

  describe("Awed and Inspired (10461210)", () => {
    const printed =
      "Engage(2): Destroy this card. Select an allied follower on the field and transform it into an Awed and Inspired. Draw a card.";

    it("Engage(2) destroys amulet, transforms selected ally into Awed and Inspired, draws stacked card", () => {
      setupTurn(R6, {
        hand: [AWED_INSPIRED],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 2,
      });
      const ally = allyFollower(2, 2, "TransformTarget");
      const handBefore = handUids();
      whenPlayCard("first", 0);
      engageAmulet("first", amuletIndex("Awed and Inspired"));
      resolvePendingByUid(ally.uid);
      expect(
        state.players.first.board.some((c) => c.name === "Awed and Inspired"),
      ).toBe(true);
      expect(findOnBoard("first", "TransformTarget")).toBeFalsy();
      const drawn = thenHand("first").filter((c) => !handBefore.has(c.uid));
      expect(drawn.map((c) => String(c.id))).toEqual([DRAW_TOP]);
      expect(printed).toContain("Draw a card");
    });
  });

  describe("Tikoh, Asclepian Surgeon (10463110)", () => {
    const printed =
      "Whenever you Engage an amulet, restore 1 defense to your leader. / Evolve: Select an enemy follower on the field and deal it 3 damage.";

    it("Engaging an allied amulet restores 1 leader defense", () => {
      setupTurn(R6, { hand: [TIKOH, SERENE_SANCTUARY], pp: 3, hp: 17 });
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      engageAmulet("first", amuletIndex("Serene Sanctuary"));
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("restore 1 defense");
    });

    it("without Engage: leader defense unchanged", () => {
      setupTurn(R6, { hand: [TIKOH], pp: 1, hp: 17 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(17);
    });

    it("Evolve deals exactly 3 damage to selected enemy; bystander untouched", () => {
      setupTurn(R6, { hand: [TIKOH], pp: 1, evo: 2 });
      whenPlayCard("first", 0);
      const target = enemyFollower(2, 5, "Target");
      const bystander = enemyFollower(2, 5, "Bystander");
      const tikoh = findOnBoard("first", "Tikoh, Asclepian Surgeon")!;
      whenEvolve(tikoh, "first");
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(5);
    });
  });

  describe("Follower of the Tenets (10961110)", () => {
    const printed =
      "Ward / During your turn, when your leader's defense is restored, evolve this follower.";

    it("enters play with Ward", () => {
      setupTurn(R5, { hand: [TENETS], pp: 2 });
      whenPlayCard("first", 0);
      const tenets = findOnBoard("first", "Follower of the Tenets")!;
      applyKeywordsFromList(tenets);
      expect(tenets.hasWard).toBe(true);
    });

    it("during your turn leader restore evolves this follower", () => {
      setupTurn(R5, { hand: [TENETS], pp: 2 });
      whenPlayCard("first", 0);
      const tenets = findOnBoard("first", "Follower of the Tenets")!;
      expect(!!tenets.hasEvolved || !!tenets.isEvolved).toBe(false);
      state.players.first.hp = 18;
      restoreLeaderHP("first", 1);
      expect(!!tenets.hasEvolved || !!tenets.isEvolved).toBe(true);
      expect(printed).toContain("During your turn");
    });

    it("during opponent's turn leader restore does not evolve — printed: 'During your turn' (10961110)", () => {
      setupTurn(R5, { hand: [TENETS], pp: 2 });
      whenPlayCard("first", 0);
      const tenets = findOnBoard("first", "Follower of the Tenets")!;
      whenEndTurn();
      expect(state.activePlayer).toBe("second");
      state.players.first.hp = 18;
      restoreLeaderHP("first", 1);
      expect(!!tenets.hasEvolved || !!tenets.isEvolved).toBe(false);
    });
  });

  describe("Lamretta, Sisterly Shepherd (10461120)", () => {
    const printed =
      'At the end of your turn, if this follower is evolved, deal 2 damage to all followers. / Evolve: Give this follower "Can\'t attack followers or leaders" until the end of the turn.';

    it("at owner's EOT when evolved: deals 2 damage to all followers", () => {
      setupTurn(R6);
      const lam = createCard(LAMRETTA, "board", "first");
      lam.peak_defense = lam.defense;
      lam.hasEvolved = true;
      lam.isEvolved = true;
      const ally = allyFollower(1, 3, "AllyVictim");
      const foe = enemyFollower(3, 3, "EnemyVictim");
      state.players.first.board = [lam, ally];
      runEndOfTurnBoundary("first");
      expect(Number(ally.defense)).toBe(1);
      expect(Number(foe.defense)).toBe(1);
    });

    it("at owner's EOT when not evolved: followers take no damage", () => {
      setupTurn(R6, { hand: [LAMRETTA], pp: 2 });
      whenPlayCard("first", 0);
      const ally = allyFollower(1, 3, "SafeAlly");
      const foe = enemyFollower(3, 3, "SafeEnemy");
      runEndOfTurnBoundary("first");
      expect(Number(ally.defense)).toBe(3);
      expect(Number(foe.defense)).toBe(3);
      expect(printed).toContain("if this follower is evolved");
    });

    it("Evolve gives Can't attack until end of turn", () => {
      setupTurn(R6, { hand: [LAMRETTA], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const lam = findOnBoard("first", "Lamretta, Sisterly Shepherd")!;
      whenEvolve(lam, "first");
      expect(
        lam.cantAttack ||
          lam.keywordState?.cantAttack ||
          lam.cantAttackFollowers,
      ).toBe(true);
    });

    it("without Evolve: can still attack normally", () => {
      setupTurn(R6, { hand: [LAMRETTA], pp: 2 });
      whenPlayCard("first", 0);
      const lam = findOnBoard("first", "Lamretta, Sisterly Shepherd")!;
      expect(
        lam.cantAttack ||
          lam.keywordState?.cantAttack ||
          lam.cantAttackFollowers,
      ).toBeFalsy();
    });
  });

  describe("Lingering Threat (10862310)", () => {
    const printed =
      "Select an enemy follower on the field with 3 defense or less and banish it. / Enhance (5): Banish all enemy followers with 3 defense or less instead.";

    it("banishes selected ≤3-defense enemy; Last Words do not fire; bystander above 3 remains", () => {
      setupTurn(R6, { hand: [LINGERING_THREAT], pp: 2 });
      const fragile = enemyLastWordsFollower("Fragile");
      const tank = enemyFollower(4, 4, "Tank");
      whenPlayCard("first", 0);
      resolvePendingByUid(fragile.uid);
      expect(getBoard(state, "second").map((c) => c.name)).toEqual(["Tank"]);
      expect(
        getBanish(state, "second").some((c) => c.uid === fragile.uid),
      ).toBe(true);
      expect(getGraveyard(state, "second").length).toBe(0);
    });

    it("at 2 PP without Enhance(5): only one ≤3-defense enemy banished", () => {
      setupTurn(R6, { hand: [LINGERING_THREAT], pp: 2 });
      enemyFollower(2, 3, "A");
      enemyFollower(2, 3, "B");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(getBoard(state, "second").length).toBe(1);
    });

    it("Enhance (5): banishes all enemy followers with 3 defense or less", () => {
      setupTurn(R6, { hand: [LINGERING_THREAT], pp: 5 });
      enemyFollower(2, 3, "A");
      enemyFollower(2, 3, "B");
      const tank = enemyFollower(4, 4, "Tank");
      whenPlayCard("first", 0);
      expect(getBoard(state, "second").map((c) => c.uid)).toEqual([tank.uid]);
      expect(printed).toContain("Enhance (5)");
    });
  });

  describe("Protective Shell (10562210)", () => {
    const printed =
      "Engage: Destroy this card. Draw X cards. X is the number of allied followers on the field with Ward.";

    it("Engage with 0 allied Ward followers draws 0 cards", () => {
      setupTurn(R6, { hand: [PROTECTIVE_SHELL], deck: [DRAW_TOP], pp: 2 });
      allyFollower(2, 2, "NoWard");
      whenPlayCard("first", 0);
      const handBefore = handIds();
      engageAmulet("first", amuletIndex("Protective Shell"));
      expect(handIds()).toEqual(handBefore);
    });

    it("Engage with 2 allied Ward followers draws exactly 2 stacked cards", () => {
      setupTurn(R6, {
        hand: [PROTECTIVE_SHELL],
        deck: [DRAW_SECOND, DRAW_TOP],
        pp: 2,
      });
      wardAlly("WardOne");
      wardAlly("WardTwo");
      whenPlayCard("first", 0);
      const handBefore = handUids();
      engageAmulet("first", amuletIndex("Protective Shell"));
      const drawn = thenHand("first")
        .filter((c) => !handBefore.has(c.uid))
        .map((c) => String(c.id));
      expect(drawn).toEqual([DRAW_TOP, DRAW_SECOND]);
      expect(printed).toContain("Draw X cards");
    });
  });

  describe("Advent of the Eld Tome (10661310)", () => {
    const printed = "Draw 2 amulets.";

    it("draws exactly 2 amulets from deck (identity)", () => {
      setupTurn(R6, {
        hand: [ADVENT_ELD_TOME],
        pp: 3,
        deck: [FILLER, SERENE_SANCTUARY, AVIAN_STATUE],
      });
      state.players.first.deck = [
        createCard(FILLER, "deck", "first"),
        createCard(SERENE_SANCTUARY, "deck", "first"),
        createCard(AVIAN_STATUE, "deck", "first"),
      ];
      whenPlayCard("first", 0);
      expect(handIds().sort()).toEqual([SERENE_SANCTUARY, AVIAN_STATUE].sort());
      expect(deckIds()).toEqual([FILLER]);
      expect(printed).toBe("Draw 2 amulets.");
    });
  });

  describe("Agent of the Testaments (10962110)", () => {
    const printed =
      "Fanfare: Give this follower Ambush until the end of your opponent's turn. / At the end of your turn, restore 1 defense to your leader.";

    it("Fanfare grants Ambush", () => {
      setupTurn(R6, { hand: [AGENT_TESTAMENTS], pp: 3 });
      whenPlayCard("first", 0);
      const agent = findOnBoard("first", "Agent of the Testaments")!;
      expect(
        agent.hasAmbush ||
          agent.keywordState?.hasAmbush ||
          agent.keywords?.includes("Ambush"),
      ).toBe(true);
    });

    it("at end of your turn restores 1 leader defense", () => {
      setupTurn(R6, { hand: [AGENT_TESTAMENTS], pp: 3, hp: 18 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("first");
      expect(getHP(state, "first")).toBe(19);
    });

    it("at end of opponent's turn: leader defense unchanged", () => {
      setupTurn(R6, { hand: [AGENT_TESTAMENTS], pp: 3, hp: 18 });
      whenPlayCard("first", 0);
      runEndOfTurnBoundary("second");
      expect(getHP(state, "first")).toBe(18);
    });
  });

  describe("Galleon, Earth Personified (10464110)", () => {
    const printed =
      "Ward. / Can't attack followers or leaders. / At the end of your turn, if you've unlocked super-evolution, evolve a random unevolved allied follower on the field that didn't attack this turn.";

    it("has Ward and Can't attack", () => {
      setupTurn(R8, { hand: [GALLEON], pp: 3 });
      whenPlayCard("first", 0);
      const galleon = findOnBoard("first", "Galleon, Earth Personified")!;
      applyKeywordsFromList(galleon);
      expect(galleon.hasWard).toBe(true);
      expect(
        galleon.cantAttack ||
          galleon.keywordState?.cantAttack ||
          galleon.cantAttackFollowers,
      ).toBe(true);
    });

    it("owner's EOT with super unlocked: evolves unevolved ally that did not attack", () => {
      setupTurn(R8);
      const galleon = createCard(GALLEON, "board", "first");
      applyKeywordsFromList(galleon);
      galleon.peak_defense = galleon.defense;
      const raw = allyFollower(1, 4, "UnevolvedAlly");
      raw.hasEvolved = false;
      raw.isEvolved = false;
      raw.hasAttacked = false;
      raw.justPlayed = false;
      state.players.first.board = [galleon, raw];
      runEndOfTurnBoundary("first");
      expect(raw.hasEvolved).toBe(true);
    });

    it("owner's EOT: ally that attacked this turn stays unevolved", () => {
      setupTurn(R8);
      const galleon = createCard(GALLEON, "board", "first");
      const attacker = allyFollower(1, 4, "AttackerAlly");
      attacker.hasEvolved = false;
      attacker.hasAttacked = true;
      attacker.justPlayed = false;
      state.players.first.board = [galleon, attacker];
      runEndOfTurnBoundary("first");
      expect(attacker.hasEvolved).toBe(false);
    });

    it("opponent's EOT does not evolve allied followers", () => {
      setupTurn(R8);
      const galleon = createCard(GALLEON, "board", "first");
      const raw = allyFollower(1, 4, "SafeAlly");
      raw.hasEvolved = false;
      raw.hasAttacked = false;
      state.players.first.board = [galleon, raw];
      runEndOfTurnBoundary("second");
      expect(raw.hasEvolved).toBe(false);
      expect(printed).toContain("At the end of your turn");
    });
  });

  describe("Miraculous Al-mi'raj (10962120)", () => {
    const printed =
      "Storm / Crystallize (1): Countdown (3) / Last Words: Summon a Miraculous Al-mi'raj. / Engage (1): Advance this amulet's count by 1.";

    it("normal play: follower enters with Storm", () => {
      setupTurn(R6, { hand: [MIRACULOUS_ALMIRAJ], pp: 3 });
      whenPlayCard("first", 0);
      const raj = findOnBoard("first", "Miraculous Al-mi'raj")!;
      expect(raj.type).toBe("Follower");
      expect(raj.hasStorm).toBe(true);
    });

    it("Crystallize amulet: Countdown (3); Engage (1) advances count by 1", () => {
      setupTurn(R6, { hand: [MIRACULOUS_ALMIRAJ], pp: 2 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = findOnBoard("first", "Miraculous Al-mi'raj")!;
      expect(amulet.type).toBe("Amulet");
      expect(Number(amulet.countdown)).toBe(3);
      const idx = amuletIndex("Miraculous Al-mi'raj");
      engageAmulet("first", idx);
      expect(Number(amulet.countdown)).toBe(2);
      expect(getPP(state, "first")).toBe(0);
    });

    it("amulet Last Words at countdown 0 summons Miraculous Al-mi'raj follower", () => {
      setupTurn(R6, { hand: [MIRACULOUS_ALMIRAJ], pp: 1 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = findOnBoard("first", "Miraculous Al-mi'raj")!;
      amulet.countdown = 0;
      cleanupDead();
      const raj = findOnBoard("first", "Miraculous Al-mi'raj")!;
      expect(raj.type).toBe("Follower");
      expect(printed).toContain("Last Words");
    });
  });

  describe("Prescient Priestess (10561110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 2 damage. / Ward / Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare deals 2 damage to selected enemy; has Ward; bystander untouched", () => {
      setupTurn(R6, { hand: [PRESCIENT_PRIESTESS], pp: 3 });
      const target = enemyFollower(1, 4, "Target");
      const bystander = enemyFollower(1, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(Number(target.defense)).toBe(2);
      expect(Number(bystander.defense)).toBe(4);
      const priest = findOnBoard("first", "Prescient Priestess")!;
      applyKeywordsFromList(priest);
      expect(priest.hasWard).toBe(true);
    });

    it("Evolve replicates Fanfare on a second enemy", () => {
      setupTurn(R6, { hand: [PRESCIENT_PRIESTESS], pp: 3, evo: 2 });
      const first = enemyFollower(1, 4, "First");
      whenPlayCard("first", 0);
      resolvePendingByUid(first.uid);
      const priest = findOnBoard("first", "Prescient Priestess")!;
      const second = enemyFollower(1, 4, "Second");
      whenEvolve(priest, "first");
      resolvePendingByUid(second.uid);
      expect(Number(second.defense)).toBe(2);
    });
  });

  describe("Avian Statue (10061210)", () => {
    const printed =
      "Countdown (2) / Last Words: Summon a Regal Falcon. / Engage (2): Advance this amulet's count by 2.";

    it("enters with Countdown (2)", () => {
      setupTurn(R6, { hand: [AVIAN_STATUE], pp: 4 });
      whenPlayCard("first", 0);
      const statue = findOnBoard("first", "Avian Statue")!;
      expect(Number(statue.countdown)).toBe(2);
    });

    it("Engage (2) advances countdown by 2", () => {
      setupTurn(R6, { hand: [AVIAN_STATUE], pp: 6 });
      whenPlayCard("first", 0);
      const statue = findOnBoard("first", "Avian Statue")!;
      engageAmulet("first", amuletIndex("Avian Statue"));
      expect(Number(statue.countdown)).toBe(0);
    });

    it("Last Words summons Regal Falcon", () => {
      setupTurn(R6, { hand: [AVIAN_STATUE], pp: 4 });
      whenPlayCard("first", 0);
      const statue = findOnBoard("first", "Avian Statue")!;
      engageAmulet("first", amuletIndex("Avian Statue"));
      expireCountdownForLastWords(statue, "first");
      expect(boardCountById(REGAL_FALCON)).toBe(1);
      expect(printed).toContain("Regal Falcon");
    });
  });

  describe("Ironfist Priest (10062110)", () => {
    const printed =
      "Evolve: Select an enemy follower on the field with 3 defense or less and banish it. / Super-Evolve: Banish all enemy followers with 3 defense or less instead.";

    it("Evolve banishes selected ≤3-defense enemy; bystander above 3 remains", () => {
      setupTurn(R6, { evo: 2 });
      const priest = createCard(IRONFIST_PRIEST, "board", "first");
      priest.peak_defense = priest.defense;
      const legal = enemyLastWordsFollower("Legal");
      const tank = enemyFollower(4, 4, "Tank");
      state.players.first.board = [priest];
      whenEvolve(priest, "first");
      resolvePendingByUid(legal.uid);
      expect(getBanish(state, "second").some((c) => c.uid === legal.uid)).toBe(
        true,
      );
      expect(findOnBoard("second", "Tank")).toBeTruthy();
      expect(getGraveyard(state, "second").length).toBe(0);
    });

    it("Super-Evolve banishes all enemies with 3 defense or less", () => {
      setupTurn(R8, { superEvo: 1 });
      const priest = createCard(IRONFIST_PRIEST, "board", "first");
      priest.peak_defense = priest.defense;
      enemyFollower(2, 3, "A");
      enemyFollower(2, 3, "B");
      const tank = enemyFollower(4, 4, "Tank");
      state.players.first.board = [priest];
      whenSuperEvolve(priest, "first");
      expect(getBoard(state, "second").map((c) => c.uid)).toEqual([tank.uid]);
      expect(printed).toContain("Super-Evolve");
    });
  });

  describe("Sara, Graphos's Chosen (10462110)", () => {
    const printed =
      "Enhance(6): Give this follower +0/+10. / Ward. / Evolve: Select a damaged enemy follower on the field and destroy it.";

    it("at 6 PP Enhance gives +0/+10 and Ward", () => {
      setupTurn(R6, { hand: [SARA], pp: 6 });
      whenPlayCard("first", 0);
      const sara = findOnBoard("first", "Sara, Graphos's Chosen")!;
      expect(Number(sara.defense)).toBe(15);
      applyKeywordsFromList(sara);
      expect(sara.hasWard).toBe(true);
    });

    it("at 5 PP without Enhance: base defense unchanged", () => {
      setupTurn(R6, { hand: [SARA], pp: 5 });
      whenPlayCard("first", 0);
      const sara = findOnBoard("first", "Sara, Graphos's Chosen")!;
      expect(Number(sara.defense)).toBe(5);
    });

    it("Evolve destroys selected damaged enemy; healthy bystander remains", () => {
      setupTurn(R6, { hand: [SARA], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const sara = findOnBoard("first", "Sara, Graphos's Chosen")!;
      const damaged = enemyFollower(2, 1, "Damaged");
      damaged.peak_defense = 3;
      const healthy = enemyFollower(3, 3, "Healthy");
      whenEvolve(sara, "first");
      resolvePendingByUid(damaged.uid);
      cleanupDead();
      expect(findOnBoard("second", "Damaged")).toBeFalsy();
      expect(findOnBoard("second", "Healthy")).toBeTruthy();
    });
  });

  describe("Skyfaring Vessel (10462210)", () => {
    const printed =
      "Activates in hand. Whenever you Engage an amulet, reduce the cost of this card by 1. / Engage: Destroy this card. Select an unevolved allied follower on the field and evolve it.";

    it("in hand: allied Engage reduces this card's cost by 1", () => {
      setupTurn(R6, { hand: [SKYFARING_VESSEL, SERENE_SANCTUARY], pp: 5 });
      const vessel = getHand(state, "first").find(
        (c) => c.id === SKYFARING_VESSEL,
      )!;
      const costBefore = Number(vessel.cost);
      whenPlayCard("first", 1);
      engageAmulet("first", amuletIndex("Serene Sanctuary"));
      expect(Number(vessel.cost)).toBe(costBefore - 1);
    });

    it("Engage destroys vessel and evolves selected unevolved ally", () => {
      setupTurn(R6, { hand: [SKYFARING_VESSEL], pp: 4 });
      const raw = allyFollower(2, 2, "RawAlly");
      whenPlayCard("first", 0);
      engageAmulet("first", amuletIndex("Skyfaring Vessel"));
      resolveFirstPending();
      expect(raw.hasEvolved).toBe(true);
      expect(findOnBoard("first", "Skyfaring Vessel")).toBeFalsy();
      expect(printed).toContain("evolve it");
    });
  });

  describe("Sophia, Zeyen Priestess (10462120)", () => {
    const printed =
      "Fanfare: Summon a random Havencraft follower that costs 2 or less from your deck. / Super-Evolve: Give all other allied followers on the field Barrier.";

    it("Fanfare summons a Havencraft ≤2-cost follower from deck (seed 1 → Follower of the Tenets)", () => {
      setupTurn(R6, {
        hand: [SOPHIA],
        pp: 4,
        seed: 1,
        deck: [FILLER, SARIISA, TENETS],
      });
      whenPlayCard("first", 0);
      const sophia = findOnBoard("first", "Sophia, Zeyen Priestess")!;
      const summoned = thenBoard("first").find((c) => c.uid !== sophia.uid)!;
      expect(summoned.class).toBe("Havencraft");
      expect(Number(summoned.cost)).toBeLessThanOrEqual(2);
      expect(summoned.id).toBe(TENETS);
    });

    it("Super-Evolve gives Barrier to other allies, not Sophia", () => {
      setupTurn(R8, { superEvo: 1 });
      const sophia = createCard(SOPHIA, "board", "first");
      const ally = allyFollower(1, 1, "BarrierAlly");
      state.players.first.board = [sophia, ally];
      whenSuperEvolve(sophia, "first");
      expect(ally.hasBarrier || ally.keywordState?.hasBarrier).toBe(true);
      expect(sophia.hasBarrier || sophia.keywordState?.hasBarrier).toBeFalsy();
    });
  });

  describe("Venerating Dyer (10662110)", () => {
    const printed =
      "Rush / Bane / Crystallize (1): Countdown (3) / Last Words: Summon a Venerating Dyer.";

    it("normal play: follower has Rush and Bane", () => {
      setupTurn(R6, { hand: [VENERATING_DYER], pp: 4 });
      whenPlayCard("first", 0);
      const dyer = findOnBoard("first", "Venerating Dyer")!;
      expect(dyer.type).toBe("Follower");
      expect(dyer.hasRush).toBe(true);
      expect(dyer.hasBane).toBe(true);
    });

    it("Crystallize amulet: Countdown (3); Last Words summons Venerating Dyer", () => {
      setupTurn(R6, { hand: [VENERATING_DYER], pp: 1 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = findOnBoard("first", "Venerating Dyer")!;
      expect(amulet.type).toBe("Amulet");
      expect(Number(amulet.countdown)).toBe(3);
      amulet.countdown = 0;
      cleanupDead();
      const dyer = thenBoard("first").filter((c) => c.id === VENERATING_DYER);
      expect(dyer.length).toBe(1);
      expect(dyer[0]!.type).toBe("Follower");
    });
  });

  describe("Winged Warrior (10061130)", () => {
    const printed =
      "Fanfare: Select another allied follower on the field and give it +1/+1. / Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare buffs another ally +1/+1; self unchanged", () => {
      setupTurn(R6, { hand: [WINGED_WARRIOR], pp: 4 });
      const bystander = allyFollower(2, 2, "BuffTarget");
      whenPlayCard("first", 0);
      const winged = findOnBoard("first", "Winged Warrior")!;
      resolvePendingByUid(bystander.uid);
      expect(Number(bystander.attack)).toBe(3);
      expect(Number(bystander.defense)).toBe(3);
      expect(Number(winged.attack)).toBe(4);
      expect(Number(winged.defense)).toBe(4);
    });

    it("Evolve replicates Fanfare on a second ally", () => {
      setupTurn(R6, { hand: [WINGED_WARRIOR], pp: 4, evo: 2 });
      const first = allyFollower(2, 2, "FirstAlly");
      whenPlayCard("first", 0);
      resolvePendingByUid(first.uid);
      const winged = findOnBoard("first", "Winged Warrior")!;
      const second = allyFollower(2, 2, "SecondAlly");
      whenEvolve(winged, "first");
      resolvePendingByUid(second.uid);
      expect(Number(second.attack)).toBe(3);
      expect(Number(second.defense)).toBe(3);
    });
  });

  describe("Grant, Hunter of Undeath (10861130)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. / Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare destroys selected enemy; bystander remains", () => {
      setupTurn(R8, { hand: [GRANT], pp: 5 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      cleanupDead();
      expect(findOnBoard("second", "Target")).toBeFalsy();
      expect(findOnBoard("second", "Bystander")).toBeTruthy();
    });

    it("Evolve replicates Fanfare destroying a second enemy", () => {
      setupTurn(R8, { hand: [GRANT], pp: 5, evo: 2 });
      const first = enemyFollower(2, 4, "First");
      whenPlayCard("first", 0);
      resolvePendingByUid(first.uid);
      cleanupDead();
      const grant = findOnBoard("first", "Grant, Hunter of Undeath")!;
      const second = enemyFollower(2, 4, "Second");
      whenEvolve(grant, "first");
      resolvePendingByUid(second.uid);
      cleanupDead();
      expect(findOnBoard("second", "Second")).toBeFalsy();
    });
  });

  describe("Saint of Rehabilitation (10563110)", () => {
    const printed =
      "Fanfare: Restore 1 defense to your leader. / Ward / During your turn, whenever your leader's defense is restored, summon a Fox of Purity. / Evolve: Replicate the effects of this card's Fanfare ability. / Super-Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare restores 1 defense and has Ward", () => {
      setupTurn(R6, { hand: [SAINT_REHAB], pp: 5, hp: 14 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(15);
      const saint = findOnBoard("first", "Saint of Rehabilitation")!;
      applyKeywordsFromList(saint);
      expect(saint.hasWard).toBe(true);
    });

    it("during your turn leader restore summons Fox of Purity", () => {
      setupTurn(R6, { hand: [SAINT_REHAB], pp: 5, hp: 14 });
      whenPlayCard("first", 0);
      const foxesAfterFanfare = boardCountById(FOX_PURITY);
      state.players.first.hp = 14;
      restoreLeaderHP("first", 1);
      expect(boardCountById(FOX_PURITY)).toBe(foxesAfterFanfare + 1);
    });

    it("during opponent's turn leader restore does not summon Fox — printed: 'During your turn' (10563110)", () => {
      setupTurn(R6, { hand: [SAINT_REHAB], pp: 5, hp: 14 });
      whenPlayCard("first", 0);
      const foxesAfterFanfare = boardCountById(FOX_PURITY);
      whenEndTurn();
      expect(state.activePlayer).toBe("second");
      state.players.first.hp = 14;
      restoreLeaderHP("first", 1);
      expect(boardCountById(FOX_PURITY)).toBe(foxesAfterFanfare);
    });

    it("Evolve replicates Fanfare (+1 more heal)", () => {
      setupTurn(R6, { hand: [SAINT_REHAB], pp: 5, hp: 14, evo: 2 });
      whenPlayCard("first", 0);
      const saint = findOnBoard("first", "Saint of Rehabilitation")!;
      const hpAfterFanfare = getHP(state, "first");
      whenEvolve(saint, "first");
      expect(getHP(state, "first")).toBe(hpAfterFanfare + 1);
    });

    // Rulebook (docs/svwb_rulebook_formatted.md — Evolve ability): when a follower has
    // both Evolve and Super-Evolve lines, a super-evolve fires both simultaneously unless
    // the Super-Evolve line says "instead" (owner-confirmed with Arriet).
    it("Super-Evolve replicates Fanfare twice (+2 heal): Evolve line and Super-Evolve line both fire", () => {
      setupTurn(R8, { hand: [SAINT_REHAB], pp: 5, hp: 13, superEvo: 1 });
      whenPlayCard("first", 0);
      const saint = findOnBoard("first", "Saint of Rehabilitation")!;
      expect(getHP(state, "first")).toBe(14);
      whenSuperEvolve(saint, "first");
      expect(getHP(state, "first")).toBe(16);
    });
  });

  describe("Missionary of Recruitment (10761120)", () => {
    const printed =
      "Fanfare: Draw 2 amulets. / Evolve: Deal X damage to all enemy followers. X is the number of amulets in your hand.";

    it("Fanfare draws exactly 2 amulets from deck", () => {
      setupTurn(R8, {
        hand: [MISSIONARY],
        pp: 6,
        deck: [FILLER, SERENE_SANCTUARY, AVIAN_STATUE],
      });
      state.players.first.deck = [
        createCard(FILLER, "deck", "first"),
        createCard(SERENE_SANCTUARY, "deck", "first"),
        createCard(AVIAN_STATUE, "deck", "first"),
      ];
      whenPlayCard("first", 0);
      expect(handIds().sort()).toEqual([SERENE_SANCTUARY, AVIAN_STATUE].sort());
    });

    it("Evolve deals X damage to all enemies where X = amulets in hand", () => {
      setupTurn(R8, {
        hand: [MISSIONARY, SERENE_SANCTUARY, AVIAN_STATUE],
        pp: 6,
        evo: 2,
      });
      enemyFollower(2, 5, "A");
      enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      const missionary = findOnBoard("first", "Missionary of Recruitment")!;
      whenEvolve(missionary, "first");
      expect(
        getBoard(state, "second").every((c) => Number(c.defense) === 3),
      ).toBe(true);
      expect(printed).toContain("amulets in your hand");
    });
  });

  describe("Pegasus Rider (10662120)", () => {
    const printed =
      "Fanfare: Summon a Holy Falcon. / Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare summons exactly 1 Holy Falcon", () => {
      setupTurn(R8, { hand: [PEGASUS_RIDER], pp: 6 });
      whenPlayCard("first", 0);
      expect(boardCountById(HOLY_FALCON)).toBe(1);
    });

    it("Evolve replicates Fanfare summoning a second Holy Falcon", () => {
      setupTurn(R8, { hand: [PEGASUS_RIDER], pp: 6, evo: 2 });
      whenPlayCard("first", 0);
      const rider = findOnBoard("first", "Pegasus Rider")!;
      whenEvolve(rider, "first");
      expect(boardCountById(HOLY_FALCON)).toBe(2);
    });
  });

  describe("Peryton (10961120)", () => {
    const printed = "Fanfare: Summon 2 copies of Peryton. / Rush";

    it("Fanfare summons exactly 2 copies (3 Peryton total) and has Rush", () => {
      setupTurn(R8, { hand: [PERYTON], pp: 6 });
      whenPlayCard("first", 0);
      expect(boardCountById(PERYTON)).toBe(3);
      const main = findOnBoard("first", "Peryton")!;
      expect(main.hasRush).toBe(true);
    });
  });

  describe("Soulcure Sister (10061110)", () => {
    const printed = "Fanfare: Restore 5 defense to your leader. / Ward";

    it("Fanfare restores exactly 5 defense; has Ward", () => {
      setupTurn(R8, { hand: [SOULCURE_SISTER], pp: 6, hp: 10 });
      whenPlayCard("first", 0);
      expect(getHP(state, "first")).toBe(15);
      const sister = findOnBoard("first", "Soulcure Sister")!;
      applyKeywordsFromList(sister);
      expect(sister.hasWard).toBe(true);
      expect(printed).toContain("Restore 5");
    });
  });

  describe("Worshipful Crusader (10663110)", () => {
    const printed =
      "Fanfare: Summon a Worshipful Crusader. / Bane / Aura / Evolve: Select an enemy follower on the field and destroy it. / Crystallize (1): Countdown (3) / Last Words: Summon a Worshipful Crusader.";

    it("Fanfare summons exactly 1 copy (2 total); has Bane and Aura", () => {
      setupTurn(R8, { hand: [WORSHIPFUL_CRUSADER], pp: 6 });
      whenPlayCard("first", 0);
      expect(boardCountById(WORSHIPFUL_CRUSADER)).toBe(2);
      const crusader = findOnBoard("first", "Worshipful Crusader")!;
      expect(crusader.hasBane).toBe(true);
      expect(crusader.hasAura).toBe(true);
    });

    it("Evolve destroys selected enemy; bystander remains", () => {
      setupTurn(R8, { hand: [WORSHIPFUL_CRUSADER], pp: 6, evo: 2 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      const crusader = findOnBoard("first", "Worshipful Crusader")!;
      whenEvolve(crusader, "first");
      resolvePendingByUid(target.uid);
      cleanupDead();
      expect(findOnBoard("second", "Target")).toBeFalsy();
      expect(findOnBoard("second", "Bystander")).toBeTruthy();
    });

    it("Crystallize amulet Last Words summons Worshipful Crusader", () => {
      setupTurn(R8, { hand: [WORSHIPFUL_CRUSADER], pp: 1 });
      playCardNoRender(getHand(state, "first"), "first", 0);
      const amulet = findOnBoard("first", "Worshipful Crusader")!;
      expect(amulet.type).toBe("Amulet");
      expect(Number(amulet.countdown)).toBe(3);
      amulet.countdown = 0;
      cleanupDead();
      expect(boardCountById(WORSHIPFUL_CRUSADER)).toBe(1);
    });
  });

  describe("Theresa, Ergon Priestess (10861120)", () => {
    const printed =
      "Fanfare: Summon a Soulcure Sister and give it +2/-2 and Storm.";

    it("Fanfare summons Soulcure Sister with +2/-2 and Storm", () => {
      setupTurn(R8, { hand: [THERESA], pp: 7 });
      whenPlayCard("first", 0);
      const sister = thenBoard("first").find((c) => c.id === SOULCURE_SISTER);
      expect(sister).toBeTruthy();
      expect(sister!.hasStorm || sister!.keywordState?.hasStorm).toBe(true);
      expect(Number(sister!.attack)).toBe(5);
      expect(Number(sister!.defense)).toBe(3);
    });
  });

  describe("Edeth, Voice of Heaven (10862110)", () => {
    const printed =
      "Ward / Aura / Last Words: Summon an Edeth, Voice of Heaven and remove Last Words from it. / Super-Evolve: Select an enemy follower on the field and destroy it.";

    it("has Ward and Aura", () => {
      setupTurn(R8, { hand: [EDETH], pp: 8 });
      whenPlayCard("first", 0);
      const edeth = findOnBoard("first", "Edeth, Voice of Heaven")!;
      applyKeywordsFromList(edeth);
      expect(edeth.hasWard).toBe(true);
      expect(edeth.hasAura).toBe(true);
    });

    it("Last Words summons Edeth without Last Words", () => {
      setupTurn(R8);
      const edeth = createCard(EDETH, "board", "first");
      edeth.peak_defense = edeth.defense;
      state.players.first.board = [edeth];
      edeth.defense = 0;
      cleanupDead();
      const spawned = thenBoard("first").filter((c) => c.id === EDETH);
      expect(spawned.length).toBe(1);
      expect(spawned[0]!.hasLastWords).toBeFalsy();
    });

    it("Super-Evolve destroys selected enemy follower", () => {
      setupTurn(R8, { hand: [EDETH], pp: 8, superEvo: 1 });
      const target = enemyFollower(2, 4, "Target");
      whenPlayCard("first", 0);
      const edeth = findOnBoard("first", "Edeth, Voice of Heaven")!;
      whenSuperEvolve(edeth, "first");
      resolvePendingByUid(target.uid);
      cleanupDead();
      expect(findOnBoard("second", "Target")).toBeFalsy();
    });
  });

  describe("Immovable Paladin (10562110)", () => {
    const printed = "Fanfare: Summon 3 copies of Immovable Paladin. / Ward";

    it("Fanfare summons exactly 3 copies (4 total) and has Ward", () => {
      setupTurn(R8, { hand: [IMMOVABLE_PALADIN], pp: 8 });
      whenPlayCard("first", 0);
      expect(boardCountById(IMMOVABLE_PALADIN)).toBe(4);
      const paladin = findOnBoard("first", "Immovable Paladin")!;
      applyKeywordsFromList(paladin);
      expect(paladin.hasWard).toBe(true);
    });
  });

  describe("Rodeo, Anathema of Adjudication (10764110)", () => {
    const printed =
      "Fanfare: Summon a Rings of Moonlight. / Evolve: Delay the count of a random allied Rings of Moonlight on the field by 1.";

    it("Fanfare summons exactly 1 Rings of Moonlight", () => {
      setupTurn(R8, { hand: [RODEO], pp: 8 });
      whenPlayCard("first", 0);
      expect(boardCountById(RINGS_MOONLIGHT)).toBe(1);
    });

    it("Evolve delays exactly one allied Rings of Moonlight countdown by 1", () => {
      setupTurn(R8, { hand: [RODEO], pp: 8, evo: 2, seed: 1 });
      const ringA = createCard(RINGS_MOONLIGHT, "board", "first");
      ringA.countdown = 1;
      const ringB = createCard(RINGS_MOONLIGHT, "board", "first");
      ringB.countdown = 1;
      state.players.first.board.push(ringA, ringB);
      whenPlayCard("first", 0);
      const rodeo = findOnBoard("first", "Rodeo, Anathema of Adjudication")!;
      whenEvolve(rodeo, "first");
      const rings = thenBoard("first").filter((c) => c.id === RINGS_MOONLIGHT);
      const delayed = rings.filter((c) => Number(c.countdown) === 2);
      const untouched = rings.filter((c) => Number(c.countdown) === 1);
      expect(delayed.length).toBe(1);
      expect(untouched.length).toBe(2);
    });
  });

  describe("Sacred Griffon (10062120)", () => {
    const printed =
      "Ward / Whenever you Engage an amulet, give this follower Storm.";

    it("has Ward", () => {
      setupTurn(R8, { hand: [SACRED_GRIFFON], pp: 8 });
      whenPlayCard("first", 0);
      const griffon = findOnBoard("first", "Sacred Griffon")!;
      applyKeywordsFromList(griffon);
      expect(griffon.hasWard).toBe(true);
    });

    it("Engaging an allied amulet grants Storm once", () => {
      setupTurn(R8);
      const griffon = createCard(SACRED_GRIFFON, "board", "first");
      applyKeywordsFromList(griffon);
      griffon.peak_defense = griffon.defense;
      const lens = createCard(SERENE_SANCTUARY, "board", "first");
      applyKeywordsFromList(lens);
      state.players.first.board = [griffon, lens];
      engageAmulet("first", 1);
      expect(griffon.hasStorm).toBe(true);
    });

    it("without Engage: Sacred Griffon does not gain Storm", () => {
      setupTurn(R8, { hand: [SACRED_GRIFFON], pp: 8 });
      whenPlayCard("first", 0);
      const griffon = findOnBoard("first", "Sacred Griffon")!;
      expect(griffon.hasStorm).toBeFalsy();
    });
  });

  describe("Vira, Luminous Primal Knight (10464120)", () => {
    const printed =
      "Fanfare: Select 2 enemy followers on the field and banish them. / Super Skybound Art- Super-evolve this follower. / Ward / Can't take more than 3 damage at a time.";

    it("Fanfare banishes 2 selected enemies", () => {
      setupTurn(R8, { hand: [VIRA], pp: 8 });
      const e1 = enemyFollower(2, 4, "E1");
      const e2 = enemyFollower(2, 4, "E2");
      whenPlayCard("first", 0);
      resolvePendingByUid(e1.uid);
      resolvePendingByUid(e2.uid);
      expect(getBoard(state, "second").length).toBe(0);
      expect(getBanish(state, "second").length).toBe(2);
    });

    it("Super Skybound Art super-evolves and grants Ward", () => {
      setupTurn(R15, { hand: [VIRA], pp: 8 });
      const viraHand = getHand(state, "first")[0]!;
      for (let i = 0; i < 5; i++) incrementSkyboundArt("first");
      viraHand.skyboundArtEvolvesWitnessed = 5;
      whenPlayCard("first", 0);
      const vira = findOnBoard("first", "Vira, Luminous Primal Knight")!;
      expect(vira.evoType).toBe("super");
      expect(vira.hasWard).toBe(true);
    });

    it("can't take more than 3 damage at a time", () => {
      setupTurn(R8, { hand: [VIRA], pp: 8 });
      whenPlayCard("first", 0);
      const vira = findOnBoard("first", "Vira, Luminous Primal Knight")!;
      expect(vira.keywordState?.maxDamageCap ?? 0).toBe(3);
      dealDamage(vira, 5);
      expect(Number(vira.defense)).toBe(5);
      dealDamage(vira, 4);
      expect(Number(vira.defense)).toBe(2);
    });
  });
});
