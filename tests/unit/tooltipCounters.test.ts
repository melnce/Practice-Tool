import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { state, resetGameState } from "../../src/core/gameState.js";
import type { CardInstance } from "../../src/core/types/index.js";
import { getCardDetails } from "../../src/data/cardIndex.js";
import { loadCardDatabase } from "../../src/data/cardDatabase.js";
import {
  collectTooltipCounters,
  counterLabel,
  formatCounterValueText,
  resolveCounterValue,
} from "../../src/ui/tooltipCounters.js";
import {
  extractCardCrests,
  cardIdFromCrestImage,
} from "../../src/ui/tooltipFormat.js";
import { formatCardTooltip } from "../../src/ui/tooltips.js";

function cardFromId(id: string): CardInstance {
  const tmpl = getCardDetails(id);
  if (!tmpl) throw new Error(`missing card ${id}`);
  return structuredClone(tmpl) as CardInstance;
}

describe("tooltipCounters", () => {
  beforeAll(async () => {
    await loadCardDatabase();
  });

  beforeEach(() => {
    resetGameState(42);
    state.gameStarted = true;
    state.players.first.followerEnterHistory = [];
    state.players.second.followerEnterHistory = [];
  });

  it("detects Drache named_enter_count with /2 threshold", () => {
    const card = cardFromId("10844110");
    const counters = collectTooltipCounters(card);
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({
      source: "named_enter_count",
      threshold: 2,
      params: { name: "Drache & Aluzard, Burning Blood" },
    });
    expect(counters[0].label).toBe("Drache & Aluzards summoned");
  });

  it("resolves named_enter_count from follower enter history", () => {
    const card = cardFromId("10844110");
    const spec = collectTooltipCounters(card)[0];
    state.players.first.followerEnterHistory.push({
      name: "Drache & Aluzard, Burning Blood",
      tribes: [],
      cardId: "10844110",
    });
    const resolved = resolveCounterValue(spec, "first", card);
    expect(resolved).toEqual({ kind: "single", value: 1 });
    expect(formatCounterValueText(spec, "first", card)).toBe("1/2");
  });

  it("dedupes duplicate sources on one card", () => {
    const card = cardFromId("10114130");
    const counters = collectTooltipCounters(card);
    const pixie = counters.filter((c) => c.source === "count_in_hand");
    expect(pixie).toHaveLength(1);
    expect(pixie[0].params.tribe).toBe("Pixie");
  });

  it("labels combo counters", () => {
    expect(counterLabel("combo", {})).toBe("Combo");
  });
});

describe("tooltipFormat", () => {
  beforeAll(async () => {
    await loadCardDatabase();
  });

  it("extracts crest data from Drache Last Words", () => {
    const card = cardFromId("10844110");
    const crests = extractCardCrests(card);
    expect(crests).toHaveLength(1);
    expect(crests[0].name).toBe("Drache & Aluzard, Burning Blood");
    expect(crests[0].image).toContain("10844110_token.webp");
    expect(cardIdFromCrestImage(crests[0].image!)).toBe("10844110");
  });
});

describe("formatCardTooltip", () => {
  beforeAll(async () => {
    await loadCardDatabase();
  });

  beforeEach(() => {
    resetGameState(7);
    state.gameStarted = true;
  });

  it("renders dynamic counter block above description for Drache", () => {
    const card = cardFromId("10844110");
    const html = formatCardTooltip(card, "first");
    expect(html.indexOf("tooltip-counter-block")).toBeLessThan(
      html.indexOf("tooltip-desc-block"),
    );
    expect(html).toContain("Drache &amp; Aluzards summoned");
    expect(html).toContain("0/2");
    expect(html).toContain('class="tooltip-keyword"');
    expect(html).toContain("tooltip-crest-panel");
  });
});
