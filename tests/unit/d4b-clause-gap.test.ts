/**
 * Phase D4b — second 27 under-asserted cards: one asserting block per genuinely
 * missing clause (12 real gaps; 15 metric false positives removed after body review).
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
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getBoard, getHP, getCrests } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 20 }, () => FILLER);

const SYLVIA = "10173120";
const EUDIE = "10174110";
const ORCHIS = "10174120";
const FAIRY_FENCER = "10212120";
const TITANIA = "10214110";
const ENCHANTING_PERFUMER = "10232120";
const ZWEI = "10274110";
const ASCETIC = "10331120";
const DEVOTEE_ENTWINING = "10351110";
const SUPPLICANT_ENTWINING = "10352110";
const CASTLE_ENTWINING = "10352210";
const CONGREGANT_ENTWINING = "10353110";

const FAIRY = "90011110";
const ENHANCED_PUPPET = "90071120";
const PAPER_SHIKIGAMI = "90031130";

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

function earthSigilOnBoard(player: "first" | "second" = "first") {
  return thenBoard(player).find(
    (c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0,
  );
}

function pickMode(index: number): void {
  if (state.pendingModeChoice) state.pendingModeChoice.selectedIndex = index;
}

describe("Phase D4b — clause-gap cards (12 real gaps)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Sylvia, Garden Executioner (10173120) — Evolve destroys selected enemy follower", () => {
    setupTurn(8, { hand: [SYLVIA], pp: 6, evo: 1 });
    const foe = enemyFollower(3, 4, "Foe");
    whenPlayCard("first", 0);
    pickMode(0);
    const sylvia = findOnBoard("first", "Sylvia, Garden Executioner")!;
    whenEvolve(sylvia, "first");
    resolvePendingByUid(foe.uid);
    expect(getBoard(state, "second")).toHaveLength(0);
  }, 60_000);

  it("Eudie, Maiden Reborn (10174110) — Fanfare draws a card (hand 0 → 1)", () => {
    setupTurn(6, { hand: [EUDIE], pp: 3, deck: [FILLER] });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Eudie, Maiden Reborn")).toBeTruthy();
    expect(thenHand("first").some((c) => c.id === FILLER)).toBe(true);
  }, 60_000);

  it("Orchis, Newfound Heart (10174120) — Super-Evolve summons 2 Enhanced Puppet (90071120)", () => {
    setupTurn(8, { hand: [ORCHIS], pp: 8, superEvo: 1, evo: 1 });
    whenPlayCard("first", 0);
    const orchis = findOnBoard("first", "Orchis, Newfound Heart")!;
    whenSuperEvolve(orchis, "first");
    expect(
      thenBoard("first").filter((c) => c.id === ENHANCED_PUPPET),
    ).toHaveLength(2);
  }, 60_000);

  it("Fairy Fencer (10212120) — Fanfare adds Fairy (90011110) to hand", () => {
    setupTurn(6, { hand: [FAIRY_FENCER], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === FAIRY)).toBe(true);
  }, 60_000);

  it("Titania, Queen of Fairies (10214110) — Fanfare summons Fairy (90011110) and gains crest", () => {
    setupTurn(6, { hand: [TITANIA], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.id === FAIRY)).toBe(true);
    expect(
      getCrests(state, "first").some((c) => c.name?.includes("Titania")),
    ).toBe(true);
  }, 60_000);

  it("Enchanting Perfumer (10232120) — Fanfare deals 3 damage (5 → 2) and gains earth sigil", () => {
    setupTurn(6, { hand: [ENCHANTING_PERFUMER], pp: 4 });
    const foe = enemyFollower(2, 5, "Foe");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("Zwei, Symphonic Heart (10274110) — Evolve summons Enhanced Puppet (90071120)", () => {
    setupTurn(6, { hand: [ZWEI], pp: 5, evo: 1 });
    whenPlayCard("first", 0);
    const zwei = findOnBoard("first", "Zwei, Symphonic Heart")!;
    const puppetsBefore = thenBoard("first").filter(
      (c) => c.id === ENHANCED_PUPPET,
    ).length;
    whenEvolve(zwei, "first");
    expect(
      thenBoard("first").filter((c) => c.id === ENHANCED_PUPPET).length,
    ).toBe(puppetsBefore + 1);
  }, 60_000);

  it("Ascetic of Wuxing (10331120) — Fanfare summons Paper Shikigami (90031130)", () => {
    setupTurn(6, { hand: [ASCETIC], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.id === PAPER_SHIKIGAMI)).toBe(true);
  }, 60_000);

  it("Devotee of Entwining (10351110) — Evolve replicates Fanfare mode 1 (enemy 3 → 2)", () => {
    setupTurn(6, { hand: [DEVOTEE_ENTWINING], pp: 4, evo: 1 });
    const foe = enemyFollower(2, 3, "Foe");
    whenPlayCard("first", 0);
    pickMode(0);
    expect(Number(foe.defense)).toBe(2);
    const dev = findOnBoard("first", "Devotee of Entwining")!;
    whenEvolve(dev, "first");
    pickMode(0);
    expect(Number(foe.defense)).toBe(1);
  }, 60_000);

  it("Supplicant of Entwining (10352110) — Fanfare mode 2 restores 2 defense to leader (15 → 17)", () => {
    setScriptedModePickProvider(() => [1]);
    setupTurn(6, { hand: [SUPPLICANT_ENTWINING], pp: 5, hp: 15 });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(17);
    setScriptedModePickProvider(null);
  }, 60_000);

  it("Castle of Entwining (10352210) — Engage (1) replicates Fanfare draw (deck card enters hand)", () => {
    setupTurn(6, {
      hand: [CASTLE_ENTWINING],
      pp: 3,
      deck: [{ name: "Drawn", type: "Follower", attack: 1, defense: 1 }],
    });
    const ally = allyFollower(1, 1, "Ally");
    setScriptedModePickProvider(() => [1]);
    whenPlayCard("first", 0);
    expect(Number(ally.attack)).toBe(2);
    expect(thenHand("first").some((c) => c.name === "Drawn")).toBe(false);
    setScriptedModePickProvider(() => [0]);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Castle of Entwining",
    );
    engageAmulet("first", idx);
    expect(thenHand("first").some((c) => c.name === "Drawn")).toBe(true);
    setScriptedModePickProvider(null);
  }, 60_000);

  it("Congregant of Entwining (10353110) — Super-Evolve replicates Fanfare (summons another copy)", () => {
    setScriptedModePickProvider(() => [0]);
    setupTurn(8, { hand: [CONGREGANT_ENTWINING], pp: 6, superEvo: 1, evo: 1 });
    whenPlayCard("first", 0);
    const beforeSe = thenBoard("first").filter(
      (c) => c.name === "Congregant of Entwining",
    ).length;
    expect(beforeSe).toBeGreaterThanOrEqual(2);
    const cong = findOnBoard("first", "Congregant of Entwining")!;
    whenSuperEvolve(cong, "first");
    expect(
      thenBoard("first").filter((c) => c.name === "Congregant of Entwining")
        .length,
    ).toBeGreaterThan(beforeSe);
    setScriptedModePickProvider(null);
  }, 60_000);
});
