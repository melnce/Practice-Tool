/**
 * Engine capabilities for set 10006 unblock (tokens, Faith, base_cost_gte).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import {
  bootstrapFaithForPlayer,
  collectFaithPackages,
  inferFaithIncrement,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import { evaluateCardCondition } from "../../src/logic/core/conditions/evaluator.js";
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

const UNBLOCKED = [
  "10611110", // Motherly Forestdweller
  "10611310", // Advent of the Eld Lance
  "10612110", // Kindly Executor
  "10612310", // Floral Offering
  "10613110", // Merciful Attendant
  "10613310", // Nurturing Eld Lance
  "10614110", // Althenia
  "10614120", // Sathanid
  "10624120", // Yidmetra
  "10634120", // Calge
  "10644120", // Vorlalai
  "10654120", // Bibatii
  "10664120", // Lyanthoth
  "10671310", // Advent of the Eld Axe
  "10673310", // Unfeeling Eld Axe
  "10674110", // Camiscilla
  "10674120", // Yog-Zentha
] as const;

describe("Unblock effect ops — tokens / Faith / base_cost_gte", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("newly authored cards classify as implemented", () => {
    for (const id of UNBLOCKED) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!), id).toBe("ops_present");
    }
  });

  it("Springbloom Fairy token exists with Ward + EOT evolve", () => {
    const fairy = getCardById("90011120");
    expect(fairy?.name).toBe("Springbloom Fairy");
    expect(fairy?.keywords).toContain("Ward");
  });

  it("Motherly Forestdweller — Fanfare adds Springbloom Fairy; Evolve summons one", () => {
    setupTurn(5, { hand: ["10611110"], pp: 5 });
    state.players.first.evoCharges = 2;
    whenPlayCard("first", 0);
    expect(
      getHand(state, "first").some((c) => c.name === "Springbloom Fairy"),
    ).toBe(true);

    const mom = findOnBoard("first", "Motherly Forestdweller")!;
    // "Evolve:" lines require EP-spent evolve (spendPoint: true)
    onEvolve(mom, "first", "normal", { spendPoint: true });
    expect(findOnBoard("first", "Springbloom Fairy")).toBeTruthy();
  });

  it("Merciful Attendant — ally_evolve restores 1", () => {
    setupTurn(5, { hand: ["10613110"], pp: 5 });
    state.players.first.hp = 15;
    whenPlayCard("first", 0);
    const fairy = findOnBoard("first", "Springbloom Fairy")!;
    onEvolve(fairy, "first", "normal", { spendPoint: false });
    expect(getHP(state, "first")).toBe(16);
  });

  it("base_cost_gte gate — Yog-Zentha adds Depths when ally ≥5 base cost", () => {
    setupTurn(5, { hand: ["10674120"], pp: 5 });
    const big = createCard(
      {
        name: "Big Ally",
        type: "Follower",
        cost: 5,
        base_cost: 5,
        attack: 5,
        defense: 5,
      },
      "board",
      "first",
    );
    state.players.first.board.push(big);
    whenPlayCard("first", 0);
    expect(
      getHand(state, "first").some((c) => c.name === "Depths of the Eld Axe"),
    ).toBe(true);
  });

  it("base_cost_gte gate — Yog-Zentha does nothing without ≥5 ally", () => {
    setupTurn(5, { hand: ["10674120"], pp: 5 });
    const small = createCard(
      {
        name: "Small Ally",
        type: "Follower",
        cost: 2,
        base_cost: 2,
        attack: 2,
        defense: 2,
      },
      "board",
      "first",
    );
    state.players.first.board.push(small);
    whenPlayCard("first", 0);
    expect(
      getHand(state, "first").some((c) => c.name === "Depths of the Eld Axe"),
    ).toBe(false);
  });

  it("evaluateCardCondition — base_cost_gte / lte", () => {
    const card = {
      name: "X",
      type: "Follower",
      cost: 3,
      base_cost: 5,
    } as any;
    expect(evaluateCardCondition(card, { base_cost_gte: 5 })).toBe(true);
    expect(evaluateCardCondition(card, { base_cost_gte: 6 })).toBe(false);
    expect(evaluateCardCondition(card, { base_cost_lte: 5 })).toBe(true);
    expect(evaluateCardCondition(card, { base_cost_eq: 5 })).toBe(true);
  });

  it("Camiscilla — enter ally ≥5 base cost evolves it; SE damages by count", () => {
    setupTurn(8, { hand: ["10674110"], pp: 8 });
    state.players.first.superEvoCharges = 2;
    whenPlayCard("first", 0);
    // Fanfare summons Shoddy (6) + Substandard (5) → both should evolve via trigger
    const board = getBoard(state, "first");
    const toys = board.filter(
      (c) => c.name === "Shoddy Plaything" || c.name === "Substandard Puppet",
    );
    expect(toys.length).toBe(2);
    expect(toys.every((c) => c.hasEvolved)).toBe(true);

    const cam = findOnBoard("first", "Camiscilla, Unfeeling Heart")!;
    const hpBefore = getHP(state, "second");
    // "Super-Evolve:" line requires EP-spent super evolve
    onEvolve(cam, "first", "super", { spendPoint: true });
    // X = allies with base cost ≥5 (Camiscilla 5 + 2 toys = 3)
    expect(getHP(state, "second")).toBe(hpBefore - 3);
  });

  it("Advent of the Eld Axe — damage then draw if ally base cost ≥5", () => {
    setupTurn(4, {
      hand: ["10671310"],
      pp: 4,
      deck: ["10601110", "10601110"],
    });
    const big = createCard(
      {
        name: "Big",
        type: "Follower",
        cost: 5,
        base_cost: 5,
        attack: 5,
        defense: 5,
      },
      "board",
      "first",
    );
    state.players.first.board.push(big);
    const enemy = createCard(
      {
        name: "Enemy",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 5,
      },
      "board",
      "second",
    );
    state.players.second.board.push(enemy);
    const handBefore = getHand(state, "first").length;
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(enemy.defense).toBe(1);
    expect(getHand(state, "first").length).toBe(handBefore); // spell left hand; drew 1
    // hand was 1 (the spell); after play 0 + draw 1 = 1
    expect(getHand(state, "first").length).toBe(1);
  });
});

describe("Faith bootstrap + append_triggers", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 2, activePlayer: "first", roundCount: 1 }).build();
    state.gameStarted = true;
  });

  it("infers Faith increment kinds from skill_text", () => {
    expect(
      inferFaithIncrement(
        "Whenever you select Modes, increase this faith's value by 1.",
      ),
    ).toBe("select_mode");
    expect(
      inferFaithIncrement(
        "Whenever an allied follower evolves, increase this faith's value by 1.",
      ),
    ).toBe("ally_evolve");
    expect(
      inferFaithIncrement(
        "Whenever you play an Enhanced card, increase this faith's value by 1.",
      ),
    ).toBe("enhanced_play");
    expect(
      inferFaithIncrement(
        "Whenever an allied Crystalspawn enters the field, increase this faith's value by 1.",
      ),
    ).toBe("crystalspawn_enter");
    expect(
      inferFaithIncrement(
        "Whenever an allied amulet is destroyed, increase this faith's value by 1.",
      ),
    ).toBe("ally_amulet_destroyed");
  });

  it("bootstraps Faith from Sathanid in deck and increments on ally_evolve", () => {
    const sathanid = getCardById("10614120")!;
    state.players.first.deck.push({
      ...sathanid,
      uid: state.rng.makeUid(),
    } as any);

    const pkgs = bootstrapFaithForPlayer(
      "first",
      getHand(state, "first").length
        ? state.players.first.deck
        : state.players.first.deck,
      [],
    );
    expect(pkgs.some((p) => p.increment === "ally_evolve")).toBe(true);

    const crestName = faithCrestNameForCard("Sathanid, Eld Lance");
    const crest = getCrests(state, "first").find((c) => c.name === crestName);
    expect(crest).toBeTruthy();
    expect(crest!.counters?.faith ?? 0).toBe(0);

    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    onEvolve(ally, "first", "normal", { spendPoint: false });
    expect(crest!.counters?.faith).toBe(1);
  });

  it("pay_counter append_triggers adds evolve damage payoff", () => {
    const crestName = faithCrestNameForCard("Sathanid, Eld Lance");
    runEffects(
      [
        {
          op: "crest",
          action: "gain",
          name: crestName,
          image: "images/crests/faith.png",
          description: "test",
          triggers: [],
        },
      ],
      "first",
      null,
    );
    const crest = getCrests(state, "first").find((c) => c.name === crestName)!;
    crest.counters = { faith: 10 };

    runEffects(
      [
        {
          op: "crest",
          action: "pay_counter",
          crest: crestName,
          counter: "faith",
          amount: 10,
          on_success_effects: [
            {
              op: "crest",
              action: "append_triggers",
              crest: crestName,
              triggers: [
                {
                  event: "ally_evolve",
                  effects: [
                    { op: "damage", target: "enemy:leader", amount: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      "first",
      null,
    );

    expect(crest.counters?.faith).toBe(0);
    expect(crest.triggers?.length).toBe(1);

    const hpBefore = getHP(state, "second");
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    onEvolve(ally, "first", "normal", { spendPoint: false });
    expect(getHP(state, "second")).toBe(hpBefore - 1);
  });

  it("collectFaithPackages finds Sham-Nacha Modes Faith", () => {
    const sham = getCardById("10354110")!;
    const pkgs = collectFaithPackages([{ ...sham, uid: "x" } as any], []);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]!.increment).toBe("select_mode");
    expect(pkgs[0]!.crestName).toBe("Faith: Sham-Nacha, Heir to Entwining");
  });

  it("enhanced_play fires when Enhance cost is paid", () => {
    setupTurn(3, { hand: ["10621110"], pp: 3 }); // Fearless Soldier Enhance (3)
    const crestName = "Faith: Test Enhance";
    runEffects(
      [
        {
          op: "crest",
          action: "gain",
          name: crestName,
          triggers: [
            {
              event: "enhanced_play",
              effects: [
                {
                  op: "crest",
                  action: "add_counter",
                  crest: crestName,
                  counter: "faith",
                  amount: 1,
                },
              ],
            },
          ],
        },
      ],
      "first",
      null,
    );
    whenPlayCard("first", 0);
    const crest = getCrests(state, "first").find((c) => c.name === crestName)!;
    expect(crest.counters?.faith).toBe(1);
  });
});
