/**
 * L2 real-card tests — Artifact Portalcraft deck (16 distinct cards).
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

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import {
  summonFollowerByCardId,
  playFollowerFromHandById,
  PLAY_FILLER_FOLLOWER,
} from "../harness/l2Dispatch.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import {
  getBoard,
  getHand,
  getHP,
  getGraveyard,
  getCrests,
  getEvoCharges,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck cards
const FREERUNNING = "10771310";
const SINCERITY = "10573310";
const COOL_COURIER = "10772110";
const EUDIE = "10874120";
const IMARI = "10574120";
const ISAAC = "10471130";
const YOG_ZENTHA = "10674120";
const BRAZEN_BROADCASTER = "10773110";
const MYUU = "10774120";
const ASHER_LYDIA = "10874110";
const SANDALPHON = "10404110";
const SHODDY_PLAYTHING = "10671110";
const AIZEDEN = "10974120";
const CAMISCILLA = "10674110";
const LUDICROUS_ORDNANCE = "10673110";
const SCARLET = "10774110";

// Tokens
const ANALYZING_ARTIFACT = "90071130";
const ANCIENT_ARTIFACT = "90071140";
const MYSTIC_ARTIFACT = "90071150";
const STRIKER_ARTIFACT = "90072110";
const IMARI_BUDDIES = "90074140";
const WARDEN_TRIGGER = "90074150";
const DEPTHS_ELD_AXE = "90074320";
const SUBSTANDARD_PUPPET = "10672110";

// Helpers
const FILLER = "10111310";
const SPELL_1A = "10571310"; // Light of the Dewdrop
const SPELL_1B = "10572310"; // Resurrection Tuner
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const DRAW_THIRD = "10021130";
const SPELL_2 = "10172310"; // Stream of Life — fanfare draw filler (2-cost spell)

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
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    firstBoard?: string[];
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
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.firstBoard?.length) b = b.withFirstBoard(opts.firstBoard);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
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

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
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

function allyBigFollower(baseCost: number, name = "BigAlly") {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: baseCost,
      base_cost: baseCost,
      attack: baseCost,
      defense: baseCost,
    },
    "board",
    "first",
  );
  c.peak_defense = baseCost;
  state.players.first.board.push(c);
  return c;
}

function pushUniqueArtifactEnters(
  entries: Array<{ id: string; name: string }>,
): void {
  for (const e of entries) {
    state.players.first.followerEnterHistory.push({
      name: e.name,
      tribes: ["Artifact"],
      cardId: e.id,
    });
  }
}

function sandalphonDeck(): string[] {
  return [SANDALPHON, ...Array.from({ length: 25 }, () => FILLER)];
}

function summonArtifactOnBoard(
  id: string,
  owner: "first" | "second" = "first",
) {
  return summonFollowerByCardId(id, owner);
}

describe("L2 Artifact Portalcraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Freerunning (10771310)", () => {
    const printed =
      "Select a Mode to activate. If at least 3 differently named allied Artifact followers have entered the field this match, activate all of them instead.\n1. Add an Analyzing Artifact to your hand.\n2. Add an Ancient Artifact to your hand.";

    it("mode 1 (<3 unique Artifact enters): adds Analyzing Artifact only", () => {
      setupTurn(R6, { hand: [FREERUNNING], pp: 1 });
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANALYZING_ARTIFACT);
      expect(handIds()).not.toContain(ANCIENT_ARTIFACT);
      expect(handIds()).not.toContain(FREERUNNING);
    });

    it("mode 2 (<3 unique Artifact enters): adds Ancient Artifact only", () => {
      setupTurn(R6, { hand: [FREERUNNING], pp: 1 });
      setScriptedModePickProvider(() => [1]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANCIENT_ARTIFACT);
      expect(handIds()).not.toContain(ANALYZING_ARTIFACT);
    });

    it("with 3+ unique Artifact enters: activates both modes regardless of pick", () => {
      setupTurn(R6, { hand: [FREERUNNING], pp: 1 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
        { id: MYSTIC_ARTIFACT, name: "Mystic Artifact" },
      ]);
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANALYZING_ARTIFACT);
      expect(handIds()).toContain(ANCIENT_ARTIFACT);
      expect(printed).toContain("activate all of them instead");
    });

    it("with only 2 unique Artifact enters: mode 1 does not also add Ancient Artifact", () => {
      setupTurn(R6, { hand: [FREERUNNING], pp: 1 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
      ]);
      setScriptedModePickProvider(() => [0]);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANALYZING_ARTIFACT);
      expect(handIds()).not.toContain(ANCIENT_ARTIFACT);
    });
  });

  describe("Sincerity of the Dewdrop (10573310)", () => {
    const printed =
      "Select a card on the field and transform it into an Imari's Little Buddies.";

    it("transforms selected enemy into Imari's Little Buddies (90074140); bystander untouched", () => {
      setupTurn(R6, { hand: [SINCERITY], pp: 1 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const transformed = findOnBoard("second", "Imari's Little Buddies");
      expect(transformed?.id).toBe(IMARI_BUDDIES);
      expect(findOnBoard("second", "Bystander")).toBeTruthy();
      expect(Number(bystander.defense)).toBe(4);
      expect(printed).toContain("Imari's Little Buddies");
    });
  });

  describe("Cool Courier (10772110)", () => {
    const printed =
      "Fanfare: Add an Ancient Artifact to your hand.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare adds Ancient Artifact (90071140) to hand", () => {
      setupTurn(R6, { hand: [COOL_COURIER], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANCIENT_ARTIFACT);
      expect(handIds()).not.toContain(COOL_COURIER);
    });

    it("Evolve replicates Fanfare: second Ancient Artifact in hand", () => {
      setupTurn(R6, { hand: [COOL_COURIER], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const courier = findOnBoard("first", "Cool Courier")!;
      whenEvolve(courier, "first");
      expect(
        thenHand("first").filter((c) => c.id === ANCIENT_ARTIFACT),
      ).toHaveLength(2);
    });
  });

  describe("Eudie, Your Dependable Mentor (10874120)", () => {
    const printed =
      "Fanfare: Add an Analyzing Artifact to your hand.\nEvolve: Select another unevolved allied follower on the field and evolve it.";

    it("Fanfare adds Analyzing Artifact (90071130) to hand", () => {
      setupTurn(R6, { hand: [EUDIE], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(ANALYZING_ARTIFACT);
    });

    it("Evolve: Eudie and selected unevolved ally both evolve; costs 1 EP; already-evolved ally not in pool", () => {
      setupTurn(R6, { hand: [EUDIE], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const eudie = findOnBoard("first", "Eudie, Your Dependable Mentor")!;
      const buddy = allyFollower(1, 1, "Buddy");
      const bystander = allyFollower(1, 1, "Bystander");
      bystander.hasEvolved = true;
      const evoBefore = getEvoCharges(state, "first");
      whenEvolve(eudie, "first");
      resolvePendingByUid(buddy.uid);
      expect(eudie.hasEvolved).toBe(true);
      expect(buddy.hasEvolved).toBe(true);
      expect(bystander.hasEvolved).toBe(true);
      expect(getEvoCharges(state, "first")).toBe(evoBefore - 1);
      expect(printed).toContain("another unevolved allied follower");
    });

    it("Evolve with no other unevolved ally: Eudie evolves; no selection opened", () => {
      setupTurn(R6, { hand: [EUDIE], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const eudie = findOnBoard("first", "Eudie, Your Dependable Mentor")!;
      whenEvolve(eudie, "first");
      expect(eudie.hasEvolved).toBe(true);
      expect(state.pendingTargetEffect).toBeFalsy();
    });
  });

  describe("Imari, Dewdrop (10574120)", () => {
    const printed =
      "Fanfare: Select a card in your hand and discard it. Draw a spell.\nWhenever you play a spell, if this follower is evolved, summon an Imari's Little Buddies.\nSuper-Evolve: Draw 2 differently named 1-cost spells.";

    it("Fanfare discards selected card and draws stacked spell from deck", () => {
      setupTurn(R6, {
        hand: [IMARI, FILLER],
        deck: [DRAW_TOP, SPELL_1A],
        pp: 2,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === FILLER)!.uid,
      );
      expect(handIds()).toContain(SPELL_1A);
      expect(handIds()).not.toContain(FILLER);
      expect(handIds()).not.toContain(IMARI);
    });

    it("when evolved, playing a spell summons Imari's Little Buddies (90074140)", () => {
      setupTurn(R6, {
        hand: [IMARI, FILLER, SPELL_1A],
        deck: [DRAW_TOP],
        pp: 3,
        evo: 2,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === FILLER)!.uid,
      );
      const imari = findOnBoard("first", "Imari, Dewdrop")!;
      whenEvolve(imari, "first");
      const spellIdx = getHand(state, "first").findIndex(
        (c) => c.id === SPELL_1A,
      );
      whenPlayCard("first", spellIdx);
      expect(boardIds().filter((id) => id === IMARI_BUDDIES)).toHaveLength(1);
    });

    it("when not evolved, playing a spell does not summon Imari's Little Buddies", () => {
      setupTurn(R6, {
        hand: [IMARI, FILLER, SPELL_1A],
        deck: [DRAW_TOP],
        pp: 3,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === FILLER)!.uid,
      );
      const spellIdx = getHand(state, "first").findIndex(
        (c) => c.id === SPELL_1A,
      );
      whenPlayCard("first", spellIdx);
      expect(boardIds().filter((id) => id === IMARI_BUDDIES)).toHaveLength(0);
    });

    it("Super-Evolve draws 2 differently named 1-cost spells from deck", () => {
      setupTurn(R8, {
        hand: [IMARI, FILLER],
        deck: [DRAW_TOP, SPELL_2, SPELL_1B, SPELL_1A],
        pp: 2,
        superEvo: 1,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === FILLER)!.uid,
      );
      expect(handIds()).toContain(SPELL_2);
      const imari = findOnBoard("first", "Imari, Dewdrop")!;
      whenSuperEvolve(imari, "first");
      expect(handIds()).toContain(SPELL_1A);
      expect(handIds()).toContain(SPELL_1B);
      expect(
        thenHand("first").filter((c) => c.cost === 1 && c.type === "Spell"),
      ).toHaveLength(2);
    });
  });

  describe("Isaac, Congenial Engineer (10471130)", () => {
    const printed = "Last Words: Add a Striker Artifact to your hand.";

    it("Last Words adds Striker Artifact (90072110) to hand", () => {
      setupTurn(R6, { hand: [ISAAC], pp: 2 });
      whenPlayCard("first", 0);
      const isaac = findOnBoard("first", "Isaac, Congenial Engineer")!;
      isaac.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(STRIKER_ARTIFACT);
      expect(printed).toContain("Striker Artifact");
    });
  });

  describe("Yog-Zentha, Eld Axe (10674120)", () => {
    const printed =
      "Fanfare: If there's an allied follower on the field with a base cost of 5 or more, add a Depths of the Eld Axe to your hand.\nRush";

    it("with ally base cost ≥5: adds Depths of the Eld Axe (90074320)", () => {
      setupTurn(R6, { hand: [YOG_ZENTHA], pp: 2 });
      allyBigFollower(5);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DEPTHS_ELD_AXE);
    });

    it("without ally base cost ≥5: does not add Depths of the Eld Axe", () => {
      setupTurn(R6, { hand: [YOG_ZENTHA], pp: 2 });
      allyFollower(2, 2, "Small");
      whenPlayCard("first", 0);
      expect(handIds()).not.toContain(DEPTHS_ELD_AXE);
    });

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [YOG_ZENTHA], pp: 2 });
      whenPlayCard("first", 0);
      const yog = findOnBoard("first", "Yog-Zentha, Eld Axe")!;
      applyKeywordsFromList(yog);
      expect(yog.hasRush).toBe(true);
    });
  });

  describe("Brazen Broadcaster (10773110)", () => {
    const printed =
      "Fanfare: Summon an Analyzing Artifact.\nEnhance (5): Summon a Mystic Artifact.\nWhenever an allied Artifact follower enters the field, give it Rush.";

    it("at 3 PP: Fanfare summons Analyzing Artifact only", () => {
      setupTurn(R6, { hand: [BRAZEN_BROADCASTER], pp: 3 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === ANALYZING_ARTIFACT)).toHaveLength(
        1,
      );
      expect(boardIds().filter((id) => id === MYSTIC_ARTIFACT)).toHaveLength(0);
    });

    it("Enhance (5): Fanfare and Enhance both fire — Analyzing and Mystic on board", () => {
      setupTurn(R6, { hand: [BRAZEN_BROADCASTER], pp: 5 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === ANALYZING_ARTIFACT)).toHaveLength(
        1,
      );
      expect(boardIds().filter((id) => id === MYSTIC_ARTIFACT)).toHaveLength(1);
    });

    it("Artifact ally enter grants Rush to entering follower", () => {
      setupTurn(R6, { hand: [BRAZEN_BROADCASTER], pp: 3 });
      whenPlayCard("first", 0);
      const ancient = summonArtifactOnBoard(ANCIENT_ARTIFACT);
      applyKeywordsFromList(ancient);
      expect(ancient.hasRush).toBe(true);
    });

    it("non-Artifact ally enter does not grant Rush", () => {
      setupTurn(R6, { hand: [BRAZEN_BROADCASTER], pp: 3 });
      whenPlayCard("first", 0);
      const plain = summonFollowerByCardId(PLAY_FILLER_FOLLOWER, "first");
      applyKeywordsFromList(plain);
      expect(plain.hasRush).toBeFalsy();
    });
  });

  describe("Myuu, Hot on His Heels (10774120)", () => {
    const printed =
      "Whenever an allied Artifact follower enters the field, deal 3 damage to a random enemy follower.\nEvolve: Summon an Ancient Artifact.\nSuper-Evolve: Then, if at least 3 differently named allied Artifact followers have entered the field this match, give this follower Storm.";

    it("Artifact enter deals 3 to a random enemy follower", () => {
      setupTurn(R6, { hand: [MYUU], pp: 4 });
      const victim = enemyFollower(2, 5, "Victim");
      whenPlayCard("first", 0);
      summonArtifactOnBoard(ANALYZING_ARTIFACT);
      expect(5 - Number(victim.defense)).toBe(3);
    });

    it("non-Artifact enter does not deal damage", () => {
      setupTurn(R6, { hand: [MYUU], pp: 4 });
      const victim = enemyFollower(2, 5, "Safe");
      whenPlayCard("first", 0);
      summonFollowerByCardId(PLAY_FILLER_FOLLOWER, "first");
      expect(Number(victim.defense)).toBe(5);
    });

    it("Evolve summons Ancient Artifact (90071140)", () => {
      setupTurn(R6, { hand: [MYUU], pp: 4, evo: 2 });
      whenPlayCard("first", 0);
      const myuu = findOnBoard("first", "Myuu, Hot on His Heels")!;
      whenEvolve(myuu, "first");
      expect(boardIds().filter((id) => id === ANCIENT_ARTIFACT)).toHaveLength(
        1,
      );
    });

    it("Super-Evolve with 3+ unique Artifact enters grants Storm", () => {
      setupTurn(R8, { hand: [MYUU], pp: 4, superEvo: 1 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
        { id: MYSTIC_ARTIFACT, name: "Mystic Artifact" },
      ]);
      whenPlayCard("first", 0);
      const myuu = findOnBoard("first", "Myuu, Hot on His Heels")!;
      whenSuperEvolve(myuu, "first");
      applyKeywordsFromList(myuu);
      expect(myuu.hasStorm).toBe(true);
    });

    it("Super-Evolve with fewer than 3 unique Artifact enters does not grant Storm", () => {
      setupTurn(R8, { hand: [MYUU], pp: 4, superEvo: 1 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
      ]);
      whenPlayCard("first", 0);
      const myuu = findOnBoard("first", "Myuu, Hot on His Heels")!;
      whenSuperEvolve(myuu, "first");
      applyKeywordsFromList(myuu);
      expect(myuu.hasStorm).toBe(false);
    });
  });

  describe("Asher & Lydia, Paths Beyond (10874110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and give it Ward.\nEnhance (9): Evolve this follower and give it Storm.\nWhen this follower evolves, destroy 2 random enemy followers with Ward.";

    it("Fanfare gives Ward to selected enemy; bystander has no Ward", () => {
      setupTurn(R8, { hand: [ASHER_LYDIA], pp: 5 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      applyKeywordsFromList(target);
      applyKeywordsFromList(bystander);
      expect(target.hasWard).toBe(true);
      expect(bystander.hasWard).not.toBe(true);
    });

    it("Enhance (9): evolves with Storm and Fanfare still applies", () => {
      setupTurn(R10, { hand: [ASHER_LYDIA], pp: 9 });
      const target = enemyFollower(2, 4, "Wall");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      const asher = findOnBoard("first", "Asher & Lydia, Paths Beyond")!;
      expect(asher.hasEvolved).toBe(true);
      expect(asher.hasStorm).toBe(true);
      applyKeywordsFromList(target);
      expect(target.hasWard).toBe(true);
    });

    it("when evolved, destroys 2 random enemy followers with Ward", () => {
      setupTurn(R8, { hand: [ASHER_LYDIA], pp: 5, evo: 2 });
      enemyFollower(2, 4, "Ward1", { hasWard: true });
      enemyFollower(2, 4, "Ward2", { hasWard: true });
      enemyFollower(2, 4, "NoWard");
      whenPlayCard("first", 0);
      resolveFirstPending();
      const asher = findOnBoard("first", "Asher & Lydia, Paths Beyond")!;
      whenEvolve(asher, "first");
      cleanupDead();
      expect(getBoard(state, "second").length).toBe(1);
      expect(findOnBoard("second", "NoWard")).toBeTruthy();
    });
  });

  describe("Sandalphon, Primarch Successor (10404110)", () => {
    const printed =
      'Activates in deck. At the start of your turn, if allied followers have evolved at least 6 times this match, Invoke this card.\nWhen this card is Invoked, gain Crest: Sandalphon, Primarch Successor and return this card to hand\nFanfare: Super Skybound Art- Do this 5 times: "Deal 2 damage to a random enemy."';

    it("below 6 evolves at turn start: does not invoke (l2-buff_forestcraft parity)", () => {
      setupTurn(R6, { hand: [], deck: sandalphonDeck(), pp: 6 });
      state.players.first.evoCount = 5;
      whenEndTurn();
      whenEndTurn();
      expect(handIds()).not.toContain(SANDALPHON);
      expect(deckIds()).toContain(SANDALPHON);
    });

    it("at 6+ evolves: invokes, gains crest, returns to hand", () => {
      setupTurn(R6, { hand: [], deck: sandalphonDeck(), pp: 6 });
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

    it("crest owner's EOT restores 1 defense to all allies; countdown still 2", () => {
      setupTurn(R6, { hand: [], deck: sandalphonDeck(), pp: 6, hp: 15 });
      state.players.first.evoCount = 6;
      const ally = allyFollower(2, 2, "Ally");
      ally.defense = 1;
      whenEndTurn();
      whenEndTurn();
      const crest = () =>
        getCrests(state, "first").find(
          (c) => c.name === "Sandalphon, Primarch Successor",
        );
      expect(Number(crest()!.countdown)).toBe(2);
      const hpBefore = getHP(state, "first");
      whenEndTurn();
      expect(getHP(state, "first")).toBe(hpBefore + 1);
      expect(Number(ally.defense)).toBe(2);
      expect(Number(crest()!.countdown)).toBe(2);
    });

    it("crest Countdown (2): ticks at owner turn-start; gone after second turn-start", () => {
      setupTurn(R6, { hand: [], deck: sandalphonDeck(), pp: 6, hp: 15 });
      state.players.first.evoCount = 6;
      whenEndTurn();
      whenEndTurn();
      const crest = () =>
        getCrests(state, "first").find(
          (c) => c.name === "Sandalphon, Primarch Successor",
        );
      expect(Number(crest()!.countdown)).toBe(2);
      whenEndTurn();
      expect(Number(crest()!.countdown)).toBe(2);
      whenEndTurn();
      whenEndTurn();
      expect(Number(crest()!.countdown)).toBe(1);
      whenEndTurn();
      whenEndTurn();
      expect(crest()).toBeFalsy();
    });

    it("opponent's EOT does not heal from Sandalphon crest", () => {
      setupTurn(R6, {
        hand: [],
        deck: sandalphonDeck(),
        pp: 6,
        hp: 15,
        active: "second",
      });
      state.players.first.evoCount = 6;
      whenEndTurn();
      whenEndTurn();
      const hpBefore = getHP(state, "first");
      runEndOfTurnBoundary("second");
      expect(getHP(state, "first")).toBe(hpBefore);
    });

    it("Fanfare at Super Skybound Art (15): 5 hits of 2 damage (10 total)", () => {
      setupTurn(R10, { hand: [SANDALPHON], pp: 6 });
      for (let i = 0; i < 15; i++) incrementSkyboundArt("first");
      const sand = getHand(state, "first").find((c) => c.id === SANDALPHON)!;
      sand.skyboundArtEvolvesWitnessed = 15;
      const foe = enemyFollower(2, 10, "Foe");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const followerDmg = 10 - Number(foe.defense);
      const leaderDmg = 20 - getHP(state, "second");
      expect(followerDmg + leaderDmg).toBe(10);
    });
  });

  describe("Shoddy Plaything (10671110)", () => {
    const printed =
      "Fanfare: Draw 3 cards.\nWard\nAccelerate (2): Summon a Shoddy Plaything.";

    it("Fanfare draws 3 stacked deck cards by identity", () => {
      setupTurn(R8, {
        hand: [SHODDY_PLAYTHING],
        deck: [DRAW_THIRD, DRAW_SECOND, DRAW_TOP],
        pp: 6,
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(handIds()).toContain(DRAW_SECOND);
      expect(handIds()).toContain(DRAW_THIRD);
      expect(deckIds()).not.toContain(DRAW_TOP);
    });

    it("has Ward on board", () => {
      setupTurn(R8, { hand: [SHODDY_PLAYTHING], pp: 6 });
      whenPlayCard("first", 0);
      const shoddy = findOnBoard("first", "Shoddy Plaything")!;
      applyKeywordsFromList(shoddy);
      expect(shoddy.hasWard).toBe(true);
    });

    it("Accelerate (2): summons exactly one Shoddy Plaything on board", () => {
      setupTurn(R6, { hand: [SHODDY_PLAYTHING], pp: 2 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === SHODDY_PLAYTHING)).toHaveLength(
        1,
      );
      expect(
        getGraveyard(state, "first").some((c) => c.id === SHODDY_PLAYTHING),
      ).toBe(true);
    });
  });

  describe("Aizeden, Killshot Revenant (10974120)", () => {
    const printed =
      "Fanfare: Summon a Warden of the Trigger.\nWhenever an allied Artifact follower enters the field, destroy a random enemy follower.\nSuper-Evolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare summons Warden of the Trigger (90074150)", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 7 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === WARDEN_TRIGGER)).toHaveLength(1);
    });

    it("Artifact enter destroys a random enemy follower", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 7 });
      enemyFollower(2, 5, "Victim");
      whenPlayCard("first", 0);
      summonArtifactOnBoard(ANALYZING_ARTIFACT);
      expect(getBoard(state, "second").length).toBe(0);
    });

    it("non-Artifact enter does not destroy enemies", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 7 });
      whenPlayCard("first", 0);
      enemyFollower(2, 5, "Safe");
      summonFollowerByCardId(PLAY_FILLER_FOLLOWER, "first");
      expect(getBoard(state, "second").length).toBe(1);
    });

    it("Super-Evolve replicates Fanfare: second Warden on board", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 7, superEvo: 1 });
      whenPlayCard("first", 0);
      const aizeden = findOnBoard("first", "Aizeden, Killshot Revenant")!;
      whenSuperEvolve(aizeden, "first");
      expect(boardIds().filter((id) => id === WARDEN_TRIGGER)).toHaveLength(2);
    });
  });

  describe("Camiscilla, Unfeeling Heart (10674110)", () => {
    const printed =
      "Fanfare: Summon a Shoddy Plaything and Substandard Puppet.\nWhenever another allied follower with a base cost of 5 or more enters the field, evolve it.\nSuper-Evolve: Deal X damage to the enemy leader. X is the number of allied followers on the field with a base cost of 5 or more.";

    it("Fanfare summons Shoddy Plaything and Substandard Puppet by identity", () => {
      setupTurn(R8, { hand: [CAMISCILLA], pp: 7 });
      whenPlayCard("first", 0);
      expect(boardIds()).toContain(SHODDY_PLAYTHING);
      expect(boardIds()).toContain(SUBSTANDARD_PUPPET);
    });

    it("when another ally base cost ≥5 enters, evolves that follower", () => {
      setupTurn(R8, { hand: [CAMISCILLA], pp: 7 });
      whenPlayCard("first", 0);
      const big = summonFollowerByCardId(SANDALPHON, "first");
      expect(big.hasEvolved).toBe(true);
    });

    it("ally base cost <5 entering does not evolve via trigger", () => {
      setupTurn(R8, { hand: [CAMISCILLA], pp: 7 });
      whenPlayCard("first", 0);
      const small = summonFollowerByCardId(PLAY_FILLER_FOLLOWER, "first");
      expect(small.hasEvolved).not.toBe(true);
    });

    it("Super-Evolve deals X to enemy leader where X = allies with base cost ≥5 on field", () => {
      setupTurn(R8, { hand: [CAMISCILLA], pp: 7, superEvo: 1 });
      whenPlayCard("first", 0);
      const cam = findOnBoard("first", "Camiscilla, Unfeeling Heart")!;
      const hpBefore = getHP(state, "second");
      whenSuperEvolve(cam, "first");
      // Camiscilla (7) + Shoddy (6) + Substandard (5) = 3 qualifying allies
      expect(hpBefore - getHP(state, "second")).toBe(3);
    });
  });

  describe("Ludicrous Ordnance (10673110)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Ludicrous Ordnance.\nAt the end of your turn, deal 3 damage split between all enemy followers.\nEvolve: Deal 3 damage split between all enemy followers.\nAccelerate (4): Summon a Ludicrous Ordnance.";

    it("Fanfare places exactly 3 Ludicrous Ordnance on board (self + 2 copies)", () => {
      setupTurn(R10, { hand: [LUDICROUS_ORDNANCE], pp: 8 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === LUDICROUS_ORDNANCE)).toHaveLength(
        3,
      );
    });

    it("owner's EOT with one Ludicrous on board deals 3 split damage", () => {
      setupTurn(R8, { hand: [LUDICROUS_ORDNANCE], pp: 4 });
      const a = enemyFollower(1, 2, "A");
      const b = enemyFollower(1, 2, "B");
      whenPlayCard("first", 0);
      const defBefore = Number(a.defense) + Number(b.defense);
      whenEndTurn();
      expect(defBefore - (Number(a.defense) + Number(b.defense))).toBe(3);
      expect(boardIds().filter((id) => id === LUDICROUS_ORDNANCE)).toHaveLength(
        1,
      );
    });

    it("opponent's EOT does not deal split damage from Ludicrous Ordnance", () => {
      setupTurn(R10, {
        hand: [LUDICROUS_ORDNANCE],
        pp: 8,
        active: "second",
      });
      const foe = enemyFollower(1, 5, "Safe");
      whenPlayCard("first", 0);
      const defBefore = Number(foe.defense);
      runEndOfTurnBoundary("second");
      expect(Number(foe.defense)).toBe(defBefore);
    });

    it("Evolve deals 3 split damage to enemy followers", () => {
      setupTurn(R10, { hand: [LUDICROUS_ORDNANCE], pp: 8, evo: 2 });
      const foe = enemyFollower(1, 5, "Target");
      whenPlayCard("first", 0);
      const ord = thenBoard("first").find((c) => c.id === LUDICROUS_ORDNANCE)!;
      const defBefore = Number(foe.defense);
      whenEvolve(ord, "first");
      expect(defBefore - Number(foe.defense)).toBe(3);
    });

    it("Accelerate (4): summons exactly one Ludicrous Ordnance", () => {
      setupTurn(R8, { hand: [LUDICROUS_ORDNANCE], pp: 4 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === LUDICROUS_ORDNANCE)).toHaveLength(
        1,
      );
    });
  });

  describe("Scarlet, Anathema of Dislocation (10774110)", () => {
    const printed =
      "Fanfare: Deal X damage to all enemy followers. X is the number of differently named allied Artifact followers that have entered the field this match.\nStorm\nWard";

    it("Fanfare X=2 deals 2 to each enemy follower", () => {
      setupTurn(R10, { hand: [SCARLET], pp: 8 });
      pushUniqueArtifactEnters([
        { id: ANALYZING_ARTIFACT, name: "Analyzing Artifact" },
        { id: ANCIENT_ARTIFACT, name: "Ancient Artifact" },
      ]);
      const a = enemyFollower(2, 5, "A");
      const b = enemyFollower(2, 5, "B");
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(3);
      expect(Number(b.defense)).toBe(3);
    });

    it("Fanfare X=0 deals 0 — enemy defense unchanged", () => {
      setupTurn(R10, { hand: [SCARLET], pp: 8 });
      const foe = enemyFollower(2, 5, "Safe");
      whenPlayCard("first", 0);
      expect(Number(foe.defense)).toBe(5);
    });

    it("has Storm and Ward on board", () => {
      setupTurn(R10, { hand: [SCARLET], pp: 8 });
      whenPlayCard("first", 0);
      const scarlet = findOnBoard("first", "Scarlet, Anathema of Dislocation")!;
      applyKeywordsFromList(scarlet);
      expect(scarlet.hasStorm).toBe(true);
      expect(scarlet.hasWard).toBe(true);
    });
  });
});
