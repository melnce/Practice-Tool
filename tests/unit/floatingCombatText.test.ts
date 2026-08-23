/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../fixtures/setup.js";
import { logEvent, clearLogs } from "../../src/core/logger.js";
import {
  doAction,
  resetHistory,
  setHistoryEnabled,
  undo,
} from "../../src/core/history.js";
import { state, resetGameState } from "../../src/core/gameState.js";
import {
  _getActiveFloaterCount,
  _getFallbackTimerCount,
  _resetFloatingCombatTextForTests,
  _spawnFloatingCombatTextForTest,
  initFloatingCombatTextHistoryHooks,
  setFloatingCombatTextEnabled,
  syncFloatingCombatTextFromLogs,
  suppressNextFloatingCombatText,
} from "../../src/ui/floatingCombatText.js";

function setupDom(): void {
  document.body.innerHTML = `
    <div class="leader blue-leader" id="blueLeader"><span id="blueHP">20</span></div>
    <div class="leader red-leader" id="redLeader"><span id="redHP">20</span></div>
    <div id="blueBoard" class="zone board-zone">
      <div class="card" data-uid="follower-1" id="blueBoard-0"></div>
    </div>
  `;
}

describe("floatingCombatText", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).HEADLESS = false;
    setupDom();
    clearLogs();
    resetGameState(1);
    state.gameStarted = true;
    setHistoryEnabled(true);
    resetHistory();
    _resetFloatingCombatTextForTests();
    initFloatingCombatTextHistoryHooks();
    setFloatingCombatTextEnabled(true);
    suppressNextFloatingCombatText();
    syncFloatingCombatTextFromLogs();
    clearLogs();
    _resetFloatingCombatTextForTests();
    suppressNextFloatingCombatText();
    syncFloatingCombatTextFromLogs();
  });

  afterEach(() => {
    _resetFloatingCombatTextForTests();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("spawns heal and damage floaters from game log in order", () => {
    logEvent("restoreLeader", { player: "first", amount: 1 });
    logEvent("leaderDamage", { owner: "first", amount: 1 });
    syncFloatingCombatTextFromLogs();

    const floaters = document.querySelectorAll(".floating-combat-text");
    expect(floaters.length).toBe(2);
    expect(floaters[0]?.textContent).toBe("+1");
    expect(floaters[0]?.classList.contains("floating-combat-text--heal")).toBe(
      true,
    );
    expect(floaters[1]?.textContent).toBe("-1");
    expect(
      floaters[1]?.classList.contains("floating-combat-text--damage"),
    ).toBe(true);
    expect(
      (floaters[1] as HTMLElement).style.getPropertyValue("--float-stagger"),
    ).toBe("130ms");
  });

  it("skips leader damage absorbed by barrier", () => {
    logEvent("leaderDamage", { owner: "second", amount: 2 });
    logEvent("leaderBarrierPop", { owner: "second", reason: "leader_hit" });
    syncFloatingCombatTextFromLogs();
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(0);
  });

  it("suppresses floaters on history undo", () => {
    doAction(
      "hit",
      () => {
        logEvent("leaderDamage", { owner: "first", amount: 3 });
        state.players.first.hp -= 3;
      },
      {},
      { autoRender: false },
    );
    syncFloatingCombatTextFromLogs();
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(1);

    undo({ autoRender: false });
    syncFloatingCombatTextFromLogs();
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(1);
  });

  it("removes floaters on animationend and via fallback timeout", () => {
    _spawnFloatingCombatTextForTest({
      kind: "damage",
      targetKey: "leader:first",
      amount: 4,
    });
    expect(_getActiveFloaterCount()).toBe(1);

    const el = document.querySelector(".floating-combat-text") as HTMLElement;
    el.dispatchEvent(new Event("animationend"));
    expect(_getActiveFloaterCount()).toBe(0);
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(0);

    _spawnFloatingCombatTextForTest({
      kind: "heal",
      targetKey: "leader:first",
      amount: 2,
    });
    expect(_getActiveFloaterCount()).toBe(1);
    vi.advanceTimersByTime(2500);
    expect(_getActiveFloaterCount()).toBe(0);
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(0);
    expect(_getFallbackTimerCount()).toBe(0);
  });

  it("caps concurrent floaters per target and drops excess", () => {
    for (let i = 0; i < 8; i++) {
      _spawnFloatingCombatTextForTest({
        kind: "damage",
        targetKey: "leader:first",
        amount: 1,
      });
    }
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(4);
    expect(_getActiveFloaterCount()).toBe(4);
  });

  it("respects the settings toggle", () => {
    setFloatingCombatTextEnabled(false);
    logEvent("restoreLeader", { player: "first", amount: 5 });
    syncFloatingCombatTextFromLogs();
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(0);
  });

  it("cleans up DOM after a burst of log-driven events", () => {
    const baseline = document.querySelectorAll(".floating-combat-text").length;
    for (let i = 0; i < 40; i++) {
      logEvent("restoreLeader", { player: "first", amount: 1 });
      logEvent("leaderDamage", { owner: "first", amount: 1 });
      logEvent("damage", {
        target: "Goblin",
        targetUid: "follower-1",
        dealt: 1,
      });
    }
    syncFloatingCombatTextFromLogs();
    expect(
      document.querySelectorAll(".floating-combat-text").length,
    ).toBeGreaterThan(baseline);
    vi.advanceTimersByTime(2600);
    expect(document.querySelectorAll(".floating-combat-text").length).toBe(
      baseline,
    );
    expect(_getActiveFloaterCount()).toBe(0);
    expect(_getFallbackTimerCount()).toBe(0);
  });
});
