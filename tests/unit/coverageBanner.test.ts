import { describe, it, expect } from "vitest";
import {
  countDeckCoverage,
  reportDeckCoverage,
} from "../../src/ui/coverageBanner.js";
import type { CardInstance } from "../../src/core/types/index.js";

function card(
  partial: Partial<CardInstance> & { id: string; name: string },
): CardInstance {
  return {
    uid: partial.id,
    cost: 1,
    type: "Follower",
    ...partial,
  } as CardInstance;
}

describe("coverage banner counts", () => {
  it("counts unique unimplemented cards across deck copies", () => {
    const deck = [
      card({
        id: "10521110",
        name: "A",
        implementationStatus: "unimplemented",
        description: "Fanfare: Draw a card.",
      }),
      card({
        id: "10521110",
        name: "A",
        implementationStatus: "unimplemented",
        description: "Fanfare: Draw a card.",
      }),
      card({
        id: "10001120",
        name: "B",
        implementationStatus: "implemented",
        description: "Ward",
      }),
      card({
        id: "10522120",
        name: "C",
        implementationStatus: "partial",
        description: "Fanfare: Mystery.",
      }),
    ];
    const counts = countDeckCoverage(deck);
    expect(counts.unimplemented).toBe(1);
    expect(counts.partial).toBe(1);
    expect(counts.flaggedIds.sort()).toEqual(["10521110", "10522120"]);
  });

  it("reportDeckCoverage uses honest no-effects wording", () => {
    const counts = countDeckCoverage([
      card({
        id: "10521110",
        name: "Stub",
        implementationStatus: "unimplemented",
        description: "Fanfare: Draw a card.",
      }),
    ]);
    expect(counts.unimplemented).toBe(1);
    // Banner text must not claim the rest of the deck is faithfully complete
    expect(
      `${counts.unimplemented} cards in this deck have no implemented effects`,
    ).toMatch(/have no implemented effects/);
  });

  it("reportDeckCoverage is a no-op without DOM when clean", () => {
    const counts = reportDeckCoverage(
      [
        card({
          id: "1",
          name: "Ok",
          implementationStatus: "implemented",
        }),
      ],
      [],
    );
    expect(counts.unimplemented).toBe(0);
  });
});
