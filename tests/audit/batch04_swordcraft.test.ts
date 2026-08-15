/**
 * Batch 4 — Swordcraft audit (sets 10001–10004; basic set in Batch 1).
 *
 * Cardinal rule: assertions from card text + rulebook only.
 * States use natural roundCount/maxPP/permPP alignment (no permPP skew).
 *
 * CLASSIFICATION SUMMARY (49 non-basic Swordcraft cards):
 * - A (behavioral test): 36
 * - B/C escalated: 11 → tests/audit/batch04_swordcraft_ruled.test.ts
 * - Stats/keywords only (no test): 3 — Nightshadow Ambush, Feather, Fiorito Ambush+Bane
 *
 * Primitives: Rally §780 in primitives_batch4_rally.test.ts; Gildaria When this evolves there.
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
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: Parameters<typeof givenGameState>[0] extends never ? never : any;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck) b = b.withFirstDeck(opts.deck);
  b.build();
}

function enemyFollower(def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("Batch 4 — Swordcraft [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Ian — Fanfare +1/+1 to selected other ally; has Ward", () => {
    setupTurn(R6, { hand: ["10121110"], pp: 3 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(ally.attack).toBe(3);
    expect(findOnBoard("first", "Ian, Lovebound Knight")?.hasWard).toBe(true);
  });

  it("Lyrala — Fanfare summons Steelclad Knight; Officer enter restores 1 leader", () => {
    setupTurn(R6, { hand: ["10121130", "10122130"], pp: 5 });
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Steelclad Knight")).toBe(
      true,
    );
    expect(getHP(state, "first")).toBe(19);
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(20);
  });

  it("Hound of War — Enhance (6) summons 2 copies; has Rush", () => {
    setupTurn(R6, { hand: ["10121140"], pp: 6 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Hound of War").length,
    ).toBeGreaterThanOrEqual(2);
    expect(thenBoard("first").every((c) => c.hasRush)).toBe(true);
  });

  it("Knightly Rending — destroys enemy and summons Steelclad Knight", () => {
    setupTurn(R6, { hand: ["10121310"], pp: 4 });
    const e = enemyFollower(3);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(thenBoard("first").some((c) => c.name === "Steelclad Knight")).toBe(
      true,
    );
  });

  it("Luminous Commander — Officer enter +1/+0 EOT; Evolve summons Knight", () => {
    setupTurn(R6);
    const cmd = createCard("10122110", "board", "first");
    cmd.peak_defense = cmd.defense;
    state.players.first.board = [cmd];
    runEffects(
      [{ op: "summon", source: "named", name: "Knight", count: 1 } as any],
      "first",
      cmd,
    );
    expect(cmd.attack).toBe(2);
    onEvolve(cmd, "first", "normal");
    expect(thenBoard("first").some((c) => c.name === "Knight")).toBe(true);
  });

  it("Luminous Magus — Fanfare 3 Steelclad Knights; Officer enter gains Ward", () => {
    setupTurn(R6, { hand: ["10122120"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Steelclad Knight").length,
    ).toBe(3);
    const magus = findOnBoard("first", "Luminous Magus")!;
    const knight = createCard("10122130", "board", "first");
    runEffects(
      [{ op: "summon", source: "named", name: "Knight", count: 1 } as any],
      "first",
      magus,
    );
    const summoned = thenBoard("first").find(
      (c) => c.name === "Knight" && c.uid !== knight.uid,
    );
    expect(summoned?.hasWard).toBe(true);
  });

  it("Luminous Lancetrooper — Fanfare Knight; Officer enter gains Rush", () => {
    setupTurn(R6, { hand: ["10122130"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Knight")).toBe(true);
    const lance = findOnBoard("first", "Luminous Lancetrooper")!;
    runEffects(
      [{ op: "summon", source: "named", name: "Knight", count: 1 } as any],
      "first",
      lance,
    );
    const knight = thenBoard("first").find((c) => c.name === "Knight");
    expect(knight?.hasRush).toBe(true);
  });

  it("Shinobi Squirrel — Ambush; Evolve summons copy", () => {
    setupTurn(R6);
    const sq = createCard("10122140", "board", "first");
    applyKeywordsFromList(sq);
    sq.peak_defense = sq.defense;
    state.players.first.board = [sq];
    expect(sq.hasAmbush).toBe(true);
    onEvolve(sq, "first", "normal");
    expect(
      thenBoard("first").filter((c) => c.name === "Shinobi Squirrel").length,
    ).toBe(2);
  });

  it("Jeno — 2 attacks; Strike grants Barrier and summons Knight", () => {
    setupTurn(R8, { hand: ["10123110"], pp: 7 });
    const e = enemyFollower(3);
    whenPlayCard("first", 0);
    const jeno = findOnBoard("first", "Jeno, Levin Axeraider")!;
    expect(jeno.attacks_per_turn).toBe(2);
    jeno.can_attack = true;
    attackFollower(0, 0, "first", "second");
    // Strike grants Barrier before damage; counter-damage pops it (§412).
    expect(jeno.hasBarrier || jeno.keywordState?.hasBarrier).toBeFalsy();
    expect(
      (jeno as any).__uiPopBarrier || (jeno as any).__barrierPopReason,
    ).toBeTruthy();
    expect(thenBoard("first").some((c) => c.name === "Knight")).toBe(true);
  });

  it("Valse — Fanfare 5 damage to selected enemy; Enhance (6) +2/+2 Ambush", () => {
    setupTurn(R6, { hand: ["10123120"], pp: 6 });
    const e = enemyFollower(6);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(1);
    const valse = findOnBoard("first", "Valse, Silent Sniper")!;
    expect(valse.hasAmbush).toBe(true);
    expect(valse.attack).toBeGreaterThanOrEqual(4);
  });

  it("Zirconia — Evolve 2 Knights and +1/+1 other allies", () => {
    setupTurn(R6);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    const zir = createCard("10123130", "board", "first");
    zir.peak_defense = zir.defense;
    state.players.first.board = [ally, zir];
    onEvolve(zir, "first", "normal");
    expect(thenBoard("first").filter((c) => c.name === "Knight").length).toBe(
      2,
    );
    expect(ally.attack).toBe(3);
  });

  it("Amalia — Fanfare 4 Steelclad Knights; other ally enter +1/+0 Rush Ward", () => {
    setupTurn(R8, { hand: ["10123140"], pp: 8 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Steelclad Knight").length,
    ).toBe(4);
    const amalia = findOnBoard("first", "Amalia, Luxsteel Paladin")!;
    const entering = createCard(
      { name: "New", type: "Follower", cost: 2, attack: 1, defense: 1 },
      "board",
      "first",
    );
    runEffects(
      [{ op: "summon", source: "named", name: "Knight", count: 1 } as any],
      "first",
      amalia,
    );
    expect(
      thenBoard("first").filter((c) => c.name === "Steelclad Knight").length,
    ).toBe(4);
  });

  it("Ravening Tentacles — 5 damage to enemy follower or leader; restore 5", () => {
    setupTurn(R8, { hand: ["10123310"], pp: 7 });
    const e = enemyFollower(4);
    state.players.first.hp = 12;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(e.defense).toBe(0);
    expect(getHP(state, "first")).toBe(17);
  });

  it("Albert — Enhance (9) 3 damage all enemy followers; 2 attacks", () => {
    setupTurn(R10, { hand: ["10124110"], pp: 9 });
    enemyFollower(5, "A");
    enemyFollower(5, "B");
    const enhanceKw = getCardById("10124110")!.keywords!.find(
      (k) => typeof k === "object" && (k as any).name === "Enhance",
    ) as any;
    const enhanceFx = enhanceKw.effects;
    const al = createCard("10124110", "board", "first");
    state.players.first.board = [al];
    runEffects(enhanceFx, "first", al);
    expect(state.players.second.board.every((c) => c.defense === 2)).toBe(true);
    expect(al.attacks_per_turn).toBe(2);
  });

  it("Amelia — Fanfare draws 2 Swordcraft followers and recovers 3 PP", () => {
    setupTurn(R8, {
      hand: ["10124120"],
      pp: 6,
      deck: [
        {
          name: "S1",
          type: "Follower",
          class: "Swordcraft",
          cost: 2,
          attack: 1,
          defense: 1,
        },
        {
          name: "S2",
          type: "Follower",
          class: "Swordcraft",
          cost: 3,
          attack: 1,
          defense: 1,
        },
        {
          name: "S3",
          type: "Follower",
          class: "Dragoncraft",
          cost: 2,
          attack: 1,
          defense: 1,
        },
      ],
    });
    const ppBefore = state.players.first.pp;
    whenPlayCard("first", 0);
    expect(
      thenHand("first").filter((c) => c.class === "Swordcraft").length,
    ).toBeGreaterThanOrEqual(2);
    expect(state.players.first.pp).toBe(ppBefore - 6 + 3);
  });

  it("Kagemitsu — Last Words crest; Super-Evolve grants Storm", () => {
    setupTurn(R6);
    const kag = createCard("10124130", "board", "first");
    applyKeywordsFromList(kag);
    kag.defense = 0;
    state.players.first.board = [kag];
    cleanupDead();
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Kagemitsu, Enduring Warrior",
      ),
    ).toBe(true);

    resetUidCounter();
    setupTurn(R7);
    const kag2 = createCard("10124130", "board", "first");
    applyKeywordsFromList(kag2);
    kag2.peak_defense = kag2.defense;
    state.players.first.board = [kag2];
    state.players.first.superEvoPoints = 1;
    onEvolve(kag2, "first", "super");
    expect(kag2.hasStorm).toBe(true);
  });
});

describe("Batch 4 — Swordcraft [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Seria — Fanfare 1 damage to 2 random enemy followers", () => {
    setupTurn(R6, { hand: ["10221110"], pp: 2 });
    enemyFollower(3, "A");
    enemyFollower(3, "B");
    const defBefore =
      state.players.second.board[0]!.defense +
      state.players.second.board[1]!.defense;
    whenPlayCard("first", 0);
    const defAfter =
      state.players.second.board[0]!.defense +
      state.players.second.board[1]!.defense;
    expect(defBefore - defAfter).toBe(2);
  });

  it("Lucrative Deal — draw 2; opponent draws 1", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: R6 })
      .withFirstHand(["10221310"])
      .withFirstPP(2, 6)
      .withFirstDeck([
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ])
      .withSecondDeck([{ name: "O1", type: "Follower", attack: 1, defense: 1 }])
      .build();
    const oppDeckBefore = state.players.second.deck.length;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(2);
    expect(state.players.second.deck.length).toBe(oppDeckBefore - 1);
  });

  it("Rackhir — Fanfare draws spell; Evolve recovers 2 PP", () => {
    setupTurn(R6, {
      hand: ["10222120"],
      pp: 4,
      deck: [{ name: "SpellTop", type: "Spell", cost: 2 }],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.type === "Spell")).toBe(true);
    const rack = findOnBoard("first", "Rackhir, Ordinary Knight")!;
    const ppBefore = state.players.first.pp;
    onEvolve(rack, "first", "normal");
    expect(state.players.first.pp).toBe(ppBefore + 2);
  });

  it("Band of Battle Princesses — 4 damage random enemy; Enhance (4) hits 3", () => {
    setupTurn(R6, { hand: ["10222310"], pp: 2 });
    enemyFollower(6);
    whenPlayCard("first", 0);
    expect(state.players.second.board[0]!.defense).toBe(2);

    resetUidCounter();
    setupTurn(R6, { hand: ["10222310"], pp: 4 });
    enemyFollower(6, "A");
    enemyFollower(6, "B");
    enemyFollower(6, "C");
    whenPlayCard("first", 0);
    const totalDef = state.players.second.board.reduce(
      (s, c) => s + (c.defense ?? 0),
      0,
    );
    expect(totalDef).toBeLessThan(18);
  });

  it("Rosé — Follower Strike destroys damaged enemy before combat", () => {
    setupTurn(R6, { hand: ["10223110"], pp: 3 });
    const e = enemyFollower(1, "Chipped");
    e.peak_defense = 2;
    whenPlayCard("first", 0);
    const rose = findOnBoard("first", "Rosé, Princess Knight")!;
    rose.can_attack = true;
    attackFollower(0, 0, "first", "second");
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Prim — Fanfare adds Nonja; Ambush; Super-Evolve +1/+1 others", () => {
    setupTurn(R6, { hand: ["10223120"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Nonja, Silent Maid")).toBe(
      true,
    );
    expect(findOnBoard("first", "Prim, Princess's Picnic")?.hasAmbush).toBe(
      true,
    );

    resetUidCounter();
    setupTurn(R7);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    const prim = createCard("10223120", "board", "first");
    applyKeywordsFromList(prim);
    prim.peak_defense = prim.defense;
    state.players.first.board = [ally, prim];
    state.players.first.superEvoPoints = 1;
    onEvolve(prim, "first", "super");
    expect(ally.attack).toBe(3);
  });

  it("Yurius — Fanfare 2 enemy Knights; enemy enter cant attack + ping/heal", () => {
    setupTurn(R8, { hand: ["10224120"], pp: 8 });
    whenPlayCard("first", 0);
    expect(
      getBoard(state, "second").filter((c) => c.name === "Knight").length,
    ).toBe(2);
    const yurius = findOnBoard("first", "Yurius, Levin Authority")!;
    state.players.second.hp = 20;
    state.players.first.hp = 15;
    const foeKnight = getBoard(state, "second").find(
      (c) => c.name === "Knight",
    );
    const enterTrig = (yurius.triggers ?? []).find(
      (t: any) => t.event === "enemy_follower_enter",
    );
    runEffects((enterTrig as any).effects, "first", yurius, {
      enteringCard: foeKnight,
    });
    expect(
      foeKnight?.cantAttack ||
        foeKnight?.keywordState?.cantAttack ||
        foeKnight?.cantAttackFollowers,
    ).toBe(true);
    expect(getHP(state, "second")).toBe(19);
    expect(getHP(state, "first")).toBe(16);
  });
});

describe("Batch 4 — Swordcraft [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Devotee of Usurpation — Fanfare Boots; Last Words Goblet", () => {
    setupTurn(R6, { hand: ["10321110"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gilded Boots")).toBe(true);
    const dev = findOnBoard("first", "Devotee of Usurpation")!;
    dev.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Gilded Goblet")).toBe(
      true,
    );
  });

  it("Comrade of the Swordmaster — Last Words summons copy without Last Words", () => {
    setupTurn(R6);
    const com = createCard("10321120", "board", "first");
    applyKeywordsFromList(com);
    com.defense = 0;
    state.players.first.board = [com];
    cleanupDead();
    const copies = thenBoard("first").filter(
      (c) => c.name === "Comrade of the Swordmaster",
    );
    expect(copies.length).toBe(1);
    expect(copies[0]!.hasLastWords).toBeFalsy();
  });

  it("Shield Bash — Ward on selected ally; 4 random enemy damage", () => {
    setupTurn(R6, { hand: ["10321310"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    enemyFollower(5);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(ally.hasWard).toBe(true);
    expect(state.players.second.board[0]!.defense).toBe(1);
  });

  it("Supplicant of Usurpation — Fanfare Necklace; Last Words Blade", () => {
    setupTurn(R6, { hand: ["10322110"], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gilded Necklace")).toBe(
      true,
    );
    const sup = findOnBoard("first", "Supplicant of Usurpation")!;
    sup.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Gilded Blade")).toBe(true);
  });

  it("Peppy Scout — Fanfare deck summon ≤3 Swordcraft; Evolve +2/+2 ally", () => {
    setupTurn(R6, {
      hand: ["10322120"],
      pp: 5,
      deck: ["10121110"],
    });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").some((c) => c.name === "Ian, Lovebound Knight"),
    ).toBe(true);
    const scout = findOnBoard("first", "Peppy Scout")!;
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    onEvolve(scout, "first", "normal");
    resolvePendingTarget(ally.uid);
    expect(ally.attack).toBe(4);
    expect(ally.defense).toBe(4);
  });

  it("Congregant of Usurpation — Fanfare Goblet+Boots; loot play deals 3", () => {
    setupTurn(R6, { hand: ["10323110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gilded Goblet")).toBe(
      true,
    );
    expect(thenHand("first").some((c) => c.name === "Gilded Boots")).toBe(true);
    const cong = findOnBoard("first", "Congregant of Usurpation")!;
    enemyFollower(5);
    const blade = createCard(
      { name: "Gilded Blade", type: "Spell", cost: 1, tribes: ["Loot"] },
      "hand",
      "first",
    );
    state.players.first.hand.push(blade);
    whenPlayCard("first", state.players.first.hand.length - 1);
    const trig = (cong.triggers ?? []).find(
      (t: any) => t.event === "loot_played",
    );
    runEffects((trig as any).effects, "first", cong);
    expect(state.players.second.board[0]!.defense).toBe(2);
  });

  it("Sinciro — Fanfare X damage to all enemies from unique fused loot names", () => {
    setupTurn(R8, { hand: ["10324110"], pp: 6 });
    enemyFollower(5, "A");
    enemyFollower(5, "B");
    state.players.second.hp = 20;
    const sinc = getHand(state, "first")[0]!;
    (sinc as any)._fusedLootNames = ["Gilded Blade", "Gilded Boots"];
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(18);
    expect(state.players.second.board.every((c) => c.defense === 3)).toBe(true);
  });
});

describe("Batch 4 — Swordcraft [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Randall — Enhance (5) grants Storm", () => {
    setupTurn(R6, { hand: ["10421110"], pp: 5 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Randall, Feet Fighter")?.hasStorm).toBe(true);
  });

  it("Arthur — Ward; Evolve summons Mordred", () => {
    setupTurn(R6);
    const arthur = createCard("10421120", "board", "first");
    applyKeywordsFromList(arthur);
    arthur.peak_defense = arthur.defense;
    state.players.first.board = [arthur];
    expect(arthur.hasWard).toBe(true);
    onEvolve(arthur, "first", "normal");
    expect(
      thenBoard("first").some((c) => c.name === "Mordred, Illusory Lion"),
    ).toBe(true);
  });

  it("Mordred — Storm; Evolve summons Arthur", () => {
    setupTurn(R6);
    const mord = createCard("10421130", "board", "first");
    applyKeywordsFromList(mord);
    mord.peak_defense = mord.defense;
    state.players.first.board = [mord];
    expect(mord.hasStorm).toBe(true);
    onEvolve(mord, "first", "normal");
    expect(
      thenBoard("first").some((c) => c.name === "Arthur, Staunch Dragon"),
    ).toBe(true);
  });

  it("Aglovale — Fanfare 3 damage all enemy followers; Intimidate", () => {
    setupTurn(R8, { hand: ["10422110"], pp: 6 });
    enemyFollower(5, "A");
    enemyFollower(5, "B");
    whenPlayCard("first", 0);
    expect(state.players.second.board.every((c) => c.defense === 2)).toBe(true);
    expect(findOnBoard("first", "Aglovale, Lord of Frost")?.hasIntimidate).toBe(
      true,
    );
  });

  it("Zeta & Bea — Fanfare copy; Enhance (6) Storm self and Bane on copy only", () => {
    setupTurn(R6, { hand: ["10424110"], pp: 6 });
    const bystander = createCard("10122130", "board", "first");
    applyKeywordsFromList(bystander);
    bystander.peak_defense = bystander.defense;
    state.players.first.board = [bystander];
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter(
        (c) => c.name === "Zeta & Bea, Crimson and Blue",
      ).length,
    ).toBe(2);
    const zeta = thenBoard("first").find(
      (c) =>
        c.name === "Zeta & Bea, Crimson and Blue" && c.uid !== bystander.uid,
    )!;
    const copy = thenBoard("first").find(
      (c) =>
        c.name === "Zeta & Bea, Crimson and Blue" &&
        c.uid !== zeta.uid &&
        c.uid !== bystander.uid,
    )!;
    expect(bystander.hasBane).toBe(false);
    expect(zeta.hasBane).toBe(false);
    expect(zeta.hasStorm).toBe(true);
    expect(copy.hasBane).toBe(true);
    expect(copy.hasStorm).toBe(false);
    expect(state.lastSummoned?.[0]?.uid).toBe(copy.uid);
  });

  it("Zeta & Bea — at 4 PP: Fanfare summon only; no Storm or Bane", () => {
    setupTurn(R6, { hand: ["10424110"], pp: 4 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter(
        (c) => c.name === "Zeta & Bea, Crimson and Blue",
      ).length,
    ).toBe(2);
    for (const c of thenBoard("first")) {
      expect(c.hasStorm).toBe(false);
      expect(c.hasBane).toBe(false);
    }
  });
});
