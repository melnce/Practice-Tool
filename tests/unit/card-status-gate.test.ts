import { describe, it, expect } from "vitest";
import {
  getImplementationStatus,
  type CardLike,
} from "../../src/data/cardImplementationStatus.js";

function checkCollectibleStatus(cards: CardLike[]): {
  unknownOps: CardLike[];
  unimplemented: CardLike[];
} {
  const unknownOps = cards.filter(
    (card) => getImplementationStatus(card) === "unknown_ops",
  );
  const unimplemented = cards.filter(
    (card) => getImplementationStatus(card) === "unimplemented",
  );
  return { unknownOps, unimplemented };
}

describe("card-status gate", () => {
  it("fails when a collectible is unimplemented", () => {
    const cards: CardLike[] = [
      {
        id: "99999994",
        name: "Stub Card",
        description: "Fanfare: Do something fancy.",
        fanfare: [],
      },
    ];
    const { unimplemented, unknownOps } = checkCollectibleStatus(cards);
    expect(unimplemented).toHaveLength(1);
    expect(unknownOps).toHaveLength(0);
  });

  it("passes when collectible has ops_present", () => {
    const cards: CardLike[] = [
      {
        id: "99999995",
        name: "Implemented Card",
        description: "Fanfare: Deal 1 damage.",
        fanfare: [{ op: "damage", target: "enemy:leader", amount: 1 }],
      },
    ];
    const { unimplemented, unknownOps } = checkCollectibleStatus(cards);
    expect(unimplemented).toHaveLength(0);
    expect(unknownOps).toHaveLength(0);
  });
});
