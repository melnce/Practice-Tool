/**
 * Standalone reproduction of position save-load re-apply asymmetry (game 18).
 * Replays with positionCheck:true through action 46, then probes action 47.
 *
 * Usage: NODE_ENV=test npx tsx scripts/repro-position-reapply-countdown.ts
 */
import "../tests/fixtures/setup.ts";
import { initCardDatabaseNode } from "../src/data/cardLoaderNode.js";
import { state } from "../src/core/gameState.js";
import { createRng } from "../src/core/rng.js";
import {
  applySoakActionWithOutcome,
  pickSoakAction,
  getLegalSoakActions,
  runPositionSaveLoad,
  PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS,
} from "../src/bench/soakEnv.js";
import { startNewGame } from "../src/engine.js";
import { deckSpecForSeed } from "../src/bench/soakDecks.js";
import { _resetPositionStoreForTests } from "../src/core/positionStore.js";
import { captureSnapshot } from "../src/core/history.js";
import { getBoard, getGraveyard } from "../src/core/playerHelpers.js";
import { getEngineEphemeralFootprint } from "../src/core/history.js";
import { getLogs } from "../src/core/logger.js";

const WOG_UID = "uid_28";

function wogZone(): "board" | "graveyard" | "limbo" {
  if (getBoard(state, "second").some((c) => c?.uid === WOG_UID)) return "board";
  if (getGraveyard(state, "second").some((c) => c?.uid === WOG_UID))
    return "graveyard";
  return "limbo";
}

function dump(label: string, logFrom = 0) {
  const board = getBoard(state, "second").find((c) => c?.uid === WOG_UID);
  const grave = getGraveyard(state, "second").find((c) => c?.uid === WOG_UID);
  const events = getLogs()
    .slice(logFrom)
    .filter((e) =>
      ["death", "lastWords", "destroyQueued", "draw"].includes(e.type),
    )
    .map((e) => ({ type: e.type, card: e.details?.card, uid: e.details?.uid }));
  console.log(
    `\n=== ${label} ===`,
    JSON.stringify(
      {
        wogZone: wogZone(),
        wogBoard: board
          ? {
              countdown: board.countdown,
              _lwFired: (board as any)._lwFired,
              pendingDestruction: (board as any).pendingDestruction,
            }
          : null,
        wogGrave: grave ? { _lwFired: (grave as any)._lwFired } : null,
        shadows: state.players.second.shadows,
        handLen: state.players.second.hand.length,
        ephemeral: getEngineEphemeralFootprint(),
        events,
      },
      null,
      2,
    ),
  );
}

/** Mirrors soak position checks before the probe action (actions 1..N-1). */
function runPriorPositionChecks(
  throughAction: number,
  policyRng: ReturnType<typeof createRng>,
  ignoreFields: readonly string[],
): void {
  let actions = 0;
  _resetPositionStoreForTests();
  while (actions < throughAction) {
    const legal = getLegalSoakActions();
    const action = pickSoakAction(legal, policyRng);
    applySoakActionWithOutcome(action, "engine");
    actions++;
    const err = runPositionSaveLoad(
      {
        actionIndex: actions,
        action,
        ignoreFields,
        policyRng,
        dispatchPath: "engine",
      },
      {},
    );
    if (err)
      throw new Error(`position check failed at action ${actions}: ${err}`);
  }
}

async function main() {
  (globalThis as any).HEADLESS = true;
  await initCardDatabaseNode();

  const spec = deckSpecForSeed(20260925, 18);
  const gameSeed = 20260925 + 18 * 1_000_003;
  await startNewGame({
    deckAId: spec.deckAId,
    deckBId: spec.deckBId,
    seed: gameSeed,
  });
  const policyRng = createRng(`soak-policy-20260925-18`);
  const ignoreFields = [...PRE_SNAPSHOT_HISTORY_DRIFT_FIELDS];

  runPriorPositionChecks(46, policyRng, ignoreFields);
  const action47 = pickSoakAction(getLegalSoakActions(), policyRng);
  applySoakActionWithOutcome(action47, "engine");

  dump("after action 47 (before probe save)");
  const liveQueue = getEngineEphemeralFootprint().resolutionQueueLen;
  const snapQueue = ((captureSnapshot() as any)._resolutionQueue ?? []).length;
  console.log(
    `[snapshot queue] live=${liveQueue} snap=${snapQueue} preserved=${snapQueue === liveQueue}`,
  );

  const err = runPositionSaveLoad(
    {
      actionIndex: 47,
      action: action47,
      ignoreFields,
      policyRng,
      dispatchPath: "engine",
    },
    {},
  );
  console.log(`\nrunPositionSaveLoad at action 47: ${err ?? "OK"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
