/**
 * Gate: KEYWORDS_SUPPORTING_STAT_DURATION must stay aligned with KEYWORD_MAP.
 *
 * JS cannot introspect whether a handler reads expires_on_turn / until_opponent_eot,
 * so the set is hand-maintained — this test proves it correct by probing each handler.
 */
import { describe, it, expect } from "vitest";
import type { CardInstance, Player } from "../../src/core/types/index.js";
import {
  KEYWORD_MAP,
  KEYWORDS_SUPPORTING_STAT_DURATION,
  applyKeyword,
} from "../../src/logic/core/keywords/apply.js";
import { getKS } from "../../src/logic/core/keywords/internal.js";

/** Handlers excluded from isolation probe — must not be in KEYWORDS_SUPPORTING_STAT_DURATION. */
const EXCLUDED_FROM_EXPIRY_PROBE: Record<string, string> = {
  skybound_art: "no-op handler; never mutates card state",
};

function freshFollower(): CardInstance {
  return {
    type: "Follower",
    name: "ExpiryProbe",
    uid: "expiry-probe",
    owner: "first" as Player,
    keywordState: {},
  } as CardInstance;
}

function recordsStatDurationExpiry(card: CardInstance): boolean {
  const ks = getKS(card);
  return (
    ks.cantAttackIsTemporary === true ||
    ks.cantAttackUntilOpponentEOT === true ||
    typeof ks.cantAttackExpiresOnTurn === "number" ||
    ks.ambushIsTemporary === true ||
    ks.ambushUntilOpponentEOT === true ||
    typeof ks.ambushExpiresOnTurn === "number"
  );
}

function probeKeywordExpiry(key: string): boolean {
  const probes = [
    { expires_on_turn: 5 },
    { until_opponent_eot: true, request_owner: "first" as Player },
  ];
  for (const opts of probes) {
    const card = freshFollower();
    applyKeyword(card, key, opts);
    if (recordsStatDurationExpiry(card)) return true;
  }
  return false;
}

describe("KEYWORDS_SUPPORTING_STAT_DURATION registry gate", () => {
  it("matches KEYWORD_MAP handlers that record expiry metadata when probed", () => {
    for (const key of Object.keys(KEYWORD_MAP)) {
      if (EXCLUDED_FROM_EXPIRY_PROBE[key]) {
        expect(KEYWORDS_SUPPORTING_STAT_DURATION.has(key)).toBe(false);
        continue;
      }
      const records = probeKeywordExpiry(key);
      const inSet = KEYWORDS_SUPPORTING_STAT_DURATION.has(key);
      expect(
        records,
        `keyword "${key}": records expiry=${records}, inSet=${inSet}`,
      ).toBe(inSet);
    }
  });

  it("set entries are present in KEYWORD_MAP", () => {
    for (const key of KEYWORDS_SUPPORTING_STAT_DURATION) {
      expect(
        KEYWORD_MAP[key],
        `set entry "${key}" missing from KEYWORD_MAP`,
      ).toBeDefined();
    }
  });
});
