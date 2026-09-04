import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import { createCard, resetUidCounter } from "../harness/builders.js";
import { effectsNeedSelection } from "../../src/logic/effects/ops/engage.js";

describe("engage effectsNeedSelection — replicate zones", () => {
  beforeEach(() => resetUidCounter());

  it("detects selection in a replicate fanfare zone (Earrings of Sunlight)", () => {
    const earrings = createCard("10761210", "board", "first");
    const engageEffects = [{ op: "replicate", zone: "fanfare" as const }];
    expect(effectsNeedSelection(engageEffects, earrings)).toBe(true);
  });

  it("does not flag replicate zones without selection (Apollo evolve)", () => {
    const apollo = createCard("10102110", "board", "first");
    const engageEffects = [{ op: "replicate", zone: "fanfare" as const }];
    expect(effectsNeedSelection(engageEffects, apollo)).toBe(false);
  });
});
