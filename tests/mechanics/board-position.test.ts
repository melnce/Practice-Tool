/**
 * Board order: Last Words summons append on the right after compaction,
 * never in the dead follower's slot when followers sit to the right.
 */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./setup.js";
import {
  givenGameState,
  createCard,
  resetUidCounter,
  thenBoard,
} from "../harness/builders.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import { applyKeywordsFromList } from "../../src/logic/core/keywords.js";
import {
  cleanupDead,
  flushDeferredDeathBatch,
} from "../../src/logic/core/cleanup.js";
import { summonNamed } from "../../src/logic/effects/ops/summon_ops/direct.js";
import { dealDamage } from "../../src/logic/core/barrier.js";
import { render } from "../../src/ui/render.js";
import "../../src/logic/core/effects/index.js";

function mountRenderDom(): void {
  document.body.innerHTML = `
    <div id="blueHand" class="zone hand-zone"></div>
    <div id="redHand" class="zone hand-zone"></div>
    <div id="blueBoard" class="zone board-zone"></div>
    <div id="redBoard" class="zone board-zone"></div>
    <div id="blueLeader" class="leader"><span id="blueHP">20</span></div>
    <div id="redLeader" class="leader"><span id="redHP">20</span></div>
    <div id="blueHandCount">0</div>
    <div id="redHandCount">0</div>
    <div id="blueDeckCount">0</div>
    <div id="redDeckCount">0</div>
    <div id="blueGraveCount">0</div>
    <div id="redGraveCount">0</div>
    <div id="blueShadows">0</div>
    <div id="redShadows">0</div>
    <div id="bluePP">0</div>
    <div id="redPP">0</div>
    <div id="endTurnBlue" style="display:none"></div>
    <div id="endTurnRed" style="display:none"></div>
    <div id="blueNormalEvo"></div>
    <div id="redNormalEvo"></div>
    <div id="blueSuperEvo"></div>
    <div id="redSuperEvo"></div>
    <div id="boostPips"></div>
    <div id="boostPipEarly"></div>
    <div id="boostPipLate"></div>
    <div id="redBoost"></div>
    <div id="puzzleStatus"></div>
    <div id="scriptStatus"></div>
    <div id="checkpointStatus"></div>
    <div id="gameSeedPanel" hidden></div>
    <div id="gameSeedValue"></div>
    <div id="blueCrests"></div>
    <div id="redCrests"></div>
    <aside id="settingsDrawer" class="drawer" aria-hidden="true"></aside>
  `;
}

function makeLwVictim(summonName: string) {
  const victim = createCard(
    {
      name: "LW Victim",
      type: "Follower",
      cost: 1,
      attack: 1,
      defense: 1,
      keywords: [
        {
          name: "LastWords",
          effects: [
            {
              op: "summon",
              source: "named",
              name: summonName,
              count: 1,
            },
          ],
        },
      ],
    },
    "board",
    "first",
  );
  applyKeywordsFromList(victim);
  victim.peak_defense = 1;
  return victim;
}

function killDeferred(victim: ReturnType<typeof createCard>) {
  (state as any).deferDeathTriggers = true;
  dealDamage(victim, 1);
  cleanupDead();
  (state as any).deferDeathTriggers = false;
  flushDeferredDeathBatch();
}

describe("board position — Last Words summons", () => {
  beforeEach(() => {
    resetUidCounter();
    givenGameState({ seed: 1, activePlayer: "first" }).build();
    state.gameStarted = true;
    state.phase = "main";
  });

  afterEach(() => {
    resetGameState(1);
  });

  it("full board: middle LW death compacts rightward and summon is rightmost", () => {
    const a = createCard(
      { name: "A", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const victim = makeLwVictim("Steelclad Knight");
    const c = createCard(
      { name: "C", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const d = createCard(
      { name: "D", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const e = createCard(
      { name: "E", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [a, victim, c, d, e];

    killDeferred(victim);

    const board = thenBoard("first");
    const names = board.map((card) => card.name);
    expect(names).toEqual(["A", "C", "D", "E", "Steelclad Knight"]);
    expect(board.map((card) => card.uid)).toEqual([
      a.uid,
      c.uid,
      d.uid,
      e.uid,
      board[4]!.uid,
    ]);
    expect(board[4]!.name).toBe("Steelclad Knight");
    expect(board[1]!.name).not.toBe("Steelclad Knight");
  });

  it("four on board: middle LW death → summon appends right", () => {
    const a = createCard(
      { name: "A", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const victim = makeLwVictim("Steelclad Knight");
    const c = createCard(
      { name: "C", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const d = createCard(
      { name: "D", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [a, victim, c, d];

    killDeferred(victim);

    const board = thenBoard("first");
    expect(board.map((card) => card.name)).toEqual([
      "A",
      "C",
      "D",
      "Steelclad Knight",
    ]);
  });

  it("two LW deaths in one batch: both summons append right in resolution order", () => {
    const v1 = makeLwVictim("Steelclad Knight");
    v1.name = "LW1";
    const v2 = createCard(
      {
        name: "LW2",
        type: "Follower",
        cost: 1,
        attack: 1,
        defense: 1,
        keywords: [
          {
            name: "LastWords",
            effects: [
              {
                op: "summon",
                source: "named",
                name: "Goblin",
                count: 1,
              },
            ],
          },
        ],
      },
      "board",
      "first",
    );
    applyKeywordsFromList(v2);
    v2.peak_defense = 1;

    const filler = Array.from({ length: 3 }, (_, i) =>
      createCard(
        { name: `F${i}`, type: "Follower", attack: 1, defense: 1 },
        "board",
        "first",
      ),
    );
    state.players.first.board = [filler[0]!, v1, filler[1]!, v2, filler[2]!];

    (state as any).deferDeathTriggers = true;
    dealDamage(v1, 1);
    dealDamage(v2, 1);
    cleanupDead();
    (state as any).deferDeathTriggers = false;
    flushDeferredDeathBatch();

    const board = thenBoard("first");
    expect(board.map((c) => c.name)).toEqual([
      "F0",
      "F1",
      "F2",
      "Steelclad Knight",
      "Goblin",
    ]);
  });

  it("summon with no death in batch still appends on the right", () => {
    const a = createCard(
      { name: "A", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const b = createCard(
      { name: "B", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [a, b];

    summonNamed({ op: "summon", name: "Goblin", count: 1 } as any, "first");

    const board = thenBoard("first");
    expect(board.map((c) => c.name)).toEqual(["A", "B", "Goblin"]);
  });

  it("render() DOM child order matches engine board order after LW summon", () => {
    mountRenderDom();

    const a = createCard(
      { name: "A", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const victim = makeLwVictim("Steelclad Knight");
    const c = createCard(
      { name: "C", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const d = createCard(
      { name: "D", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    const e = createCard(
      { name: "E", type: "Follower", attack: 1, defense: 1 },
      "board",
      "first",
    );
    state.players.first.board = [a, victim, c, d, e];

    killDeferred(victim);

    render();

    const engineUids = thenBoard("first").map((card) => card.uid);
    const domUids = Array.from(
      document.querySelectorAll("#blueBoard .card"),
    ).map((el) => (el as HTMLElement).dataset.uid);
    expect(domUids).toEqual(engineUids);
    expect(domUids[domUids.length - 1]).toBe(engineUids[4]);
  });
});
