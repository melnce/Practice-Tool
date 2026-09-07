/**
 * Engage scenario — Engage keyword and engage triggers fire through engageAmulet.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import "./setup.js";
import {
  driveCard,
  hasEngageAbility,
} from "../../scripts/lib/cardBehaviourDrive.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import fs from "fs";
import path from "path";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SERENE_SANCTUARY = "10161210";
const DETECTIVES_LENS = "10001210";
const MAINYU = "10161140";
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

describe("engage scenario", () => {
  beforeEach(() => resetUidCounter());

  it("hasEngageAbility detects Engage keyword and engage trigger cards", () => {
    expect(hasEngageAbility(loadPoolCard(SERENE_SANCTUARY))).toBe(true);
    expect(hasEngageAbility(loadPoolCard(MAINYU))).toBe(true);
    expect(hasEngageAbility(loadPoolCard("10001110"))).toBe(false);
  });

  it("makeCardFromDB + engageAmulet advances Serene Sanctuary countdown", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;

    const template = getCardById(SERENE_SANCTUARY)!;
    const host = makeCardFromDB(template, "first");
    pushToBoard(state.players.first.board, "first", host);

    expect(host.countdown).toBe(3);
    engageAmulet("first", 0);
    expect(host.countdown).toBe(2);
    expect(host.keywordState?.engagedThisTurn).toBe(true);
  });

  it("driveCard engage scenario differs from vanilla_place for Serene Sanctuary", () => {
    const raw = loadPoolCard(SERENE_SANCTUARY);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;

    const scenarios = result.scenarios.map((s) => s.scenario);
    expect(scenarios).toContain("engage");
    expect(scenarios).not.toContain("vanilla_place");

    const engage = result.scenarios.find((s) => s.scenario === "engage")!;
    const board = (
      engage.detail as {
        players?: { first?: { board?: { countdown?: number }[] } };
      }
    ).players?.first?.board;
    const self = board?.find((c) => c.name === "Serene Sanctuary");
    expect(self?.countdown).toBe(2);
  });

  it("Detective's Lens sacrifice engage removes Ward from enemy follower", () => {
    const raw = loadPoolCard(DETECTIVES_LENS);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;
    expect(result.scenarios.map((s) => s.scenario)).toContain("engage");

    const engage = result.scenarios.find((s) => s.scenario === "engage")!;
    const grave = (
      engage.detail as {
        players?: { first?: { graveyard?: { name?: string }[] } };
      }
    ).players?.first?.graveyard;
    expect(grave?.some((c) => c.name === "Detective's Lens")).toBe(true);
  });

  it("Mainyu follower engage trigger buffs on helper amulet engage", () => {
    const raw = loadPoolCard(MAINYU);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;
    expect(result.scenarios.map((s) => s.scenario)).toContain("engage");

    const engage = result.scenarios.find((s) => s.scenario === "engage")!;
    const board = (
      engage.detail as {
        players?: {
          first?: { board?: { name?: string; attack?: number }[] };
        };
      }
    ).players?.first?.board;
    const mainyu = board?.find((c) => c.name === "Mainyu, Darkdweller");
    expect(mainyu?.attack).toBe(3);
  });

  it("Winged Statue keeps destroy scenario alongside engage", () => {
    const raw = loadPoolCard(WINGED_STATUE);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;
    const names = result.scenarios.map((s) => s.scenario);
    expect(names).toContain("engage");
    expect(names).toContain("destroy");
    expect(names).not.toContain("vanilla_place");
  });
});
