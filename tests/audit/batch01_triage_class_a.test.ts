/**
 * Batch 1 Part 3 — triage of ~36 basic cards without owner-table rulings.
 *
 * SPLIT (card text + rulebook; no engine output):
 *
 * (a) Pure vanilla / stats-only — NO behavioral test (check:cards covers JSON):
 *   - Quake Goliath (10001130) — Ward
 *   - Caravan Mammoth (10002120) — 10/10 stats, no text
 *   - Centaur Centurion (10021130) — Storm
 *   - Axe-Wielding Dragonslayer (10041120) — Ward
 *   - Mistress of the Fanged (10051110) — Storm, Bane
 *   - Fox of Purity (10061120) — Ward
 *   - Mechanized Beast (10071130) — Bane, Ward
 *
 * Already covered by other audit files (not duplicated here):
 *   Indomitable Fighter, Leah, Flashstep, Royal Coachwoman, Foresight, Truth Summons,
 *   Arriet, Draconic Berserker, Amorous Necromancer, Winged Warrior (super replicate)
 *
 * (b) Class A — text-deterministic effects (tests below):
 *   Fairy Tamer, Stray Beastman, Arms Peddler, Way of the Maid, Witch's New Brew,
 *   Arcane Eruption, Searing Firenewt, Warrior of the Deep, Strike of the Dragonewt,
 *   Battleforged Dragon Keeper, Night Fiend, Lilith, Soul Predation, Soulcure Sister,
 *   Kitty Cannoneer, Puppet Lancer, Bullet from Beyond, Electric Whip Lass
 */
import { describe, it, expect, beforeEach } from "vitest";
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
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getHP,
  getBoard,
  getPlaysThisTurn,
} from "../../src/core/playerHelpers.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import "../../src/logic/core/effects/index.js";

describe("Batch 01 Part 3 — Class A (card-text derived)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fairy Tamer — Fanfare adds 2 Fairy to hand", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10011110"])
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);
    expect(thenHand("first").filter((c) => c.name === "Fairy")).toHaveLength(2);
  });

  it("Stray Beastman — Fanfare increases Combo counter by 1", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10011120"])
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);
    expect(getPlaysThisTurn(state, "first")).toBe(2);
  });

  it("Arms Peddler — Last Words draws 1 card", () => {
    givenGameState({ seed: 1 })
      .withFirstDeck([
        { name: "DeckCard", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();

    const peddler = createCard("10021120", "board", "first");
    applyKeywordsFromList(peddler);
    peddler.defense = 0;
    state.players.first.board = [peddler];

    const before = thenHand("first").length;
    cleanupDead();
    expect(thenHand("first").length).toBe(before + 1);
  });

  it("Way of the Maid — returns hand card to deck and draws 2 Swordcraft followers", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10021310", { name: "ToReturn", type: "Spell", cost: 1 }])
      .withFirstDeck([
        {
          name: "SwordFollower",
          type: "Follower",
          class: "Swordcraft",
          attack: 1,
          defense: 1,
        },
        {
          name: "SwordFollower2",
          type: "Follower",
          class: "Swordcraft",
          attack: 1,
          defense: 1,
        },
      ])
      .withFirstPP(10, 10)
      .build();

    whenPlayCard("first", 0);
    resolvePendingTarget(state.players.first.hand[0]!.uid);

    expect(thenHand("first").filter((c) => c.type === "Follower")).toHaveLength(
      2,
    );
  });

  it("Witch's New Brew — Fanfare draws 1 card", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10031210"])
      .withFirstDeck([
        { name: "Drawn", type: "Follower", attack: 1, defense: 1 },
      ])
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Drawn")).toBe(true);
  });

  it("Arcane Eruption — deals 2 damage to all followers", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10032310"])
      .withFirstPP(10, 10)
      .build();

    const ally = createCard("10001110", "board", "first");
    ally.peak_defense = ally.defense;
    const enemy = createCard(
      { name: "Enemy", type: "Follower", cost: 2, attack: 2, defense: 4 },
      "board",
      "second",
    );
    enemy.peak_defense = 4;
    state.players.first.board = [ally];
    state.players.second.board = [enemy];

    whenPlayCard("first", 0);
    expect(ally.defense).toBe(0);
    expect(enemy.defense).toBe(2);
  });

  it("Searing Firenewt — Fanfare deals 1 to selected enemy follower", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10041110"])
      .withFirstPP(5, 5)
      .build();

    const enemy = createCard(
      { name: "Target", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemy.uid = "searing_target";
    enemy.peak_defense = 5;
    state.players.second.board = [enemy];

    whenPlayCard("first", 0);
    resolvePendingTarget("searing_target");
    expect(enemy.defense).toBe(4);
  });

  it("Warrior of the Deep — Fanfare deals 6 to enemy leader", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10041130"])
      .withFirstPP(10, 10)
      .build();

    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(14);
  });

  it("Strike of the Dragonewt — 2 dmg; 4 in Overflow", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10041310"])
      .withFirstPP(10, 10)
      .build();

    state.players.first.maxPP = 6;
    const enemy = createCard(
      { name: "Target", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemy.uid = "strike_target";
    enemy.peak_defense = 5;
    state.players.second.board = [enemy];

    whenPlayCard("first", 0);
    resolvePendingTarget("strike_target");
    expect(enemy.defense).toBe(3);

    resetUidCounter();
    givenGameState({ seed: 2, activePlayer: "first" })
      .withFirstHand(["10041310"])
      .withFirstPP(10, 10)
      .build();

    state.players.first.maxPP = 7;
    expect(isOverflow("first")).toBe(true);
    const enemy2 = createCard(
      { name: "Target2", type: "Follower", cost: 2, attack: 2, defense: 5 },
      "board",
      "second",
    );
    enemy2.uid = "strike_target2";
    enemy2.peak_defense = 5;
    state.players.second.board = [enemy2];

    whenPlayCard("first", 0);
    resolvePendingTarget("strike_target2");
    expect(enemy2.defense).toBe(1);
  });

  it("Battleforged Dragon Keeper — Enhance (7) summons Vastwing Dragon", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10042120"])
      .withFirstPP(7, 7)
      .build();

    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Vastwing Dragon")).toBe(
      true,
    );
  });

  it("Night Fiend — Fanfare deals 1 to your leader", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10051120"])
      .withFirstPP(5, 5)
      .build();

    state.players.first.hp = 20;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(19);
  });

  it("Lilith — Last Words adds Bat to hand", () => {
    givenGameState({ seed: 1 }).build();

    const lilith = createCard("10052110", "board", "first");
    applyKeywordsFromList(lilith);
    lilith.defense = 0;
    state.players.first.board = [lilith];

    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Bat")).toBe(true);
  });

  it("Soul Predation — destroys ally follower and draws 2", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10052310"])
      .withFirstDeck([
        { name: "A", type: "Follower", attack: 1, defense: 1 },
        { name: "B", type: "Follower", attack: 1, defense: 1 },
      ])
      .withFirstPP(5, 5)
      .build();

    const ally = createCard("10001110", "board", "first");
    ally.uid = "soul_ally";
    state.players.first.board = [ally];

    whenPlayCard("first", 0);
    resolvePendingTarget("soul_ally");

    expect(getBoard(state, "first")).toHaveLength(0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(2);
  });

  it("Soulcure Sister — Fanfare restores 5 defense to leader", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10061110"])
      .withFirstPP(10, 10)
      .build();

    state.players.first.hp = 10;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(15);
  });

  it("Kitty Cannoneer — Fanfare adds Gear of Ambition", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10071110"])
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gear of Ambition")).toBe(
      true,
    );
  });

  it("Puppet Lancer — Fanfare adds Enhanced Puppet", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10071120"])
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Enhanced Puppet")).toBe(
      true,
    );
  });

  it("Bullet from Beyond — destroys enemy follower and adds both gears", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10071310"])
      .withFirstPP(10, 10)
      .build();

    const enemy = createCard(
      { name: "Victim", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "second",
    );
    enemy.uid = "bullet_victim";
    state.players.second.board = [enemy];

    whenPlayCard("first", 0);
    resolvePendingTarget("bullet_victim");

    expect(getBoard(state, "second")).toHaveLength(0);
    expect(thenHand("first").some((c) => c.name === "Gear of Ambition")).toBe(
      true,
    );
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  });

  it("Electric Whip Lass — Fanfare adds Gear of Remembrance", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10072110"])
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  });
});

describe("Puppet Theater — migrated audit (owner: countdown + EOT puppet)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare adds a Puppet; EOT trigger adds another", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstHand(["10072210"])
      .withFirstPP(5, 5)
      .build();

    whenPlayCard("first", 0);
    const afterFanfare = thenHand("first").filter(
      (c) => c.name === "Puppet",
    ).length;
    expect(afterFanfare).toBeGreaterThanOrEqual(1);

    whenEndTurn();
    expect(
      thenHand("first").filter((c) => c.name === "Puppet").length,
    ).toBeGreaterThan(afterFanfare);
  });
});
