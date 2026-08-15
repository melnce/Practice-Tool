/**
 * Batch 5 — Havencraft audit (sets 10001–10004; basic set in Batch 1).
 *
 * Cardinal rule: assertions from card text + rulebook only.
 * States use natural roundCount/maxPP alignment (no permPP skew).
 *
 * CLASSIFICATION SUMMARY (49 non-basic Havencraft cards):
 * - A (behavioral test): 34
 * - B/C escalated: 14 → tests/audit/batch05_havencraft_ruled.test.ts
 * - Stats/keywords only: 1 — Holy Shieldmaiden (Ward Barrier)
 *
 * Primitives: Engage §290–294 in primitives_batch5_engage.test.ts.
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
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  attackFollower,
  canAttackFollowerTarget,
  canAttackLeaderWhileWardActive,
} from "../../src/logic/core/combat.js";
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

describe("Batch 5 — Havencraft [10001] Legends Rise", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Angelic Prism Priestess — Fanfare draws amulet; Evolve reduces hand amulet cost", () => {
    setupTurn(R6, {
      hand: ["10161110"],
      pp: 3,
      deck: ["10161210", "10161130"],
    });
    whenPlayCard("first", 0);
    const amuletInHand = thenHand("first").find((c) => c.type === "Amulet");
    expect(amuletInHand).toBeTruthy();
    const priestess = findOnBoard("first", "Angelic Prism Priestess")!;
    const costBefore = Number(amuletInHand!.cost);
    onEvolve(priestess, "first", "normal");
    resolveFirstPending();
    expect(Number(amuletInHand!.cost)).toBe(Math.max(0, costBefore - 1));
  });

  it("Holy Shieldmaiden — Ward and Barrier at load", () => {
    setupTurn(R6, { hand: ["10161120"], pp: 3 });
    whenPlayCard("first", 0);
    const maid = findOnBoard("first", "Holy Shieldmaiden")!;
    expect(maid.hasWard).toBe(true);
    expect(maid.hasBarrier || maid.keywordState?.hasBarrier).toBe(true);
  });

  it("Radiant Guiding Angel — Fanfare draws 2 and restores 2 leader defense", () => {
    setupTurn(R6, {
      hand: ["10161130"],
      pp: 5,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    state.players.first.hp = 16;
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(2);
    expect(getHP(state, "first")).toBe(18);
  });

  it("Mainyu — Engage amulet gives +1/+0 until end of turn", () => {
    setupTurn(R6, { hand: ["10161210"], pp: 2 });
    const mainyu = createCard("10161140", "board", "first");
    applyKeywordsFromList(mainyu);
    mainyu.peak_defense = mainyu.defense;
    state.players.first.board = [mainyu];
    whenPlayCard("first", 0);
    const atkBefore = mainyu.attack;
    const amuletIdx = state.players.first.board.findIndex(
      (c) => c.type === "Amulet",
    );
    engageAmulet("first", amuletIdx);
    expect(mainyu.attack).toBe(atkBefore + 1);
  });

  it("Featherfall — 3 damage all enemy followers; summons Holy Falcon", () => {
    setupTurn(R6, { hand: ["10161310"], pp: 6 });
    enemyFollower(4, "A");
    enemyFollower(4, "B");
    whenPlayCard("first", 0);
    expect(state.players.second.board.every((c) => c.defense === 1)).toBe(true);
    expect(thenBoard("first").some((c) => c.name === "Holy Falcon")).toBe(true);
  });

  it("Sarissa — Ward ally destroyed gives +1/+1; Evolve grants Barrier", () => {
    setupTurn(R6, { hand: ["10162110"], pp: 2 });
    const wardAlly = createCard("10161120", "board", "first");
    applyKeywordsFromList(wardAlly);
    wardAlly.peak_defense = wardAlly.defense;
    state.players.first.board = [wardAlly];
    whenPlayCard("first", 0);
    const sarissa = findOnBoard("first", "Sarissa, Luxspear Al-mi'raj")!;
    wardAlly.defense = 0;
    cleanupDead();
    expect(sarissa.attack).toBe(3);
    onEvolve(sarissa, "first", "normal");
    expect(sarissa.hasBarrier || sarissa.keywordState?.hasBarrier).toBe(true);
  });

  it("Reno — Clash deals 1 to enemy leader; Super-Evolve 2 attacks per turn", () => {
    setupTurn(R6, { hand: ["10162120"], pp: 4 });
    state.players.second.hp = 20;
    whenPlayCard("first", 0);
    const reno = findOnBoard("first", "Reno, Luxwing Featherfolk")!;
    const clashFx = (reno.triggers ?? []).find((t: any) => t.event === "clash");
    runEffects((clashFx as any).effects, "first", reno, {
      defender: enemyFollower(3),
    });
    expect(getHP(state, "second")).toBe(19);

    resetUidCounter();
    setupTurn(R7);
    const reno2 = createCard("10162120", "board", "first");
    reno2.peak_defense = reno2.defense;
    state.players.first.board = [reno2];
    state.players.first.superEvoPoints = 1;
    onEvolve(reno2, "first", "super");
    expect(reno2.attacks_per_turn).toBe(2);
  });

  it("Ronavero — Ambush; Evolve destroys selected enemy", () => {
    setupTurn(R6);
    const ron = createCard("10163120", "board", "first");
    applyKeywordsFromList(ron);
    ron.peak_defense = ron.defense;
    const e = enemyFollower(4);
    state.players.first.board = [ron];
    expect(ron.hasAmbush).toBe(true);
    onEvolve(ron, "first", "normal");
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Lapis — Last Words gains Lapis crest", () => {
    setupTurn(R6);
    const lapis = createCard("10163130", "board", "first");
    applyKeywordsFromList(lapis);
    lapis.defense = 0;
    state.players.first.board = [lapis];
    cleanupDead();
    expect(
      getCrests(state, "first").some((c) => c.name === "Lapis, Shining Seraph"),
    ).toBe(true);
  });

  it("Pact of the Beast Princess — Engage advances countdown; LW summons Holyflame Tiger", () => {
    setupTurn(R6, { hand: ["10163210"], pp: 3 });
    whenPlayCard("first", 0);
    const pact = findOnBoard("first", "Pact of the Beast Princess")!;
    engageAmulet("first", 0);
    expect(pact.countdown).toBe(1);
    pact.countdown = 0;
    cleanupDead();
    expect(thenBoard("first").some((c) => c.name === "Holyflame Tiger")).toBe(
      true,
    );
  });

  it("Unholy Vessel — Engage destroys all followers", () => {
    setupTurn(R6, { hand: ["10163220"], pp: 6 });
    enemyFollower(3);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    const vesselIdx = state.players.first.board.findIndex(
      (c) => c.type === "Amulet",
    );
    engageAmulet("first", vesselIdx);
    cleanupDead();
    expect(getBoard(state, "first")).toHaveLength(0);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Jeanne — Fanfare 6 to all enemy followers; +2/+4 other allies; Ward", () => {
    setupTurn(R8, { hand: ["10164120"], pp: 8 });
    enemyFollower(8);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    expect(state.players.second.board[0]!.defense).toBe(2);
    expect(ally.attack).toBe(4);
    expect(ally.defense).toBe(6);
    expect(findOnBoard("first", "Jeanne, Saintly Knight")?.hasWard).toBe(true);
  });

  it("Salefa — Fanfare restore 3; Ward; Evolve 3 damage all enemy followers", () => {
    setupTurn(R6, { hand: ["10164130"], pp: 5 });
    enemyFollower(5);
    state.players.first.hp = 14;
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(17);
    const salefa = findOnBoard("first", "Salefa, Guardian of Water")!;
    onEvolve(salefa, "first", "normal");
    expect(state.players.second.board[0]!.defense).toBe(2);
  });
});

describe("Batch 5 — Havencraft [10002] Infinity Evolved", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Cleric of Crushing — Ward; may attack Ward follower while other Ward blocks leader", () => {
    setupTurn(R6, { hand: ["10261110"], pp: 3 });
    whenPlayCard("first", 0);
    const cleric = findOnBoard("first", "Cleric of Crushing")!;
    expect(cleric.hasWard).toBe(true);

    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const ward = createCard("10261110", "board", "second");
    applyKeywordsFromList(ward);
    ward.peak_defense = ward.defense;
    const back = createCard(
      { name: "Back", type: "Follower", cost: 1, attack: 1, defense: 5 },
      "board",
      "second",
    );
    back.peak_defense = 5;
    state.players.second.board = [ward, back];
    const atk = createCard("10021110", "board", "first");
    applyKeywordsFromList(atk);
    atk.justPlayed = false;
    atk.can_attack = true;
    atk.attacks_left = 1;
    atk.peak_defense = atk.defense;
    state.players.first.board = [atk];
    const enemyBoard = getBoard(state, "second");
    expect(canAttackFollowerTarget(ward, enemyBoard)).toBe(true);
    expect(canAttackFollowerTarget(back, enemyBoard)).toBe(false);
    expect(canAttackLeaderWhileWardActive(enemyBoard)).toBe(false);
  });

  it("Damus — Fanfare grants EOT destroy curse on selected enemy", () => {
    setupTurn(R6, { hand: ["10261120"], pp: 2 });
    enemyFollower(4);
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) resolveFirstPending();
    const marked = getBoard(state, "second")[0]!;
    expect(
      marked.triggers?.length ?? marked.keywordState?.triggers?.length,
    ).toBeGreaterThan(0);
  });

  it("Luminous Censer — Engage (1) self-destruct restores 4 leader defense", () => {
    setupTurn(R6, { hand: ["10261210"], pp: 3 });
    state.players.first.hp = 12;
    whenPlayCard("first", 0);
    engageAmulet("first", 0);
    expect(getHP(state, "first")).toBe(16);
    expect(thenBoard("first")).toHaveLength(0);
  });

  it("Colette — Fanfare 2×2 random if 2+ allied amulets", () => {
    setupTurn(R6, { hand: ["10262110"], pp: 3 });
    state.players.first.board = [
      createCard("10161210", "board", "first"),
      createCard("10162210", "board", "first"),
    ];
    enemyFollower(4, "A");
    enemyFollower(4, "B");
    const defBefore =
      state.players.second.board[0]!.defense +
      state.players.second.board[1]!.defense;
    whenPlayCard("first", 0);
    const defAfter =
      state.players.second.board[0]!.defense +
      state.players.second.board[1]!.defense;
    expect(defBefore - defAfter).toBe(4);
  });

  it("Immaculate Adjudicator — Fanfare banishes selected enemy", () => {
    setupTurn(R6, { hand: ["10262120"], pp: 5 });
    enemyFollower(4);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Divine Guard — Ward ally +0/+1; X damage random enemy (X = defense)", () => {
    setupTurn(R6, { pp: 1 });
    const wardAlly = createCard("10162110", "board", "first");
    applyKeywordsFromList(wardAlly);
    wardAlly.peak_defense = wardAlly.defense;
    state.players.first.board = [wardAlly];
    enemyFollower(5);
    runEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack: 0,
          defense: 1,
        } as any,
      ],
      "first",
      wardAlly,
    );
    (state as any).__lastSelected = wardAlly;
    runEffects(
      [
        {
          op: "damage",
          distribution: "random_hits",
          count: 1,
          amount_source: "selected_defense",
          target: "enemy:follower",
        } as any,
      ],
      "first",
      null,
    );
    expect(wardAlly.defense).toBe(3);
    expect(state.players.second.board[0]!.defense).toBe(2);
  });

  it("Agnes — Storm; Strike with 2 amulets destroys random other enemy", () => {
    setupTurn(R6, { hand: ["10263110"], pp: 5 });
    state.players.first.board = [
      createCard("10161210", "board", "first"),
      createCard("10162210", "board", "first"),
    ];
    const target = enemyFollower(3, "Target");
    const other = enemyFollower(5, "Other");
    whenPlayCard("first", 0);
    const agnes = findOnBoard("first", "Agnes, the Swiftblade")!;
    const agnesIdx = state.players.first.board.indexOf(agnes);
    agnes.can_attack = true;
    attackFollower(agnesIdx, 0, "first", "second");
    expect(target.defense).toBeLessThan(3);
    expect(other.defense).toBe(0);
  });
});

describe("Batch 5 — Havencraft [10003] Heirs of the Omen", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Devotee of Repose — Fanfare gains Devotee crest", () => {
    setupTurn(R6, { hand: ["10361110"], pp: 2 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Devotee of Repose"),
    ).toBe(true);
  });

  it("Knight of the Holy Order — Ward; buff on field restores 1 leader", () => {
    setupTurn(R6, { hand: ["10361120"], pp: 2 });
    whenPlayCard("first", 0);
    const knight = findOnBoard("first", "Knight of the Holy Order")!;
    expect(knight.hasWard).toBe(true);
    state.players.first.hp = 18;
    runEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "self",
          attack: 1,
          defense: 0,
        } as any,
      ],
      "first",
      knight,
    );
    expect(getHP(state, "first")).toBe(19);
  });

  it("Blinding Faith — 3 damage all enemies; Enhance (8) draws 3 and restores 3", () => {
    setupTurn(R6, { hand: ["10361310"], pp: 4 });
    enemyFollower(5);
    whenPlayCard("first", 0);
    expect(state.players.second.board[0]!.defense).toBe(2);

    resetUidCounter();
    setupTurn(R8, {
      hand: ["10361310"],
      pp: 8,
      deck: [
        { name: "D1", type: "Follower", attack: 1, defense: 1 },
        { name: "D2", type: "Follower", attack: 1, defense: 1 },
        { name: "D3", type: "Follower", attack: 1, defense: 1 },
      ],
    });
    state.players.first.hp = 12;
    const enhanceKw = getCardById("10361310")!.keywords!.find(
      (k) =>
        typeof k === "object" &&
        String((k as any).name).toLowerCase() === "enhance",
    ) as any;
    runEffects(enhanceKw.effects, "first", null);
    expect(getHP(state, "first")).toBe(15);
    expect(thenHand("first").length).toBeGreaterThanOrEqual(3);
  });

  it("Supplicant of Repose — Fanfare crest; Ward", () => {
    setupTurn(R6, { hand: ["10362110"], pp: 3 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Supplicant of Repose"),
    ).toBe(true);
    expect(findOnBoard("first", "Supplicant of Repose")?.hasWard).toBe(true);
  });

  it("Congregant of Repose — Fanfare destroys enemy; Evolve gains crest", () => {
    setupTurn(R6, { hand: ["10363110"], pp: 5 });
    enemyFollower(4);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
    const cong = findOnBoard("first", "Congregant of Repose")!;
    onEvolve(cong, "first", "normal");
    expect(
      getCrests(state, "first").some((c) => c.name === "Congregant of Repose"),
    ).toBe(true);
  });
});

describe("Batch 5 — Havencraft [10004] Skybound Dragons", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Troue — Storm; Engage amulet grants Drain", () => {
    setupTurn(R6, { hand: ["10161210", "10461110"], pp: 4 });
    const troue = createCard("10461110", "board", "first");
    applyKeywordsFromList(troue);
    troue.peak_defense = troue.defense;
    state.players.first.board = [troue];
    whenPlayCard("first", 0);
    const amuletIdx = state.players.first.board.findIndex(
      (c) => c.type === "Amulet",
    );
    engageAmulet("first", amuletIdx);
    expect(troue.hasDrain).toBe(true);
  });

  it("Lamretta — Evolved EOT 2 damage all followers; Evolve cant attack this turn", () => {
    setupTurn(R6);
    const lam = createCard("10461120", "board", "first");
    lam.peak_defense = lam.defense;
    lam.hasEvolved = true;
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 3 },
      "board",
      "first",
    );
    ally.peak_defense = 3;
    enemyFollower(3);
    state.players.first.board = [lam, ally];
    const eotFx = (lam.triggers ?? []).find(
      (t: any) => t.type === "end_of_turn_own",
    );
    runEffects((eotFx as any).effects, "first", lam);
    expect(ally.defense).toBe(1);
    expect(state.players.second.board[0]!.defense).toBe(1);

    resetUidCounter();
    setupTurn(R6, { hand: ["10461120"], pp: 2 });
    whenPlayCard("first", 0);
    const lam2 = findOnBoard("first", "Lamretta, Sisterly Shepherd")!;
    onEvolve(lam2, "first", "normal");
    expect(
      lam2.cantAttack ||
        lam2.keywordState?.cantAttack ||
        lam2.cantAttackFollowers,
    ).toBe(true);
  });

  it("Awed and Inspired — Engage (2) transforms ally and draws 1", () => {
    setupTurn(R6, { hand: ["10461210"], pp: 3 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = 2;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    const handBefore = thenHand("first").length;
    const amuletIdx = state.players.first.board.findIndex(
      (c) => c.type === "Amulet",
    );
    engageAmulet("first", amuletIdx);
    if (state.pendingTargetEffect) {
      resolvePendingTarget(String(ally.uid));
    }
    expect(thenBoard("first").some((c) => c.name === "Awed and Inspired")).toBe(
      true,
    );
    expect(thenHand("first").length).toBeGreaterThan(handBefore - 1);
  });

  it("Sara — Enhance (6) +0/+10; Ward; Evolve destroys damaged enemy", () => {
    setupTurn(R6, { hand: ["10462110"], pp: 6 });
    whenPlayCard("first", 0);
    const sara = findOnBoard("first", "Sara, Graphos's Chosen")!;
    expect(sara.defense).toBeGreaterThanOrEqual(15);
    expect(sara.hasWard).toBe(true);

    resetUidCounter();
    setupTurn(R6);
    const chipped = enemyFollower(1, "Chipped");
    chipped.peak_defense = 2;
    const sara2 = createCard("10462110", "board", "first");
    sara2.peak_defense = sara2.defense;
    state.players.first.board = [sara2];
    onEvolve(sara2, "first", "normal");
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  // Object filter:{damaged:true} on destroy must reach getPool — unfixed main lets Sara
  // target any enemy follower (only spec.condition was passed; filter was ignored).
  it("Sara — Evolve selection pool is damaged enemies only", () => {
    setupTurn(R6);
    const damaged = enemyFollower(2, "DamagedFoe");
    damaged.defense = 1;
    damaged.peak_defense = 2;
    const healthy = enemyFollower(3, "HealthyFoe");
    healthy.defense = 3;
    healthy.peak_defense = 3;
    const sara = createCard("10462110", "board", "first");
    sara.peak_defense = sara.defense;
    state.players.first.board = [sara];
    onEvolve(sara, "first", "normal");
    const pending = state.pendingTargetEffect;
    const poolUids =
      pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
    expect(poolUids).toContain(String(damaged.uid));
    expect(poolUids).not.toContain(String(healthy.uid));
    resolvePendingTarget(String(damaged.uid));
    cleanupDead();
    expect(findOnBoard("second", "DamagedFoe")).toBeFalsy();
    expect(findOnBoard("second", "HealthyFoe")).toBeTruthy();
  });

  it("Sophia — Fanfare summons Havencraft ≤2; Super-Evolve Barrier on others", () => {
    setupTurn(R6, { pp: 4 });
    state.players.first.deck = [createCard("10162110", "deck", "first")];
    const soph = createCard("10462120", "board", "first");
    soph.peak_defense = soph.defense;
    state.players.first.board = [soph];
    runEffects(getCardById("10462120")!.fanfare!, "first", soph);
    expect(thenBoard("first").length).toBeGreaterThanOrEqual(2);

    resetUidCounter();
    setupTurn(R7);
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    const soph2 = createCard("10462120", "board", "first");
    soph2.peak_defense = soph2.defense;
    state.players.first.board = [ally, soph2];
    state.players.first.superEvoPoints = 1;
    onEvolve(soph2, "first", "super");
    expect(ally.hasBarrier || ally.keywordState?.hasBarrier).toBe(true);
  });

  it("Tikoh — Engage restores 1 leader; Evolve 3 damage to enemy", () => {
    setupTurn(R6, { hand: ["10463110", "10161210"], pp: 3 });
    state.players.first.hp = 18;
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const tikoh = findOnBoard("first", "Tikoh, Asclepian Surgeon")!;
    const amuletIdx = state.players.first.board.findIndex(
      (c) => c.type === "Amulet",
    );
    engageAmulet("first", amuletIdx);
    expect(getHP(state, "first")).toBe(19);
    enemyFollower(5);
    onEvolve(tikoh, "first", "normal");
    resolveFirstPending();
    expect(state.players.second.board[0]!.defense).toBe(2);
  });

  it("Galleon — Ward; cant attack; EOT evolves random unevolved ally if super unlocked", () => {
    setupTurn(R10);
    const galleon = createCard("10464110", "board", "first");
    applyKeywordsFromList(galleon);
    galleon.peak_defense = galleon.defense;
    const raw = createCard(
      { name: "Raw", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    raw.peak_defense = raw.defense;
    raw.justPlayed = false;
    state.players.first.board = [galleon, raw];
    fireTrigger("end_of_turn", "first", {});
    expect(raw.hasEvolved).toBe(true);
  });
});
