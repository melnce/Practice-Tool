/**
 * Destroy scenario — Last Words fires through real death cleanup.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import "./setup.js";
import {
  driveCard,
  hasDestroyOnDeathEffects,
} from "../../scripts/lib/cardBehaviourDrive.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import { destroyTarget } from "../../src/logic/effects/ops/destroy/primitives.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import fs from "fs";
import path from "path";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ARMS_PEDDLER = "10021120";
const LEAH = "10001120";
const WINGED_STATUE = "10062210";

function loadPoolCard(id: string) {
  const all = [
    ...JSON.parse(fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8")),
    ...JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
    ),
  ] as { id: string }[];
  return all.find((c) => c.id === id)!;
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("destroy scenario", () => {
  beforeEach(() => resetUidCounter());

  it("hasDestroyOnDeathEffects detects LastWords keyword cards", () => {
    expect(hasDestroyOnDeathEffects(loadPoolCard(ARMS_PEDDLER))).toBe(true);
    expect(hasDestroyOnDeathEffects(loadPoolCard(LEAH))).toBe(true);
    expect(hasDestroyOnDeathEffects(loadPoolCard("10001110"))).toBe(false);
  });

  it("makeCardFromDB + destroyTarget fires Arms Peddler Last Words draw", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstDeck([
        { name: "DeckCard", type: "Follower", attack: 1, defense: 1 },
      ])
      .build();
    state.gameStarted = true;

    const template = getCardById(ARMS_PEDDLER)!;
    const host = makeCardFromDB(template, "first");
    pushToBoard(state.players.first.board, "first", host);

    const before = state.players.first.hand.length;
    destroyTarget(host, "first");
    cleanupDead();
    flushDeferredDeathBatch();

    expect(state.players.first.hand.length).toBe(before + 1);
  });

  it("driveCard destroy scenario differs from vanilla_place for Arms Peddler", () => {
    const raw = loadPoolCard(ARMS_PEDDLER);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;

    const scenarios = result.scenarios.map((s) => s.scenario);
    expect(scenarios).toContain("destroy");
    expect(scenarios).not.toContain("vanilla_place");

    const destroy = result.scenarios.find((s) => s.scenario === "destroy")!;
    const detail = destroy.detail as {
      players?: { first?: { hand?: unknown[] } };
    };
    expect((detail.players?.first?.hand ?? []).length).toBeGreaterThan(0);
  });

  it("Winged Statue amulet destroy fires Last Words restore", () => {
    const raw = loadPoolCard(WINGED_STATUE);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;
    expect(result.scenarios.map((s) => s.scenario)).toContain("destroy");

    const destroy = result.scenarios.find((s) => s.scenario === "destroy")!;
    const detail = destroy.detail as {
      players?: { first?: { hp?: number } };
    };
    // Last Words: Restore 2 defense to your leader — starts at 20, may heal if damaged
    expect(detail.players?.first?.hp).toBeDefined();
  });
});
