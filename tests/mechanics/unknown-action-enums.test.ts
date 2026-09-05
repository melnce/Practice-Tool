/**
 * Unknown op.action values throw in dev/test (isDev), with card name in message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenRunEffects,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleDeck } from "../../src/logic/effects/deck.js";
import { handleCounter } from "../../src/logic/effects/ops/counter/unified.js";
import { handleCountdown } from "../../src/logic/effects/ops/countdown/unified.js";
import { handleCrest } from "../../src/logic/effects/ops/crest/unified.js";
import { handleFuse } from "../../src/logic/effects/ops/fuse/unified.js";
import { handleKeyword } from "../../src/logic/effects/ops/keyword/unified.js";
import { handleCost } from "../../src/logic/effects/ops/cost/unified.js";
import { handleStatOrchestrator } from "../../src/logic/effects/ops/stat/orchestrator.js";
import { DECK_ACTION_VALUES } from "../../src/logic/effects/deck.js";
import { COUNTER_ACTION_VALUES } from "../../src/logic/effects/ops/counter/types.js";
import { COUNTDOWN_ACTION_VALUES } from "../../src/logic/effects/ops/countdown/unified.js";
import { CREST_ACTION_VALUES } from "../../src/logic/effects/ops/crest/types.js";
import { FUSE_ACTION_VALUES } from "../../src/logic/effects/ops/fuse/types.js";
import { KEYWORD_ACTION_VALUES } from "../../src/logic/effects/ops/keyword/unified.js";
import { COST_ACTION_VALUES } from "../../src/logic/effects/ops/cost/types.js";
import { STAT_ACTION_VALUES } from "../../src/logic/effects/ops/stat/types.js";
import {
  PP_ACTION_VALUES,
  EP_ACTION_VALUES,
  COMBO_ACTION_VALUES,
} from "../../src/logic/core/effects/domains/resources.js";

describe("unknown op.action throws in dev/test", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
  });

  it("deck bogus action names card", () => {
    const source = createCard(
      { name: "DeckProbe", type: "Spell", cost: 0 },
      "hand",
      "first",
    );
    expect(() =>
      handleDeck({ op: "deck", action: "bogus" }, "first", {
        sourceCard: source,
      }),
    ).toThrow(/\[deck\] Unknown action "bogus".*DeckProbe/);
  });

  it("counter bogus action names card", () => {
    const source = createCard(
      {
        name: "CounterProbe",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
      },
      "board",
      "first",
    );
    expect(() =>
      handleCounter(
        { op: "counter", action: "bogus", key: "faith", amount: 1 } as any,
        { owner: "first", source },
      ),
    ).toThrow(/\[counter\] Unknown action "bogus".*CounterProbe/);
  });

  it("countdown bogus action names card", () => {
    const source = createCard(
      {
        name: "CountdownProbe",
        type: "Amulet",
        cost: 1,
        hasCountdown: true,
        countdown: 3,
      },
      "board",
      "first",
    );
    expect(() =>
      handleCountdown({ op: "countdown", action: "bogus", amount: 1 } as any, {
        owner: "first",
        source,
      }),
    ).toThrow(/\[countdown\] Unknown action "bogus".*CountdownProbe/);
  });

  it("crest bogus action names card", () => {
    const source = createCard(
      { name: "CrestProbe", type: "Spell", cost: 0 },
      "hand",
      "first",
    );
    expect(() =>
      handleCrest({ op: "crest", action: "bogus" } as any, {
        owner: "first",
        sourceCard: source,
      }),
    ).toThrow(/\[crest\] Unknown action "bogus".*CrestProbe/);
  });

  it("fuse bogus action names card", () => {
    const source = createCard(
      { name: "FuseProbe", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    expect(() =>
      handleFuse(
        { op: "fuse", action: "bogus" } as any,
        "first",
        source,
        [],
        {},
      ),
    ).toThrow(/\[fuse\] Unknown action "bogus".*FuseProbe/);
  });

  it("keyword bogus action names card", () => {
    const source = createCard(
      {
        name: "KeywordProbe",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
      },
      "board",
      "first",
    );
    expect(() =>
      handleKeyword(
        { op: "keyword", action: "bogus", keywords: ["Rush"] } as any,
        {
          owner: "first",
          sourceCard: source,
          targets: [],
          effectsQueue: [],
        },
      ),
    ).toThrow(/\[keyword\] Unknown action "bogus".*KeywordProbe/);
  });

  it("cost bogus action throws", () => {
    const source = createCard(
      { name: "CostProbe", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    expect(() =>
      handleCost(
        {
          op: "cost",
          action: "bogus",
          target: "self",
          amount: 1,
        } as any,
        "first",
        source,
        {},
      ),
    ).toThrow(/\[cost\] Unknown action "bogus"/);
  });

  it("stat bogus action throws", () => {
    const source = createCard(
      { name: "StatProbe", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    expect(() =>
      handleStatOrchestrator(
        {
          op: "stat",
          action: "bogus",
          target: "self",
          attack: 1,
        } as any,
        "first",
        source,
        [],
        {},
      ),
    ).toThrow(/\[stat\] Unknown action "bogus"/);
  });

  it("pp bogus action names card", () => {
    const source = createCard(
      { name: "PPProbe", type: "Spell", cost: 0 },
      "hand",
      "first",
    );
    expect(() =>
      whenRunEffects(
        [{ op: "pp", action: "bogus", amount: 1 } as any],
        "first",
        source,
      ),
    ).toThrow(/\[pp\] Unknown action "bogus".*PPProbe/);
  });

  it("ep bogus action throws", () => {
    expect(() =>
      whenRunEffects(
        [{ op: "ep", action: "bogus", amount: 1 } as any],
        "first",
      ),
    ).toThrow(/\[ep\] Unknown action "bogus"/);
  });

  it("combo bogus action names card", () => {
    const source = createCard(
      { name: "ComboProbe", type: "Spell", cost: 0 },
      "hand",
      "first",
    );
    expect(() =>
      whenRunEffects(
        [{ op: "combo", action: "bogus", amount: 1 } as any],
        "first",
        source,
      ),
    ).toThrow(/\[combo\] Unknown action "bogus".*ComboProbe/);
  });
});

describe("known op.action values do not warn", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  const source = () =>
    createCard(
      { name: "Probe", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );

  it("deck accepted actions", () => {
    for (const action of DECK_ACTION_VALUES) {
      expect(() =>
        handleDeck({ op: "deck", action, name: "Fairy" } as any, "first", {
          sourceCard: source(),
        }),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("counter accepted actions", () => {
    const card = source();
    for (const action of COUNTER_ACTION_VALUES) {
      expect(() =>
        handleCounter(
          { op: "counter", action, key: "faith", amount: 0 } as any,
          { owner: "first", source: card },
        ),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("countdown accepted actions", () => {
    const card = createCard(
      {
        name: "Probe",
        type: "Amulet",
        cost: 1,
        hasCountdown: true,
        countdown: 3,
      },
      "board",
      "first",
    );
    for (const action of COUNTDOWN_ACTION_VALUES) {
      expect(() =>
        handleCountdown({ op: "countdown", action, amount: 0 } as any, {
          owner: "first",
          source: card,
        }),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("crest accepted actions", () => {
    for (const action of CREST_ACTION_VALUES) {
      if (action === "gain") {
        expect(() =>
          handleCrest({ op: "crest", action, name: "Test Crest" } as any, {
            owner: "first",
            sourceCard: source(),
          }),
        ).not.toThrow();
        continue;
      }
      if (
        action === "advance" ||
        action === "advance_countdown" ||
        action === "delay_countdown"
      ) {
        const card = createCard(
          {
            name: "Probe",
            type: "Amulet",
            cost: 1,
            hasCountdown: true,
            countdown: 3,
          },
          "board",
          "first",
        );
        expect(() =>
          handleCrest(
            { op: "crest", action, name: "Test Crest", amount: 0 } as any,
            { owner: "first", source: card },
          ),
        ).not.toThrow();
        continue;
      }
      expect(() =>
        handleCrest({ op: "crest", action, name: "Test Crest" } as any, {
          owner: "first",
          sourceCard: source(),
        }),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("fuse accepted actions", () => {
    for (const action of FUSE_ACTION_VALUES) {
      if (action === "start") {
        expect(() =>
          handleFuse(
            { op: "fuse", action, initiator_uid: "x" } as any,
            "first",
            source(),
            [],
            {},
          ),
        ).not.toThrow();
      }
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("keyword accepted actions", () => {
    for (const action of KEYWORD_ACTION_VALUES) {
      if (action === "grant_trigger") continue;
      expect(() =>
        handleKeyword(
          {
            op: "keyword",
            action,
            keywords: ["Rush"],
            target: "self",
          } as any,
          {
            owner: "first",
            sourceCard: source(),
            targets: [source()],
            effectsQueue: [],
          },
        ),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("cost accepted actions", () => {
    for (const action of COST_ACTION_VALUES) {
      expect(() =>
        handleCost(
          { op: "cost", action, target: "self", amount: 0 } as any,
          "first",
          source(),
          {},
        ),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("stat accepted actions", () => {
    for (const action of STAT_ACTION_VALUES) {
      expect(() =>
        handleStatOrchestrator(
          {
            op: "stat",
            action,
            target: "self",
            attack: 0,
            defense: 0,
          } as any,
          "first",
          source(),
          [],
          {},
        ),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("pp accepted actions", () => {
    for (const action of PP_ACTION_VALUES) {
      expect(() =>
        whenRunEffects(
          [{ op: "pp", action, amount: 0 } as any],
          "first",
          source(),
        ),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("ep accepted actions", () => {
    for (const action of EP_ACTION_VALUES) {
      expect(() =>
        whenRunEffects([{ op: "ep", action, amount: 0 } as any], "first"),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("combo accepted actions", () => {
    for (const action of COMBO_ACTION_VALUES) {
      expect(() =>
        whenRunEffects(
          [{ op: "combo", action, amount: 0 } as any],
          "first",
          source(),
        ),
      ).not.toThrow();
    }
    expect(console.warn).not.toHaveBeenCalled();
  });
});
