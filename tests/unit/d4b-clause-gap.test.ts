/**
 * Phase D4b — second 27 under-asserted cards: one asserting block per missing clause.
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
} from "../harness/builders.js";
import { whenEvolve, whenSuperEvolve } from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  getBoard,
  getHP,
  getHand,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 20 }, () => FILLER);

const SYLVIA = "10173120";
const EUDIE = "10174110";
const ORCHIS = "10174120";
const HNIKAR = "10203120";
const FAIRY_FENCER = "10212120";
const TITANIA = "10214110";
const YURIUS = "10224120";
const ENCHANTING_PERFUMER = "10232120";
const SEASONED_MERMAN = "10242120";
const FILENE = "10244110";
const LAURA = "10253110";
const WILBERT = "10264120";
const ZWEI = "10274110";
const HAMLET = "10312210";
const DEVOTEE_USURPATION = "10321110";
const SUPPLICANT_USURPATION = "10322110";
const ASCETIC = "10331120";
const OCEAN_RIDER = "10342120";
const DEVOTEE_ENTWINING = "10351110";
const SUPPLICANT_ENTWINING = "10352110";
const CASTLE_ENTWINING = "10352210";
const CONGREGANT_ENTWINING = "10353110";
const BLINDING_FAITH = "10361310";
const WINGED_LION = "10362220";
const CONGREGANT_REPOSE = "10363110";
const ALFIED = "10802110";
const PRIMATE_PLOTTERS = "10912120";

const FAIRY = "90011110";
const KNIGHT = "90021110";
const ENHANCED_PUPPET = "90071120";
const MAJESTIC_MEGALORCA = "90041130";
const PAPER_SHIKIGAMI = "90031130";
const HOLY_CAVALIER = "90064110";
const GILDED_BOOTS = "90021330";
const GILDED_GOBLET = "90021320";
const GILDED_NECKLACE = "90021340";
const GILDED_BLADE = "90021310";
const HOLY_FALCON = "90061110";
const HOLYFLAME_TIGER = "90061120";
const RUSH_ONLY_ALLY = "90041130";

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

describe("Phase D4b — clause-gap cards (second 27)", () => {
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

  it("Hnikar & Jafnhar, Firestorm Duo (10203120) — Last Words without Enhance deals no damage (6 → 6); with Enhance deals 4 (6 → 2)", () => {
    setupTurn(6, { hand: [HNIKAR], pp: 2 });
    const unevolvedFoe = enemyFollower(2, 6, "UnevolvedFoe");
    whenPlayCard("first", 0);
    const h = findOnBoard("first", "Hnikar & Jafnhar, Firestorm Duo")!;
    expect(h.hasEvolved !== true && h.isEvolved !== true).toBe(true);
    h.defense = 0;
    cleanupDead();
    expect(Number(unevolvedFoe.defense)).toBe(6);

    resetUidCounter();
    setupTurn(6, { hand: [HNIKAR], pp: 5 });
    const evolvedFoe = enemyFollower(2, 6, "EvolvedFoe");
    whenPlayCard("first", 0);
    const h2 = findOnBoard("first", "Hnikar & Jafnhar, Firestorm Duo")!;
    expect(h2.hasEvolved || h2.isEvolved).toBe(true);
    h2.defense = 0;
    cleanupDead();
    expect(Number(evolvedFoe.defense)).toBe(2);
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

  it("Yurius, Levin Authority (10224120) — Fanfare summons 2 enemy Knight (90021110) on opponent board", () => {
    setupTurn(8, { hand: [YURIUS], pp: 8 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Yurius, Levin Authority")).toBeTruthy();
    expect(
      getBoard(state, "second").filter((c) => c.id === KNIGHT),
    ).toHaveLength(2);
  }, 60_000);

  it("Enchanting Perfumer (10232120) — Fanfare deals 3 damage (5 → 2) and gains earth sigil", () => {
    setupTurn(6, { hand: [ENCHANTING_PERFUMER], pp: 4 });
    const foe = enemyFollower(2, 5, "Foe");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
    expect(earthSigilOnBoard()?.counters?.earth).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("Seasoned Merman (10242120) — Fanfare summons 2 Majestic Megalorca (90041130)", () => {
    setupTurn(6, { hand: [SEASONED_MERMAN], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.id === MAJESTIC_MEGALORCA),
    ).toHaveLength(2);
    expect(findOnBoard("first", "Seasoned Merman")?.hasEvolved).toBeFalsy();
  }, 60_000);

  it("Filene, Whitefrost Bloom (10244110) — Evolve deals 1 damage to all enemy followers (4 → 3)", () => {
    setupTurn(6, { hand: [FILENE], pp: 2, evo: 1, maxPP: 6 });
    const foe = enemyFollower(2, 4, "Foe");
    whenPlayCard("first", 0);
    const filene = findOnBoard("first", "Filene, Whitefrost Bloom")!;
    whenEvolve(filene, "first");
    expect(Number(foe.defense)).toBe(3);
    expect(thenHand("first").some((c) => c.name === "Whitefrost Whisper")).toBe(
      false,
    );
  }, 60_000);

  it("Laura, Cruel Commander (10253110) — Super-Evolve gives Storm to another ally (control: Rush-only ally stays 2/2)", () => {
    setupTurn(6, { hand: [LAURA], pp: 4, superEvo: 1, evo: 1 });
    const rushAlly = createCard(RUSH_ONLY_ALLY, "board", "first");
    rushAlly.peak_defense = rushAlly.defense;
    applyKeywordsFromList(rushAlly);
    state.players.first.board.unshift(rushAlly);
    whenPlayCard("first", 0);
    resolveFirstPending();
    const laura = findOnBoard("first", "Laura, Cruel Commander")!;
    whenSuperEvolve(laura, "first");
    resolvePendingByUid(rushAlly.uid);
    applyKeywordsFromList(rushAlly);
    expect(rushAlly.hasStorm || rushAlly.keywordState?.hasStorm).toBe(true);
    expect(laura.hasStorm || laura.keywordState?.hasStorm).toBeFalsy();
  }, 60_000);

  it("Wilbert, Desolate Paladin (10264120) — Last Words summons 2 Holy Cavalier (90064110)", () => {
    setupTurn(8, { hand: [WILBERT], pp: 6 });
    whenPlayCard("first", 0);
    const wilbert = findOnBoard("first", "Wilbert, Desolate Paladin")!;
    wilbert.defense = 0;
    cleanupDead();
    expect(
      thenBoard("first").filter((c) => c.id === HOLY_CAVALIER),
    ).toHaveLength(2);
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

  it("Hamlet of Unkilling (10312210) — Fanfare discards 1 and draws 2 (hand 2 → 3)", () => {
    setupTurn(6, {
      hand: [HAMLET, FILLER, FILLER],
      pp: 3,
      deck: [FILLER, FILLER],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBe(2);
    resolveFirstPending();
    expect(thenHand("first").length).toBe(3);
    expect(findOnBoard("first", "Hamlet of Unkilling")).toBeTruthy();
  }, 60_000);

  it("Devotee of Usurpation (10321110) — Last Words adds Gilded Goblet (90021320) to hand", () => {
    setupTurn(6, { hand: [DEVOTEE_USURPATION], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === GILDED_BOOTS)).toBe(true);
    const dev = findOnBoard("first", "Devotee of Usurpation")!;
    dev.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.id === GILDED_GOBLET)).toBe(true);
  }, 60_000);

  it("Supplicant of Usurpation (10322110) — Last Words adds Gilded Blade (90021310) to hand", () => {
    setupTurn(6, { hand: [SUPPLICANT_USURPATION], pp: 2 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === GILDED_NECKLACE)).toBe(true);
    const sup = findOnBoard("first", "Supplicant of Usurpation")!;
    sup.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.id === GILDED_BLADE)).toBe(true);
  }, 60_000);

  it("Ascetic of Wuxing (10331120) — Fanfare summons Paper Shikigami (90031130)", () => {
    setupTurn(6, { hand: [ASCETIC], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.id === PAPER_SHIKIGAMI)).toBe(true);
  }, 60_000);

  it("Ocean Rider (10342120) — allied Marine enter gains Ward while Ocean Rider on board", () => {
    setupTurn(7, { hand: [OCEAN_RIDER, MAJESTIC_MEGALORCA], pp: 3, maxPP: 7 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Ocean Rider")).toBeTruthy();
    whenPlayCard("first", 0);
    const marine = thenBoard("first").find((c) => c.id === MAJESTIC_MEGALORCA);
    expect(marine).toBeDefined();
    applyKeywordsFromList(marine!);
    expect(marine!.hasWard || marine!.keywordState?.hasWard).toBe(true);
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

  it("Blinding Faith (10361310) — base spell deals 3 to all enemy followers (5 → 2) without Enhance", () => {
    setupTurn(6, { hand: [BLINDING_FAITH], pp: 4 });
    const foe = enemyFollower(2, 5, "Foe");
    const hpBefore = getHP(state, "first");
    whenPlayCard("first", 0);
    expect(Number(foe.defense)).toBe(2);
    expect(getHP(state, "first")).toBe(hpBefore);
    expect(thenHand("first")).toHaveLength(0);
  }, 60_000);

  it("Winged Lion Statue (10362220) — Last Words summons Holy Falcon (90061110) and Holyflame Tiger (90061120)", () => {
    setupTurn(6, { hand: [WINGED_LION], pp: 3 });
    whenPlayCard("first", 0);
    const lion = findOnBoard("first", "Winged Lion Statue")!;
    lion.countdown = 0;
    lion.defense = 0;
    cleanupDead();
    expect(thenBoard("first").some((c) => c.id === HOLY_FALCON)).toBe(true);
    expect(thenBoard("first").some((c) => c.id === HOLYFLAME_TIGER)).toBe(true);
  }, 60_000);

  it("Congregant of Repose (10363110) — Fanfare destroys selected enemy follower", () => {
    setupTurn(6, { hand: [CONGREGANT_REPOSE], pp: 5 });
    enemyFollower(3, 4, "Foe");
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(
      getCrests(state, "first").some((c) => c.name === "Congregant of Repose"),
    ).toBe(false);
  }, 60_000);

  it("Alfied, Squire of Joy (10802110) — Fanfare deals 4 damage to enemy follower (5 → 1)", () => {
    setupTurn(6, { hand: [ALFIED], pp: 4 });
    const foe = enemyFollower(2, 5, "Wall");
    whenPlayCard("first", 0);
    resolvePendingByUid(foe.uid);
    expect(Number(foe.defense)).toBe(1);
    const alfied = findOnBoard("first", "Alfied, Squire of Joy")!;
    applyKeywordsFromList(alfied);
    expect(alfied.hasStorm || alfied.keywordState?.hasStorm).toBeFalsy();
  }, 60_000);

  it("Primate Plotters (10912120) — Evolve replicates Fanfare copy to hand", () => {
    setupTurn(6, { hand: [PRIMATE_PLOTTERS], pp: 3, evo: 1 });
    state.players.second.hand.push(
      createCard(
        { id: "10131310", name: "Radiant Rainbow", type: "Spell", cost: 2 },
        "hand",
        "second",
      ),
    );
    whenPlayCard("first", 0);
    const copiesAfterFanfare = thenHand("first").filter(
      (c) => c.name === "Radiant Rainbow",
    ).length;
    const plotter = findOnBoard("first", "Primate Plotters")!;
    whenEvolve(plotter, "first");
    expect(
      thenHand("first").filter((c) => c.name === "Radiant Rainbow").length,
    ).toBeGreaterThan(copiesAfterFanfare);
  }, 60_000);
});
