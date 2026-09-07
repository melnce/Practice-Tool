/**
 * Accelerate / Crystallize scenarios — alternate-form selection and amulet-form debt.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import "./setup.js";
import {
  driveCard,
  hasAccelerateForm,
  hasCrystallizeForm,
} from "../../scripts/lib/cardBehaviourDrive.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  givenGameState,
  whenPlayCard,
  resetUidCounter,
  createCard,
} from "../harness/builders.js";
import { resolvePlayCost } from "../../src/logic/core/playCard/cost.js";
import fs from "fs";
import path from "path";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SHODDY_PLAYTHING = "10671110";
const VENERATING_DYER = "10662110";
const AL_MIRAJ = "10962120";
const PLAIN_FOLLOWER = "10001110";

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

describe("accelerate / crystallize scenarios", () => {
  beforeEach(() => resetUidCounter());

  it("hasAccelerateForm detects Accelerate keyword with effects", () => {
    expect(hasAccelerateForm(loadPoolCard(SHODDY_PLAYTHING))).toBe(true);
    expect(hasAccelerateForm(loadPoolCard(PLAIN_FOLLOWER))).toBe(false);
  });

  it("hasCrystallizeForm detects Crystallize keyword with amuletKeywords", () => {
    expect(hasCrystallizeForm(loadPoolCard(VENERATING_DYER))).toBe(true);
    expect(hasCrystallizeForm(loadPoolCard(PLAIN_FOLLOWER))).toBe(false);
  });

  it("engine selects Accelerate when PP is below printed cost but at alternate cost", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(2, 2)
      .build();
    state.gameStarted = true;

    const card = createCard(SHODDY_PLAYTHING, "hand", "first");
    state.players.first.hand = [card];
    const plan = resolvePlayCost(card, state.players.first.pp);
    expect(plan.mode).toBe("accelerate");
    expect(plan.cost).toBe(2);

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).not.toBe("blocked");
    expect((card as { playedAs?: string }).playedAs).toBe("accelerate");

    const summoned = state.players.first.board.find(
      (c) => c.name === "Shoddy Plaything",
    );
    expect(summoned?.id).toBe(SHODDY_PLAYTHING);
  }, 60_000);

  it("engine plays normal form when PP can afford printed cost", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;

    const card = createCard(SHODDY_PLAYTHING, "hand", "first");
    state.players.first.hand = [card];
    const plan = resolvePlayCost(card, state.players.first.pp);
    expect(plan.mode).toBe("normal");
    expect(plan.cost).toBe(6);

    whenPlayCard("first", 0);
    expect((card as { playedAs?: string }).playedAs).toBeUndefined();
    expect(card.type).toBe("Follower");
  }, 60_000);

  it("driveCard accelerate scenario replaces vanilla_place for Shoddy Plaything", () => {
    const raw = loadPoolCard(SHODDY_PLAYTHING);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;

    const scenarios = result.scenarios.map((s) => s.scenario);
    expect(scenarios).toContain("accelerate");
    expect(scenarios).not.toContain("vanilla_place");

    const accel = result.scenarios.find((s) => s.scenario === "accelerate")!;
    const board = (
      accel.detail as {
        players?: { first?: { board?: { id?: string; name?: string }[] } };
      }
    ).players?.first?.board;
    const token = board?.find((c) => c.name === "Shoddy Plaything");
    expect(token?.id).toBe(SHODDY_PLAYTHING);
  }, 60_000);

  it("Miraculous Al-mi'raj crystallize_engage advances countdown and crystallize_death summons on Last Words", () => {
    const raw = loadPoolCard(AL_MIRAJ);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;

    const scenarios = result.scenarios.map((s) => s.scenario);
    expect(scenarios).toContain("crystallize");
    expect(scenarios).toContain("crystallize_engage");
    expect(scenarios).toContain("crystallize_death");
    expect(scenarios).not.toContain("vanilla_place");

    const engage = result.scenarios.find(
      (s) => s.scenario === "crystallize_engage",
    )!;
    const engageBoard = (
      engage.detail as {
        players?: {
          first?: { board?: { name?: string; countdown?: number }[] };
        };
      }
    ).players?.first?.board;
    const amuletAfterEngage = engageBoard?.find(
      (c) => c.name === "Miraculous Al-mi'raj",
    );
    expect(amuletAfterEngage?.countdown).toBe(2);

    const death = result.scenarios.find(
      (s) => s.scenario === "crystallize_death",
    )!;
    const deathBoard = (
      death.detail as {
        players?: {
          first?: { board?: { id?: string; name?: string }[] };
        };
      }
    ).players?.first?.board;
    const summoned = deathBoard?.find(
      (c) => c.name === "Miraculous Al-mi'raj" && c.id === AL_MIRAJ,
    );
    expect(summoned?.id).toBe(AL_MIRAJ);
  }, 60_000);

  it("play scenario at affordable PP uses normal follower, not accelerate effect", () => {
    const raw = loadPoolCard(SHODDY_PLAYTHING);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;

    const play = result.scenarios.find((s) => s.scenario === "play")!;
    const accel = result.scenarios.find((s) => s.scenario === "accelerate")!;
    expect(play.fingerprint).not.toBe(accel.fingerprint);

    const playBoard = (
      play.detail as {
        players?: {
          first?: { board?: { name?: string; type?: string }[] };
        };
      }
    ).players?.first?.board;
    const follower = playBoard?.find((c) => c.name === "Shoddy Plaything");
    expect(follower?.type).toBe("Follower");

    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    const card = createCard(SHODDY_PLAYTHING, "hand", "first");
    expect(resolvePlayCost(card, state.players.first.pp).mode).toBe("normal");
  }, 60_000);
});
