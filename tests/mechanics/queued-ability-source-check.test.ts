/**
 * Queued reactive abilities must fizzle at resolution start when their source
 * has left the leader area / field (Last Words excepted — death_lw path).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenRunEffects,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { getBoard, getCrests } from "../../src/core/playerHelpers.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { allocateInsertionTs } from "../../src/logic/core/triggers/utils.js";
import { clearLogs, getLogs } from "../../src/core/logger.js";
import type {
  CardInstance,
  Effect,
  Player,
} from "../../src/core/types/index.js";
import "../../src/logic/core/effects/index.js";

const GILDARIA = "10724110";
const KRULLE = "10314110";

function makeLwVictim(
  name: string,
  lwEffects: Effect[],
  insertionTs: number,
): CardInstance {
  const victim = createCard(
    {
      name,
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      keywords: [{ name: "LastWords", effects: lwEffects }],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(victim);
  (victim as any).insertionTs = insertionTs;
  return victim;
}

function addKrulleEnterCrest(player: Player) {
  const card = getCardById(KRULLE)!;
  const crestOp = card.superevolve?.find(
    (e: any) => e.op === "crest" && e.action === "gain",
  ) as any;
  const crest = {
    name: crestOp.name,
    owner: player,
    countdown: crestOp.countdown ?? 2,
    triggers: crestOp.triggers,
    insertionTs: allocateInsertionTs(),
  };
  getCrests(state, player).push(crest as any);
  return crest;
}

describe("Queued ability source check at resolution", () => {
  beforeEach(() => {
    resetUidCounter();
    (globalThis as any).HEADLESS = false;
    clearLogs();
    givenGameState({ seed: 42, activePlayer: "first", turn: 5 }).build();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
    state.turnNumber = 5;
  });

  it("(a) Gildaria enter-Rush fizzles when Gildaria is destroyed before reactive drain", () => {
    const gild = createCard(GILDARIA, "board", "first");
    applyKeywordsFromList(gild);
    (gild as any).insertionTs = 0;

    const lwSummon = makeLwVictim(
      "LW Summon",
      [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
      1,
    );
    const lwKillGild = makeLwVictim(
      "LW Kill Gild",
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "Gildaria, Anathema of Attunement" },
        },
      ],
      2,
    );

    state.players.first.board = [gild, lwSummon, lwKillGild];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Summon" },
        },
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Kill Gild" },
        },
      ],
      "first",
    );

    expect(
      findOnBoard("first", "Gildaria, Anathema of Attunement"),
    ).toBeUndefined();
    const goblin = getBoard(state, "first").find((c) => c?.name === "Goblin");
    expect(goblin).toBeTruthy();
    expect(goblin!.hasRush).toBe(false);

    const fizzled = getLogs().filter((e) => e.type === "triggerFizzled");
    expect(fizzled.length).toBeGreaterThanOrEqual(1);
    expect(
      fizzled.some(
        (e) =>
          e.details?.sourceName === "Gildaria, Anathema of Attunement" &&
          e.details?.event === "ally_follower_enter",
      ),
    ).toBe(true);
  });

  it("(b) amulet whenever reaction fizzles when amulet is destroyed before reactive drain", () => {
    const amulet = createCard(
      {
        name: "Enter Buff Amulet",
        type: "Amulet",
        cost: 2,
        attack: 0,
        defense: 0,
        triggers: [
          {
            event: "ally_follower_enter",
            source: "board",
            effects: [
              {
                op: "stat",
                action: "give",
                target: "entering_follower",
                attack: 3,
                defense: 0,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    (amulet as any).insertionTs = 0;

    const lwSummon = makeLwVictim(
      "LW Summon",
      [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
      1,
    );
    const lwKillAmulet = makeLwVictim(
      "LW Kill Amulet",
      [
        {
          op: "destroy",
          target: "ally:amulet",
          filter: { name: "Enter Buff Amulet" },
        },
      ],
      2,
    );

    state.players.first.board = [amulet, lwSummon, lwKillAmulet];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Summon" },
        },
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Kill Amulet" },
        },
      ],
      "first",
    );

    expect(findOnBoard("first", "Enter Buff Amulet")).toBeUndefined();
    const goblin = getBoard(state, "first").find((c) => c?.name === "Goblin");
    expect(goblin).toBeTruthy();
    expect(Number(goblin!.attack)).toBe(1);

    const fizzled = getLogs().filter((e) => e.type === "triggerFizzled");
    expect(
      fizzled.some(
        (e) =>
          e.details?.sourceName === "Enter Buff Amulet" &&
          e.details?.event === "ally_follower_enter",
      ),
    ).toBe(true);
  });

  it("(c) crest enter reaction fizzles when crest is removed before reactive drain", () => {
    const crest = addKrulleEnterCrest("first");

    const lwSummon = makeLwVictim(
      "LW Summon",
      [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
      1,
    );
    const lwRemoveCrest = makeLwVictim(
      "LW Remove Crest",
      [
        {
          op: "crest",
          action: "destroy",
          name: crest.name,
        },
      ],
      2,
    );

    state.players.first.board = [lwSummon, lwRemoveCrest];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Summon" },
        },
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Remove Crest" },
        },
      ],
      "first",
    );

    expect(getCrests(state, "first").some((c) => c.name === crest.name)).toBe(
      false,
    );
    const goblin = getBoard(state, "first").find((c) => c?.name === "Goblin");
    expect(goblin).toBeTruthy();
    expect(Number(goblin!.attack)).toBe(1);

    const fizzled = getLogs().filter((e) => e.type === "triggerFizzled");
    expect(
      fizzled.some(
        (e) =>
          e.details?.sourceName === crest.name &&
          e.details?.event === "ally_follower_enter",
      ),
    ).toBe(true);
  });

  it("(d-control) Gildaria enter-Rush resolves when Gildaria stays on board", () => {
    const gild = createCard(GILDARIA, "board", "first");
    applyKeywordsFromList(gild);

    const lwSummon = makeLwVictim(
      "LW Summon",
      [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
      1,
    );

    state.players.first.board = [gild, lwSummon];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Summon" },
        },
      ],
      "first",
    );

    expect(
      findOnBoard("first", "Gildaria, Anathema of Attunement"),
    ).toBeTruthy();
    const goblin = getBoard(state, "first").find((c) => c?.name === "Goblin");
    expect(goblin).toBeTruthy();
    expect(goblin!.hasRush).toBe(true);
    expect(getLogs().filter((e) => e.type === "triggerFizzled")).toHaveLength(
      0,
    );
  });

  it("(e-control) Last Words still resolves when source is in graveyard", () => {
    const victim = makeLwVictim(
      "LW Token",
      [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
      1,
    );
    state.players.first.board = [victim];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Token" },
        },
      ],
      "first",
    );

    expect(getBoard(state, "first").some((c) => c?.name === "Goblin")).toBe(
      true,
    );
    expect(getLogs().filter((e) => e.type === "triggerFizzled")).toHaveLength(
      0,
    );
  });

  it("(d-control) crest enter debuff resolves when crest remains", () => {
    addKrulleEnterCrest("first");
    const lwSummon = makeLwVictim(
      "LW Summon",
      [{ op: "summon", source: "named", name: "Goblin", count: 1 }],
      1,
    );
    state.players.first.board = [lwSummon];

    whenRunEffects(
      [
        {
          op: "destroy",
          target: "ally:follower",
          filter: { name: "LW Summon" },
        },
      ],
      "first",
    );

    const goblin = getBoard(state, "first").find((c) => c?.name === "Goblin");
    expect(goblin).toBeTruthy();
    expect(Number(goblin!.attack)).toBe(0);
    expect(getCrests(state, "first").length).toBeGreaterThan(0);
    expect(getLogs().filter((e) => e.type === "triggerFizzled")).toHaveLength(
      0,
    );
  });
});
