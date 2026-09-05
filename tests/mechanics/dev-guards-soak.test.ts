/**
 * Dev-mode guard findings from soak (NODE_ENV=test). Each it.fails pins a
 * targeted-op handler that still invokes runEffects (via triggers/LW) inside
 * the handler — separate PRs. Evolve selective resume is fixed in PR #230.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getCardById } from "../../src/data/cardDatabase.js";

describe("dev-guards soak findings (separate PRs)", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
  });

  it.fails(
    "destroy targeted handler: amulet destroy fires ally_amulet_destroyed → runEffects (Omerio)",
    () => {
      const omerio = structuredClone(getCardById("10964120")!);
      omerio.uid = "omerio_1";
      omerio.zone = "board";
      omerio.owner = "second";
      omerio.peak_defense = Number(omerio.defense);
      applyKeywordsFromList(omerio);

      const amulet = createCard(
        { name: "Fodder Amulet", type: "Amulet", cost: 1, countdown: 1 },
        "board",
        "second",
      );
      amulet.uid = "fodder_amulet";
      applyKeywordsFromList(amulet);
      state.players.second.board = [omerio, amulet];

      runEffects(
        [{ op: "destroy", target: "enemy:amulet", select: 1 }],
        "first",
        null,
      );

      engineDispatch(state, {
        type: "CHOOSE_TARGET",
        target: { type: "card", uid: amulet.uid },
      });
      expect(state.players.second.board.some((c) => c.uid === amulet.uid)).toBe(
        false,
      );
    },
  );

  it.fails(
    "destroy targeted handler: amulet last words fire runEffects inside handler",
    () => {
      const amulet = createCard(
        {
          name: "LW Amulet",
          type: "Amulet",
          cost: 2,
          countdown: 2,
          hasLastWords: true,
          keywordState: {
            lastWordsEffects: [{ op: "draw", amount: 1 }],
          },
        },
        "board",
        "second",
      );
      amulet.uid = "amulet_lw2";
      applyKeywordsFromList(amulet);
      state.players.second.board = [amulet];

      runEffects(
        [{ op: "destroy", target: "enemy:amulet", select: 1 }],
        "first",
        null,
      );

      engineDispatch(state, {
        type: "CHOOSE_TARGET",
        target: { type: "card", uid: amulet.uid },
      });
      expect(state.players.second.board.length).toBe(0);
    },
  );

  it.fails(
    "damage targeted handler: dealDamage fires self_damaged trigger inside handler",
    () => {
      const damaged = createCard(
        {
          name: "Damaged Watcher",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 4,
          triggers: [
            {
              event: "self_damaged",
              source: "board",
              effects: [{ op: "draw", amount: 1 }],
            },
          ],
        },
        "board",
        "first",
      );
      damaged.uid = "damaged_1";
      damaged.peak_defense = 4;
      applyKeywordsFromList(damaged);
      state.players.first.board = [damaged];

      runEffects(
        [
          {
            op: "damage",
            target: "ally:follower",
            select: 1,
            amount: 1,
          },
        ],
        "first",
        null,
      );

      engineDispatch(state, {
        type: "CHOOSE_TARGET",
        target: { type: "card", uid: damaged.uid },
      });
      expect(Number(damaged.defense)).toBe(3);
    },
  );
});
