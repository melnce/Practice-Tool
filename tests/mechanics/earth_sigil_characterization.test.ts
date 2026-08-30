/**
 * Earth Sigil stack characterization tests — behavior must not change during
 * the name-check removal refactor (rulebook §804 Earth Rite / Earth Sigils).
 */
import { beforeEach, describe, expect, it } from "vitest";
import "./setup.js";
import {
  createCard,
  givenGameState,
  resetUidCounter,
  whenPlayCard,
  whenRunEffects,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import {
  consumeEarthSigils,
  hasEarthSigils,
} from "../../src/logic/effects/ops/earth.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { getShadows } from "../../src/core/playerHelpers.js";
import { initAmulet } from "../../src/logic/effects/ops/summon_ops/init.js";
import "../../src/logic/core/effects/index.js";

const WITCHS_NEW_BREW = "10031210";
const MAGIC_SEDIMENT = "90031210";
const REMI_RAMI = "10032110";
const DAZZLING_RUNEKNIGHT = "10031110";

function earthSigilsOnBoard(player: "first" | "second" = "first") {
  return thenBoard(player).filter(
    (c) => c.type === "Amulet" && (c.counters?.earth ?? 0) > 0,
  );
}

function totalEarthStack(player: "first" | "second" = "first"): number {
  return earthSigilsOnBoard(player).reduce(
    (sum, c) => sum + (c.counters?.earth ?? 0),
    0,
  );
}

function summonMagicSediments(count: number): void {
  whenRunEffects(
    [
      {
        op: "summon",
        source: "named",
        name: "Magic Sediment",
        count,
      } as any,
    ],
    "first",
    null,
  );
}

describe("Earth Sigil stack characterization", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it("summoning 4 Magic Sediments yields one amulet with counters.earth === 4", () => {
    summonMagicSediments(4);

    const sigils = earthSigilsOnBoard();
    expect(sigils).toHaveLength(1);
    expect(sigils[0]!.counters?.earth).toBe(4);
    expect(thenBoard("first")).toHaveLength(1);
  });

  it("hasEarthSigils is true for 1/2/3 with stack 4 and false for 5", () => {
    summonMagicSediments(4);

    expect(hasEarthSigils("first", 1)).toBe(true);
    expect(hasEarthSigils("first", 2)).toBe(true);
    expect(hasEarthSigils("first", 3)).toBe(true);
    expect(hasEarthSigils("first", 4)).toBe(true);
    expect(hasEarthSigils("first", 5)).toBe(false);
  });

  it("Earth Rite (3) consumes 3 sigils and leaves a stack of 1", () => {
    summonMagicSediments(4);

    expect(consumeEarthSigils("first", 3)).toBe(true);
    expect(totalEarthStack("first")).toBe(1);
    expect(earthSigilsOnBoard()).toHaveLength(1);
    expect(earthSigilsOnBoard()[0]!.counters?.earth).toBe(1);
  });

  it("Earth Rite (N) with fewer than N sigils does not consume and the rest still resolves", () => {
    const knight = createCard(DAZZLING_RUNEKNIGHT, "board", "first");
    knight.peak_defense = knight.defense;
    state.players.first.board = [knight];

    whenRunEffects(
      [
        {
          op: "earth_rite",
          cost: 3,
          effects: [
            {
              op: "stat",
              action: "give",
              target: "self",
              attack: 9,
              defense: 9,
            },
          ],
        } as any,
      ],
      "first",
      knight,
    );

    expect(totalEarthStack("first")).toBe(0);
    expect(Number(knight.attack)).toBe(2);
    expect(Number(knight.defense)).toBe(2);
  });

  it("consuming the last sigil removes the amulet and adds 1 shadow", () => {
    summonMagicSediments(1);
    expect(getShadows(state, "first")).toBe(0);

    expect(consumeEarthSigils("first", 1)).toBe(true);

    expect(earthSigilsOnBoard()).toHaveLength(0);
    expect(thenBoard("first")).toHaveLength(0);
    expect(getShadows(state, "first")).toBe(1);
  });

  it("rulebook example: stack of 3 plus gain 2 yields 5 on one amulet", () => {
    const sigil = createCard(MAGIC_SEDIMENT, "board", "first");
    initAmulet(sigil);
    sigil.counters = { earth: 3 };
    state.players.first.board = [sigil];

    summonMagicSediments(2);

    const sigils = earthSigilsOnBoard();
    expect(sigils).toHaveLength(1);
    expect(sigils[0]!.counters?.earth).toBe(5);
    expect(thenBoard("first")).toHaveLength(1);
  });

  it("full board: Earth Rite (1) summon frees the sigil slot for Guardian Golem", () => {
    const fillers = Array.from({ length: 4 }, (_, i) =>
      createCard(
        {
          name: `Filler ${i}`,
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        "board",
        "first",
      ),
    );
    const sigil = createCard(MAGIC_SEDIMENT, "board", "first");
    initAmulet(sigil);
    sigil.counters = { earth: 1 };
    state.players.first.board = [...fillers, sigil];
    expect(thenBoard("first")).toHaveLength(5);

    whenRunEffects(
      [
        {
          op: "earth_rite",
          cost: 1,
          effects: [
            {
              op: "summon",
              source: "named",
              name: "Guardian Golem",
              count: 1,
            },
          ],
        } as any,
      ],
      "first",
      createCard(REMI_RAMI, "hand", "first"),
    );

    expect(earthSigilsOnBoard()).toHaveLength(0);
    expect(findOnBoard("first", "Guardian Golem")).toBeDefined();
    expect(thenBoard("first")).toHaveLength(5);
    expect(getShadows(state, "first")).toBe(1);
  });

  it("playing Witch's New Brew merges into an existing Magic Sediment stack", () => {
    summonMagicSediments(2);
    expect(totalEarthStack("first")).toBe(2);

    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHand([WITCHS_NEW_BREW])
      .withFirstPP(10, 10)
      .withFirstBoard(thenBoard("first"))
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);

    const sigils = earthSigilsOnBoard();
    expect(sigils).toHaveLength(1);
    expect(sigils[0]!.counters?.earth).toBe(3);
    expect(thenBoard("first")).toHaveLength(1);
  });

  it("Magic Sediment Engage (1) adds 1 to the stack", () => {
    summonMagicSediments(1);
    const sigil = earthSigilsOnBoard()[0]!;
    expect(sigil.counters?.earth).toBe(1);

    const idx = thenBoard("first").indexOf(sigil);
    engageAmulet("first", idx);

    expect(sigil.counters?.earth).toBe(2);
    expect(earthSigilsOnBoard()).toHaveLength(1);
  });

  it("Witch's New Brew has destroyOnEmpty after normal initialization", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstHand([WITCHS_NEW_BREW])
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    whenPlayCard("first", 0);

    const brew = thenBoard("first")[0]!;
    expect(brew.name).toBe("Witch's New Brew");
    expect(brew.destroyOnEmpty).toBe(true);
  });
});
