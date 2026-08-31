/**
 * Crest trigger owner scoping — per-event probe over the card pool plus real-card checks.
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "./setup.js";
import {
  givenGameState,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { fireTrigger } from "../../src/logic/core/triggers.js";
import { attackLeader } from "../../src/logic/core/combat.js";
import { invalidateZoneCandidatesCache } from "../../src/logic/core/triggers/utils.js";
import {
  runEndOfTurnBoundary,
  runStartOfTurnBoundary,
} from "../../src/logic/core/turnBoundary.js";
import { restoreLeaderHP } from "../../src/logic/effects/ops/restore/primitives.js";
import { onEvolve } from "../../src/logic/evolveUtils.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getCrests,
  getHP,
  getHand,
  getBoard,
} from "../../src/core/playerHelpers.js";
import type { TriggerEventName } from "../../src/logic/core/triggers/types.js";
import "../../src/logic/core/effects/index.js";

const POOL_PATH = path.resolve("cards/all.json");

/** Events on crest triggers in the 811-card pool (+ bootstrap-only). */
function collectPoolCrestEvents(): TriggerEventName[] {
  const data = JSON.parse(fs.readFileSync(POOL_PATH, "utf8")) as unknown[];
  const events = new Set<string>();

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const rec = obj as Record<string, unknown>;
    if (
      rec.op === "crest" &&
      rec.action === "gain" &&
      Array.isArray(rec.triggers)
    ) {
      for (const t of rec.triggers as Record<string, unknown>[]) {
        const ev = (t.event ?? t.type) as string | undefined;
        if (ev) events.add(ev);
      }
    }
    if (Array.isArray(obj)) obj.forEach(walk);
    else Object.values(rec).forEach(walk);
  }

  for (const card of data) walk(card);
  events.add("select_mode");
  events.add("invoke");

  return [...events].sort() as TriggerEventName[];
}

const PROBE_COUNTER = "probe";

function counter(owner: "first" | "second", crestName: string): number {
  const crest = getCrests(state, owner).find((c) => c.name === crestName);
  return Number(crest?.counters?.[PROBE_COUNTER] ?? 0);
}

function grantProbeCrest(
  event: TriggerEventName,
  triggerExtra: Record<string, unknown> = {},
): string {
  const crestName = `Probe:${event}`;
  const triggerSpec: Record<string, unknown> = {
    ...triggerExtra,
    effects: [
      {
        op: "crest",
        action: "add_counter",
        crest: crestName,
        counter: PROBE_COUNTER,
        amount: 1,
      },
    ],
  };

  if (event === "end_of_turn_own" || event === "start_of_turn_own") {
    triggerSpec.type = event;
  } else {
    triggerSpec.event = event;
  }

  const def = {
    op: "crest",
    action: "gain",
    name: crestName,
    triggers: [triggerSpec],
  };
  handleGainCrest(def as any, "first");
  handleGainCrest(def as any, "second");
  return crestName;
}

function fireProbeEvent(event: TriggerEventName): void {
  const follower = createCard(
    { name: "ProbeFollower", type: "Follower", cost: 2, attack: 2, defense: 2 },
    "board",
    "first",
  );
  follower.peak_defense = 2;
  state.players.first.board = [follower];

  const spell = createCard(
    { name: "ProbeSpell", type: "Spell", cost: 1 },
    "hand",
    "first",
  );

  switch (event) {
    case "select_mode":
      fireTrigger("select_mode", "first", { sourceCard: null });
      return;
    case "invoke":
      fireTrigger("invoke", "first", {
        sourceCard: follower,
        invokedCard: follower,
      });
      return;
    case "enhanced_play":
      fireTrigger("enhanced_play", "first", { playedCard: follower });
      return;
    case "loot_fused":
      fireTrigger("loot_fused", "first", {
        initiator: follower,
        initiatorUid: follower.uid,
      });
      return;
    case "loot_played":
      fireTrigger("loot_played", "first", { playedCard: spell });
      return;
    case "start_of_turn":
    case "start_of_turn_own":
      fireTrigger("start_of_turn", "first", {});
      return;
    case "end_of_turn":
    case "end_of_turn_own":
      fireTrigger("end_of_turn", "first", {});
      return;
    case "leader_restored":
      state.players.first.hp = 10;
      restoreLeaderHP("first", 2);
      return;
    case "ally_draw":
      fireTrigger("ally_draw", "first", {
        drawnCard: spell,
        enteringCard: spell,
      });
      return;
    case "ally_evolve":
      fireTrigger("ally_evolve", "first", { enteringCard: follower });
      return;
    case "ally_spell_played":
      fireTrigger("ally_spell_played", "first", { playedCard: spell });
      return;
    case "ally_follower_attacked":
      fireTrigger("ally_follower_attacked", "first", {
        attacker: follower,
        defender: follower,
      });
      return;
    case "ally_follower_enter":
      fireTrigger("ally_follower_enter", "first", { enteringCard: follower });
      return;
    case "ally_follower_played":
      fireTrigger("ally_follower_played", "first", { playedCard: follower });
      return;
    case "self_damaged":
      fireTrigger("self_damaged", "first", { damagedCard: follower });
      return;
    case "leader_attacked": {
      const attacker = createCard(
        {
          name: "ProbeAttacker",
          type: "Follower",
          cost: 2,
          attack: 3,
          defense: 2,
          keywords: ["Storm"],
        },
        "board",
        "second",
      );
      state.players.second.board = [attacker];
      fireTrigger("leader_attacked", "first", { attacker });
      return;
    }
    default:
      fireTrigger(event, "first", {});
  }
}

describe("Crest trigger owner scoping — per-event pool probe", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.players.first.crests = [];
    state.players.second.crests = [];
    (state as any).turnNumber = 1;
    invalidateZoneCandidatesCache();
  });

  const poolEvents = collectPoolCrestEvents();

  it.each(poolEvents)(
    "event %s: firing for first does not increment second player's probe counter",
    (event) => {
      const crestName = grantProbeCrest(event);
      fireProbeEvent(event);
      expect(counter("second", crestName)).toBe(0);
      expect(counter("first", crestName)).toBeGreaterThanOrEqual(1);
    },
  );

  it("end_of_turn + whose_turn opponent: fires for non-active crest owner only", () => {
    const crestName = grantProbeCrest("end_of_turn", {
      condition: { whose_turn: "opponent" },
    });
    fireTrigger("end_of_turn", "first", {});
    expect(counter("first", crestName)).toBe(0);
    expect(counter("second", crestName)).toBe(1);
  });
});

describe("Crest trigger owner scoping — real cards", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.players.first.crests = [];
    state.players.second.crests = [];
    (state as any).turnNumber = 1;
    invalidateZoneCandidatesCache();
  });

  function gainCardCrest(cardId: string, owner: "first" | "second"): void {
    const card = getCardById(cardId);
    expect(card).toBeDefined();
    const gain = findCrestGain(card!);
    expect(gain).toBeDefined();
    handleGainCrest(gain as any, owner);
  }

  function findCrestGain(card: Record<string, unknown>): unknown {
    let found: unknown;
    function walk(obj: unknown): void {
      if (!obj || typeof obj !== "object") return;
      const rec = obj as Record<string, unknown>;
      if (rec.op === "crest" && rec.action === "gain") found = rec;
      if (Array.isArray(obj)) obj.forEach(walk);
      else Object.values(rec).forEach(walk);
    }
    walk(card);
    return found;
  }

  const BURNITE_ASH_CREST = "Burnite, Anathema of Ash";
  const BURNITE_FLAME_CREST = "Burnite, Anathema of Flame";

  function hasNamedCrest(
    owner: "first" | "second",
    crestName: string,
  ): boolean {
    return getCrests(state, owner).some((c) => c.name === crestName);
  }

  it("Titania 10214110: mirror crest — only acting player's hand gains Fairy at SOT", () => {
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    gainCardCrest("10214110", "first");
    gainCardCrest("10214110", "second");

    const firstHandBefore = thenHand("first").length;
    const secondHandBefore = thenHand("second").length;

    runStartOfTurnBoundary("first");

    expect(thenHand("first").length).toBe(firstHandBefore + 1);
    expect(thenHand("second").length).toBe(secondHandBefore);
    expect(getHand(state, "first").some((c) => c.name === "Fairy")).toBe(true);
    expect(getHand(state, "second").some((c) => c.name === "Fairy")).toBe(
      false,
    );
  });

  describe("Burnite opponent-gift crests — routing and trigger authoring", () => {
    describe("10744110 Ash (start_of_turn_own)", () => {
      it("super-evolve from first places crest on second, not first", () => {
        givenGameState({ seed: 1, activePlayer: "first" }).build();
        const burnite = createCard("10744110", "board", "first");
        burnite.peak_defense = burnite.defense;
        state.players.first.board = [burnite];
        state.players.first.superEvoCharges = 1;

        onEvolve(burnite, "first", "super");

        expect(hasNamedCrest("first", BURNITE_ASH_CREST)).toBe(false);
        expect(hasNamedCrest("second", BURNITE_ASH_CREST)).toBe(true);
      });

      it("gain from first routes crest to second; SOT damages only crest owner", () => {
        givenGameState({ seed: 1, activePlayer: "first" })
          .withFirstHP(20)
          .withSecondHP(20)
          .build();
        // Super-evolve gain op has player: "opponent" — gifter is first, recipient is second.
        gainCardCrest("10744110", "first");

        expect(hasNamedCrest("first", BURNITE_ASH_CREST)).toBe(false);
        expect(hasNamedCrest("second", BURNITE_ASH_CREST)).toBe(true);

        runStartOfTurnBoundary("first");
        expect(getHP(state, "first")).toBe(20);
        expect(getHP(state, "second")).toBe(20);

        runStartOfTurnBoundary("second");
        expect(getHP(state, "first")).toBe(20);
        expect(getHP(state, "second")).toBe(18);
      });
    });

    describe("10144110 Flame (start_of_turn)", () => {
      it("gain from first routes crest to second; SOT damages only crest owner", () => {
        givenGameState({ seed: 1, activePlayer: "first" })
          .withFirstHP(20)
          .withSecondHP(20)
          .build();
        // Super-evolve gain op has player: "opponent" — gifter is first, recipient is second.
        gainCardCrest("10144110", "first");

        expect(hasNamedCrest("first", BURNITE_FLAME_CREST)).toBe(false);
        expect(hasNamedCrest("second", BURNITE_FLAME_CREST)).toBe(true);

        runStartOfTurnBoundary("first");
        expect(getHP(state, "first")).toBe(20);
        expect(getHP(state, "second")).toBe(20);

        runStartOfTurnBoundary("second");
        expect(getHP(state, "first")).toBe(20);
        expect(getHP(state, "second")).toBe(19);
      });

      it("leader_restored on crest owner deals damage only to that leader", () => {
        givenGameState({ seed: 1, activePlayer: "first" })
          .withFirstHP(20)
          .withSecondHP(15)
          .build();
        gainCardCrest("10144110", "first"); // crest lands on second

        restoreLeaderHP("second", 3);
        expect(getHP(state, "second")).toBe(17);

        restoreLeaderHP("first", 3);
        expect(getHP(state, "first")).toBe(20);
      });
    });
  });

  it("Lilanthim 10734110: mirror crest — summons only on opponent's EOT", () => {
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 5 })
      .withFirstPP(10, 10)
      .build();
    gainCardCrest("10734110", "first");
    gainCardCrest("10734110", "second");

    runEndOfTurnBoundary("first");

    const firstBoard = getBoard(state, "first").filter((c) =>
      c.name?.includes("Lilanthim"),
    );
    const secondBoard = getBoard(state, "second").filter((c) =>
      c.name?.includes("Lilanthim"),
    );
    expect(firstBoard.length).toBe(0);
    expect(secondBoard.length).toBe(1);
  });

  function readyBoardAttacker(
    owner: "first" | "second",
    opts: {
      name?: string;
      attack?: number;
      hasStorm?: boolean;
    } = {},
  ) {
    const card = createCard(
      {
        name: opts.name ?? "Attacker",
        type: "Follower",
        attack: opts.attack ?? 5,
        defense: 2,
        hasStorm: opts.hasStorm ?? false,
        justPlayed: false,
        can_attack: true,
        can_attack_followers: true,
        attacks_left: 1,
      },
      "board",
      owner,
    );
    card.peak_defense = Number(card.defense);
    if (opts.hasStorm) (card as any).hasStorm = true;
    getBoard(state, owner).push(card);
    return card;
  }

  describe("Lu Woh 10474110 — leader_attacked crest", () => {
    beforeEach(() => {
      givenGameState({ seed: 1, activePlayer: "first" })
        .withFirstHP(20, 20)
        .withSecondHP(20, 20)
        .build();
      gainCardCrest("10474110", "second");
    });

    it("Storm enemy follower attacking defender leader gets -3 attack until end of turn", () => {
      const attacker = readyBoardAttacker("first", {
        name: "Storm Raider",
        attack: 5,
        hasStorm: true,
      });

      attackLeader(0, "first", "second");

      expect(Number(attacker.attack)).toBe(2);
    });

    it("non-Storm enemy attacker is not debuffed", () => {
      const attacker = readyBoardAttacker("first", {
        name: "Plain Raider",
        attack: 5,
        hasStorm: false,
      });

      attackLeader(0, "first", "second");

      expect(Number(attacker.attack)).toBe(5);
    });

    it("allied attacker on defender leader is not debuffed (crest only watches enemy attackers)", () => {
      state.activePlayer = "second";
      const ally = readyBoardAttacker("second", {
        name: "Ally Raider",
        attack: 4,
        hasStorm: true,
      });

      attackLeader(0, "second", "first");

      expect(Number(ally.attack)).toBe(4);
    });
  });
});
