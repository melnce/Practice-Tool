/**
 * Play-mode cost-boundary sweep — live play path at every PP threshold.
 *
 * Passing set is exact (`toEqual([])`). I1'/I6' reconcile against
 * `logEvent` rows emitted during whenPlayCard. Leftover unexplained
 * failures (if any) are `it.fails` per card and invariant.
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
}, 30_000);

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

/** Unexplained leftovers after log reconciliation. Empty unless a real bug remains. */
const KNOWN_FINDINGS: KnownFinding[] = [];

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

const SWEEP_CARD_IDS = [
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
];

describe("play-mode boundary sweep", () => {
  it("covers every Enhance / Crystallize / Accelerate card in cards/all.json", () => {
    expect(report.cardCount).toBe(62);
    expect(report.cards.map((c) => c.id)).toEqual(SWEEP_CARD_IDS);
    expect(report.caseCount).toBe(784);
    expect(report.hashFn).toBe("hashGameState");
  });

  it("I1' accepted ⇒ ppAfter === ppBefore − plan.cost + recoverPP − spendPP", () => {
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

  it("I6' accepted play: hand delta matches logged draw/add/bounce; card lands", () => {
    expect(unexpectedFailures("I6")).toEqual([]);
  });
});

describe("play-mode boundary findings (engine, not fixed here)", () => {
  if (KNOWN_FINDINGS.length === 0) {
    it("has no unexplained I1/I6 leftovers after log reconciliation", () => {
      expect(
        INVARIANT_IDS.flatMap((id) =>
          report.failures[id].map((rec) => `${id}:${rec.cardId}`),
        ),
      ).toEqual([]);
    });
  }
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
