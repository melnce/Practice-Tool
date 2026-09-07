/**
 * Evolving grants follower attack permission without setting the Rush keyword.
 *
 * Oracle: docs/official-qa.md (Achim 10272120, Olivia 10104110),
 * docs/svwb_rulebook_formatted.md Evolve / Rush / Storm paragraphs.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
  whenEndTurn,
  whenRunEffects,
  findOnBoard,
  thenBoard,
} from "../harness/builders.js";
import { state } from "../../src/core/gameState.js";
import { handleEvolveSelf } from "../../src/logic/effects/ops/evolve.js";
import {
  attackFollower,
  attackLeader,
  deriveCanAttack,
  recomputeAttackFlags,
} from "../../src/logic/core/combat.js";
import { hasKeyword } from "../../src/logic/core/keywords/has.js";
import { resolvePendingTarget } from "../../src/logic/core/resolveTarget.js";
import { createCardViewModel } from "../../src/ui/zones/viewModel.js";
import { buildZoneContext } from "../../src/ui/zones/selectors.js";
import { getBoard, getHP } from "../../src/core/playerHelpers.js";
import "../../src/logic/core/effects/index.js";

const FILLER = "10111310";
const ACHIM = "10272120";
const GOBLIN = "90001110";
const PAD_DECK = Array.from({ length: 25 }, () => FILLER);

function setupEvolveTurn(
  opts: {
    hand?: string[];
    evo?: number;
    superEvo?: number;
    roundCount?: number;
  } = {},
) {
  const round = opts.roundCount ?? 6;
  const pp = Math.min(round, 10);
  let b = givenGameState({
    seed: 42,
    activePlayer: "first",
    roundCount: round,
  })
    .withFirstPP(pp, pp)
    .withSecondPP(pp, pp)
    .withFirstDeck(PAD_DECK)
    .withSecondDeck(PAD_DECK);
  if (opts.hand?.length) b = b.withFirstHand(opts.hand);
  if (opts.evo !== undefined) b = b.withFirstEvo(opts.evo);
  b.build();
  if (opts.superEvo !== undefined) {
    state.players.first.superEvoPoints = opts.superEvo;
    state.players.first.superEvoCharges = opts.superEvo;
  }
  state.gameStarted = true;
  state.phase = "main";
}

function vanillaFollower(
  name = "Vanilla",
  owner: "first" | "second" = "first",
) {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: 2, defense: 2 },
    "board",
    owner,
  );
  c.peak_defense = 2;
  c.justPlayed = true;
  c.hasAttacked = false;
  c.attacks_per_turn = 1;
  c.attacks_left = 1;
  state.players[owner].board.push(c);
  return c;
}

function enemyFollower(atk = 1, def = 5, name = "Enemy") {
  const c = createCard(
    { name, type: "Follower", cost: 2, attack: atk, defense: def },
    "board",
    "second",
  );
  c.peak_defense = def;
  state.players.second.board.push(c);
  return c;
}

function evolveWithPoint(card: Parameters<typeof handleEvolveSelf>[0]) {
  state.players.first.evoUsedThisTurn = false;
  handleEvolveSelf(card, "first", { mode: "normal", spendPoint: true });
}

describe("Mechanic Contract: evolve attack permission (not Rush keyword)", () => {
  beforeEach(() => {
    resetUidCounter();
  });

  it("vanilla follower played and evolved this turn may attack a follower but not the leader", () => {
    setupEvolveTurn({ evo: 1 });
    const follower = vanillaFollower();
    const enemy = enemyFollower();
    evolveWithPoint(follower);

    expect(follower.hasEvolved).toBe(true);
    expect(deriveCanAttack(follower)).toBe(true);
    expect(follower.can_attack).toBe(true);

    const defBefore = Number(enemy.defense);
    attackFollower(
      getBoard(state, "first").indexOf(follower),
      getBoard(state, "second").indexOf(enemy),
      "first",
      "second",
    );
    expect(Number(enemy.defense)).toBeLessThan(defBefore);

    state.players.second.hp = 20;
    attackLeader(getBoard(state, "first").indexOf(follower), "first", "second");
    expect(getHP(state, "second")).toBe(20);
  }, 60_000);

  it("evolved vanilla follower may attack the leader on the next turn", () => {
    setupEvolveTurn({ evo: 1 });
    const follower = vanillaFollower();
    enemyFollower();
    evolveWithPoint(follower);

    whenEndTurn("first");
    whenEndTurn("second");

    expect(follower.justPlayed).toBe(false);
    expect(deriveCanAttack(follower)).toBe(true);

    state.players.second.hp = 20;
    attackLeader(getBoard(state, "first").indexOf(follower), "first", "second");
    expect(getHP(state, "second")).toBeLessThan(20);
  }, 60_000);

  it("evolved vanilla follower does not report Rush keyword or Rush UI overlay", () => {
    setupEvolveTurn({ evo: 1 });
    const follower = vanillaFollower();
    evolveWithPoint(follower);

    expect(hasKeyword(follower, "rush")).toBe(false);
    expect(follower.hasRush).toBeFalsy();

    const vm = createCardViewModel(
      follower,
      0,
      buildZoneContext("blueBoard", state),
      state,
    );
    expect(vm.isRush).toBe(false);
  }, 60_000);

  it("removing Rush from an evolved vanilla follower does not remove attack permission", () => {
    setupEvolveTurn({ evo: 1 });
    const follower = vanillaFollower();
    const enemy = enemyFollower();
    evolveWithPoint(follower);

    whenRunEffects(
      [
        {
          op: "keyword",
          action: "remove",
          target: "ally:follower",
          keywords: ["Rush"],
        },
      ],
      "first",
    );

    expect(follower.can_attack).toBe(true);
    expect(deriveCanAttack(follower)).toBe(true);

    const defBefore = Number(enemy.defense);
    attackFollower(
      getBoard(state, "first").indexOf(follower),
      getBoard(state, "second").indexOf(enemy),
      "first",
      "second",
    );
    expect(Number(enemy.defense)).toBeLessThan(defBefore);
  }, 60_000);

  it("removing Rush from a printed-Rush follower played this turn removes attack permission", () => {
    setupEvolveTurn();
    const rush = vanillaFollower("Rusher");
    rush.hasRush = true;
    rush.keywords = ["Rush"];
    recomputeAttackFlags(rush);

    expect(deriveCanAttack(rush)).toBe(true);

    whenRunEffects(
      [
        {
          op: "keyword",
          action: "remove",
          target: "ally:follower",
          keywords: ["Rush"],
        },
      ],
      "first",
    );

    expect(rush.hasRush).toBe(false);
    expect(deriveCanAttack(rush)).toBe(false);
    expect(rush.can_attack).toBe(false);
  }, 60_000);

  it("Storm follower evolved this turn may still attack the leader", () => {
    setupEvolveTurn({ evo: 1 });
    const stormer = vanillaFollower("Stormer");
    stormer.hasStorm = true;
    stormer.keywords = ["Storm"];
    recomputeAttackFlags(stormer);

    evolveWithPoint(stormer);

    expect(stormer.hasStorm).toBe(true);
    expect(deriveCanAttack(stormer)).toBe(true);

    state.players.second.hp = 20;
    attackLeader(getBoard(state, "first").indexOf(stormer), "first", "second");
    expect(getHP(state, "second")).toBeLessThan(20);
  }, 60_000);

  it("printed-Rush follower evolved this turn still cannot attack the leader", () => {
    setupEvolveTurn({ evo: 1 });
    const rusher = vanillaFollower("Rusher");
    rusher.hasRush = true;
    rusher.keywords = ["Rush"];
    recomputeAttackFlags(rusher);

    evolveWithPoint(rusher);

    expect(hasKeyword(rusher, "rush")).toBe(true);
    expect(deriveCanAttack(rusher)).toBe(true);

    state.players.second.hp = 20;
    attackLeader(getBoard(state, "first").indexOf(rusher), "first", "second");
    expect(getHP(state, "second")).toBe(20);
  }, 60_000);

  it("effect-granted evolve (spendPoint: false) grants the same attack permission", () => {
    setupEvolveTurn({ superEvo: 1, roundCount: 8 });
    const follower = vanillaFollower("Arriet");
    enemyFollower();

    handleEvolveSelf(follower, "first", {
      mode: "super",
      spendPoint: false,
    });

    expect(follower.hasEvolved).toBe(true);
    expect(hasKeyword(follower, "rush")).toBe(false);
    expect(deriveCanAttack(follower)).toBe(true);

    state.players.second.hp = 20;
    attackLeader(getBoard(state, "first").indexOf(follower), "first", "second");
    expect(getHP(state, "second")).toBe(20);

    const enemy = state.players.second.board[0]!;
    follower.attacks_left = 1;
    follower.hasAttacked = false;
    recomputeAttackFlags(follower);

    const defBefore = Number(enemy.defense);
    attackFollower(
      getBoard(state, "first").indexOf(follower),
      getBoard(state, "second").indexOf(enemy),
      "first",
      "second",
    );
    expect(Number(enemy.defense)).toBeLessThan(defBefore);
  }, 60_000);

  it("exact copy of an evolved Goblin attacks a follower the turn it enters (Achim Q&A)", () => {
    setupEvolveTurn({ hand: [ACHIM], evo: 1 });
    const goblin = createCard(GOBLIN, "board", "second");
    goblin.peak_defense = goblin.defense;
    handleEvolveSelf(goblin, "second", { mode: "normal", spendPoint: false });
    expect(goblin.hasEvolved).toBe(true);
    state.players.second.board = [goblin];
    const fodder = enemyFollower(1, 2, "Fodder");

    whenPlayCard("first", 0);
    const achim = findOnBoard("first", "Achim, Lord of Despair")!;
    handleEvolveSelf(achim, "first", { mode: "normal", spendPoint: true });
    resolvePendingTarget(goblin.uid);

    const copy = thenBoard("first").find(
      (c) => c.name === "Goblin" && c.uid !== achim.uid,
    )!;
    expect(copy.hasEvolved).toBe(true);
    expect(hasKeyword(copy, "rush")).toBe(false);
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

  it("exact copy of an unevolved follower does not gain evolve attack permission", () => {
    setupEvolveTurn({ hand: [ACHIM], evo: 1 });
    const goblin = createCard(GOBLIN, "board", "second");
    goblin.peak_defense = goblin.defense;
    state.players.second.board = [goblin];
    enemyFollower(1, 2, "Fodder");

    whenPlayCard("first", 0);
    const achim = findOnBoard("first", "Achim, Lord of Despair")!;
    handleEvolveSelf(achim, "first", { mode: "normal", spendPoint: true });
    resolvePendingTarget(goblin.uid);

    const copy = thenBoard("first").find(
      (c) => c.name === "Goblin" && c.uid !== achim.uid,
    )!;
    expect(copy.hasEvolved).toBeFalsy();
    expect(deriveCanAttack(copy)).toBe(false);
    expect(copy.can_attack).toBe(false);
  }, 60_000);
});
