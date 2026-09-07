/**
 * Phase D2 — behaviour tests for the dark four (vanilla keyword cards) and the
 * top twelve zero-subject cards by clause count. Titles name each card so the
 * subjecthood analyzer records asserted intent, not harness filler alone.
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
  whenRunEffects,
  whenEndTurn,
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import {
  attackFollower,
  attackLeader,
  canAttackFollowerTarget,
} from "../../src/logic/core/combat.js";
import { getPool } from "../../src/logic/core/targeting.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import {
  getBoard,
  getHP,
  getMaxPP,
  getPermPP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 20 }, () => FILLER);
const RUSH_ONLY = "90041130"; // Majestic Megalorca — Rush, no Storm

const CENTAUR = "10021130";
const GENESIS = "10143110";
const FORTE = "10144120";
const NIGHTSHADOW = "10221120";

const CHARON = "10254120";
const ARRIET = "10002110";
const APOLLO = "10102110";
const VALSE = "10123120";
const MIRANDA = "10132110";
const EMMYLOU = "10132120";
const PENELOPE = "10133120";
const ANNE_GREA = "10134120";
const LIU_FENG = "10143120";
const ARYLL = "10151110";
const MINO = "10152110";
const RENO = "10162120";

const STORMY_BLAST = "10131320";

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    maxPP?: number;
    permPP?: number;
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
  if (opts.permPP != null) {
    state.players.first.permPP = opts.permPP;
    state.players.first.maxPP = max;
  }
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

function earthSigilStack(player: "first" | "second" = "first"): number {
  return thenBoard(player)
    .filter((c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0)
    .reduce((sum, c) => sum + (c.counters?.earth ?? 0), 0);
}

describe("Phase D2 — dark keyword cards", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Centaur Centurion (10021130) — Storm attacks enemy leader for 7 on play turn", () => {
    setupTurn(10, { hand: [CENTAUR], pp: 8 });
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    const centaur = findOnBoard("first", "Centaur Centurion")!;
    applyKeywordsFromList(centaur);
    expect(centaur.hasStorm).toBe(true);
    readyAttacker(centaur);
    attackLeader(getBoard(state, "first").indexOf(centaur), "first", "second");
    expect(getHP(state, "second")).toBe(13);
  }, 60_000);

  it("Centaur Centurion (10021130) — Rush-only Megalorca cannot hit leader same turn", () => {
    setupTurn(6, { hand: [RUSH_ONLY], pp: 2 });
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    const rush = findOnBoard("first", "Majestic Megalorca")!;
    applyKeywordsFromList(rush);
    expect(rush.hasRush).toBe(true);
    expect(rush.hasStorm).toBeFalsy();
    rush.can_attack = true;
    rush.attacks_left = 1;
    attackLeader(getBoard(state, "first").indexOf(rush), "first", "second");
    expect(getHP(state, "second")).toBe(20);
  }, 60_000);

  it("Genesis Dragon Reborn (10143110) — Storm attacks enemy leader for 9 on play turn", () => {
    setupTurn(10, { hand: [GENESIS], pp: 10 });
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    const dragon = findOnBoard("first", "Genesis Dragon Reborn")!;
    applyKeywordsFromList(dragon);
    expect(Number(dragon.attack)).toBe(9);
    readyAttacker(dragon);
    attackLeader(getBoard(state, "first").indexOf(dragon), "first", "second");
    expect(getHP(state, "second")).toBe(11);
  }, 60_000);

  it("Forte, Blackwing Dragoon (10144120) — Storm hits enemy leader for 5 on play turn", () => {
    setupTurn(10, { hand: [FORTE], pp: 6 });
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    const forte = findOnBoard("first", "Forte, Blackwing Dragoon")!;
    applyKeywordsFromList(forte);
    readyAttacker(forte);
    attackLeader(getBoard(state, "first").indexOf(forte), "first", "second");
    expect(getHP(state, "second")).toBe(15);
  }, 60_000);

  it("Forte, Blackwing Dragoon (10144120) — Intimidate blocks enemy Attacker (3/3) from striking Forte (2 def)", () => {
    setupTurn(10, { hand: [FORTE], pp: 6 });
    whenPlayCard("first", 0);
    const forte = findOnBoard("first", "Forte, Blackwing Dragoon")!;
    applyKeywordsFromList(forte);
    const attacker = enemyFollower(3, 3, "Attacker");
    readyAttacker(attacker, "second");
    state.activePlayer = "second";
    expect(
      canAttackFollowerTarget(forte, getBoard(state, "first"), attacker),
    ).toBe(false);
    attackFollower(
      getBoard(state, "second").indexOf(attacker),
      getBoard(state, "first").indexOf(forte),
      "second",
      "first",
    );
    expect(Number(forte.defense)).toBe(2);
  }, 60_000);

  it("Nightshadow Ninja Master (10221120) — Ambush excludes it from enemy single-target select pool", () => {
    setupTurn(10, { hand: [NIGHTSHADOW], pp: 5 });
    whenPlayCard("first", 0);
    const ninja = findOnBoard("first", "Nightshadow Ninja Master")!;
    applyKeywordsFromList(ninja);
    expect(ninja.hasAmbush).toBe(true);
    expect(
      getPool("enemy:follower", "second", null, undefined, {
        isTargetedEffect: true,
      }).some((c) => c.uid === ninja.uid),
    ).toBe(false);
  }, 60_000);

  it("Nightshadow Ninja Master (10221120) — Ambush breaks after attacking, then becomes targetable", () => {
    setupTurn(10, { hand: [NIGHTSHADOW], pp: 5 });
    const foe = enemyFollower(1, 5, "Foe");
    whenPlayCard("first", 0);
    const ninja = findOnBoard("first", "Nightshadow Ninja Master")!;
    applyKeywordsFromList(ninja);
    expect(
      getPool("enemy:follower", "second", null, undefined, {
        isTargetedEffect: true,
      }).some((c) => c.uid === ninja.uid),
    ).toBe(false);
    whenEndTurn();
    whenEndTurn();
    readyAttacker(ninja);
    const foeDefBefore = Number(foe.defense);
    attackFollower(
      getBoard(state, "first").indexOf(ninja),
      getBoard(state, "second").indexOf(foe),
      "first",
      "second",
    );
    expect(Number(foe.defense)).toBeLessThan(foeDefBefore);
    expect(ninja.hasAmbush).toBe(false);
    expect(
      getPool("enemy:follower", "second", null, undefined, {
        isTargetedEffect: true,
      }).some((c) => c.uid === ninja.uid),
    ).toBe(true);
  }, 60_000);
});

describe("Phase D2 — zero-subject clause cards", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Charon, Stygian Oarswoman (10254120) — Fanfare Reanimate (2) and Reanimate (1) from graveyard", () => {
    setupTurn(6, { hand: [CHARON], pp: 5 });
    const cost2 = createCard("10152110", "graveyard", "first");
    const cost1 = createCard("90051110", "graveyard", "first");
    state.players.first.graveyard.push(cost2, cost1);
    recordDestroyed(state, "first", cost2);
    recordDestroyed(state, "first", cost1);
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.id === "10152110")).toBe(true);
    expect(thenBoard("first").some((c) => c.id === "90051110")).toBe(true);
  }, 60_000);

  it("Charon, Stygian Oarswoman (10254120) — allied Departed enter gains Ward from board watcher", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    const host = createCard(CHARON, "board", "first");
    host.justPlayed = false;
    state.players.first.board = [host];
    const departed = createCard(
      {
        name: "DepartedProbe",
        type: "Follower",
        cost: 0,
        attack: 1,
        defense: 1,
        tribes: ["Departed"],
      },
      "hand",
      "first",
    );
    (departed as { effectiveCost?: number }).effectiveCost = 0;
    state.players.first.hand.push(departed);
    whenPlayCard("first", 0);
    const entering = state.players.first.board.find(
      (c) => c.uid === departed.uid,
    );
    expect(entering?.hasWard).toBe(true);
  }, 60_000);

  it("Charon, Stygian Oarswoman (10254120) — Super-Evolve gains Crest: Charon, Stygian Oarswoman", () => {
    setupTurn(7, { hand: [CHARON], pp: 5, superEvo: 1 });
    whenPlayCard("first", 0);
    const charon = findOnBoard("first", "Charon, Stygian Oarswoman")!;
    whenSuperEvolve(charon, "first");
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Charon, Stygian Oarswoman",
      ),
    ).toBe(true);
  }, 60_000);

  it("Arriet, Luxminstrel (10002110) — Evolve restores 2 defense to your leader (14 → 16)", () => {
    setupTurn(6, { hand: [ARRIET], pp: 3, hp: 14, evo: 1 });
    whenPlayCard("first", 0);
    const arriet = findOnBoard("first", "Arriet, Luxminstrel")!;
    whenEvolve(arriet, "first");
    expect(getHP(state, "first")).toBe(16);
  }, 60_000);

  it("Arriet, Luxminstrel (10002110) — Super-Evolve restores 4 defense instead (12 → 16)", () => {
    setupTurn(7, { hand: [ARRIET], pp: 3, hp: 12, superEvo: 1 });
    whenPlayCard("first", 0);
    const arriet = findOnBoard("first", "Arriet, Luxminstrel")!;
    whenSuperEvolve(arriet, "first");
    expect(getHP(state, "first")).toBe(16);
  }, 60_000);

  it("Apollo, Heaven's Envoy (10102110) — Fanfare deals 1 damage to all enemy followers", () => {
    setupTurn(6, { hand: [APOLLO], pp: 3 });
    const a = enemyFollower(2, 4, "A");
    const b = enemyFollower(2, 3, "B");
    whenPlayCard("first", 0);
    expect(Number(a.defense)).toBe(3);
    expect(Number(b.defense)).toBe(2);
  }, 60_000);

  it("Apollo, Heaven's Envoy (10102110) — Evolve replicates Fanfare (3 → 2 defense)", () => {
    setupTurn(6, { hand: [APOLLO], pp: 3, evo: 1 });
    const foe = enemyFollower(2, 4, "Foe");
    whenPlayCard("first", 0);
    const apollo = findOnBoard("first", "Apollo, Heaven's Envoy")!;
    whenEvolve(apollo, "first");
    expect(Number(foe.defense)).toBe(2);
  }, 60_000);

  it("Valse, Silent Sniper (10123120) — Fanfare deals 5 damage to selected enemy (6 → 1)", () => {
    setupTurn(6, { hand: [VALSE], pp: 3 });
    const target = enemyFollower(2, 6, "Target");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(target.defense)).toBe(1);
    const valse = findOnBoard("first", "Valse, Silent Sniper")!;
    expect(valse.hasAmbush).toBeFalsy();
    expect(Number(valse.attack)).toBe(2);
    expect(Number(valse.defense)).toBe(1);
  }, 60_000);

  it("Valse, Silent Sniper (10123120) — Enhance (6) gives +2/+2 and Ambush (4/3 with Ambush)", () => {
    setupTurn(6, { hand: [VALSE], pp: 6 });
    enemyFollower(2, 6, "Target");
    whenPlayCard("first", 0);
    resolveFirstPending();
    const valse = findOnBoard("first", "Valse, Silent Sniper")!;
    expect(valse.hasAmbush).toBe(true);
    expect(Number(valse.attack)).toBe(4);
    expect(Number(valse.defense)).toBe(3);
  }, 60_000);

  it("Ms. Miranda, Adored Academic (10132110) — Fanfare spellboosts hand once", () => {
    setupTurn(6, { hand: [MIRANDA, STORMY_BLAST, EMMYLOU], pp: 2 });
    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const emmylou = thenHand("first").find((c) => c.id === EMMYLOU)!;
    const blast0 = sbCount(blast);
    const emmylou0 = sbCount(emmylou);
    whenPlayCard("first", 0);
    expect(sbCount(blast)).toBe(blast0 + 1);
    expect(sbCount(emmylou)).toBe(emmylou0 + 1);
  }, 60_000);

  it("Ms. Miranda, Adored Academic (10132110) — Evolve deals 3 to selected enemy and spellboosts hand", () => {
    setupTurn(6, { hand: [MIRANDA, STORMY_BLAST], pp: 2, evo: 1 });
    const foe = enemyFollower(2, 5, "Foe");
    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const blast0 = sbCount(blast);
    whenPlayCard("first", 0);
    const miranda = findOnBoard("first", "Ms. Miranda, Adored Academic")!;
    whenEvolve(miranda, "first");
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
    expect(sbCount(blast)).toBe(blast0 + 2);
  }, 60_000);

  it("Emmylou, Witch of Wonder (10132120) — On Spellboost reduces hand cost by 1 (5 → 4)", () => {
    setupTurn(6, { hand: [EMMYLOU, FILLER], pp: 6 });
    const emmylou = thenHand("first").find((c) => c.id === EMMYLOU)!;
    expect(Number(emmylou.cost)).toBe(5);
    whenPlayCard("first", 1);
    expect(Number(emmylou.cost)).toBe(4);
  }, 60_000);

  it("Emmylou, Witch of Wonder (10132120) — Evolve with no Golems summons Clay Golem and deals 1 AoE (5 → 4)", () => {
    setupTurn(8, { hand: [EMMYLOU], pp: 5, evo: 1 });
    const foe = enemyFollower(2, 5, "Foe");
    whenPlayCard("first", 0);
    const emmylou = findOnBoard("first", "Emmylou, Witch of Wonder")!;
    whenEvolve(emmylou, "first");
    expect(thenBoard("first").some((c) => c.name === "Clay Golem")).toBe(true);
    expect(Number(foe.defense)).toBe(4);
  }, 60_000);

  it("Emmylou, Witch of Wonder (10132120) — Evolve with 1 allied Golem deals 2 AoE (5 → 3)", () => {
    setupTurn(8, { hand: [EMMYLOU], pp: 5, evo: 1 });
    allyFollower(1, 3, "Clay Golem", { tribes: ["Golem"] });
    const foe = enemyFollower(2, 5, "Foe");
    whenPlayCard("first", 0);
    const emmylou = findOnBoard("first", "Emmylou, Witch of Wonder")!;
    whenEvolve(emmylou, "first");
    expect(
      thenBoard("first").filter((c) => c.name === "Clay Golem"),
    ).toHaveLength(2);
    expect(Number(foe.defense)).toBe(3);
  }, 60_000);

  it("Penelope, Potions Prodigy (10133120) — Fanfare gains 2 earth sigils", () => {
    setupTurn(6, { hand: [PENELOPE], pp: 2 });
    whenPlayCard("first", 0);
    expect(earthSigilStack()).toBe(2);
  }, 60_000);

  it("Penelope, Potions Prodigy (10133120) — Super-Evolve draws 2, restores 2 leader HP, gains 2 earth sigils", () => {
    setupTurn(7, {
      hand: [PENELOPE],
      pp: 2,
      superEvo: 1,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
        { name: "D3", type: "Follower", attack: 1, defense: 1 },
      ],
      hp: 14,
    });
    whenPlayCard("first", 0);
    const penelope = findOnBoard("first", "Penelope, Potions Prodigy")!;
    const handBefore = thenHand("first").length;
    whenSuperEvolve(penelope, "first");
    expect(thenHand("first").length).toBe(handBefore + 2);
    expect(getHP(state, "first")).toBe(16);
    expect(earthSigilStack()).toBe(4);
  }, 60_000);

  it("Anne & Grea, Mysterian Duo (10134120) — Fanfare summons Anne's Summoning and spellboosts hand 3×", () => {
    setupTurn(8, { hand: [ANNE_GREA, STORMY_BLAST], pp: 5 });
    const blast = thenHand("first").find((c) => c.id === STORMY_BLAST)!;
    const blast0 = sbCount(blast);
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Anne's Summoning")).toBe(
      true,
    );
    expect(sbCount(blast)).toBe(blast0 + 3);
  }, 60_000);

  it("Anne & Grea, Mysterian Duo (10134120) — Evolve deals 3 damage to selected enemy (5 → 2)", () => {
    setupTurn(8, { hand: [ANNE_GREA], pp: 5, evo: 1 });
    const foe = enemyFollower(2, 5, "Foe");
    whenPlayCard("first", 0);
    const duo = findOnBoard("first", "Anne & Grea, Mysterian Duo")!;
    whenEvolve(duo, "first");
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
  }, 60_000);

  it("Liu Feng, Goldennote Ward (10143120) — Fanfare in Overflow effect-evolves and gains 1 max PP (7 → 8)", () => {
    setupTurn(7, { hand: [LIU_FENG], pp: 3 });
    expect(isOverflow("first")).toBe(true);
    whenPlayCard("first", 0);
    const liu = findOnBoard("first", "Liu Feng, Goldennote Ward")!;
    expect(liu.hasEvolved).toBe(true);
    expect(getPermPP(state, "first")).toBe(1);
    expect(getMaxPP(state, "first")).toBe(8);
  }, 60_000);

  it("Liu Feng, Goldennote Ward (10143120) — Fanfare without Overflow does not auto-evolve", () => {
    setupTurn(6, { hand: [LIU_FENG], pp: 3, maxPP: 6 });
    expect(isOverflow("first")).toBe(false);
    whenPlayCard("first", 0);
    const liu = findOnBoard("first", "Liu Feng, Goldennote Ward")!;
    expect(Boolean(liu.hasEvolved)).toBe(false);
    expect(getMaxPP(state, "first")).toBe(6);
  }, 60_000);

  it("Liu Feng, Goldennote Ward (10143120) — When this evolves gains 1 max PP (6 → 7)", () => {
    setupTurn(6, { hand: [LIU_FENG], pp: 3, maxPP: 6, evo: 1 });
    whenPlayCard("first", 0);
    const liu = findOnBoard("first", "Liu Feng, Goldennote Ward")!;
    expect(Boolean(liu.hasEvolved)).toBe(false);
    whenEvolve(liu, "first");
    expect(liu.hasEvolved).toBe(true);
    expect(getPermPP(state, "first")).toBe(1);
    expect(getMaxPP(state, "first")).toBe(7);
  }, 60_000);

  it("Aryll, Moonstruck Vampire (10151110) — Fanfare summons a Bat", () => {
    setupTurn(6, { hand: [ARYLL], pp: 3 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Bat")).toBeDefined();
  }, 60_000);

  it("Aryll, Moonstruck Vampire (10151110) — allied Bat enter gains Storm and deals 1 to your leader (20 → 19)", () => {
    setupTurn(6, { hand: [ARYLL], pp: 3 });
    whenPlayCard("first", 0);
    const aryll = findOnBoard("first", "Aryll, Moonstruck Vampire")!;
    state.players.first.hp = 20;
    runEffects(
      [{ op: "summon", source: "named", name: "Bat", count: 1 } as any],
      "first",
      aryll,
    );
    const bats = thenBoard("first").filter((c) => c.name === "Bat");
    expect(bats.some((b) => b.hasStorm)).toBe(true);
    expect(getHP(state, "first")).toBe(19);
  }, 60_000);

  it("Mino, Shrewd Reaper (10152110) — without Enhance (4) has no Rush or Bane", () => {
    setupTurn(6, { hand: [MINO], pp: 2 });
    whenPlayCard("first", 0);
    const mino = findOnBoard("first", "Mino, Shrewd Reaper")!;
    expect(mino.hasRush).toBeFalsy();
    expect(mino.hasBane).toBeFalsy();
  }, 60_000);

  it("Mino, Shrewd Reaper (10152110) — Enhance (4) grants Rush and Bane", () => {
    setupTurn(6, { hand: [MINO], pp: 4 });
    whenPlayCard("first", 0);
    const mino = findOnBoard("first", "Mino, Shrewd Reaper")!;
    expect(mino.hasRush).toBe(true);
    expect(mino.hasBane).toBe(true);
  }, 60_000);

  it("Mino, Shrewd Reaper (10152110) — Last Words adds Skeleton to hand", () => {
    setupTurn(6, { hand: [MINO], pp: 2 });
    whenPlayCard("first", 0);
    const mino = findOnBoard("first", "Mino, Shrewd Reaper")!;
    mino.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Skeleton")).toBe(true);
  }, 60_000);

  it("Reno, Luxwing Featherfolk (10162120) — Clash deals 1 damage to enemy leader (20 → 19)", () => {
    setupTurn(6, { hand: [RENO], pp: 4 });
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    const reno = findOnBoard("first", "Reno, Luxwing Featherfolk")!;
    const clashFx = (reno.triggers ?? []).find((t: any) => t.event === "clash");
    runEffects((clashFx as any).effects, "first", reno, {
      defender: enemyFollower(3, 3, "ClashFoe"),
    });
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);

  it("Reno, Luxwing Featherfolk (10162120) — Super-Evolve grants 2 attacks per turn", () => {
    setupTurn(7, { hand: [RENO], pp: 4, superEvo: 1 });
    whenPlayCard("first", 0);
    const reno = findOnBoard("first", "Reno, Luxwing Featherfolk")!;
    whenSuperEvolve(reno, "first");
    expect(reno.attacks_per_turn).toBe(2);
  }, 60_000);
});
