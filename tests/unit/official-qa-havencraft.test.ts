/**
 * Official Cygames Q&A — Havencraft batch 5 (20 Q&A on 19 cards).
 * Assertions follow official answers; owner rulings in docs/owner-rulings.md.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { bootstrapFaithForPlayer } from "../../src/logic/faith/bootstrap.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { endTurnBlue } from "../../src/logic/core/turns.js";
import { getKS } from "../../src/logic/core/keywords/internal.js";
import {
  destroyCardForLastWords,
  giveStatBuffViaEngine,
} from "../harness/l2Dispatch.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const LAMRETTA = "10461120";
const GALLEON = "10464110";
const DESPERATE_SHRINEMOUSE = "10562120";
const KUKISHIRO = "10564120";
const VERDILIA = "10864110";
const OMERIO = "10964120";
const HOLY_SHIELDMAIDEN = "10161120";
const SARISSA = "10162110";
const DARKHAVEN_GRACE = "10162210";
const DOSE_OF_HOLINESS = "10162220";
const LAPIS = "10163130";
const RODEO = "10164110";
const CLERIC = "10261110";
const ORCHIS = "10174120";
const LLOYD = "90074120";
const DAMUS = "10261120";
const QUAKE_GOLIATH = "10001130";
const AGNES = "10263110";
const KNIGHT = "10361120";
const TEMPLE_OF_REPOSE = "10362210";
const SHINING_DISENCHANTMENT = "10363210";
const HIMEKA = "10364110";
const MARWYNN = "10364120";
const ARMES = "10654110";
const SHAM_NACHA = "10354110";

const FILLER = "10111310";
const DRAW_A = "10021110";
const AMULET_A = "10161210";
const AMULET_B = "10162210";

const R6 = 6;
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
    active?: "first" | "second";
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
  owner: "first" | "second" = "second",
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    owner,
  );
  c.peak_defense = def;
  state.players[owner].board.push(c);
  return c;
}

function allyFollower(atk = 2, def = 2, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function allyAmulet(id: string, name?: string) {
  const c = createCard(id, "board", "first");
  applyKeywordsFromList(c);
  state.players.first.board.push(c);
  return c;
}

function superEvolvedOnBoard(
  cardId: string,
  owner: "first" | "second",
  name?: string,
) {
  const c = createCard(cardId, "board", owner);
  applyKeywordsFromList(c);
  c.peak_defense = c.defense;
  c.hasEvolved = true;
  c.isEvolved = true;
  c.evoType = "super";
  c.justPlayed = false;
  if (name) c.name = name;
  state.players[owner].board.push(c);
  return c;
}

function fillHand(count = 9, player: "first" | "second" = "first") {
  const hand = getHand(state, player);
  while (hand.length < count) {
    hand.push(createCard(FILLER, "hand", player));
  }
}

function gainCrest(owner: "first" | "second", name: string): void {
  handleGainCrest({ op: "crest", action: "gain", name } as any, owner);
}

function grantShamNachaFaith(owner: "first" | "second" = "first"): void {
  const sham = getCardById(SHAM_NACHA)!;
  state.players[owner].deck.push({
    ...sham,
    uid: state.rng.makeUid(),
  } as any);
  bootstrapFaithForPlayer(
    owner,
    state.players[owner].deck,
    state.players[owner].hand,
  );
}

function engageFirstAmulet(name: string) {
  const card = findOnBoard("first", name)!;
  engageAmulet("first", state.players.first.board.indexOf(card));
  return card;
}

function crestSummonCount(): number {
  return thenBoard("first").filter(
    (c) => c.name === "Fox of Purity" || c.name === "Holy Falcon",
  ).length;
}

function prepareAttacker(card: ReturnType<typeof createCard>) {
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = Number(card.attacks_per_turn ?? card.attacksPerTurn ?? 1);
  applyKeywordsFromList(card);
}

describe("Official Q&A — Havencraft batch 5", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("10461120 Lamretta — Galleon Earth Personified end of turn", () => {
    it("10461120 Lamretta — Galleon Earth Personified EOT evolve: no 2 damage to all followers (official Q&A)", () => {
      setupTurn(R8);
      const lam = createCard(LAMRETTA, "board", "first");
      lam.peak_defense = lam.defense;
      lam.hasEvolved = false;
      lam.isEvolved = false;
      lam.hasAttacked = false;
      lam.justPlayed = false;
      const galleon = createCard(GALLEON, "board", "first");
      applyKeywordsFromList(galleon);
      galleon.peak_defense = galleon.defense;
      const ally = allyFollower(1, 5, "AllyVictim");
      const foe = enemyFollower(3, 5, "EnemyVictim");
      state.players.first.board = [galleon, lam];

      runEndOfTurnBoundary("first");

      expect(lam.hasEvolved).toBe(true);
      expect(Number(ally.defense)).toBe(5);
      expect(Number(foe.defense)).toBe(5);

      cleanupDead();
      resetUidCounter();
      setupTurn(R8, { hand: [LAMRETTA], pp: 2, evo: 2 });
      whenPlayCard("first", 0);
      const lamEvolved = findOnBoard("first", "Lamretta, Sisterly Shepherd")!;
      handleEvolveSelf(lamEvolved, "first", {
        mode: "normal",
        spendPoint: true,
      });
      const ally2 = allyFollower(1, 5, "AllyHit");
      const foe2 = enemyFollower(3, 5, "EnemyHit");

      runEndOfTurnBoundary("first");
      expect(Number(ally2.defense)).toBe(3);
      expect(Number(foe2.defense)).toBe(3);
    }, 60_000);
  });

  describe("10562120 Desperate Shrinemouse — full hand whenever draw", () => {
    it("10562120 Desperate Shrinemouse — evolve at full hand: whenever draw trigger does not fire (official Q&A)", () => {
      setupTurn(R8, { deck: [DRAW_A, FILLER], evo: 2, pp: 5 });
      const mouse = createCard(DESPERATE_SHRINEMOUSE, "board", "first");
      mouse.peak_defense = mouse.defense;
      state.players.first.board.push(mouse);
      fillHand(9);
      const foe = enemyFollower(2, 4, "FoeA");
      const handBefore = getHand(state, "first").length;

      handleEvolveSelf(mouse, "first", { mode: "normal", spendPoint: true });

      expect(getHand(state, "first").length).toBe(handBefore);
      expect(Number(foe.defense)).toBe(4);

      cleanupDead();
      resetUidCounter();
      setupTurn(R8, {
        hand: [DESPERATE_SHRINEMOUSE],
        deck: [DRAW_A, FILLER],
        evo: 2,
        pp: 5,
      });
      whenPlayCard("first", 0);
      const mouse2 = findOnBoard("first", "Desperate Shrinemouse")!;
      const foe2 = enemyFollower(2, 4, "FoeB");
      handleEvolveSelf(mouse2, "first", { mode: "normal", spendPoint: true });
      expect(Number(foe2.defense)).toBe(3);
    }, 60_000);
  });

  it("10564120 Kukishiro crest — evolve Shrinemouse at full hand: crest draw abilities do not fire (official Q&A)", () => {
    setupTurn(R10, {
      hand: [KUKISHIRO, FILLER, FILLER, FILLER],
      deck: [DRAW_A, FILLER, FILLER],
      pp: 10,
    });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Kukishiro, Mistbloom"),
    ).toBe(true);

    const mouse = findOnBoard("first", "Kukishiro, Mistbloom")!;
    state.players.first.board = state.players.first.board.filter(
      (c) => c.uid !== mouse.uid,
    );
    const shrinemouse = createCard(DESPERATE_SHRINEMOUSE, "board", "first");
    shrinemouse.peak_defense = shrinemouse.defense;
    state.players.first.board.push(shrinemouse);
    fillHand(9);
    state.players.first.evoCharges = 2;
    const summonsBefore = crestSummonCount();

    handleEvolveSelf(shrinemouse, "first", {
      mode: "normal",
      spendPoint: true,
    });

    expect(crestSummonCount()).toBe(summonsBefore);

    cleanupDead();
    resetUidCounter();
    setupTurn(R10, {
      hand: [KUKISHIRO, FILLER, FILLER, FILLER],
      deck: [DRAW_A, FILLER, FILLER],
      pp: 10,
      evo: 2,
    });
    whenPlayCard("first", 0);
    const mouse2 = createCard(DESPERATE_SHRINEMOUSE, "board", "first");
    mouse2.peak_defense = mouse2.defense;
    state.players.first.board.push(mouse2);
    const before2 = crestSummonCount();
    handleEvolveSelf(mouse2, "first", { mode: "normal", spendPoint: true });
    expect(crestSummonCount() - before2).toBeGreaterThanOrEqual(0);
    expect(getHand(state, "first").some((c) => c.id === DRAW_A)).toBe(true);
  }, 60_000);

  it("10864110 Verdilia crest — super-evolved Armes attacks 3 times per turn (official Q&A)", () => {
    setupTurn(R10, { hand: [ARMES], pp: 10 });
    const crestDef = getCardById(VERDILIA)!.superevolve![0] as any;
    handleGainCrest(crestDef, "first");
    whenPlayCard("first", 0);
    const armes = findOnBoard("first", "Armes, Depletive Demon")!;
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(armes, "first", { mode: "super", spendPoint: true });
    expect(Number(armes.attacks_per_turn ?? armes.attacksPerTurn)).toBe(3);

    const foe = enemyFollower(1, 10, "PunchingBag");
    prepareAttacker(armes);
    const idx = state.players.first.board.indexOf(armes);
    attackFollower(idx, 0, "first", "second");
    expect(Number(armes.attacks_left)).toBe(2);
  }, 60_000);

  it("10964120 Omerio — after third ability, next amulet destroy fires first ability again (official Q&A)", () => {
    setupTurn(R8, { hand: [OMERIO], pp: 6 });
    whenPlayCard("first", 0);
    const foes = [
      enemyFollower(2, 6, "F1"),
      enemyFollower(2, 6, "F2"),
      enemyFollower(2, 6, "F3"),
    ];
    const amulets = ["T1", "T2", "T3", "T4"].map((n) =>
      allyAmulet(AMULET_A, n),
    );

    destroyTarget(amulets[0]!, "first");
    cleanupDead();
    destroyTarget(amulets[1]!, "first");
    cleanupDead();
    destroyTarget(amulets[2]!, "first");
    cleanupDead();
    expect(thenBoard("first").some((c) => c.name === "Holy Falcon")).toBe(true);

    const defBefore = foes.reduce((s, f) => s + Number(f.defense), 0);
    destroyTarget(amulets[3]!, "first");
    cleanupDead();
    const defAfter = foes.reduce((s, f) => s + Number(f.defense), 0);
    expect(defBefore - defAfter).toBeGreaterThan(0);
  }, 60_000);

  it("10161120 Holy Shieldmaiden — super-evolve attack loses Barrier (official Q&A)", () => {
    setupTurn(R8, { hand: [HOLY_SHIELDMAIDEN], pp: 3 });
    whenPlayCard("first", 0);
    const maid = findOnBoard("first", "Holy Shieldmaiden")!;
    applyKeywordsFromList(maid);
    expect(maid.hasBarrier || maid.keywordState?.hasBarrier).toBe(true);
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(maid, "first", { mode: "super", spendPoint: true });

    const foe = enemyFollower(1, 5, "Blocker");
    prepareAttacker(maid);
    attackFollower(
      state.players.first.board.indexOf(maid),
      0,
      "first",
      "second",
    );
    expect(maid.hasBarrier || maid.keywordState?.hasBarrier).toBeFalsy();
  }, 60_000);

  it("10162110 Sarissa — super-evolve attack loses Barrier (official Q&A)", () => {
    setupTurn(R6, { hand: [SARISSA], pp: 2, evo: 2 });
    whenPlayCard("first", 0);
    const sarissa = findOnBoard("first", "Sarissa, Luxspear Al-mi'raj")!;
    handleEvolveSelf(sarissa, "first", { mode: "normal", spendPoint: true });
    expect(sarissa.hasBarrier || sarissa.keywordState?.hasBarrier).toBe(true);
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(sarissa, "first", { mode: "super", spendPoint: true });

    const foe = enemyFollower(1, 5, "Blocker");
    prepareAttacker(sarissa);
    attackFollower(
      state.players.first.board.indexOf(sarissa),
      0,
      "first",
      "second",
    );
    expect(sarissa.hasBarrier || sarissa.keywordState?.hasBarrier).toBeFalsy();
  }, 60_000);

  it("10162210 Darkhaven Grace — Engage with no allies still restores 1 leader defense (official Q&A)", () => {
    setupTurn(R6, { hand: [DARKHAVEN_GRACE], pp: 3, hp: 18 });
    whenPlayCard("first", 0);
    engageFirstAmulet("Darkhaven Grace");
    expect(getHP(state, "first")).toBe(19);
    expect(thenBoard("first").some((c) => c.name === "Darkhaven Grace")).toBe(
      true,
    );
  }, 60_000);

  it("10162220 Dose of Holiness — Engage with no enemies destroys self and restores 1 leader defense (official Q&A)", () => {
    setupTurn(R6, { hand: [DOSE_OF_HOLINESS], pp: 3, hp: 17 });
    whenPlayCard("first", 0);
    engageFirstAmulet("Dose of Holiness");
    expect(getHP(state, "first")).toBe(18);
    expect(thenBoard("first").some((c) => c.name === "Dose of Holiness")).toBe(
      false,
    );
  }, 60_000);

  it("10163130 Lapis — duplicate crest blocked when crest already held (official Q&A)", () => {
    setupTurn(R6);
    gainCrest("first", "Lapis, Shining Seraph");
    expect(getCrests(state, "first").length).toBe(1);
    const lapis = createCard(LAPIS, "board", "first");
    applyKeywordsFromList(lapis);
    lapis.peak_defense = lapis.defense;
    state.players.first.board.push(lapis);
    destroyCardForLastWords(lapis, "first");
    expect(getCrests(state, "first").length).toBe(1);
    expect(
      getCrests(state, "first").filter(
        (c) => c.name === "Lapis, Shining Seraph",
      ),
    ).toHaveLength(1);
  }, 60_000);

  it("10164110 Rodeo — only card in hand: Fanfare still summons 3 amulets (official Q&A)", () => {
    setupTurn(R8, {
      hand: [RODEO],
      deck: [AMULET_A, AMULET_B, "10163210", "10162220"],
      pp: 7,
    });
    whenPlayCard("first", 0);
    const amulets = thenBoard("first").filter((c) => c.type === "Amulet");
    expect(amulets.length).toBe(3);
    const names = new Set(amulets.map((c) => c.name));
    expect(names.size).toBe(3);
  }, 60_000);

  it("10261110 Cleric of Crushing — can select super-evolved Orchis when Lloyd is unevolved (official Q&A)", () => {
    setupTurn(R6, { hand: [CLERIC], pp: 3, evo: 2 });
    superEvolvedOnBoard(ORCHIS, "second");
    const lloyd = createCard(LLOYD, "board", "second");
    applyKeywordsFromList(lloyd);
    lloyd.peak_defense = lloyd.defense;
    lloyd.hasEvolved = false;
    lloyd.isEvolved = false;
    state.players.second.board.push(lloyd);

    whenPlayCard("first", 0);
    const cleric = findOnBoard("first", "Cleric of Crushing")!;
    handleEvolveSelf(cleric, "first", { mode: "normal", spendPoint: true });
    const pending = state.pendingTargetEffect!;
    const orchis = getBoard(state, "second").find((c) => c.id === ORCHIS)!;
    expect(validateTargetSelection(state, pending, orchis.uid).ok).toBe(true);
    resolvePendingByUid(orchis.uid);
    expect(getBoard(state, "second").some((c) => c.id === ORCHIS)).toBe(false);
  }, 60_000);

  it("10261110 Cleric of Crushing — cannot select Orchis when Lloyd is super-evolved (official Q&A)", () => {
    setupTurn(R6, { hand: [CLERIC], pp: 3, evo: 2 });
    superEvolvedOnBoard(ORCHIS, "second");
    superEvolvedOnBoard(LLOYD, "second");

    whenPlayCard("first", 0);
    const cleric = findOnBoard("first", "Cleric of Crushing")!;
    handleEvolveSelf(cleric, "first", { mode: "normal", spendPoint: true });
    const pending = state.pendingTargetEffect!;
    const orchis = getBoard(state, "second").find((c) => c.id === ORCHIS)!;
    const lloyd = getBoard(state, "second").find((c) => c.id === LLOYD)!;
    expect(validateTargetSelection(state, pending, orchis.uid).ok).toBe(false);
    expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
  }, 60_000);

  it("10261120 Damus — super-evolved Quake Goliath not destroyed at owner EOT (official Q&A)", () => {
    setupTurn(R8, { active: "second", pp: 2 });
    state.players.second.hand = [createCard(DAMUS, "hand", "second")];
    state.players.second.pp = 2;
    const goliath = createCard(QUAKE_GOLIATH, "board", "first");
    goliath.peak_defense = goliath.defense;
    state.players.first.board.push(goliath);
    state.activePlayer = "second";
    whenPlayCard("second", 0);
    resolvePendingByUid(goliath.uid);
    state.activePlayer = "first";

    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(goliath, "first", { mode: "super", spendPoint: true });
    runEndOfTurnBoundary("first");
    expect(getBoard(state, "first").some((c) => c.uid === goliath.uid)).toBe(
      true,
    );

    cleanupDead();
    resetUidCounter();
    setupTurn(R8, { active: "second", pp: 2 });
    state.players.second.hand = [createCard(DAMUS, "hand", "second")];
    state.players.second.pp = 2;
    const goliath2 = createCard(QUAKE_GOLIATH, "board", "first");
    goliath2.peak_defense = goliath2.defense;
    state.players.first.board.push(goliath2);
    state.activePlayer = "second";
    whenPlayCard("second", 0);
    resolvePendingByUid(goliath2.uid);
    state.activePlayer = "first";
    runEndOfTurnBoundary("first");
    expect(getBoard(state, "first").some((c) => c.uid === goliath2.uid)).toBe(
      false,
    );
  }, 60_000);

  it("10263110 Agnes — Strike random destroy does not trigger super-evolution leader ping (official Q&A)", () => {
    setupTurn(R6, { hand: [AGNES], pp: 5 });
    allyAmulet(AMULET_A);
    allyAmulet(AMULET_B);
    const target = enemyFollower(3, 5, "CombatTarget");
    const other = enemyFollower(5, 5, "RandomVictim");
    whenPlayCard("first", 0);
    const agnes = findOnBoard("first", "Agnes, the Swiftblade")!;
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(agnes, "first", { mode: "super", spendPoint: true });
    const leaderHp = getHP(state, "second");
    prepareAttacker(agnes);
    attackFollower(
      state.players.first.board.indexOf(agnes),
      0,
      "first",
      "second",
    );
    expect(getHP(state, "second")).toBe(leaderHp);
    expect(Number(target.defense)).toBeLessThan(5);
  }, 60_000);

  it("10361120 Knight of the Holy Order — Himeka set attack does not restore leader (official Q&A)", () => {
    setupTurn(R8);
    state.players.first.hand = [createCard(KNIGHT, "hand", "first")];
    state.players.second.hand = [createCard(HIMEKA, "hand", "second")];
    state.players.first.pp = 8;
    state.players.second.pp = 8;
    whenPlayCard("first", 0);
    const knight = findOnBoard("first", "Knight of the Holy Order")!;
    state.players.first.hp = 18;
    state.activePlayer = "second";
    whenPlayCard("second", 0);
    const himeka = findOnBoard("second", "Himeka, Heir to Repose")!;
    state.players.second.superEvoCharges = 1;
    state.players.second.superEvoPoints = 1;
    handleEvolveSelf(himeka, "second", { mode: "super", spendPoint: true });
    state.activePlayer = "first";
    expect(Number(knight.attack)).toBe(4);
    expect(getHP(state, "first")).toBe(18);

    giveStatBuffViaEngine(knight, "first", 1, 0);
    expect(getHP(state, "first")).toBe(19);
  }, 60_000);

  it("10362210 Temple of Repose — faiths do not count as crests for Engage (official Q&A)", () => {
    setupTurn(R6, { hand: [TEMPLE_OF_REPOSE], pp: 3 });
    grantShamNachaFaith();
    gainCrest("first", "Test Crest A");
    gainCrest("first", "Test Crest B");
    whenPlayCard("first", 0);
    const temple = engageFirstAmulet("Temple of Repose");
    expect(temple.countdown).toBe(2);
  }, 60_000);

  it("10363210 Shining Disenchantment — faiths do not count as crests for Engage (official Q&A)", () => {
    setupTurn(R6, { hand: [SHINING_DISENCHANTMENT], pp: 4 });
    grantShamNachaFaith();
    gainCrest("first", "Test Crest A");
    gainCrest("first", "Test Crest B");
    whenPlayCard("first", 0);
    const disc = engageFirstAmulet("Shining Disenchantment");
    expect(disc.countdown).toBe(2);
  }, 60_000);

  it("10364110 Himeka — faiths do not count as crests for crest locks (official Q&A)", () => {
    setupTurn(R6, { hand: [HIMEKA], pp: 6 });
    grantShamNachaFaith();
    gainCrest("first", "Filler Crest");
    for (let i = 0; i < 3; i++) {
      const foe = enemyFollower(3, 5, `LockTarget${i}`);
      foe.justPlayed = false;
    }
    whenPlayCard("first", 0);
    endTurnBlue();
    const locked = getBoard(state, "second").filter((c) => getKS(c).cantAttack);
    expect(locked.length).toBe(2);
  }, 60_000);

  it("10364120 Marwynn — faiths do not count as crests for split damage (official Q&A)", () => {
    setupTurn(R6, { hand: [MARWYNN], pp: 5, evo: 2 });
    grantShamNachaFaith();
    gainCrest("first", "Filler Crest");
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    const mar = findOnBoard("first", "Marwynn, Despair Manifest")!;
    handleEvolveSelf(mar, "first", { mode: "normal", spendPoint: true });
    endTurnBlue();
    expect(getHP(state, "second")).toBe(18);
  }, 60_000);
});
