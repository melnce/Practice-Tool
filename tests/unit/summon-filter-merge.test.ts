import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  createCard,
  resetUidCounter,
  givenGameState,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { pickDestroyedMatch } from "../../src/logic/core/destroyedHistory.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { getCardById, getCardDetails } from "../../src/data/cardDatabase.js";
import { normalizeToUnifiedSpec } from "../../src/logic/effects/ops/summon/types.js";
import { summonNamed } from "../../src/logic/effects/ops/summon/primitives.js";
import "../../src/logic/core/effects/index.js";

const AMULET_LW = "Winged Statue";
const FOLLOWER_LW = "LW Follower";

function setup(seed = 1): void {
  resetUidCounter();
  givenGameState({ seed, activePlayer: "first", roundCount: 5 }).build();
  state.gameStarted = true;
}

/** Exercise spec.filter alone — the surface handlers.ts:164 reads without eff.filter rescue. */
function summonViaSpecFilter(
  eff: Record<string, unknown>,
  owner: "first" | "second" = "first",
): void {
  const spec = normalizeToUnifiedSpec(eff as any);
  const records = pickDestroyedMatch(state, owner, {
    filter: spec.filter as any,
    count: spec.count,
  });
  for (const record of records) {
    const base =
      getCardById(record.cardId || record.id) ?? getCardDetails(record.name);
    if (!base) continue;
    summonNamed(
      { op: "summon", source: "named", name: base.name, count: 1 } as any,
      owner,
    );
  }
}

describe("summon filter merge", () => {
  beforeEach(() => setup());

  it("merges filter and condition on destroyed_match summon (both predicates required)", () => {
    // Seed 5: condition-only pool picks the follower; merged pool is amulet-only.
    setup(5);

    const amulet = createCard("10062210", "graveyard", "first");
    amulet.hasLastWords = true;
    recordDestroyed(state, "first", amulet);

    const follower = createCard("10001110", "graveyard", "first");
    follower.name = FOLLOWER_LW;
    follower.hasLastWords = true;
    recordDestroyed(state, "first", follower);

    summonViaSpecFilter({
      op: "summon",
      source: "destroyed_match",
      count: 1,
      filter: { type: "Amulet" },
      condition: { hasLastWords: true },
    });

    const summoned = getBoard(state, "first");
    expect(summoned).toHaveLength(1);
    expect(summoned[0].name).toBe(AMULET_LW);
  });

  it("filter wins over condition on the same key (type collision)", () => {
    const amulet = createCard("10062210", "graveyard", "first");
    recordDestroyed(state, "first", amulet);

    const follower = createCard("10001110", "graveyard", "first");
    follower.name = "Fairy";
    recordDestroyed(state, "first", follower);

    summonViaSpecFilter({
      op: "summon",
      source: "destroyed_match",
      count: 1,
      filter: { type: "Amulet" },
      condition: { type: "Follower" },
    });

    const summoned = getBoard(state, "first");
    expect(summoned).toHaveLength(1);
    expect(summoned[0].name).toBe(AMULET_LW);
  });
});
