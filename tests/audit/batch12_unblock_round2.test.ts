/**
 * Round 2 unblock: tokens, follower-enter history, ally_spell_played,
 * deck add, SEP recover, leader HP gates, until-EOT attacks_per_turn, etc.
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
  getMaxHP,
  getDeck,
  getEvoCharges,
  getSuperEvoCharges,
  getCrests,
} from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { endTurnBlue } from "../../src/logic/core/turns.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { countUniqueTribeEnters } from "../../src/logic/core/followerEnterHistory.js";
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

const AUTHORED = [
  "10523310",
  "10524120",
  "10573310",
  "10521120",
  "10522120",
  "10571120",
  "10572120",
  "10551310",
  "10534110",
  "10771110",
  "10772110",
  "10773110",
  "10764110",
  "10771120",
  "10771310",
  "10772120",
  "10773310",
  "10774110",
  "10774120",
  "10754110",
  "10761120",
  "10814120",
  "10821110",
  "10831120",
  "10824110",
  "10834110",
  "10872110",
  "10872120",
  "10873110",
  "10874120",
  "10822110",
  "10833110",
  "10873310",
  "10804120",
  "10841110",
  "10851130",
  "10843110",
  "10864110",
  "10843310",
  "10844110",
] as const;

describe("Unblock round 2 — tokens / enter-history / spell-played", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("newly authored cards classify as ops_present", () => {
    for (const id of AUTHORED) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!), id).toBe("ops_present");
    }
  });

  it("new tokens exist", () => {
    expect(getCardById("90021350")?.name).toBe("Glittering Gold");
    expect(getCardById("90071140")?.name).toBe("Ancient Artifact");
    expect(getCardById("90071130")?.tribes).toContain("Artifact");
    expect(getCardById("90064210")?.name).toBe("Rings of Moonlight");
    expect(getCardById("90014110")?.name).toBe("Eve, Blade of Crystalia");
  });

  it("Cool Courier Fanfare adds Ancient Artifact; Evolve replicates", () => {
    setupTurn(3, { hand: ["10772110"], pp: 3 });
    state.players.first.evoCharges = 2;
    whenPlayCard("first", 0);
    expect(
      getHand(state, "first").some((c) => c.name === "Ancient Artifact"),
    ).toBe(true);
    const courier = findOnBoard("first", "Cool Courier")!;
    onEvolve(courier, "first", "normal", { spendPoint: true });
    expect(
      getHand(state, "first").filter((c) => c.name === "Ancient Artifact")
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("unique Artifact enter history feeds Warp Slash damage", () => {
    setupTurn(5, { hand: ["10773310"], pp: 5 });
    for (const [id, name] of [
      ["90071130", "Analyzing Artifact"],
      ["90071140", "Ancient Artifact"],
      ["90071150", "Mystic Artifact"],
    ] as const) {
      state.players.first.followerEnterHistory.push({
        name,
        tribes: ["Artifact"],
        cardId: id,
      });
    }
    expect(countUniqueTribeEnters(state, "first", "Artifact")).toBe(3);

    const enemy = createCard("90001110", "board", "second");
    enemy.defense = 10;
    getBoard(state, "second").push(enemy);

    whenPlayCard("first", 0);
    expect(Number(enemy.defense)).toBe(7);
    expect(getHP(state, "second")).toBe(19);
  });

  it("Beat Breaker summons 2 copies when unique Artifact enters >= 3", () => {
    setupTurn(7, { hand: ["10771120"], pp: 7 });
    for (const name of [
      "Analyzing Artifact",
      "Ancient Artifact",
      "Radiant Artifact",
    ]) {
      state.players.first.followerEnterHistory.push({
        name,
        tribes: ["Artifact"],
        cardId: "x",
      });
    }
    whenPlayCard("first", 0);
    const beaters = getBoard(state, "first").filter(
      (c) => c.name === "Beat Breaker",
    );
    expect(beaters.length).toBe(3);
  });

  it("Lunar Bunny evolves when a spell is played", () => {
    setupTurn(3, {
      hand: ["10572120", "10551310"],
      pp: 5,
      deck: ["90001110"],
    });
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Lunar Bunny")?.hasEvolved).toBeFalsy();

    const enemy = createCard("90001110", "board", "second");
    enemy.defense = 5;
    getBoard(state, "second").push(enemy);

    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) resolveFirstPending();
    expect(findOnBoard("first", "Lunar Bunny")?.hasEvolved).toBe(true);
  });

  it("Olivia recovers super-evolution points", () => {
    setupTurn(9, { hand: ["10804120"], pp: 9 });
    state.players.first.superEvoCharges = 0;
    whenPlayCard("first", 0);
    expect(getSuperEvoCharges(state, "first")).toBe(2);
  });

  it("Gido evolves when leader defense <= 10", () => {
    setupTurn(4, { hand: ["10841110"], pp: 4 });
    state.players.first.hp = 10;
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Gido, Leader of the Pack")?.hasEvolved).toBe(
      true,
    );
  });

  it("Limil summons Bats when leader HP > enemy", () => {
    setupTurn(3, { hand: ["10851130"], pp: 3 });
    state.players.first.hp = 15;
    state.players.second.hp = 10;
    whenPlayCard("first", 0);
    expect(
      getBoard(state, "first").filter((c) => c.name === "Bat").length,
    ).toBe(2);
  });

  it("Ephemeral Foxfire adds a copy to the deck", () => {
    setupTurn(2, {
      hand: ["10843310"],
      pp: 2,
      deck: ["90001110"],
    });
    const enemy = createCard("90001110", "board", "second");
    getBoard(state, "second").push(enemy);
    const before = getDeck(state, "first").filter(
      (c) => c.name === "Ephemeral Foxfire",
    ).length;
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) resolveFirstPending();
    const after = getDeck(state, "first").filter(
      (c) => c.name === "Ephemeral Foxfire",
    ).length;
    expect(after).toBe(before + 1);
  });

  it("Giada Strike grants until-EOT double attack vs follower", () => {
    setupTurn(6, { hand: ["10843110"], pp: 6 });
    whenPlayCard("first", 0);
    const giada = findOnBoard("first", "Giada, Peerless Flame of War")!;
    giada.can_attack = true;
    giada.justPlayed = false;
    giada.hasRush = true;
    giada.attacks_per_turn = 1;
    giada.attacks_left = 1;

    const enemy = createCard("90001110", "board", "second");
    enemy.defense = 10;
    getBoard(state, "second").push(enemy);

    attackFollower(0, 0, "first", "second");

    expect(giada.attacks_per_turn).toBe(2);
    expect((giada as any).attacks_per_turn_pre_eot).toBeDefined();

    endTurnBlue();
    const still = getBoard(state, "first").find(
      (c) => c.name === "Giada, Peerless Flame of War",
    );
    if (still) {
      expect((still as any).attacks_per_turn_pre_eot).toBeUndefined();
    }
  });

  it("Lhynkal crest reduces enemy max defense on enter", () => {
    setupTurn(4, { hand: ["10534110", "10534110"], pp: 8 });
    whenPlayCard("first", 0);
    expect(
      getCrests(state, "first").some((c) => c.name.includes("Lhynkal")),
    ).toBe(true);
    const before = getMaxHP(state, "second");
    whenPlayCard("first", 0);
    expect(getMaxHP(state, "second")).toBe(before - 2);
  });

  it("Journey Ahead recovers EP when unique Artifact enters >= 3", () => {
    setupTurn(4, { hand: ["10873310"], pp: 4 });
    state.players.first.evoCharges = 0;
    for (const name of [
      "Analyzing Artifact",
      "Ancient Artifact",
      "Mystic Artifact",
    ]) {
      state.players.first.followerEnterHistory.push({
        name,
        tribes: ["Artifact"],
        cardId: "x",
      });
    }
    const enemy = createCard("90001110", "board", "second");
    enemy.defense = 6;
    getBoard(state, "second").push(enemy);
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) resolveFirstPending();
    expect(getEvoCharges(state, "first")).toBe(1);
  });

  it("Godwood Staff Combo(3) EOT draw after ally_spell_played mid-turn scans", () => {
    // Regression: ally_spell_played cached empty trigger candidates; playAmulet
    // must bump zoneVersion so EOT still sees the amulet.
    setupTurn(6, {
      hand: ["10111310", "10111310", "10113210"],
      pp: 5,
      deck: ["10111310", "10111310"],
    });
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    expect(findOnBoard("first", "Godwood Staff")).toBeTruthy();
    const before = getHand(state, "first").length;
    endTurnBlue();
    expect(getHand(state, "first").length).toBeGreaterThan(before);
  });
});
