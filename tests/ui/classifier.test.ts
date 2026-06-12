import { describe, it, expect } from "vitest";
import { classify, drainLog } from "../../src/ui/motion/classifier.js";

describe("motion classifier", () => {
  it("classifies draw entry by uid", () => {
    const plan = classify(
      [{ id: 1, type: "draw", details: { uid: "c1", owner: "first" } }],
      new Set<string>(),
      new Set(["c1"]),
    );
    expect(plan.entries).toEqual([
      { uid: "c1", kind: "draw", owner: "first" },
    ]);
  });

  it("classifies summon entry", () => {
    const plan = classify(
      [{ id: 2, type: "summon", details: { uid: "s1", owner: "first" } }],
      new Set(),
      new Set(["s1"]),
    );
    expect(plan.entries[0]).toMatchObject({ uid: "s1", kind: "summon" });
  });

  it("links bounce old→new", () => {
    const plan = classify(
      [
        {
          id: 3,
          type: "bounceToHand",
          details: { oldUid: "old1", newUid: "new1", from: "first" },
        },
      ],
      new Set(["old1"]),
      new Set(["new1"]),
    );
    expect(plan.exits.find((e) => e.uid === "old1")).toBeUndefined();
    expect(plan.entries).toContainEqual({
      uid: "new1",
      kind: "bounce",
      fromUid: "old1",
      owner: "first",
    });
  });

  it("classifies fuse consume exits toward initiator", () => {
    const plan = classify(
      [
        {
          id: 4,
          type: "fuseConsume",
          details: { consumedUids: ["p1", "p2"], initiatorUid: "i1" },
        },
      ],
      new Set(["p1", "p2", "i1"]),
      new Set(["i1"]),
    );
    expect(plan.exits).toEqual(
      expect.arrayContaining([
        { uid: "p1", kind: "fuse-consume", initiatorUid: "i1" },
        { uid: "p2", kind: "fuse-consume", initiatorUid: "i1" },
      ]),
    );
  });

  it("distinguishes banish vs destroy exits", () => {
    const banish = classify(
      [{ id: 5, type: "banish", details: { uid: "b1" } }],
      new Set(["b1"]),
      new Set(),
    );
    expect(banish.exits[0]?.kind).toBe("banish");

    const destroy = classify(
      [{ id: 6, type: "death", details: { uid: "d1" } }],
      new Set(["d1"]),
      new Set(),
    );
    expect(destroy.exits[0]?.kind).toBe("dissolve");
  });

  it("emits leader and follower pops", () => {
    const plan = classify(
      [
        { id: 7, type: "leaderDamage", details: { owner: "first", amount: 3 } },
        {
          id: 8,
          type: "restoreFollower",
          details: { uid: "f1", restored: 2 },
        },
        {
          id: 9,
          type: "damage",
          details: { targetUid: "f2", dealt: 4, barrierPopped: true },
        },
      ],
      new Set(),
      new Set(["f1", "f2"]),
    );
    expect(plan.pops).toContainEqual({ kind: "damage", player: "first", amount: 3 });
    expect(plan.pops).toContainEqual({ kind: "heal", uid: "f1", amount: 2 });
    expect(plan.pops).toContainEqual({ kind: "damage", uid: "f2", amount: 4 });
    expect(plan.pops).toContainEqual({ kind: "barrier-ring", uid: "f2", amount: 0 });
  });

  it("defaults unmatched uids to generic entry and fade exit", () => {
    const plan = classify([], new Set(["gone"]), new Set(["fresh"]));
    expect(plan.entries).toEqual([{ uid: "fresh", kind: "generic" }]);
    expect(plan.exits).toEqual([{ uid: "gone", kind: "fade" }]);
  });

  it("detects ring gap in drainLog", () => {
    const logs = [
      { id: 1, type: "draw", details: {} },
      { id: 5, type: "summon", details: { uid: "x" } },
    ];
    const drained = drainLog(1, () => logs);
    expect(drained.gap).toBe(true);
    expect(drained.events.map((e) => e.id)).toEqual([5]);
    expect(drained.newCursor).toBe(5);
  });
});
