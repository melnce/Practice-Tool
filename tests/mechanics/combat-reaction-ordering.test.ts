/**
 * Combat reaction ordering — reactions raised during an attack resolve after the
 * step that raised them (Japanese effect-processing spec, 2026-09-06).
 *
 * (a) Last Words batch: attacker LW → defender LW → enter reaction
 * (b) Strike/Clash: Strike → Clash → enter reaction (before combat damage)
 * (c) Attack ends with empty queue (PR #243)
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { getBoard } from "../../src/core/playerHelpers.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getResolutionQueue } from "../../src/logic/core/triggers/queue.js";
import { dispatch as engineDispatch } from "../../src/engine.js";
import { clearLogs, getLogs } from "../../src/core/logger.js";
import { setHistoryEnabled } from "../../src/core/history.js";
import type { CardInstance, Effect } from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const ENTER_RUSH_WATCHER: Effect[] = [
  {
    op: "counter",
    action: "add",
    key: "earth",
    amount: 1,
  },
  {
    op: "keyword",
    action: "grant",
    keywords: ["Rush"],
    target: "entering_follower",
  },
];

function enterDefBuffWatcher(
  tokenName: string,
  owner: "first" | "second" = "first",
): CardInstance {
  const card = createCard(
    {
      name: "DefBuffWatcher",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "ally_follower_enter",
          source: "board",
          condition: { name: tokenName },
          effects: [
            { op: "counter", action: "add", key: "earth", amount: 1 },
            {
              op: "stat",
              action: "give",
              target: "entering_follower",
              defense: 1,
            },
          ],
        },
      ],
    },
    "board",
    owner,
  );
  applyKeywordsFromList(card);
  card.peak_defense = card.defense;
  card.justPlayed = false;
  return card;
}

function enterWatcher(owner: "first" | "second" = "first"): CardInstance {
  const card = createCard(
    {
      name: "EnterWatcher",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 5,
      triggers: [
        {
          event: "ally_follower_enter",
          source: "board",
          condition: { name: "Knight" },
          effects: ENTER_RUSH_WATCHER,
        },
      ],
    },
    "board",
    owner,
  );
  applyKeywordsFromList(card);
  card.peak_defense = card.defense;
  card.justPlayed = false;
  return card;
}

function firstIndex(type: string, after = -1): number {
  const logs = getLogs();
  for (let i = after + 1; i < logs.length; i++) {
    if (logs[i]!.type === type) return i;
  }
  return -1;
}

describe("Combat reaction ordering", () => {
  beforeEach(() => {
    resetUidCounter();
    setHistoryEnabled(false);
    clearLogs();
    givenGameState({ seed: 42, activePlayer: "first", turn: 5 })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.turnNumber = 5;
  });

  it("(a) mutual kill: attacker LW summon → defender LW AoE → enter reaction (engineDispatch)", () => {
    const prevHeadless = (globalThis as any).HEADLESS;
    (globalThis as any).HEADLESS = false;
    clearLogs();
    const watcher = enterWatcher("first");
    getBoard(state, "first").push(watcher);

    const attacker = createCard(
      {
        name: "AttackerLW",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        justPlayed: false,
        can_attack: true,
        can_attack_followers: true,
        attacks_left: 1,
        keywords: [
          {
            name: "LastWords",
            effects: [
              { op: "summon", source: "named", name: "Knight", count: 1 },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(attacker);
    attacker.peak_defense = 3;
    getBoard(state, "first").push(attacker);

    const defender = createCard(
      {
        name: "DefenderLW",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        keywords: [
          {
            name: "LastWords",
            effects: [
              {
                op: "damage",
                target: "enemy:follower",
                amount: 99,
                distribution: "all",
              },
            ],
          },
        ],
      },
      "board",
      "second",
    );
    applyKeywordsFromList(defender);
    defender.peak_defense = 3;
    getBoard(state, "second").push(defender);

    engineDispatch(state, {
      type: "ATTACK",
      player: "first",
      attackerUid: attacker.uid,
      defender: { type: "card", uid: defender.uid },
    });

    const knight = getBoard(state, "first").find((c) => c?.name === "Knight");
    // Defender LW kills the 1/1; watcher also dies to the same AoE before enter drains.
    expect(knight).toBeUndefined();
    expect(watcher.counters?.earth ?? 0).toBe(0);
    expect(
      getLogs().some(
        (e) =>
          e.type === "triggerFizzled" &&
          e.details?.sourceName === "EnterWatcher" &&
          e.details?.event === "ally_follower_enter",
      ),
    ).toBe(true);

    const summonIdx = firstIndex("summon");
    const postSummonDamageIdx = getLogs().findIndex(
      (e, i) => i > summonIdx && e.type === "damage",
    );
    const knightDeathIdx = getLogs().findIndex(
      (e, i) =>
        i > summonIdx && e.type === "death" && e.details?.card === "Knight",
    );
    const fizzledIdx = getLogs().findIndex(
      (e) =>
        e.type === "triggerFizzled" && e.details?.sourceName === "EnterWatcher",
    );
    expect(summonIdx).toBeGreaterThanOrEqual(0);
    expect(postSummonDamageIdx).toBeGreaterThan(summonIdx);
    expect(knightDeathIdx).toBeGreaterThan(postSummonDamageIdx);
    expect(fizzledIdx).toBeGreaterThan(knightDeathIdx);
    expect(getResolutionQueue()).toHaveLength(0);
    (globalThis as any).HEADLESS = prevHeadless;
  });

  it("(b) Strike summon → defender Clash → enter reaction before combat damage", () => {
    const prevHeadless = (globalThis as any).HEADLESS;
    (globalThis as any).HEADLESS = false;
    clearLogs();
    // Twinblade Goblin is 1/1 — Clash 1 AoE kills it only if Clash resolves before the
    // enter buff (+1 def would make it 1/2 and let it survive Clash at 1/1).
    const TOKEN = "Twinblade Goblin";
    const watcher = enterDefBuffWatcher(TOKEN);
    getBoard(state, "first").push(watcher);

    const striker = createCard(
      {
        name: "StrikeSummoner",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        justPlayed: false,
        can_attack: true,
        can_attack_followers: true,
        attacks_left: 1,
        triggers: [
          {
            event: "strike",
            source: "board",
            effects: [{ op: "summon", source: "named", name: TOKEN, count: 1 }],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(striker);
    striker.peak_defense = 3;
    getBoard(state, "first").push(striker);

    const defender = createCard(
      {
        name: "ClashPinger",
        type: "Follower",
        cost: 3,
        attack: 1,
        defense: 10,
        triggers: [
          {
            event: "clash",
            source: "board",
            effects: [
              {
                op: "damage",
                target: "enemy:follower",
                amount: 1,
                distribution: "all",
              },
            ],
          },
        ],
      },
      "board",
      "second",
    );
    applyKeywordsFromList(defender);
    defender.peak_defense = 10;
    getBoard(state, "second").push(defender);

    engineDispatch(state, {
      type: "ATTACK",
      player: "first",
      attackerUid: striker.uid,
      defender: { type: "card", uid: defender.uid },
    });

    const token = getBoard(state, "first").find((c) => c?.name === TOKEN);
    // Spec: Strike → Clash (1 dmg kills 1/1) → enter buff — token gone, watcher still saw enter.
    expect(token).toBeUndefined();
    expect(watcher.counters?.earth ?? 0).toBe(1);

    const summonIdx = firstIndex("summon");
    const clashDamageIdx = getLogs().findIndex(
      (e, i) =>
        i > summonIdx && e.type === "damage" && e.details?.target === TOKEN,
    );
    const earthIdx = getLogs().findIndex(
      (e) => e.type === "counterChange" && e.details?.key === "earth",
    );
    const attackIdx = firstIndex("attack");
    expect(summonIdx).toBeGreaterThanOrEqual(0);
    expect(clashDamageIdx).toBeGreaterThan(summonIdx);
    expect(earthIdx).toBeGreaterThan(clashDamageIdx);
    expect(attackIdx).toBeGreaterThan(earthIdx);
    expect(getResolutionQueue()).toHaveLength(0);
    (globalThis as any).HEADLESS = prevHeadless;
  });

  it("(c) reaction does not leak into the next action", () => {
    const watcher = enterWatcher("first");
    getBoard(state, "first").push(watcher);

    const striker = createCard(
      {
        name: "StrikeSummoner",
        type: "Follower",
        cost: 3,
        attack: 3,
        defense: 3,
        justPlayed: false,
        can_attack: true,
        can_attack_followers: true,
        attacks_left: 1,
        triggers: [
          {
            event: "strike",
            source: "board",
            effects: [
              { op: "summon", source: "named", name: "Knight", count: 1 },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(striker);
    striker.peak_defense = 3;
    getBoard(state, "first").push(striker);

    const defender = createCard(
      {
        name: "Blocker",
        type: "Follower",
        cost: 2,
        attack: 1,
        defense: 10,
      },
      "board",
      "second",
    );
    applyKeywordsFromList(defender);
    defender.peak_defense = 10;
    getBoard(state, "second").push(defender);

    engineDispatch(state, {
      type: "ATTACK",
      player: "first",
      attackerUid: striker.uid,
      defender: { type: "card", uid: defender.uid },
    });
    expect(getResolutionQueue()).toHaveLength(0);
    expect(watcher.counters?.earth ?? 0).toBe(1);

    const earthBefore = watcher.counters?.earth ?? 0;
    engineDispatch(state, { type: "END_TURN" });
    expect(watcher.counters?.earth ?? 0).toBe(earthBefore);
    expect(getResolutionQueue()).toHaveLength(0);
  });
});
