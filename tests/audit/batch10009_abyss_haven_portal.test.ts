/**
 * Set 10009 — Abysscraft + Havencraft + Portalcraft audit (batch 3, final class batch).
 *
 * Covers authored / partial cards only. Blocked cards are listed in the PR.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getBoard, getHand, getHP } from "../../src/core/playerHelpers.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import { restoreLeaderHP } from "../../src/logic/effects/ops/restore/primitives.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;
const FILLER = "10111310";

const HIGHLANDER_DECK = [
  { name: "HighlanderA", type: "Follower", cost: 1, attack: 1, defense: 1 },
  { name: "HighlanderB", type: "Spell", cost: 2 },
  { name: "HighlanderC", type: "Follower", cost: 3, attack: 2, defense: 2 },
  { name: "HighlanderD", type: "Follower", cost: 4, attack: 3, defense: 3 },
  { name: "HighlanderE", type: "Amulet", cost: 2 },
  { name: "HighlanderF", type: "Follower", cost: 5, attack: 4, defense: 4 },
  { name: "HighlanderG", type: "Spell", cost: 1 },
  { name: "HighlanderH", type: "Follower", cost: 6, attack: 5, defense: 5 },
  { name: "HighlanderI", type: "Follower", cost: 7, attack: 6, defense: 6 },
  { name: "HighlanderJ", type: "Follower", cost: 8, attack: 7, defense: 7 },
];

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    pp?: number;
    deck?: string[] | Array<{ name: string; type: string; cost?: number }>;
    active?: "first" | "second";
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
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function alliedFollower(name = "Ally", cost = 2, atk = 2, def = 2) {
  const c = createCard(
    { name, type: "Follower", cost, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function resolveFirstPendingIfNeeded(): void {
  const pending = state.pendingTargetEffect;
  if (!pending) return;
  const poolLen = pending.poolUids?.length ?? pending.pool?.length ?? 0;
  expect(poolLen).toBeGreaterThan(0);
  const uid = pending.poolUids?.[0] ?? String(pending.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

describe("Set 10009 — Abysscraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Ruthless Blitzer — Fanfare deals 2 to both leaders", () => {
    setupTurn(R5, { hand: ["10951110"], pp: 2 });
    const hpSelf = getHP(state, "first");
    const hpEnemy = getHP(state, "second");
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(hpSelf - 2);
    expect(getHP(state, "second")).toBe(hpEnemy - 2);
  });

  it("Netherworld Lieutenant — Last Words summons Rush copy without Last Words", () => {
    setupTurn(R5, { hand: ["10951120"], pp: 2 });
    whenPlayCard("first", 0);
    const lt = findOnBoard("first", "Netherworld Lieutenant")!;
    lt.defense = 0;
    cleanupDead();
    const summoned = thenBoard("first").filter(
      (c) => c.name === "Netherworld Lieutenant",
    );
    expect(summoned.length).toBe(1);
    expect(summoned[0]?.hasRush).toBe(true);
    expect(summoned[0]?.keywords?.some((k) => k === "LastWords")).toBeFalsy();
  });

  it("Spooky Surprise — summons Ghost and Rotting Zombie", () => {
    setupTurn(R6, { hand: ["10951310"], pp: 4 });
    whenPlayCard("first", 0);
    const names = thenBoard("first").map((c) => c.name);
    expect(names).toContain("Ghost");
    expect(names).toContain("Rotting Zombie");
  });

  it("Void Colonel — Last Words destroys random enemy and restores leader", () => {
    setupTurn(R8, { hand: ["10952110"], pp: 6 });
    enemyFollower(2, 4);
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    const colonel = findOnBoard("first", "Void Colonel")!;
    const hp0 = getHP(state, "first");
    colonel.defense = 0;
    cleanupDead();
    expect(getBoard(state, "second").length).toBe(0);
    expect(getHP(state, "first")).toBe(hp0 + 2);
  });

  it("Sparkly Demoness — Fanfare destroys selected enemy and damages leader", () => {
    setupTurn(R8, { hand: ["10952120"], pp: 7 });
    enemyFollower(2, 5);
    const hp0 = getHP(state, "second");
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    expect(getBoard(state, "second").length).toBe(0);
    expect(getHP(state, "second")).toBe(hp0 - 2);
  });

  it("Chains of the Past — base repeat damages follower and leaders", () => {
    setupTurn(R6, { hand: ["10952310"], pp: 2 });
    enemyFollower(2, 6);
    const hpSelf = getHP(state, "first");
    const hpEnemy = getHP(state, "second");
    whenPlayCard("first", 0);
    expect(Number(getBoard(state, "second")[0]!.defense)).toBeLessThan(6);
    expect(getHP(state, "first")).toBe(hpSelf - 1);
    expect(getHP(state, "second")).toBe(hpEnemy - 1);
  });

  it("Rampaging Commander — Fanfare damages board and leaders", () => {
    setupTurn(R8, { hand: ["10953110"], pp: 6 });
    enemyFollower(2, 5);
    const hpSelf = getHP(state, "first");
    const hpEnemy = getHP(state, "second");
    whenPlayCard("first", 0);
    expect(Number(getBoard(state, "second")[0]!.defense)).toBe(2);
    expect(getHP(state, "first")).toBe(hpSelf - 3);
    expect(getHP(state, "second")).toBe(hpEnemy - 3);
  });

  it("Reaper's Due — grants Last Words summon copy to selected ally", () => {
    setupTurn(R6, { hand: ["10953310"], pp: 4 });
    const ally = alliedFollower("TargetAlly");
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    ally.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter((c) => c.name === ally.name).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("Garodeth vs. Zeth — end of turn hand trigger reduces cost; Fanfare mode deals damage", () => {
    setupTurn(R10, { hand: ["10954120"], pp: 8 });
    state.players.first.hp = 10;
    whenEndTurn();
    const garodeth = getHand(state, "first").find(
      (c) => c.name === "Garodeth vs. Zeth",
    )!;
    expect(Number(garodeth.cost)).toBeLessThan(8);

    resetUidCounter();
    setupTurn(R10, { hand: ["10954120"], pp: 8 });
    const foe = enemyFollower(2, 10);
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    setScriptedModePickProvider(null);
    expect(Number(foe.defense)).toBeLessThan(10);
  });
});

describe("Set 10009 — Havencraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Follower of the Tenets — evolves when leader defense is restored during your turn", () => {
    setupTurn(R5, { hand: ["10961110"], pp: 2 });
    whenPlayCard("first", 0);
    const tenets = findOnBoard("first", "Follower of the Tenets")!;
    expect(tenets.hasEvolved).toBeFalsy();
    state.players.first.hp = 18;
    restoreLeaderHP("first", 1);
    expect(tenets.hasEvolved).toBe(true);
  });

  it("Peryton — Fanfare summons 2 copies", () => {
    setupTurn(R8, { hand: ["10961120"], pp: 6 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").filter((c) => c.name === "Peryton").length).toBe(
      3,
    );
  });

  it("Roaring Basilica — Engage advances countdown; Last Words summon and damage", () => {
    setupTurn(R6, { hand: ["10961210"], pp: 5 });
    whenPlayCard("first", 0);
    const basilica = findOnBoard("first", "Roaring Basilica")!;
    const cdBefore = basilica.countdown ?? 3;
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Roaring Basilica",
    );
    engageAmulet("first", idx);
    expect(basilica.countdown ?? cdBefore).toBeLessThan(cdBefore);

    const foe = enemyFollower(2, 6);
    const lwKw = (getCardById("10961210")!.keywords as any[]).find(
      (k) => k?.name === "LastWords",
    );
    runEffects(lwKw.effects, "first", basilica);
    expect(thenBoard("first").some((c) => c.name === "Holyflame Tiger")).toBe(
      true,
    );
    expect(Number(foe.defense)).toBeLessThan(6);
  });

  it("Agent of the Testaments — Fanfare Ambush; end of turn restores leader", () => {
    setupTurn(R6, { hand: ["10962110"], pp: 3 });
    state.players.first.hp = 19;
    const hp0 = getHP(state, "first");
    whenPlayCard("first", 0);
    const agent = findOnBoard("first", "Agent of the Testaments")!;
    expect(
      agent.hasAmbush ||
        agent.keywordState?.hasAmbush ||
        agent.keywords?.includes("Ambush"),
    ).toBe(true);
    whenEndTurn();
    expect(getHP(state, "first")).toBe(hp0 + 1);
  });

  it("Vow of Devotion — mode damages or restores; activates all with ally cost 6+", () => {
    setupTurn(R6, { hand: ["10962310"], pp: 1 });
    enemyFollower(2, 6);
    whenPlayCard("first", 0);
    expect(Number(getBoard(state, "second")[0]!.defense)).toBeLessThan(6);

    resetUidCounter();
    setupTurn(R8, { hand: ["10962310"], pp: 1 });
    alliedFollower("Big", 6, 6, 6);
    enemyFollower(2, 6);
    state.players.first.hp = 18;
    const hp0 = getHP(state, "first");
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBeGreaterThan(hp0);
    expect(Number(getBoard(state, "second")[0]!.defense)).toBeLessThan(6);
  });

  it("Executor of the Vow — Fanfare restores; leader restore destroys enemy", () => {
    setupTurn(R8, { hand: ["10963110"], pp: 7 });
    enemyFollower(2, 4);
    state.players.first.hp = 18;
    const hp0 = getHP(state, "first");
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(hp0 + 2);
    state.players.first.hp = 18;
    restoreLeaderHP("first", 1);
    expect(getBoard(state, "second").length).toBe(0);
  });

  it("Juratio — Fanfare destroys all followers; Engage draws and restores", () => {
    setupTurn(R8, { hand: ["10963210"], pp: 6 });
    enemyFollower(2, 4);
    alliedFollower();
    whenPlayCard("first", 0);
    expect(getBoard(state, "second").length).toBe(0);
    expect(
      getBoard(state, "first").filter((c) => c.type === "Follower").length,
    ).toBe(0);

    resetUidCounter();
    setupTurn(R8, { hand: ["10963210"], pp: 7, deck: [FILLER] });
    state.players.first.hp = 19;
    const hp0 = getHP(state, "first");
    whenPlayCard("first", 0);
    const juratioIdx = state.players.first.board.findIndex(
      (c) => c.name === "Juratio",
    );
    engageAmulet("first", juratioIdx);
    expect(getHand(state, "first").length).toBeGreaterThan(0);
    expect(getHP(state, "first")).toBe(hp0 + 1);
  });

  it("Erralde, Signet Convict — Fanfare destroys; Evolve crest triggers at end of turn", () => {
    setupTurn(R8, { hand: ["10964110"], pp: 6 });
    enemyFollower(2, 5);
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    expect(getBoard(state, "second").length).toBe(0);

    const erralde = findOnBoard("first", "Erralde, Signet Convict")!;
    state.players.first.evoCharges = 2;
    onEvolve(erralde, "first", "normal");
    alliedFollower("Big", 6, 6, 6);
    state.players.first.hp = 19;
    const hpEnemy = getHP(state, "second");
    const hpSelf = getHP(state, "first");
    whenEndTurn();
    expect(getHP(state, "second")).toBe(hpEnemy - 1);
    expect(getHP(state, "first")).toBe(hpSelf + 1);
  });

  it("Omerio, Winged Revenant — amulet destroyed sequence; Evolve destroys allied amulets", () => {
    setupTurn(R8, { hand: ["10964120"], pp: 6 });
    whenPlayCard("first", 0);
    const omerio = findOnBoard("first", "Omerio, Winged Revenant")!;
    const amulet = createCard(
      { name: "TestAmulet", type: "Amulet", cost: 2 },
      "board",
      "first",
    );
    state.players.first.board.push(amulet);
    enemyFollower(2, 6);
    destroyTarget(amulet, "first");
    cleanupDead();
    expect(Number(getBoard(state, "second")[0]!.defense)).toBeLessThan(6);

    resetUidCounter();
    setupTurn(R8, { hand: ["10964120"], pp: 6 });
    const amulet2 = createCard(
      { name: "TestAmulet2", type: "Amulet", cost: 2 },
      "board",
      "first",
    );
    state.players.first.board.push(amulet2);
    whenPlayCard("first", 0);
    const omerio2 = findOnBoard("first", "Omerio, Winged Revenant")!;
    state.players.first.evoCharges = 2;
    onEvolve(omerio2, "first", "normal");
    expect(getBoard(state, "first").every((c) => c.type !== "Amulet")).toBe(
      true,
    );
  });
});

describe("Set 10009 — Portalcraft", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Bluerust Underling — highlander Fanfare deals 5 to selected enemy", () => {
    setupTurn(R5, {
      hand: ["10971110"],
      pp: 1,
      deck: HIGHLANDER_DECK,
    });
    const foe = enemyFollower(2, 8);
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    expect(Number(foe.defense)).toBe(3);
  });

  it("Twindrone Engineer — Fanfare summons Analyzing Artifact; Evolve replicates", () => {
    setupTurn(R6, { hand: ["10971120"], pp: 4 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Analyzing Artifact").length,
    ).toBe(1);
    const eng = findOnBoard("first", "Twindrone Engineer")!;
    state.players.first.evoCharges = 2;
    onEvolve(eng, "first", "normal");
    expect(
      thenBoard("first").filter((c) => c.name === "Analyzing Artifact").length,
    ).toBe(2);
  });

  it("Dimensional Selection — mode damages all enemies or summons Mystic Artifacts", () => {
    setupTurn(R8, { hand: ["10971310"], pp: 6 });
    enemyFollower(2, 6);
    whenPlayCard("first", 0);
    expect(Number(getBoard(state, "second")[0]!.defense)).toBe(1);

    resetUidCounter();
    setupTurn(R8, { hand: ["10971310"], pp: 6 });
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    setScriptedModePickProvider(null);
    expect(
      thenBoard("first").filter((c) => c.name === "Mystic Artifact").length,
    ).toBe(2);
  });

  it("Ironwork Bodyguard — highlander Fanfare damages and restores", () => {
    setupTurn(R6, {
      hand: ["10972110"],
      pp: 4,
      deck: HIGHLANDER_DECK,
    });
    const foe = enemyFollower(2, 8);
    state.players.first.hp = 16;
    const hp0 = getHP(state, "first");
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    expect(Number(foe.defense)).toBe(4);
    expect(getHP(state, "first")).toBe(hp0 + 4);
  });

  it("Blade Puppeteer — Fanfare summons; Puppetry enter damages leader", () => {
    setupTurn(R8, { hand: ["10972120"], pp: 6 });
    const hp0 = getHP(state, "second");
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.name === "Enhanced Puppet")).toBe(
      true,
    );
    expect(thenBoard("first").some((c) => c.name === "Puppet")).toBe(true);
    expect(getHP(state, "second")).toBeLessThan(hp0);
  });

  it("Disgraceful Banishment — discard, draw; highlander draws 3", () => {
    setupTurn(R5, {
      hand: ["10972310", FILLER],
      pp: 1,
      deck: HIGHLANDER_DECK,
    });
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    expect(getHand(state, "first").length).toBe(3);
  });

  it("Steelforged Right Hand — destroys enemy; highlander gains Storm", () => {
    setupTurn(R7, {
      hand: ["10973110"],
      pp: 5,
      deck: HIGHLANDER_DECK,
    });
    enemyFollower(2, 4);
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    expect(getBoard(state, "second").length).toBe(0);
    const hand = findOnBoard("first", "Steelforged Right Hand")!;
    expect(hand.hasStorm || hand.keywordState?.hasStorm).toBe(true);
  });

  it("Soulforge — destroys one enemy or all with highlander", () => {
    setupTurn(R6, { hand: ["10973310"], pp: 4 });
    enemyFollower(2, 4);
    whenPlayCard("first", 0);
    resolveFirstPendingIfNeeded();
    expect(getBoard(state, "second").length).toBe(0);

    resetUidCounter();
    setupTurn(R6, {
      hand: ["10973310"],
      pp: 4,
      deck: HIGHLANDER_DECK,
    });
    enemyFollower(2, 4, "A");
    enemyFollower(2, 4, "B");
    whenPlayCard("first", 0);
    expect(getBoard(state, "second").length).toBe(0);
  });
});
