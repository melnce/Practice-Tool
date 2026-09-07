/**
 * Chain-depth guard — process.ts must throw in test (NODE_ENV=test) with diagnostics.
 * Uses fireTriggerImmediate re-entry (bypasses triggers.ts depth) to hit process.ts guard.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "../audit/setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import {
  fireTrigger,
  registerRunEffects,
} from "../../src/logic/core/triggers.js";
import {
  enqueueReactiveTriggerGroup,
  fireTriggerImmediate,
} from "../../src/logic/core/triggers/queue.js";

// Synthetic card: ally_draw trigger whose effect re-raises ally_draw via immediate dispatch.
const LOOP_CARD_NAME = "DepthLoopCard";

describe("chain depth guard (process.ts)", () => {
  beforeEach(() => {
    resetUidCounter();
    vi.restoreAllMocks();
    registerRunEffects((_effects, owner, _source, context) => {
      fireTriggerImmediate("ally_draw", owner, context);
    });
  });

  it("throws through normal dispatch with event name and card name in message", () => {
    const loopCard = createCard({
      name: LOOP_CARD_NAME,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      triggers: [
        {
          event: "ally_draw",
          source: "board",
          effects: [{ op: "draw", count: 1 }],
        },
      ],
    });

    givenGameState({ seed: 42 })
      .withFirstBoard([loopCard])
      .withFirstDeck(makeFillerDeck("f", 35))
      .build();

    // Seed guard history so the diagnostic names a card (queue-backed history).
    enqueueReactiveTriggerGroup("ally_draw", "first", [
      {
        trigger: {
          event: "ally_draw",
          effects: [{ op: "draw", count: 1 }],
        },
        card: loopCard,
        cardUid: loopCard.uid,
        owner: "first",
        source: "board",
        context: { _turnNumber: 1 },
        event: "ally_draw",
      },
    ]);

    const context = { _turnNumber: 1 };

    expect(() => fireTrigger("ally_draw", "first", context)).toThrow(
      new RegExp(`Chain depth exceeded 100.*ally_draw.*${LOOP_CARD_NAME}`),
    );
  });
});

function makeFillerDeck(prefix: string, n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      name: `${prefix}${i}`,
      type: "Follower" as const,
      cost: 1,
      attack: 1,
      defense: 1,
    });
  }
  return out;
}
