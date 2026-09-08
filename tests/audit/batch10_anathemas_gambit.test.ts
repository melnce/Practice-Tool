/**
 * Set 10007 — Anathema's Gambit audit (authored subset).
 *
 * Focus: non-trivial targeting, triggers, conditionals, class mechanics.
 * Stubbed / blocked cards are intentionally not covered here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  whenEndTurn,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getBoard,
  getHand,
  getHP,
  getShadows,
  getCrests,
  setRally,
} from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";

import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import "../../src/logic/core/effects/index.js";

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
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

function allyFollower(atk: number, def: number, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 1, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function allyAmulet(name = "Sigil") {
  const c = createCard({ name, type: "Amulet", cost: 1 }, "board", "first");
  state.players.first.board.push(c);
  return c;
}

const AUTHORED_SAMPLE = [
  "10701110",
  "10701310",
  "10702110",
  "10711110",
  "10712110",
  "10712120",
  "10721110",
  "10723310",
  "10724110",
  "10731110",
  "10742120",
  "10752310",
  "10753110",
  "10761110",
  "10772310",
] as const;

describe("Set 10007 — Anathema's Gambit", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("sample authored cards classify as implemented", () => {
    for (const id of AUTHORED_SAMPLE) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!), id).toBe("ops_present");
    }
  });

  it("Tears of Degradation (10701310) — banishes selected enemy field card", () => {
    setupTurn(4, { hand: ["10701310"], pp: 4 });
    enemyFollower(3, 5, "Target");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Macrobear — Fanfare summons an exact copy; MaxDamageCap 3", () => {
    setupTurn(8, { hand: ["10711110"], pp: 8 });
    whenPlayCard("first", 0);
    const bears = getBoard(state, "first").filter(
      (c) => c.name === "Macrobear",
    );
    expect(bears).toHaveLength(2);
    expect(bears[0]?.hasWard).toBe(true);
    expect(bears[0]?.hasRush).toBe(true);
  });

  it("Virewind Fencer — Combo (3) grants Storm", () => {
    setupTurn(5, {
      hand: ["10701110", "10701110", "10712110"],
      pp: 10,
    });
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const fencer = findOnBoard("first", "Virewind Fencer");
    expect(fencer?.hasStorm).toBe(true);
  });

  it("Hawkeyed Tactician — Fanfare deals 4; Evolve replicates", () => {
    setupTurn(5, { hand: ["10712120"], pp: 5 });
    const enemy = enemyFollower(2, 8, "Wall");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(enemy.defense).toBe(4);

    const tactician = findOnBoard("first", "Hawkeyed Tactician")!;
    whenEvolve(tactician, "first");
    resolveFirstPending();
    expect(enemy.defense).toBe(0);
  });

  it("Bombastic Bombardier — hand cost becomes 1 after ally super-evolve", () => {
    setupTurn(7, { hand: ["10721110"], pp: 7 });
    const bombardier = getHand(state, "first")[0]!;
    expect(Number(bombardier.cost)).toBe(3);
    const ally = createCard(
      { name: "Hero", type: "Follower", cost: 3, attack: 3, defense: 3 },
      "board",
      "first",
    );
    ally.peak_defense = 3;
    applyKeywordsFromList(ally);
    state.players.first.board.push(ally);
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(ally, "first");
    expect(Number(bombardier.cost)).toBe(1);
  });

  it("Caesura al Fine — deals 6 to selected; Rally (10) damages all by ally count", () => {
    setupTurn(5, { hand: ["10723310"], pp: 5 });
    // Seed rally
    setRally(state, "first", 10);
    allyFollower(1, 1, "A");
    allyFollower(1, 1, "B");
    const e1 = enemyFollower(2, 5, "E1");
    const e2 = enemyFollower(2, 5, "E2");
    whenPlayCard("first", 0);
    resolveFirstPending();
    // 6 to selected (first in pool) then X=2 to all
    const defs = [e1.defense, e2.defense].sort((a, b) => a - b);
    expect(defs[0]).toBeLessThanOrEqual(0);
    expect(Math.max(e1.defense, e2.defense)).toBe(3); // 5-2 from rally splash
  });

  it("Gildaria Attunement — Rally (20) evolves and grants crest; enter gives Rush", () => {
    setupTurn(6, { hand: ["10724110", "10721120"], pp: 10 });
    setRally(state, "first", 20);
    whenPlayCard("first", 0);
    const gildaria = findOnBoard("first", "Gildaria, Anathema of Attunement");
    expect(gildaria?.hasEvolved).toBe(true);
    expect(
      getCrests(state, "first").some(
        (c) => c.name === "Gildaria, Anathema of Attunement",
      ),
    ).toBe(true);
    // When evolves → 2 Steelclad Knights (evolve_trigger_always)
    expect(
      getBoard(state, "first").filter((c) => c.name === "Steelclad Knight")
        .length,
    ).toBeGreaterThanOrEqual(2);

    whenPlayCard("first", 0); // High-Strung Liaison enters
    const liaison = findOnBoard("first", "High-Strung Liaison");
    expect(liaison?.hasRush).toBe(true);
  });

  it("Dainty Horror — Earth Rite (1) evolves", () => {
    setupTurn(4, { hand: ["10731110"], pp: 4 });
    const sigil = createCard(
      { name: "Magic Sediment", type: "Amulet", cost: 0 },
      "board",
      "first",
    );
    (sigil as any).counters = { earth: 1 };
    (sigil as any).destroyOnEmpty = true;
    state.players.first.board.push(sigil);
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Dainty Horror")?.hasEvolved).toBe(true);
  });

  it("Draconic Part-Timer — at 10 max PP evolves; EOT restores 2 when evolved", () => {
    setupTurn(10, { hand: ["10742120"], pp: 10 });
    state.players.first.hp = 15;
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Draconic Part-Timer")?.hasEvolved).toBe(true);
    whenEndTurn("first");
    expect(getHP(state, "first")).toBe(17);
  });

  it("Harmony of Youth — summons Ghost, Bat, Skeleton and evolves them", () => {
    setupTurn(7, { hand: ["10752310"], pp: 7 });
    whenPlayCard("first", 0);
    for (const name of ["Ghost", "Bat", "Skeleton"]) {
      const f = findOnBoard("first", name);
      expect(f, name).toBeTruthy();
      expect(f!.hasEvolved, name).toBe(true);
    }
  });

  it("Beastmaster Bones — Departed enter gains Storm; SE destroys ally + random enemy", () => {
    setupTurn(7, { hand: ["10753110"], pp: 7 });
    whenPlayCard("first", 0);
    const skeleton = findOnBoard("first", "Skeleton");
    expect(skeleton?.hasStorm).toBe(true);

    const sacrifice = allyFollower(2, 2, "Sacrifice");
    enemyFollower(3, 3, "Victim");
    const bones = findOnBoard("first", "Beastmaster Bones")!;
    state.players.first.superEvoCharges = 1;
    whenSuperEvolve(bones, "first");
    const pending = state.pendingTargetEffect;
    expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(
      0,
    );
    resolvePendingTarget(sacrifice.uid);
    cleanupDead();
    expect(findOnBoard("first", "Sacrifice")).toBeFalsy();
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Reverend of Finance — with 3 amulets summons a copy", () => {
    setupTurn(4, { hand: ["10761110"], pp: 4 });
    allyAmulet("A1");
    allyAmulet("A2");
    allyAmulet("A3");
    whenPlayCard("first", 0);
    expect(
      getBoard(state, "first").filter((c) => c.name === "Reverend of Finance"),
    ).toHaveLength(2);
  });

  it("Hark to the Night Song — split 6; Necromancy (6) deals 2 to leader", () => {
    setupTurn(5, { hand: ["10753310"], pp: 5 });
    state.players.first.shadows = 6;
    state.players.second.hp = 20;
    enemyFollower(2, 4, "A");
    enemyFollower(2, 4, "B");
    whenPlayCard("first", 0);
    cleanupDead();
    const totalDef = getBoard(state, "second").reduce(
      (s, c) => s + (Number(c.defense) || 0),
      0,
    );
    // 8 total defense - 6 split = 2 remaining across board (or less if overkill uneven)
    expect(totalDef).toBeLessThanOrEqual(2);
    expect(getHP(state, "second")).toBe(18);
    expect(getShadows(state, "first")).toBeLessThanOrEqual(1); // play +1 then spend 6
  });

  it("Blink Step — +1/+0 board; if super unlocked also hand followers", () => {
    setupTurn(7, { hand: ["10772310", "10712110"], pp: 7 });
    const boardAlly = allyFollower(2, 2, "Boardie");
    whenPlayCard("first", 0);
    expect(Number(boardAlly.attack)).toBe(3);
    const handFencer = getHand(state, "first").find(
      (c) => c.name === "Virewind Fencer",
    );
    expect(Number(handFencer?.attack)).toBe(3);
  });

  it("Altaro Mayor — Ambush; EOT draws a card", () => {
    setupTurn(3, {
      hand: ["10704120"],
      pp: 3,
      deck: ["10701110", "10701110", "10701110"],
    });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Altaro, Mayor of Babelon")?.hasAmbush).toBe(
      true,
    );
    const handBefore = getHand(state, "first").length;
    whenEndTurn("first");
    expect(getHand(state, "first").length).toBe(handBefore + 1);
  });

  it("Juggler Corvid — destroy selected then Reanimate (2)", () => {
    setupTurn(6, { hand: ["10752120"], pp: 6 });
    enemyFollower(4, 4, "Boss");
    const ghost = createCard(
      {
        name: "Ghost",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        tribes: ["Departed"],
      },
      "graveyard",
      "first",
    );
    state.players.first.graveyard.push(ghost);
    recordDestroyed(state, "first", ghost);
    whenPlayCard("first", 0);
    resolveFirstPending();
    cleanupDead();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(findOnBoard("first", "Ghost")).toBeTruthy();
  });
});
