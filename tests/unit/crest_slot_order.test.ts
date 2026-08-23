/**
 * @vitest-environment jsdom
 *
 * Crest slot DOM order must match engine crest array order (firing order).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../fixtures/setup.js";
import { givenGameState, resetUidCounter } from "../harness/builders.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  handleGainCrest,
  processCrestEvent,
} from "../../src/logic/effects/crest.js";
import { getOrderedTriggerCandidates } from "../../src/logic/core/triggers/utils.js";
import { render } from "../../src/ui/render.js";
import "../../src/logic/core/effects/index.js";

function mountCrestDom(): void {
  document.body.innerHTML = `
    <div id="blueCrests" class="crest-container">
      <div class="crest-row">
        <div class="crest-slot"></div>
        <div class="crest-slot"></div>
      </div>
      <div class="crest-row">
        <div class="crest-slot"></div>
        <div class="crest-slot"></div>
        <div class="crest-slot"></div>
      </div>
    </div>
    <div id="redCrests" class="crest-container">
      <div class="crest-row">
        <div class="crest-slot"></div>
        <div class="crest-slot"></div>
        <div class="crest-slot"></div>
      </div>
      <div class="crest-row">
        <div class="crest-slot"></div>
        <div class="crest-slot"></div>
      </div>
    </div>
    <div id="cardTooltip" style="display:none"></div>
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
    <aside id="settingsDrawer" class="drawer" aria-hidden="true"></aside>
  `;
}

const CREST_NAMES = [
  "Order-Crest-1",
  "Order-Crest-2",
  "Order-Crest-3",
  "Order-Crest-4",
  "Order-Crest-5",
] as const;

function gainNamedCrests(owner: "first" | "second", names: readonly string[]) {
  for (let i = 0; i < names.length; i++) {
    handleGainCrest(
      {
        op: "crest",
        action: "gain",
        name: names[i],
        image: `/images/crests/order_${i + 1}.png`,
        description: names[i],
        triggers: [
          {
            event: "crest_order_probe",
            effects: [{ op: "noop" } as any],
          },
        ],
      } as any,
      owner,
    );
  }
}

describe("crest slot order", () => {
  beforeEach(() => {
    resetUidCounter();
    resetGameState(1);
    state.gameStarted = true;
    givenGameState({ seed: 1, activePlayer: "first", roundCount: 1 }).build();
    mountCrestDom();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("processCrestEvent iterates crests array in index order (0 first)", () => {
    gainNamedCrests("first", CREST_NAMES);

    const fired: string[] = [];
    const crests = state.players.first.crests;
    for (const crest of crests) {
      fired.push(crest.name);
    }

    expect(fired).toEqual([...CREST_NAMES]);

    const effects = processCrestEvent("first", "crest_order_probe");
    expect(effects.length).toBe(CREST_NAMES.length);
  });

  it("getOrderedTriggerCandidates preserves crest gain order by insertionTs", () => {
    gainNamedCrests("first", CREST_NAMES);

    const crestCandidates = getOrderedTriggerCandidates("first").filter(
      (c) => c.source === "crest",
    );
    expect(
      crestCandidates.map((c) => (c.card as { name: string }).name),
    ).toEqual([...CREST_NAMES]);
  });

  it("maps crests to DOM slots in querySelectorAll order (first gained → slot 1)", () => {
    gainNamedCrests("first", CREST_NAMES);
    render();

    const slots = Array.from(
      document.querySelectorAll("#blueCrests .crest-slot"),
    );
    expect(slots).toHaveLength(5);

    for (let i = 0; i < CREST_NAMES.length; i++) {
      const img = slots[i]!.querySelector(
        "img.crest-image",
      ) as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain(`order_${i + 1}.png`);
    }

    expect(slots[0]!.querySelector("img")?.getAttribute("src")).toContain(
      "order_1.png",
    );
  });
});
