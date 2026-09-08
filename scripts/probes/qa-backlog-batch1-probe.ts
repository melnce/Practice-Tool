#!/usr/bin/env npx tsx
/**
 * Investigation probes for official Q&A backlog batch 1.
 * Prints observed engine results vs official answers.
 */
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../../tests/harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { faithCrestNameForCard } from "../../src/logic/faith/bootstrap.js";
import {
  getGraveyard,
  getHand,
  getHP,
  getCrests,
  setRally,
} from "../../src/core/playerHelpers.js";
import {
  hasPlayedBaseCostLadder,
  recordPlayedBaseCost,
} from "../../src/logic/core/playedBaseCostHistory.js";
import "../../src/logic/core/effects/index.js";

const LYMAGA = "10214120";
const TRAP = "10911210";
const ADVENT = "10621310";
const FENNIE = "10244120";
const JAILOR = "10901110";
const GILDARIA = "10224110";
const MAY = "10012110";
const LAMRETTA = "10461120";
const GALLEON = "10464110";
const ALABASTER = "10804110";
const FILLER = "10111310";

function evolveFollower(
  card: ReturnType<typeof createCard>,
  owner: "first" | "second",
  mode: "normal" | "super" = "normal",
) {
  const ps = state.players[owner];
  ps.evoUsedThisTurn = false;
  if (mode === "super") {
    ps.superEvoPoints = Math.max(1, ps.superEvoPoints ?? 0);
    ps.superEvoCharges = Math.max(1, ps.superEvoCharges ?? 0);
  }
  handleEvolveSelf(card, owner, { mode, spendPoint: true });
}

function enemyFollower(def = 5, owner: "first" | "second" = "second") {
  const c = createCard(
    { name: "Victim", type: "Follower", cost: 2, attack: 2, defense: def },
    "board",
    owner,
  );
  c.peak_defense = def;
  state.players[owner].board.push(c);
  return c;
}

function allyFollower(def = 5, owner: "first" | "second" = "first") {
  const c = createCard(
    { name: "Ally", type: "Follower", cost: 2, attack: 1, defense: def },
    "board",
    owner,
  );
  c.peak_defense = def;
  state.players[owner].board.push(c);
  return c;
}

function probe(label: string, fn: () => void) {
  console.log(`\n=== ${label} ===`);
  resetUidCounter();
  state.gameStarted = true;
  state.phase = "main";
  state.activePlayer = "first";
  fn();
}

await initCardDatabaseNode();

probe("1. Lymaga 10214120 — bleed on both players' EOT", () => {
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 10 })
    .withFirstHand([LYMAGA])
    .withFirstPP(7, 10)
    .build();
  const victim = enemyFollower(5);
  whenPlayCard("first", 0);
  const lym = findOnBoard("first", "Lymaga, Untamed Wild")!;
  evolveFollower(lym, "first", "super");
  const pending0 = state.pendingTargetEffect;
  if (pending0?.poolUids?.[0])
    resolvePendingTarget(String(pending0.poolUids[0]));
  else if (pending0?.pool?.[0])
    resolvePendingTarget(String(pending0.pool[0].uid));
  const pending1 = state.pendingTargetEffect;
  if (pending1?.poolUids?.[1])
    resolvePendingTarget(String(pending1.poolUids[1]));
  else if (pending1?.pool?.[1])
    resolvePendingTarget(String(pending1.pool[1].uid));
  state.players.second.hp = 20;
  const def0 = Number(victim.defense);
  whenEndTurn();
  const afterMyEot = {
    hp: getHP(state, "second"),
    def: Number(victim.defense),
  };
  whenEndTurn();
  const afterOppEot = {
    hp: getHP(state, "second"),
    def: Number(victim.defense),
  };
  console.log("Official: Yes — fires each player turn");
  console.log(
    `After first EOT: leader ${afterMyEot.hp} (expect 19), victim def ${afterMyEot.def} (expect ${def0 - 2})`,
  );
  console.log(
    `After second EOT: leader ${afterOppEot.hp} (expect 18), victim def ${afterOppEot.def} (expect ${def0 - 4})`,
  );
});

probe("2. Trap 10911210 — Advent Eld Sword multi-summon", () => {
  givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
    .withFirstHand([TRAP])
    .withFirstPP(3, 6)
    .withSecondHand([ADVENT])
    .withSecondPP(5, 6)
    .build();
  whenPlayCard("first", 0);
  whenEndTurn();
  whenPlayCard("second", 0);
  const soldiers = thenBoard("second").filter(
    (c) => c.name === "Fearless Soldier",
  );
  const trap = findOnBoard("first", "Trap in the Woods");
  console.log("Official: Only first destroyed");
  console.log(
    `Soldiers alive: ${soldiers.length} (expect 2), trap gone: ${!trap}`,
  );
});

probe("3a. Fennie 10244120 — odd cost 9 halved", () => {
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
    .withFirstHand([FENNIE])
    .withFirstPP(8, 8)
    .withFirstDeck([
      { name: "Nine", type: "Spell", cost: 9, attack: 0, defense: 0 },
    ])
    .build();
  whenPlayCard("first", 0);
  const cost = thenDeck("first")[0]!.cost;
  console.log("Official: 9 → 5 (rounded up)");
  console.log(`Observed deck cost: ${cost}`);
});

probe("3b. Fennie 10244120 — two Fanfares on 9-cost", () => {
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
    .withFirstHand([FENNIE, FENNIE])
    .withFirstPP(16, 16)
    .withFirstDeck([
      { name: "Nine", type: "Spell", cost: 9, attack: 0, defense: 0 },
    ])
    .build();
  whenPlayCard("first", 0);
  const after1 = thenDeck("first")[0]!.cost;
  whenPlayCard("first", 0);
  const after2 = thenDeck("first")[0]!.cost;
  console.log("Official: halved then halved again → 9→5→3");
  console.log(`After 1st Fennie: ${after1}, after 2nd: ${after2}`);
});

probe("4. Zerael 10904110 — accelerated Jailor base cost", () => {
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
    .withFirstHand([JAILOR])
    .withFirstPP(1, 6)
    .build();
  enemyFollower(5);
  playCardNoRender(getHand(state, "first"), "first", 0);
  const gy = getGraveyard(state, "first").find((c) => c.id === JAILOR)!;
  for (let c = 2; c <= 8; c++) recordPlayedBaseCost(state, "first", c);
  const ladder = hasPlayedBaseCostLadder(
    state,
    "first",
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  console.log("Official: base cost 1");
  console.log(`GY base_cost=${gy.base_cost}, cost=${gy.cost}, type=${gy.type}`);
  console.log(`Zerael ladder complete with accel 1: ${ladder}`);
});

probe("5. Gildaria 10224110 — Rally 19 vs May combo contrast", () => {
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 7 })
    .withFirstHand([GILDARIA])
    .withFirstPP(6, 7)
    .build();
  setRally(state, "first", 19);
  state.players.first.superEvoPoints = 1;
  whenPlayCard("first", 0);
  const gild = findOnBoard("first", "Gildaria, Anathema of Peace")!;
  console.log("Official Gildaria Rally 19: Fanfare does NOT super-evolve");
  console.log(
    `Gildaria super-evolved: ${gild.evoType === "super"}, rally now ${state.players.first.rally}`,
  );

  resetUidCounter();
  givenGameState({ seed: 2, activePlayer: "first", roundCount: 6 })
    .withFirstHand([FILLER, FILLER, MAY])
    .withFirstPP(6, 6)
    .build();
  const foe = enemyFollower(5);
  foe.uid = "may_target";
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  whenPlayCard("first", 0);
  resolvePendingTarget("may_target");
  console.log("Contrast May combo 2→3: played card DOES count");
  console.log(
    `May on board: ${!!findOnBoard("first", "May, Journey Elf")}, enemy def: ${foe.defense} (expect 2)`,
  );
});

probe("6. Lamretta 10461120 — Galleon EOT evolve", () => {
  givenGameState({ seed: 42, activePlayer: "first", roundCount: 8 }).build();
  const lam = createCard(LAMRETTA, "board", "first");
  lam.peak_defense = lam.defense;
  const galleon = createCard(GALLEON, "board", "first");
  applyKeywordsFromList(galleon);
  galleon.peak_defense = galleon.defense;
  const ally = allyFollower(5);
  const foe = enemyFollower(5);
  state.players.first.board = [galleon, lam];
  runEndOfTurnBoundary("first");
  console.log("Official: No 2 damage to all followers");
  console.log(
    `Lamretta evolved: ${lam.hasEvolved}, ally def ${ally.defense}, foe def ${foe.defense} (expect 5/5)`,
  );
});

probe("7. Alabaster 10804110 — option 3 banish faiths", () => {
  givenGameState({ seed: 42, activePlayer: "first", roundCount: 10 })
    .withFirstHand([ALABASTER])
    .withFirstPP(10, 10)
    .build();
  handleGainCrest(
    { op: "crest", action: "gain", name: "Probe Crest" } as any,
    "first",
  );
  const faithName = faithCrestNameForCard("Sathanid, Eld Lance");
  handleGainCrest(
    { op: "crest", action: "gain", name: faithName, is_faith: true } as any,
    "first",
  );
  setScriptedModePickProvider(() => [2]);
  whenPlayCard("first", 0);
  setScriptedModePickProvider(null);
  const crests = getCrests(state, "first");
  console.log("Official: No — faiths not banished");
  console.log(`Crests left: ${crests.map((c) => c.name).join(", ")}`);
  console.log(`Faith remains: ${crests.some((c) => c.isFaith)}`);
});
