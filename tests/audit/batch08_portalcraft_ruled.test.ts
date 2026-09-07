/**
 * Batch 8 — Portalcraft B/C ruled escalations (card text + rulebook).
 * Green here = engine matches our reading; not settled product sign-off.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  whenPlayCard,
  createCard,
  resetUidCounter,
  findOnBoard,
  thenHand,
  thenBoard,
  whenEndTurn,
} from "../harness/builders.js";
import {
  whenEvolve,
  whenSuperEvolve,
  whenEffectEvolve,
} from "../harness/whenEvolve.js";
import { state } from "../../src/core/gameState.js";

import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { runEffects } from "../../src/logic/core/effects/index.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import { fuse_finalize_gear_multi } from "../../src/logic/effects/ops/fuse/fuse.artifact.js";
import {
  getHP,
  getCrests,
  getBoard,
  getPP,
} from "../../src/core/playerHelpers.js";
import { cleanupDead } from "../../src/logic/core/cleanup.js";
import { injectAdapter } from "../../src/core/adapter.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import "../../src/logic/core/effects/index.js";

const R6 = 6;
const R7 = 7;
const R8 = 8;
const R10 = 10;

function setupTurn(
  round: number,
  opts: { hand?: string[]; pp?: number; deck?: string[] } = {},
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
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function enemyFollower(atk: number, def: number, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

describe("B/C — Medical-Grade Assassin Puppetry Bane (10171140)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare adds Enhanced Puppet; Puppet enter grants Bane once per turn", () => {
    setupTurn(R6, { hand: ["10171140", "90071110"], pp: 3 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Enhanced Puppet")).toBe(
      true,
    );
    whenPlayCard("first", 0);
    const puppet = findOnBoard("first", "Puppet")!;
    expect(puppet.hasBane || puppet.keywordState?.hasBane).toBe(true);
  });
});

describe("B/C — replicate fanfare (10172120, 10173110, 10271110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Lovestruck Puppeteer Evolve replicates Fanfare Puppet to hand", () => {
    setupTurn(R6, { hand: ["10172120"], pp: 2 });
    whenPlayCard("first", 0);
    const puppets0 = thenHand("first").filter(
      (c) => c.name === "Puppet",
    ).length;
    const card = findOnBoard("first", "Lovestruck Puppeteer")!;
    whenEvolve(card, "first");
    expect(
      thenHand("first").filter((c) => c.name === "Puppet").length,
    ).toBeGreaterThan(puppets0);
  });

  it("Miriam Evolve replicates Fanfare gears to hand", () => {
    setupTurn(R6, { hand: ["10173110"], pp: 3 });
    whenPlayCard("first", 0);
    const gears0 = thenHand("first").filter((c) =>
      /Gear of/.test(c.name ?? ""),
    ).length;
    const miriam = findOnBoard("first", "Miriam, the Resolute")!;
    whenEvolve(miriam, "first");
    expect(
      thenHand("first").filter((c) => /Gear of/.test(c.name ?? "")).length,
    ).toBeGreaterThan(gears0);
  });

  it("Engineblade Maven Evolve replicates Fanfare Striker + Remembrance", () => {
    setupTurn(R6, { hand: ["10271110"], pp: 6 });
    whenPlayCard("first", 0);
    const strikers0 = thenBoard("first").filter(
      (c) => c.name === "Striker Artifact",
    ).length;
    const maven = findOnBoard("first", "Engineblade Maven")!;
    whenEvolve(maven, "first");
    expect(
      thenBoard("first").filter((c) => c.name === "Striker Artifact").length,
    ).toBeGreaterThan(strikers0);
  });
});

describe("B/C — Doomwright EOT copies (10172320)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Selects 2 Artifact ≤5 in hand; summons copies with opponent-EOT destroy trigger", () => {
    setupTurn(R8, { hand: ["10172320", "90072110", "90073110"], pp: 5 });
    whenPlayCard("first", 0);
    const pending = state.pendingTargetEffect;
    const uids = pending?.poolUids ?? pending?.pool?.map((c) => c.uid) ?? [];
    expect(uids.length).toBeGreaterThanOrEqual(2);
    resolvePendingTarget(String(uids[0]));
    if (state.pendingTargetEffect) resolvePendingTarget(String(uids[1]));
    const copies = thenBoard("first").filter(
      (c) => c.name === "Striker Artifact" || c.name === "Ominous Artifact α",
    );
    expect(copies.length).toBe(2);
    expect(
      copies.some((c) =>
        (c.triggers ?? []).some(
          (t: { condition?: { whose_turn?: string } }) =>
            t.condition?.whose_turn === "opponent",
        ),
      ),
    ).toBe(true);
  });
});

describe("B/C — Sylvia mode (10173120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Mode 1 draws 2 cards", () => {
    setupTurn(R6, {
      hand: ["10173120"],
      pp: 6,
      deck: ["10171320", "10171310"],
    });
    whenPlayCard("first", 0);
    if (state.pendingModeChoice) state.pendingModeChoice.selectedIndex = 0;
    expect(thenHand("first").length).toBeGreaterThan(1);
  });
});

describe("B/C — Liam / Alouette / Karula artifact hand (10173130, 10173140, 10274120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Liam Fanfare summons 3 Enhanced Puppet", () => {
    setupTurn(R8, { hand: ["10173130"], pp: 9 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Enhanced Puppet").length,
    ).toBe(3);
  });

  it("Alouette Evolve summons one copy of Artifact ≤5 in hand", () => {
    setupTurn(R6, { hand: ["10173140", "90072110"], pp: 5 });
    whenPlayCard("first", 0);
    const alouette = findOnBoard("first", "Alouette, Doomwright Ward")!;
    whenEvolve(alouette, "first");
    expect(
      thenBoard("first").filter((c) => c.name === "Striker Artifact").length,
    ).toBe(1);
  });

  it("Karula Fanfare summons one copy of selected Artifact", () => {
    setupTurn(R6, { hand: ["10274120", "90072110"], pp: 5 });
    whenPlayCard("first", 0);
    expect(
      thenBoard("first").filter((c) => c.name === "Striker Artifact").length,
    ).toBe(1);
  });
});

describe("B/C — Ralmia triple summon (10174130)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Ralmia Fanfare selects up to 3 Artifact ≤5 and summons copies", () => {
    setupTurn(R10, {
      hand: ["10174130", "90072110", "90072120", "90073110"],
      pp: 9,
    });
    whenPlayCard("first", 0);
    const pending = state.pendingTargetEffect;
    const pool =
      pending?.poolUids ?? pending?.pool?.map((c) => String(c.uid)) ?? [];
    for (let i = 0; i < Math.min(3, pool.length); i++) {
      resolvePendingTarget(String(pool[i]));
    }
    expect(thenBoard("first").length).toBeGreaterThanOrEqual(3);
  });
});

describe("B/C — Orchis ongoing + SE (10174120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Puppetry enter gains Storm and Bane while Orchis on board", () => {
    setupTurn(R8, { hand: ["10174120", "90071110"], pp: 8 });
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const puppet = findOnBoard("first", "Puppet")!;
    expect(puppet.hasStorm || puppet.keywordState?.hasStorm).toBe(true);
    expect(puppet.hasBane || puppet.keywordState?.hasBane).toBe(true);
  });
});

describe("B/C — Puppet Cat super-evo gate (10271120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("With super-evolved ally, Fanfare adds Puppet +3/+0", () => {
    setupTurn(R7, { hand: ["10271120"] });
    const se = createCard(
      { name: "SE Ally", type: "Follower", cost: 3, attack: 3, defense: 3 },
      "board",
      "first",
    );
    se.evoType = "super";
    se.hasSuperEvolved = true;
    state.players.first.board.push(se);
    whenPlayCard("first", 0);
    const puppet = thenHand("first").find((c) => c.name === "Puppet");
    expect(puppet).toBeDefined();
    expect(Number(puppet!.attack)).toBeGreaterThanOrEqual(4);
  });
});

describe("B/C — Artifact Catapult sacrifice Engage (10271210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare at 1 PP adds exactly one Gear of Ambition and one Gear of Remembrance", () => {
    setupTurn(R6, { hand: ["10271210"], pp: 1 });
    whenPlayCard("first", 0);
    const hand = thenHand("first");
    const ambitions = hand.filter((c) => c.name === "Gear of Ambition");
    const remembrances = hand.filter((c) => c.name === "Gear of Remembrance");
    expect(ambitions).toHaveLength(1);
    expect(remembrances).toHaveLength(1);
    expect(ambitions[0]!.uid).not.toBe(remembrances[0]!.uid);
    expect(hand.length).toBe(2);
  });

  it("Engage (3): destroys amulet, summons Artifact copy from hand", () => {
    setupTurn(R6, { hand: ["10271210", "90072110"], pp: 6 });
    whenPlayCard("first", 0);
    const idx = state.players.first.board.findIndex(
      (c) => c.name === "Artifact Catapult",
    );
    engageAmulet("first", idx);
    const striker = thenHand("first").find(
      (c) => c.name === "Striker Artifact",
    )!;
    resolvePendingTarget(striker.uid);
    expect(
      state.players.first.board.some((c) => c.name === "Artifact Catapult"),
    ).toBe(false);
    expect(thenBoard("first").some((c) => c.name === "Striker Artifact")).toBe(
      true,
    );
    expect(getPP(state, "first")).toBe(2);
  });
});

describe("B/C — Vier transform (10272110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Fanfare transforms Puppetry hand follower to Doll Slayer", () => {
    setupTurn(R6, { hand: ["10272110", "90071110"], pp: 2 });
    const puppet = thenHand("first").find((c) => c.name === "Puppet")!;
    whenPlayCard("first", 0);
    resolvePendingTarget(puppet.uid);
    expect(thenHand("first").some((c) => c.name === "Doll Slayer")).toBe(true);
  });
});

describe("B/C — Achim banish copy (10272120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve banishes enemy ≤4 ATK and summons copy on your board", () => {
    setupTurn(R6, { hand: ["10272120"], pp: 5 });
    const foe = enemyFollower(3, 3);
    whenPlayCard("first", 0);
    const achim = findOnBoard("first", "Achim, Lord of Despair")!;
    whenEvolve(achim, "first");
    resolvePendingTarget(foe.uid);
    expect(getBoard(state, "second")).toHaveLength(0);
    expect(thenBoard("first").some((c) => c.name === "Enemy")).toBe(true);
  });
});

describe("B/C — Carnelia hand buff (10273110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Evolve grants Ward and indestructible-by-abilities on selected Artifact", () => {
    setupTurn(R6, { hand: ["10273110", "90072110"], pp: 5 });
    whenPlayCard("first", 0);
    const carn = findOnBoard("first", "Carnelia, Ember of Darkness")!;
    whenEvolve(carn, "first");
    const striker = thenHand("first").find(
      (c) => c.name === "Striker Artifact",
    )!;
    resolvePendingTarget(striker.uid);
    const updated = thenHand("first").find((c) => c.uid === striker.uid)!;
    expect(updated.hasWard || updated.keywordState?.hasWard).toBe(true);
  });
});

describe("B/C — Zwei ongoing Ward (10274110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Puppetry enter gains Ward while Zwei on board", () => {
    setupTurn(R6, { hand: ["10274110", "90071110"], pp: 5 });
    whenPlayCard("first", 0);
    whenPlayCard("first", 0);
    const puppet = findOnBoard("first", "Puppet")!;
    expect(puppet.hasWard || puppet.keywordState?.hasWard).toBe(true);
  });
});

describe("B/C — Destruction line (10371110, 10372110, 10372210, 10373110, 10373310, 10374110, 10374120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Devotee Fanfare buffs self by ally count then clears other allies", () => {
    setupTurn(R6, { hand: ["10371110"], pp: 4 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    whenPlayCard("first", 0);
    const dev = findOnBoard("first", "Devotee of Destruction")!;
    expect(Number(dev.attack)).toBe(5);
    expect(Number(dev.defense)).toBe(5);
    expect(thenBoard("first").length).toBe(1);
    expect(thenBoard("first").some((c) => c.name === "Ally")).toBe(false);
  });

  it("Supplicant Fanfare destroys selected ally for 2 random dmg", () => {
    setupTurn(R6, { hand: ["10372110"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    const foe = enemyFollower(2, 5);
    whenPlayCard("first", 0);
    resolvePendingTarget(ally.uid);
    expect(thenBoard("first").some((c) => c.name === "Ally")).toBe(false);
    expect(Number(foe.defense)).toBeLessThan(5);
  });

  it("Wasteland Fanfare destroys ally and draws 2", () => {
    setupTurn(R6, {
      hand: ["10372210"],
      pp: 2,
      deck: ["10171320", "10171310"],
    });
    const ally = createCard(
      { name: "Token", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    whenPlayCard("first", 0);
    resolvePendingTarget(ally.uid);
    expect(thenBoard("first").some((c) => c.name === "Token")).toBe(false);
    expect(thenHand("first").length).toBe(2);
  });

  it("Congregant Fanfare destroys random enemies X = other allies", () => {
    setupTurn(R8, { hand: ["10373110"], pp: 6 });
    enemyFollower(2, 4, "A");
    enemyFollower(2, 4, "B");
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    whenPlayCard("first", 0);
    expect(getBoard(state, "second").length).toBe(1);
    expect(thenBoard("first").length).toBe(1);
    expect(
      thenBoard("first").some((c) => c.name === "Congregant of Destruction"),
    ).toBe(true);
    expect(thenBoard("first").some((c) => c.name === "Ally")).toBe(false);
  });

  it("Devastating Soprano destroys ally and summons White Psalm", () => {
    setupTurn(R6, { hand: ["10373310"], pp: 2 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    whenPlayCard("first", 0);
    resolvePendingTarget(ally.uid);
    expect(thenBoard("first").some((c) => c.name === "Ally")).toBe(false);
    expect(
      thenBoard("first").some((c) => c.name === "White Psalm, New Revelation"),
    ).toBe(true);
  });

  it("Axia Super-Evolve deals X to enemy leader and clears other allies", () => {
    setupTurn(R6, { hand: ["10374110"], pp: 3 });
    state.players.first.evo = 2;
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 1, attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board.push(ally);
    const hp0 = getHP(state, "second");
    whenPlayCard("first", 0);
    const axia = findOnBoard("first", "Axia, Heir to Destruction")!;
    whenSuperEvolve(axia, "first");
    expect(getHP(state, "second")).toBe(hp0 - 1);
    expect(thenBoard("first").length).toBe(1);
    expect(thenBoard("first").some((c) => c.name === "Ally")).toBe(false);
  });

  it("Lishenna Fanfare adds Melodious Monody; Evolve summons White Psalm", () => {
    setupTurn(R6, { hand: ["10374120"], pp: 4 });
    whenPlayCard("first", 0);
    expect(thenHand("first").some((c) => c.name === "Melodious Monody")).toBe(
      true,
    );
    const lish = findOnBoard("first", "Lishenna, Melody Manifest")!;
    whenEvolve(lish, "first");
    expect(
      thenBoard("first").some((c) => c.name === "White Psalm, New Revelation"),
    ).toBe(true);
  });
});

describe("B/C — Eustace Skybound Art + Clash (10472110)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Skybound Art- selects unevolved ally, evolves it and Eustace", () => {
    setupTurn(R10, { hand: ["10472110"], pp: 5 });
    const ally = createCard(
      { name: "Ally", type: "Follower", cost: 2, attack: 2, defense: 2 },
      "board",
      "first",
    );
    ally.peak_defense = ally.defense;
    state.players.first.board = [ally];
    whenPlayCard("first", 0);
    resolvePendingTarget(String(ally.uid));
    expect(ally.hasEvolved).toBe(true);
    const eustace = findOnBoard("first", "Eustace, Howl of Thunder")!;
    expect(eustace.hasEvolved).toBe(true);
  });

  it("Clash deals 3 damage to the opposing follower in follower combat", () => {
    setupTurn(R6, { hand: ["10472110"], pp: 5 });
    whenPlayCard("first", 0);
    const eustace = findOnBoard("first", "Eustace, Howl of Thunder")!;
    eustace.can_attack = true;
    eustace.can_attack_followers = true;
    eustace.attacks_left = 1;
    eustace.hasAttacked = false;
    const foe = enemyFollower(2, 10);
    const defBefore = Number(foe.defense);
    const eustaceIdx = state.players.first.board.indexOf(eustace);
    attackFollower(eustaceIdx, 0, "first", "second");
    // Clash (3) fires before strike; strike-only would leave 5 DEF (10 − 5 ATK).
    expect(Number(foe.defense)).toBe(defBefore - 3 - Number(eustace.attack));
    expect(Number(foe.defense)).not.toBe(defBefore - Number(eustace.attack));
  });
});

describe("B/C — Skybound / modes / bosses (10471120, 10472120, 10473110, 10473310, 10474110, 10474120)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Tsubasa Fanfare increases Skybound gauge on hand cards", () => {
    setupTurn(R6, { hand: ["10471120", "10171320"], pp: 2 });
    const spell = thenHand("first").find((c) => c.id === "10171320")!;
    const g0 = Number(spell.skyboundArtEvolvesWitnessed ?? 0);
    whenPlayCard("first", 0);
    expect(Number(spell.skyboundArtEvolvesWitnessed ?? 0)).toBeGreaterThan(g0);
  });

  it("Ilsa mode 2 deals 4 to enemy leader", () => {
    (globalThis as any).HEADLESS = false;
    setupTurn(R10, { hand: ["10472120"], pp: 7 });
    const hp0 = getHP(state, "second");
    injectAdapter({
      showChoiceModal: (_opts, cb) => cb(1),
    });
    whenPlayCard("first", 0);
    expect(getHP(state, "second")).toBe(hp0 - 4);
  });

  it("Cassius Fanfare damages all enemies X = selected Artifact ATK", () => {
    setupTurn(R6, { hand: ["10473110", "90072110"], pp: 5 });
    enemyFollower(2, 6);
    whenPlayCard("first", 0);
    const striker = thenHand("first").find(
      (c) => c.name === "Striker Artifact",
    )!;
    resolvePendingTarget(striker.uid);
    const foe = state.players.second.board[0]!;
    expect(Number(foe.defense)).toBeLessThan(6);
  });

  it("Cassius Last Words adds Fortifier Artifact to hand", () => {
    setupTurn(R6, { hand: ["10473110", "90072110"], pp: 5 });
    whenPlayCard("first", 0);
    const striker = thenHand("first").find(
      (c) => c.name === "Striker Artifact",
    )!;
    resolvePendingTarget(striker.uid);
    const cassius = findOnBoard("first", "Cassius, Sky-Yearning Arrival")!;
    cassius.defense = 0;
    cleanupDead();
    expect(thenHand("first").some((c) => c.name === "Fortifier Artifact")).toBe(
      true,
    );
  });

  it("Chaos Legion deals 3 to all enemies", () => {
    setupTurn(R10, { hand: ["10473310"], pp: 6 });
    enemyFollower(2, 5);
    whenPlayCard("first", 0);
    expect(getBoard(state, "second")).toHaveLength(0);
  });

  it("Lu Woh Fanfare hits random followers 6 times", () => {
    setupTurn(R10, { hand: ["10474110"], pp: 5 });
    enemyFollower(2, 8);
    whenPlayCard("first", 0);
    const foe = state.players.second.board[0];
    expect(foe == null || Number(foe.defense) < 8).toBe(true);
  });

  it("Beelzebub Fanfare select-2 silence + 9 damage", () => {
    setupTurn(R10, { hand: ["10474120"], pp: 9 });
    const a = enemyFollower(5, 9, "A");
    const b = enemyFollower(5, 9, "B");
    whenPlayCard("first", 0);
    resolvePendingTarget(a.uid);
    resolvePendingTarget(b.uid);
    expect(a.defense).toBe(0);
    expect(b.defense).toBe(0);
  });
});

describe("B/C — Ancient Cannon on_fuse (10173210)", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
  });

  it("Whenever you Fuse, deal 2 to a random enemy follower", () => {
    setupTurn(R6, { hand: ["10173210"], pp: 5 });
    whenPlayCard("first", 0);
    enemyFollower(2, 5);
    const host = createCard("90071210", "hand", "first");
    const partner = createCard("90071220", "hand", "first");
    state.players.first.hand.push(host, partner);
    fuse_finalize_gear_multi("first", host.uid, [partner], "Striker Artifact");
    const foe = state.players.second.board[0];
    expect(foe == null || Number(foe.defense) < 5).toBe(true);
  });
});
