import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import {
  classifyTextDrift,
  compareCardsDrift,
  computeExitCode,
  type DumpRecord,
  type OurCard,
} from "../../scripts/lib/cardsDrift.js";

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/cards-drift",
);

function loadFixture<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, name), "utf-8"),
  ) as T;
}

function toDump(card: OurCard): DumpRecord {
  const isFollower = card.type === "Follower";
  return {
    card_id: Number(card.id),
    card_set_id: 90000,
    name_eng: card.name,
    cost: Number(card.cost),
    atk: isFollower ? Number(card.attack ?? 0) : null,
    life: isFollower ? Number(card.defense ?? 0) : null,
    type: card.type === "Follower" ? 1 : card.type === "Amulet" ? 2 : 3,
    skill_texts: [{ text_eng: card.description ?? "" }],
  };
}

describe("cards drift comparison", () => {
  const ours = loadFixture<OurCard[]>("ours.json");
  const driftDump = loadFixture<DumpRecord[]>("dump.json");

  it("reports cost drift with both values and exits 1", () => {
    const report = compareCardsDrift({
      oursCards: ours,
      dumpRecords: driftDump,
    });
    const row = report.statDrift.find((r) => r.field === "cost");
    expect(row).toMatchObject({
      id: "90001001",
      name: "Cost Test Card",
      ours: "2",
      dump: "3",
    });
    expect(report.exitCode).toBe(1);
    expect(computeExitCode(report)).toBe(1);
  });

  it("reports attack drift with both values and exits 1", () => {
    const report = compareCardsDrift({
      oursCards: ours,
      dumpRecords: driftDump,
    });
    const row = report.statDrift.find((r) => r.field === "attack");
    expect(row).toMatchObject({
      id: "90001002",
      name: "Attack Test Card",
      ours: "2",
      dump: "3",
    });
    expect(report.exitCode).toBe(1);
  });

  it("reports ids missing in either direction and exits 1", () => {
    const report = compareCardsDrift({
      oursCards: ours,
      dumpRecords: driftDump,
    });
    expect(report.missingInDump).toEqual([
      { id: "90001003", name: "Missing Test Card", source: "ours" },
    ]);
    expect(report.exitCode).toBe(1);
  });

  it("classifies numeric text change as semantic and exits 1", () => {
    const dump = ours.map(toDump);
    const target = dump.find((r) => r.card_id === 90001001)!;
    target.skill_texts = [{ text_eng: "Deal 2 damage to an enemy follower." }];
    const report = compareCardsDrift({ oursCards: ours, dumpRecords: dump });
    expect(report.textSemantic).toHaveLength(1);
    expect(report.textSemantic[0]).toMatchObject({
      id: "90001001",
      classification: "semantic",
    });
    expect(report.exitCode).toBe(1);
    expect(classifyTextDrift("Deal 3 damage", "Deal 2 damage")).toBe(
      "semantic",
    );
  });

  it("classifies cemetery wording as wording-only and exits 0", () => {
    const dump = ours.map(toDump);
    const target = dump.find((r) => r.card_id === 90001004)!;
    target.skill_texts = [{ text_eng: "Add 2 shadows to your cemetery." }];
    const report = compareCardsDrift({ oursCards: ours, dumpRecords: dump });
    expect(report.textWording).toHaveLength(1);
    expect(report.textSemantic).toHaveLength(0);
    expect(report.statDrift).toHaveLength(0);
    expect(report.missingInDump).toHaveLength(0);
    expect(report.missingInOurs).toHaveLength(0);
    expect(report.exitCode).toBe(0);
    expect(
      classifyTextDrift("Gain 2 shadows.", "Add 2 shadows to your cemetery."),
    ).toBe("wording");
  });

  it("returns exit 0 with empty drift tables for identical inputs", () => {
    const dump = ours.map(toDump);
    const report = compareCardsDrift({ oursCards: ours, dumpRecords: dump });
    expect(report.statDrift).toEqual([]);
    expect(report.missingInDump).toEqual([]);
    expect(report.missingInOurs).toEqual([]);
    expect(report.textSemantic).toEqual([]);
    expect(report.textWording).toEqual([]);
    expect(report.altModeMissing).toEqual([]);
    expect(report.exitCode).toBe(0);
  });

  it("does not flag semantic drift when Crystallize text is inlined on ours but alt_mode on dump", () => {
    const unionOurs = loadFixture<OurCard[]>("crystallize-ours.json");
    const unionDump = loadFixture<DumpRecord[]>("crystallize-dump.json");
    const report = compareCardsDrift({
      oursCards: unionOurs,
      dumpRecords: unionDump,
    });
    expect(report.textSemantic).toEqual([]);
    expect(report.altModeSemantic).toEqual([]);
    expect(report.exitCode).toBe(0);
  });

  it("flags semantic drift when an alt mode number changes", () => {
    const unionOurs = loadFixture<OurCard[]>("alt-mode-number-ours.json");
    const unionDump = loadFixture<DumpRecord[]>("alt-mode-number-dump.json");
    const report = compareCardsDrift({
      oursCards: unionOurs,
      dumpRecords: unionDump,
    });
    expect(report.textSemantic).toHaveLength(1);
    expect(report.textSemantic[0]).toMatchObject({
      id: "90002002",
      classification: "semantic",
    });
    expect(report.exitCode).toBe(1);
  });
});
