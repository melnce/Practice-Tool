/**
 * Regression: Yube, Crestpetal (`10544120`) crest stat uses until_eot on stat op.
 * On main without duration.ts alias, Marine attack buffs were permanent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenEndTurn,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";

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

function injectYubeCrest(): void {
  const yubeCard = getCardById("10544120")!;
  const crestEff = (
    yubeCard.evolve as { op: string; triggers?: unknown[] }[]
  ).find((e) => e.op === "crest") as { name: string; triggers: unknown[] };
  state.players.first.crests = [
    {
      name: crestEff.name,
      owner: "first",
      insertionTs: 1,
      triggers: crestEff.triggers,
    },
  ] as any;
}

describe("Yube, Crestpetal — crest Marine attack buff until end of turn", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("pre-fix (main): without temporaryBuffs tracking, EOT does not revert stacked buffs", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    injectYubeCrest();

    const megalorca = createCard("90041130", "board", "first");
    megalorca.can_attack = true;
    megalorca.attacks_left = 2;
    megalorca.justPlayed = false;
    megalorca.hasStorm = true;
    state.players.first.board = [megalorca];

    const baseAtk = Number(megalorca.attack);
    enemyFollower(0, 10, "E1");
    enemyFollower(0, 10, "E2");

    attackFollower(0, 0, "first", "second");
    attackFollower(0, 1, "first", "second");
    expect(Number(megalorca.attack)).toBe(baseAtk + 2);

    // Main bug: until_eot on stat op did not enroll temporaryBuffs for cleanup.
    megalorca.temporaryBuffs = [];
    whenEndTurn();
    expect(Number(megalorca.attack)).toBe(baseAtk + 2);
  });

  it("stacks +1/+0 within the turn and clears after end of turn", () => {
    givenGameState({ seed: 42, activePlayer: "first", roundCount: 6 })
      .withFirstPP(6, 6)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";

    injectYubeCrest();

    const megalorca = createCard("90041130", "board", "first");
    megalorca.can_attack = true;
    megalorca.attacks_left = 2;
    megalorca.justPlayed = false;
    megalorca.hasStorm = true;
    state.players.first.board = [megalorca];

    const baseAtk = Number(megalorca.attack);
    enemyFollower(0, 10, "E1");
    enemyFollower(0, 10, "E2");

    attackFollower(0, 0, "first", "second");
    expect(Number(megalorca.attack)).toBe(baseAtk + 1);
    expect(megalorca.temporaryBuffs?.length).toBeGreaterThan(0);

    attackFollower(0, 1, "first", "second");
    expect(Number(megalorca.attack)).toBe(baseAtk + 2);
    expect(megalorca.temporaryBuffs?.length).toBe(2);

    whenEndTurn();

    expect(megalorca.temporaryBuffs?.length ?? 0).toBe(0);
    expect(Number(megalorca.attack)).toBe(baseAtk);
  });
});
