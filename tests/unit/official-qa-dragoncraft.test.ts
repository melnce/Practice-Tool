/**
 * Official Cygames Q&A — Dragoncraft batch 3 (12 cards, 21 Q&A entries).
 * Assertions follow docs/official-qa.md; owner rulings in docs/owner-rulings.md win on conflict.
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
  thenBoard,
  thenDeck,
  findOnBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { engageAmulet } from "../../src/logic/effects/ops/engage.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import { attackFollower } from "../../src/logic/core/combat.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import { canPlayCard } from "../../src/logic/core/playCard/preflight.js";
import { getEffectiveCost } from "../../src/logic/core/playCard/cost.js";
import { handleGainCrest } from "../../src/logic/effects/crest.js";
import { drawCard } from "../../src/core/utils.js";
import { setScriptedModePickProvider } from "../../src/logic/script/modeHook.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  getHand,
  getHP,
  getCrests,
  getMaxHP,
} from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const ZOOEY = "10444120";
const SPILLING_RED = "10642310";
const FAN_OTOHIME = "10143210";
const BURNITE = "10144110";
const WISE_GUARDIAN = "10241110";
const DRACONIC_STRIKE = "10243310";
const FENNIE = "10244120";
const DEVOTEE = "10341110";
const RAGING_LIGHTNING = "10341310";
const AZURIFRIT = "10344110";
const GALMIEX = "10344120";
const WHITEFROST = "90044310";

const LEAH = "10001120";
const QUAKE_GOLIATH = "10001130";
const INDOMITABLE = "10001110";
const OLIVIA = "10104110";
const ARRIET = "10002110";
const RUBY = "10101110";
const KRULLE = "10314110";
const BALTO = "10153140";
const SERVANT_COCYTUS = "90004120";
const DARKHAVEN_GRACE = "10162210";
const FILLER = "10001130";

const R6 = 6;
const R7 = 7;
const R10 = 10;

function setupTurn(
  round: number,
  opts: {
    hand?: string[];
    deck?: string[];
    secondHand?: string[];
    secondDeck?: string[];
    pp?: number;
    secondPp?: number;
    active?: "first" | "second";
    hp?: number;
    secondHp?: number;
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
  if (opts.secondHand?.length) b = b.withSecondHand(opts.secondHand);
  if (opts.secondDeck?.length) b = b.withSecondDeck(opts.secondDeck);
  if (opts.hp !== undefined) b = b.withFirstHP(opts.hp);
  if (opts.secondHp !== undefined) b = b.withSecondHP(opts.secondHp);
  if (opts.secondPp !== undefined) b = b.withSecondPP(opts.secondPp, max);
  b.build();
  state.gameStarted = true;
  state.phase = "main";
}

function resolveFirstPending(): void {
  const pending = state.pendingTargetEffect;
  expect(pending?.poolUids?.length ?? pending?.pool?.length).toBeGreaterThan(0);
  const uid = pending!.poolUids?.[0] ?? String(pending!.pool?.[0]?.uid ?? "");
  resolvePendingTarget(uid);
}

function resolvePendingByUid(uid: string): void {
  resolvePendingTarget(uid);
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
  c.can_attack = false;
  c.justPlayed = false;
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

function readyAttacker(
  card: ReturnType<typeof createCard>,
  owner: "first" | "second" = "first",
) {
  applyKeywordsFromList(card);
  card.can_attack = true;
  card.can_attack_followers = true;
  card.justPlayed = false;
  card.hasAttacked = false;
  card.attacks_left = 1;
  if (owner === "first") {
    card.attacks_left = 1;
  }
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

function gainCardCrest(cardId: string, owner: "first" | "second"): void {
  const card = getCardById(cardId);
  expect(card).toBeDefined();
  const gain = findCrestGain(card as Record<string, unknown>);
  expect(gain).toBeDefined();
  handleGainCrest(gain as any, owner);
}

function crestCount(owner: "first" | "second", namePart: string): number {
  return getCrests(state, owner).filter((c) => c.name?.includes(namePart))
    .length;
}

function applyWhitefrostHandTaxToSecond(): void {
  setScriptedModePickProvider(() => [1]);
  whenPlayCard("first", 0);
  setScriptedModePickProvider(null);
}

describe("official Q&A — Dragoncraft batch 3", () => {
  beforeEach(() => {
    resetUidCounter();
    state.gameStarted = true;
    state.activePlayer = "first";
    state.players.first.crests = [];
    state.players.second.crests = [];
  });

  it("10444120 Zooey, Ally of the World — Enhance(10) damage cap blocks Balto crest EOT (official Q&A)", () => {
    setupTurn(R10, { hand: [ZOOEY], pp: 10 });
    state.players.first.hp = 5;
    state.players.first.maxHP = 20;
    gainCardCrest(BALTO, "second");

    whenPlayCard("first", 0);
    expect(getMaxHP(state, "first")).toBe(1);
    const hpAfterZooey = getHP(state, "first");

    whenEndTurn();
    whenEndTurn();
    expect(getHP(state, "first")).toBe(hpAfterZooey);

    resetUidCounter();
    setupTurn(R10, { pp: 10 });
    state.players.first.hp = 5;
    state.players.first.maxHP = 20;
    gainCardCrest(BALTO, "second");
    whenEndTurn();
    whenEndTurn();
    expect(getHP(state, "first")).toBe(4);
  }, 60_000);

  it("10642310 Spilling Red — needs both hand discard target and enemy follower (official Q&A)", () => {
    setupTurn(R6, { hand: [SPILLING_RED, FILLER], pp: 6 });
    enemyFollower(2, 3);
    const spilling = getHand(state, "first").find(
      (c) => c.id === SPILLING_RED,
    )!;
    expect(canPlayCard(spilling, "first").ok).toBe(true);
    const withEnemy = whenPlayCard(
      "first",
      getHand(state, "first").indexOf(spilling),
    );
    expect(withEnemy.kind === "paused" || withEnemy.kind === "done").toBe(true);

    resetUidCounter();
    setupTurn(R6, { hand: [SPILLING_RED, FILLER], pp: 6 });
    const spillingNoEnemy = getHand(state, "first").find(
      (c) => c.id === SPILLING_RED,
    )!;
    expect(canPlayCard(spillingNoEnemy, "first").ok).toBe(false);
    expect(
      whenPlayCard("first", getHand(state, "first").indexOf(spillingNoEnemy))
        .kind,
    ).toBe("blocked");
  }, 60_000);

  it("10642310 Spilling Red — blocked with enemy but no other hand card to discard (official Q&A)", () => {
    setupTurn(R6, { hand: [SPILLING_RED], pp: 6 });
    enemyFollower(2, 3);
    const spillingOnly = getHand(state, "first").find(
      (c) => c.id === SPILLING_RED,
    )!;
    expect(canPlayCard(spillingOnly, "first").ok).toBe(false);
    expect(
      whenPlayCard("first", getHand(state, "first").indexOf(spillingOnly)).kind,
    ).toBe("blocked");
  }, 60_000);

  it("10143210 Fan of Otohime — Engage with empty hand summons Bodyguard without discard (official Q&A)", () => {
    setupTurn(R6, { hand: [], pp: 4 });
    const fan = createCard(FAN_OTOHIME, "board", "first");
    applyKeywordsFromList(fan);
    state.players.first.board = [fan];
    const handBefore = thenHand("first").length;

    engageAmulet("first", 0);

    expect(
      thenBoard("first").some((c) => c.name === "Otohime's Bodyguard"),
    ).toBe(true);
    expect(thenHand("first").length).toBe(handBefore);
  }, 60_000);

  it("10144110 Burnite, Anathema of Flame — solo hand Fanfare deals 0 without discard (official Q&A)", () => {
    setupTurn(R6, { hand: [BURNITE], pp: 7 });
    const foe = enemyFollower(4, 6);
    whenPlayCard("first", 0);
    expect(Number(foe.defense)).toBe(6);
    expect(thenHand("first").length).toBe(0);

    resetUidCounter();
    setupTurn(R6, { hand: [BURNITE, FILLER], pp: 7 });
    const foe2 = enemyFollower(4, 6);
    whenPlayCard("first", 0);
    resolveFirstPending();
    expect(Number(foe2.defense)).toBeLessThan(6);
  }, 60_000);

  it.fails(
    "10144110 Burnite, Anathema of Flame — crest leader_restored fires on 0 restore (official Q&A)",
    () => {
      setupTurn(R6, { active: "second", secondPp: 2 });
      state.players.second.hp = 20;
      state.players.second.maxHP = 20;
      gainCardCrest(BURNITE, "first");

      const grace = createCard(DARKHAVEN_GRACE, "board", "second");
      applyKeywordsFromList(grace);
      const ally = createCard(
        {
          name: "EngageAlly",
          type: "Follower",
          cost: 1,
          attack: 1,
          defense: 1,
        },
        "board",
        "second",
      );
      ally.peak_defense = 1;
      state.players.second.board = [grace, ally];
      state.activePlayer = "second";

      engageAmulet("second", 0);
      resolvePendingByUid(ally.uid);

      expect(getHP(state, "second")).toBe(19);
    },
    60_000,
  );

  it("10144110 Burnite, Anathema of Flame — cannot gain duplicate Flame crest (official Q&A)", () => {
    setupTurn(R7);
    gainCardCrest(BURNITE, "first");
    expect(crestCount("second", "Burnite, Anathema of Flame")).toBe(1);

    const burnite = createCard(BURNITE, "board", "first");
    burnite.peak_defense = burnite.defense;
    state.players.first.board = [burnite];
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(burnite, "first", { mode: "super", spendPoint: true });

    expect(crestCount("second", "Burnite, Anathema of Flame")).toBe(1);
  }, 60_000);

  it("10241110 Wise Guardian Dragon — Olivia SEP + Olivia Super on Arriet leaves cost 4 (official Q&A)", () => {
    setupTurn(R10, {
      hand: [WISE_GUARDIAN, OLIVIA, ARRIET],
      pp: 10,
    });
    const wise = getHand(state, "first").find((c) => c.id === WISE_GUARDIAN)!;
    expect(Number(wise.cost)).toBe(10);

    whenPlayCard(
      "first",
      getHand(state, "first").findIndex((c) => c.id === ARRIET),
    );
    whenPlayCard(
      "first",
      getHand(state, "first").findIndex((c) => c.id === OLIVIA),
    );

    const olivia = findOnBoard("first", "Olivia, Heroic Dark Angel")!;
    const arriet = findOnBoard("first", "Arriet, Luxminstrel")!;
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(olivia, "first", { mode: "super", spendPoint: true });
    expect(Number(wise.cost)).toBe(7);
    resolvePendingByUid(arriet.uid);
    expect(Number(wise.cost)).toBe(4);
  }, 60_000);

  it("10243310 Draconic Strike — Fennie-halved Quake Goliath becomes cost 0 (official Q&A)", () => {
    setupTurn(R6, {
      hand: [DRACONIC_STRIKE, FENNIE],
      pp: 14,
      deck: [QUAKE_GOLIATH],
    });
    whenPlayCard(
      "first",
      getHand(state, "first").findIndex((c) => c.id === FENNIE),
    );
    drawCard(state.players.first.hand, state.players.first.deck, "first");
    const goliath = getHand(state, "first").find(
      (c) => c.id === QUAKE_GOLIATH,
    )!;
    expect(getEffectiveCost(goliath)).toBe(2);

    whenPlayCard(
      "first",
      getHand(state, "first").findIndex((c) => c.id === DRACONIC_STRIKE),
    );
    resolvePendingByUid(goliath.uid);
    expect(getEffectiveCost(goliath)).toBe(0);
  }, 60_000);

  it("10244120 Fennie, Prismatic Phoenix — odd cost halving rounds up (official Q&A)", () => {
    setupTurn(R6, {
      hand: [FENNIE],
      pp: 8,
      deck: [{ name: "Nine", type: "Spell", cost: 9, attack: 0, defense: 0 }],
    });
    whenPlayCard("first", 0);
    expect(thenDeck("first")[0]!.cost).toBe(5);
  }, 60_000);

  it("10244120 Fennie, Prismatic Phoenix — two Fanfares halve costs twice (official Q&A)", () => {
    setupTurn(R6, {
      hand: [FENNIE, FENNIE],
      pp: 16,
      deck: [{ name: "Eight", type: "Spell", cost: 8, attack: 0, defense: 0 }],
    });
    whenPlayCard("first", 0);
    expect(thenDeck("first")[0]!.cost).toBe(4);
    whenPlayCard("first", 0);
    expect(thenDeck("first")[0]!.cost).toBe(2);
  }, 60_000);

  it("10341110 Devotee of Disdain — attacking Leah draws on 0 counter-damage (official Q&A)", () => {
    setupTurn(R6, {
      deck: [
        {
          name: "DCFollower",
          type: "Follower",
          class: "Dragoncraft",
          cost: 2,
          attack: 1,
          defense: 1,
        },
      ],
    });
    const devotee = createCard(DEVOTEE, "board", "first");
    devotee.peak_defense = devotee.defense;
    state.players.first.board = [devotee];
    const leah = createCard(LEAH, "board", "second");
    applyKeywordsFromList(leah);
    leah.peak_defense = leah.defense;
    state.players.second.board = [leah];
    readyAttacker(devotee);

    const handBefore = thenHand("first").length;
    attackFollower(0, 0, "first", "second");
    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(thenHand("first").some((c) => c.name === "DCFollower")).toBe(true);
  }, 60_000);

  it("10341110 Devotee of Disdain — super-evolved vs Quake Goliath draws on 0 damage (official Q&A)", () => {
    setupTurn(R7, {
      deck: [
        {
          name: "DCFollower",
          type: "Follower",
          class: "Dragoncraft",
          cost: 2,
          attack: 1,
          defense: 1,
        },
      ],
    });
    const devotee = createCard(DEVOTEE, "board", "first");
    devotee.peak_defense = devotee.defense;
    state.players.first.board = [devotee];
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(devotee, "first", { mode: "super", spendPoint: true });
    const goliath = createCard(QUAKE_GOLIATH, "board", "second");
    applyKeywordsFromList(goliath);
    goliath.peak_defense = goliath.defense;
    state.players.second.board = [goliath];
    readyAttacker(devotee);

    const handBefore = thenHand("first").length;
    attackFollower(0, 0, "first", "second");
    expect(thenHand("first").length).toBe(handBefore + 1);
  }, 60_000);

  it("10341310 Raging Lightning — hits all followers tied for highest defense (official Q&A)", () => {
    setupTurn(R6, { hand: [RAGING_LIGHTNING], pp: 3 });
    const mammoth = enemyFollower(10, 5, "Caravan Mammoth");
    const goliath = enemyFollower(4, 5, "Quake Goliath");
    const fighter = enemyFollower(2, 2, "Indomitable Fighter");
    state.players.second.board = [mammoth, goliath, fighter];

    whenPlayCard("first", 0);

    expect(Number(mammoth.defense)).toBe(0);
    expect(Number(goliath.defense)).toBe(0);
    expect(Number(fighter.defense)).toBe(2);
  }, 60_000);

  it("10344110 Azurifrit, Heir to Disdain — attacking Leah pings leader (official Q&A)", () => {
    setupTurn(R6);
    state.players.second.hp = 20;
    const az = createCard(AZURIFRIT, "board", "first");
    az.peak_defense = az.defense;
    state.players.first.board = [az];
    const leah = createCard(LEAH, "board", "second");
    applyKeywordsFromList(leah);
    leah.peak_defense = leah.defense;
    state.players.second.board = [leah];
    readyAttacker(az);

    attackFollower(0, 0, "first", "second");
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);

  it("10344110 Azurifrit, Heir to Disdain — super-evolved vs Servant of Cocytus pings leader (official Q&A)", () => {
    setupTurn(R7);
    state.players.second.hp = 20;
    const az = createCard(AZURIFRIT, "board", "first");
    az.peak_defense = 10;
    az.defense = 10;
    az.attack = 8;
    az.hasEvolved = true;
    az.evoType = "super";
    state.players.first.board = [az];
    const servant = createCard(SERVANT_COCYTUS, "board", "second");
    servant.peak_defense = servant.defense;
    state.players.second.board = [servant];
    readyAttacker(az);

    attackFollower(0, 0, "first", "second");
    expect(getHP(state, "second")).toBe(19);
  }, 60_000);

  it.fails(
    "10344110 Azurifrit, Heir to Disdain — Krulle crest destroys before on-damage ping (official Q&A; needs PR #270 queued-source guard)",
    () => {
      setupTurn(R6, { hand: [AZURIFRIT], pp: 9 });
      state.players.second.hp = 20;
      gainCardCrest(KRULLE, "second");
      whenPlayCard("first", 0);

      expect(
        findOnBoard("first", "Azurifrit, Heir to Disdain"),
      ).toBeUndefined();
      expect(getHP(state, "second")).toBe(20);

      resetUidCounter();
      setupTurn(R6);
      state.players.second.hp = 20;
      const az = createCard(AZURIFRIT, "board", "first");
      az.peak_defense = az.defense;
      state.players.first.board = [az];
      const leah = createCard(LEAH, "board", "second");
      applyKeywordsFromList(leah);
      leah.peak_defense = leah.defense;
      state.players.second.board = [leah];
      readyAttacker(az);
      attackFollower(0, 0, "first", "second");
      expect(getHP(state, "second")).toBe(19);
    },
    60_000,
  );

  it("10344120 Galmieux, Ardor Manifest — attacking Leah fires passive (official Q&A)", () => {
    setupTurn(R6);
    const galmieux = createCard(GALMIEX, "board", "first");
    galmieux.peak_defense = galmieux.defense;
    state.players.first.board = [galmieux];
    const leah = createCard(LEAH, "board", "second");
    applyKeywordsFromList(leah);
    leah.peak_defense = leah.defense;
    const bystander = enemyFollower(2, 5, "Bystander");
    state.players.second.board = [leah, bystander];
    readyAttacker(galmieux);

    attackFollower(0, 0, "first", "second");
    expect(Number(bystander.defense)).toBeLessThan(5);
  }, 60_000);

  it("10344120 Galmieux, Ardor Manifest — super-evolved vs Quake Goliath fires passive (official Q&A)", () => {
    setupTurn(R7);
    const galmieux = createCard(GALMIEX, "board", "first");
    galmieux.peak_defense = galmieux.defense;
    state.players.first.board = [galmieux];
    state.players.first.superEvoCharges = 1;
    state.players.first.superEvoPoints = 1;
    handleEvolveSelf(galmieux, "first", { mode: "super", spendPoint: true });
    const goliath = createCard(QUAKE_GOLIATH, "board", "second");
    applyKeywordsFromList(goliath);
    goliath.peak_defense = goliath.defense;
    const bystander = enemyFollower(2, 5, "Bystander");
    state.players.second.board = [goliath, bystander];
    readyAttacker(galmieux);

    attackFollower(0, 0, "first", "second");
    expect(Number(bystander.defense)).toBeLessThan(5);
  }, 60_000);

  it("10344120 Galmieux, Ardor Manifest — crest adds Fangs when Galmieux takes 0 damage (official Q&A)", () => {
    setupTurn(R6, { hand: [GALMIEX], pp: 5 });
    whenPlayCard("first", 0);
    const galmieux = findOnBoard("first", "Galmieux, Ardor Manifest")!;
    const leah = createCard(LEAH, "board", "second");
    applyKeywordsFromList(leah);
    leah.peak_defense = leah.defense;
    state.players.second.board = [leah];
    readyAttacker(galmieux);

    const handBefore = thenHand("first").length;
    attackFollower(0, 0, "first", "second");
    expect(thenHand("first").length).toBe(handBefore + 1);
    expect(
      thenHand("first").some((c) =>
        c.name?.includes("Fangs of Ardent Destruction"),
      ),
    ).toBe(true);
  }, 60_000);

  it("90044310 Whitefrost Whisper — returned boosted Quake Goliath redraws at 5 same turn (official Q&A)", () => {
    setupTurn(R7, {
      hand: [WHITEFROST],
      pp: 3,
      secondHand: [RUBY, QUAKE_GOLIATH],
      secondDeck: [],
    });
    applyWhitefrostHandTaxToSecond();
    const boosted = getHand(state, "second").find(
      (c) => c.id === QUAKE_GOLIATH,
    )!;
    const goliathUid = boosted.uid;
    expect(getEffectiveCost(boosted)).toBe(5);

    whenEndTurn();
    expect(state.activePlayer).toBe("second");

    const goliath = getHand(state, "second").find((c) => c.uid === goliathUid)!;
    expect(getEffectiveCost(goliath)).toBe(5);

    const rubyIdx = getHand(state, "second").findIndex((c) => c.id === RUBY);
    whenPlayCard("second", rubyIdx);
    resolvePendingByUid(goliathUid);
    const redrawn =
      thenHand("second").find((c) => c.uid === goliathUid) ??
      thenDeck("second").find((c) => c.uid === goliathUid);
    expect(redrawn).toBeDefined();
    expect(getEffectiveCost(redrawn!)).toBe(5);
  }, 60_000);

  it("90044310 Whitefrost Whisper — hand Goliath cost reverts to 4 after tax expires (official Q&A)", () => {
    setupTurn(R7, {
      hand: [WHITEFROST],
      pp: 3,
      secondHand: [QUAKE_GOLIATH],
    });
    applyWhitefrostHandTaxToSecond();
    const goliath = getHand(state, "second").find(
      (c) => c.id === QUAKE_GOLIATH,
    )!;
    expect(getEffectiveCost(goliath)).toBe(5);

    whenEndTurn();
    expect(getEffectiveCost(goliath)).toBe(5);

    whenEndTurn();
    expect(getEffectiveCost(goliath)).toBe(4);
  }, 60_000);

  it.fails(
    "90044310 Whitefrost Whisper — deck Goliath redraws at 4 after tax expires (official Q&A)",
    () => {
      setupTurn(R7, {
        hand: [WHITEFROST],
        pp: 3,
        secondHand: [RUBY, QUAKE_GOLIATH],
        secondDeck: [],
        secondPp: 7,
      });
      applyWhitefrostHandTaxToSecond();
      whenEndTurn();

      const goliath = getHand(state, "second").find(
        (c) => c.id === QUAKE_GOLIATH,
      )!;
      const goliathUid = goliath.uid;
      const rubyIdx = getHand(state, "second").findIndex((c) => c.id === RUBY);
      whenPlayCard("second", rubyIdx);
      resolvePendingByUid(goliathUid);

      const inDeck = thenDeck("second").find((c) => c.uid === goliathUid)!;
      expect(inDeck).toBeDefined();
      expect(getEffectiveCost(inDeck)).toBe(5);

      whenEndTurn();
      expect(getEffectiveCost(inDeck)).toBe(4);

      whenEndTurn();
      whenEndTurn();
      drawCard(state.players.second.hand, state.players.second.deck, "second");
      const redrawn = thenHand("second").find((c) => c.uid === goliathUid)!;
      expect(getEffectiveCost(redrawn)).toBe(4);
    },
    60_000,
  );
});
