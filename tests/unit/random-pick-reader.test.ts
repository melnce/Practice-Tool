import { describe, it, expect } from "vitest";
import { wantsRandomTargetPick } from "../../src/logic/core/targeting/randomPick.js";

describe("wantsRandomTargetPick", () => {
  it("canonical select_mode", () => {
    expect(wantsRandomTargetPick({ select_mode: "random" })).toBe(true);
  });

  it("legacy mode for select/transform", () => {
    expect(wantsRandomTargetPick({ mode: "random" })).toBe(true);
  });

  it("stat legacy distribution and highest tie-break", () => {
    expect(
      wantsRandomTargetPick({ distribution: "random" }, { statLegacy: true }),
    ).toBe(true);
    expect(
      wantsRandomTargetPick(
        { distribution: "highest", select: 1 },
        { statLegacy: true },
      ),
    ).toBe(true);
    expect(wantsRandomTargetPick({ distribution: "highest", select: 1 })).toBe(
      false,
    );
  });

  it("return legacy distribution", () => {
    expect(
      wantsRandomTargetPick(
        { distribution: "random" },
        { distributionRandom: true },
      ),
    ).toBe(true);
    expect(wantsRandomTargetPick({ distribution: "random" })).toBe(false);
  });

  it("does not treat destroy distribution as random pick without flag", () => {
    expect(wantsRandomTargetPick({ distribution: "random" })).toBe(false);
  });
});
