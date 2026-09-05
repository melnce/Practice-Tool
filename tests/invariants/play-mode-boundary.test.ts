/**
 * Play-mode cost-boundary sweep — live play path at every PP threshold.
 *
 * Passing set is exact (`toEqual([])`). Engine findings are `it.fails`
 * per card and invariant, quoting printed text and observed values.
 * Checker gates live in tests/unit/play-mode-sweep-checker.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "../audit/setup.ts";
import {
  ensureSweepCardDb,
  runPlayModeSweep,
  INVARIANT_IDS,
  type InvariantId,
  type SweepReport,
} from "../../scripts/lib/playModeSweep.js";

let report: SweepReport;

beforeAll(async () => {
  await ensureSweepCardDb();
  report = runPlayModeSweep();
}, 15_000);

function caseKey(cardId: string, pp: number, boardFull: boolean): string {
  return `${cardId}@${pp}pp/${boardFull ? "full" : "empty"}`;
}

type KnownFinding = {
  invariant: InvariantId;
  cardId: string;
  name: string;
  text: string;
  quote: string;
};

/**
 * Real sweep failures on current main. Not fixed here — a later PR
 * classifies card-text (draw / recover PP / bounce) vs engine bugs.
 */
const KNOWN_FINDINGS: KnownFinding[] = [
  {
    invariant: "I1",
    cardId: "10403120",
    name: "Lyria, Skydestined",
    text: "Enhance(8): Draw a follower that costs 7 or more. Recover 7 play points\nBarrier",
    quote:
      "8 PP empty: expected ppAfter 0, observed 7; 9 PP empty: expected 1, observed 8; 10 PP empty: expected 2, observed 9",
  },
  {
    invariant: "I1",
    cardId: "10623110",
    name: "Heartless Strategist",
    text: "Fanfare: Select an enemy follower on the field and destroy it.\nEnhance (6): Recover 3 play points. Add a Fearless Soldier to your hand.",
    quote:
      "6 PP empty: expected ppAfter 0, observed 3; 7 PP empty: expected 1, observed 4; 10 PP empty: expected 4, observed 7",
  },
  {
    invariant: "I6",
    cardId: "10361310",
    name: "Blinding Faith",
    text: "Deal 3 damage to all enemy followers.\nEnhance (8): Draw 3 cards. Restore 3 defense to your leader.",
    quote:
      "8/9/10 PP empty+full: expected handAfter 0, observed 3 (card in graveyard)",
  },
  {
    invariant: "I6",
    cardId: "10412110",
    name: "Chloe, What a Gal",
    text: "Enhance(8): Select a follower in your hand and summon it. Return this card to hand.",
    quote:
      "8/9/10 PP empty: expected handAfter 0 and played card on board; observed handAfter 1, playedCardOnOwnBoard false, boardAfter 0",
  },
  {
    invariant: "I6",
    cardId: "10503310",
    name: "Fate of the World",
    text: "Draw 2 cards. Destroy a random enemy follower with the highest attack.\nEnhance (10): Deal 4 damage to all enemies.",
    quote:
      "5/6/9/10 PP empty+full: expected handAfter 0, observed 2 (card in graveyard)",
  },
  {
    invariant: "I6",
    cardId: "10523310",
    name: "Splendor of the Goldbloom",
    text: "Add 2 copies of Glittering Gold to your hand.\nEnhance (5): Add 4 instead.",
    quote:
      "3/4 PP empty+full: expected handAfter 0, observed 2; 5/6/10 PP empty+full: expected 0, observed 4 (card in graveyard)",
  },
  {
    invariant: "I6",
    cardId: "10561120",
    name: "Bouquet Believer",
    text: "Enhance (4): Draw a card. Give this follower Bane.\nDuring your turn, whenever you draw a card, give this follower Rush.",
    quote:
      "4/5/10 PP empty: expected handAfter 0, observed 1 (played card is on the board)",
  },
  {
    invariant: "I6",
    cardId: "10623110",
    name: "Heartless Strategist",
    text: "Fanfare: Select an enemy follower on the field and destroy it.\nEnhance (6): Recover 3 play points. Add a Fearless Soldier to your hand.",
    quote:
      "6/7/10 PP empty: expected handAfter 0, observed 1 (played card is on the board)",
  },
  {
    invariant: "I6",
    cardId: "10623310",
    name: "Ruthless Eld Sword",
    text: "Select a Mode to activate.\n1. Draw a card.\n2. Deal 3 damage to a random enemy follower.\nEnhance (3): Activate all of them instead.",
    quote:
      "3/4/10 PP empty+full: expected handAfter 0, observed 1 (card in graveyard)",
  },
  {
    invariant: "I6",
    cardId: "10671110",
    name: "Shoddy Plaything",
    text: "Fanfare: Draw 3 cards.\nWard\nAccelerate (2): Summon a Shoddy Plaything.",
    quote:
      "6/7/10 PP empty (normal follower play): expected handAfter 0, observed 3 (played card is on the board)",
  },
  {
    invariant: "I6",
    cardId: "10773110",
    name: "Brazen Broadcaster",
    text: "Fanfare: Summon an Analyzing Artifact.\nEnhance (5): Summon a Mystic Artifact.\nWhenever an allied Artifact follower enters the field, give it Rush.",
    quote:
      "3/4 PP empty: expected handAfter 0, observed 1, boardAfter 2 extraSummons 1; 5/6/10 PP empty: handAfter 1, boardAfter 3 extraSummons 2",
  },
  {
    invariant: "I6",
    cardId: "10814120",
    name: "Tia, Eternal Crystalian",
    text: "Enhance (4): Give all allied followers on the field +1/+1.\nRush\nOnce on each of your turns, when this follower is given + attack or defense on the field, add an Eve, Blade of Crystalia to your hand.",
    quote:
      "4/5/10 PP empty: expected handAfter 0, observed 1 (played card is on the board)",
  },
];

const knownKeys = new Set(
  KNOWN_FINDINGS.map((f) => `${f.invariant}:${f.cardId}`),
);

function unexpectedFailures(id: InvariantId): string[] {
  return report.cases
    .filter(
      (rec) => !rec.checks[id].passed && !knownKeys.has(`${id}:${rec.cardId}`),
    )
    .map((rec) => caseKey(rec.cardId, rec.pp, rec.boardFull));
}

describe("play-mode boundary sweep", () => {
  it("covers every Enhance / Crystallize / Accelerate card in cards/all.json", () => {
    expect(report.cardCount).toBe(62);
    expect(report.cards.map((c) => c.id)).toEqual([
      "10001110",
      "10042120",
      "10121140",
      "10123120",
      "10124110",
      "10134110",
      "10152110",
      "10203120",
      "10222310",
      "10223110",
      "10344120",
      "10352120",
      "10361310",
      "10403120",
      "10412110",
      "10421110",
      "10423110",
      "10424110",
      "10444120",
      "10451110",
      "10462110",
      "10503310",
      "10522310",
      "10523310",
      "10551110",
      "10561120",
      "10571110",
      "10621110",
      "10621310",
      "10622110",
      "10622310",
      "10623110",
      "10623310",
      "10624110",
      "10632120",
      "10633310",
      "10641120",
      "10652110",
      "10652120",
      "10661110",
      "10662110",
      "10663110",
      "10671110",
      "10672110",
      "10673110",
      "10741110",
      "10762210",
      "10773110",
      "10814120",
      "10822310",
      "10844120",
      "10862310",
      "10874110",
      "10901110",
      "10921310",
      "10922120",
      "10923310",
      "10932110",
      "10941310",
      "10952110",
      "10952310",
      "10962120",
    ]);
    expect(report.caseCount).toBe(784);
    expect(report.hashFn).toBe("hashGameState");
  });

  it("I1 accepted ⇒ ppAfter === ppBefore − plan.cost (unknown cards)", () => {
    expect(unexpectedFailures("I1")).toEqual([]);
  });

  it("I2 plan mode matches the documented resolvePlayCost rule", () => {
    expect(unexpectedFailures("I2")).toEqual([]);
  });

  it("I3 rejected ⇒ hashGameState and pp unchanged", () => {
    expect(unexpectedFailures("I3")).toEqual([]);
  });

  it("I4 full board: permanents rejected, Accelerate accepted, spell Enhance unaffected", () => {
    expect(unexpectedFailures("I4")).toEqual([]);
  });

  it("I5 no exception escapes a play", () => {
    expect(unexpectedFailures("I5")).toEqual([]);
  });

  it("I6 accepted play: hand −1 and card lands in the expected zone (unknown cards)", () => {
    expect(unexpectedFailures("I6")).toEqual([]);
  });
});

describe("play-mode boundary findings (engine, not fixed here)", () => {
  for (const finding of KNOWN_FINDINGS) {
    const title =
      `${finding.invariant} ${finding.cardId} ${finding.name} — ` +
      `${finding.quote} — printed: ${finding.text.replace(/\n/g, " / ")}`;
    it.fails(title, () => {
      const rows = report.cases.filter((rec) => rec.cardId === finding.cardId);
      expect(rows.length).not.toBe(0);
      for (const rec of rows) {
        expect(rec.checks[finding.invariant].passed).toBe(true);
      }
    });
  }
});

describe("play-mode sweep inventory", () => {
  it("every invariant id is evaluated on every case", () => {
    for (const rec of report.cases) {
      expect(INVARIANT_IDS.every((id) => rec.checks[id] != null)).toBe(true);
    }
    expect(report.cases.length).toBe(784);
  });
});
