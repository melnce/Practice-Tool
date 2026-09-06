/**
 * Countdown amulets reaching 0 by effect must be destroyed immediately,
 * with Last Words resolving in the same sequence (not at next cleanup).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  createCard,
  resetUidCounter,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { handleCountdown } from "../../src/logic/effects/ops/countdown/unified.js";
import { playCard } from "../../src/logic/core/playCard/index.js";
import {
  getBoard,
  getGraveyard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import {
  undo,
  redo,
  resetHistory,
  setHistoryEnabled,
} from "../../src/core/history.js";
import type { Crest } from "../../src/logic/effects/crest.js";
import "../../src/logic/core/effects/index.js";

const DREAD_PIRATE_FLAG = "90021210";
const BARBAROS = "10924110";

const R6 = 6;
const R8 = 8;

function noopSwordcraftSpell() {
  return createCard(
    {
      name: "Noop Sword Spell",
      type: "Spell",
      cost: 1,
      class: "Swordcraft",
      tribes: [],
      spell: [],
    },
    "hand",
    "first",
  );
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    board?: string[];
    pp?: number;
    seed?: number;
    noopSpell?: boolean;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: opts.seed ?? 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.board?.length) b = b.withFirstBoard(opts.board);
  b.build();
  if (opts.noopSpell) {
    state.players.first.hand = [noopSwordcraftSpell()];
  }
  state.gameStarted = true;
  state.phase = "main";
}

function flagOnBoard(countdown: number) {
  const flag = createCard(DREAD_PIRATE_FLAG, "board", "first");
  applyKeywordsFromList(flag);
  flag.hasCountdown = true;
  flag.countdown = countdown;
  state.players.first.board.push(flag);
  return flag;
}

function countdownAmuletWithLw(countdown: number, lwDamage: number) {
  const amulet = createCard(
    {
      name: "LW Amulet",
      type: "Amulet",
      cost: 2,
      attack: 0,
      defense: 0,
      keywords: [
        { name: "Countdown", turns: countdown },
        {
          name: "LastWords",
          effects: [
            {
              op: "damage",
              target: "enemy:leader",
              amount: lwDamage,
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(amulet);
  amulet.countdown = countdown;
  state.players.first.board.push(amulet);
  return amulet;
}

describe("Countdown zero immediate destruction", () => {
  beforeEach(() => {
    resetUidCounter();
    resetHistory();
    state.gameStarted = true;
    state.phase = "main";
    state.activePlayer = "first";
  });

  it("(a) Dread Pirate's Flag at countdown 1: spell play destroys it and deals 2 before play returns", () => {
    setupTurn(R6, { pp: 2, noopSpell: true });
    const flag = flagOnBoard(1);
    const flagUid = flag.uid;
    state.players.second.hp = 20;

    whenPlayCard("first", 0);

    expect(thenBoard("first").some((c) => c.uid === flagUid)).toBe(false);
    expect(getGraveyard(state, "first").some((c) => c.uid === flagUid)).toBe(
      true,
    );
    expect(getHP(state, "second")).toBe(18);
  });

  it("(b) Dread Pirate's Flag at countdown 2: spell play leaves it on board at 1", () => {
    setupTurn(R6, { pp: 2, noopSpell: true });
    const flag = flagOnBoard(2);
    const hpBefore = getHP(state, "second");

    whenPlayCard("first", 0);

    const onBoard = thenBoard("first").find((c) => c.uid === flag.uid);
    expect(onBoard).toBeDefined();
    expect(Number(onBoard!.countdown)).toBe(1);
    expect(getHP(state, "second")).toBe(hpBefore);
  });

  it("(c) Barbaros fanfare destroys countdown-3 Dread Pirate's Flag during fanfare", () => {
    setupTurn(R8, { hand: [BARBAROS], pp: 7 });
    const flag = flagOnBoard(3);
    const flagUid = flag.uid;
    state.players.second.hp = 20;

    whenPlayCard("first", 0);

    expect(thenBoard("first").some((c) => c.uid === flagUid)).toBe(false);
    expect(getGraveyard(state, "first").some((c) => c.uid === flagUid)).toBe(
      true,
    );
    expect(getHP(state, "second")).toBe(18);
    expect(findOnBoard("first", "Barbaros, Rebellious Convict")).toBeDefined();
  });

  it("(d) deferred death batch: follower LW before amulet LW in entry order", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();

    const follower = createCard(
      {
        name: "Fodder",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        keywords: [
          {
            name: "LastWords",
            effects: [{ op: "damage", target: "enemy:leader", amount: 3 }],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(follower);
    follower.peak_defense = 1;
    follower.uid = "fodder_uid";

    const amulet = countdownAmuletWithLw(1, 2);
    amulet.uid = "lw_amulet_uid";
    state.players.first.board = [follower, amulet];
    state.players.second.hp = 20;

    whenRunEffects(
      [
        {
          op: "damage",
          target: "ally:follower",
          amount: 1,
          filter: { name: "Fodder" },
        },
        {
          op: "countdown",
          action: "advance",
          target: "ally:amulet",
          filter: { name: "LW Amulet" },
          amount: 1,
        },
      ],
      "first",
    );

    expect(getHP(state, "second")).toBe(15);
    expect(thenBoard("first").some((c) => c.uid === amulet.uid)).toBe(false);
    expect(thenBoard("first").some((c) => c.uid === follower.uid)).toBe(false);
  });

  it("(e) undo/redo around spell-triggered flag destruction preserves outcome", () => {
    setHistoryEnabled(true);
    setupTurn(R6, { pp: 2, noopSpell: true });
    const flag = flagOnBoard(1);
    const flagUid = flag.uid;
    state.players.second.hp = 20;

    playCard(getHand(state, "first"), "first", 0);

    expect(thenBoard("first").some((c) => c.uid === flagUid)).toBe(false);
    expect(getHP(state, "second")).toBe(18);

    undo({ autoRender: false });
    expect(thenBoard("first").some((c) => c.uid === flagUid)).toBe(true);
    expect(getHP(state, "second")).toBe(20);

    redo({ autoRender: false });
    expect(thenBoard("first").some((c) => c.uid === flagUid)).toBe(false);
    expect(getHP(state, "second")).toBe(18);
    setHistoryEnabled(false);
  });

  it("(f) crest reaching 0 by effect still completes via completeCrest (unchanged)", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    const crest: Crest = {
      name: "Test Crest",
      owner: "first",
      countdown: 1,
      effects: [],
    };
    state.players.first.crests = [crest];

    handleCountdown(
      {
        op: "countdown",
        action: "advance",
        target: "self",
        amount: 1,
      } as any,
      { owner: "first", source: crest },
    );

    expect(getCrests(state, "first").some((c) => c.name === "Test Crest")).toBe(
      false,
    );
  });
});
