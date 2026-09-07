/**
 * L2 real-card tests — Buff Forestcraft deck (17 cards).
 *
 * Protocol: assert printed card text from cards/all.json description, not JSON behaviour.
 * Conditional cards test both ON and OFF branches. Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
  thenDeck,
  thenBoard,
  findOnBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { giveStatBuffViaEngine } from "../harness/l2Dispatch.js";
import { incrementSkyboundArt } from "../../src/logic/effects/skybound.js";
import { recordPlayedBaseCost } from "../../src/logic/core/playedBaseCostHistory.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
  getGraveyard,
  getCrests,
  getEvoCount,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Deck card ids
const FLIGHT = "10511310";
const LYRIA = "10403120";
const TANUKI = "10511110";
const RUFLET = "10812110";
const TIA = "10814120";
const CITRUS = "10811120";
const MAGACHIYO = "10914110";
const MIROKU = "10514120";
const CUPITAN = "10413110";
const LYCORIS = "10812120";
const CURIOSITY = "10813310";
const SKIPPER = "10513110";
const MICHELLE = "10813110";
const SANDALPHON = "10404110";
const SETUS = "10814110";
const ALTHENIA = "10614110";
const ZERAEL = "10904110";

// Token / filler ids
const FAIRY = "90011110";
const SPRINGBLOOM = "90011120";
const EVE = "90014110";
const FILLER = "10111310"; // Fairy Convocation (1 PP)
const DRAW_TOP = "10011110"; // Fairy Tamer (2 PP Forest)
const DRAW_DEEP = "10011120"; // Stray Beastman (2 PP Forest)
const BIG_FOLLOWER = "10614110"; // cost 8 — for Lyria search negative control
const LYRIA_BIG = "10814110"; // Setus cost 7 — for Lyria search positive

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
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
          attack?: number;
          defense?: number;
          class?: string;
        }
    >;
    pp?: number;
    evo?: number;
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
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

function allyFollower(atk: number, def: number, name = "Ally") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
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

function boardNames(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => c.name);
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function deckIds(player: "first" | "second" = "first"): string[] {
  return thenDeck(player).map((c) => String(c.id));
}

function buffSelf(card: ReturnType<typeof createCard>, atk = 1, def = 0): void {
  giveStatBuffViaEngine(card, "first", atk, def);
}

describe("L2 Buff Forestcraft — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  describe("Flight of the Swarmpetal (10511310)", () => {
    const printed =
      "Deal 3 damage split between all enemy followers. Add a Fairy to your hand.";

    it("deals 3 total split damage across enemy followers and adds Fairy to hand", () => {
      setupTurn(6, { hand: [FLIGHT], pp: 2 });
      const a = enemyFollower(1, 2, "A");
      const b = enemyFollower(1, 2, "B");
      const startDef = Number(a.defense) + Number(b.defense);
      whenPlayCard("first", 0);
      const endDef = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(startDef - endDef).toBe(3);
      expect(handIds()).toContain(FAIRY);
      expect(printed).toContain("Add a Fairy");
    });

    it("with no enemy followers still adds Fairy to hand", () => {
      setupTurn(6, { hand: [FLIGHT], pp: 2 });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(FAIRY);
      expect(thenBoard("second")).toHaveLength(0);
    });
  });

  describe("Lyria, Skydestined (10403120)", () => {
    const printed =
      "Enhance(8): Draw a follower that costs 7 or more. Recover 7 play points\nBarrier";

    it("without Enhance(8): plays as 2-cost follower with Barrier, no big draw", () => {
      setupTurn(6, {
        hand: [LYRIA],
        pp: 2,
        deck: [LYRIA_BIG, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      const lyria = findOnBoard("first", "Lyria, Skydestined")!;
      expect(lyria.hasBarrier || lyria.keywordState?.hasBarrier).toBe(true);
      expect(handIds()).not.toContain(LYRIA_BIG);
      expect(deckIds()).toContain(LYRIA_BIG);
      expect(getPP(state, "first")).toBe(0);
    });

    it("Enhance(8): draws cost ≥7 follower and recovers 7 PP", () => {
      setupTurn(10, {
        hand: [LYRIA],
        pp: 8,
        deck: [LYRIA_BIG, DRAW_TOP],
      });
      whenPlayCard("first", 0);
      expect(handIds()).toContain(LYRIA_BIG);
      expect(deckIds()).toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(LYRIA_BIG);
      expect(getPP(state, "first")).toBe(7);
      expect(findOnBoard("first", "Lyria, Skydestined")).toBeDefined();
      expect(printed).toContain("Recover 7 play points");
    });
  });

  describe("Prudent Tanuki (10511110)", () => {
    const printed = "Ambush\nEvolve: Draw a card.";

    it("enters with Ambush keyword", () => {
      setupTurn(4, { hand: [TANUKI], pp: 2 });
      whenPlayCard("first", 0);
      const tanuki = findOnBoard("first", "Prudent Tanuki")!;
      expect(tanuki.hasAmbush).toBe(true);
    });

    it("Evolve draws the stacked top deck card by identity", () => {
      setupTurn(4, {
        hand: [TANUKI],
        deck: [DRAW_TOP],
        pp: 2,
        evo: 2,
      });
      whenPlayCard("first", 0);
      const tanuki = findOnBoard("first", "Prudent Tanuki")!;
      whenEvolve(tanuki, "first");
      expect(handIds()).toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(printed).toContain("Draw a card");
    });
  });

  describe("Ruflet, Primeval Fairy (10812110)", () => {
    const printed =
      "Once on each of your turns, when this follower is given + attack or defense on the field, summon a Fairy.\nLast Words: Add a Fairy to your hand.";

    it("first buff on your turn summons exactly one Fairy", () => {
      setupTurn(3, { hand: [RUFLET], pp: 3 });
      whenPlayCard("first", 0);
      const ruflet = findOnBoard("first", "Ruflet, Primeval Fairy")!;
      buffSelf(ruflet, 1, 0);
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(1);
    });

    it("second buff same turn does not summon another Fairy", () => {
      setupTurn(3, { hand: [RUFLET], pp: 3 });
      whenPlayCard("first", 0);
      const ruflet = findOnBoard("first", "Ruflet, Primeval Fairy")!;
      buffSelf(ruflet, 1, 0);
      buffSelf(ruflet, 1, 0);
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(1);
    });

    it("Last Words adds Fairy to hand", () => {
      setupTurn(3, { hand: [RUFLET], pp: 3 });
      whenPlayCard("first", 0);
      const ruflet = findOnBoard("first", "Ruflet, Primeval Fairy")!;
      ruflet.defense = 0;
      cleanupDead();
      expect(handIds()).toContain(FAIRY);
      expect(printed).toContain("Last Words");
    });
  });

  describe("Tia, Eternal Crystalian (10814120)", () => {
    const printed =
      "Enhance (4): Give all allied followers on the field +1/+1.\nRush\nOnce on each of your turns, when this follower is given + attack or defense on the field, add an Eve, Blade of Crystalia to your hand.";

    it("without Enhance(4): Rush follower enters without board-wide buff", () => {
      setupTurn(3, { hand: [TIA], pp: 2 });
      const ally = allyFollower(1, 1, "Ally");
      whenPlayCard("first", 0);
      const tia = findOnBoard("first", "Tia, Eternal Crystalian")!;
      expect(tia.hasRush).toBe(true);
      expect(Number(ally.attack)).toBe(1);
      expect(Number(ally.defense)).toBe(1);
      expect(handIds()).not.toContain(EVE);
    });

    it("Enhance(4): buffs all allied followers including self", () => {
      setupTurn(4, { hand: [TIA], pp: 4 });
      const ally = allyFollower(1, 1, "Ally");
      whenPlayCard("first", 0);
      const tia = findOnBoard("first", "Tia, Eternal Crystalian")!;
      expect(Number(ally.attack)).toBe(2);
      expect(Number(ally.defense)).toBe(2);
      expect(Number(tia.attack)).toBe(3);
      expect(Number(tia.defense)).toBe(3);
    });

    it("first buff on your turn adds Eve; second buff same turn does not", () => {
      setupTurn(4, { hand: [TIA], pp: 4 });
      whenPlayCard("first", 0);
      const tia = findOnBoard("first", "Tia, Eternal Crystalian")!;
      buffSelf(tia, 1, 0);
      expect(handIds().filter((id) => id === EVE)).toHaveLength(1);
      buffSelf(tia, 1, 0);
      expect(handIds().filter((id) => id === EVE)).toHaveLength(1);
      expect(printed).toContain("Eve, Blade of Crystalia");
    });
  });

  describe("Citrus, Heretical Hermit (10811120)", () => {
    const printed =
      "Fanfare: Summon 2 copies of Fairy.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Fanfare summons exactly 2 Fairies by identity", () => {
      setupTurn(5, { hand: [CITRUS], pp: 3 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(2);
      expect(boardNames()).toContain("Citrus, Heretical Hermit");
    });

    it("Evolve replicates Fanfare for 2 more Fairies (4 total)", () => {
      setupTurn(5, { hand: [CITRUS], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      const citrus = findOnBoard("first", "Citrus, Heretical Hermit")!;
      whenEvolve(citrus, "first");
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(4);
      expect(printed).toContain("Replicate");
    });
  });

  describe("Magachiyo, Aromatic Convict (10914110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and deal it 4 damage. Combo (3) - Deal damage to all enemy followers instead.\nSuper-Evolve: Give this follower Storm.";

    it("without Combo(3): deals 4 to selected enemy; bystander untouched", () => {
      setupTurn(6, { hand: [MAGACHIYO], pp: 3 });
      const target = enemyFollower(2, 8, "Target");
      const bystander = enemyFollower(2, 8, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(4);
      expect(Number(bystander.defense)).toBe(8);
    });

    it("Combo(3): damages all enemy followers instead of single select", () => {
      setupTurn(6, { hand: [FILLER, FILLER, MAGACHIYO], pp: 6 });
      const a = enemyFollower(2, 6, "A");
      const b = enemyFollower(2, 6, "B");
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      whenPlayCard("first", 0);
      expect(Number(a.defense)).toBe(2);
      expect(Number(b.defense)).toBe(2);
      expect(state.pendingTargetEffect).toBeUndefined();
    });

    it("Super-Evolve grants Storm", () => {
      setupTurn(7, { hand: [MAGACHIYO], pp: 3 });
      whenPlayCard("first", 0);
      const maga = findOnBoard("first", "Magachiyo, Aromatic Convict")!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(maga, "first");
      expect(maga.hasStorm).toBe(true);
      expect(printed).toContain("Storm");
    });
  });

  describe("Miroku, Swarmpetal (10514120)", () => {
    const printed =
      "Fanfare: Select a Mode to activate.\n1. Add 2 copies of Fairy to your hand.\n2. Recover 2 play points.\n3. Deal 3 damage split between all enemy followers.\nEvolve: Replicate the effects of this card's Fanfare ability.";

    it("Mode 1: adds 2 Fairies to hand by identity", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(6, { hand: [MIROKU], pp: 3 });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(handIds().filter((id) => id === FAIRY)).toHaveLength(2);
    });

    it("Mode 2: recovers 2 play points", () => {
      setScriptedModePickProvider(() => [1]);
      setupTurn(6, { hand: [MIROKU], pp: 3 });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      expect(getPP(state, "first")).toBe(2);
    });

    it("Mode 3: deals 3 split damage to enemy followers", () => {
      setScriptedModePickProvider(() => [2]);
      setupTurn(6, { hand: [MIROKU], pp: 3 });
      const a = enemyFollower(1, 2, "A");
      const b = enemyFollower(1, 2, "B");
      const startDef = Number(a.defense) + Number(b.defense);
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const endDef = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(startDef - endDef).toBe(3);
    });

    it("Evolve replicates Fanfare mode pick", () => {
      setScriptedModePickProvider(() => [0]);
      setupTurn(6, { hand: [MIROKU], pp: 3, evo: 2 });
      whenPlayCard("first", 0);
      setScriptedModePickProvider(null);
      const fairiesAfterFanfare = handIds().filter((id) => id === FAIRY).length;
      const miroku = findOnBoard("first", "Miroku, Swarmpetal")!;
      setScriptedModePickProvider(() => [0]);
      whenEvolve(miroku, "first");
      setScriptedModePickProvider(null);
      expect(handIds().filter((id) => id === FAIRY).length).toBe(
        fairiesAfterFanfare + 2,
      );
    });
  });

  describe("Cupitan, Iridescent Archer (10413110)", () => {
    const printed =
      'Fanfare: [Skybound Art] Evolve this follower. [Super Skybound Art] Deal 3 damage to the enemy leader.\nWhen this follower evolves, do this 7 times: "Deal 1 damage to a random enemy follower."';

    it("Skybound Art (10): evolves self on Fanfare", () => {
      setupTurn(10, { hand: [CUPITAN], pp: 4 });
      for (let i = 0; i < 10; i++) incrementSkyboundArt("first");
      const cup = state.players.first.hand[0]!;
      cup.skyboundArtEvolvesWitnessed = 10;
      whenPlayCard("first", 0);
      const onBoard = findOnBoard("first", "Cupitan, Iridescent Archer")!;
      expect(onBoard.hasEvolved).toBe(true);
    });

    it("without Skybound Art: does not auto-evolve on Fanfare", () => {
      setupTurn(6, { hand: [CUPITAN], pp: 4 });
      whenPlayCard("first", 0);
      const onBoard = findOnBoard("first", "Cupitan, Iridescent Archer")!;
      expect(onBoard.hasEvolved).toBeFalsy();
    });

    it("Super Skybound Art (15): deals 3 to enemy leader", () => {
      setupTurn(10, { hand: [CUPITAN], pp: 4 });
      for (let i = 0; i < 15; i++) incrementSkyboundArt("first");
      const cup = state.players.first.hand[0]!;
      cup.skyboundArtEvolvesWitnessed = 15;
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      expect(getHP(state, "second")).toBe(17);
    });

    it("When evolves: 7×1 damage to random enemy followers", () => {
      setupTurn(10, { hand: [CUPITAN], pp: 4 });
      const e1 = enemyFollower(2, 5, "E1");
      const e2 = enemyFollower(2, 5, "E2");
      for (let i = 0; i < 10; i++) incrementSkyboundArt("first");
      const cup = state.players.first.hand[0]!;
      cup.skyboundArtEvolvesWitnessed = 10;
      const startTotal = Number(e1.defense) + Number(e2.defense);
      whenPlayCard("first", 0);
      const endTotal = thenBoard("second").reduce(
        (s, c) => s + Math.max(0, Number(c.defense)),
        0,
      );
      expect(startTotal - endTotal).toBe(7);
    });
  });

  describe("Lycoris, Barbs of Passion (10812120)", () => {
    const printed = "Fanfare: Summon a Michelle, Kind Mindreader.\nRush\nBane";

    it("Fanfare summons Michelle by identity", () => {
      setupTurn(6, { hand: [LYCORIS], pp: 4 });
      whenPlayCard("first", 0);
      expect(boardIds()).toContain(MICHELLE);
      expect(boardNames()).toContain("Lycoris, Barbs of Passion");
    });

    it("has Rush and Bane keywords", () => {
      setupTurn(6, { hand: [LYCORIS], pp: 4 });
      whenPlayCard("first", 0);
      const lycoris = findOnBoard("first", "Lycoris, Barbs of Passion")!;
      expect(lycoris.hasRush).toBe(true);
      expect(lycoris.hasBane).toBe(true);
      expect(printed).toContain("Bane");
    });
  });

  describe("Curiosity Abounds (10813310)", () => {
    const printed =
      "Summon 2 random differently named followers that cost 2 or less from your deck. Give all allied followers on the field +1/+1.";

    it("summons ≤2-cost followers from deck and buffs pre-existing ally +1/+1", () => {
      setupTurn(6, {
        hand: [CURIOSITY],
        pp: 5,
        deck: [DRAW_TOP, DRAW_DEEP, BIG_FOLLOWER],
      });
      const ally = allyFollower(2, 2, "Veteran");
      whenPlayCard("first", 0);
      const summons = thenBoard("first").filter((c) => c.uid !== ally.uid);
      expect(summons.length).toBe(2);
      for (const c of summons) {
        expect(Number(c.cost)).toBeLessThanOrEqual(2);
      }
      expect(new Set(summons.map((c) => c.name)).size).toBe(2);
      expect(deckIds()).not.toContain(DRAW_TOP);
      expect(deckIds()).not.toContain(DRAW_DEEP);
      expect(deckIds()).toContain(BIG_FOLLOWER);
      expect(Number(ally.attack)).toBe(3);
      expect(Number(ally.defense)).toBe(3);
    });
  });

  describe("Spirited Skipper (10513110)", () => {
    const printed =
      "Fanfare: Summon 3 copies of Fairy.\nEvolve: Replicate the effects of this card's Fanfare ability.\nSuper-Evolve: Give all allied Pixie followers on the field Bane.";

    it("Fanfare summons 3 Fairies by identity", () => {
      setupTurn(7, { hand: [SKIPPER], pp: 5 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(3);
    });

    it("Evolve replicates Fanfare and summons 3 more Fairies when board has space", () => {
      setupTurn(7, { hand: [SKIPPER], pp: 5, evo: 2 });
      whenPlayCard("first", 0);
      const skipper = findOnBoard("first", "Spirited Skipper")!;
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(3);
      // Free 2 slots (board cap is 5) so replicate can summon all 3.
      thenBoard("first")
        .filter((c) => c.id === FAIRY)
        .slice(0, 2)
        .forEach((f) => {
          f.defense = 0;
        });
      cleanupDead();
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(1);
      whenEvolve(skipper, "first");
      expect(boardIds().filter((id) => id === FAIRY)).toHaveLength(4);
    });

    it("Super-Evolve gives Bane to allied Pixie followers only", () => {
      setupTurn(7, { hand: [SKIPPER], pp: 5 });
      const nonPixie = allyFollower(2, 2, "NonPixie");
      whenPlayCard("first", 0);
      const skipper = findOnBoard("first", "Spirited Skipper")!;
      const fairy = thenBoard("first").find((c) => c.id === FAIRY)!;
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(skipper, "first");
      expect(fairy.hasBane).toBe(true);
      expect(nonPixie.hasBane).toBeFalsy();
      expect(skipper.hasBane).toBeFalsy();
    });
  });

  describe("Michelle, Kind Mindreader (10813110)", () => {
    const printed =
      "Fanfare: Summon a Lycoris, Barbs of Passion. Give all allied followers on the field Barrier.\nWard";

    it("Fanfare summons Lycoris and grants Barrier to all allies including self", () => {
      setupTurn(8, { hand: [MICHELLE], pp: 6 });
      const ally = allyFollower(2, 2, "Ally");
      whenPlayCard("first", 0);
      expect(boardIds()).toContain(LYCORIS);
      const michelle = findOnBoard("first", "Michelle, Kind Mindreader")!;
      expect(michelle.hasWard).toBe(true);
      expect(michelle.hasBarrier || michelle.keywordState?.hasBarrier).toBe(
        true,
      );
      expect(ally.hasBarrier || ally.keywordState?.hasBarrier).toBe(true);
      const lycoris = findOnBoard("first", "Lycoris, Barbs of Passion")!;
      expect(lycoris.hasBarrier || lycoris.keywordState?.hasBarrier).toBe(true);
    });
  });

  describe("Sandalphon, Primarch Successor (10404110)", () => {
    const printed =
      'Activates in deck. At the start of your turn, if allied followers have evolved at least 6 times this match, Invoke this card.\nWhen this card is Invoked, gain Crest: Sandalphon, Primarch Successor and return this card to hand\nFanfare: Super Skybound Art- Do this 5 times: "Deal 2 damage to a random enemy."';

    it("at 6 evolves on your turn start: gains crest and returns to hand (not on board)", () => {
      setupTurn(6, { hand: [], pp: 6 });
      const sand = createCard(SANDALPHON, "deck", "first");
      state.players.first.deck = [sand, ...state.players.first.deck];
      state.players.first.evoCount = 6;
      whenEndTurn();
      whenEndTurn();
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Sandalphon, Primarch Successor",
        ),
      ).toBe(true);
      expect(handIds()).toContain(SANDALPHON);
      expect(thenBoard("first").length).toBe(0);
      expect(deckIds()).not.toContain(SANDALPHON);
    });

    it("below 6 evolves: does not invoke at turn start", () => {
      setupTurn(6, { hand: [], pp: 6 });
      const sand = createCard(SANDALPHON, "deck", "first");
      state.players.first.deck = [sand, ...state.players.first.deck];
      state.players.first.evoCount = 5;
      whenEndTurn();
      whenEndTurn();
      expect(
        getCrests(state, "first").some(
          (c) => c.name === "Sandalphon, Primarch Successor",
        ),
      ).toBe(false);
      expect(handIds()).not.toContain(SANDALPHON);
      expect(deckIds()).toContain(SANDALPHON);
    });

    it("Fanfare at Super Skybound Art (15): deals 10 total to enemies", () => {
      setupTurn(10, { hand: [SANDALPHON], pp: 6 });
      for (let i = 0; i < 15; i++) incrementSkyboundArt("first");
      const sand = state.players.first.hand[0]!;
      sand.skyboundArtEvolvesWitnessed = 15;
      const foe = enemyFollower(2, 10, "Foe");
      state.players.second.hp = 20;
      whenPlayCard("first", 0);
      const followerDmg = 10 - Number(foe.defense);
      const leaderHp = getHP(state, "second");
      expect(followerDmg + (20 - leaderHp)).toBe(10);
    });
  });

  describe("Setus & Maisha, Bladerights (10814110)", () => {
    const printed =
      "Fanfare: Select an enemy follower on the field and destroy it. Give all other allied followers on the field +1/+1.\nStorm\nWard";

    it("destroys selected enemy (graveyard, not banish); bystander enemy untouched", () => {
      setupTurn(8, { hand: [SETUS], pp: 7 });
      const target = enemyLastWordsFollower("Victim");
      const bystander = enemyFollower(2, 5, "Bystander");
      whenPlayCard("first", 0);
      resolvePendingByUid(target.uid);
      expect(getBoard(state, "second").some((c) => c.uid === target.uid)).toBe(
        false,
      );
      expect(
        getGraveyard(state, "second").some((c) => c.uid === target.uid),
      ).toBe(true);
      expect(Number(bystander.defense)).toBe(5);
    });

    it("buffs other allied follower +1/+1 but not self", () => {
      setupTurn(8, { hand: [SETUS], pp: 7 });
      const bystander = allyFollower(2, 2, "Bystander");
      const victim = enemyFollower(2, 3, "Victim");
      whenPlayCard("first", 0);
      resolvePendingByUid(victim.uid);
      const setus = findOnBoard("first", "Setus & Maisha, Bladerights")!;
      expect(setus.hasStorm).toBe(true);
      expect(setus.hasWard).toBe(true);
      expect(Number(setus.attack)).toBe(4);
      expect(Number(setus.defense)).toBe(6);
      expect(Number(bystander.attack)).toBe(3);
      expect(Number(bystander.defense)).toBe(3);
      expect(printed).toContain("all other allied followers");
    });
  });

  describe("Althenia, Nurturing Bloom (10614110)", () => {
    const printed =
      "Fanfare: Summon 3 copies of Springbloom Fairy.\nCan attack 2 times per turn.\nSuper-Evolve: Select an enemy follower on the field and destroy it.";

    it("Fanfare summons 3 Springbloom Fairies by identity", () => {
      setupTurn(10, { hand: [ALTHENIA], pp: 8 });
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === SPRINGBLOOM)).toHaveLength(3);
    });

    it("has attacks_per_turn 2", () => {
      setupTurn(10, { hand: [ALTHENIA], pp: 8 });
      whenPlayCard("first", 0);
      const althenia = findOnBoard("first", "Althenia, Nurturing Bloom")!;
      expect(althenia.attacks_per_turn).toBe(2);
    });

    it("Super-Evolve destroys selected enemy (graveyard, not banish)", () => {
      setupTurn(10, { hand: [ALTHENIA], pp: 8 });
      whenPlayCard("first", 0);
      const althenia = findOnBoard("first", "Althenia, Nurturing Bloom")!;
      const victim = enemyLastWordsFollower("Victim");
      state.players.first.superEvoPoints = 1;
      state.players.first.superEvoCharges = 1;
      whenSuperEvolve(althenia, "first");
      resolvePendingByUid(victim.uid);
      expect(getBoard(state, "second").some((c) => c.uid === victim.uid)).toBe(
        false,
      );
      expect(
        getGraveyard(state, "second").some((c) => c.uid === victim.uid),
      ).toBe(true);
    });
  });

  describe("Zerael, Sundered Rebirth (10904110)", () => {
    const printed =
      "Activates in deck. At the end of your turn, if you've played cards with base costs of 1, 2, 3, 4, 5, 6, 7, and 8 this match, Invoke this card.\nFanfare: Select an enemy follower on the field and deal it 9 damage.\nIntimidate";

    it("Fanfare deals 9 to selected enemy; bystander untouched", () => {
      setupTurn(10, { hand: [ZERAEL], pp: 9 });
      const target = enemyFollower(2, 12, "Target");
      const bystander = enemyFollower(2, 12, "Bystander");
      whenPlayCard("first", 0);
      resolveFirstPending();
      expect(Number(target.defense)).toBe(3);
      expect(Number(bystander.defense)).toBe(12);
    });

    it("has Intimidate keyword on play", () => {
      setupTurn(10, { hand: [ZERAEL], pp: 9 });
      whenPlayCard("first", 0);
      const zerael = findOnBoard("first", "Zerael, Sundered Rebirth")!;
      expect(zerael.hasIntimidate).toBe(true);
    });

    it("EOT with full cost ladder invokes from deck to board by uid", () => {
      setupTurn(10, { hand: [], pp: 9 });
      const zerael = createCard(ZERAEL, "deck", "first");
      const zeraelUid = zerael.uid;
      state.players.first.deck = [zerael, ...state.players.first.deck];
      for (let c = 1; c <= 8; c++) recordPlayedBaseCost(state, "first", c);
      whenEndTurn();
      const onBoard = thenBoard("first").find((c) => c.uid === zeraelUid);
      expect(onBoard).toBeDefined();
      expect(thenDeck("first").some((c) => c.uid === zeraelUid)).toBe(false);
      expect(printed).toContain("Invoke this card");
    });

    it("EOT with incomplete ladder does not invoke from deck", () => {
      setupTurn(10, { hand: [], pp: 9 });
      const zerael = createCard(ZERAEL, "deck", "first");
      const zeraelUid = zerael.uid;
      state.players.first.deck = [zerael, ...state.players.first.deck];
      for (let c = 1; c <= 7; c++) recordPlayedBaseCost(state, "first", c);
      whenEndTurn();
      expect(thenBoard("first").some((c) => c.uid === zeraelUid)).toBe(false);
      expect(thenDeck("first").some((c) => c.uid === zeraelUid)).toBe(true);
    });

    it("full ladder at opponent EOT does not invoke from deck", () => {
      setupTurn(10, { hand: [], pp: 9 });
      state.activePlayer = "second";
      const zerael = createCard(ZERAEL, "deck", "first");
      const zeraelUid = zerael.uid;
      state.players.first.deck = [zerael, ...state.players.first.deck];
      for (let c = 1; c <= 8; c++) recordPlayedBaseCost(state, "first", c);
      whenEndTurn();
      expect(thenBoard("first").some((c) => c.uid === zeraelUid)).toBe(false);
      expect(thenDeck("first").some((c) => c.uid === zeraelUid)).toBe(true);
    });

    it("Invoke does not trigger Fanfare damage", () => {
      setupTurn(10, { hand: [], pp: 9 });
      const zerael = createCard(ZERAEL, "deck", "first");
      state.players.first.deck = [zerael, ...state.players.first.deck];
      const target = enemyFollower(2, 12, "Target");
      for (let c = 1; c <= 8; c++) recordPlayedBaseCost(state, "first", c);
      whenEndTurn();
      expect(findOnBoard("first", "Zerael, Sundered Rebirth")).toBeDefined();
      expect(Number(target.defense)).toBe(12);
      expect(state.pendingTargetEffect).toBeUndefined();
    });
  });
});
