/**
 * Card behaviour harness — arena prep and board-cap discipline.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import "../audit/setup.ts";
import "../../src/logic/core/effects/index.js";
import {
  driveCard,
  analyzeHarnessArenaNeeds,
  hasDestroyOnDeathEffects,
  hasEngageAbility,
  HARNESS_SEED,
} from "../../scripts/lib/cardBehaviourDrive.js";
import {
  assertHarnessBoardCap,
  collectNamedGates,
  HARNESS_BOARD_CAP,
} from "../../scripts/lib/cardBehaviourGates.js";
import { state } from "../../src/core/gameState.js";
import { createCard } from "../../tests/harness/builders.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

const FORMERLY_SKIPPED = [
  "10021310",
  "10262110",
  "10632310",
  "10761110",
  "90054320",
];

describe("card behaviour drive prep", () => {
  beforeAll(() => {
    (globalThis as { HEADLESS?: boolean }).HEADLESS = true;
  });

  it("assertHarnessBoardCap fails loudly when a side exceeds five slots", () => {
    state.players.first.board = [];
    for (let i = 0; i < HARNESS_BOARD_CAP + 1; i++) {
      state.players.first.board.push(
        createCard(
          {
            name: `CapTest${i}`,
            type: "Follower",
            cost: 1,
            attack: 1,
            defense: 1,
          },
          "board",
          "first",
        ),
      );
    }
    expect(() => assertHarnessBoardCap("unit-test")).toThrow(
      /Harness board cap exceeded/,
    );
  });

  it("spell hand-select cards enable handKit only for spell types", () => {
    const all = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
    ) as {
      id: string;
      type?: string;
      spell?: unknown[];
      fanfare?: unknown[];
    }[];
    const wayOfTheMaid = all.find((c) => c.id === "10021310");
    const vier = all.find((c) => c.id === "10272110");
    expect(wayOfTheMaid).toBeDefined();
    expect(vier).toBeDefined();
    const maidNeeds = analyzeHarnessArenaNeeds(
      wayOfTheMaid!,
      collectNamedGates(wayOfTheMaid!),
    );
    const vierNeeds = analyzeHarnessArenaNeeds(vier!, collectNamedGates(vier!));
    expect(maidNeeds.handKit).toBe(true);
    expect(vierNeeds.handKit).toBe(false);
  });

  it("formerly skipped cluster-A/B cards are covered after arena prep", () => {
    const all = [
      ...JSON.parse(
        fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
      ),
      ...JSON.parse(
        fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
      ),
    ] as { id: string; cant_play?: boolean }[];
    for (const id of FORMERLY_SKIPPED) {
      const raw = all.find((c) => c.id === id);
      expect(raw, id).toBeDefined();
      const result = driveCard(raw!, raw!.cant_play ? { isToken: true } : {});
      expect(result.status, `${id} should be covered`).toBe("covered");
    }
  });

  it("uses the harness seed constant for deterministic drives", () => {
    expect(HARNESS_SEED).toBe(42);
  });

  it("enter-only followers use play scenario (Obsessed Test Subject)", () => {
    const all = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
    ) as { id: string }[];
    const ots = all.find((c) => c.id === "10931110")!;
    const result = driveCard(ots);
    expect(result.status).toBe("covered");
    if (result.status === "covered") {
      expect(result.scenarios.map((s) => s.scenario)).toContain("play");
      expect(result.scenarios.map((s) => s.scenario)).not.toContain(
        "vanilla_place",
      );
    }
  });

  it("super-evolve-only cards get both evolve and super_evolve scenarios", () => {
    const all = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
    ) as {
      id: string;
      evolve?: unknown[];
      superevolve?: unknown[];
    }[];
    const selwyn = all.find((c) => c.id === "10012120")!;
    expect(selwyn.superevolve?.length).toBeGreaterThan(0);
    expect(selwyn.evolve ?? []).toHaveLength(0);
    const result = driveCard(selwyn);
    expect(result.status).toBe("covered");
    if (result.status === "covered") {
      const names = result.scenarios.map((s) => s.scenario);
      expect(names).toContain("evolve");
      expect(names).toContain("super_evolve");
    }
  });

  it("cards with both evolve and superevolve get both scenarios", () => {
    const all = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
    ) as {
      id: string;
      evolve?: unknown[];
      superevolve?: unknown[];
    }[];
    const dual = all.find(
      (c) =>
        Array.isArray(c.evolve) &&
        c.evolve.length > 0 &&
        Array.isArray(c.superevolve) &&
        c.superevolve.length > 0,
    );
    expect(dual).toBeDefined();
    const result = driveCard(dual!);
    expect(result.status).toBe("covered");
    if (result.status === "covered") {
      const names = result.scenarios.map((s) => s.scenario);
      expect(names).toContain("evolve");
      expect(names).toContain("super_evolve");
    }
  });

  it("cards with Last Words get destroy scenario and drop vanilla_place", () => {
    const all = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
    ) as { id: string; keywords?: unknown[] }[];
    const peddler = all.find((c) => c.id === "10021120")!;
    expect(hasDestroyOnDeathEffects(peddler)).toBe(true);
    const result = driveCard(peddler);
    expect(result.status).toBe("covered");
    if (result.status === "covered") {
      const names = result.scenarios.map((s) => s.scenario);
      expect(names).toContain("destroy");
      expect(names).not.toContain("vanilla_place");
    }
  });

  it("cards with Engage get engage scenario and drop vanilla_place", () => {
    const all = JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8"),
    ) as { id: string; keywords?: unknown[] }[];
    const serene = all.find((c) => c.id === "10161210")!;
    expect(hasEngageAbility(serene)).toBe(true);
    const result = driveCard(serene);
    expect(result.status).toBe("covered");
    if (result.status === "covered") {
      const names = result.scenarios.map((s) => s.scenario);
      expect(names).toContain("engage");
      expect(names).not.toContain("vanilla_place");
    }
  });
});
