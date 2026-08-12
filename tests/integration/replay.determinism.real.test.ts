/**
 * D7: Real seeded-game determinism — same seed + same scripted actions must
 * fingerprint identically (including rng.snapshot), different seeds must differ.
 * Exercises the real startGame deck-load path and cards with random targeting:
 *   Seria, Gunslinger Maid (10221110)
 *   Ambush from Above (10212310)
 *   March of the Brutes (10351310)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { state } from "../../src/core/gameState.js";
import { startGame } from "../../src/logic/startGame.js";
import { confirmMulligan } from "../../src/logic/mulligan.js";
import { initCardDatabaseNode } from "../../src/data/cardLoaderNode.js";
import { getCardDetails } from "../../src/data/cardDatabase.js";
import { hashGameState } from "../../src/core/stateHash.js";
import { playCard } from "../../src/logic/core/playCard/index.js";
import { dispatchAction } from "../../src/logic/core/dispatch.js";
import type { CardInstance } from "../../src/core/types/index.js";

function deepFingerprint() {
  return {
    stateHash: hashGameState(state),
    rng: state.rng.snapshot(),
    blueHP: state.players.first.hp,
    redHP: state.players.second.hp,
    blueBoard: state.players.first.board.map((c) => ({
      name: c.name,
      atk: c.attack,
      def: c.defense,
      uid: c.uid,
    })),
    redBoard: state.players.second.board.map((c) => ({
      name: c.name,
      atk: c.attack,
      def: c.defense,
      uid: c.uid,
    })),
    blueHand: state.players.first.hand.map((c) => c.uid),
    redHand: state.players.second.hand.map((c) => c.uid),
    blueDeckTop: state.players.first.deck.slice(0, 5).map((c) => c.uid),
    redDeckTop: state.players.second.deck.slice(0, 5).map((c) => c.uid),
  };
}

function materialize(idOrName: string): CardInstance {
  const tpl = getCardDetails(idOrName);
  if (!tpl) throw new Error(`Missing card ${idOrName}`);
  const copy = structuredClone(tpl) as CardInstance;
  copy.uid = state.rng.makeUid();
  return copy;
}

function spawnEnemyFollower(name: string, atk: number, def: number) {
  const c = materialize("Goblin");
  c.name = name;
  c.attack = atk;
  c.defense = def;
  c.peak_defense = def;
  c.type = "Follower";
  state.players.second.board.push(c);
  return c;
}

async function playScriptedGame(seed: number) {
  await startGame({
    deckAId: "starter_deck",
    deckBId: "starter_deck",
    seed,
  });

  // Keep opening hands (no swaps) so mulligan RNG is still exercised consistently
  if (state.phase === "mulligan") {
    confirmMulligan("first");
    if (state.phase === "mulligan") confirmMulligan("second");
  }

  // Stage a multi-follower enemy board so random_hits has genuine choices
  state.players.second.board.length = 0;
  spawnEnemyFollower("Target A", 1, 3);
  spawnEnemyFollower("Target B", 2, 3);
  spawnEnemyFollower("Target C", 1, 4);

  state.activePlayer = "first";
  state.phase = "main";
  state.players.first.pp = 10;
  state.players.first.maxPP = 10;

  // Put the three random-effect cards into hand and play them
  const seria = materialize("10221110");
  const ambush = materialize("10212310");
  const march = materialize("10351310");
  state.players.first.hand.push(seria, ambush, march);

  const hand = state.players.first.hand;
  const playByUid = (uid: string) => {
    const idx = hand.findIndex((c) => c.uid === uid);
    expect(idx).toBeGreaterThanOrEqual(0);
    playCard(hand, "first", idx);
  };

  playByUid(seria.uid);
  playByUid(ambush.uid);
  playByUid(march.uid);

  // One turn cycle so draw/PP regen also tick the seeded stream
  dispatchAction(state, { type: "END_TURN" });
  dispatchAction(state, { type: "END_TURN" });

  return deepFingerprint();
}

describe("D7: real startGame scripted determinism", () => {
  beforeAll(async () => {
    await initCardDatabaseNode();
  });

  const SEEDS = [4242, 99991, 7];

  it("same seed twice → identical deep fingerprints (incl. rng.snapshot)", async () => {
    for (const seed of SEEDS) {
      const a = await playScriptedGame(seed);
      const b = await playScriptedGame(seed);
      expect(b, `seed ${seed}`).toEqual(a);
      // Random effects must have actually fired (enemy board damaged / thinned)
      expect(
        a.redBoard.some((c) => c.def < 3) ||
          a.redBoard.length < 3 ||
          a.redHP < 20,
      ).toBe(true);
    }
  });

  it("different seeds → different fingerprints", async () => {
    const fps = [];
    for (const seed of SEEDS) {
      fps.push(await playScriptedGame(seed));
    }
    expect(fps[0]!.stateHash).not.toBe(fps[1]!.stateHash);
    expect(fps[1]!.stateHash).not.toBe(fps[2]!.stateHash);
    expect(fps[0]!.rng).not.toEqual(fps[1]!.rng);
  });
});
