/**
 * Play/enter reaction queue position — staged at board entry, FIFO ahead of Fanfare.
 * Official Q&A: Azurifrit + Crest Krulle; Japanese spec Kuon + Krulle worked example.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import {
  getBoard,
  getHP,
  getRally,
  setRally,
} from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { clearLogs, getLogs } from "../../src/core/logger.js";
import { setHistoryEnabled } from "../../src/core/history.js";
import { countNamedEnters } from "../../src/logic/core/followerEnterHistory.js";
import type { CardInstance } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const AZURIFRIT = "10344110";
const KRULLE = "10314110";
const GILDARIA = "10224110";

function makeEnterLogWatcher(name = "EnterLogWatcher"): CardInstance {
  const card = createCard(
    {
      name,
      type: "Follower",
      cost: 2,
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "ally_follower_enter",
          source: "board",
          effects: [
            {
              op: "counter",
              action: "add",
              key: "earth",
              amount: 1,
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(card);
  card.peak_defense = card.defense;
  return card;
}

describe("play/enter reaction queue order", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(false);
    clearLogs();
    givenGameState({ seed: 42, activePlayer: "first", turn: 6 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.turnNumber = 6;
    state.players.first.crests = [];
    state.players.second.crests = [];
  });

  it("(a) Azurifrit + Krulle crest: enter debuff first, 0 leader damage, self_damaged fizzles", () => {
    state.players.first.hand = [createCard(AZURIFRIT, "hand", "first")];
    state.players.first.pp = 9;
    state.players.first.maxPP = 9;
    state.players.second.hp = 20;
    const card = getCardById(KRULLE)!;
    const gain = card.superevolve?.find(
      (e: any) => e.op === "crest" && e.action === "gain",
    );
    handleGainCrest(gain as any, "second");

    whenPlayCard("first", 0);

    expect(findOnBoard("first", "Azurifrit, Heir to Disdain")).toBeUndefined();
    expect(getHP(state, "second")).toBe(20);
  });

  it("(b) Kuon shape: played enter → token enters → destroys after Fanfare summons", () => {
    const watcher = makeEnterLogWatcher();
    state.players.first.board = [watcher];

    const kuonShape = createCard(
      {
        name: "KuonShape",
        type: "Follower",
        cost: 5,
        attack: 2,
        defense: 2,
        fanfare: [
          { op: "summon", source: "named", name: "Goblin", count: 1 },
          { op: "summon", source: "named", name: "Goblin", count: 1 },
          {
            op: "destroy",
            target: "ally:follower",
            filter: { name: "Goblin" },
          },
          {
            op: "destroy",
            target: "ally:follower",
            filter: { name: "Goblin" },
          },
        ],
      },
      "hand",
      "first",
    );
    applyKeywordsFromList(kuonShape);
    state.players.first.hand = [kuonShape];

    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("done");

    expect(findOnBoard("first", "KuonShape")).toBeDefined();
    expect(watcher.counters?.earth).toBe(3);
    expect(
      getBoard(state, "first").filter((c) => c?.name === "Goblin").length,
    ).toBe(0);
  });

  it("(c) amulet ally_card_played reaction queues before Fanfare summon", () => {
    const playWatcher = createCard(
      {
        name: "CardPlayedWatcher",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 5,
        triggers: [
          {
            event: "ally_card_played",
            source: "board",
            effects: [
              {
                op: "counter",
                action: "add",
                key: "earth",
                amount: 1,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(playWatcher);
    state.players.first.board = [playWatcher];

    const amulet = createCard(
      {
        name: "SummonAmulet",
        type: "Amulet",
        cost: 2,
        attack: 0,
        defense: 2,
        fanfare: [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
      },
      "hand",
      "first",
    );
    applyKeywordsFromList(amulet);
    state.players.first.hand = [amulet];
    state.players.first.pp = 2;
    state.players.first.maxPP = 10;

    whenPlayCard("first", 0);

    expect(playWatcher.counters?.earth).toBe(1);
    expect(getBoard(state, "first").some((c) => c?.name === "Goblin")).toBe(
      true,
    );
  });

  it("(d) control: empty Fanfare keeps play/enter staging behaviour", () => {
    const watcher = makeEnterLogWatcher("PlainWatcher");
    state.players.first.board = [watcher];

    const plain = createCard(
      {
        name: "PlainFollower",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        fanfare: [],
      },
      "hand",
      "first",
    );
    applyKeywordsFromList(plain);
    state.players.first.hand = [plain];

    const outcome = whenPlayCard("first", 0);

    expect(findOnBoard("first", "PlainFollower")).toBeDefined();
    expect(watcher.counters?.earth).toBe(1);
    expect(getResolutionQueue()).toHaveLength(0);
  });

  it("(e) Fanfare target pause: enter reactions after prompt, queue empty at end", () => {
    const enterWatcher = createCard(
      {
        name: "PauseEnterWatcher",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 2,
        triggers: [
          {
            event: "ally_follower_enter",
            effects: [{ op: "add_shadows", amount: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(enterWatcher);
    state.players.first.board = [enterWatcher];

    const ally = createCard("10001110", "board", "first");
    ally.uid = "ally_target";
    ally.peak_defense = Number(ally.defense);
    state.players.first.board.push(ally);

    const marion = createCard("10142140", "hand", "first");
    applyKeywordsFromList(marion);
    state.players.first.hand = [marion];

    engineDispatch(state, {
      type: "PLAY_CARD",
      player: "first",
      cardUid: marion.uid,
    });

    expect(state.pendingTargetEffect).toBeDefined();
    expect(getResolutionQueue()).toHaveLength(0);

    engineDispatch(state, {
      type: "CHOOSE_TARGET",
      target: { type: "card", uid: ally.uid },
    });

    expect(state.pendingTargetEffect).toBeUndefined();
    expect(Number(ally.attack)).toBeGreaterThan(1);
    expect(getResolutionQueue()).toHaveLength(0);
  });

  it("(f) Rally gate excludes self; enter-count excludes self", () => {
    setRally(state, "first", 19);
    state.players.first.hand = [createCard(GILDARIA, "hand", "first")];
    state.players.first.pp = 6;
    state.players.first.maxPP = 7;
    state.players.first.superEvoPoints = 1;
    whenPlayCard("first", 0);
    const gild = findOnBoard("first", "Gildaria, Anathema of Peace")!;
    expect(gild.evoType).not.toBe("super");
    expect(gild.hasEvolved).toBeFalsy();
    expect(getRally(state, "first")).toBe(20);

    resetUidCounter();
    clearLogs();
    givenGameState({ seed: 99, activePlayer: "first", turn: 8 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";

    state.players.first.hand = [createCard("10844110", "hand", "first")];
    whenPlayCard("first", 0);
    const drache = findOnBoard("first", "Drache & Aluzard, Burning Blood")!;
    expect(Number(drache.attack)).toBe(4);
    expect(
      countNamedEnters(state, "first", "Drache & Aluzard, Burning Blood"),
    ).toBe(1);
  });
});
