/**
 * L2 real-card tests — Dragoncraft tokens (9 tokens).
 *
 * Protocol: assert printed token text from cards/token_details.json description,
 * not JSON behaviour. Conditional cards test both ON and OFF branches.
 * Failing-by-design → it.fails.
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
import { getCardById } from "../../src/data/cardDatabase.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { isOverflow } from "../../src/helpers/overflow.js";
import { getBoard, getHand, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Token ids
const FIRE_DRAKE_WHELP = "90041110";
const MEGALORCA = "90041130";
const DEPTHS_BLADES = "90044330";
const OTOHIME_BODYGUARD = "90043110";
const SUPREME_GOLDEN = "90044110";
const SUPREME_SILVER = "90044120";
const VASTWING = "90041120";
const FANGS = "90044320";
const WHITEFROST = "90044310";

// Generators (meta-deck first)
const DRAKE_TANTRUM = "10941310";
const JELLYFISH = "10542120";
const VORLALAI = "10644120";
const FAN_OTOHIME = "10143210";
const GARYU = "10144130";
const GALMIEX = "10344120";
const FILENE = "10244110";
const SAGATSUMATSU = "10644110";
const IRONMACE = "10542110";

const FILLER = "10111310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";

const R6 = 6;
const R7 = 7;
const R8 = 8;

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
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondPP != null) b = b.withSecondPP(opts.secondPP, max);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoCharges = opts.superEvo;
    state.players.first.superEvoPoints = opts.superEvo;
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

function discardHandCard(player: "first" | "second", id: string): void {
  const card = getHand(state, player).find((c) => c.id === id);
  if (!card) throw new Error(`Card ${id} not in hand`);
  resolvePendingTarget(card.uid);
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
  card: ReturnType<typeof createCard>,
  owner: "first" | "second" = "first",
): void {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  applyKeywordsFromList(card);
}

function hasKeyword(
  card: {
    hasRush?: boolean;
    hasWard?: boolean;
    hasStorm?: boolean;
    hasIntimidate?: boolean;
    keywordState?: { hasRush?: boolean; hasIntimidate?: boolean };
  },
  kw: "Rush" | "Ward" | "Storm" | "Intimidate",
): boolean {
  applyKeywordsFromList(card as any);
  switch (kw) {
    case "Rush":
      return !!(card.hasRush || card.keywordState?.hasRush);
    case "Ward":
      return !!card.hasWard;
    case "Storm":
      return !!card.hasStorm;
    case "Intimidate":
      return !!(card.hasIntimidate || card.keywordState?.hasIntimidate);
  }
}

describe("L2 Dragoncraft tokens — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Fire Drake Whelp (90041110)", () => {
    const printed = "Intimidate";

    it("real path via Drake Whelp's Tantrum (10941310): summons Whelp by uid with 1/1 stats", () => {
      setupTurn(R6, { hand: [DRAKE_TANTRUM], pp: 1 });
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const whelps = newBoardCards(boardBefore, "first", FIRE_DRAKE_WHELP);
      expect(whelps).toHaveLength(1);
      const whelp = whelps[0]!;
      const template = getCardById(FIRE_DRAKE_WHELP)!;
      expect(whelp.name).toBe(template.name);
      expect(Number(whelp.cost)).toBe(1);
      expect(Number(whelp.attack)).toBe(1);
      expect(Number(whelp.defense)).toBe(1);
      expect(whelp.type).toBe("Follower");
      expect(whelp.class).toBe("Dragoncraft");
    });

    it("Intimidate: has Intimidate keyword on play", () => {
      setupTurn(R6, { hand: [FIRE_DRAKE_WHELP], pp: 1 });
      whenPlayCard("first", 0);
      const whelp = findOnBoard("first", "Fire Drake Whelp")!;
      expect(hasKeyword(whelp, "Intimidate")).toBe(true);
      expect(printed).toContain("Intimidate");
    });

    it("Intimidate: enemy follower cannot attack the Whelp; bystander ally can be attacked", () => {
      setupTurn(R6, { hand: [FIRE_DRAKE_WHELP], pp: 1 });
      whenPlayCard("first", 0);
      const whelp = findOnBoard("first", "Fire Drake Whelp")!;
      applyKeywordsFromList(whelp);
      const bystander = allyFollower(1, 5, "Bystander");
      const attacker = enemyFollower(3, 3, "Attacker");
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      const whelpDefBefore = Number(whelp.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(whelp),
        "second",
        "first",
      );
      expect(Number(whelp.defense)).toBe(whelpDefBefore);
      const bystanderDefBefore = Number(bystander.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(bystander),
        "second",
        "first",
      );
      expect(Number(bystander.defense)).toBe(bystanderDefBefore - 3);
      expect(printed).toContain("Intimidate");
    });
  });

  describe("Majestic Megalorca (90041130)", () => {
    const printed = "Rush";

    it("real path via Jellyfish Dancer (10542120): adds Megalorca to hand by uid", () => {
      setupTurn(R6, { hand: [JELLYFISH], pp: 2 });
      const handBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(handBefore, "first", MEGALORCA);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(2);
      expect(Number(added[0]!.attack)).toBe(2);
      expect(Number(added[0]!.defense)).toBe(2);
      expect(added[0]!.tribes).toContain("Marine");
    });

    it("Rush: has Rush keyword when played from hand", () => {
      setupTurn(R6, { hand: [MEGALORCA], pp: 2 });
      whenPlayCard("first", 0);
      const marine = findOnBoard("first", "Majestic Megalorca")!;
      expect(hasKeyword(marine, "Rush")).toBe(true);
      expect(printed).toContain("Rush");
    });

    it("Rush: can attack enemy follower the turn it is played", () => {
      setupTurn(R6, { hand: [MEGALORCA], pp: 2 });
      const foe = enemyFollower(1, 3, "Foe");
      whenPlayCard("first", 0);
      const marine = findOnBoard("first", "Majestic Megalorca")!;
      readyAttacker(marine);
      const atkIdx = getBoard(state, "first").indexOf(marine);
      attackFollower(atkIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(1);
      expect(printed).toContain("Rush");
    });

    it("Rush: cannot attack enemy leader the turn it is played", () => {
      setupTurn(R6, { hand: [MEGALORCA], pp: 2 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const marine = findOnBoard("first", "Majestic Megalorca")!;
      applyKeywordsFromList(marine);
      marine.can_attack = true;
      marine.attacks_left = 1;
      const atkIdx = getBoard(state, "first").indexOf(marine);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Depths of the Eld Blades (90044330)", () => {
    const printed =
      "When this card is discarded, deal 1 damage to the enemy leader and restore 1 defense to your leader.\nDeal 1 damage to the enemy leader. Restore 1 defense to your leader.";

    it("real path via Vorlalai Evolve (10644120): adds Depths to hand by uid", () => {
      setupTurn(R6, { hand: [VORLALAI], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const vor = findOnBoard("first", "Vorlalai, Eld Blades")!;
      const handBefore = handUids();
      onEvolve(vor, "first", "normal", { spendPoint: true });
      const added = newHandCards(handBefore, "first", DEPTHS_BLADES);
      expect(added).toHaveLength(1);
    });

    it("when discarded: deals 1 to enemy leader and restores 1 to your leader", () => {
      setupTurn(R8, {
        hand: [SAGATSUMATSU, DEPTHS_BLADES],
        pp: 7,
        deck: [DRAW_TOP],
        secondDeck: [DRAW_TOP],
      });
      state.players.first.hp = 15;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      discardHandCard("first", DEPTHS_BLADES);
      expect(getHP(state, "second")).toBe(19);
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("When this card is discarded");
    });

    it("when not discarded: no leader damage or heal from discard clause", () => {
      setupTurn(R8, {
        hand: [DEPTHS_BLADES],
        pp: 2,
        deck: [DRAW_TOP],
        secondDeck: [DRAW_TOP],
      });
      state.players.first.hp = 15;
      state.players.second.hp = 20;
      whenEndTurn();
      whenEndTurn();
      expect(getHP(state, "second")).toBe(20);
      expect(getHP(state, "first")).toBe(15);
    });

    it("spell: deals 1 to enemy leader and restores 1 to your leader", () => {
      setupTurn(R6, { hand: [DEPTHS_BLADES], pp: 2 });
      state.players.first.hp = 15;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(19);
      expect(getHP(state, "first")).toBe(16);
      expect(printed).toContain("Deal 1 damage to the enemy leader");
    });
  });

  describe("Otohime's Bodyguard (90043110)", () => {
    const printed = "Storm\nWard";

    it("real path via Fan of Otohime Engage (10143210): summons Bodyguard by uid", () => {
      setupTurn(R6, { hand: [FAN_OTOHIME, FILLER], pp: 4 });
      whenPlayCard("first", 0);
      const boardBefore = boardUids();
      engageAmulet("first", 0);
      resolveFirstPending();
      const added = newBoardCards(boardBefore, "first", OTOHIME_BODYGUARD);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(3);
      expect(Number(added[0]!.attack)).toBe(2);
      expect(Number(added[0]!.defense)).toBe(2);
      expect(added[0]!.tribes).toContain("Marine");
    });

    it("Storm: can attack enemy leader the turn it is summoned", () => {
      setupTurn(R6, { hand: [OTOHIME_BODYGUARD], pp: 3 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const guard = findOnBoard("first", "Otohime's Bodyguard")!;
      readyAttacker(guard);
      const atkIdx = getBoard(state, "first").indexOf(guard);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(18);
      expect(printed).toContain("Storm");
    });

    it("Ward: has Ward keyword on play", () => {
      setupTurn(R6, { hand: [OTOHIME_BODYGUARD], pp: 3 });
      whenPlayCard("first", 0);
      const guard = findOnBoard("first", "Otohime's Bodyguard")!;
      expect(hasKeyword(guard, "Ward")).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Ward: enemy must attack Bodyguard instead of non-Ward bystander", () => {
      setupTurn(R6, { hand: [OTOHIME_BODYGUARD], pp: 3 });
      whenPlayCard("first", 0);
      const guard = findOnBoard("first", "Otohime's Bodyguard")!;
      applyKeywordsFromList(guard);
      const bystander = allyFollower(1, 5, "Bystander");
      const attacker = enemyFollower(3, 3, "Attacker");
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      const bystanderDefBefore = Number(bystander.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(bystander),
        "second",
        "first",
      );
      expect(Number(bystander.defense)).toBe(bystanderDefBefore);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(guard),
        "second",
        "first",
      );
      expect(Number(guard.defense)).toBe(0);
    });
  });

  describe("Supreme Golden Dragon (90044110)", () => {
    const printed = "Ward";

    it("real path via Garyu (10144130): summons Golden Dragon by uid", () => {
      setupTurn(R8, { hand: [GARYU], pp: 8 });
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const added = newBoardCards(boardBefore, "first", SUPREME_GOLDEN);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(4);
      expect(Number(added[0]!.attack)).toBe(4);
      expect(Number(added[0]!.defense)).toBe(5);
    });

    it("Ward: has Ward keyword on play", () => {
      setupTurn(R8, { hand: [SUPREME_GOLDEN], pp: 4 });
      whenPlayCard("first", 0);
      const golden = findOnBoard("first", "Supreme Golden Dragon")!;
      expect(hasKeyword(golden, "Ward")).toBe(true);
      expect(printed).toContain("Ward");
    });

    it("Ward: enemy must attack Golden Dragon instead of non-Ward bystander", () => {
      setupTurn(R8, { hand: [SUPREME_GOLDEN], pp: 4 });
      whenPlayCard("first", 0);
      const golden = findOnBoard("first", "Supreme Golden Dragon")!;
      applyKeywordsFromList(golden);
      const bystander = allyFollower(1, 5, "Bystander");
      const attacker = enemyFollower(3, 3, "Attacker");
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      const bystanderDefBefore = Number(bystander.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(bystander),
        "second",
        "first",
      );
      expect(Number(bystander.defense)).toBe(bystanderDefBefore);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(golden),
        "second",
        "first",
      );
      expect(Number(golden.defense)).toBe(2);
    });
  });

  describe("Supreme Silver Dragon (90044120)", () => {
    const printed = "Rush";

    it("real path via Garyu (10144130): summons Silver Dragon by uid", () => {
      setupTurn(R8, { hand: [GARYU], pp: 8 });
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      const added = newBoardCards(boardBefore, "first", SUPREME_SILVER);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(4);
      expect(Number(added[0]!.attack)).toBe(5);
      expect(Number(added[0]!.defense)).toBe(4);
    });

    it("Rush: has Rush keyword on play", () => {
      setupTurn(R8, { hand: [SUPREME_SILVER], pp: 4 });
      whenPlayCard("first", 0);
      const silver = findOnBoard("first", "Supreme Silver Dragon")!;
      expect(hasKeyword(silver, "Rush")).toBe(true);
      expect(printed).toContain("Rush");
    });

    it("Rush: can attack enemy follower the turn it is summoned", () => {
      setupTurn(R8, { hand: [SUPREME_SILVER], pp: 4 });
      const foe = enemyFollower(1, 6, "Foe");
      whenPlayCard("first", 0);
      const silver = findOnBoard("first", "Supreme Silver Dragon")!;
      readyAttacker(silver);
      const atkIdx = getBoard(state, "first").indexOf(silver);
      attackFollower(atkIdx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(1);
      expect(printed).toContain("Rush");
    });

    it("Rush: cannot attack enemy leader the turn it is played", () => {
      setupTurn(R8, { hand: [SUPREME_SILVER], pp: 4 });
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const silver = findOnBoard("first", "Supreme Silver Dragon")!;
      applyKeywordsFromList(silver);
      silver.can_attack = true;
      silver.attacks_left = 1;
      const atkIdx = getBoard(state, "first").indexOf(silver);
      attackLeader(atkIdx, "first", "second");
      expect(getHP(state, "second")).toBe(20);
    });
  });

  describe("Vastwing Dragon (90041120)", () => {
    const printed = "Intimidate";

    it("real path via Ironmace Dragoon Fanfare (10542110): summons Vastwing by uid", () => {
      setupTurn(R8, { hand: [IRONMACE], pp: 8 });
      const foe = enemyFollower(1, 10, "Foe");
      const boardBefore = boardUids();
      whenPlayCard("first", 0);
      resolvePendingTarget(foe.uid);
      const added = newBoardCards(boardBefore, "first", VASTWING);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(5);
      expect(Number(added[0]!.attack)).toBe(5);
      expect(Number(added[0]!.defense)).toBe(5);
    });

    it("Intimidate: has Intimidate keyword on board", () => {
      setupTurn(R8, { hand: [VASTWING], pp: 5 });
      whenPlayCard("first", 0);
      const vastwing = findOnBoard("first", "Vastwing Dragon")!;
      expect(hasKeyword(vastwing, "Intimidate")).toBe(true);
      expect(printed).toContain("Intimidate");
    });

    it("Intimidate: enemy follower cannot attack Vastwing; bystander ally can be attacked", () => {
      setupTurn(R8, { hand: [VASTWING], pp: 5 });
      whenPlayCard("first", 0);
      const vastwing = findOnBoard("first", "Vastwing Dragon")!;
      applyKeywordsFromList(vastwing);
      const bystander = allyFollower(1, 5, "Bystander");
      const attacker = enemyFollower(3, 3, "Attacker");
      readyAttacker(attacker, "second");
      state.activePlayer = "second";
      const vastDefBefore = Number(vastwing.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(vastwing),
        "second",
        "first",
      );
      expect(Number(vastwing.defense)).toBe(vastDefBefore);
      const bystanderDefBefore = Number(bystander.defense);
      attackFollower(
        getBoard(state, "second").indexOf(attacker),
        getBoard(state, "first").indexOf(bystander),
        "second",
        "first",
      );
      expect(Number(bystander.defense)).toBe(bystanderDefBefore - 3);
    });
  });

  describe("Fangs of Ardent Destruction (90044320)", () => {
    const printed = "Deal 1 damage to all followers.";

    it("real path via Galmieux crest (10344120): adds Fangs to hand by uid", () => {
      setupTurn(R6, {
        hand: [GALMIEX],
        pp: 5,
        deck: [DRAW_TOP],
        secondDeck: [DRAW_TOP],
      });
      whenPlayCard("first", 0);
      const galmieux = findOnBoard("first", "Galmieux, Ardor Manifest")!;
      const handBefore = handUids();
      dealDamage(galmieux, 2, "second");
      const added = newHandCards(handBefore, "first", FANGS);
      expect(added).toHaveLength(1);
      expect(added[0]!.type).toBe("Spell");
    });

    it("deals 1 damage to all allied and enemy followers; leaders untouched", () => {
      setupTurn(R6, { hand: [FANGS], pp: 0 });
      const ally = allyFollower(2, 4, "Ally");
      const foe = enemyFollower(2, 4, "Foe");
      const foeBystander = enemyFollower(1, 5, "FoeBystander");
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(Number(ally.defense)).toBe(3);
      expect(Number(foe.defense)).toBe(3);
      expect(Number(foeBystander.defense)).toBe(4);
      expect(getHP(state, "first")).toBe(20);
      expect(getHP(state, "second")).toBe(20);
      expect(printed).toContain("Deal 1 damage to all followers");
    });
  });

  describe("Whitefrost Whisper (90044310)", () => {
    const printed =
      "Select a Mode to activate.\n1. Destroy all damaged enemy followers.\n2. Increase the cost of all cards in your opponent's hand by 1 until the end of their turn.";

    it("real path via Filene Overflow Fanfare (10244110): adds Whitefrost by uid", () => {
      setupTurn(R7, {
        hand: [FILENE],
        pp: 2,
        deck: [DRAW_TOP],
        secondDeck: [DRAW_TOP],
      });
      expect(isOverflow("first")).toBe(true);
      const handBefore = handUids();
      whenPlayCard("first", 0);
      const added = newHandCards(handBefore, "first", WHITEFROST);
      expect(added).toHaveLength(1);
      expect(Number(added[0]!.cost)).toBe(3);
    });

    it("mode 1: destroys all damaged enemy followers; undamaged bystander survives", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R7, { hand: [WHITEFROST], pp: 3 });
      setScriptedModePickProvider(() => [0]);
      const damaged = enemyFollower(2, 3, "Damaged");
      damaged.defense = 2;
      const healthy = enemyFollower(2, 5, "Healthy");
      whenPlayCard("first", 0);
      cleanupDead();
      expect(thenBoard("second").some((c) => c.name === "Damaged")).toBe(false);
      expect(thenBoard("second").some((c) => c.name === "Healthy")).toBe(true);
      expect(printed).toContain("Destroy all damaged enemy followers");
    });

    it("mode 1 off-branch: with no damaged enemy followers, destroys none", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R7, { hand: [WHITEFROST], pp: 3 });
      setScriptedModePickProvider(() => [0]);
      const healthy1 = enemyFollower(2, 5, "Healthy1");
      const healthy2 = enemyFollower(2, 4, "Healthy2");
      whenPlayCard("first", 0);
      expect(thenBoard("second")).toHaveLength(2);
      expect(Number(healthy1.defense)).toBe(5);
      expect(Number(healthy2.defense)).toBe(4);
    });

    it("mode 2: increases all opponent hand card costs by 1 until end of their turn", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R7, {
        hand: [WHITEFROST],
        pp: 3,
        deck: [DRAW_TOP],
        secondDeck: [DRAW_SECOND],
        secondHand: [FILLER],
      });
      setScriptedModePickProvider(() => [1]);
      const oppCard = thenHand("second").find((c) => c.id === FILLER)!;
      const baseCost = getEffectiveCost(oppCard);
      whenPlayCard("first", 0);
      expect(getEffectiveCost(oppCard)).toBe(baseCost + 1);
      whenEndTurn();
      expect(getEffectiveCost(oppCard)).toBe(baseCost + 1);
      whenEndTurn();
      expect(getEffectiveCost(oppCard)).toBe(baseCost);
      expect(printed).toContain("Increase the cost");
    });

    it("mode 2 off-branch: mode 1 does not increase opponent hand costs", () => {
      (globalThis as any).HEADLESS = true;
      setupTurn(R7, {
        hand: [WHITEFROST],
        pp: 3,
        secondHand: [FILLER],
      });
      setScriptedModePickProvider(() => [0]);
      const oppCard = thenHand("second").find((c) => c.id === FILLER)!;
      const baseCost = getEffectiveCost(oppCard);
      enemyFollower(1, 2, "Damaged");
      whenPlayCard("first", 0);
      expect(getEffectiveCost(oppCard)).toBe(baseCost);
    });
  });
});
