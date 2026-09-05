/**
 * Combat reactive drain — enter/depart triggers raised during combat must resolve
 * before the attack action returns (rulebook owner ruling 2026-09-05, PR #228).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { attackFollower, attackLeader } from "../../src/logic/core/combat.js";
import { getBoard, getHP } from "../../src/core/playerHelpers.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { allocateInsertionTs } from "../../src/logic/core/triggers/utils.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { setHistoryEnabled } from "../../src/core/history.js";
import type {
  CardInstance,
  Effect,
  Player,
} from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const GILDARIA = "10724110";
const OPERATIVE = "10722110";
const MACMILLAN = "10754120";
const GHOST = "90051130";
const KRULLE = "10314110";
const KNIGHT = "90021110";

function readyAttacker(
  spec: CardInstance | string,
  owner: Player = "first",
  boardIdx = 0,
): CardInstance {
  const card =
    typeof spec === "string"
      ? createCard(spec, "board", owner)
      : createCard(spec, "board", owner);
  applyKeywordsFromList(card);
  card.peak_defense = Number(card.defense);
  card.justPlayed = false;
  card.can_attack = true;
  card.can_attack_followers = true;
  card.attacks_left = 1;
  card.hasAttacked = false;
  getBoard(state, owner)[boardIdx] = card;
  return card;
}

function boardFollower(
  owner: Player,
  opts: {
    name?: string;
    attack?: number;
    defense?: number;
    id?: string;
    triggers?: object[];
    lastWordsEffects?: Effect[];
    hasWard?: boolean;
  } = {},
): CardInstance {
  const card = createCard(
    {
      name: opts.name ?? "Follower",
      type: "Follower",
      cost: 2,
      attack: opts.attack ?? 2,
      defense: opts.defense ?? 2,
      id: opts.id,
      triggers: opts.triggers,
      hasWard: opts.hasWard,
    },
    "board",
    owner,
  );
  applyKeywordsFromList(card);
  if (opts.lastWordsEffects) {
    card.hasLastWords = true;
    card.lastWordsEffects = opts.lastWordsEffects;
    card.keywordState = {
      ...(card.keywordState ?? {}),
      lastWordsEffects: opts.lastWordsEffects,
    };
  }
  card.peak_defense = Number(card.defense);
  card.justPlayed = false;
  return card;
}

function addKrulleEnterCrest(player: Player) {
  const card = getCardById(KRULLE)!;
  const crestOp = card.superevolve?.find(
    (e: any) => e.op === "crest" && e.action === "gain",
  ) as any;
  state.players[player].crests.push({
    name: crestOp.name,
    owner: player,
    countdown: crestOp.countdown ?? 2,
    triggers: crestOp.triggers,
    insertionTs: allocateInsertionTs(),
  } as any);
}

describe("Combat reactive drain", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(false);
    givenGameState({ seed: 42, activePlayer: "first", turn: 5 }).build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.turnNumber = 5;
  });

  it("(a) Gildaria grants Rush to Operative Last-Words Knight during attackFollower", () => {
    const gild = readyAttacker(GILDARIA, "first", 0);
    readyAttacker(OPERATIVE, "first", 1);
    const target = boardFollower("second", {
      name: "Target",
      attack: 5,
      defense: 5,
    });
    getBoard(state, "second")[0] = target;

    attackFollower(1, 0, "first", "second");

    const knight = getBoard(state, "first").find((c) => c?.id === KNIGHT);
    expect(knight).toBeTruthy();
    expect(knight!.hasRush).toBe(true);
    expect(knight!.can_attack).toBe(true);
    expect(getResolutionQueue()).toHaveLength(0);
    expect(
      findOnBoard("first", "Gildaria, Anathema of Attunement"),
    ).toBeTruthy();
  });

  it("(b) Macmillan buffs Departed summoned by Last Words during attackFollower", () => {
    const mac = readyAttacker(MACMILLAN, "first", 0);
    readyAttacker(
      {
        name: "LW Ghost",
        type: "Follower",
        cost: 2,
        attack: 2,
        defense: 1,
        hasLastWords: true,
        lastWordsEffects: [
          { op: "summon", source: "named", name: "Ghost", count: 1 },
        ],
      },
      "first",
      1,
    );
    const target = boardFollower("second", {
      name: "Target",
      attack: 5,
      defense: 5,
    });
    getBoard(state, "second")[0] = target;

    const hpBefore = getHP(state, "second");
    attackFollower(1, 0, "first", "second");

    const ghost = getBoard(state, "first").find((c) => c?.id === GHOST);
    expect(ghost).toBeTruthy();
    expect(Number(ghost!.attack)).toBe(2);
    expect(ghost!.hasRush).toBe(true);
    expect(ghost!.hasWard).toBe(true);
    expect(getHP(state, "second")).toBe(hpBefore - 1);
    expect(getResolutionQueue()).toHaveLength(0);
    expect(
      findOnBoard("first", "Macmillan, Reaper of Ceremonies"),
    ).toBeTruthy();
  });

  it("(c) Strike summon resolves enter reaction during attackFollower", () => {
    const observer = boardFollower("first", {
      name: "Rush Granter",
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "ally_follower_enter",
          source: "board",
          effects: [
            {
              op: "keyword",
              action: "grant",
              keywords: ["Rush"],
              target: "entering_follower",
            },
          ],
        },
      ],
    });
    getBoard(state, "first")[0] = observer;

    const striker = readyAttacker(
      {
        name: "Strike Summoner",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        triggers: [
          {
            event: "strike",
            source: "board",
            effects: [
              { op: "summon", source: "named", name: "Goblin", count: 1 },
            ],
          },
        ],
      },
      "first",
      1,
    );
    const target = boardFollower("second", {
      name: "Target",
      attack: 1,
      defense: 5,
    });
    getBoard(state, "second")[0] = target;

    attackFollower(1, 0, "first", "second");

    const goblin = getBoard(state, "first").find((c) => c?.name === "Goblin");
    expect(goblin).toBeTruthy();
    expect(goblin!.hasRush).toBe(true);
    expect(getResolutionQueue()).toHaveLength(0);
  });

  it("(d) Krulle-style enter kill during combat leaves no null on board", () => {
    addKrulleEnterCrest("first");

    readyAttacker(
      {
        name: "Strike Summoner",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        triggers: [
          {
            event: "strike",
            source: "board",
            effects: [
              {
                op: "summon",
                source: "named",
                name: "Marsh Wyrmling",
                count: 1,
              },
            ],
          },
        ],
      },
      "first",
      0,
    );
    const target = boardFollower("second", {
      name: "Target",
      attack: 1,
      defense: 5,
    });
    getBoard(state, "second")[0] = target;

    attackFollower(0, 0, "first", "second");

    const board = getBoard(state, "first");
    expect(board.every((c) => c != null)).toBe(true);
    expect(board.some((c) => c?.name === "Marsh Wyrmling")).toBe(false);
    expect(getResolutionQueue()).toHaveLength(0);
  });

  it("(e) attackLeader: leader_strike summon enter reaction drains before return", () => {
    readyAttacker(GILDARIA, "first", 0);
    const striker = readyAttacker(
      {
        name: "Leader Striker",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        keywords: ["Storm"],
        triggers: [
          {
            event: "leader_strike",
            source: "board",
            effects: [
              { op: "summon", source: "named", name: "Knight", count: 1 },
            ],
          },
        ],
      },
      "first",
      1,
    );
    striker.hasStorm = true;

    attackLeader(1, "first", "second");

    const knight = getBoard(state, "first").find((c) => c?.id === KNIGHT);
    expect(knight).toBeTruthy();
    expect(knight!.hasRush).toBe(true);
    expect(knight!.can_attack).toBe(true);
    expect(getResolutionQueue()).toHaveLength(0);
  });
});
