/**
 * Cosmetic set markers + Rotation window derivation (no deck policing).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, afterEach } from "vitest";
import {
  BASIC_SET_ID,
  ROTATION_EXPANSION_COUNT,
  collectSetIds,
  formatSetBadge,
  isCardInRotation,
  parseCardSetId,
  parseCardSetName,
  rotationSetIds,
} from "../../src/data/formats.js";
import {
  buildOfficialRotationSnapshot,
  initOfficialRotationFromJson,
  resetOfficialRotationForTests,
} from "../../src/data/officialRotation.js";
import {
  compareRotationMeta,
  runRotationMetaGate,
  type RotationGateAllowEntry,
} from "../../scripts/rotation-meta-gate.js";
import type { OfficialMetaFile } from "../../scripts/lib/officialCards.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OFFICIAL_META_PATH = path.join(ROOT, "cards/official-meta.json");

const CURRENT_SETS = [
  "10000",
  "10001",
  "10002",
  "10003",
  "10004",
  "10005",
  "10006",
  "10007",
  "10008",
] as const;

afterEach(() => {
  resetOfficialRotationForTests();
});

describe("formats — set display + rotation window", () => {
  it("parses set id and display name from card.set", () => {
    expect(parseCardSetId({ set: "[10003] Heirs of the Omen" })).toBe("10003");
    expect(parseCardSetName({ set: "[10003] Heirs of the Omen" })).toBe(
      "Heirs of the Omen",
    );
    expect(parseCardSetName({ set: "[VANILLA] Custom" })).toBe("Custom");
    expect(parseCardSetId({ set: "[VANILLA] Custom" })).toBeNull();
  });

  it("Rotation = Basic + newest six expansions", () => {
    const legal = rotationSetIds(CURRENT_SETS);
    expect([...legal].sort()).toEqual([
      "10000",
      "10003",
      "10004",
      "10005",
      "10006",
      "10007",
      "10008",
    ]);
    expect(legal.size).toBe(1 + ROTATION_EXPANSION_COUNT);
    expect(legal.has(BASIC_SET_ID)).toBe(true);
    expect(legal.has("10001")).toBe(false);
  });

  it("slides when a hypothetical set 10009 is added", () => {
    const legal = rotationSetIds([...CURRENT_SETS, "10009"]);
    expect([...legal].sort()).toEqual([
      "10000",
      "10004",
      "10005",
      "10006",
      "10007",
      "10008",
      "10009",
    ]);
    expect(legal.has("10003")).toBe(false);
  });

  it("formatSetBadge marks older official sets quietly (heuristic when no card id)", () => {
    const rot = formatSetBadge(
      { set: "[10008] Chronicle of Destiny" },
      CURRENT_SETS,
    );
    const old = formatSetBadge({ set: "[10001] Legends Rise" }, CURRENT_SETS);
    expect(rot?.text).toBe("Chronicle of Destiny");
    expect(rot?.inRotation).toBe(true);
    expect(old?.text).toBe("Legends Rise · older set");
    expect(old?.inRotation).toBe(false);
  });

  it("formatSetBadge uses official rotation for Stormy Blast (10131320)", () => {
    const official = new Map([["10131320", true]]);
    const badge = formatSetBadge(
      { id: "10131320", set: "[10001] Legends Rise" },
      CURRENT_SETS,
      official,
    );
    expect(badge?.inRotation).toBe(true);
    expect(badge?.text).toBe("Legends Rise");
  });

  it("collectSetIds ignores non-numeric labels", () => {
    expect(
      collectSetIds([
        { set: "[10000] Basic" },
        { set: "[VANILLA] Custom" },
        { set: "[10008] Chronicle of Destiny" },
      ]),
    ).toEqual(["10000", "10008"]);
  });
});

describe("official rotation lookup", () => {
  it("uses official flag when card id is present in metadata", () => {
    const lookup = new Map([["10131320", true]]);
    expect(
      isCardInRotation(
        { id: "10131320", set: "[10001] Legends Rise" },
        CURRENT_SETS,
        lookup,
      ),
    ).toBe(true);
  });

  it("falls back to set window when card id is absent from metadata", () => {
    const lookup = new Map<string, boolean>();
    expect(
      isCardInRotation(
        { id: "99999999", set: "[10001] Legends Rise" },
        CURRENT_SETS,
        lookup,
      ),
    ).toBe(false);
    expect(
      isCardInRotation(
        { id: "99999999", set: "[10008] Chronicle of Destiny" },
        CURRENT_SETS,
        lookup,
      ),
    ).toBe(true);
  });

  it("never treats _meta as a card id", () => {
    const snapshot = buildOfficialRotationSnapshot({
      _meta: { fetched_at: "2026-09-06", count: 1, lang: "en", source: "x" },
      "10131320": { is_include_rotation: true },
    });
    expect(snapshot.byCardId.has("_meta")).toBe(false);
    expect(snapshot.byCardId.get("10131320")).toBe(true);
    expect(snapshot.fetchedAt).toBe("2026-09-06");
  });

  it("loads cached official metadata for formatSetBadge", () => {
    initOfficialRotationFromJson({
      _meta: { fetched_at: "2026-09-06" },
      "10131320": { is_include_rotation: true },
    });
    const badge = formatSetBadge(
      { id: "10131320", set: "[10001] Legends Rise" },
      CURRENT_SETS,
    );
    expect(badge?.inRotation).toBe(true);
  });
});

describe("rotation-meta gate", () => {
  const meta = JSON.parse(
    fs.readFileSync(OFFICIAL_META_PATH, "utf-8"),
  ) as OfficialMetaFile;

  it("passes with the seeded Stormy Blast allowlist entry", () => {
    const allowlist: RotationGateAllowEntry[] = [
      {
        cardId: "10131320",
        reason: "duplicate print",
      },
    ];
    const report = runRotationMetaGate(meta, allowlist);
    expect(report.exitCode).toBe(0);
  });

  it("fails when a mismatch is not allowlisted", () => {
    const report = runRotationMetaGate(meta, []);
    expect(report.exitCode).toBe(1);
    expect(report.errors[0]?.message).toMatch(/10131320/);
  });

  it("fails when an allowlist entry no longer reproduces", () => {
    const allowlist: RotationGateAllowEntry[] = [
      { cardId: "99999999", reason: "stale entry" },
    ];
    const report = runRotationMetaGate(meta, allowlist);
    expect(report.exitCode).toBe(1);
    expect(
      report.errors.some((e) => e.message.includes("no longer reproduces")),
    ).toBe(true);
  });

  it("compareRotationMeta finds Stormy Blast (10131320) mismatch", () => {
    const mismatches = compareRotationMeta(meta);
    expect(mismatches).toEqual([
      expect.objectContaining({
        cardId: "10131320",
        official: true,
        heuristic: false,
      }),
    ]);
  });
});
