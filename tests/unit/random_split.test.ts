/**
 * Unit tests for random_split op — inline card payloads, no real card ids.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenRunEffects,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHP, getCrests } from "../../src/core/playerHelpers.js";
import { getLogs, clearLogs } from "../../src/core/logger.js";
import { crestAddCounter } from "../../src/logic/effects/crest.js";
import {
  bootstrapFaithForPlayer,
  faithCrestNameForCard,
} from "../../src/logic/faith/bootstrap.js";
import type { Effect } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const CALGE_FAITH = faithCrestNameForCard("Calge-Danthla, Eld Crystals");

function randomSplitEffect(
  total: Effect["op"] extends never ? never : unknown,
  effects: Effect[],
): Effect {
  return {
    op: "random_split",
    total,
    parts: ["X", "Y", "Z"],
    effects,
  } as Effect;
}

function readRandomSplit(): { total: number; parts: Record<string, number> } {
  const entry = getLogs()
    .slice()
    .reverse()
    .find((e) => e.type === "randomSplit");
  expect(entry).toBeTruthy();
  return entry!.details as { total: number; parts: Record<string, number> };
}

describe("random_split op", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
    (globalThis as any).HEADLESS = false;
    givenGameState({ seed: 42 }).withFirstHP(15).build();
    state.players.second.hp = 20;
  });

  it("total 0 yields zero placeholders and no downstream changes", () => {
    whenRunEffects(
      [
        randomSplitEffect(0, [
          { op: "restore", target: "leader", amount: "{Y}" },
          { op: "damage", target: "enemy:leader", amount: "{Z}" },
        ]),
      ],
      "first",
    );
    const split = readRandomSplit();
    expect(split.total).toBe(0);
    expect(split.parts).toEqual({ X: 0, Y: 0, Z: 0 });
    expect(getHP(state, "first")).toBe(15);
    expect(getHP(state, "second")).toBe(20);
  });

  it("splits a plain numeric total across placeholders", () => {
    whenRunEffects(
      [
        randomSplitEffect(3, [
          { op: "restore", target: "leader", amount: "{Y}" },
          { op: "damage", target: "enemy:leader", amount: "{Z}" },
        ]),
      ],
      "first",
    );
    const { total, parts } = readRandomSplit();
    expect(total).toBe(3);
    expect((parts.X ?? 0) + (parts.Y ?? 0) + (parts.Z ?? 0)).toBe(3);
    expect(getHP(state, "first")).toBe(15 + (parts.Y ?? 0));
    expect(getHP(state, "second")).toBe(20 - (parts.Z ?? 0));
  });

  it("substitutes placeholders in nested effects", () => {
    state.players.first.playsThisTurn = 1;
    whenRunEffects(
      [
        randomSplitEffect(2, [
          {
            op: "gate",
            condition: "combo",
            count: 1,
            effects: [
              { op: "restore", target: "leader", amount: "{Y}" },
              { op: "damage", target: "enemy:leader", amount: "{Z}" },
            ],
          },
        ]),
      ],
      "first",
    );
    const { parts } = readRandomSplit();
    expect((parts.X ?? 0) + (parts.Y ?? 0) + (parts.Z ?? 0)).toBe(2);
    expect(getHP(state, "first")).toBe(15 + (parts.Y ?? 0));
    expect(getHP(state, "second")).toBe(20 - (parts.Z ?? 0));
  });

  it("missing crest counter resolves total as 0", () => {
    whenRunEffects(
      [
        randomSplitEffect(
          {
            crest_counter: { crest: CALGE_FAITH, counter: "faith" },
          },
          [{ op: "damage", target: "enemy:leader", amount: "{Z}" }],
        ),
      ],
      "first",
    );
    expect(readRandomSplit().total).toBe(0);
    expect(getHP(state, "second")).toBe(20);
  });

  it("reads total from an existing crest counter", () => {
    const calge = createCard(
      {
        id: "10634120",
        name: "Calge-Danthla, Eld Crystals",
        type: "Follower",
        cost: 6,
        attack: 3,
        defense: 3,
        specific_effects: [
          {
            specific_effect_type: 4,
            skill_text:
              "Whenever an allied Crystalspawn enters the field, increase this faith's value by 1.",
          },
        ],
      },
      "deck",
      "first",
    );
    bootstrapFaithForPlayer("first", [calge], []);
    crestAddCounter("first", CALGE_FAITH, "faith", 4);

    whenRunEffects(
      [
        randomSplitEffect(
          {
            crest_counter: { crest: CALGE_FAITH, counter: "faith" },
          },
          [{ op: "restore", target: "leader", amount: "{Y}" }],
        ),
      ],
      "first",
    );

    const split = readRandomSplit();
    expect(split.total).toBe(4);
    expect(
      (split.parts.X ?? 0) + (split.parts.Y ?? 0) + (split.parts.Z ?? 0),
    ).toBe(4);
    expect(getHP(state, "first")).toBe(15 + (split.parts.Y ?? 0));
    expect(
      getCrests(state, "first").find((c) => c.name === CALGE_FAITH)?.counters
        ?.faith,
    ).toBe(4);
  });

  it("throws on unknown placeholders in test env", () => {
    expect(() =>
      whenRunEffects(
        [
          randomSplitEffect(1, [
            { op: "restore", target: "leader", amount: "{Q}" },
          ]),
        ],
        "first",
      ),
    ).toThrow(/Unknown placeholder/);
  });
});
