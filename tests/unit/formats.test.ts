/**
 * Cosmetic set markers + Rotation window derivation (no deck policing).
 */
import { describe, it, expect } from "vitest";
import {
  BASIC_SET_ID,
  ROTATION_EXPANSION_COUNT,
  collectSetIds,
  formatSetBadge,
  parseCardSetId,
  parseCardSetName,
  rotationSetIds,
} from "../../src/data/formats.js";

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

  it("formatSetBadge marks older official sets quietly", () => {
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
