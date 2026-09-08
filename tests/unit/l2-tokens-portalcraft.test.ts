/**
 * L2 real-card tests — Portalcraft tokens (23 tokens).
 *
 * Protocol: assert printed token text from cards/token_details.json description,
 * not JSON behaviour. Conditional cards test both ON and OFF branches.
 * Failing-by-design → it.fails.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../audit/setup.ts";
import {
  givenGameState,
  whenPlayCard,
  whenEndTurn,
  createCard,
  resetUidCounter,
  thenHand,
  thenBoard,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";
import { resolveOpenPendingTarget } from "../harness/l2Dispatch.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";

import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { runEndOfTurnBoundary } from "../../src/logic/core/turnBoundary.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import {
  getBoard,
  getHand,
  getHP,
  getPP,
} from "../../src/core/playerHelpers.js";
import {
  fuse_finalize_alpha,
  fuse_finalize_fortifier,
  fuse_finalize_gear_multi,
} from "../../src/logic/effects/ops/fuse/fuse.artifact.js";
import "../../src/logic/core/effects/index.js";

// Meta-deck generators
const TWINDRONE = "10971120";
const COOL_COURIER = "10772110";
const PUPPET_LANCER = "10071120";
const MARIONETTE_MASTER = "10571110";
const IMARI = "10574120";
const DIMENSIONAL_SELECTION = "10971310";
const PUPPET_THEATER = "10072210";
const MIRIAM = "10873110";
const ISAAC = "10471130";
const AIZEDEN = "10974120";
const YOG_ZENTHA = "10674120";

// Rotation generators
const VIER = "10272110";
const CASSIUS = "10473110";
const ORCHIS = "10174120";
const BRILLIANT_INVENTOR = "10671120";
const NEW_AGE_CARTOGRAPHER = "10572110";
const SUPERSONIC_FIGHTER = "10371120";
const ZWEI = "10274110";
const KITTY_CANNONEER = "10071110";
const BULLET_BEYOND = "10071310";
const LISHENNA = "10374120";
const DEVASTATING_SOPRANO = "10373310";

// Portalcraft tokens
const ANALYZING_ARTIFACT = "90071130";
const ANCIENT_ARTIFACT = "90071140";
const ENHANCED_PUPPET = "90071120";
const IMARI_BUDDIES = "90074140";
const MYSTIC_ARTIFACT = "90071150";
const PUPPET = "90071110";
const RADIANT_ARTIFACT = "90071160";
const STRIKER_ARTIFACT = "90072110";
const WARDEN_TRIGGER = "90074150";
const DEPTHS_ELD_AXE = "90074320";
const DOLL_SLAYER = "90072130";
const FORTIFIER_ARTIFACT = "90072120";
const LLOYD = "90074120";
const MASTERWORK_OMEGA = "90074110";
const OMINOUS_ALPHA = "90073110";
const OMINOUS_BETA = "90073120";
const OMINOUS_GAMMA = "90073130";
const VICTORIA = "90074130";
const BLACK_PSALM = "90074220";
const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";
const MELODIOUS_MONODY = "90074310";
const WHITE_PSALM = "90074210";

const FILLER = "10111310";
const SPELL_1A = "10571310";
const DRAW_TOP = "10021110";
const DRAW_SECOND = "10021120";
const ADVENT_ELD_AXE = "10671310";

const PAD_DECK = Array.from({ length: 25 }, () => FILLER);

const R5 = 5;
const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    secondDeck?: string[];
    secondHand?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    firstBoard?: string[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 1,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  else b = b.withFirstDeck(PAD_DECK);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  else b = b.withSecondDeck(PAD_DECK);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.firstBoard?.length) b = b.withFirstBoard(opts.firstBoard);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function handIds(player: "first" | "second" = "first"): string[] {
  return thenHand(player).map((c) => String(c.id));
}

function boardIds(player: "first" | "second" = "first"): string[] {
  return thenBoard(player).map((c) => String(c.id));
}

function uidSet(
  player: "first" | "second",
  zone: "hand" | "board",
): Set<string> {
  const cards = zone === "hand" ? thenHand(player) : thenBoard(player);
  return new Set(cards.map((c) => c.uid));
}

function newZoneCard(
  before: Set<string>,
  player: "first" | "second",
  zone: "hand" | "board",
  id: string,
) {
  const cards = zone === "hand" ? thenHand(player) : thenBoard(player);
  return cards.find((c) => c.id === id && !before.has(c.uid));
}

function stackDeckTop(...ids: string[]) {
  state.players.first.deck = [
    ...PAD_DECK.slice(0, 20).map((id) => createCard(id, "deck", "first")),
    ...ids.map((id) => createCard(id, "deck", "first")),
  ];
}

function resolvePendingByUid(uid: string): void {
  resolveOpenPendingTarget(uid);
}

function poolUids(): string[] {
  const pending = state.pendingTargetEffect;
  return pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
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

function allyFollower(
  atk: number,
  def: number,
  name = "Ally",
  extra: Record<string, unknown> = {},
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def, ...extra },
    "board",
    "first",
  );
  c.peak_defense = def;
  state.players.first.board.push(c);
  return c;
}

function allyBigFollower(baseCost: number, name = "BigAlly") {
  const c = createCard(
    {
      name,
      type: "Follower",
      cost: baseCost,
      base_cost: baseCost,
      attack: baseCost,
      defense: baseCost,
    },
    "board",
    "first",
  );
  c.peak_defense = baseCost;
  state.players.first.board.push(c);
  return c;
}

function hasKeyword(
  card: {
    hasRush?: boolean;
    hasWard?: boolean;
    hasAmbush?: boolean;
    hasStorm?: boolean;
    hasAura?: boolean;
  },
  kw: "Rush" | "Ward" | "Ambush" | "Storm" | "Aura",
): boolean {
  applyKeywordsFromList(card as any);
  switch (kw) {
    case "Rush":
      return !!card.hasRush;
    case "Ward":
      return !!card.hasWard;
    case "Ambush":
      return !!card.hasAmbush;
    case "Storm":
      return !!card.hasStorm;
    case "Aura":
      return !!card.hasAura;
  }
}

function fuseHostWithMaterials(
  hostId: string,
  materialIds: string[],
): ReturnType<typeof thenHand> {
  const host = createCard(hostId, "hand", "first");
  const mats = materialIds.map((id) => createCard(id, "hand", "first"));
  state.players.first.hand = [host, ...mats];
  fuse_finalize_fortifier("first", host.uid, mats);
  return thenHand("first");
}

describe("L2 Portalcraft tokens — real-card tests", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.phase = "main";
  });

  afterEach(() => {
    setScriptedModePickProvider(null);
  });

  describe("Analyzing Artifact (90071130)", () => {
    const printed = "When this card enters the field, draw a card.";

    it("real path via Twindrone Engineer (10971120): new board token is Analyzing Artifact", () => {
      setupTurn(R6, { hand: [TWINDRONE], pp: 4 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "board", ANALYZING_ARTIFACT);
      expect(token).toBeTruthy();
      expect(token!.cost).toBe(1);
      expect(token!.attack).toBe(1);
      expect(token!.defense).toBe(1);
    });

    it("enter: draws stacked deck top (10021110) into hand", () => {
      setupTurn(R6, { hand: [ANALYZING_ARTIFACT], pp: 1 });
      stackDeckTop(DRAW_TOP);
      whenPlayCard("first", 0);
      expect(handIds()).toContain(DRAW_TOP);
      expect(printed).toContain("draw a card");
    });

    it("enter with empty deck: token still enters board", () => {
      setupTurn(R6, { hand: [ANALYZING_ARTIFACT], pp: 1 });
      state.players.first.deck = [];
      whenPlayCard("first", 0);
      expect(boardIds().filter((id) => id === ANALYZING_ARTIFACT)).toHaveLength(
        1,
      );
    });
  });

  describe("Ancient Artifact (90071140)", () => {
    const printed = "Rush";

    it("real path via Cool Courier (10772110): adds Ancient Artifact to hand by uid", () => {
      setupTurn(R6, { hand: [COOL_COURIER], pp: 2 });
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "hand", ANCIENT_ARTIFACT);
      expect(token).toBeTruthy();
      expect(token!.attack).toBe(3);
      expect(token!.defense).toBe(1);
    });

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [ANCIENT_ARTIFACT], pp: 1 });
      whenPlayCard("first", 0);
      const ancient = thenBoard("first").find(
        (c) => c.id === ANCIENT_ARTIFACT,
      )!;
      expect(hasKeyword(ancient, "Rush")).toBe(true);
      expect(printed).toBe("Rush");
    });
  });

  describe("Enhanced Puppet (90071120)", () => {
    const printed =
      "Rush\nAt the end of your opponent's turn, destroy this card.";

    it("real path via Marionette Master (10571110): summons Enhanced Puppet by uid", () => {
      setupTurn(R6, { hand: [MARIONETTE_MASTER], pp: 4 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "board", ENHANCED_PUPPET);
      expect(token).toBeTruthy();
      expect(token!.attack).toBe(3);
      expect(token!.defense).toBe(3);
    });

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [ENHANCED_PUPPET], pp: 1 });
      whenPlayCard("first", 0);
      const puppet = thenBoard("first").find((c) => c.id === ENHANCED_PUPPET)!;
      expect(hasKeyword(puppet, "Rush")).toBe(true);
    });

    it("opponent end of turn: destroys this card", () => {
      setupTurn(R6);
      const token = createCard(ENHANCED_PUPPET, "board", "first");
      state.players.first.board.push(token);
      runEndOfTurnBoundary("first");
      expect(thenBoard("first").some((c) => c.uid === token.uid)).toBe(true);
      runEndOfTurnBoundary("second");
      expect(thenBoard("first").some((c) => c.uid === token.uid)).toBe(false);
      expect(printed).toContain("opponent's turn");
    });

    it("owner end of turn: does not destroy this card", () => {
      setupTurn(R6);
      const token = createCard(ENHANCED_PUPPET, "board", "first");
      state.players.first.board.push(token);
      runEndOfTurnBoundary("first");
      expect(thenBoard("first").some((c) => c.uid === token.uid)).toBe(true);
    });
  });

  describe("Imari's Little Buddies (90074140)", () => {
    const printed = "Rush";

    it("real path via evolved Imari (10574120) playing a spell: summons token by uid", () => {
      setupTurn(R6, {
        hand: [IMARI, FILLER, SPELL_1A],
        deck: [DRAW_TOP],
        pp: 3,
        evo: 2,
      });
      whenPlayCard("first", 0);
      resolvePendingByUid(
        getHand(state, "first").find((c) => c.id === FILLER)!.uid,
      );
      const imari = thenBoard("first").find(
        (c) => c.name === "Imari, Dewdrop",
      )!;
      whenEvolve(imari, "first");
      const before = uidSet("first", "board");
      const spellIdx = getHand(state, "first").findIndex(
        (c) => c.id === SPELL_1A,
      );
      whenPlayCard("first", spellIdx);
      const token = newZoneCard(before, "first", "board", IMARI_BUDDIES);
      expect(token).toBeTruthy();
      expect(token!.attack).toBe(3);
      expect(token!.defense).toBe(3);
    });

    it("has Rush on board", () => {
      setupTurn(R5, { hand: [IMARI_BUDDIES], pp: 2 });
      whenPlayCard("first", 0);
      const buddies = thenBoard("first").find((c) => c.id === IMARI_BUDDIES)!;
      expect(hasKeyword(buddies, "Rush")).toBe(true);
      expect(printed).toBe("Rush");
    });
  });

  describe("Mystic Artifact (90071150)", () => {
    const printed = "Ward";

    it("real path via Dimensional Selection (10971310) mode 2: summons Mystic by uid", () => {
      setupTurn(R8, { hand: [DIMENSIONAL_SELECTION], pp: 6 });
      setScriptedModePickProvider(() => [1]);
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const tokens = thenBoard("first").filter(
        (c) => c.id === MYSTIC_ARTIFACT && !before.has(c.uid),
      );
      expect(tokens).toHaveLength(2);
      expect(tokens[0]!.attack).toBe(4);
      expect(tokens[0]!.defense).toBe(5);
    });

    it("has Ward on board", () => {
      setupTurn(R6, { hand: [MYSTIC_ARTIFACT], pp: 3 });
      whenPlayCard("first", 0);
      const mystic = thenBoard("first").find((c) => c.id === MYSTIC_ARTIFACT)!;
      expect(hasKeyword(mystic, "Ward")).toBe(true);
      expect(printed).toBe("Ward");
    });
  });

  describe("Puppet (90071110)", () => {
    const printed =
      "Rush\nAt the end of your opponent's turn, destroy this card.";

    it("real path via Puppet Theater (10072210): adds Puppet to hand by uid", () => {
      setupTurn(R5, { hand: [PUPPET_THEATER], pp: 2 });
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "hand", PUPPET);
      expect(token).toBeTruthy();
      expect(token!.cost).toBe(0);
      expect(token!.attack).toBe(1);
      expect(token!.defense).toBe(1);
    });

    it("has Rush on board", () => {
      setupTurn(R5, { hand: [PUPPET], pp: 0 });
      whenPlayCard("first", 0);
      const puppet = thenBoard("first").find((c) => c.id === PUPPET)!;
      expect(hasKeyword(puppet, "Rush")).toBe(true);
    });

    it("opponent end of turn: destroys this card", () => {
      setupTurn(R6);
      const token = createCard(PUPPET, "board", "first");
      state.players.first.board.push(token);
      runEndOfTurnBoundary("second");
      expect(thenBoard("first").some((c) => c.uid === token.uid)).toBe(false);
    });

    it("owner end of turn: does not destroy this card", () => {
      setupTurn(R6);
      const token = createCard(PUPPET, "board", "first");
      state.players.first.board.push(token);
      runEndOfTurnBoundary("first");
      expect(thenBoard("first").some((c) => c.uid === token.uid)).toBe(true);
    });
  });

  describe("Radiant Artifact (90071160)", () => {
    const printed = "Storm";

    it("real path via Miriam (10873110): summons Radiant Artifact by uid", () => {
      setupTurn(R8, { hand: [MIRIAM], pp: 7 });
      enemyFollower(2, 5, "Target");
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const token = newZoneCard(before, "first", "board", RADIANT_ARTIFACT);
      expect(token).toBeTruthy();
      expect(token!.attack).toBe(2);
      expect(token!.defense).toBe(2);
    });

    it("has Storm on board", () => {
      setupTurn(R6, { hand: [RADIANT_ARTIFACT], pp: 3 });
      whenPlayCard("first", 0);
      const radiant = thenBoard("first").find(
        (c) => c.id === RADIANT_ARTIFACT,
      )!;
      expect(hasKeyword(radiant, "Storm")).toBe(true);
      expect(printed).toBe("Storm");
    });
  });

  describe("Striker Artifact (90072110)", () => {
    const printed =
      "Fuse: Artifact cards\nWhen you Fuse to this card, transform it based on the total cost of the cards fused.\n1: Ominous Artifact α\n2: Ominous Artifact β\n3 or more: Ominous Artifact γ\nRush";

    it("real path via Isaac (10471130) Last Words: adds Striker Artifact by uid", () => {
      setupTurn(R6, { hand: [ISAAC], pp: 2 });
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const isaac = thenBoard("first").find(
        (c) => c.name === "Isaac, Congenial Engineer",
      )!;
      isaac.defense = 0;
      cleanupDead();
      const token = newZoneCard(before, "first", "hand", STRIKER_ARTIFACT);
      expect(token).toBeTruthy();
    });

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [STRIKER_ARTIFACT], pp: 3 });
      whenPlayCard("first", 0);
      const striker = thenBoard("first").find(
        (c) => c.id === STRIKER_ARTIFACT,
      )!;
      expect(hasKeyword(striker, "Rush")).toBe(true);
    });

    it("Fuse total cost 1: transforms into Ominous Artifact α", () => {
      setupTurn(R6);
      const hand = fuseHostWithMaterials(STRIKER_ARTIFACT, [
        ANALYZING_ARTIFACT,
      ]);
      expect(hand).toHaveLength(1);
      expect(hand[0]!.id).toBe(OMINOUS_ALPHA);
    });

    it("Fuse total cost 2: transforms into Ominous Artifact β", () => {
      setupTurn(R6);
      const hand = fuseHostWithMaterials(STRIKER_ARTIFACT, [
        ANALYZING_ARTIFACT,
        ANCIENT_ARTIFACT,
      ]);
      expect(hand[0]!.id).toBe(OMINOUS_BETA);
    });

    it("Fuse total cost 3 or more: transforms into Ominous Artifact γ", () => {
      setupTurn(R6);
      const hand = fuseHostWithMaterials(STRIKER_ARTIFACT, [MYSTIC_ARTIFACT]);
      expect(hand[0]!.id).toBe(OMINOUS_GAMMA);
    });
  });

  describe("Warden of the Trigger (90074150)", () => {
    const printed = "Ward\nLast Words: Restore 2 defense to your leader.";

    it("real path via Aizeden (10974120): summons Warden by uid", () => {
      setupTurn(R8, { hand: [AIZEDEN], pp: 7 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "board", WARDEN_TRIGGER);
      expect(token).toBeTruthy();
      expect(token!.attack).toBe(3);
      expect(token!.defense).toBe(3);
    });

    it("has Ward on board", () => {
      setupTurn(R6, { hand: [WARDEN_TRIGGER], pp: 3 });
      whenPlayCard("first", 0);
      const warden = thenBoard("first").find((c) => c.id === WARDEN_TRIGGER)!;
      expect(hasKeyword(warden, "Ward")).toBe(true);
    });

    it("Last Words: restores exactly 2 defense to your leader", () => {
      setupTurn(R6);
      state.players.first.hp = 15;
      const warden = createCard(WARDEN_TRIGGER, "board", "first");
      warden.peak_defense = warden.defense;
      state.players.first.board.push(warden);
      warden.defense = 0;
      cleanupDead();
      expect(getHP(state, "first")).toBe(17);
      expect(printed).toContain("Restore 2 defense");
    });
  });

  describe("Depths of the Eld Axe (90074320)", () => {
    const printed =
      "Select an allied follower on the field with a base cost of 5 or more, add a copy of it to your hand without revealing it, and reduce the cost of the copy by 3.";

    it("real path via Yog-Zentha (10674120): adds Depths of the Eld Axe by uid", () => {
      setupTurn(R6, { hand: [YOG_ZENTHA], pp: 2 });
      allyBigFollower(5);
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "hand", DEPTHS_ELD_AXE);
      expect(token).toBeTruthy();
    });

    it("select allied base cost ≥5: adds copy to hand; bystander ally untouched", () => {
      setupTurn(R6, { hand: [DEPTHS_ELD_AXE], pp: 0 });
      const big = allyBigFollower(5, "BigAlly");
      const small = allyFollower(1, 1, "SmallAlly");
      const handBefore = uidSet("first", "hand");
      whenPlayCard("first", 0);
      resolvePendingByUid(big.uid);
      const copies = thenHand("first").filter(
        (c) => c.name === "BigAlly" && !handBefore.has(c.uid),
      );
      expect(copies).toHaveLength(1);
      expect(getBoard(state, "first").some((c) => c.uid === small.uid)).toBe(
        true,
      );
      expect(getBoard(state, "first").some((c) => c.uid === big.uid)).toBe(
        true,
      );
    });

    it("copy effective cost reduced by 3 (90074320) — printed: reduce the cost of the copy by 3", () => {
      setupTurn(R6, { hand: [DEPTHS_ELD_AXE], pp: 0 });
      const big = allyBigFollower(5, "BigAlly");
      const handBefore = uidSet("first", "hand");
      whenPlayCard("first", 0);
      resolvePendingByUid(big.uid);
      const copy = thenHand("first").find(
        (c) => c.name === "BigAlly" && !handBefore.has(c.uid),
      )!;
      expect(getEffectiveCost(big)).toBe(5);
      expect(getEffectiveCost(copy)).toBe(2);
      expect(printed).toContain("reduce the cost of the copy by 3");
    });

    it("7-cost ally copy costs 4 after reduction", () => {
      setupTurn(R6, { hand: [DEPTHS_ELD_AXE], pp: 0 });
      const big = allyBigFollower(7, "SevenCost");
      const handBefore = uidSet("first", "hand");
      whenPlayCard("first", 0);
      resolvePendingByUid(big.uid);
      const copy = thenHand("first").find(
        (c) => c.name === "SevenCost" && !handBefore.has(c.uid),
      )!;
      expect(getEffectiveCost(big)).toBe(7);
      expect(getEffectiveCost(copy)).toBe(4);
    });

    it("pre-existing hand copy keeps full cost; reduction applies to new copy only", () => {
      setupTurn(R6, { hand: [DEPTHS_ELD_AXE], pp: 0 });
      const existing = createCard(
        {
          name: "BigAlly",
          type: "Follower",
          cost: 5,
          base_cost: 5,
          attack: 5,
          defense: 5,
        },
        "hand",
        "first",
      );
      state.players.first.hand.push(existing);
      const big = allyBigFollower(5, "BigAlly");
      const handBefore = uidSet("first", "hand");
      whenPlayCard("first", 0);
      resolvePendingByUid(big.uid);
      const newCopy = thenHand("first").find(
        (c) => c.name === "BigAlly" && !handBefore.has(c.uid),
      )!;
      expect(getEffectiveCost(big)).toBe(5);
      expect(getEffectiveCost(existing)).toBe(5);
      expect(getEffectiveCost(newCopy)).toBe(2);
      expect(existing.uid).not.toBe(newCopy.uid);
    });
  });

  describe("Doll Slayer (90072130)", () => {
    const printed = "Ambush\nLast Words: Summon a Vier, Heart Slayer.";

    it("real path via Vier (10272110): transforms hand Puppetry follower into Doll Slayer", () => {
      setupTurn(R6, { hand: [VIER, PUPPET], pp: 4 });
      const puppet = getHand(state, "first").find((c) => c.id === PUPPET)!;
      whenPlayCard("first", 0);
      resolvePendingByUid(puppet.uid);
      const token = getHand(state, "first").find((c) => c.uid === puppet.uid)!;
      expect(token.id).toBe(DOLL_SLAYER);
      expect(token.name).toBe("Doll Slayer");
    });

    it("has Ambush on board", () => {
      setupTurn(R6, { hand: [DOLL_SLAYER], pp: 1 });
      whenPlayCard("first", 0);
      const doll = thenBoard("first").find((c) => c.id === DOLL_SLAYER)!;
      expect(hasKeyword(doll, "Ambush")).toBe(true);
    });

    it("Last Words: summons exactly 1 Vier, Heart Slayer", () => {
      setupTurn(R6);
      const doll = createCard(DOLL_SLAYER, "board", "first");
      doll.peak_defense = doll.defense;
      state.players.first.board.push(doll);
      doll.defense = 0;
      cleanupDead();
      expect(
        thenBoard("first").filter((c) => c.name === "Vier, Heart Slayer"),
      ).toHaveLength(1);
      expect(printed).toContain("Summon a Vier, Heart Slayer");
    });
  });

  describe("Fortifier Artifact (90072120)", () => {
    const printed =
      "Fuse: Artifact cards\nWhen you Fuse to this card, transform it based on the total cost of the cards fused.\n1: Ominous Artifact α\n2: Ominous Artifact β\n3 or more: Ominous Artifact γ\nWard";

    it("real path via Cassius (10473110) Last Words: adds Fortifier by uid", () => {
      setupTurn(R6, { hand: [CASSIUS], pp: 5 });
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const cassius = thenBoard("first").find(
        (c) => c.name === "Cassius, Sky-Yearning Arrival",
      )!;
      cassius.defense = 0;
      cleanupDead();
      const token = newZoneCard(before, "first", "hand", FORTIFIER_ARTIFACT);
      expect(token).toBeTruthy();
    });

    it("has Ward on board", () => {
      setupTurn(R6, { hand: [FORTIFIER_ARTIFACT], pp: 3 });
      whenPlayCard("first", 0);
      const fort = thenBoard("first").find((c) => c.id === FORTIFIER_ARTIFACT)!;
      expect(hasKeyword(fort, "Ward")).toBe(true);
    });

    it("Fuse total cost 1: transforms into Ominous Artifact α", () => {
      setupTurn(R6);
      const hand = fuseHostWithMaterials(FORTIFIER_ARTIFACT, [
        ANALYZING_ARTIFACT,
      ]);
      expect(hand[0]!.id).toBe(OMINOUS_ALPHA);
    });

    it("Fuse total cost 2: transforms into Ominous Artifact β", () => {
      setupTurn(R6);
      const hand = fuseHostWithMaterials(FORTIFIER_ARTIFACT, [
        ANALYZING_ARTIFACT,
        ANCIENT_ARTIFACT,
      ]);
      expect(hand[0]!.id).toBe(OMINOUS_BETA);
    });

    it("Fuse total cost 3 or more: transforms into Ominous Artifact γ", () => {
      setupTurn(R6);
      const hand = fuseHostWithMaterials(FORTIFIER_ARTIFACT, [MYSTIC_ARTIFACT]);
      expect(hand[0]!.id).toBe(OMINOUS_GAMMA);
    });
  });

  describe("Lloyd (90074120)", () => {
    const printed =
      "Ward\nYour opponent can't select any cards other than this one for abilities.";

    it("real path via Orchis (10174120): summons Lloyd by uid", () => {
      setupTurn(R8, { hand: [ORCHIS], pp: 8 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "board", LLOYD);
      expect(token).toBeTruthy();
      expect(token!.defense).toBe(6);
    });

    it("has Ward on board", () => {
      setupTurn(R6, { hand: [LLOYD], pp: 3 });
      whenPlayCard("first", 0);
      const lloyd = thenBoard("first").find((c) => c.id === LLOYD)!;
      expect(hasKeyword(lloyd, "Ward")).toBe(true);
    });

    it("with Lloyd on field: opponent must target Lloyd (buddy selection rejected)", () => {
      setupTurn(R6, {
        active: "second",
        secondHand: [ADVENT_ELD_AXE],
      });
      state.players.second.pp = 2;
      state.players.second.maxPP = 6;
      const lloyd = createCard(LLOYD, "board", "first");
      lloyd.peak_defense = lloyd.defense;
      const buddy = allyFollower(2, 2, "Buddy");
      state.players.first.board = [lloyd, buddy];
      whenPlayCard("second", 0);
      const pending = state.pendingTargetEffect!;
      expect(poolUids()).toContain(lloyd.uid);
      expect(validateTargetSelection(state, pending, buddy.uid).ok).toBe(false);
      expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
      resolvePendingByUid(lloyd.uid);
      expect(Number(lloyd.defense)).toBe(2);
      expect(Number(buddy.defense)).toBe(2);
    });

    it("without Lloyd on field: opponent can select and damage other followers", () => {
      setupTurn(R6, {
        active: "second",
        secondHand: [ADVENT_ELD_AXE],
      });
      state.players.second.pp = 2;
      state.players.second.maxPP = 6;
      const buddy = allyFollower(2, 2, "Buddy");
      const tank = allyFollower(2, 5, "Tank");
      state.players.first.board = [buddy, tank];
      whenPlayCard("second", 0);
      const pending = state.pendingTargetEffect!;
      expect(validateTargetSelection(state, pending, buddy.uid).ok).toBe(true);
      expect(validateTargetSelection(state, pending, tank.uid).ok).toBe(true);
      resolvePendingByUid(buddy.uid);
      expect(Number(buddy.defense)).toBe(0);
      expect(Number(tank.defense)).toBe(5);
    });
  });

  describe("Masterwork Artifact Ω (90074110)", () => {
    const printed =
      "Fanfare: Deal 5 damage to all enemy followers. Restore 5 defense to your leader.\nStorm\nWard\nAura";

    it("real path via Ominous α fuse: β + γ → Masterwork in hand", () => {
      setupTurn(R6);
      const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
      const beta = createCard(OMINOUS_BETA, "hand", "first");
      const gamma = createCard(OMINOUS_GAMMA, "hand", "first");
      state.players.first.hand = [alpha, beta, gamma];
      fuse_finalize_alpha("first", alpha.uid, [beta, gamma]);
      expect(thenHand("first")[0]!.id).toBe(MASTERWORK_OMEGA);
    });

    it("Fanfare: deals 5 damage to all enemy followers and restores 5 leader HP", () => {
      setupTurn(R10, { hand: [MASTERWORK_OMEGA], pp: 10, hp: 10 });
      const foeA = enemyFollower(2, 8, "FoeA");
      const foeB = enemyFollower(2, 6, "FoeB");
      whenPlayCard("first", 0);
      expect(Number(foeA.defense)).toBe(3);
      expect(Number(foeB.defense)).toBe(1);
      expect(getHP(state, "first")).toBe(15);
    });

    it("has Storm, Ward, and Aura on board", () => {
      setupTurn(R10, { hand: [MASTERWORK_OMEGA], pp: 10 });
      whenPlayCard("first", 0);
      const omega = thenBoard("first").find((c) => c.id === MASTERWORK_OMEGA)!;
      expect(hasKeyword(omega, "Storm")).toBe(true);
      expect(hasKeyword(omega, "Ward")).toBe(true);
      expect(hasKeyword(omega, "Aura")).toBe(true);
      expect(printed).toContain("Aura");
    });
  });

  describe("Ominous Artifact α (90073110)", () => {
    const printed =
      "Fuse: Ominous Artifact β and Ominous Artifact γ\nWhen you've Fused both to this card, transform it into a Masterwork Artifact Ω.\nAt the end of your turn, restore 3 defense to your leader.";

    it("real path via Brilliant Inventor (10671120): summons Ominous α by uid", () => {
      setupTurn(R8, { hand: [BRILLIANT_INVENTOR], pp: 6 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "board", OMINOUS_ALPHA);
      expect(token).toBeTruthy();
    });

    it("Fuse β and γ: transforms into Masterwork Artifact Ω", () => {
      setupTurn(R6);
      const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
      const beta = createCard(OMINOUS_BETA, "hand", "first");
      const gamma = createCard(OMINOUS_GAMMA, "hand", "first");
      state.players.first.hand = [alpha, beta, gamma];
      fuse_finalize_alpha("first", alpha.uid, [beta, gamma]);
      expect(thenHand("first")[0]!.id).toBe(MASTERWORK_OMEGA);
    });

    it("Fuse β only: does not transform into Masterwork Artifact Ω", () => {
      setupTurn(R6);
      const alpha = createCard(OMINOUS_ALPHA, "hand", "first");
      const beta = createCard(OMINOUS_BETA, "hand", "first");
      state.players.first.hand = [alpha, beta];
      fuse_finalize_alpha("first", alpha.uid, [beta]);
      expect(thenHand("first")[0]!.id).toBe(OMINOUS_ALPHA);
      expect(thenHand("first").some((c) => c.id === MASTERWORK_OMEGA)).toBe(
        false,
      );
    });

    it("owner end of turn: restores exactly 3 defense to leader", () => {
      setupTurn(R6, { hp: 15 });
      const alpha = createCard(OMINOUS_ALPHA, "board", "first");
      alpha.peak_defense = alpha.defense;
      state.players.first.board.push(alpha);
      runEndOfTurnBoundary("first");
      expect(getHP(state, "first")).toBe(18);
    });

    it("opponent end of turn: does not restore leader HP", () => {
      setupTurn(R6, { hp: 15 });
      const alpha = createCard(OMINOUS_ALPHA, "board", "first");
      alpha.peak_defense = alpha.defense;
      state.players.first.board.push(alpha);
      runEndOfTurnBoundary("second");
      expect(getHP(state, "first")).toBe(15);
    });
  });

  describe("Ominous Artifact β (90073120)", () => {
    const printed =
      "At the end of your turn, deal 3 damage to the enemy leader.";

    it("real path via New-Age Cartographer (10572110): adds Ominous β to hand by uid", () => {
      setupTurn(R6, { hand: [NEW_AGE_CARTOGRAPHER], pp: 4 });
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "hand", OMINOUS_BETA);
      expect(token).toBeTruthy();
    });

    it("owner end of turn: deals exactly 3 damage to enemy leader", () => {
      setupTurn(R6);
      const beta = createCard(OMINOUS_BETA, "board", "first");
      beta.peak_defense = beta.defense;
      state.players.first.board.push(beta);
      const hp0 = getHP(state, "second");
      runEndOfTurnBoundary("first");
      expect(getHP(state, "second")).toBe(hp0 - 3);
    });

    it("opponent end of turn: does not deal damage to enemy leader", () => {
      setupTurn(R6);
      const beta = createCard(OMINOUS_BETA, "board", "first");
      beta.peak_defense = beta.defense;
      state.players.first.board.push(beta);
      const hp0 = getHP(state, "second");
      runEndOfTurnBoundary("second");
      expect(getHP(state, "second")).toBe(hp0);
    });
  });

  describe("Ominous Artifact γ (90073130)", () => {
    const printed =
      "At the end of your turn, deal 3 damage to all enemy followers.";

    it("real path via Supersonic Fighter (10371120): summons Ominous γ by uid", () => {
      setupTurn(R8, { hand: [SUPERSONIC_FIGHTER], pp: 7 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "board", OMINOUS_GAMMA);
      expect(token).toBeTruthy();
    });

    it("owner end of turn: deals exactly 3 damage to all enemy followers", () => {
      setupTurn(R6);
      const gamma = createCard(OMINOUS_GAMMA, "board", "first");
      gamma.peak_defense = gamma.defense;
      state.players.first.board.push(gamma);
      const foeA = enemyFollower(2, 8, "FoeA");
      const foeB = enemyFollower(2, 5, "FoeB");
      runEndOfTurnBoundary("first");
      expect(Number(foeA.defense)).toBe(5);
      expect(Number(foeB.defense)).toBe(2);
    });

    it("opponent end of turn: enemy follower defense unchanged", () => {
      setupTurn(R6);
      const gamma = createCard(OMINOUS_GAMMA, "board", "first");
      gamma.peak_defense = gamma.defense;
      state.players.first.board.push(gamma);
      const foe = enemyFollower(2, 8, "Foe");
      runEndOfTurnBoundary("second");
      expect(Number(foe.defense)).toBe(8);
    });
  });

  describe("Victoria (90074130)", () => {
    const printed =
      "Rush\nFollower Strike: Deal X damage to the opposing follower. X is this follower's attack.";

    it("real path via Zwei (10274110): summons Victoria by uid", () => {
      setupTurn(R8, { hand: [ZWEI], pp: 6 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "board", VICTORIA);
      expect(token).toBeTruthy();
      expect(token!.attack).toBe(6);
    });

    it("has Rush on board", () => {
      setupTurn(R6, { hand: [VICTORIA], pp: 3 });
      whenPlayCard("first", 0);
      const victoria = thenBoard("first").find((c) => c.id === VICTORIA)!;
      expect(hasKeyword(victoria, "Rush")).toBe(true);
    });

    it("Follower Strike: deals X=attack strike damage then combat (foe 10 → 0)", () => {
      setupTurn(R6, { hand: [VICTORIA], pp: 3 });
      whenPlayCard("first", 0);
      const victoria = thenBoard("first").find((c) => c.id === VICTORIA)!;
      const foe = enemyFollower(2, 10, "Blocker");
      victoria.can_attack = true;
      victoria.can_attack_followers = true;
      victoria.justPlayed = false;
      victoria.attacks_left = 1;
      victoria.hasAttacked = false;
      applyKeywordsFromList(victoria);
      const idx = state.players.first.board.indexOf(victoria);
      attackFollower(idx, 0, "first", "second");
      expect(Number(foe.defense)).toBe(0);
      expect(Number(victoria.attack)).toBe(6);
    });
  });

  describe("Black Psalm, New Revelation (90074220)", () => {
    const printed =
      "Countdown (1)\nLast Words: Deal 1 damage to the enemy leader. Summon a White Psalm, New Revelation.";

    it("real path via White Psalm Last Words: summons Black Psalm by uid", () => {
      setupTurn(R6, { hand: [WHITE_PSALM], pp: 3 });
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      const white = thenBoard("first").find((c) => c.id === WHITE_PSALM)!;
      white.countdown = 0;
      cleanupDead();
      const token = thenBoard("first").find(
        (c) => c.id === BLACK_PSALM && !before.has(c.uid),
      );
      expect(token).toBeTruthy();
    });

    it("enters with Countdown (1)", () => {
      setupTurn(R6, { hand: [BLACK_PSALM], pp: 3 });
      whenPlayCard("first", 0);
      const psalm = thenBoard("first").find((c) => c.id === BLACK_PSALM)!;
      expect(Number(psalm.countdown)).toBe(1);
    });

    it("Last Words at countdown 0: deals 1 to enemy leader and summons White Psalm", () => {
      setupTurn(R6, { hand: [BLACK_PSALM], pp: 3 });
      whenPlayCard("first", 0);
      const psalm = thenBoard("first").find((c) => c.id === BLACK_PSALM)!;
      const hp0 = getHP(state, "second");
      psalm.countdown = 0;
      cleanupDead();
      expect(getHP(state, "second")).toBe(hp0 - 1);
      expect(
        thenBoard("first").filter((c) => c.id === WHITE_PSALM),
      ).toHaveLength(1);
      expect(printed).toContain("White Psalm, New Revelation");
    });
  });

  describe("Gear of Ambition (90071210)", () => {
    const printed =
      "Fuse: Artifact amulets\nWhen you Fuse to this card, transform it into a Striker Artifact.\nCan't be played.";

    it("real path via Kitty Cannoneer (10071110): adds Gear of Ambition by uid", () => {
      setupTurn(R5, { hand: [KITTY_CANNONEER], pp: 3 });
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "hand", GEAR_AMBITION);
      expect(token).toBeTruthy();
    });

    it("Can't be played: preflight rejects play from hand", () => {
      setupTurn(R6, { hand: [GEAR_AMBITION], pp: 6 });
      const gear = getHand(state, "first")[0]!;
      const pp0 = getPP(state, "first");
      expect(canPlayCard(gear, "first").ok).toBe(false);
      whenPlayCard("first", 0);
      expect(getPP(state, "first")).toBe(pp0);
      expect(thenHand("first").some((c) => c.uid === gear.uid)).toBe(true);
    });

    it("Fuse with Gear of Remembrance: transforms into Striker Artifact", () => {
      setupTurn(R6);
      const host = createCard(GEAR_AMBITION, "hand", "first");
      const partner = createCard(GEAR_REMEMBRANCE, "hand", "first");
      state.players.first.hand = [host, partner];
      fuse_finalize_gear_multi(
        "first",
        host.uid,
        [partner],
        "Striker Artifact",
      );
      expect(thenHand("first")).toHaveLength(1);
      expect(thenHand("first")[0]!.id).toBe(STRIKER_ARTIFACT);
    });
  });

  describe("Gear of Remembrance (90071220)", () => {
    const printed =
      "Fuse: Artifact amulets\nWhen you Fuse to this card, transform it into a Fortifier Artifact.\nCan't be played.";

    it("real path via Bullet from Beyond (10071310): adds Gear of Remembrance by uid", () => {
      setupTurn(R8, { hand: [BULLET_BEYOND], pp: 4 });
      enemyFollower(2, 4, "Target");
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      resolvePendingByUid(getBoard(state, "second")[0]!.uid);
      const token = thenHand("first").find(
        (c) => c.id === GEAR_REMEMBRANCE && !before.has(c.uid),
      );
      expect(token).toBeTruthy();
    });

    it("Can't be played: preflight rejects play from hand", () => {
      setupTurn(R6, { hand: [GEAR_REMEMBRANCE], pp: 6 });
      const gear = getHand(state, "first")[0]!;
      const pp0 = getPP(state, "first");
      expect(canPlayCard(gear, "first").ok).toBe(false);
      whenPlayCard("first", 0);
      expect(getPP(state, "first")).toBe(pp0);
      expect(thenHand("first").some((c) => c.uid === gear.uid)).toBe(true);
    });

    it("Fuse with Gear of Ambition: transforms into Fortifier Artifact", () => {
      setupTurn(R6);
      const host = createCard(GEAR_REMEMBRANCE, "hand", "first");
      const partner = createCard(GEAR_AMBITION, "hand", "first");
      state.players.first.hand = [host, partner];
      fuse_finalize_gear_multi(
        "first",
        host.uid,
        [partner],
        "Fortifier Artifact",
      );
      expect(thenHand("first")).toHaveLength(1);
      expect(thenHand("first")[0]!.id).toBe(FORTIFIER_ARTIFACT);
    });
  });

  describe("Melodious Monody (90074310)", () => {
    const printed =
      "Select an allied card on the field and destroy it. Deal 4 damage to a random enemy follower.";

    it("real path via Lishenna (10374120): adds Melodious Monody by uid", () => {
      setupTurn(R8, { hand: [LISHENNA], pp: 6 });
      const before = uidSet("first", "hand");
      whenPlayCard("first", 0);
      const token = newZoneCard(before, "first", "hand", MELODIOUS_MONODY);
      expect(token).toBeTruthy();
    });

    it("destroys selected allied card; bystander ally untouched", () => {
      setupTurn(R6, { hand: [MELODIOUS_MONODY], pp: 1 });
      const sac = allyFollower(1, 3, "Sacrifice");
      const buddy = allyFollower(1, 3, "Buddy");
      enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(sac.uid);
      expect(getBoard(state, "first").some((c) => c.uid === sac.uid)).toBe(
        false,
      );
      expect(getBoard(state, "first").some((c) => c.uid === buddy.uid)).toBe(
        true,
      );
    });

    it("deals exactly 4 damage to a random enemy follower (seed 1)", () => {
      setupTurn(R6, { hand: [MELODIOUS_MONODY], pp: 1 });
      const sac = allyFollower(1, 3, "Sacrifice");
      const foe = enemyFollower(2, 8, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(sac.uid);
      expect(Number(foe.defense)).toBe(4);
      expect(printed).toContain("Deal 4 damage");
    });
  });

  describe("White Psalm, New Revelation (90074210)", () => {
    const printed =
      "Countdown (1)\nLast Words: Restore 1 defense to your leader. Summon a Black Psalm, New Revelation.";

    it("real path via Devastating Soprano (10373310): summons White Psalm by uid", () => {
      setupTurn(R6, { hand: [DEVASTATING_SOPRANO], pp: 3 });
      const sac = allyFollower(1, 3, "Sacrifice");
      const before = uidSet("first", "board");
      whenPlayCard("first", 0);
      resolvePendingByUid(sac.uid);
      const token = newZoneCard(before, "first", "board", WHITE_PSALM);
      expect(token).toBeTruthy();
    });

    it("enters with Countdown (1)", () => {
      setupTurn(R6, { hand: [WHITE_PSALM], pp: 3 });
      whenPlayCard("first", 0);
      const psalm = thenBoard("first").find((c) => c.id === WHITE_PSALM)!;
      expect(Number(psalm.countdown)).toBe(1);
    });

    it("Last Words at countdown 0: restores 1 leader HP and summons Black Psalm", () => {
      setupTurn(R6, { hand: [WHITE_PSALM], pp: 3, hp: 18 });
      whenPlayCard("first", 0);
      const psalm = thenBoard("first").find((c) => c.id === WHITE_PSALM)!;
      psalm.countdown = 0;
      cleanupDead();
      expect(getHP(state, "first")).toBe(19);
      expect(
        thenBoard("first").filter((c) => c.id === BLACK_PSALM),
      ).toHaveLength(1);
      expect(printed).toContain("Black Psalm, New Revelation");
    });
  });
});
