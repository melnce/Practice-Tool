/**
 * Combat scenario — strike / follower_strike / clash fire through attackFollower.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import "./setup.js";
import {
  driveCard,
  hasCombatTriggerEffects,
} from "../../scripts/lib/cardBehaviourDrive.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import {
  attackFollower,
  recomputeAttackFlags,
} from "../../src/logic/core/combat.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import fs from "fs";
import path from "path";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const GENTLE_TREANT = "10011130";
const EUSTACE = "10472110";
const HIGH_SPIRITED_MARAUDER = "10942110";
const ILLAMRITA = "10704110";

function loadPoolCard(id: string) {
  const all = [
    ...JSON.parse(fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8")),
    ...JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
    ),
  ] as { id: string }[];
  return all.find((c) => c.id === id)!;
}

function arenaEnemyA(board: { name?: string }[]): number {
  const idx = board.findIndex((c) => c.name === "ArenaEnemyA");
  return idx >= 0 ? idx : 0;
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("combat scenario", () => {
  beforeEach(() => resetUidCounter());

  it("hasCombatTriggerEffects detects strike and clash cards", () => {
    expect(hasCombatTriggerEffects(loadPoolCard(GENTLE_TREANT))).toBe(true);
    expect(hasCombatTriggerEffects(loadPoolCard(EUSTACE))).toBe(true);
    expect(hasCombatTriggerEffects(loadPoolCard("10001110"))).toBe(false);
  });

  it("makeCardFromDB + attackFollower fires Gentle Treant strike restore", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .withSecondPP(10, 10)
      .build();
    state.gameStarted = true;

    state.players.second.board = [
      {
        uid: "enemy-a",
        name: "ArenaEnemyA",
        type: "Follower",
        attack: 2,
        defense: 6,
        cost: 2,
        owner: "second",
        zone: "board",
      } as any,
    ];

    const template = getCardById(GENTLE_TREANT)!;
    const host = makeCardFromDB(template, "first");
    host.justPlayed = false;
    host.hasAttacked = false;
    host.attacks_left = 1;
    recomputeAttackFlags(host);
    pushToBoard(state.players.first.board, "first", host);

    applyLeaderDamage("first", 3);
    expect(state.players.first.hp).toBe(17);

    const outcome = attackFollower(
      0,
      arenaEnemyA(state.players.second.board),
      "first",
      "second",
    );
    expect(outcome.kind).toBe("done");
    expect(state.players.first.hp).toBe(19);
  }, 60_000);

  it("driveCard combat scenario replaces vanilla_place for High-Spirited Marauder", () => {
    const raw = loadPoolCard(HIGH_SPIRITED_MARAUDER);
    const result = driveCard(raw);
    expect(result.status, JSON.stringify(result)).toBe("covered");
    if (result.status !== "covered") return;

    const scenarios = result.scenarios.map((s) => s.scenario);
    expect(scenarios).toContain("combat");
    expect(scenarios).not.toContain("vanilla_place");
  }, 60_000);

  it("Illamrita keeps turn_boundary and destroy alongside combat", () => {
    const raw = loadPoolCard(ILLAMRITA);
    const result = driveCard(raw);
    expect(result.status, JSON.stringify(result)).toBe("covered");
    if (result.status !== "covered") return;

    const names = result.scenarios.map((s) => s.scenario);
    expect(names).toContain("combat");
    expect(names).toContain("turn_boundary");
    expect(names).toContain("destroy");
    expect(names).not.toContain("vanilla_place");
  }, 60_000);
});
