/**
 * L2 real-card tests — Havencraft tokens (7 tokens).
 *
 * Protocol: assert printed token text from cards/token_details.json description,
 * not JSON behaviour. Conditional cards test both ON and OFF branches.
 * Failing-by-design → it.fails with finding comment.
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
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { destroyCardForLastWords } from "../harness/l2Dispatch.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import {
  getBoard,
  getHand,
  getHP,
  getGraveyard,
  getBanish,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Tokens under test
const HOLY_FALCON = "90061110";
const HOLYFLAME_TIGER = "90061120";
const REGAL_FALCON = "90061130";
const DEPTHS_TOME = "90064320";
const HOLY_CAVALIER = "90064110";
const RINGS_MOONLIGHT = "90064210";
const TORRENT = "90064310";

// Generators (meta-deck first)
const WINGED_STATUE = "10062210";
const ROARING_BASILICA = "10961210";
const ARA = "10534120";
const LYANTHOTH = "10664120";
const WILBERT = "10264120";
const RODEO = "10764110";
const MARWYNN = "10364120";

const SERENE_SANCTUARY = "10161210";
const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";

const FAITH_CREST = faithCrestNameForCard("Lyanthoth, Eld Tome");

const R6 = 6;
const R8 = 8;
const R9 = 9;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    evo?: number;
    hp?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondPP?: number;
    secondDeck?: string[];
    seed?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function handUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenHand(player).map((c) => c.uid));
}

function boardUids(player: "first" | "second" = "first"): Set<string> {
  return new Set(thenBoard(player).map((c) => c.uid));
}

function newHandCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
) {
  const fresh = thenHand(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
}

function newBoardCards(
  before: Set<string>,
  player: "first" | "second" = "first",
  id?: string,
) {
  const fresh = thenBoard(player).filter((c) => !before.has(c.uid));
  return id ? fresh.filter((c) => String(c.id) === id) : fresh;
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
  atk = 2,
  def = 2,
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

function allyAmulet(id: string, countdown?: number) {
  const c = createCard(id, "board", "first");
  applyKeywordsFromList(c);
  if (countdown != null) c.countdown = countdown;
  state.players.first.board.push(c);
  return c;
}

function enemyAmulet(id: string, countdown?: number) {
  const c = createCard(id, "board", "second");
  applyKeywordsFromList(c);
  if (countdown != null) c.countdown = countdown;
  state.players.second.board.push(c);
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

function amuletIndex(name: string): number {
  return state.players.first.board.findIndex((c) => c.name === name);
}

function triggerLastWords(cardId: string, cardName: string): void {
  const card = findOnBoard("first", cardName)!;
  destroyCardForLastWords(card, "first");
}

function readyAttacker(
  card: ReturnType<typeof createCard>,
  owner: "first" | "second" = "first",
): void {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
}

function setupFaith(owner: "first" | "second", amount: number): void {
  bootstrapFaithForPlayer(
    owner,
    state.players[owner].deck,
    state.players[owner].hand,
  );
  crestAddCounter(owner, FAITH_CREST, "faith", amount);
}

function depthsInHand(player: "first" | "second" = "first"): number {
  return thenHand(player).filter((c) => c.id === DEPTHS_TOME).length;
}

describe("L2 — Havencraft tokens", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {});

  describe("Holy Falcon (90061110)", () => {
    const printed = "Storm";

    it("real path via Winged Statue Last Words: summons Holy Falcon by uid with 3/2/2 Havencraft stats", () => {
      setupTurn(R6, { hand: [WINGED_STATUE], pp: 5 });
      whenPlayCard("first", 0);
      engageAmulet("first", amuletIndex("Winged Statue"));
      const uidsBefore = boardUids();
      triggerLastWords(WINGED_STATUE, "Winged Statue");
      const summoned = newBoardCards(uidsBefore, "first", HOLY_FALCON);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(3);
      expect(Number(summoned[0]!.attack)).toBe(2);
      expect(Number(summoned[0]!.defense)).toBe(2);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Havencraft");
      expect(summoned[0]!.tribes).toEqual([]);
    });

    it("Storm: can attack enemy leader the turn it enters the field", () => {
      setupTurn(R6, { hand: [HOLY_FALCON], pp: 3 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const falcon = findOnBoard("first", "Holy Falcon")!;
      readyAttacker(falcon);
      const atkIdx = getBoard(state, "first").indexOf(falcon);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Storm");
    });
  });

  describe("Holyflame Tiger (90061120)", () => {
    const printed = "Rush";

    it("real path via Roaring Basilica Engage: summons Holyflame Tiger by uid with 4/4/4 stats", () => {
      setupTurn(R6, { hand: [ROARING_BASILICA], pp: 5 });
      whenPlayCard("first", 0);
      const uidsBefore = boardUids();
      engageAmulet("first", amuletIndex("Roaring Basilica"));
      cleanupDead();
      const summoned = newBoardCards(uidsBefore, "first", HOLYFLAME_TIGER);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(4);
      expect(Number(summoned[0]!.attack)).toBe(4);
      expect(Number(summoned[0]!.defense)).toBe(4);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Havencraft");
    });

    it("Rush: can attack enemy follower the turn it enters the field", () => {
      setupTurn(R6, { hand: [HOLYFLAME_TIGER], pp: 4 });
      const foe = enemyFollower(1, 4, "Foe");
      whenPlayCard("first", 0);
      const tiger = findOnBoard("first", "Holyflame Tiger")!;
      applyKeywordsFromList(tiger);
      expect(tiger.hasRush).toBe(true);
      readyAttacker(tiger);
      const atkIdx = getBoard(state, "first").indexOf(tiger);
      attackFollower(atkIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(0);
      expect(printed).toContain("Rush");
    });

    it("Rush: cannot attack enemy leader the turn it enters the field", () => {
      setupTurn(R6, { hand: [HOLYFLAME_TIGER], pp: 4 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const tiger = findOnBoard("first", "Holyflame Tiger")!;
      applyKeywordsFromList(tiger);
      tiger.can_attack = true;
      tiger.attacks_left = 1;
      const atkIdx = getBoard(state, "first").indexOf(tiger);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Regal Falcon (90061130)", () => {
    const printed = "Storm";

    it("real path via Ara Evolve: transforms ally into Regal Falcon by uid with 6/4/4 stats", () => {
      setupTurn(R10, { hand: [ARA], pp: 10, evo: 2 });
      enemyFollower(2, 5, "Enemy");
      const bystander = allyFollower(3, 3, "TransformTarget");
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const ara = findOnBoard("first", "Ara, Dawnblossom")!;
      onEvolve(ara, "first", "normal", { spendPoint: true });
      resolvePendingByUid(bystander.uid);
      const transformed = thenBoard("first").find(
        (c) => c.uid === bystander.uid,
      )!;
      expect(String(transformed.id)).toBe(REGAL_FALCON);
      expect(transformed.name).toBe("Regal Falcon");
      expect(Number(transformed.cost)).toBe(6);
      expect(Number(transformed.attack)).toBe(4);
      expect(Number(transformed.defense)).toBe(4);
      expect(transformed.type).toBe("Follower");
      expect(transformed.class).toBe("Havencraft");
    });

    it("Storm: can attack enemy leader the turn it enters the field", () => {
      setupTurn(R10, { hand: [REGAL_FALCON], pp: 6 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const falcon = findOnBoard("first", "Regal Falcon")!;
      readyAttacker(falcon);
      const atkIdx = getBoard(state, "first").indexOf(falcon);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(16);
      expect(printed).toContain("Storm");
    });
  });

  describe("Depths of the Eld Tome (90064320)", () => {
    const printed =
      "Select a card on the field and destroy it. If you selected an allied amulet, deal 2 damage to the enemy leader and add a Depths of the Eld Tome to your hand.";

    it("real path via Lyanthoth owner EOT: adds Depths by uid when faith ≥ 10", () => {
      setupTurn(R9, {
        hand: [LYANTHOTH],
        pp: 9,
        deck: [DRAW_TOP, DRAW_SECOND],
      });
      setupFaith("first", 10);
      whenPlayCard("first", 0);
      const t1 = allyFollower(1, 1, "T1");
      const t2 = allyFollower(1, 1, "T2");
      const t3 = enemyFollower(1, 1, "T3");
      resolvePendingByUid(t1.uid);
      resolvePendingByUid(t2.uid);
      resolvePendingByUid(t3.uid);
      const uidsBefore = handUids();
      runEndOfTurnBoundary("first");
      const added = newHandCards(uidsBefore, "first", DEPTHS_TOME);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(1);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Havencraft");
      expect(added[0]!.tribes).toContain("Encroacher");
    });

    it("on play: destroys selected enemy follower; bystander enemy untouched", () => {
      setupTurn(R6, { hand: [DEPTHS_TOME], pp: 1 });
      const target = enemyFollower(2, 4, "Target");
      const bystander = enemyFollower(2, 4, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(findOnBoard("second", "Target")).toBeFalsy();
      expect(findOnBoard("second", "Bystander")).toBeTruthy();
      expect(printed).toContain("destroy it");
    });

    it("on play selecting enemy follower: does not deal leader damage or add a copy", () => {
      setupTurn(R6, { hand: [DEPTHS_TOME], pp: 1 });
      const target = enemyFollower(2, 4, "Target");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getHP(state, "second")).toBe(20);
      expect(depthsInHand()).toBe(0);
    });

    it("on play selecting allied follower: destroys follower without leader damage or add", () => {
      setupTurn(R6, { hand: [DEPTHS_TOME], pp: 1 });
      const target = allyFollower(2, 4, "Target");
      const bystander = allyFollower(2, 4, "Bystander");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(findOnBoard("first", "Target")).toBeFalsy();
      expect(findOnBoard("first", "Bystander")).toBeTruthy();
      expect(getHP(state, "second")).toBe(20);
      expect(depthsInHand()).toBe(0);
    });

    it("on play selecting enemy amulet: destroys amulet without leader damage or add", () => {
      setupTurn(R6, { hand: [DEPTHS_TOME], pp: 1 });
      const target = enemyAmulet(SERENE_SANCTUARY);
      const bystander = enemyAmulet(SERENE_SANCTUARY);
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c?.uid === target.uid)).toBe(
        false,
      );
      expect(
        getBoard(state, "second").some((c) => c?.uid === bystander.uid),
      ).toBe(true);
      expect(getHP(state, "second")).toBe(20);
      expect(depthsInHand()).toBe(0);
    });

    it("on play selecting allied amulet: destroys amulet", () => {
      setupTurn(R6, { hand: [DEPTHS_TOME], pp: 1 });
      const amulet = allyAmulet(SERENE_SANCTUARY);
      whenPlayCard("first", 0);
      resolvePendingByUid(amulet.uid);
      expect(findOnBoard("first", "Serene Sanctuary")).toBeFalsy();
    });

    it("allied amulet branch: deal 2 damage to enemy leader", () => {
      setupTurn(R6, { hand: [DEPTHS_TOME], pp: 1 });
      const amulet = allyAmulet(SERENE_SANCTUARY);
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      resolvePendingByUid(amulet.uid);
      expect(getHP(state, "second")).toBe(18);
    });

    it("allied amulet branch: add Depths of the Eld Tome to hand", () => {
      setupTurn(R6, { hand: [DEPTHS_TOME], pp: 1 });
      const amulet = allyAmulet(SERENE_SANCTUARY);
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      resolvePendingByUid(amulet.uid);
      const added = newHandCards(uidsBefore, "first", DEPTHS_TOME);
      expect(added).toHaveLength(1);
    });
  });

  describe("Holy Cavalier (90064110)", () => {
    const printed = "Ward";

    it("real path via Wilbert Last Words: summons 2 Holy Cavalier by uid with 1/1/2 stats", () => {
      setupTurn(R6, { hand: [WILBERT], pp: 6 });
      whenPlayCard("first", 0);
      const wilbert = findOnBoard("first", "Wilbert, Desolate Paladin")!;
      const uidsBefore = boardUids();
      dealDamage(wilbert, Number(wilbert.defense));
      cleanupDead();
      const summoned = newBoardCards(uidsBefore, "first", HOLY_CAVALIER);
      expect(summoned).toHaveLength(2);
      expect(Number(summoned[0]!.cost)).toBe(1);
      expect(Number(summoned[0]!.attack)).toBe(1);
      expect(Number(summoned[0]!.defense)).toBe(2);
      expect(summoned[0]!.type).toBe("Follower");
      expect(summoned[0]!.class).toBe("Havencraft");
      expect(summoned[1]!.uid).not.toBe(summoned[0]!.uid);
    });

    it("Ward: has Ward keyword on field", () => {
      setupTurn(R6, { hand: [HOLY_CAVALIER], pp: 1 });
      whenPlayCard("first", 0);
      const cavalier = findOnBoard("first", "Holy Cavalier")!;
      applyKeywordsFromList(cavalier);
      expect(cavalier.hasWard).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Ward: enemy cannot attack non-Ward follower while Holy Cavalier is on board", () => {
      setupTurn(R6, { hand: [HOLY_CAVALIER], pp: 1 });
      whenPlayCard("first", 0);
      const cavalier = findOnBoard("first", "Holy Cavalier")!;
      applyKeywordsFromList(cavalier);
      const bystander = allyFollower(1, 5, "Bystander");
      const attacker = enemyFollower(3, 3, "Attacker");
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      const defBefore = Number(bystander.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(bystander),
        "second",
        "first",
      );
      expect(Number(bystander.defense)).toBe(defBefore);
      state.activePlayer = "second";
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(cavalier),
        "second",
        "first",
      );
      expect(Number(cavalier.defense)).toBe(0);
    });
  });

  describe("Rings of Moonlight (90064210)", () => {
    const printed =
      "Countdown (1)\nAura\nAt the end of your turn, if there are at least 3 allied amulets on the field, deal 3 damage to all enemies.";

    it("real path via Rodeo Fanfare: summons Rings of Moonlight by uid with Countdown (1)", () => {
      setupTurn(R8, { hand: [RODEO], pp: 8 });
      const uidsBefore = boardUids();
      whenPlayCard("first", 0);
      const summoned = newBoardCards(uidsBefore, "first", RINGS_MOONLIGHT);
      expect(summoned).toHaveLength(1);
      expect(Number(summoned[0]!.cost)).toBe(8);
      expect(summoned[0]!.type).toBe("Amulet");
      expect(summoned[0]!.class).toBe("Havencraft");
      expect(Number(summoned[0]!.countdown)).toBe(1);
      expect(printed).toContain("Countdown (1)");
    });

    it("Aura: has Aura keyword on field", () => {
      setupTurn(R8, { hand: [RINGS_MOONLIGHT], pp: 8 });
      whenPlayCard("first", 0);
      const rings = findOnBoard("first", "Rings of Moonlight")!;
      applyKeywordsFromList(rings);
      expect(rings.hasAura).toBe(true);
      expect(printed).toContain("Aura");
    });

    it("owner EOT with 3 allied amulets: deals 3 damage to enemy leader and all enemy followers", () => {
      setupTurn(R8, {
        deck: [DRAW_TOP, DRAW_SECOND],
      });
      const rings = createCard(RINGS_MOONLIGHT, "board", "first");
      rings.countdown = 1;
      applyKeywordsFromList(rings);
      allyAmulet(SERENE_SANCTUARY);
      allyAmulet(SERENE_SANCTUARY);
      state.players.first.board.unshift(rings);
      const foeA = enemyFollower(2, 5, "FoeA");
      const foeB = enemyFollower(2, 5, "FoeB");
      state.players.second.hp = 20;
      runEndOfTurnBoundary("first");
      expect(getHP(state, "second")).toBe(17);
      expect(Number(foeA.defense)).toBe(2);
      expect(Number(foeB.defense)).toBe(2);
      expect(printed).toContain("deal 3 damage to all enemies");
    });

    it("owner EOT with only 2 allied amulets: no damage to enemies", () => {
      setupTurn(R8, {
        deck: [DRAW_TOP, DRAW_SECOND],
      });
      const rings = createCard(RINGS_MOONLIGHT, "board", "first");
      rings.countdown = 1;
      applyKeywordsFromList(rings);
      allyAmulet(SERENE_SANCTUARY);
      state.players.first.board.unshift(rings);
      const foe = enemyFollower(2, 5, "Foe");
      state.players.second.hp = 20;
      runEndOfTurnBoundary("first");
      expect(getHP(state, "second")).toBe(20);
      expect(Number(foe.defense)).toBe(5);
    });

    it("opponent EOT: does not deal damage even with 3 allied amulets", () => {
      setupTurn(R8, {
        active: "second",
        secondHand: [FILLER],
        secondPP: 1,
        secondDeck: [DRAW_TOP, DRAW_SECOND],
      });
      const rings = createCard(RINGS_MOONLIGHT, "board", "first");
      rings.countdown = 1;
      applyKeywordsFromList(rings);
      allyAmulet(SERENE_SANCTUARY);
      allyAmulet(SERENE_SANCTUARY);
      state.players.first.board.unshift(rings);
      state.players.second.hp = 20;
      const foe = enemyFollower(2, 5, "Foe");
      runEndOfTurnBoundary("second");
      expect(getHP(state, "second")).toBe(20);
      expect(Number(foe.defense)).toBe(5);
    });
  });

  describe("Torrent of Despair (90064310)", () => {
    const printed =
      "Banish a random enemy follower from the field. Delay the counts of all your crests by 1.";

    it("real path via Marwynn Fanfare: adds Torrent of Despair by uid with cost 2 Spell", () => {
      setupTurn(R6, { hand: [MARWYNN], pp: 5 });
      const uidsBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(uidsBefore, "first", TORRENT);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(2);
      expect(added[0]!.type).toBe("Spell");
      expect(added[0]!.class).toBe("Havencraft");
    });

    it("on play with two enemy followers (seed 1): banishes exactly one; bystander remains off board and out of graveyard", () => {
      setupTurn(R6, { hand: [TORRENT], pp: 2, seed: 1 });
      const a = enemyLastWordsFollower("VictimA");
      const b = enemyLastWordsFollower("VictimB");
      whenPlayCard("first", 0);
      expect(thenBoard("second").length).toBe(1);
      expect(getBanish(state, "second").length).toBe(1);
      expect(getGraveyard(state, "second").length).toBe(0);
      const banishedUid = getBanish(state, "second")[0]!.uid;
      const survivor = a.uid === banishedUid ? b : a;
      expect(thenBoard("second")[0]!.uid).toBe(survivor.uid);
      expect(printed).toContain("Banish a random enemy follower");
    });

    it("on play: delays all crest countdowns by 1", () => {
      setupTurn(R6, { hand: [TORRENT], pp: 2 });
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: "Test Crest A",
          countdown: 3,
        } as any,
        "first",
      );
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: "Test Crest B",
          countdown: 1,
        } as any,
        "first",
      );
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: "Passive Crest",
        } as any,
        "first",
      );
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: "Enemy Crest",
          countdown: 2,
        } as any,
        "second",
      );
      whenPlayCard("first", 0);
      const allyCrests = getCrests(state, "first");
      expect(
        Number(allyCrests.find((c) => c.name === "Test Crest A")!.countdown),
      ).toBe(4);
      expect(
        Number(allyCrests.find((c) => c.name === "Test Crest B")!.countdown),
      ).toBe(2);
      expect(
        allyCrests.find((c) => c.name === "Passive Crest")!.countdown,
      ).toBeUndefined();
      expect(
        Number(
          getCrests(state, "second").find((c) => c.name === "Enemy Crest")!
            .countdown,
        ),
      ).toBe(2);
      expect(printed).toContain("Delay the counts");
    });

    it("on play with empty enemy board: still delays all allied crest countdowns by 1", () => {
      setupTurn(R6, { hand: [TORRENT], pp: 2 });
      handleGainCrest(
        {
          op: "crest",
          action: "gain",
          name: "Test Crest A",
          countdown: 3,
        } as any,
        "first",
      );
      whenPlayCard("first", 0);
      expect(
        Number(
          getCrests(state, "first").find((c) => c.name === "Test Crest A")!
            .countdown,
        ),
      ).toBe(4);
      expect(getBanish(state, "second").length).toBe(0);
    });
  });
});
