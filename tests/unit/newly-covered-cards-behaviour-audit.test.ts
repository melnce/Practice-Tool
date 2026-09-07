/**
 * Audit: 53 cards whose behaviour harness coverage landed in PR #297 (82c7482).
 * Compares printed text + official Q&A against harness drive output; engine bugs
 * are reported as it.fails elsewhere — this file pins harness regression guards.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import "../audit/setup.ts";
import "../../src/logic/core/effects/index.js";
import { driveCard } from "../../scripts/lib/cardBehaviourDrive.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Cards that went skipped/partial → covered in 82c7482 (#297). */
export const NEWLY_COVERED_IDS = [
  "10021310",
  "10131310",
  "10243310",
  "10262110",
  "10272310",
  "10331110",
  "10332110",
  "10333110",
  "10333310",
  "10364110",
  "10501110",
  "10502120",
  "10521110",
  "10521120",
  "10521310",
  "10522120",
  "10531310",
  "10553310",
  "10554120",
  "10561310",
  "10572310",
  "10632310",
  "10642310",
  "10663210",
  "10664110",
  "10671310",
  "10673310",
  "10674120",
  "10711310",
  "10761110",
  "10762110",
  "10762120",
  "10763110",
  "10764120",
  "10771120",
  "10771310",
  "10772120",
  "10774120",
  "10844110",
  "10853310",
  "10873310",
  "10903210",
  "10922310",
  "10931110",
  "10942310",
  "10954110",
  "10964110",
  "10972310",
  "90014320",
  "90023110",
  "90054320",
  "90064320",
  "90074320",
] as const;

function loadPoolCard(id: string) {
  const all = [
    ...JSON.parse(fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8")),
    ...JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
    ),
  ] as { id: string; cant_play?: boolean }[];
  const raw = all.find((c) => c.id === id);
  expect(raw, id).toBeDefined();
  return raw!;
}

function playDetail(id: string) {
  const raw = loadPoolCard(id);
  const result = driveCard(raw, raw.cant_play ? { isToken: true } : {});
  expect(result.status, `${id} harness status`).toBe("covered");
  const play = result.scenarios.find((s) => s.scenario === "play");
  return { result, play, detail: play?.detail as Record<string, unknown> };
}

describe("PR #297 newly-covered cards — harness regression guards", () => {
  beforeAll(() => {
    (globalThis as { HEADLESS?: boolean }).HEADLESS = true;
  });

  it("all 53 ids remain covered in the behaviour baseline", () => {
    const baseline = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, "baselines/card-behaviour.json"),
        "utf-8",
      ),
    );
    expect(NEWLY_COVERED_IDS).toHaveLength(53);
    for (const id of NEWLY_COVERED_IDS) {
      const entry = baseline.cards[id];
      expect(entry?.status, id).toBe("covered");
    }
  });

  it("10931110 Obsessed Test Subject — play drives named_enter_count; 6th copy is 5/5", () => {
    const { play } = playDetail("10931110");
    expect(play?.gatesSatisfied).toContain("named_enter_count");
    const board = ((play?.detail as any)?.players?.first?.board as any[]) ?? [];
    const ots = board.find((c) => c.id === "10931110");
    expect(ots?.attack).toBe(5);
    expect(ots?.defense).toBe(5);
  });

  it("90054320 Wings of Desire — Rulenye on board receives Storm", () => {
    const { play } = playDetail("90054320");
    const board = ((play?.detail as any)?.players?.first?.board as any[]) ?? [];
    const rulenye = board.find((c) => c.name === "Rulenye & Valnareik");
    expect(rulenye?.hasStorm).toBe(true);
  });

  it("90023110 Nonja — board_name gate satisfied with Prim buffs to 3/3 Bane", () => {
    const { play } = playDetail("90023110");
    expect(play?.gatesSatisfied).toContain("board_name");
    const board = ((play?.detail as any)?.players?.first?.board as any[]) ?? [];
    const nonja = board.find((c) => c.id === "90023110");
    expect(nonja?.attack).toBe(3);
    expect(nonja?.defense).toBe(3);
    expect(nonja?.hasBane).toBe(true);
  });

  it("90014320 Annihilating Onslaught — board_name branch deals 20 leader damage", () => {
    const raw = loadPoolCard("90014320");
    const result = driveCard(raw, { isToken: true });
    const satisfied = result.scenarios.find((s) => s.scenario === "play");
    const denied = result.scenarios.find((s) => s.scenario === "play_else");
    expect(satisfied?.gatesSatisfied).toContain("board_name");
    expect((satisfied?.detail as any)?.players?.second?.hp).toBe(0);
    expect((denied?.detail as any)?.players?.second?.hp).toBe(14);
  });

  it("10331110 Devotee of Truth — self_cost gate drives both branches", () => {
    const raw = loadPoolCard("10331110");
    const result = driveCard(raw);
    const play = result.scenarios.find((s) => s.scenario === "play");
    const elseSc = result.scenarios.find((s) => s.scenario === "play_else");
    expect(play?.gatesSatisfied).toContain("self_cost");
    expect(elseSc?.gatesUnmet).toContain("self_cost");
  });

  it("10333310 Illusory Conjuration — destroys an enemy follower on resolve", () => {
    const { play } = playDetail("10333310");
    const grave =
      ((play?.detail as any)?.players?.second?.graveyard as any[]) ?? [];
    expect(grave.some((c) => c.type === "Follower")).toBe(true);
  });
});
