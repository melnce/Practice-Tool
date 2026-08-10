/**
 * Super-evolve dedup + replicate — live card-data behavioral tests (Brief 8).
 * Assertions from card text + rulebook; uses real all.json via card DB (setup.ts).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { onEvolve, resolveEvolveEffects } from "../../src/logic/evolveUtils.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getBoard, getHand } from "../../src/core/playerHelpers.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import "../../src/logic/core/effects/index.js";
import type { CardInstance } from "../../src/core/types/index.js";

function resolveFirstPendingPoolTarget(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

describe("§747 live data — super-evolve after dedup (all.json)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.roundCount = 7;
  });

  it("Leah (10001120): super-evolve draws 1 from live card data", () => {
    givenGameState({ seed: 1, roundCount: 7 })
      .withFirstDeck([
        { name: "DeckFodder", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();

    const leah = createCard("10001120", "board", "first");
    applyKeywordsFromList(leah);
    leah.peak_defense = leah.defense;
    state.players.first.board = [leah];

    expect(leah.superevolve).toEqual([]);
    expect(leah.evolve?.length).toBeGreaterThan(0);

    const handBefore = thenHand("first").length;
    onEvolve(leah, "first", "super");
    expect(thenHand("first").length).toBe(handBefore + 1);
  });

  it("Amorous (10052120): normal evolve → 2 Ghosts without Drain; super → 2 Ghosts with Drain", () => {
    givenGameState({ seed: 2, roundCount: 7 }).build();

    const template = getCardById("10052120");
    expect(template?.superevolve).toHaveLength(1);
    expect((template?.superevolve as any)?.[0]?.op).toBe("keyword");

    const amorous = createCard("10052120", "board", "first");
    amorous.peak_defense = amorous.defense;
    state.players.first.board = [amorous];

    onEvolve(amorous, "first", "normal");
    const normalGhosts = getBoard(state, "first").filter(
      (c) => c.name === "Ghost",
    );
    expect(normalGhosts).toHaveLength(2);
    expect(normalGhosts.every((g) => !g.hasDrain)).toBe(true);

    state.players.first.board = [];
    const amorous2 = createCard("10052120", "board", "first");
    amorous2.peak_defense = amorous2.defense;
    state.players.first.board = [amorous2];

    onEvolve(amorous2, "first", "super");
    const superGhosts = getBoard(state, "first").filter(
      (c) => c.name === "Ghost",
    );
    expect(superGhosts).toHaveLength(2);
    expect(superGhosts.every((g) => g.hasDrain)).toBe(true);
  });

  it("Velharia (10334110): super-evolve fires evolve banish + superevolve all copies", () => {
    givenGameState({ seed: 3, roundCount: 7 }).build();

    const velharia = createCard("10334110", "board", "first");
    velharia.peak_defense = velharia.defense;
    state.players.first.board = [velharia];

    const enemyA = createCard("10001110", "board", "second");
    const enemyB = createCard("10001110", "board", "second");
    enemyA.peak_defense = enemyA.defense;
    enemyB.peak_defense = enemyB.defense;
    state.players.second.board = [enemyA, enemyB];

    expect(resolveEvolveEffects(velharia, "super")).toHaveLength(2);

    onEvolve(velharia, "first", "super");
    expect(state.pendingTargetEffect).toBeDefined();
    resolveFirstPendingPoolTarget();

    expect(
      getBoard(state, "second").filter(
        (c) => c?.name === "Indomitable Fighter",
      ),
    ).toHaveLength(0);
  });
});

describe("Replicate op — live fanfare re-execution", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.roundCount = 7;
  });

  it("Winged Warrior: replicate re-prompts; evolve buff can target a different ally than fanfare", () => {
    givenGameState({ seed: 4, roundCount: 7 }).build();

    const ally1 = createCard("10001110", "board", "first");
    const ally2 = createCard("10001110", "board", "first");
    ally1.peak_defense = ally1.defense;
    ally2.peak_defense = ally2.defense;

    const winged = createCard("10061130", "board", "first");
    winged.peak_defense = winged.defense;
    winged.hasEvolved = false;
    state.players.first.board = [ally1, ally2, winged];

    expect(winged.evolve).toEqual([{ op: "replicate", zone: "fanfare" }]);

    runEffects([...(winged.fanfare ?? [])], "first", winged);
    expect(state.pendingTargetEffect).toBeDefined();
    resolvePendingTarget(String(ally1.uid));
    expect(Number(ally1.attack)).toBe(3);
    expect(Number(ally2.attack)).toBe(2);

    onEvolve(winged, "first", "normal");
    expect(state.pendingTargetEffect).toBeDefined();
    resolvePendingTarget(String(ally2.uid));
    expect(Number(ally2.attack)).toBe(3);
    expect(Number(ally1.attack)).toBe(3);
  });

  it("Apollo: non-targeted replicate deals fanfare damage again without prompt", () => {
    givenGameState({ seed: 5, roundCount: 7 }).build();

    const enemy = createCard(
      { name: "Weak", type: "Follower", cost: 1, attack: 1, defense: 3 },
      "board",
      "second",
    );
    enemy.peak_defense = 3;
    state.players.second.board = [enemy];

    const apollo = createCard("10102110", "board", "first");
    apollo.peak_defense = apollo.defense;
    apollo.hasEvolved = false;
    state.players.first.board = [apollo];

    expect(apollo.evolve).toEqual([{ op: "replicate", zone: "fanfare" }]);

    runEffects([...(apollo.fanfare ?? [])], "first", apollo);
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(enemy.defense)).toBe(2);

    onEvolve(apollo, "first", "normal");
    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(enemy.defense)).toBe(1);
  });
});
