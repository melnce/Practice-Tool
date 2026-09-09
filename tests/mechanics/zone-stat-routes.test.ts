/**
 * Zone stat route contract tests (BN1–BN7).
 *
 * Covers applyHandBuff, applyDeckBuff and applyLastAddedToHandBuff — the last
 * stat implementation that did not share the engine's vocabulary before this PR.
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
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getHand, getDeck } from "../../src/core/playerHelpers.js";
import { checkZoneStatRouteGuards } from "../../scripts/lib/op-key-shape-route-guards.js";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

function setupBase() {
  resetUidCounter();
  givenGameState({ seed: 1, activePlayer: "first", roundCount: 6 }).build();
  state.gameStarted = true;
  state.phase = "main";
}

function handFollower(
  name: string,
  atk = 2,
  def = 2,
  opts: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...opts },
    "hand",
    "first",
  );
  c.peak_defense = def;
  getHand(state, "first").push(c);
  return c;
}

describe("zone stat routes — BN1 normalizeStatSpec (honour)", () => {
  beforeEach(() => setupBase());

  it("hand route resolves dynamic attack template", () => {
    const source = createCard(
      { name: "Source", type: "Follower", cost: 2, attack: 4, defense: 2 },
      "board",
      "first",
    );
    source.peak_defense = 2;
    state.players.first.board.push(source);
    const target = handFollower("HandTarget", 1, 1);

    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "hand",
          attack: "-{self.attack}",
        },
      ] as any,
      "first",
      source,
    );

    expect(Number(target.attack)).toBe(-3);
  });

  it("deck route resolves attack_source combo", () => {
    state.players.first.playsThisTurn = 2;
    const deckCard = createCard(
      {
        name: "DeckFollower",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 3,
      },
      "deck",
      "first",
    );
    deckCard.peak_defense = 3;
    getDeck(state, "first").push(deckCard);

    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:deck",
          filter: { type: "Follower" },
          attack_source: "combo",
        },
      ] as any,
      "first",
    );

    expect(Number(deckCard.attack)).toBe(3);
  });
});

describe("zone stat routes — BN2 peak_defense (honour)", () => {
  beforeEach(() => setupBase());

  it("hand route maintains peak_defense on positive defense buff", () => {
    const card = handFollower("HandPeak", 2, 3);
    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "hand",
          attack: 0,
          defense: 2,
        },
      ] as any,
      "first",
    );
    expect(Number(card.defense)).toBe(5);
    expect(card.peak_defense).toBe(5);
  });

  it("last_added_to_hand route maintains peak_defense", () => {
    const card = createCard(
      { name: "LastAdded", type: "Follower", cost: 1, attack: 1, defense: 2 },
      "hand",
      "first",
    );
    card.peak_defense = 2;
    state.lastAddedToHand = card;

    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "last_added_to_hand",
          attack: 0,
          defense: 1,
        },
      ] as any,
      "first",
    );

    expect(Number(card.defense)).toBe(3);
    expect(card.peak_defense).toBe(3);
  });
});

describe("zone stat routes — BN3 keywords (reject)", () => {
  beforeEach(() => setupBase());

  it("keywords on hand route throw in test", () => {
    handFollower("Victim", 2, 2);
    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "hand",
            keywords: ["Rush"],
          },
        ] as any,
        "first",
      ),
    ).toThrow(/keywords.*not supported on route hand/i);
  });
});

describe("zone stat routes — BN4 duration (reject)", () => {
  beforeEach(() => setupBase());

  it("until_end_of_turn on hand route throw in test", () => {
    const card = handFollower("TempHand", 2, 2);
    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "hand",
            attack: 1,
            until_end_of_turn: true,
          },
        ] as any,
        "first",
      ),
    ).toThrow(/duration.*not supported on route hand/i);
    expect(Number(card.attack)).toBe(2);
  });
});

describe("zone stat routes — BN5 set action (reject)", () => {
  beforeEach(() => setupBase());

  it("action set on hand route throw in test", () => {
    const card = handFollower("SetVictim", 5, 5);
    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "set",
            target: "hand",
            attack: 1,
          },
        ] as any,
        "first",
      ),
    ).toThrow(/action:"set".*not supported on route hand/i);
    expect(Number(card.attack)).toBe(5);
  });
});

describe("zone stat routes — BN6 shared filter reader (honour)", () => {
  beforeEach(() => setupBase());

  it("hand route honours filter.class via evaluateCardCondition", () => {
    handFollower("Dragon", 2, 2, { class: "Dragoncraft" });
    const neutral = handFollower("Neutral", 2, 2, { class: "Neutral" });

    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "hand",
          filter: { class: "Dragoncraft" },
          attack: 1,
          defense: 0,
        },
      ] as any,
      "first",
    );

    expect(
      Number(
        getHand(state, "first").find((c) => c.uid === neutral.uid)!.attack,
      ),
    ).toBe(2);
    expect(
      Number(
        getHand(state, "first").find((c) => c.class === "Dragoncraft")!.attack,
      ),
    ).toBe(3);
  });

  it("deck route honours filter.type (Thestae shape)", () => {
    const follower = createCard(
      {
        name: "DeckFollower",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 1,
      },
      "deck",
      "first",
    );
    follower.peak_defense = 1;
    const spell = createCard(
      { name: "DeckSpell", type: "Spell", cost: 1 },
      "deck",
      "first",
    );
    getDeck(state, "first").push(follower, spell);
    const spellAttackBefore = Number(spell.attack ?? 0);

    whenRunEffects(
      [
        {
          op: "stat",
          action: "give",
          target: "ally:deck",
          filter: { type: "Follower" },
          attack: 1,
          defense: 1,
        },
      ] as any,
      "first",
    );

    expect(Number(follower.attack)).toBe(2);
    expect(Number(follower.defense)).toBe(2);
    expect(Number(spell.attack ?? 0)).toBe(spellAttackBefore);
    expect(spell.buffs?.attack ?? 0).toBe(0);
  });
});

describe("zone stat routes — BN7 last_added filter (reject)", () => {
  beforeEach(() => setupBase());

  it("filter on last_added_to_hand throw in test", () => {
    const card = createCard(
      { name: "LastAdded", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "hand",
      "first",
    );
    state.lastAddedToHand = card;

    expect(() =>
      whenRunEffects(
        [
          {
            op: "stat",
            action: "give",
            target: "last_added_to_hand",
            filter: { type: "Follower" },
            attack: 1,
          },
        ] as any,
        "first",
      ),
    ).toThrow(/filter.*not supported on route last_added_to_hand/i);
    expect(Number(card.attack)).toBe(1);
  });
});

describe("zone stat routes — gate sabotage", () => {
  const badCards = [
    {
      id: "99999996",
      name: "ZoneStat Duration Gate",
      type: "Spell",
      class: "Neutral",
      cost: "0",
      spell: [
        {
          op: "stat",
          action: "give",
          target: "hand",
          attack: 1,
          until_end_of_turn: true,
        },
      ],
    },
    {
      id: "99999995",
      name: "ZoneStat Keyword Gate",
      type: "Spell",
      class: "Neutral",
      cost: "0",
      spell: [
        {
          op: "stat",
          action: "give",
          target: "hand",
          keywords: ["Rush"],
        },
      ],
    },
    {
      id: "99999994",
      name: "ZoneStat Set Gate",
      type: "Spell",
      class: "Neutral",
      cost: "0",
      spell: [
        {
          op: "stat",
          action: "set",
          target: "hand",
          attack: 1,
        },
      ],
    },
    {
      id: "99999993",
      name: "ZoneStat LastAdded Filter Gate",
      type: "Spell",
      class: "Neutral",
      cost: "0",
      spell: [
        {
          op: "stat",
          action: "give",
          target: "last_added_to_hand",
          filter: { type: "Follower" },
          attack: 1,
        },
      ],
    },
  ];

  it.each(badCards)("checkZoneStatRouteGuards flags $name", (badCard) => {
    const hits = checkZoneStatRouteGuards(badCard);
    expect(hits.some((h) => h.id === badCard.id)).toBe(true);
  });

  it("gate subprocess exits 1 when bad card is injected into sets", () => {
    const setPath = path.join(ROOT, "cards/sets/__zone_stat_gate_test__.json");
    fs.writeFileSync(setPath, JSON.stringify([badCards[0]], null, 2));
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
      expect(out).toContain("99999996");
      expect(out).toContain("ZoneStat Duration Gate");
    } finally {
      fs.unlinkSync(setPath);
    }
  });
});
