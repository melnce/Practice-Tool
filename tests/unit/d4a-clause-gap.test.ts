/**
 * Phase D4a — clause-gap tests for the first 27 under-asserted cards (batch 1 of 2).
 *
 * Only adds blocks for clauses not already asserted in existing subjectBlocks.
 * See PR for the 15 full metric false positives (multi-clause titles in audit tests).
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
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
import { flushReactiveQueueOnly } from "../../src/logic/core/cleanup.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { injectAdapter } from "../../src/core/adapter.js";
import type { CardInstance } from "../../src/core/types/index.js";
import {
  getBoard,
  getHP,
  getPP,
  getHand,
  getShadows,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310";
const PAD_DECK = Array.from({ length: 20 }, () => FILLER);

const CONGREGANT = "10323110";
const KUON = "10134110";
const MUKAN = "10153130";
const KRULLE = "10314110";
const VELHARIA = "10334110";
const CAPRICIOUS_SPRITE = "10111120";
const OWL_SUMMONER = "10131130";
const PENGUIN_WIZARD = "10131140";
const WILLIAM = "10132130";
const EDELWEISS = "10133130";
const HOMEWORK = "10133310";
const IRONHEART_HUNTER = "10171130";

const FAIRY = "90011110";
const RETURNING_SLASH = "10323310";
const NOBLE_SHIKIGAMI = "90034120";
const CELESTIAL_SHIKIGAMI = "90034110";
const BLAZE_DESTROYER = "10131320";
const APOLLO = "10102110";

let fuseConfirm: (() => void) | null = null;

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
    shadows?: number;
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
  if (opts.shadows !== undefined) b = b.withFirstShadows(opts.shadows);
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

function sbCount(card: CardInstance): number {
  return (
    card.keywordState?.spellboostCount ??
    (card as { spellboostCount?: number }).spellboostCount ??
    0
  );
}

function earthSigilOnBoard(player: "first" | "second" = "first") {
  return thenBoard(player).find(
    (c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0,
  );
}

function mountFuseAdapter() {
  fuseConfirm = null;
  injectAdapter({
    render: () => {},
    showChoiceModal: () => {},
    showTargetConfirmationButton: (vm: { onConfirm: () => void }) => {
      fuseConfirm = vm.onConfirm;
    },
    hideTargetConfirmation: () => {
      fuseConfirm = null;
    },
    triggerConfirmButtonClick: () => {
      fuseConfirm?.();
    },
  });
}

beforeAll(() => {
  (globalThis as { HEADLESS?: boolean }).HEADLESS = true;
});

describe("Phase D4a — clause-gap cards (batch 1 of 2)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  it("Congregant of Usurpation (10323110) — Evolve recovers 1 play point (0 → 1)", () => {
    setupTurn(6, { hand: [CONGREGANT], pp: 4, evo: 1 });
    whenPlayCard("first", 0);
    expect(getPP(state, "first")).toBe(0);
    const cong = findOnBoard("first", "Congregant of Usurpation")!;
    whenEvolve(cong, "first");
    expect(getPP(state, "first")).toBe(1);
  }, 60_000);

  it("Congregant of Usurpation (10323110) — control: Apollo Evolve does not recover play points", () => {
    setupTurn(6, { hand: [APOLLO], pp: 3, evo: 1 });
    whenPlayCard("first", 0);
    const apollo = findOnBoard("first", "Apollo, Heaven's Envoy")!;
    expect(getPP(state, "first")).toBe(0);
    whenEvolve(apollo, "first");
    expect(getPP(state, "first")).toBe(0);
  }, 60_000);

  it("Congregant of Usurpation (10323110) — Fusing Loot spell deals 3 to enemy follower (4 → 1)", () => {
    mountFuseAdapter();
    setupTurn(6, { hand: [RETURNING_SLASH, CONGREGANT], pp: 6 });
    whenPlayCard("first", 1);
    const foe = enemyFollower(4, 4, "Chipped");
    const slash = getHand(state, "first").find(
      (c) => c.id === RETURNING_SLASH,
    )!;
    const boots = getHand(state, "first").find(
      (c) => c.name === "Gilded Boots",
    )!;
    expect(boots).toBeDefined();

    engineDispatch(state, {
      type: "FUSE",
      player: "first",
      cardUid: slash.uid,
    });
    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      player: "first",
      target: { type: "card", uid: boots!.uid },
    });
    fuseConfirm!();
    expect(Number(foe.defense)).toBe(1);
  }, 60_000);

  it("Kuon, Fivefold Master (10134110) — Enhance (10): destroys Shikigami and summons Noble Shikigami", () => {
    setupTurn(10, { hand: [KUON], pp: 10 });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Noble Shikigami")).toBeDefined();
    expect(
      thenBoard("first").filter((c) => c.id === CELESTIAL_SHIKIGAMI),
    ).toHaveLength(0);
  }, 60_000);

  it("Kuon, Fivefold Master (10134110) — without Enhance (10): keeps three Shikigami, no Noble", () => {
    setupTurn(10, { hand: [KUON], pp: 7 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.id === NOBLE_SHIKIGAMI),
    ).toHaveLength(0);
    expect(
      thenBoard("first").filter((c) => c.tribes?.includes("Shikigami")),
    ).toHaveLength(3);
  }, 60_000);

  it("Kuon, Fivefold Master (10134110) — Super-Evolve grants Storm to selected allied Shikigami", () => {
    setupTurn(10, { hand: [KUON], pp: 7, superEvo: 1 });
    whenPlayCard("first", 0);
    const kuon = findOnBoard("first", "Kuon, Fivefold Master")!;
    const shik = thenBoard("first").find((c) => c.id === CELESTIAL_SHIKIGAMI)!;
    whenSuperEvolve(kuon, "first");
    resolvePendingByUid(shik.uid);
    applyKeywordsFromList(shik);
    expect(shik.hasStorm).toBe(true);
  }, 60_000);

  it("Mukan, Shadowcrypt Ward (10153130) — Fanfare Necromancy (8): auto-evolves and spends 8 shadows", () => {
    setupTurn(8, { hand: [MUKAN], pp: 5, shadows: 8 });
    whenPlayCard("first", 0);
    const mukan = findOnBoard("first", "Mukan, Shadowcrypt Ward")!;
    expect(mukan.hasEvolved).toBe(true);
    expect(getShadows(state, "first")).toBe(0);
  }, 60_000);

  it("Mukan, Shadowcrypt Ward (10153130) — without Necromancy (8): stays unevolved", () => {
    setupTurn(8, { hand: [MUKAN], pp: 5, shadows: 7 });
    whenPlayCard("first", 0);
    const mukan = findOnBoard("first", "Mukan, Shadowcrypt Ward")!;
    expect(mukan.hasEvolved).toBeFalsy();
    expect(getShadows(state, "first")).toBe(7);
  }, 60_000);

  it("Mukan, Shadowcrypt Ward (10153130) — When this follower evolves, summons a Ghost", () => {
    setupTurn(6, { hand: [MUKAN], pp: 4, evo: 1, shadows: 0 });
    whenPlayCard("first", 0);
    const mukan = findOnBoard("first", "Mukan, Shadowcrypt Ward")!;
    whenEvolve(mukan, "first");
    expect(thenBoard("first").some((c) => c.name === "Ghost")).toBe(true);
  }, 60_000);

  // FINDING (10314110): enemy_follower_defense_down fires (stat/core.ts) but Krulle's
  // board trigger never restores leader HP. Self-Fanfare on play may also be a rules
  // question (is Krulle a board candidate while its Fanfare resolves?). Discriminator:
  // with Krulle already on board, a separate ally applies -0/-2 — restore still absent.
  it.fails(
    "Krulle, Heir to Unkilling (10314110) — own Fanfare -0/-2 does not restore leader on play (18 stays 18)",
    () => {
      setupTurn(6, { hand: [KRULLE], pp: 4, hp: 18 });
      const foe = enemyFollower(4, 4, "Victim");
      whenPlayCard("first", 0);
      flushReactiveQueueOnly();
      expect(Number(foe.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(19);
    },
    60_000,
  );

  it.fails(
    "Krulle, Heir to Unkilling (10314110) — external -0/-2 with Krulle on board does not restore leader (18 stays 18)",
    () => {
      setupTurn(6, { hand: [KRULLE], pp: 4, hp: 18 });
      whenPlayCard("first", 0);
      const foe = enemyFollower(4, 4, "Victim");
      const debuffer = allyFollower(1, 1, "Debuffer");
      runEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "enemy:follower",
            defense: -2,
          },
        ],
        "first",
        debuffer,
      );
      flushReactiveQueueOnly();
      expect(Number(foe.defense)).toBe(2);
      expect(getHP(state, "first")).toBe(19);
    },
    60_000,
  );

  it("Krulle, Heir to Unkilling (10314110) — control: no enemy defense loss keeps leader at 18 HP", () => {
    setupTurn(6, { hand: [KRULLE], pp: 4, hp: 18 });
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(18);
  }, 60_000);

  it("Velharia, Heir to Truth (10334110) — Fanfare draws a card from deck", () => {
    setupTurn(6, { hand: [VELHARIA], pp: 2, deck: [FILLER] });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.id === FILLER)).toBe(true);
  }, 60_000);

  it("Capricious Sprite (10111120) — Fanfare summons Fairy and adds Fairy to hand", () => {
    setupTurn(6, { hand: [CAPRICIOUS_SPRITE], pp: 3 });
    whenPlayCard("first", 0);
    expect(thenBoard("first").some((c) => c.id === FAIRY)).toBe(true);
    expect(thenHand("first").some((c) => c.id === FAIRY)).toBe(true);
  }, 60_000);

  it("Owl Summoner (10131130) — Evolve deals 5 damage to selected enemy (6 → 1)", () => {
    setupTurn(6, { hand: [OWL_SUMMONER], pp: 3, evo: 1 });
    const foe = enemyFollower(2, 6, "Target");
    whenPlayCard("first", 0);
    const owl = findOnBoard("first", "Owl Summoner")!;
    whenEvolve(owl, "first");
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(1);
  }, 60_000);

  it("Starry-Eyed Penguin Wizard (10131140) — Evolve spellboosts hand 2 times", () => {
    setupTurn(6, { hand: [PENGUIN_WIZARD, BLAZE_DESTROYER], pp: 4, evo: 1 });
    whenPlayCard("first", 0);
    const blast = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    const sb0 = sbCount(blast);
    const wiz = findOnBoard("first", "Starry-Eyed Penguin Wizard")!;
    whenEvolve(wiz, "first");
    expect(sbCount(blast)).toBe(sb0 + 2);
  }, 60_000);

  it("William, Mysterian Student (10132130) — Evolve spellboosts hand 2 times", () => {
    setupTurn(8, { hand: [WILLIAM, BLAZE_DESTROYER], pp: 6, evo: 1 });
    whenPlayCard("first", 0);
    const blast = thenHand("first").find((c) => c.id === BLAZE_DESTROYER)!;
    const sb0 = sbCount(blast);
    const will = findOnBoard("first", "William, Mysterian Student")!;
    whenEvolve(will, "first");
    expect(sbCount(blast)).toBe(sb0 + 2);
  }, 60_000);

  it("Edelweiss, Sagelight Ward (10133130) — EP Evolve deals 4 damage and recovers 2 PP (0 → 2)", () => {
    setupTurn(6, { hand: [EDELWEISS], pp: 4, evo: 1 });
    const foe = enemyFollower(2, 5, "Random");
    whenPlayCard("first", 0);
    expect(earthSigilOnBoard()).toBeUndefined();
    const ed = findOnBoard("first", "Edelweiss, Sagelight Ward")!;
    expect(ed.hasEvolved).toBeFalsy();
    whenEvolve(ed, "first");
    expect(Number(foe.defense)).toBe(1);
    expect(getPP(state, "first")).toBe(2);
  }, 60_000);

  it("Homework Time! (10133310) — Draw 2 cards on play (hand 0 → 2 after cast)", () => {
    setupTurn(6, {
      hand: [HOMEWORK],
      pp: 3,
      deck: [FILLER, FILLER],
    });
    whenPlayCard("first", 0);
    expect(thenHand("first").length).toBe(2);
  }, 60_000);

  it("Ironheart Hunter (10171130) — Evolve deals 3 damage to selected enemy (5 → 2)", () => {
    setupTurn(6, { hand: [IRONHEART_HUNTER], pp: 2, evo: 1 });
    const foe = enemyFollower(2, 5, "HuntTarget");
    whenPlayCard("first", 0);
    const hunter = findOnBoard("first", "Ironheart Hunter")!;
    whenEvolve(hunter, "first");
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
  }, 60_000);
});
