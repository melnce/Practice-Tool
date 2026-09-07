/**
 * Phase D3a — behaviour tests for twelve multi-clause zero-subject cards.
 * Titles name each card (with id) so the subjecthood analyzer records intent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
  findOnBoard,
  whenEndTurn,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { getPool } from "../../src/logic/core/targeting.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import {
  getBoard,
  getHP,
  getPP,
  getCrests,
  getHand,
  getDeck,
  getPlaysThisTurn,
} from "../../src/core/playerHelpers.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 20 }, () => FILLER);
const STORMY_BLAST = "10131320";
const APOLLO = "10102110";
const STEELCLAD_KNIGHT = "90021120";

const SALEFA = "10164130";
const RUKINA = "10172110";
const CYNTHIA = "10213110";
const RACKHIR = "10222120";
const ROSE = "10223110";
const BERGENT = "10232110";
const OWEN = "10233110";
const LILANTHIM = "10234110";
const NEPTUNE = "10243110";
const IZUDIA = "10314120";
const SINCiro = "10324110";
const WOLFRAUD = "10514110";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[] | Array<Record<string, unknown>>;
    pp?: number;
    maxPP?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    seed?: number;
  } = {},
) {
  const max = opts.maxPP ?? Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  b = b.withFirstDeck(opts.deck ?? PAD_DECK).withSecondDeck(PAD_DECK);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
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

function readyAttacker(
  card: CardInstance,
  owner: "first" | "second" = "first",
): void {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
}

function sbCount(card: CardInstance): number {
  return (
    card.keywordState?.spellboostCount ??
    (card as { spellboostCount?: number }).spellboostCount ??
    0
  );
}

function placeEarthSigils(
  n: number,
  player: "first" | "second" = "first",
): void {
  const sediment = createCard(
    { name: "Magic Sediment", type: "Amulet", cost: 1 },
    "board",
    player,
  );
  sediment.counters = { earth: n };
  state.players[player].board.push(sediment);
}

describe("Phase D3a — multi-clause zero-subject cards", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Salefa, Guardian of Water (10164130) — Fanfare restores 3 defense to your leader (15 → 18)", () => {
    setupTurn(6, { hand: [SALEFA], pp: 5, hp: 15 });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(18);
  }, 60_000);

  it("Salefa, Guardian of Water (10164130) — Ward on play", () => {
    setupTurn(6, { hand: [SALEFA], pp: 5 });
    whenPlayCard("first", 0);
    const salefa = findOnBoard("first", "Salefa, Guardian of Water")!;
    applyKeywordsFromList(salefa);
    expect(salefa.hasWard).toBe(true);
  }, 60_000);

  it("Salefa, Guardian of Water (10164130) — Evolve deals 3 damage to all enemy followers (5 → 2)", () => {
    setupTurn(6, { hand: [SALEFA], pp: 5, evo: 1 });
    const foe = enemyFollower(2, 5, "Foe");
    whenPlayCard("first", 0);
    const salefa = findOnBoard("first", "Salefa, Guardian of Water")!;
    whenEvolve(salefa, "first");
    expect(Number(foe.defense)).toBe(2);
  }, 60_000);

  it("Rukina, Resistance Leader (10172110) — Fanfare adds Gear of Ambition and Gear of Remembrance", () => {
    setupTurn(6, { hand: [RUKINA], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Gear of Ambition")).toBe(
      true,
    );
    expect(
      thenHand("first").some((c) => c.name === "Gear of Remembrance"),
    ).toBe(true);
  }, 60_000);

  it("Rukina, Resistance Leader (10172110) — Evolve summons a Striker Artifact", () => {
    setupTurn(6, { hand: [RUKINA], pp: 4, evo: 1 });
    whenPlayCard("first", 0);
    const rukina = findOnBoard("first", "Rukina, Resistance Leader")!;
    whenEvolve(rukina, "first");
    expect(thenBoard("first").some((c) => c.name === "Striker Artifact")).toBe(
      true,
    );
  }, 60_000);

  it("Cynthia, Chivalrous Elf (10213110) — Fanfare summons 2 copies of Fairy", () => {
    setupTurn(6, { hand: [CYNTHIA], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Fairy")).toHaveLength(
      2,
    );
  }, 60_000);

  it("Cynthia, Chivalrous Elf (10213110) — Evolve gives allied Pixie followers +1/+0 (1 → 2 ATK)", () => {
    setupTurn(6, { hand: [CYNTHIA], pp: 4, evo: 1 });
    whenPlayCard("first", 0);
    const cynthia = findOnBoard("first", "Cynthia, Chivalrous Elf")!;
    const fairy = thenBoard("first").find((c) => c.name === "Fairy")!;
    const fairyAtk0 = Number(fairy!.attack);
    whenEvolve(cynthia, "first");
    expect(Number(fairy!.attack)).toBe(fairyAtk0 + 1);
  }, 60_000);

  it("Cynthia, Chivalrous Elf (10213110) — Evolve does not buff non-Pixie allies (2 → 2 ATK)", () => {
    setupTurn(6, { hand: [CYNTHIA], pp: 4, evo: 1 });
    const grunt = allyFollower(2, 2, "Grunt");
    whenPlayCard("first", 0);
    const cynthia = findOnBoard("first", "Cynthia, Chivalrous Elf")!;
    whenEvolve(cynthia, "first");
    expect(Number(grunt.attack)).toBe(2);
  }, 60_000);

  it("Rackhir, Ordinary Knight (10222120) — Fanfare draws a spell", () => {
    setupTurn(6, {
      hand: [RACKHIR],
      pp: 4,
      deck: [{ name: "SpellTop", type: "Spell", cost: 2 }],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.type === "Spell")).toBe(true);
  }, 60_000);

  it("Rackhir, Ordinary Knight (10222120) — Evolve recovers 2 play points (0 → 2)", () => {
    setupTurn(6, { hand: [RACKHIR], pp: 4, evo: 1 });
    whenPlayCard("first", 0);
    const rack = findOnBoard("first", "Rackhir, Ordinary Knight")!;
    const ppBefore = getPP(state, "first");
    expect(ppBefore).toBe(0);
    whenEvolve(rack, "first");
    expect(getPP(state, "first")).toBe(ppBefore + 2);
  }, 60_000);

  it("Rackhir, Ordinary Knight (10222120) — control: Apollo Evolve does not recover play points", () => {
    setupTurn(6, { hand: [APOLLO], pp: 3, evo: 1 });
    whenPlayCard("first", 0);
    const apollo = findOnBoard("first", "Apollo, Heaven's Envoy")!;
    const ppBefore = getPP(state, "first");
    expect(ppBefore).toBe(0);
    whenEvolve(apollo, "first");
    expect(getPP(state, "first")).toBe(ppBefore);
  }, 60_000);

  it("Rosé, Princess Knight (10223110) — Enhance (5) draws Swordcraft follower ≤2 and sets cost to 0", () => {
    setupTurn(6, {
      hand: [ROSE],
      pp: 5,
      deck: [STEELCLAD_KNIGHT, ...PAD_DECK],
    });
    whenPlayCard("first", 0);
    const drawn = thenHand("first").find((c) => c.id === STEELCLAD_KNIGHT);
    expect(drawn).toBeDefined();
    expect(getEffectiveCost(drawn!)).toBe(0);
  }, 60_000);

  it("Rosé, Princess Knight (10223110) — without Enhance (5) does not draw from deck", () => {
    setupTurn(6, {
      hand: [ROSE],
      pp: 3,
      deck: [STEELCLAD_KNIGHT, ...PAD_DECK],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === STEELCLAD_KNIGHT)).toBe(
      false,
    );
    expect(findOnBoard("first", "Rosé, Princess Knight")).toBeDefined();
  }, 60_000);

  it("Rosé, Princess Knight (10223110) — Rush on play", () => {
    setupTurn(6, { hand: [ROSE], pp: 3 });
    whenPlayCard("first", 0);
    const rose = findOnBoard("first", "Rosé, Princess Knight")!;
    applyKeywordsFromList(rose);
    expect(rose.hasRush).toBe(true);
  }, 60_000);

  it("Rosé, Princess Knight (10223110) — Follower Strike destroys damaged opposing follower", () => {
    setupTurn(6, { hand: [ROSE], pp: 3 });
    const foe = enemyFollower(1, 1, "Chipped");
    foe.peak_defense = 2;
    whenPlayCard("first", 0);
    const rose = findOnBoard("first", "Rosé, Princess Knight")!;
    readyAttacker(rose);
    attackFollower(0, 0, "first", "second");
    expect(getBoard(state, "second")).toHaveLength(0);
  }, 60_000);

  it("Rosé, Princess Knight (10223110) — Follower Strike spares full-health opposing follower (5 → 5)", () => {
    setupTurn(6, { hand: [ROSE], pp: 3 });
    const foe = enemyFollower(1, 5, "Healthy");
    whenPlayCard("first", 0);
    const rose = findOnBoard("first", "Rosé, Princess Knight")!;
    rose.attack = 0;
    state.players.first.board[0]!.attack = 0;
    readyAttacker(rose);
    attackFollower(0, 0, "first", "second");
    expect(findOnBoard("second", "Healthy")).toBeDefined();
    expect(Number(foe.defense)).toBe(5);
  }, 60_000);

  it("Bergent, Rejected Artes (10232110) — Fanfare summons 2 copies of Onion Patch", () => {
    setupTurn(8, { hand: [BERGENT], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Onion Patch"),
    ).toHaveLength(2);
  }, 60_000);

  it("Bergent, Rejected Artes (10232110) — Evolve gains Crest: Bergent, Rejected Artes", () => {
    setupTurn(8, { hand: [BERGENT], pp: 5, evo: 1 });
    whenPlayCard("first", 0);
    const bergent = findOnBoard("first", "Bergent, Rejected Artes")!;
    whenEvolve(bergent, "first");
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Bergent, Rejected Artes",
      ),
    ).toBe(true);
  }, 60_000);

  it("Owen, Mysterian Swordsman (10233110) — Ward on play", () => {
    setupTurn(6, { hand: [OWEN], pp: 3 });
    whenPlayCard("first", 0);
    const owen = findOnBoard("first", "Owen, Mysterian Swordsman")!;
    applyKeywordsFromList(owen);
    expect(owen.hasWard).toBe(true);
  }, 60_000);

  it("Owen, Mysterian Swordsman (10233110) — Clash spellboosts hand once", () => {
    setupTurn(6, { hand: [OWEN, STORMY_BLAST], pp: 3 });
    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const sb0 = sbCount(blast);
    whenPlayCard("first", 0);
    whenEndTurn();
    whenEndTurn();
    const owen = findOnBoard("first", "Owen, Mysterian Swordsman")!;
    enemyFollower(1, 5, "ClashFoe");
    readyAttacker(owen);
    attackFollower(
      getBoard(state, "first").indexOf(owen),
      0,
      "first",
      "second",
    );
    expect(sbCount(blast)).toBe(sb0 + 1);
  }, 60_000);

  it("Owen, Mysterian Swordsman (10233110) — control: ally attack without Clash does not spellboost hand", () => {
    setupTurn(6, { hand: [OWEN, STORMY_BLAST], pp: 3 });
    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const sb0 = sbCount(blast);
    whenPlayCard("first", 0);
    whenEndTurn();
    whenEndTurn();
    const striker = allyFollower(2, 2, "Striker");
    enemyFollower(1, 5, "Target");
    readyAttacker(striker);
    attackFollower(
      getBoard(state, "first").indexOf(striker),
      0,
      "first",
      "second",
    );
    expect(sbCount(blast)).toBe(sb0);
  }, 60_000);

  it("Owen, Mysterian Swordsman (10233110) — Evolve draws 2 followers", () => {
    setupTurn(6, {
      hand: [OWEN],
      pp: 3,
      evo: 1,
      deck: [
        { name: "F1", type: "Follower", cost: 1, attack: 1, defense: 1 },
        { name: "F2", type: "Follower", cost: 1, attack: 1, defense: 1 },
        ...PAD_DECK,
      ],
    });
    whenPlayCard("first", 0);
    const owen = findOnBoard("first", "Owen, Mysterian Swordsman")!;
    whenEvolve(owen, "first");
    expect(thenHand("first").some((c) => c.name === "F1")).toBe(true);
    expect(thenHand("first").some((c) => c.name === "F2")).toBe(true);
  }, 60_000);

  it("Lilanthim, Anathema of Edacity (10234110) — Aura excludes from enemy single-target select pool", () => {
    setupTurn(10, { hand: [LILANTHIM], pp: 8 });
    whenPlayCard("first", 0);
    const lil = findOnBoard("first", "Lilanthim, Anathema of Edacity")!;
    applyKeywordsFromList(lil);
    expect(lil.hasAura).toBe(true);
    expect(
      getPool("enemy:follower", "second", null, undefined, {
        isTargetedEffect: true,
      }).some((c) => c.uid === lil.uid),
    ).toBe(false);
  }, 60_000);

  it("Lilanthim, Anathema of Edacity (10234110) — Last Words with Earth Rite (2) summons a copy", () => {
    setupTurn(10, { hand: [LILANTHIM], pp: 8 });
    placeEarthSigils(2);
    whenPlayCard("first", 0);
    const lil = findOnBoard("first", "Lilanthim, Anathema of Edacity")!;
    lil.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter(
        (c) => c.name === "Lilanthim, Anathema of Edacity",
      ),
    ).toHaveLength(1);
  }, 60_000);

  it("Lilanthim, Anathema of Edacity (10234110) — Last Words without Earth Rite (2) summons nothing", () => {
    setupTurn(10, { hand: [LILANTHIM], pp: 8 });
    whenPlayCard("first", 0);
    const lil = findOnBoard("first", "Lilanthim, Anathema of Edacity")!;
    lil.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter(
        (c) => c.name === "Lilanthim, Anathema of Edacity",
      ),
    ).toHaveLength(0);
  }, 60_000);

  it("Lilanthim, Anathema of Edacity (10234110) — Super-Evolve destroys 2 selected enemy followers", () => {
    setupTurn(7, { hand: [LILANTHIM], pp: 8, superEvo: 1 });
    const a = enemyFollower(2, 4, "A");
    const b = enemyFollower(2, 4, "B");
    whenPlayCard("first", 0);
    const lil = findOnBoard("first", "Lilanthim, Anathema of Edacity")!;
    whenSuperEvolve(lil, "first");
    resolvePendingByUid(a.uid);
    resolvePendingByUid(b.uid);
    expect(getBoard(state, "second")).toHaveLength(0);
  }, 60_000);

  it("Neptune, Arbiter of Tides (10243110) — Fanfare gains Crest and summons 2 Majestic Megalorca", () => {
    setupTurn(7, { hand: [NEPTUNE], pp: 7 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Neptune")),
    ).toBe(true);
    expect(
      thenBoard("first").filter((c) => c.name === "Majestic Megalorca"),
    ).toHaveLength(2);
  }, 60_000);

  it("Neptune, Arbiter of Tides (10243110) — Ward on play", () => {
    setupTurn(7, { hand: [NEPTUNE], pp: 7 });
    whenPlayCard("first", 0);
    const nep = findOnBoard("first", "Neptune, Arbiter of Tides")!;
    applyKeywordsFromList(nep);
    expect(nep.hasWard).toBe(true);
  }, 60_000);

  it("Neptune, Arbiter of Tides (10243110) — Super-Evolve summons 2 more Majestic Megalorca (2 → 4)", () => {
    setupTurn(7, { hand: [NEPTUNE], pp: 7, superEvo: 1 });
    whenPlayCard("first", 0);
    const nep = findOnBoard("first", "Neptune, Arbiter of Tides")!;
    whenSuperEvolve(nep, "first");
    expect(
      thenBoard("first").filter((c) => c.name === "Majestic Megalorca"),
    ).toHaveLength(4);
  }, 60_000);

  it("Izudia, Annihilation Manifest (10314120) — Fanfare gives selected enemy follower -0/-6 (8 → 2)", () => {
    setupTurn(10, { hand: [IZUDIA], pp: 8 });
    const foe = enemyFollower(2, 8, "Target");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
  }, 60_000);

  it("Izudia, Annihilation Manifest (10314120) — Evolve adds Annihilating Onslaught to hand", () => {
    setupTurn(10, { hand: [IZUDIA], pp: 8, evo: 1 });
    whenPlayCard("first", 0);
    const iz = findOnBoard("first", "Izudia, Annihilation Manifest")!;
    whenEvolve(iz, "first");
    expect(
      thenHand("first").some((c) => c.name === "Annihilating Onslaught"),
    ).toBe(true);
  }, 60_000);

  it("Sinciro, Heir to Usurpation (10324110) — Fanfare with 0 fused names deals 0 (leader 20 → 20)", () => {
    setupTurn(8, { hand: [SINCiro], pp: 6 });
    enemyFollower(2, 5, "Foe");
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(20);
    expect(Number(state.players.second.board[0]!.defense)).toBe(5);
  }, 60_000);

  it("Sinciro, Heir to Usurpation (10324110) — Fanfare with 2 fused names deals 2 to all enemies (20 → 18, 5 → 3)", () => {
    setupTurn(8, { hand: [SINCiro], pp: 6 });
    enemyFollower(2, 5, "Foe");
    state.players.second.hp = 20;
    const sinc = getHand(state, "first")[0]!;
    (sinc as { _fusedLootNames?: string[] })._fusedLootNames = [
      "Gilded Blade",
      "Gilded Boots",
    ];
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(18);
    expect(Number(state.players.second.board[0]!.defense)).toBe(3);
  }, 60_000);

  it("Sinciro, Heir to Usurpation (10324110) — Super-Evolve replicates Fanfare (leader 18 → 16)", () => {
    setupTurn(7, { hand: [SINCiro], pp: 6, superEvo: 1 });
    state.players.second.hp = 20;
    const sinc = getHand(state, "first")[0]!;
    (sinc as { _fusedLootNames?: string[] })._fusedLootNames = [
      "Gilded Blade",
      "Gilded Boots",
    ];
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(18);
    const onBoard = findOnBoard("first", "Sinciro, Heir to Usurpation")!;
    whenSuperEvolve(onBoard, "first");
    expect(getHP(state, "second")).toBe(16);
  }, 60_000);

  it("Wolfraud, Skybound Hanged Man (10514110) — Fanfare +1/+1 at Combo 1 (1/1 → 2/2)", () => {
    setupTurn(6, { hand: [WOLFRAUD], pp: 2 });
    whenPlayCard("first", 0);
    const wolf = findOnBoard("first", "Wolfraud, Skybound Hanged Man")!;
    expect(getPlaysThisTurn(state, "first")).toBe(1);
    expect(Number(wolf.attack)).toBe(2);
    expect(Number(wolf.defense)).toBe(2);
  }, 60_000);

  it("Wolfraud, Skybound Hanged Man (10514110) — Fanfare +3/+3 at Combo 3 (1/1 → 4/4)", () => {
    setupTurn(6, { hand: [FILLER, FILLER, WOLFRAUD], pp: 6 });
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const wolf = findOnBoard("first", "Wolfraud, Skybound Hanged Man")!;
    expect(getPlaysThisTurn(state, "first")).toBe(3);
    expect(Number(wolf.attack)).toBe(4);
    expect(Number(wolf.defense)).toBe(4);
  }, 60_000);

  it("Wolfraud, Skybound Hanged Man (10514110) — Evolve discards hand and adds 5 exact copies from enemy deck", () => {
    setupTurn(9, { hand: [WOLFRAUD], pp: 2, evo: 1 });
    state.players.second.deck = [
      createCard(
        { name: "EDeckA", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "deck",
        "second",
      ),
      createCard(
        { name: "EDeckB", type: "Follower", cost: 3, attack: 3, defense: 3 },
        "deck",
        "second",
      ),
      createCard(
        { name: "EDeckC", type: "Spell", cost: 1, attack: 0, defense: 0 },
        "deck",
        "second",
      ),
      createCard(
        { name: "EDeckD", type: "Amulet", cost: 1, attack: 0, defense: 0 },
        "deck",
        "second",
      ),
      createCard(
        { name: "EDeckE", type: "Follower", cost: 3, attack: 3, defense: 3 },
        "deck",
        "second",
      ),
      createCard(
        { name: "EDeckF", type: "Follower", cost: 4, attack: 4, defense: 4 },
        "deck",
        "second",
      ),
    ];
    state.players.second.deck[0].buffs = { attack: 3, defense: 3 };
    state.players.second.deck[0].attack = 8;
    state.players.second.deck[0].defense = 8;
    state.players.first.hand.push(
      createCard(
        { name: "Junk", type: "Follower", cost: 1, attack: 1, defense: 1 },
        "hand",
        "first",
      ),
    );
    whenPlayCard("first", 0);
    const wolf = findOnBoard("first", "Wolfraud, Skybound Hanged Man")!;
    whenEvolve(wolf, "first");
    const hand = getHand(state, "first");
    expect(hand.length).toBe(5);
    for (const c of hand) {
      expect(c.name.startsWith("EDeck")).toBe(true);
    }
    expect(getDeck(state, "second").length).toBe(6);
    const exact = hand.find((c) => c.name === "EDeckA");
    if (exact) {
      expect(Number(exact.attack)).toBe(8);
      expect(exact.buffs?.attack).toBe(3);
    }
  }, 60_000);
});
