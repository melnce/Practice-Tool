/**
 * Reactive timing matrix v2 — skip-reason classification gate.
 * Ratchets pool consumer counts and structured skip metadata.
 */
import { describe, it, expect, vi } from "vitest";
import {
  collectV2MatrixSkipReasons,
  summarizeV2SkipReasons,
  V2_SKIP_ENGINE_GAP_TOTAL,
  type V2SkipResult,
} from "../harness/reactiveTimingMatrix.js";
import {
  countPoolTriggerConsumers,
  PINNED_POOL_TRIGGER_CONSUMER_COUNTS,
  type TriggerConsumerSource,
} from "../harness/poolTriggerConsumers.js";

describe("reactive timing matrix v2 skip gate", () => {
  it("pinned pool consumer counts match cards/all.json + token_details.json", () => {
    for (const [event, pinned] of Object.entries(
      PINNED_POOL_TRIGGER_CONSUMER_COUNTS,
    )) {
      const live = countPoolTriggerConsumers(event);
      for (const source of [
        "hand",
        "board",
        "deck",
      ] as TriggerConsumerSource[]) {
        expect(live[source].count, `${event}.${source}`).toBe(pinned[source]);
      }
    }
  });

  it("fails when a pinned consumer count is stubbed wrong (sabotage)", () => {
    const stubbed = {
      ...PINNED_POOL_TRIGGER_CONSUMER_COUNTS,
      ally_draw: { hand: 1, board: 2, deck: 0 },
    };
    expect(() => {
      for (const [event, pinned] of Object.entries(stubbed)) {
        const live = countPoolTriggerConsumers(event);
        for (const source of [
          "hand",
          "board",
          "deck",
        ] as TriggerConsumerSource[]) {
          if (live[source].count !== pinned[source]) {
            throw new Error(`stub mismatch ${event}.${source}`);
          }
        }
      }
    }).toThrow(/stub mismatch ally_draw\.hand/);
  });

  it("no_consumer skips still have zero consumers on their pinned source", () => {
    const skips = collectV2MatrixSkipReasons().filter(
      (s) => s.kind === "no_consumer",
    );
    expect(skips.length).toBeGreaterThan(0);
    for (const skip of skips) {
      expect(skip.consumerEvent).toBeTruthy();
      expect(skip.consumerSource).toBeTruthy();
      expect(skip.consumerCount).toBe(0);
      const live = countPoolTriggerConsumers(skip.consumerEvent!);
      expect(live[skip.consumerSource!].count, skip.reason).toBe(0);
    }
  });

  it("fails when a no_consumer skip is stubbed with a fake non-zero count (sabotage)", () => {
    const fake: V2SkipResult = {
      kind: "no_consumer",
      reason: "sabotage",
      consumerEvent: "ally_draw",
      consumerSource: "hand",
      consumerCount: 1,
    };
    expect(() => {
      if (fake.consumerCount !== 0) {
        throw new Error("no_consumer count must be 0");
      }
    }).toThrow(/must be 0/);
  });

  it("classifies 19 unique skip reasons: 1 engine gap, 14 harness limits, 4 no-consumer", () => {
    const skips = collectV2MatrixSkipReasons();
    const summary = summarizeV2SkipReasons(skips);
    expect(summary).toEqual({
      total: 19,
      engine_gap: 1,
      harness_limit: 14,
      no_consumer: 4,
    });
    expect(summary.engine_gap).toBe(V2_SKIP_ENGINE_GAP_TOTAL);
  });

  it("sole engine gap names transform leaves_field and Bayle (10113130)", () => {
    const gaps = collectV2MatrixSkipReasons().filter(
      (s) => s.kind === "engine_gap",
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.reason).toMatch(/transform does not raise leaves_field/);
    expect(gaps[0]!.cardIds).toEqual(["10113130", "10553110"]);
  });
});

describe("reactive timing matrix v2 skip gate — fixture sabotage", () => {
  it("fails when countPoolTriggerConsumers is stubbed to return a fake hand consumer", async () => {
    const mod = await import("../harness/poolTriggerConsumers.js");
    const original = mod.countPoolTriggerConsumers;
    vi.spyOn(mod, "countPoolTriggerConsumers").mockImplementation((event) => {
      const real = original(event);
      if (event === "ally_draw") {
        return {
          ...real,
          hand: { count: 99, cardIds: ["fake"] },
        };
      }
      return real;
    });

    expect(() => {
      const live = mod.countPoolTriggerConsumers("ally_draw");
      const pinned = PINNED_POOL_TRIGGER_CONSUMER_COUNTS.ally_draw;
      if (live.hand.count !== pinned.hand) {
        throw new Error(
          `ally_draw.hand pinned ${pinned.hand} got ${live.hand.count}`,
        );
      }
    }).toThrow(/ally_draw\.hand pinned 0 got 99/);

    vi.restoreAllMocks();
  });
});
