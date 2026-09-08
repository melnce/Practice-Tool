/**
 * Route-drop siblings BI1–BI5: inline-card measurements for filter/condition
 * on sibling routes that previously ignored them.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import "./setup.js";
import {
  givenGameState,
  whenRunEffects,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHand } from "../../src/core/playerHelpers.js";
import { checkRouteDropSiblingGuards } from "../../scripts/lib/op-key-shape-route-guards.js";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

function allyFollower(name: string, atk = 2, def = 2) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function setupBase() {
  resetUidCounter();
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 }).build();
  state.gameStarted = true;
  state.phase = "main";
}

describe("route-drop siblings — inline measurements", () => {
  beforeEach(() => setupBase());

  describe("BI1 summon source:named — reject loudly", () => {
    it("named summon without filter still works", () => {
      whenRunEffects(
        [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
        "first",
      );
      expect(thenBoard("first").some((c) => c.name === "Goblin")).toBe(true);
    });

    it("filter on named summon throws in test (was silently ignored)", () => {
      expect(() =>
        whenRunEffects(
          [
            {
              op: "summon",
              source: "named",
              name: "Goblin",
              count: 1,
              filter: { cost_lte: 99 },
            },
          ],
          "first",
        ),
      ).toThrow(/not supported on route source:"named"/);
    });
  });

  describe("BI2 stat mode:double — honour filter", () => {
    it("only named follower doubled (before: all allies doubled)", () => {
      allyFollower("Victim", 2, 2);
      allyFollower("Bystander", 3, 3);

      whenRunEffects(
        [
          {
            op: "stat",
            mode: "double",
            target: "ally:follower",
            filter: { name: "Victim" },
            action: "give",
          },
        ],
        "first",
      );

      const victim = findOnBoard("first", "Victim")!;
      const bystander = findOnBoard("first", "Bystander")!;
      expect(Number(victim.attack)).toBe(4);
      expect(Number(victim.defense)).toBe(4);
      expect(Number(bystander.attack)).toBe(3);
      expect(Number(bystander.defense)).toBe(3);
    });
  });

  describe("BI3 destroy scope:self — reject loudly", () => {
    it("scope:self destroys source when no filter present", () => {
      const host = allyFollower("Host", 2, 2);
      allyFollower("Bystander", 2, 2);

      whenRunEffects([{ op: "destroy", scope: "self" }], "first", host);

      expect(findOnBoard("first", "Host")).toBeFalsy();
      expect(findOnBoard("first", "Bystander")).toBeTruthy();
    });

    it("filter on scoped destroy throws in test", () => {
      const host = allyFollower("Host", 2, 2);
      expect(() =>
        whenRunEffects(
          [{ op: "destroy", scope: "self", filter: { name: "Bystander" } }],
          "first",
          host,
        ),
      ).toThrow(/not supported on route scope:"self"/);
    });
  });

  describe("BI4 discard mode:except_named — reject loudly", () => {
    it("keeps named cards without filter", () => {
      const hand = getHand(state, "first");
      hand.push(
        createCard({ name: "KeepMe", type: "Spell", cost: 1 }, "hand", "first"),
        createCard({ name: "DropMe", type: "Spell", cost: 2 }, "hand", "first"),
      );

      whenRunEffects(
        [
          {
            op: "discard",
            mode: "except_named",
            names: ["KeepMe"],
          },
        ],
        "first",
      );

      const names = thenHand("first").map((c) => c.name);
      expect(names).toEqual(["KeepMe"]);
    });

    it("filter on except_named throws in test", () => {
      getHand(state, "first").push(
        createCard({ name: "KeepMe", type: "Spell", cost: 1 }, "hand", "first"),
      );
      expect(() =>
        whenRunEffects(
          [
            {
              op: "discard",
              mode: "except_named",
              names: ["KeepMe"],
              filter: { cost_lte: 0 },
            },
          ],
          "first",
        ),
      ).toThrow(/not supported on route mode:"except_named"/);
    });
  });

  describe("BI5 add_to_hand source:copy — reject loudly", () => {
    it("copies target without filter on route", () => {
      const src = allyFollower("CopySrc", 2, 2);
      state.lastSelected = [src];

      whenRunEffects(
        [
          {
            op: "add_to_hand",
            source: "copy",
            target: "selected:follower",
            count: 1,
          },
        ],
        "first",
      );

      expect(thenHand("first").some((c) => c.name === "CopySrc")).toBe(true);
    });

    it("filter on copy route throws in test", () => {
      const src = allyFollower("CopySrc", 2, 2);
      state.lastSelected = [src];
      expect(() =>
        whenRunEffects(
          [
            {
              op: "add_to_hand",
              source: "copy",
              target: "selected:follower",
              count: 1,
              filter: { name: "Nobody" },
            },
          ],
          "first",
        ),
      ).toThrow(/not supported on route source:"copy"/);
    });
  });
});

describe("route-drop siblings — op-key-shape gate sabotage", () => {
  const badCard = {
    id: "99999999",
    name: "RouteDrop Gate Sabotage",
    type: "Spell",
    class: "Neutral",
    cost: "0",
    spell: [
      {
        op: "summon",
        source: "named",
        name: "Goblin",
        count: 1,
        filter: { cost_lte: 1 },
      },
    ],
  };

  it("checkRouteDropSiblingGuards flags inline bad card", () => {
    const hits = checkRouteDropSiblingGuards(badCard);
    expect(hits.some((h) => h.id === "99999999")).toBe(true);
  });

  it("gate subprocess exits 1 when bad card is injected into sets", () => {
    const setPath = path.join(ROOT, "cards/sets/__route_drop_gate_test__.json");
    fs.writeFileSync(setPath, JSON.stringify([badCard], null, 2));
    try {
      expect(() =>
        execSync(
          "npx tsx scripts/check-canonical-form.ts --gate=op-key-shape --fail",
          { cwd: ROOT, stdio: "pipe", encoding: "utf-8" },
        ),
      ).toThrow();
      const out = execSync(
        "npx tsx scripts/check-canonical-form.ts --gate=op-key-shape --fail 2>&1 || true",
        { cwd: ROOT, encoding: "utf-8" },
      );
      expect(out).toContain("99999999");
      expect(out).toContain("RouteDrop Gate Sabotage");
    } finally {
      fs.unlinkSync(setPath);
    }
  });
});
