/**
 * Owner rulings final 8 — Goddess, Wolfraud, Legacy, Behemoth, Oluon,
 * Slaus (provisional), Thestae, Encroached World.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  whenRunEffects,
  createCard,
  resetUidCounter,
  findOnBoard,
  whenEndTurn,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import {
  getBoard,
  getHand,
  getHP,
  getDeck,
  getCrests,
  getPlaysThisTurn,
} from "../../src/core/playerHelpers.js";
import { getImplementationStatus } from "../../src/data/cardImplementationStatus.js";
import { getCardById } from "../../src/data/cardDatabase.js";

import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { runStartOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { tickCrests } from "../../src/logic/effects/crest.js";
import { drawCard } from "../../src/core/utils.js";
import { recordDestroyed } from "../../src/logic/core/destroyedHistory.js";
import { clearLogs, setConsoleMirroring } from "../../src/core/logger.js";
import "../../src/logic/core/effects/index.js";

setConsoleMirroring(false);

const AUTHORED = [
  "10502110", // Goddess of Starlight
  "10502120", // Behemoth General
  "10514110", // Wolfraud
  "10524110", // Oluon
  "10574110", // Slaus
  "10602210", // Encroached World
  "10714110", // Thestae
  "10802310", // Legacy of the Brave
] as const;

function resolvePendingN(n: number): void {
  for (let i = 0; i < n; i++) {
    const pending = state.pendingTargetEffect;
    expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(
      0,
    );
    const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
    resolvePendingTarget(uid);
  }
}

function setup(seed = 1, round = 5): void {
  givenGameState({ seed, activePlayer: "first", roundCount: round })
    .withFirstPP(Math.min(round, 10), Math.min(round, 10))
    .build();
  state.gameStarted = true;
  state.phase = "main";
  state.players.first.evoCharges = 3;
}

describe("Owner rulings — final 8", () => {
  beforeEach(() => {
    resetUidCounter();
    clearLogs();
  });

  it("all 8 cards classify as ops_present (725/735 coverage path)", () => {
    for (const id of AUTHORED) {
      const card = getCardById(id);
      expect(card, id).toBeTruthy();
      expect(getImplementationStatus(card!), id).toBe("ops_present");
    }
    expect(getCardById("10602210")?.type).toBe("Amulet");
  });

  describe("Ruling 1 — always visible exact copies", () => {
    it("Goddess of Starlight (10502110) — after discard 3, exact-copies the 3 leftmost remaining hand cards (with mods)", () => {
      setup(7, 6);
      // Hand order: 0..8 left to right. Evolve Goddess; discard rightmost 3;
      // leftmost remaining should be copied exactly (including cost_mod).
      const handSpecs = [
        {
          name: "LeftA",
          type: "Follower" as const,
          cost: 2,
          attack: 2,
          defense: 2,
        },
        {
          name: "LeftB",
          type: "Spell" as const,
          cost: 3,
          attack: 0,
          defense: 0,
        },
        {
          name: "LeftC",
          type: "Follower" as const,
          cost: 4,
          attack: 4,
          defense: 4,
        },
        {
          name: "Mid1",
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        },
        {
          name: "Mid2",
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        },
        {
          name: "Drop1",
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        },
        {
          name: "Drop2",
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        },
        {
          name: "Drop3",
          type: "Follower" as const,
          cost: 1,
          attack: 1,
          defense: 1,
        },
      ];
      state.players.first.hand = handSpecs.map((s) =>
        createCard(s, "hand", "first"),
      );
      state.players.first.hand[0].cost_mod = -1;
      state.players.first.hand[0].buffs = { attack: 2, defense: 0 };
      state.players.first.hand[0].attack = 4;
      const goddess = createCard("10502110", "board", "first");
      state.players.first.board = [goddess];

      whenEvolve(goddess, "first");
      // Discard Drop1/2/3 (indices 5,6,7 at start — after pending pool is full hand)
      // Pending pool is current hand; pick last three by resolving their uids.
      const hand = getHand(state, "first");
      const dropUids = hand.slice(-3).map((c) => String(c.uid));
      for (const uid of dropUids) {
        resolvePendingTarget(uid);
      }

      const after = getHand(state, "first");
      // 5 remaining + 3 copies = 8
      expect(after.length).toBe(8);
      const copies = after.slice(-3);
      expect(copies.map((c) => c.name)).toEqual(["LeftA", "LeftB", "LeftC"]);
      // Exact copy preserves cost_mod / buffs on LeftA
      expect(copies[0].cost_mod).toBe(-1);
      expect(Number(copies[0].attack)).toBe(4);
      expect(copies[0].uid).not.toBe(after[0].uid);
    });

    it("Wolfraud — Fanfare +Combo/+Combo; Evolve discards hand and exact-copies 5 from enemy deck", () => {
      setup(11, 5);
      state.players.first.playsThisTurn = 3;
      state.players.second.deck = [
        createCard(
          { name: "EDeckA", type: "Follower", cost: 5, attack: 5, defense: 5 },
          "deck",
          "second",
        ),
        createCard(
          { name: "EDeckB", type: "Spell", cost: 2, attack: 0, defense: 0 },
          "deck",
          "second",
        ),
        createCard(
          { name: "EDeckC", type: "Follower", cost: 7, attack: 7, defense: 7 },
          "deck",
          "second",
        ),
        createCard(
          { name: "EDeckD", type: "Amulet", cost: 1, attack: 0, defense: 0 },
          "deck",
          "second",
        ),
        createCard(
          { name: "EDeckE", type: "Follower", cost: 3, attack: 3, defense: 3 },
          "deck",
          "second",
        ),
        createCard(
          { name: "EDeckF", type: "Follower", cost: 4, attack: 4, defense: 4 },
          "deck",
          "second",
        ),
      ];
      // Buff one deck card — exact copy must keep it
      state.players.second.deck[0].buffs = { attack: 3, defense: 3 };
      state.players.second.deck[0].attack = 8;
      state.players.second.deck[0].defense = 8;

      state.players.first.hand = ["10514110"].map((id) =>
        createCard(id, "hand", "first"),
      );
      // Extra hand cards to discard on evolve
      state.players.first.hand.push(
        createCard(
          { name: "Junk", type: "Follower", cost: 1, attack: 1, defense: 1 },
          "hand",
          "first",
        ),
      );
      whenPlayCard("first", 0);
      const wolf = findOnBoard("first", "Wolfraud, Skybound Hanged Man")!;
      expect(Number(wolf.attack)).toBe(1 + getPlaysThisTurn(state, "first"));
      // playsThisTurn includes Wolfraud itself
      const atkAfterFanfare = Number(wolf.attack);
      expect(atkAfterFanfare).toBeGreaterThanOrEqual(2);

      whenEvolve(wolf, "first");
      const hand = getHand(state, "first");
      expect(hand.length).toBe(5);
      const names = new Set(hand.map((c) => c.name));
      for (const n of names) {
        expect(n.startsWith("EDeck")).toBe(true);
      }
      // Deck unchanged (copies, not remove)
      expect(getDeck(state, "second").length).toBe(6);
      const exact = hand.find((c) => c.name === "EDeckA");
      if (exact) {
        expect(Number(exact.attack)).toBe(8);
        expect(exact.buffs?.attack).toBe(3);
      }
    });

    it("Legacy of the Brave (10802310) — exact copy of random enemy hand, cost −1, draw", () => {
      setup(9, 4);
      state.players.second.hand = [
        createCard(
          { name: "OppCard", type: "Follower", cost: 5, attack: 3, defense: 3 },
          "hand",
          "second",
        ),
      ];
      state.players.second.hand[0].cost_mod = -2;
      state.players.second.hand[0].buffs = { attack: 1, defense: 1 };
      state.players.second.hand[0].attack = 4;
      state.players.first.deck = [
        createCard(
          { name: "DrawMe", type: "Follower", cost: 1, attack: 1, defense: 1 },
          "deck",
          "first",
        ),
      ];
      state.players.first.hand = [createCard("10802310", "hand", "first")];
      whenPlayCard("first", 0);
      const hand = getHand(state, "first");
      const copy = hand.find((c) => c.name === "OppCard");
      expect(copy).toBeTruthy();
      expect(Number(copy!.attack)).toBe(4);
      // Exact instance clone kept the −2 mod; Legacy then reduces cost by 1 more.
      const eff =
        (parseInt(String(copy!.cost), 10) || 0) + (Number(copy!.cost_mod) || 0);
      expect(eff).toBeLessThanOrEqual(5 - 2 - 1);
      expect(hand.some((c) => c.name === "DrawMe")).toBe(true);
    });

    it("Behemoth General — compares Σ of 3 highest base costs; destroys when higher", () => {
      setup(5, 5);
      state.players.first.hand = [
        createCard(
          {
            name: "A",
            type: "Follower",
            cost: 8,
            base_cost: 8,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
        createCard(
          {
            name: "B",
            type: "Follower",
            cost: 7,
            base_cost: 7,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
        createCard(
          {
            name: "C",
            type: "Follower",
            cost: 6,
            base_cost: 6,
            attack: 1,
            defense: 1,
          },
          "hand",
          "first",
        ),
      ];
      state.players.second.hand = [
        createCard(
          {
            name: "X",
            type: "Follower",
            cost: 3,
            base_cost: 3,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
        createCard(
          {
            name: "Y",
            type: "Follower",
            cost: 2,
            base_cost: 2,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
        createCard(
          {
            name: "Z",
            type: "Follower",
            cost: 1,
            base_cost: 1,
            attack: 1,
            defense: 1,
          },
          "hand",
          "second",
        ),
      ];
      const foe = createCard(
        { name: "Victim", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "board",
        "second",
      );
      state.players.second.board = [foe];
      const behemoth = createCard("10502120", "board", "first");
      state.players.first.board = [behemoth];
      whenEvolve(behemoth, "first");
      expect(getBoard(state, "second").length).toBe(0);
    });
  });

  describe("Ruling 2 — Oluon repeat targeting", () => {
    it("all three evolved hits can land on the enemy leader (21 damage)", () => {
      // Seed 3: Enemy/Enemy/Enemy when only leaders are eligible
      setup(3, 9);
      const oluon = createCard("10524110", "board", "first");
      oluon.hasEvolved = true;
      state.players.first.board = [oluon];
      state.players.second.board = [];
      state.players.first.hp = 20;
      state.players.second.hp = 20;
      whenEndTurn();
      // 3×7 to enemy leader (HP floors at 0)
      expect(getHP(state, "second")).toBe(0);
      expect(getHP(state, "first")).toBe(20);
    });

    it("the same follower can be hit twice (with replacement)", () => {
      // Seed 2 with a 20-HP tank yields ≥14 damage to that tank
      setup(2, 9);
      const oluon = createCard("10524110", "board", "first");
      oluon.hasEvolved = true;
      state.players.first.board = [oluon];
      const tank = createCard(
        { name: "Tank", type: "Follower", cost: 5, attack: 1, defense: 20 },
        "board",
        "second",
      );
      tank.peak_defense = 20;
      state.players.second.board = [tank];
      whenEndTurn();
      const remaining = Number(getBoard(state, "second")[0]?.defense ?? 0);
      expect(20 - remaining).toBeGreaterThanOrEqual(14);
    });

    it("unevolved Oluon deals 7 to all enemy followers", () => {
      setup(1, 9);
      const oluon = createCard("10524110", "board", "first");
      oluon.hasEvolved = false;
      state.players.first.board = [oluon];
      const a = createCard(
        { name: "A", type: "Follower", cost: 1, attack: 1, defense: 8 },
        "board",
        "second",
      );
      const b = createCard(
        { name: "B", type: "Follower", cost: 1, attack: 1, defense: 8 },
        "board",
        "second",
      );
      a.peak_defense = 8;
      b.peak_defense = 8;
      state.players.second.board = [a, b];
      whenEndTurn();
      expect(Number(a.defense)).toBe(1);
      expect(Number(b.defense)).toBe(1);
    });
  });

  describe("Ruling 3 — Slaus unused pool (PROVISIONAL)", () => {
    it("body activates each unused ability at most once; fourth SOT does nothing", () => {
      setup(1, 3);
      const slaus = createCard("10574110", "board", "first");
      state.players.first.board = [slaus];
      state.players.first.hand = [
        createCard(
          { name: "H1", type: "Follower", cost: 5, attack: 1, defense: 1 },
          "hand",
          "first",
        ),
      ];
      state.players.first.hp = 15;

      const seen = new Set<string>();
      for (let i = 0; i < 3; i++) {
        clearLogs();
        runStartOfTurnBoundary("first", { tickCrests });
        const used = (slaus as any).usedModeIndices as number[];
        expect(used.length).toBe(i + 1);
        seen.add(JSON.stringify(used));
      }
      expect((slaus as any).usedModeIndices.length).toBe(3);
      clearLogs();
      const handCostBefore = Number(getHand(state, "first")[0].cost);
      const hpBefore = getHP(state, "first");
      const atkBefore = Number(getBoard(state, "first")[0]?.attack ?? 0);
      runStartOfTurnBoundary("first", { tickCrests });
      // Fourth activation: no new mode index; state unchanged for mode effects
      expect((slaus as any).usedModeIndices.length).toBe(3);
      expect(Number(getHand(state, "first")[0].cost)).toBe(handCostBefore);
      expect(getHP(state, "first")).toBe(hpBefore);
      expect(Number(getBoard(state, "first")[0]?.attack ?? 0)).toBe(atkBefore);
      expect(seen.size).toBeGreaterThan(0);
    });

    it("evolved EOT gives opponent Crest CD3 and banishes Slaus", () => {
      setup(1, 4);
      const slaus = createCard("10574110", "board", "first");
      slaus.hasEvolved = true;
      state.players.first.board = [slaus];
      whenEndTurn();
      expect(
        getBoard(state, "first").some((c) => c.name.includes("Slaus")),
      ).toBe(false);
      const crests = getCrests(state, "second");
      expect(crests.some((c) => c.name.includes("Slaus"))).toBe(true);
      // Crest gained at CD 3; opponent SOT during whenEndTurn already ticked it once → 2
      expect(crests.find((c) => c.name.includes("Slaus"))!.countdown).toBe(2);
    });
  });

  describe("Ruling 4 — Thestae deck buff persists on draw", () => {
    it("Fanfare −0/−X (X=ATK) and Combo +1; Crest buffs deck followers only and survives draw", () => {
      setup(1, 5);
      state.players.first.hand = [createCard("10714110", "hand", "first")];
      const enemy = createCard(
        { name: "Prey", type: "Follower", cost: 3, attack: 3, defense: 5 },
        "board",
        "second",
      );
      enemy.peak_defense = 5;
      state.players.second.board = [enemy];
      // Deck followers to buff; one hand follower that must NOT get the crest buff
      const deckF = createCard(
        { name: "DeckFolo", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "deck",
        "first",
      );
      const deckSpell = createCard(
        { name: "DeckSpell", type: "Spell", cost: 1, attack: 0, defense: 0 },
        "deck",
        "first",
      );
      state.players.first.deck = [deckSpell, deckF]; // draw pops from end → DeckFolo
      const handF = createCard(
        { name: "HandFolo", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "hand",
        "first",
      );
      state.players.first.hand.push(handF);

      whenPlayCard("first", 0);
      resolvePendingN(1);
      expect(Number(enemy.defense)).toBe(2); // 5 - 3 ATK
      expect(getPlaysThisTurn(state, "first")).toBeGreaterThanOrEqual(1);
      // Combo counter bumped — playsThisTurn is separate; check crest path via evolve
      const thestae = findOnBoard("first", "Thestae, Anathema of Distortion")!;
      whenEvolve(thestae, "first");
      expect(
        getCrests(state, "first").some((c) => c.name.includes("Thestae")),
      ).toBe(true);

      // Force Combo ≥ 3 then end turn to fire crest
      state.players.first.playsThisTurn = 3;
      whenEndTurn();
      // Crest is owner's EOT — whenEndTurn ends first's turn and fires EOT
      expect(Number(deckF.attack)).toBe(3);
      expect(Number(deckF.defense)).toBe(3);
      expect(Number(handF.attack)).toBe(2); // not buffed — was in hand
      expect(deckSpell.type).toBe("Spell");

      // Draw: buff persists on the deck instance
      const handBefore = getHand(state, "first").length;
      drawCard(state.players.first.hand, state.players.first.deck, "first");
      expect(getHand(state, "first").length).toBe(handBefore + 1);
      const drawn = getHand(state, "first").find((c) => c.name === "DeckFolo");
      expect(drawn).toBeTruthy();
      expect(Number(drawn!.attack)).toBe(3);
      expect(Number(drawn!.defense)).toBe(3);
    });
  });

  describe("Ruling 5 — exact copy vs copy + Encroached World Engage", () => {
    it("Encroached World Engage transforms selected hand card into exact copy from enemy deck", () => {
      setup(1, 4);
      state.players.first.hand = [createCard("10602210", "hand", "first")];
      whenPlayCard("first", 0);
      const amuletIdx = getBoard(state, "first").findIndex(
        (c) => c.name === "Encroached World",
      );
      expect(amuletIdx).toBeGreaterThanOrEqual(0);

      const victim = createCard(
        { name: "Chaff", type: "Follower", cost: 2, attack: 2, defense: 2 },
        "hand",
        "first",
      );
      state.players.first.hand = [victim];
      const src = createCard(
        { name: "Stolen", type: "Follower", cost: 6, attack: 4, defense: 4 },
        "deck",
        "second",
      );
      src.buffs = { attack: 5, defense: 5 };
      src.attack = 9;
      src.defense = 9;
      state.players.second.deck = [src];

      engageAmulet("first", amuletIdx);
      resolvePendingN(1);

      const hand = getHand(state, "first");
      expect(hand.length).toBe(1);
      expect(hand[0].name).toBe("Stolen");
      expect(Number(hand[0].attack)).toBe(9);
      expect(hand[0].buffs?.attack).toBe(5);
      expect(hand[0].uid).toBe(victim.uid); // transform preserves uid
      expect(getDeck(state, "second").length).toBe(1); // source remains
    });

    it("exact copy (source:copy from zone) keeps mods; destroyed_match 'a copy' is base template", () => {
      setup(1, 3);
      // Exact: clone buffed enemy hand card
      const buffed = createCard(
        { name: "Buffed", type: "Follower", cost: 4, attack: 2, defense: 2 },
        "hand",
        "second",
      );
      buffed.buffs = { attack: 4, defense: 0 };
      buffed.attack = 6;
      state.players.second.hand = [buffed];
      whenRunEffects(
        [
          {
            op: "add_to_hand",
            source: "copy",
            from: "enemy:hand",
            distribution: "random",
            count: 1,
          },
        ],
        "first",
      );
      const exact = getHand(state, "first").find((c) => c.name === "Buffed")!;
      expect(Number(exact.attack)).toBe(6);

      // Base 'a copy' via destroyed_match uses fresh template (Aika pattern)
      const fairy = createCard("90011110", "board", "first");
      fairy.attack = 99;
      fairy.buffs = { attack: 98, defense: 0 };
      recordDestroyed(state, "first", fairy);
      const before = getHand(state, "first").length;
      whenRunEffects(
        [
          {
            op: "add_to_hand",
            source: "destroyed_match",
            count: 1,
            filter: { type: "Follower" },
            distribution: "random",
          },
        ],
        "first",
      );
      expect(getHand(state, "first").length).toBe(before + 1);
      const added = getHand(state, "first")[before];
      expect(added.name).toBe("Fairy");
      // Fresh template — not the 99-attack destroyed instance
      expect(Number(added.attack)).toBe(1);
    });
  });
});
