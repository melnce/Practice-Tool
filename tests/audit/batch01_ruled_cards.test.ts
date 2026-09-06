/**
 * Batch 1 — owner-ruled cards lacking dedicated behavioral audit tests.
 * Assertions from docs/llm-guide.md owner table + card text + rulebook.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenHand,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve, whenEffectEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";

import { bounceToHand } from "../../src/logic/effects/ops/bounce.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { spellboostHand } from "../../src/logic/effects/ops/spellboost.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import {
  getBoard,
  getHand,
  getHP,
  getDeck,
  getGraveyard,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const RUSTY = "10022120";
const WILD_PROFUSION = "10011210";
const DRAGONSIGN = "10042310";
const GENTLE_TREANT = "10011130";
const MAY = "10012110";
const SELWYN = "10012120";
const DAZZLING = "10031110";
const IRONFIST = "10062110";
const DETECTIVE_LENS = "10001210";
const BUG_ALERT = "10012310";
const BLAZE = "10032120";
const REMI_RAMI = "10032110";
const SACRED_GRIFFON = "10062120";
const MECHA_CAVALIER = "10072120";
const AVIAN_STATUE = "10061210";
const WINGED_STATUE = "10062210";
const CHAOS_CYCLONE = "10051310";
const DEVIOUS_MUMMY = "10051130";
const ANCESTRAL_CROWN = "10022210";
const PUPPET_THEATER = "10072210";
const ADVENTURERS_GUILD = "10002210";

function enableHeadlessMode(): void {
  (globalThis as any).HEADLESS = true;
}

function disableHeadlessMode(): void {
  delete (globalThis as any).HEADLESS;
  delete (globalThis as any).AI_SUPPRESS_RENDER;
}

describe("Batch 01 ruled cards — owner table behavioral tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  afterEach(() => {
    disableHeadlessMode();
  });

  describe("Rusty, Luxcard Trickster (owner: deck-only draw)", () => {
    beforeEach(() => {
      state.roundCount = 7;
    });

    it("Super-Evolve draws all Rusty copies from deck only (not hand/graveyard)", () => {
      enableHeadlessMode();

      givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
        .withFirstPP(10, 10)
        .build();

      state.players.first.superEvoCharges = 2;
      state.players.first.evoUsedThisTurn = false;

      const onBoard = createCard(RUSTY, "board", "first");
      onBoard.peak_defense = onBoard.defense;
      state.players.first.board = [onBoard];

      const handCopy = createCard(RUSTY, "hand", "first");
      state.players.first.hand = [handCopy];

      state.players.first.deck = [
        createCard(RUSTY, "deck", "first"),
        createCard(RUSTY, "deck", "first"),
      ];
      state.players.first.graveyard = [createCard(RUSTY, "graveyard", "first")];

      const deckBefore = getDeck(state, "first").length;
      const handBefore = getHand(state, "first").length;
      const handUidsBefore = new Set(getHand(state, "first").map((c) => c.uid));

      whenSuperEvolve(onBoard, "first");

      const rustyInHand = getHand(state, "first").filter(
        (c) => c.name === "Rusty, Luxcard Trickster",
      );
      expect(rustyInHand.length).toBe(handBefore + deckBefore);
      expect(
        getGraveyard(state, "first").filter(
          (c) => c.name === "Rusty, Luxcard Trickster",
        ),
      ).toHaveLength(1);

      const deckDrawn = rustyInHand.filter((c) => !handUidsBefore.has(c.uid));
      expect(deckDrawn.length).toBe(deckBefore);
      expect(deckDrawn.every((c) => c.hasStorm)).toBe(true);
    });
  });

  describe("Wild Profusion (owner: Pixie=Fairy, random 1 dmg)", () => {
    it("allied Pixie (Fairy) enter deals 1 to a random enemy follower (Ward irrelevant)", () => {
      givenGameState({ seed: 5, activePlayer: "first" })
        .withFirstHand(["90011110"])
        .withFirstPP(10, 10)
        .build();

      const profusion = createCard(WILD_PROFUSION, "board", "first");
      applyKeywordsFromList(profusion);
      state.players.first.board = [profusion];

      const ward = createCard("10001130", "board", "second");
      applyKeywordsFromList(ward);
      ward.uid = "ward";
      ward.peak_defense = ward.defense;

      const back = createCard(
        { name: "Back", type: "Follower", cost: 1, attack: 1, defense: 3 },
        "board",
        "second",
      );
      back.uid = "back";
      back.peak_defense = 3;
      state.players.second.board = [ward, back];

      whenPlayCard("first", 0);

      const totalDef = Number(ward.defense) + Number(back.defense);
      expect(totalDef).toBeLessThan(8);
    });
  });

  describe("Dragonsign (owner: draw at 9→10 and at 10)", () => {
    it("9 max PP → gain 1 → 10 max PP draws a card", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 9 })
        .withFirstHand([DRAGONSIGN])
        .withFirstDeck([
          { name: "DrawMe", type: "Follower", attack: 1, defense: 1 },
        ])
        .withFirstPP(10, 9)
        .build();

      expect(state.players.first.permPP).toBe(0);

      whenPlayCard("first", 0);

      expect(state.players.first.maxPP).toBe(10);
      expect(thenHand("first").some((c) => c.name === "DrawMe")).toBe(true);
    });

    it("already at 10 max PP still draws (owner: at 10 only draw)", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
        .withFirstHand([DRAGONSIGN])
        .withFirstDeck([
          { name: "DrawMe", type: "Follower", attack: 1, defense: 1 },
        ])
        .withFirstPP(10, 10)
        .build();

      expect(state.players.first.permPP).toBe(0);

      whenPlayCard("first", 0);
      expect(thenHand("first").some((c) => c.name === "DrawMe")).toBe(true);
    });

    it("8 max PP → 9 does not draw (turn 8, no ramp)", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
        .withFirstHand([DRAGONSIGN])
        .withFirstDeck([
          { name: "DrawMe", type: "Follower", attack: 1, defense: 1 },
        ])
        .withFirstPP(10, 8)
        .build();

      expect(state.players.first.permPP).toBe(0);

      whenPlayCard("first", 0);
      expect(state.players.first.maxPP).toBe(9);
      expect(thenHand("first").every((c) => c.name !== "DrawMe")).toBe(true);
    });

    it("permPP from ramp persists: max still elevated at turn N+1", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
        .withFirstHand([DRAGONSIGN])
        .withFirstPP(10, 8)
        .build();

      whenPlayCard("first", 0);
      expect(state.players.first.permPP).toBe(1);
      expect(state.players.first.maxPP).toBe(9);

      whenEndTurn();
      whenEndTurn();

      expect(state.activePlayer).toBe("first");
      expect(state.roundCount).toBe(9);
      expect(state.players.first.permPP).toBe(1);
      expect(state.players.first.maxPP).toBe(10);
    });
  });

  describe("Gentle Treant (owner: combo self-evolve → strike followers same turn)", () => {
    it("Combo (3) self-evolve on Fanfare; evolved Treant can strike followers not leader", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
        .withFirstHand(["10011110", "10011110", GENTLE_TREANT])
        .withFirstPP(10, 10)
        .build();

      const enemy = createCard(
        { name: "Dummy", type: "Follower", cost: 1, attack: 0, defense: 5 },
        "board",
        "second",
      );
      enemy.peak_defense = 5;
      state.players.second.board = [enemy];
      state.players.second.hp = 20;

      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);

      const treant = findOnBoard("first", "Gentle Treant")!;
      expect(treant.hasEvolved).toBe(true);
      expect(treant.hasStorm).toBeFalsy();

      const atkIdx = getBoard(state, "first").indexOf(treant);
      attackFollower(atkIdx, 0, "first", "second");
      expect(enemy.defense).toBeLessThan(5);

      state.players.second.hp = 20;
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("May, Journey Elf (owner: combo on 3rd card played)", () => {
    it("Combo (3) on third card played deals 3 to selected enemy follower", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand(["10011110", "10011110", MAY])
        .withFirstPP(10, 10)
        .build();

      const enemy = createCard(
        { name: "Target", type: "Follower", cost: 2, attack: 2, defense: 5 },
        "board",
        "second",
      );
      enemy.uid = "may_target";
      enemy.peak_defense = 5;
      state.players.second.board = [enemy];

      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);

      expect(state.pendingTargetEffect).toBeDefined();
      resolvePendingTarget("may_target");
      expect(enemy.defense).toBe(2);
    });
  });

  describe("Selwyn, Sonic Archer (owner: player selects 1 enemy)", () => {
    it("Super-Evolve returns exactly one selected enemy follower", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
        .withFirstPP(10, 10)
        .build();

      state.players.first.superEvoCharges = 2;

      const selwyn = createCard(SELWYN, "board", "first");
      applyKeywordsFromList(selwyn);
      selwyn.peak_defense = selwyn.defense;
      state.players.first.board = [selwyn];

      const a = createCard(
        { name: "EnemyA", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      a.uid = "enemy_a";
      const b = createCard(
        { name: "EnemyB", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      b.uid = "enemy_b";
      state.players.second.board = [a, b];

      whenSuperEvolve(selwyn, "first");
      expect(state.pendingTargetEffect).toBeDefined();
      resolvePendingTarget("enemy_a");

      expect(getBoard(state, "second")).toHaveLength(1);
      expect(getBoard(state, "second")[0]!.uid).toBe("enemy_b");
      expect(getHand(state, "second").some((c) => c.name === "EnemyA")).toBe(
        true,
      );
    });
  });

  describe("Dazzling Runeknight (owner: both modes; ER without sigil fizzles)", () => {
    it("Mode 1 spellboosts hand twice", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([BLAZE])
        .withFirstPP(10, 10)
        .build();

      const blaze = getHand(state, "first")[0]!;
      runEffects(
        [{ op: "spellboost", target: "ally:hand", count: 2 } as any],
        "first",
        createCard(DAZZLING, "hand", "first"),
      );

      expect(blaze.keywordState?.spellboostCount ?? blaze.spellboostCount).toBe(
        2,
      );
    });

    it("Mode 2 without earth sigil: choosable but no +2/+2/Ward", () => {
      givenGameState({ seed: 1, activePlayer: "first" }).build();

      const knight = createCard(DAZZLING, "board", "first");
      knight.peak_defense = knight.defense;
      state.players.first.board = [knight];

      runEffects(
        [
          {
            op: "earth_rite",
            cost: 1,
            effects: [
              {
                op: "stat",
                action: "give",
                target: "self",
                attack: 2,
                defense: 2,
              },
              {
                op: "stat",
                action: "give",
                target: "self",
                keywords: ["Ward"],
              },
            ],
          } as any,
        ],
        "first",
        knight,
      );

      expect(Number(knight.attack)).toBe(2);
      expect(Number(knight.defense)).toBe(2);
      expect(knight.hasWard).toBeFalsy();
    });
  });

  describe("Ironfist Priest (owner: current defense ≤3)", () => {
    it("Evolve banishes enemy with current defense 3, not one at 4 even if base was 3", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
        .withFirstEvo(2)
        .build();

      const priest = createCard(IRONFIST, "board", "first");
      priest.peak_defense = priest.defense;
      state.players.first.board = [priest];

      const legal = createCard(
        { name: "Small", type: "Follower", cost: 2, attack: 2, defense: 3 },
        "board",
        "second",
      );
      legal.uid = "legal";
      legal.peak_defense = 3;

      const illegal = createCard(
        { name: "Buffed", type: "Follower", cost: 2, attack: 2, defense: 4 },
        "board",
        "second",
      );
      illegal.uid = "illegal";
      illegal.peak_defense = 4;

      state.players.second.board = [legal, illegal];

      whenEvolve(priest, "first");
      expect(state.pendingTargetEffect).toBeDefined();
      resolvePendingTarget("legal");

      expect(getBoard(state, "second")).toHaveLength(1);
      expect(getBoard(state, "second")[0]!.uid).toBe("illegal");
    });
  });

  describe("Detective's Lens (owner: remove Ward even if absent)", () => {
    it("Engage removes Ward from selected enemy (valid on non-Ward follower)", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstPP(10, 10)
        .build();

      const lens = createCard(DETECTIVE_LENS, "board", "first");
      applyKeywordsFromList(lens);
      state.players.first.board = [lens];

      const target = createCard(
        { name: "NoWard", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      target.uid = "no_ward";
      state.players.second.board = [target];

      engageAmulet("first", 0);
      expect(state.pendingTargetEffect).toBeDefined();
      resolvePendingTarget("no_ward");

      expect(getBoard(state, "first")).toHaveLength(0);
      expect(target.hasWard).toBeFalsy();
    });
  });

  describe("Bug Alert (owner: return own; 2 random enemy follower dmg)", () => {
    it("returns selected ally and deals 2 to a random enemy follower only", () => {
      givenGameState({ seed: 3, activePlayer: "first" })
        .withFirstHand([BUG_ALERT])
        .withFirstPP(10, 10)
        .build();

      const ally = createCard("10001110", "board", "first");
      ally.uid = "ally_return";
      state.players.first.board = [ally];

      const enemy = createCard(
        { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 5 },
        "board",
        "second",
      );
      enemy.peak_defense = 5;
      state.players.second.board = [enemy];
      state.players.second.hp = 20;

      whenPlayCard("first", 0);
      resolvePendingTarget("ally_return");

      expect(
        getHand(state, "first").some((c) => c.name === "Indomitable Fighter"),
      ).toBe(true);
      expect(getBoard(state, "first")).toHaveLength(0);
      expect(enemy.defense).toBe(3);
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Blaze Destroyer (owner: spellboost hand only)", () => {
    it("On Spellboost reduces cost only while in hand", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([BLAZE, "10031310"])
        .withFirstPP(10, 10)
        .build();

      const blaze = getHand(state, "first").find(
        (c) => c.name === "Blaze Destroyer",
      )!;
      whenPlayCard("first", 1);
      expect(Number(blaze.cost)).toBe(9);

      spellboostHand("first", 1, blaze);
      expect(Number(blaze.cost)).toBe(8);
    });
  });

  describe("Remi & Rami (owner: Golem evolve does not spend EP)", () => {
    it("Super-Evolve evolving an allied Golem does not consume evo points", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
        .withFirstPP(10, 10)
        .build();

      state.players.first.superEvoCharges = 2;
      state.players.first.evoCharges = 2;

      const remi = createCard(REMI_RAMI, "board", "first");
      remi.peak_defense = remi.defense;
      state.players.first.board = [remi];

      const golem = createCard(
        {
          name: "Guardian Golem",
          type: "Follower",
          cost: 3,
          attack: 3,
          defense: 3,
          tribes: ["Golem"],
        },
        "board",
        "first",
      );
      golem.uid = "golem";
      golem.peak_defense = 3;
      state.players.first.board.push(golem);

      whenSuperEvolve(remi, "first");
      resolvePendingTarget("golem");

      expect(state.players.first.evoCharges).toBe(2);
      expect(golem.hasEvolved).toBe(true);
    });
  });

  describe("Sacred Griffon (owner: Storm non-stacking; your Engage only)", () => {
    it("gains Storm once from your amulet Engage; second Engage does not stack extra attacks", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstPP(10, 10)
        .build();

      const griffon = createCard(SACRED_GRIFFON, "board", "first");
      applyKeywordsFromList(griffon);
      griffon.peak_defense = griffon.defense;

      const lens = createCard(DETECTIVE_LENS, "board", "first");
      applyKeywordsFromList(lens);
      lens.uid = "lens1";

      const lens2 = createCard(DETECTIVE_LENS, "board", "first");
      applyKeywordsFromList(lens2);
      lens2.uid = "lens2";

      state.players.first.board = [griffon, lens, lens2];

      const dummy = createCard(
        { name: "Dummy", type: "Follower", cost: 1, attack: 0, defense: 2 },
        "board",
        "second",
      );
      dummy.uid = "dummy";
      state.players.second.board = [dummy];

      engageAmulet("first", 1);
      resolvePendingTarget("dummy");
      expect(griffon.hasStorm).toBe(true);
      const attacksAfterFirst = griffon.attacks_left;

      engageAmulet("first", 1);
      resolvePendingTarget("dummy");
      expect(griffon.attacks_left).toBe(attacksAfterFirst);
    });
  });

  describe("Mecha Cavalier (owner: super summons 2 instead)", () => {
    it("Super-Evolve summons exactly 2 Mecha Cavalier tokens (not 1+2)", () => {
      givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
        .withFirstPP(10, 10)
        .build();

      state.players.first.superEvoCharges = 2;

      const mecha = createCard(MECHA_CAVALIER, "board", "first");
      applyKeywordsFromList(mecha);
      mecha.peak_defense = mecha.defense;
      state.players.first.board = [mecha];

      whenSuperEvolve(mecha, "first");

      const tokens = thenBoard("first").filter(
        (c) => c.name === "Mecha Cavalier",
      );
      expect(tokens).toHaveLength(3);
      const summoned = tokens.filter((c) => c.uid !== mecha.uid);
      expect(summoned).toHaveLength(2);
    });
  });

  describe("Avian Statue + Winged Statue (owner: countdown 0 → destroy + LW)", () => {
    it("Winged Statue at countdown 0 is destroyed and summons Holy Falcon", () => {
      givenGameState({ seed: 1 }).build();

      const winged = createCard(WINGED_STATUE, "board", "first");
      applyKeywordsFromList(winged);
      winged.countdown = 0;
      state.players.first.board = [winged];

      cleanupDead();

      expect(thenBoard("first").some((c) => c.name === "Holy Falcon")).toBe(
        true,
      );
      expect(
        thenBoard("first").find((c) => c.name === "Winged Statue"),
      ).toBeUndefined();
    });
  });

  describe("Chaos Cyclone (owner: Reanimate from cemetery §763)", () => {
    it("Mode 2 reanimates highest cost ≤2 from graveyard without Fanfare", () => {
      givenGameState({ seed: 42, activePlayer: "first" })
        .withFirstHP(20, 20)
        .build();

      const corpseA = createCard("10001110", "graveyard", "first");
      const corpseB = createCard("10001130", "graveyard", "first");
      state.players.first.graveyard = [corpseA, corpseB];
      recordDestroyed(state, "first", corpseA);
      recordDestroyed(state, "first", corpseB);

      runEffects(
        [{ op: "summon", source: "graveyard", max_cost: 2 } as any],
        "first",
        createCard(CHAOS_CYCLONE, "hand", "first"),
      );

      expect(getBoard(state, "first")).toHaveLength(1);
      expect(getBoard(state, "first")[0]!.name).toBe("Indomitable Fighter");
      expect(getHP(state, "first")).toBe(20);
    });
  });

  describe("Devious Lesser Mummy (owner: Necromancy 4 auto-spend)", () => {
    it("4+ shadows: spends 4 and gains Storm; <4: no spend, no Storm", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([DEVIOUS_MUMMY])
        .withFirstShadows(4)
        .withFirstPP(5, 5)
        .build();

      whenPlayCard("first", 0);
      expect(findOnBoard("first", "Devious Lesser Mummy")!.hasStorm).toBe(true);
      expect(state.players.first.shadows).toBe(0);

      resetUidCounter();
      givenGameState({ seed: 2, activePlayer: "first" })
        .withFirstHand([DEVIOUS_MUMMY])
        .withFirstShadows(3)
        .withFirstPP(5, 5)
        .build();

      whenPlayCard("first", 0);
      expect(
        findOnBoard("first", "Devious Lesser Mummy")!.hasStorm,
      ).toBeFalsy();
      expect(state.players.first.shadows).toBe(3);
    });
  });

  describe("Ancestral Crown (owner: any allied follower enter; stacks)", () => {
    it("buffs allied followers +1/+1 when they enter; multiple crowns stack", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([ANCESTRAL_CROWN, ANCESTRAL_CROWN, "10021110"])
        .withFirstPP(10, 10)
        .build();

      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      expect(
        thenBoard("first").filter((c) => c.name === "Ancestral Crown"),
      ).toHaveLength(2);

      whenPlayCard("first", 0);
      const buffed = findOnBoard("first", "Flashstep Quickblader")!;
      expect(buffed.attack).toBe(3);
      expect(buffed.defense).toBe(3);
    });
  });

  describe("Puppet Theater (owner: countdown start of turn; EOT puppet)", () => {
    it("countdown ticks at the start of its owner's turn", () => {
      givenGameState({ seed: 1, activePlayer: "first" }).build();

      const theater = createCard(PUPPET_THEATER, "board", "first");
      applyKeywordsFromList(theater);
      state.players.first.board = [theater];
      expect(theater.countdown).toBe(2);

      whenEndTurn();
      whenEndTurn();
      expect(theater.countdown).toBe(1);
    });
  });

  describe("Adventurers' Guild (§891 resolved: bounce loses granted Rush)", () => {
    it("Engage grants Rush; returning to hand removes granted Rush", () => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHand([ADVENTURERS_GUILD])
        .withFirstDeck([
          {
            name: "Indomitable Fighter",
            type: "Follower",
            cost: 2,
            attack: 2,
            defense: 2,
          },
        ])
        .withFirstPP(10, 10)
        .build();

      whenPlayCard("first", 0);

      const guildIdx = getBoard(state, "first").findIndex(
        (c) => c.name === "Adventurers' Guild",
      );
      const fighter = createCard("10001110", "board", "first");
      fighter.uid = "rush_target";
      fighter.peak_defense = fighter.defense;
      state.players.first.board.push(fighter);

      engageAmulet("first", guildIdx);
      resolvePendingTarget("rush_target");
      expect(fighter.hasRush).toBe(true);

      bounceToHand(fighter);
      const inHand = getHand(state, "first").find(
        (c) => c.name === "Indomitable Fighter" && c.type === "Follower",
      )!;
      expect(inHand).toBeDefined();
      expect(inHand.hasRush).toBeFalsy();
      expect(Number(inHand.attack)).toBe(2);
      expect(Number(inHand.defense)).toBe(2);
    });
  });
});

describe("Ancestral Crown — dedicated audit (migrated from legacy)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("AllyEnter gives +1/+1 to entering follower", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand([ANCESTRAL_CROWN, "10021110"])
      .withFirstPP(10, 10)
      .build();

    whenPlayCard("first", 0);
    whenPlayCard("first", 0);

    const quick = findOnBoard("first", "Flashstep Quickblader")!;
    expect(quick.attack).toBe(2);
    expect(quick.defense).toBe(2);
  });
});
