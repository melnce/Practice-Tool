/**
 * Watch scenario — board ally_follower_enter watchers fire after a qualifying summon.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import "./setup.js";
import {
  driveCard,
  hasBoardWatcherEnterTrigger,
} from "../../scripts/lib/cardBehaviourDrive.js";
import { state } from "../../src/core/gameState.js";
import { getCardById } from "../../src/data/cardDatabase.js";
import {
  makeCardFromDB,
  pushToBoard,
} from "../../src/logic/effects/ops/summon_ops/core.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  whenPlayCard,
} from "../harness/builders.js";
import fs from "fs";
import path from "path";
import "../../src/logic/core/effects/index.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LYRALA = "10121130";
const CHARON = "10254120";
const PROSTRATING_COWARD = "10661110";
const MYUU = "10774120";
const VANILLA_FOLLOWER = "10001110";

function loadPoolCard(id: string) {
  const all = [
    ...JSON.parse(fs.readFileSync(path.join(ROOT, "cards/all.json"), "utf-8")),
    ...JSON.parse(
      fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
    ),
  ] as { id: string }[];
  return all.find((c) => c.id === id)!;
}

function departedProbeInHand(): ReturnType<typeof createCard> {
  const tokens = JSON.parse(
    fs.readFileSync(path.join(ROOT, "cards/token_details.json"), "utf-8"),
  ) as { name: string; type?: string; tribes?: string[]; id: string }[];
  const departed = tokens.find(
    (t) =>
      String(t.type).toLowerCase() === "follower" &&
      (t.tribes ?? []).some((tr) => String(tr).toLowerCase() === "departed"),
  )!;
  const data = getCardById(departed.id);
  const card = data
    ? makeCardFromDB(data, "first")
    : createCard(
        {
          name: departed.name,
          type: "Follower",
          cost: 2,
          attack: 1,
          defense: 1,
          tribes: ["Departed"],
        },
        "hand",
        "first",
      );
  card.cost = 0;
  (card as { effectiveCost?: number }).effectiveCost = 0;
  return card;
}

beforeAll(() => {
  (globalThis as any).HEADLESS = true;
});

describe("watch scenario", () => {
  beforeEach(() => resetUidCounter());

  it("hasBoardWatcherEnterTrigger detects tribe-conditioned board watchers", () => {
    expect(hasBoardWatcherEnterTrigger(loadPoolCard(LYRALA))).toBe(true);
    expect(hasBoardWatcherEnterTrigger(loadPoolCard(PROSTRATING_COWARD))).toBe(
      false,
    );
    expect(hasBoardWatcherEnterTrigger(loadPoolCard(VANILLA_FOLLOWER))).toBe(
      false,
    );
  });

  it("place watcher + summon qualifying Departed grants Ward on entering follower", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;

    const template = getCardById(CHARON)!;
    const host = makeCardFromDB(template, "first");
    host.justPlayed = false;
    pushToBoard(state.players.first.board, "first", host);

    const probe = departedProbeInHand();
    state.players.first.hand.push(probe);
    const idx = state.players.first.hand.indexOf(probe);
    const outcome = whenPlayCard("first", idx);
    expect(outcome.kind).not.toBe("blocked");

    const entering = state.players.first.board.find((c) => c.uid === probe.uid);
    expect(entering).toBeDefined();
    expect(entering!.hasWard).toBe(true);
  }, 60_000);

  it("non-qualifying summon does not grant Ward from Charon watcher", () => {
    givenGameState({ seed: 42, activePlayer: "first" })
      .withFirstPP(10, 10)
      .build();
    state.gameStarted = true;

    const template = getCardById(CHARON)!;
    const host = makeCardFromDB(template, "first");
    host.justPlayed = false;
    pushToBoard(state.players.first.board, "first", host);

    const probe = createCard(
      {
        name: "HarnessNonDeparted",
        type: "Follower",
        cost: 0,
        attack: 1,
        defense: 1,
        tribes: ["Officer"],
      },
      "hand",
      "first",
    );
    (probe as { effectiveCost?: number }).effectiveCost = 0;
    state.players.first.hand.push(probe);
    const idx = state.players.first.hand.indexOf(probe);
    whenPlayCard("first", idx);

    const entering = state.players.first.board.find((c) => c.uid === probe.uid);
    expect(entering, "probe should enter the board").toBeDefined();
    expect(Boolean(entering?.hasWard)).toBe(false);
  }, 60_000);

  it("driveCard includes watch for Myuu (enemy follower damage watcher)", () => {
    const raw = loadPoolCard(MYUU);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;
    const names = result.scenarios.map((s) => s.scenario);
    expect(names).toContain("watch");
    expect(names).not.toContain("play");
  }, 60_000);

  it("driveCard includes watch alongside play for Charon", () => {
    const raw = loadPoolCard(CHARON);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;
    const names = result.scenarios.map((s) => s.scenario);
    expect(names).toContain("watch");
    expect(names).toContain("play");
    expect(names).not.toContain("vanilla_place");
  }, 60_000);

  it("Prostrating Coward play scenario restores leader HP with damaged-leader arena", () => {
    const raw = loadPoolCard(PROSTRATING_COWARD);
    const result = driveCard(raw);
    expect(result.status).toBe("covered");
    if (result.status !== "covered") return;

    const play = result.scenarios.find((s) => s.scenario === "play")!;
    const detail = play.detail as {
      players?: { first?: { hp?: number } };
    };
    expect(detail.players?.first?.hp).toBe(19);
  }, 60_000);
});
