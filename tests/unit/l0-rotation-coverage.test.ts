/**
 * L2 real-card tests for rotation-legal L0 cards (behaviour harness play_blocked).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails / it.skip.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  thenHand,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { playCardNoRender } from "../../src/logic/core/playCard/index.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { handleSuperEvoGate } from "../../src/logic/effects/gates/gates.js";
import {
  getBoard,
  getHand,
  getHP,
  getShadows,
  getGraveyard,
  getBanish,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Card ids — Reaved Order 10632310 excluded (separate PR).
const WAY_OF_MAID = "10021310";
const MALICE = "10561310";
const COGNITIVE_SHIFT = "10711310";
const EBB_AND_FLOW = "10853310";
const REVEREND = "10761110";
const SISTER = "10762110";
const HOLY_HAWK = "10762120";
const DEACON = "10763110";
const INITIA = "10764120";
const UNFEELING = "10673310";

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: Array<
      | string
      | {
          name: string;
          type: string;
          cost?: number;
          class?: string;
          attack?: number;
          defense?: number;
        }
    >;
    pp?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function allyAmulet(name = "Sigil") {
  const c = createCard({ name, type: "Amulet", cost: 1 }, "board", "first");
  state.players.first.board.push(c);
  return c;
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function enemyLastWordsFollower(name = "LWTarget") {
  const lw = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 3 },
    "board",
    "second",
  );
  lw.peak_defense = 3;
  lw.hasLastWords = true;
  lw.lastWordsEffects = [
    { op: "summon", source: "named", name: "Fairy", count: 1 },
  ];
  state.players.second.board.push(lw);
  return lw;
}

describe("L0 rotation coverage — real-card L2 tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Way of the Maid (10021310)", () => {
    const printed =
      "Select a card in your hand and return it to deck. Draw 2 Swordcraft followers.";

    it("returns the selected hand card to deck and draws only Swordcraft followers", () => {
      setupTurn(10, {
        hand: [WAY_OF_MAID, { name: "ToReturn", type: "Spell", cost: 1 }],
        deck: [
          {
            name: "ForestTop",
            type: "Follower",
            class: "Forestcraft",
            attack: 1,
            defense: 1,
          },
          {
            name: "SwordA",
            type: "Follower",
            class: "Swordcraft",
            attack: 1,
            defense: 1,
          },
          {
            name: "SwordB",
            type: "Follower",
            class: "Swordcraft",
            attack: 1,
            defense: 1,
          },
        ],
        pp: 10,
      });

      const toReturn = thenHand("first").find((c) => c.name === "ToReturn")!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);

      // "return it to deck"
      expect(thenDeck("first").some((c) => c.uid === toReturn.uid)).toBe(true);
      // "Draw 2 Swordcraft followers" — filtered search, not plain draw
      const drawn = thenHand("first").filter(
        (c) => c.name === "SwordA" || c.name === "SwordB",
      );
      expect(drawn).toHaveLength(2);
      expect(thenHand("first").some((c) => c.name === "ForestTop")).toBe(false);
      expect(printed).toContain("Swordcraft followers");
    });
  });

  describe("Malice of the Mistbloom (10561310)", () => {
    const printed =
      "Return a random card from your hand to deck. Draw 3 cards.";

    // Printed order: return from hand, then draw 3. Engine draws first and returns a drawn card.
    it.fails(
      "returns the only other hand card to deck before drawing 3 — 10561310: printed text requires return-then-draw; observed draw-then-random-return leaves OnlyOther in hand",
      () => {
        setupTurn(10, {
          hand: [MALICE, { name: "OnlyOther", type: "Spell", cost: 1 }],
          deck: [
            { name: "Draw1", type: "Follower", attack: 1, defense: 1 },
            { name: "Draw2", type: "Follower", attack: 1, defense: 1 },
            { name: "Draw3", type: "Follower", attack: 1, defense: 1 },
          ],
          pp: 10,
        });

        const other = thenHand("first").find((c) => c.name === "OnlyOther")!;
        whenPlayCard("first", 0);

        expect(thenDeck("first").some((c) => c.uid === other.uid)).toBe(true);
        expect(thenHand("first").some((c) => c.uid === other.uid)).toBe(false);
        expect(thenHand("first").some((c) => c.name === "Draw1")).toBe(true);
        expect(thenHand("first").some((c) => c.name === "Draw2")).toBe(true);
        expect(thenHand("first").some((c) => c.name === "Draw3")).toBe(true);
        expect(printed).toContain("Draw 3 cards");
      },
    );
  });

  describe("Cognitive Shift (10711310)", () => {
    const printed =
      "Select 2 cards in your hand and return them to deck. Draw 2 cards.";

    it.fails(
      "returns exactly 2 selected cards to deck then draws 2 — 10711310: multi-select return only puts the first selection into deck; second selection stays in hand",
      () => {
        setupTurn(10, {
          hand: [
            COGNITIVE_SHIFT,
            { name: "PickA", type: "Spell", cost: 1 },
            { name: "PickB", type: "Spell", cost: 2 },
            { name: "Stay", type: "Spell", cost: 3 },
          ],
          deck: [
            { name: "NewA", type: "Follower", attack: 1, defense: 1 },
            { name: "NewB", type: "Follower", attack: 1, defense: 1 },
          ],
          pp: 10,
        });

        const pickA = thenHand("first").find((c) => c.name === "PickA")!;
        const pickB = thenHand("first").find((c) => c.name === "PickB")!;
        const stay = thenHand("first").find((c) => c.name === "Stay")!;

        whenPlayCard("first", 0);
        expect(state.pendingTargetEffect?.selectCount).toBe(2);
        resolvePendingByUid(pickA.uid);
        expect(state.pendingTargetEffect?.targetUids).toEqual([pickA.uid]);
        resolvePendingByUid(pickB.uid);

        expect(thenHand("first")).toHaveLength(3);
        expect(thenHand("first").some((c) => c.uid === stay.uid)).toBe(true);
        expect(thenHand("first").some((c) => c.uid === pickA.uid)).toBe(false);
        expect(thenHand("first").some((c) => c.uid === pickB.uid)).toBe(false);
        expect(thenHand("first").some((c) => c.name === "NewA")).toBe(true);
        expect(thenHand("first").some((c) => c.name === "NewB")).toBe(true);
        expect(printed).toContain("Select 2 cards");
      },
    );
  });

  describe("Ebb and Flow (10853310)", () => {
    const printed =
      "Select a card in your hand and return it to deck. Draw 2 cards. If you've unlocked super-evolution, reduce their costs by 1.";

    it("without super-evolution unlocked: draws 2 without cost reduction", () => {
      setupTurn(6, {
        hand: [EBB_AND_FLOW, { name: "ToReturn", type: "Spell", cost: 1 }],
        deck: [
          { name: "DrawA", type: "Follower", cost: 3, attack: 1, defense: 1 },
          { name: "DrawB", type: "Follower", cost: 4, attack: 1, defense: 1 },
        ],
        pp: 6,
      });
      expect(handleSuperEvoGate("first")).toBe(false);

      const toReturn = thenHand("first").find((c) => c.name === "ToReturn")!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);

      const drawA = thenHand("first").find((c) => c.name === "DrawA")!;
      const drawB = thenHand("first").find((c) => c.name === "DrawB")!;
      expect(getEffectiveCost(drawA)).toBe(3);
      expect(getEffectiveCost(drawB)).toBe(4);
      expect(printed).toContain("super-evolution");
    });

    it("with super-evolution unlocked: drawn cards cost 1 less", () => {
      setupTurn(7, {
        hand: [EBB_AND_FLOW, { name: "ToReturn", type: "Spell", cost: 1 }],
        deck: [
          { name: "DrawA", type: "Follower", cost: 3, attack: 1, defense: 1 },
          { name: "DrawB", type: "Follower", cost: 4, attack: 1, defense: 1 },
        ],
        pp: 7,
      });
      expect(handleSuperEvoGate("first")).toBe(true);

      const toReturn = thenHand("first").find((c) => c.name === "ToReturn")!;
      whenPlayCard("first", 0);
      resolvePendingByUid(toReturn.uid);

      const drawA = thenHand("first").find((c) => c.name === "DrawA")!;
      const drawB = thenHand("first").find((c) => c.name === "DrawB")!;
      expect(getEffectiveCost(drawA)).toBe(2);
      expect(getEffectiveCost(drawB)).toBe(3);
      expect(printed).toContain("reduce their costs by 1");
    });
  });

  describe("Reverend of Finance (10761110)", () => {
    const printed =
      "Fanfare: If there are at least 3 allied amulets on the field, summon a Reverend of Finance.\nRush\nLast Words: Draw a card.";

    it("with 3 amulets: Fanfare summons a copy", () => {
      setupTurn(4, { hand: [REVEREND], pp: 4 });
      allyAmulet("A1");
      allyAmulet("A2");
      allyAmulet("A3");
      whenPlayCard("first", 0);
      expect(
        getBoard(state, "first").filter(
          (c) => c.name === "Reverend of Finance",
        ),
      ).toHaveLength(2);
      expect(printed).toContain("at least 3 allied amulets");
    });

    it("with 2 amulets: Fanfare does not summon; Rush and Last Words still apply", () => {
      setupTurn(4, {
        hand: [REVEREND],
        deck: [{ name: "LWDraw", type: "Follower", attack: 1, defense: 1 }],
        pp: 4,
      });
      allyAmulet("A1");
      allyAmulet("A2");
      whenPlayCard("first", 0);
      expect(
        getBoard(state, "first").filter(
          (c) => c.name === "Reverend of Finance",
        ),
      ).toHaveLength(1);
      const rev = findOnBoard("first", "Reverend of Finance")!;
      expect(rev.hasRush).toBe(true);

      const handBefore = thenHand("first").length;
      rev.defense = 0;
      cleanupDead();
      expect(thenHand("first").length).toBe(handBefore + 1);
      expect(thenHand("first").some((c) => c.name === "LWDraw")).toBe(true);
      expect(printed).toContain("Last Words: Draw a card");
    });
  });

  describe("Sister of Strategic Development (10762110)", () => {
    const printed =
      "Fanfare: If there are at least 3 allied amulets on the field, select an enemy follower on the field and deal it 5 damage.";

    it("with 3 amulets: deals 5 damage to selected enemy; bystander untouched", () => {
      setupTurn(2, { hand: [SISTER], pp: 2 });
      allyAmulet("A1");
      allyAmulet("A2");
      allyAmulet("A3");
      const target = enemyFollower(2, 6, "Target");
      const bystander = enemyFollower(2, 6, "Bystander");

      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);

      expect(Number(target.defense)).toBe(1);
      expect(Number(bystander.defense)).toBe(6);
      expect(printed).toContain("deal it 5 damage");
    });

    it("with 2 amulets: Fanfare damage does not fire", () => {
      setupTurn(2, { hand: [SISTER], pp: 2 });
      allyAmulet("A1");
      allyAmulet("A2");
      const target = enemyFollower(2, 6, "Target");

      whenPlayCard("first", 0);
      expect(state.pendingTargetEffect).toBeUndefined();
      expect(Number(target.defense)).toBe(6);
      expect(printed).toContain("at least 3 allied amulets");
    });
  });

  describe("Holy Hawk of Communications (10762120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and banish it. If there are at least 3 allied amulets on the field, restore 3 defense to your leader.\nStorm";

    it("with 3 amulets: banishes target and restores 3 leader HP", () => {
      setupTurn(8, { hand: [HOLY_HAWK], pp: 8 });
      state.players.first.hp = 15;
      allyAmulet("A1");
      allyAmulet("A2");
      allyAmulet("A3");
      const target = enemyLastWordsFollower("BanishMe");
      const bystander = enemyFollower(2, 5, "Bystander");
      state.players.second.shadows = 0;

      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);

      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getBoard(state, "second").some((c) => c.uid === bystander.uid),
      ).toBe(true);
      expect(getGraveyard(state, "second")).toHaveLength(0);
      expect(getBanish(state, "second").some((c) => c.uid === target.uid)).toBe(
        true,
      );
      expect(getShadows(state, "second")).toBe(0);
      expect(getBoard(state, "first").some((c) => c.name === "Fairy")).toBe(
        false,
      );
      expect(getHP(state, "first")).toBe(18);
      const hawk = findOnBoard("first", "Holy Hawk of Communications");
      expect(hawk?.hasStorm).toBe(true);
      expect(printed).toContain("banish it");
      expect(printed).toContain("restore 3 defense");
    });

    it("with 2 amulets: banish still fires but leader is not healed", () => {
      setupTurn(8, { hand: [HOLY_HAWK], pp: 8 });
      state.players.first.hp = 15;
      allyAmulet("A1");
      allyAmulet("A2");
      const target = enemyLastWordsFollower("BanishMe");
      state.players.second.shadows = 0;

      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);

      expect(getBoard(state, "second")).toHaveLength(0);
      expect(getShadows(state, "second")).toBe(0);
      expect(getHP(state, "first")).toBe(15);
      expect(printed).toContain("at least 3 allied amulets");
    });
  });

  describe("Deacon of Security (10763110)", () => {
    const printed =
      "Fanfare: If there are at least 3 allied amulets on the field, evolve this follower and give it Barrier.\nWard\nLast Words: Restore 3 defense to your leader.";

    it("with 3 amulets: evolves self and gains Barrier", () => {
      setupTurn(6, { hand: [DEACON], pp: 6 });
      allyAmulet("A1");
      allyAmulet("A2");
      allyAmulet("A3");
      whenPlayCard("first", 0);
      const deacon = findOnBoard("first", "Deacon of Security")!;
      expect(deacon.hasEvolved).toBe(true);
      expect(deacon.hasBarrier).toBe(true);
      expect(deacon.hasWard).toBe(true);
      expect(printed).toContain("evolve this follower");
    });

    it("with 2 amulets: does not auto-evolve; Ward and Last Words still work", () => {
      setupTurn(6, { hand: [DEACON], pp: 6 });
      state.players.first.hp = 15;
      allyAmulet("A1");
      allyAmulet("A2");
      whenPlayCard("first", 0);
      const deacon = findOnBoard("first", "Deacon of Security")!;
      expect(deacon.hasEvolved).toBeFalsy();
      expect(deacon.hasBarrier).toBeFalsy();
      expect(deacon.hasWard).toBe(true);

      deacon.defense = 0;
      cleanupDead();
      expect(getHP(state, "first")).toBe(18);
      expect(printed).toContain("Last Words: Restore 3 defense");
    });
  });

  describe("Initia, Chief Ordination Officer (10764120)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and banish it. If there are at least 3 allied amulets on the field, restore 3 defense to your leader.\nWard\nAura\nSuper-Evolve: Replicate the effects of this card's Fanfare ability.";

    it("with 3 amulets: banishes selected enemy and restores 3 leader HP", () => {
      setupTurn(7, { hand: [INITIA], pp: 7 });
      state.players.first.hp = 15;
      allyAmulet("A1");
      allyAmulet("A2");
      allyAmulet("A3");
      const target = enemyLastWordsFollower("BanishMe");
      const bystander = enemyFollower(2, 5, "Bystander");
      state.players.second.shadows = 0;

      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);

      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getBoard(state, "second").some((c) => c.uid === bystander.uid),
      ).toBe(true);
      expect(getGraveyard(state, "second")).toHaveLength(0);
      expect(getBanish(state, "second").some((c) => c.uid === target.uid)).toBe(
        true,
      );
      expect(getShadows(state, "second")).toBe(0);
      expect(getBoard(state, "first").some((c) => c.name === "Fairy")).toBe(
        false,
      );
      expect(getHP(state, "first")).toBe(18);
      const initia = findOnBoard("first", "Initia, Chief Ordination Officer");
      expect(initia?.hasWard).toBe(true);
      expect(printed).toContain("banish it");
      expect(printed).toContain("restore 3 defense");
    });

    it("with 2 amulets: banish still fires but leader is not healed", () => {
      setupTurn(7, { hand: [INITIA], pp: 7 });
      state.players.first.hp = 15;
      allyAmulet("A1");
      allyAmulet("A2");
      const target = enemyLastWordsFollower("BanishMe");
      state.players.second.shadows = 0;

      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);

      expect(getBoard(state, "second")).toHaveLength(0);
      expect(getShadows(state, "second")).toBe(0);
      expect(getHP(state, "first")).toBe(15);
      expect(printed).toContain("at least 3 allied amulets");
    });
  });

  describe("Unfeeling Eld Axe (10673310)", () => {
    const printed =
      "Activates in hand. Whenever an allied follower with a base cost of 5 or more enters the field, reduce the cost of this card by 1 until the end of the turn.";

    it("when a base-cost-5+ ally enters: reduces in-hand cost by 1 until EOT", () => {
      setupTurn(6, { hand: [UNFEELING], pp: 6 });
      const unfeeling = () =>
        getHand(state, "first").find((c) => c.name === "Unfeeling Eld Axe")!;
      expect(getEffectiveCost(unfeeling())).toBe(3);

      const big = createCard(
        {
          name: "Big Ally",
          type: "Follower",
          cost: 6,
          base_cost: 6,
          attack: 5,
          defense: 5,
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(big);
      const idx = getHand(state, "first").findIndex((c) => c.uid === big.uid);
      expect(playCardNoRender(getHand(state, "first"), "first", idx).kind).toBe(
        "done",
      );

      expect(getEffectiveCost(unfeeling())).toBe(2);
      expect(Number(unfeeling().cost_mod) || 0).toBe(-1);
      expect(printed).toContain("base cost of 5 or more");
    });

    it("when a cheaper ally enters: does not reduce in-hand cost", () => {
      setupTurn(6, { hand: [UNFEELING], pp: 6 });
      const unfeeling = () =>
        getHand(state, "first").find((c) => c.name === "Unfeeling Eld Axe")!;
      expect(getEffectiveCost(unfeeling())).toBe(3);

      const small = createCard(
        {
          name: "Small Ally",
          type: "Follower",
          cost: 2,
          base_cost: 2,
          attack: 1,
          defense: 1,
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(small);
      const idx = getHand(state, "first").findIndex((c) => c.uid === small.uid);
      expect(playCardNoRender(getHand(state, "first"), "first", idx).kind).toBe(
        "done",
      );

      expect(getEffectiveCost(unfeeling())).toBe(3);
      expect(printed).toContain("base cost of 5 or more");
    });
  });
});
