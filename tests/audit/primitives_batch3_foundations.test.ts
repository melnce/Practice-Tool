/**
 * Batch 3 fix pass 1 — foundational mechanics (card text + owner rulings).
 * Crest countdown/LW/EOT, Skybound gauge, Faith + Modes, effect-granted evolve.
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
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { evolveFollowerByEffect } from "../../src/logic/effects/ops/evolve.js";
import { handleGainCrest, tickCrests } from "../../src/logic/effects/crest.js";
import {
  handleMode,
  resolveModeSelectCount,
} from "../../src/logic/effects/ops/mode.js";
import { handleCrest } from "../../src/logic/effects/ops/crest/unified.js";
import {
  incrementSkyboundArt,
  getSkyboundArtGauge,
  meetsSkyboundArtThreshold,
  hasSkyboundArt,
} from "../../src/logic/effects/skybound.js";
import { handleSkyboundArtGate } from "../../src/logic/effects/gates/gates.js";
import {
  getHP,
  getCrests,
  getModeBonus,
  getHand,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FAITH_CREST = "Faith: Sham-Nacha, Heir to Entwining";

function gainFaithCrest(owner: "first" | "second" = "first") {
  handleGainCrest(
    {
      op: "crest",
      action: "gain",
      name: FAITH_CREST,
      counters: { faith: 0 },
      triggers: [
        {
          event: "select_mode",
          condition: { own_turn: true },
          effects: [
            {
              op: "crest",
              action: "add_counter",
              crest: FAITH_CREST,
              counter: "faith",
              amount: 1,
            },
          ],
        },
      ],
    } as any,
    owner,
  );
}

function faithCount(owner: "first" | "second" = "first"): number {
  const c = getCrests(state, owner).find((x) => x.name === FAITH_CREST);
  return Number(c?.counters?.faith ?? 0);
}

describe("Foundations — Crest countdown / Last Words / EOT", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("EOT crest deals 2 to holder at end of turn; countdown ticks at owner turn-start", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstHP(20, 20)
      .build();

    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Crest: Corruption (test)",
        countdown: 4,
        triggers: [
          {
            type: "end_of_turn_own",
            effects: [{ op: "damage", target: "ally:leader", amount: 2 }],
          },
        ],
      } as any,
      "first",
    );

    whenEndTurn();
    expect(getHP(state, "first")).toBe(18);
    const crest = getCrests(state, "first")[0]!;
    expect(crest.countdown).toBe(4);

    tickCrests("first");
    expect(crest.countdown).toBe(3);
    expect(getHP(state, "first")).toBe(18);
  });

  it("Last Words crest: destroyed at countdown 0 deals 20 to enemy leader", () => {
    givenGameState({ seed: 1, activePlayer: "first" })
      .withSecondHP(25, 25)
      .build();

    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: "Crest: Belial (test)",
        countdown: 1,
        keywords: ["LastWords"],
        effects: [{ op: "damage", target: "enemy:leader", amount: 20 }],
      } as any,
      "first",
    );

    tickCrests("first");
    expect(getHP(state, "second")).toBe(5);
    expect(
      getCrests(state, "first").some((c) => c.name === "Crest: Belial (test)"),
    ).toBe(false);
  });
});

describe("Foundations — Skybound Art gauge (turn# + in-hand evolves)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("gauge = roundCount + witnesses; SA ≥10, SSA ≥15; pre-hand evolves do not count", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstPP(8, 8)
      .build();

    const ally = createCard(
      { name: "EvoAlly", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = ally.defense;
    state.players.first.board = [ally];
    const belial = createCard("10454120", "hand", "first");
    state.players.first.hand.push(belial);
    expect(hasSkyboundArt(belial)).toBe(true);

    onEvolve(ally, "first", "normal", { spendPoint: false });
    expect(belial.skyboundArtEvolvesWitnessed ?? 0).toBe(0);
    expect(getSkyboundArtGauge(belial, 8)).toBe(8);
    expect(meetsSkyboundArtThreshold(belial, 10, 8)).toBe(false);

    incrementSkyboundArt("first");
    incrementSkyboundArt("first");
    incrementSkyboundArt("first");
    expect(belial.skyboundArtEvolvesWitnessed).toBe(3);
    expect(getSkyboundArtGauge(belial, 10)).toBe(13);
    expect(meetsSkyboundArtThreshold(belial, 10, 10)).toBe(true);
    expect(meetsSkyboundArtThreshold(belial, 15, 10)).toBe(false);
    expect(meetsSkyboundArtThreshold(belial, 15, 15)).toBe(true);

    expect(
      handleSkyboundArtGate(
        "first",
        { condition: "skybound_art", requirement: 10 },
        belial,
      ),
    ).toBe(true);
    expect(
      handleSkyboundArtGate(
        "first",
        { condition: "skybound_art", requirement: 15 },
        belial,
      ),
    ).toBe(false);
  });
});

describe("Foundations — Faith counter + variable Modes selection", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  const fourModeEff = {
    op: "mode",
    select: 2,
    unique: true,
    options: [
      {
        label: "A",
        effects: [{ op: "pp", action: "recover", player: "self", amount: 1 }],
      },
      {
        label: "B",
        effects: [{ op: "damage", target: "enemy:leader", amount: 1 }],
      },
      {
        label: "C",
        effects: [
          { op: "restore", target: "leader", player: "self", amount: 1 },
        ],
      },
      {
        label: "D",
        effects: [{ op: "damage", target: "enemy:leader", amount: 2 }],
      },
    ],
  };

  it("Faith +1 per selection event; Fanfare + Evolve replicate on one card = +2", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstHand(["10351110"])
      .withFirstPP(6, 6)
      .withFirstEvo(2)
      .build();
    gainFaithCrest();
    const enemy = createCard(
      { name: "Foe", type: "Follower", cost: 2, attack: 2, defense: 4 },
      "board",
      "second",
    );
    enemy.peak_defense = 4;
    state.players.second.board = [enemy];
    whenPlayCard("first", 0);
    expect(faithCount()).toBe(1);
    const devotee = findOnBoard("first", "Devotee of Entwining")!;
    onEvolve(devotee, "first", "normal");
    expect(faithCount()).toBe(2);
  });

  it("Faith +1 per selection event (2 modes in one pick = +1); two separate picks = +2", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    gainFaithCrest();
    expect(faithCount()).toBe(0);

    handleMode(fourModeEff as any, {
      owner: "first",
      sourceCard: null,
      queue: [],
    });
    expect(faithCount()).toBe(1);

    handleMode(fourModeEff as any, {
      owner: "first",
      sourceCard: null,
      queue: [],
    });
    expect(faithCount()).toBe(2);
  });

  it("pay_counter spends 10 Faith; mode_bonus stacks; select count uses base + bonus", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    gainFaithCrest();
    const crest = getCrests(state, "first")[0]!;
    crest.counters = { faith: 10 };

    handleCrest(
      {
        op: "crest",
        action: "pay_counter",
        crest: FAITH_CREST,
        counter: "faith",
        amount: 10,
        on_success_effects: [{ op: "mode_bonus", amount: 1 }],
      } as any,
      { owner: "first" },
    );
    expect(faithCount()).toBe(0);
    expect(getModeBonus(state, "first")).toBe(1);
    expect(resolveModeSelectCount(fourModeEff as any, "first")).toBe(3);

    crest.counters = { faith: 10 };
    handleCrest(
      {
        op: "crest",
        action: "pay_counter",
        crest: FAITH_CREST,
        counter: "faith",
        amount: 10,
        on_success_effects: [{ op: "mode_bonus", amount: 1 }],
      } as any,
      { owner: "first" },
    );
    expect(getModeBonus(state, "first")).toBe(2);
    expect(resolveModeSelectCount(fourModeEff as any, "first")).toBe(4);

    crest.counters = { faith: 9 };
    handleCrest(
      {
        op: "crest",
        action: "pay_counter",
        crest: FAITH_CREST,
        counter: "faith",
        amount: 10,
        on_success_effects: [{ op: "mode_bonus", amount: 1 }],
      } as any,
      { owner: "first" },
    );
    expect(faithCount()).toBe(9);
    expect(getModeBonus(state, "first")).toBe(2);
  });
});

describe("Foundations — Effect-granted evolve vs Evolve: line", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve: only on EP; When this evolves on effect + EP; player EP runs full script", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstEvo(2)
      .build();

    const nameless = createCard("10151120", "board", "first");
    nameless.peak_defense = nameless.defense;
    state.players.first.board = [nameless];
    evolveFollowerByEffect(nameless, "first");
    expect(nameless.hasEvolved).toBe(true);
    expect(nameless.evolve_trigger_always).toBeFalsy();
    expect(thenBoard("first").filter((c) => c.name === "Bat").length).toBe(0);

    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 8 })
      .withFirstEvo(2)
      .build();
    const mukan = createCard("10153130", "board", "first");
    mukan.peak_defense = mukan.defense;
    state.players.first.board = [mukan];
    expect(mukan.evolve_trigger_always).toBe(true);
    evolveFollowerByEffect(mukan, "first");
    expect(thenBoard("first").some((c) => c.name === "Ghost")).toBe(true);

    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 })
      .withFirstEvo(2)
      .build();
    const byPlayer = createCard("10151120", "board", "first");
    byPlayer.peak_defense = byPlayer.defense;
    state.players.first.board = [byPlayer];
    onEvolve(byPlayer, "first", "normal", { spendPoint: true });
    expect(thenBoard("first").filter((c) => c.name === "Bat").length).toBe(2);
  });
});
