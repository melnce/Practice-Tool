/**
 * Official Cygames Q&A — Portalcraft batch 6 (16 cards, 19 Q&A entries).
 * Assertions follow docs/official-qa.md; owner rulings override when cited.
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
  findOnBoard,
  thenPP,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { forceCompleteOrFizzlePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import {
  getEffectiveCost,
  resolvePlayCost,
} from "../../src/logic/core/playCard/cost.js";
import { validateTargetSelection } from "../../src/logic/core/targeting/validation.js";
import { startFuseFromHand } from "../../src/logic/index.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { applyLeaderDamage } from "../../src/logic/effects/leader.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import {
  getBoard,
  getHand,
  getHP,
  getCrests,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

// Cards under test
const BULLET_BEYOND = "10071310";
const CASSIUS = "10473110";
const BEELZEBUB = "10474120";
const SUBSTANDARD_PUPPET = "10672110";
const LEONA = "10871120";
const MEDICAL_GRADE_ASSASSIN = "10171140";
const PUPPET_SHIELD = "10171310";
const STREAM_OF_LIFE = "10172310";
const DOOMWRIGHT_RESURGENCE = "10172320";
const EUDIE = "10174110";
const RALMIA = "10174130";
const ACHIM = "10272120";
const CARNELIA = "10273110";
const SUPPLICANT = "10372110";
const LISHENNA = "10374120";
const BERYL = "10152120";
const JEANNE = "10164120";
const SYLVIA = "10173120";
const ORCHIS = "10174120";
const MYUU = "10774120";

// Tokens / helpers
const GEAR_AMBITION = "90071210";
const GEAR_REMEMBRANCE = "90071220";
const ENHANCED_PUPPET = "90071120";
const STRIKER_ARTIFACT = "90072110";
const FORTIFIER_ARTIFACT = "90072120";
const OMINOUS_ALPHA = "90073110";
const OMINOUS_BETA = "90073120";
const OMINOUS_GAMMA = "90073130";
const MASTERWORK_OMEGA = "90074110";
const LLOYD = "90074120";
const MELODIOUS_MONODY = "90074310";
const DEPTHS_ELD_AXE = "90074320";
const GOBLIN = "90001110";
const FILLER = "10111310";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

const PAD_DECK = Array.from({ length: 25 }, () => FILLER);

let fuseConfirm: (() => void) | null = null;

function mountFuseAdapter() {
  fuseConfirm = null;
  injectAdapter({
    render: () => {},
    showChoiceModal: () => {},
    showTargetConfirmationButton: (vm: { onConfirm: () => void }) => {
      fuseConfirm = vm.onConfirm;
    },
    hideTargetConfirmation: () => {
      fuseConfirm = null;
    },
    triggerConfirmButtonClick: () => {
      fuseConfirm?.();
    },
  });
}

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    pp?: number;
    hp?: number;
    evo?: number;
    superEvo?: number;
    active?: "first" | "second";
    secondHand?: string[];
    secondBoard?: string[];
    firstBoard?: string[];
  } = {},
) {
  const max = Math.min(round, 10);
  const pp = opts.pp ?? max;
  let b = givenGameState({
    seed: 42,
    activePlayer: opts.active ?? "first",
    roundCount: round,
  }).withFirstPP(pp, max);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.deck?.length) b = b.withFirstDeck(opts.deck);
  else b = b.withFirstDeck(PAD_DECK);
  b = b.withSecondDeck(PAD_DECK);
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  if (opts.firstBoard?.length) b = b.withFirstBoard(opts.firstBoard);
  if (opts.secondBoard?.length) b = b.withSecondBoard(opts.secondBoard);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  if (opts.active === "second") {
    state.players.second.pp = pp;
    state.players.second.maxPP = max;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingByUid(uid);
}

function enemyFollower(
  atk: number,
  def: number,
  name = "Enemy",
  owner: "first" | "second" = "second",
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    owner,
  );
  c.peak_defense = def;
  state.players[owner].board.push(c);
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

function hasKeyword(
  card: {
    hasBane?: boolean;
    hasAmbush?: boolean;
    hasWard?: boolean;
    hasStorm?: boolean;
  },
  kw: "Bane" | "Ambush" | "Ward" | "Storm",
): boolean {
  applyKeywordsFromList(card as any);
  switch (kw) {
    case "Bane":
      return !!card.hasBane;
    case "Ambush":
      return !!card.hasAmbush;
    case "Ward":
      return !!card.hasWard;
    case "Storm":
      return !!card.hasStorm;
  }
}

function fuseAlphaPartners(alphaUid: string, partnerUids: string[]) {
  startFuseFromHand("first", alphaUid);
  for (const uid of partnerUids) {
    resolvePendingTarget(uid);
  }
  if (state.pendingTargetEffect?.requiresConfirmation) {
    fuseConfirm?.();
    if (state.pendingTargetEffect) {
      forceCompleteOrFizzlePendingTarget();
    }
  }
}

function playBeelzebubFromHand(
  player: "first" | "second",
  targetA: { uid: string },
  targetB: { uid: string },
) {
  const idx = getHand(state, player).findIndex((c) => c.id === BEELZEBUB);
  whenPlayCard(player, idx);
  resolvePendingByUid(targetA.uid);
  resolvePendingByUid(targetB.uid);
}

function advanceToNextFirstTurn() {
  whenEndTurn();
  whenEndTurn();
}

describe("Official Q&A — Portalcraft batch 6", () => {
  beforeEach(() => {
    resetUidCounter();
    mountFuseAdapter();
    state.gameStarted = true;
    state.phase = "main";
  });

  afterEach(() => {
    injectAdapter({ render: () => {} });
  });

  it("10071310 Bullet from Beyond — cannot play with no enemy followers (official Q&A)", () => {
    setupTurn(R8, { hand: [BULLET_BEYOND], pp: 4 });
    const spell = getHand(state, "first")[0]!;
    const ppBefore = thenPP("first");
    expect(canPlayCard(spell, "first").ok).toBe(false);
    const outcome = whenPlayCard("first", 0);
    expect(outcome.kind).toBe("blocked");
    expect(thenHand("first").some((c) => c.id === BULLET_BEYOND)).toBe(true);
    expect(thenPP("first")).toBe(ppBefore);

    enemyFollower(2, 4, "Target");
    const withTarget = getHand(state, "first")[0]!;
    expect(canPlayCard(withTarget, "first").ok).toBe(true);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(thenHand("first")).toContainEqual(
      expect.objectContaining({ id: GEAR_AMBITION }),
    );
  }, 60_000);

  it("10473110 Cassius — Fanfare still fires with 0 damage when no Artifact in hand (official Q&A)", () => {
    setupTurn(R6, { hand: [CASSIUS], pp: 5 });
    const foe = enemyFollower(2, 6, "Foe");
    const defBefore = Number(foe.defense);
    whenPlayCard("first", 0);
    expect(state.pendingTargetEffect).toBeFalsy();
    expect(Number(foe.defense)).toBe(defBefore);
    expect(findOnBoard("first", "Cassius, Sky-Yearning Arrival")).toBeTruthy();
  }, 60_000);

  it("10474120 Beelzebub — multiple copies stack Takes 1 more damage on enemy leader (official Q&A)", () => {
    setupTurn(R10, { hand: [BEELZEBUB, BEELZEBUB], pp: 9 });
    const a = enemyFollower(5, 9, "A");
    const b = enemyFollower(5, 9, "B");
    playBeelzebubFromHand("first", a, b);
    expect(state.players.second.leaderDamageTakenBonus).toBe(1);
    advanceToNextFirstTurn();
    const c = enemyFollower(5, 9, "C");
    const d = enemyFollower(5, 9, "D");
    playBeelzebubFromHand("first", c, d);
    expect(state.players.second.leaderDamageTakenBonus).toBe(2);
    const hpBefore = getHP(state, "second");
    applyLeaderDamage("second", 1);
    expect(getHP(state, "second")).toBe(hpBefore - 3);
  }, 60_000);

  it("10474120 Beelzebub + 10152120 Beryl — Fanfare deals 4 to your leader under Takes 1 more damage (official Q&A)", () => {
    setupTurn(R10, {
      active: "second",
      secondHand: [BEELZEBUB],
      hand: [BERYL],
      pp: 9,
      hp: 20,
    });
    const a = enemyFollower(5, 9, "A", "first");
    const b = enemyFollower(5, 9, "B", "first");
    playBeelzebubFromHand("second", a, b);
    expect(state.players.first.leaderDamageTakenBonus).toBe(1);
    state.activePlayer = "first";
    state.players.first.hp = 20;
    const hpBefore = getHP(state, "first");
    whenPlayCard("first", 0);
    expect(getHP(state, "first")).toBe(hpBefore - 4);
  }, 60_000);

  it("10474120 Beelzebub — super-evolved enemy knockback deals 2 to leader with Takes 1 more damage (official Q&A)", () => {
    setupTurn(R10, { active: "second", secondHand: [BEELZEBUB], pp: 9 });
    const a = enemyFollower(5, 9, "A", "first");
    const b = enemyFollower(5, 9, "B", "first");
    playBeelzebubFromHand("second", a, b);
    expect(state.players.first.leaderDamageTakenBonus).toBe(1);

    const attacker = createCard(
      {
        name: "Super Striker",
        type: "Follower",
        cost: 3,
        attack: 5,
        defense: 5,
      },
      "board",
      "second",
    );
    attacker.peak_defense = 5;
    attacker.evoType = "super";
    attacker.hasEvolved = true;
    attacker.can_attack = true;
    attacker.attacks_left = 1;
    attacker.justPlayed = false;
    applyKeywordsFromList(attacker);

    const fodder = allyFollower(1, 1, "Fodder");
    state.players.second.board = [attacker];
    state.players.first.board = [fodder];
    state.activePlayer = "second";

    const hpBefore = getHP(state, "first");
    attackFollower(0, 0, "second", "first");
    expect(getHP(state, "first")).toBe(hpBefore - 2);
  }, 60_000);

  it("10672110 Substandard Puppet — cost 2 plays normally not Accelerated (official Q&A)", () => {
    setupTurn(R8, { hand: [DEPTHS_ELD_AXE], pp: 0 });
    const onBoard = createCard(SUBSTANDARD_PUPPET, "board", "first");
    onBoard.base_cost = 5;
    onBoard.peak_defense = onBoard.defense;
    state.players.first.board = [onBoard];
    const handBefore = new Set(thenHand("first").map((c) => c.uid));
    whenPlayCard("first", 0);
    resolvePendingByUid(onBoard.uid);
    const reduced = thenHand("first").find(
      (c) => c.id === SUBSTANDARD_PUPPET && !handBefore.has(c.uid),
    )!;
    expect(getEffectiveCost(reduced)).toBe(2);
    expect(resolvePlayCost(reduced, 2).mode).toBe("normal");

    state.players.first.pp = 2;
    const boardBefore = thenBoard("first").length;
    whenPlayCard("first", getHand(state, "first").indexOf(reduced));
    const played = thenBoard("first").find(
      (c) => c.id === SUBSTANDARD_PUPPET && c.uid !== onBoard.uid,
    );
    expect(played).toBeTruthy();
    expect(played!.hasEvolved).toBe(true);
    expect(thenBoard("first").length).toBeGreaterThan(boardBefore);

    setupTurn(R8, { hand: [SUBSTANDARD_PUPPET], pp: 3 });
    const base = getHand(state, "first")[0]!;
    expect(resolvePlayCost(base, 3).mode).toBe("accelerate");
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.id === SUBSTANDARD_PUPPET),
    ).toHaveLength(2);
    expect(thenBoard("first").every((c) => !c.hasEvolved)).toBe(true);
  }, 60_000);

  it("10871120 Leona — Myuu keeps Ambush after Evolve when no enemies dealt damage (official Q&A)", () => {
    setupTurn(R7, { hand: [LEONA, MYUU], pp: 6, superEvo: 1, evo: 2 });
    whenPlayCard("first", 0);
    const leona = findOnBoard("first", "Leona, Overbearing Guardian")!;
    whenPlayCard("first", 0);
    const myuu = findOnBoard("first", "Myuu, Hot on His Heels")!;
    handleEvolveSelf(leona, "first", { mode: "super", spendPoint: true });
    resolvePendingByUid(myuu.uid);
    expect(hasKeyword(myuu, "Ambush")).toBe(true);

    handleEvolveSelf(myuu, "first", { mode: "normal", spendPoint: true });
    expect(hasKeyword(myuu, "Ambush")).toBe(true);
    expect(getBoard(state, "second")).toHaveLength(0);
  }, 60_000);

  it("10171140 Medical-Grade Assassin — only first Enhanced Puppet from Puppet Shield gets Bane (official Q&A)", () => {
    setupTurn(R6, { hand: [MEDICAL_GRADE_ASSASSIN, PUPPET_SHIELD], pp: 6 });
    whenPlayCard("first", 0);
    const shieldIdx = getHand(state, "first").findIndex(
      (c) => c.id === PUPPET_SHIELD,
    );
    whenPlayCard("first", shieldIdx);
    const puppets = thenBoard("first").filter((c) => c.id === ENHANCED_PUPPET);
    expect(puppets).toHaveLength(2);
    const baneCount = puppets.filter((p) => hasKeyword(p, "Bane")).length;
    expect(baneCount).toBe(1);
  }, 60_000);

  it("10172310 Stream of Life — cannot play with no enemy followers (official Q&A)", () => {
    setupTurn(R6, { hand: [STREAM_OF_LIFE], pp: 2 });
    const spell = getHand(state, "first")[0]!;
    const ppBefore = thenPP("first");
    expect(canPlayCard(spell, "first").ok).toBe(false);
    expect(whenPlayCard("first", 0).kind).toBe("blocked");
    expect(thenPP("first")).toBe(ppBefore);

    const foe = enemyFollower(2, 5, "Target");
    expect(canPlayCard(spell, "first").ok).toBe(true);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe.defense)).toBe(2);
    expect(thenHand("first").some((c) => c.id === GEAR_REMEMBRANCE)).toBe(true);
  }, 60_000);

  it.fails(
    "10172320 Doomwright Resurgence — cannot play without 2 Artifact followers ≤5 in hand (official Q&A)",
    () => {
      setupTurn(R8, { hand: [DOOMWRIGHT_RESURGENCE, STRIKER_ARTIFACT], pp: 5 });
      const spell = getHand(state, "first").find(
        (c) => c.id === DOOMWRIGHT_RESURGENCE,
      )!;
      const ppBefore = thenPP("first");
      expect(canPlayCard(spell, "first").ok).toBe(false);
      expect(
        whenPlayCard("first", getHand(state, "first").indexOf(spell)).kind,
      ).toBe("blocked");
      expect(thenPP("first")).toBe(ppBefore);

      setupTurn(R8, {
        hand: [DOOMWRIGHT_RESURGENCE, STRIKER_ARTIFACT, FORTIFIER_ARTIFACT],
        pp: 5,
      });
      const okSpell = getHand(state, "first").find(
        (c) => c.id === DOOMWRIGHT_RESURGENCE,
      )!;
      expect(canPlayCard(okSpell, "first").ok).toBe(true);
    },
    60_000,
  );

  it("10174110 Eudie — cannot gain a second Crest: Eudie, Maiden Reborn (official Q&A)", () => {
    setupTurn(R6, { hand: [EUDIE], pp: 3, evo: 1 });
    handleGainCrest(
      { op: "crest", action: "gain", name: "Eudie, Maiden Reborn" },
      "first",
    );
    expect(
      getCrests(state, "first").filter(
        (c) => c.name === "Eudie, Maiden Reborn",
      ),
    ).toHaveLength(1);
    whenPlayCard("first", 0);
    const eudie = findOnBoard("first", "Eudie, Maiden Reborn")!;
    handleEvolveSelf(eudie, "first", { mode: "normal", spendPoint: true });
    expect(
      getCrests(state, "first").filter(
        (c) => c.name === "Eudie, Maiden Reborn",
      ),
    ).toHaveLength(1);
  }, 60_000);

  it("10174130 Ralmia — Fanfare summons as many Artifact ≤5 copies as available (official Q&A)", () => {
    setupTurn(R10, { hand: [RALMIA, STRIKER_ARTIFACT], pp: 8 });
    whenPlayCard("first", 0);
    if (state.pendingTargetEffect) {
      resolveFirstPending();
    }
    expect(
      thenBoard("first").filter((c) => c.id === STRIKER_ARTIFACT),
    ).toHaveLength(1);
    expect(findOnBoard("first", "Ralmia, Sonic Boom")).toBeTruthy();

    setupTurn(R10, {
      hand: [RALMIA, STRIKER_ARTIFACT, FORTIFIER_ARTIFACT, OMINOUS_ALPHA],
      pp: 8,
    });
    whenPlayCard("first", 0);
    const pending = state.pendingTargetEffect;
    if (pending) {
      const pool =
        pending.poolUids ?? pending.pool?.map((c) => String(c.uid)) ?? [];
      for (const uid of pool.slice(0, 3)) {
        resolvePendingByUid(uid);
      }
    }
    expect(
      thenBoard("first").filter((c) => c.id === STRIKER_ARTIFACT).length,
    ).toBeGreaterThanOrEqual(1);
    expect(thenBoard("first").length).toBeGreaterThanOrEqual(4);
  }, 60_000);

  it("10272120 Achim — exact copy of evolved enemy Goblin can attack same turn (official Q&A)", () => {
    setupTurn(R6, { hand: [ACHIM], pp: 5, evo: 1 });
    const goblin = createCard(GOBLIN, "board", "second");
    goblin.peak_defense = goblin.defense;
    handleEvolveSelf(goblin, "second", { mode: "normal", spendPoint: false });
    expect(Number(goblin.attack)).toBe(3);
    expect(Number(goblin.defense)).toBe(4);
    expect(goblin.hasEvolved).toBe(true);
    state.players.second.board = [goblin];
    const fodder = enemyFollower(1, 2, "Fodder");
    whenPlayCard("first", 0);
    const achim = findOnBoard("first", "Achim, Lord of Despair")!;
    handleEvolveSelf(achim, "first", { mode: "normal", spendPoint: true });
    resolvePendingByUid(goblin.uid);
    const copy = thenBoard("first").find(
      (c) => c.name === "Goblin" && c.uid !== achim.uid,
    )!;
    expect(Number(copy.attack)).toBe(3);
    expect(Number(copy.defense)).toBe(4);
    expect(copy.hasEvolved).toBe(true);
    expect(copy.can_attack).toBe(true);
    const defBefore = Number(fodder.defense);
    attackFollower(
      getBoard(state, "first").indexOf(copy),
      getBoard(state, "second").indexOf(fodder),
      "first",
      "second",
    );
    expect(Number(fodder.defense)).toBeLessThan(defBefore);
  }, 60_000);

  it("10272120 Achim — exact copy of super-evolved enemy Goblin has SEP abilities (official Q&A)", () => {
    setupTurn(R7, { hand: [ACHIM], pp: 5, evo: 1 });
    const goblin = createCard(GOBLIN, "board", "second");
    goblin.peak_defense = goblin.defense;
    handleEvolveSelf(goblin, "second", { mode: "super", spendPoint: false });
    expect(Number(goblin.attack)).toBe(4);
    expect(Number(goblin.defense)).toBe(5);
    expect(goblin.evoType).toBe("super");
    state.players.second.board = [goblin];
    const fodder = enemyFollower(1, 1, "Fodder");
    whenPlayCard("first", 0);
    const achim = findOnBoard("first", "Achim, Lord of Despair")!;
    handleEvolveSelf(achim, "first", { mode: "normal", spendPoint: true });
    resolvePendingByUid(goblin.uid);
    const copy = thenBoard("first").find(
      (c) => c.name === "Goblin" && c.uid !== achim.uid,
    )!;
    expect(copy.evoType).toBe("super");
    expect(copy.hasEvolved).toBe(true);
    expect(Number(copy.attack)).toBe(4);
    expect(Number(copy.defense)).toBe(5);
    expect(copy.can_attack).toBe(true);
    const hpBefore = getHP(state, "second");
    attackFollower(
      getBoard(state, "first").indexOf(copy),
      getBoard(state, "second").indexOf(fodder),
      "first",
      "second",
    );
    expect(getHP(state, "second")).toBe(hpBefore - 1);
  }, 60_000);

  it("10273110 Carnelia + 10164120 Jeanne — Jeanne Fanfare destroys Ominous α despite can't be destroyed by abilities (official Q&A)", () => {
    setupTurn(R10, { hand: [CARNELIA, STRIKER_ARTIFACT], pp: 5, evo: 1 });
    whenPlayCard("first", 0);
    const carn = findOnBoard("first", "Carnelia, Ember of Darkness")!;
    handleEvolveSelf(carn, "first", { mode: "normal", spendPoint: true });
    const strikerHand = getHand(state, "first").find(
      (c) => c.id === STRIKER_ARTIFACT,
    )!;
    resolvePendingByUid(strikerHand.uid);
    whenPlayCard("first", getHand(state, "first").indexOf(strikerHand));
    const alpha = findOnBoard("first", "Striker Artifact")!;
    expect(alpha.id).toBe(STRIKER_ARTIFACT);

    setupTurn(R10, { hand: [JEANNE], pp: 7 });
    const ominous = createCard(OMINOUS_ALPHA, "board", "second");
    ominous.peak_defense = ominous.defense;
    ominous.cantBeDestroyedByAbilities = true;
    state.players.second.board = [ominous];
    whenPlayCard("first", 0);
    expect(getBoard(state, "second")).toHaveLength(0);
  }, 60_000);

  it.fails(
    "10372110 Supplicant — random 2 damage still fires when Lishenna can't be destroyed (official Q&A)",
    () => {
      setupTurn(R6, { hand: [SUPPLICANT], pp: 2 });
      const lishenna = createCard(LISHENNA, "board", "first");
      lishenna.peak_defense = lishenna.defense;
      applyKeywordsFromList(lishenna);
      state.players.first.board = [lishenna];
      const foe = enemyFollower(2, 5, "Foe");
      whenPlayCard("first", 0);
      resolvePendingByUid(lishenna.uid);
      expect(findOnBoard("first", "Lishenna, Melody Manifest")).toBeTruthy();
      expect(Number(foe.defense)).toBe(3);
    },
    60_000,
  );

  it.fails(
    "90073110 Ominous Artifact α — β then γ across turns transforms into Masterwork Ω (official Q&A)",
    () => {
      setupTurn(R6, {
        hand: [OMINOUS_ALPHA, OMINOUS_BETA, OMINOUS_GAMMA],
        pp: 0,
      });
      const alpha = getHand(state, "first").find(
        (c) => c.id === OMINOUS_ALPHA,
      )!;
      const beta = getHand(state, "first").find((c) => c.id === OMINOUS_BETA)!;
      fuseAlphaPartners(alpha.uid, [beta.uid]);
      expect(getHand(state, "first").some((c) => c.id === OMINOUS_ALPHA)).toBe(
        true,
      );
      expect(
        getHand(state, "first").some((c) => c.id === MASTERWORK_OMEGA),
      ).toBe(false);

      whenEndTurn();
      whenEndTurn();
      const alphaTurn2 = getHand(state, "first").find(
        (c) => c.id === OMINOUS_ALPHA,
      )!;
      const gamma = getHand(state, "first").find(
        (c) => c.id === OMINOUS_GAMMA,
      )!;
      fuseAlphaPartners(alphaTurn2.uid, [gamma.uid]);
      expect(thenHand("first").some((c) => c.id === MASTERWORK_OMEGA)).toBe(
        true,
      );
    },
    60_000,
  );

  it("90074120 Lloyd + 10173120 Sylvia — Super-Evolve selects Lloyd then Orchis and destroys both (official Q&A)", () => {
    setupTurn(R8, { hand: [SYLVIA], pp: 6, superEvo: 1, evo: 1 });
    whenPlayCard("first", 0);
    const sylvia = findOnBoard("first", "Sylvia, Garden Executioner")!;
    const lloyd = createCard(LLOYD, "board", "second");
    lloyd.peak_defense = lloyd.defense;
    const orchis = createCard(ORCHIS, "board", "second");
    orchis.peak_defense = orchis.defense;
    state.players.second.board = [orchis, lloyd];

    handleEvolveSelf(sylvia, "first", { mode: "super", spendPoint: true });
    const pending = state.pendingTargetEffect!;
    expect(validateTargetSelection(state, pending, orchis.uid).ok).toBe(false);
    expect(validateTargetSelection(state, pending, lloyd.uid).ok).toBe(true);
    const picked: string[] = [];
    resolvePendingByUid(lloyd.uid);
    picked.push(lloyd.uid);
    resolvePendingByUid(orchis.uid);
    picked.push(orchis.uid);
    expect(picked).toEqual([lloyd.uid, orchis.uid]);
    expect(getBoard(state, "second")).toHaveLength(0);
  }, 60_000);

  it("90074310 Melodious Monody — random 4 damage still fires when Lishenna can't be destroyed (official Q&A)", () => {
    setupTurn(R6, { hand: [MELODIOUS_MONODY], pp: 1 });
    const lishenna = createCard(LISHENNA, "board", "first");
    lishenna.peak_defense = lishenna.defense;
    applyKeywordsFromList(lishenna);
    state.players.first.board = [lishenna];
    const foe = enemyFollower(2, 6, "Foe");
    whenPlayCard("first", 0);
    resolvePendingByUid(lishenna.uid);
    expect(findOnBoard("first", "Lishenna, Melody Manifest")).toBeTruthy();
    expect(Number(foe.defense)).toBe(2);
  }, 60_000);
});
