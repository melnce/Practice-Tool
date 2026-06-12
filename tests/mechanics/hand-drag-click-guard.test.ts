/**
 * @vitest-environment jsdom
 *
 * Hand-card left-click fuse must survive an aborted drag (dragend without click).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHandDragClickSuppressor } from "../../src/ui/zones/dragClickGuard.js";
import { attachHandlers } from "../../src/ui/zones/handlers.js";
import type { CardViewModel, ZoneContext } from "../../src/ui/zones/types.js";
import type { GameState } from "../../src/core/types/index.js";

vi.mock("../../src/ui/drag.js", () => ({
  enableCardDragFromHand: vi.fn(),
  enableCardEvoDrop: vi.fn(),
  enableAttackerDrag: vi.fn(),
  enableEnemyFollowerDrop: vi.fn(),
}));

vi.mock("../../src/ui/zones/actions.js", () => ({
  handleFuse: vi.fn(),
  handleMulliganToggle: vi.fn(),
  handleResolveTarget: vi.fn(),
  handleEngage: vi.fn(),
  handlePlayCard: vi.fn(),
}));

import * as actions from "../../src/ui/zones/actions.js";

function fireDrag(el: HTMLElement, type: "dragstart" | "dragend") {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function fireClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function minimalHandVm(overrides: Partial<CardViewModel> = {}): CardViewModel {
  return {
    card: {
      uid: "gear_uid",
      name: "Gear of Ambition",
      type: "Spell",
      cost: 1,
      fuse_recipes: [{ id: "gear→striker", partner_filters: [] }],
    } as CardViewModel["card"],
    idx: 0,
    uid: "gear_uid",
    shownCost: 1,
    atkDisp: 0,
    defDisp: 0,
    spellboostCount: null,
    countdown: null,
    ...overrides,
  };
}

function minimalHandCtx(): ZoneContext {
  return {
    containerId: "blueHand",
    owner: "first",
    isBoard: false,
    isHand: true,
    isMyBoard: false,
    isMyHand: true,
    isBlueHand: true,
    isRedHand: false,
    isBlueBoard: false,
    isRedBoard: false,
    isMulligan: false,
  };
}

describe("HandDragClickSuppressor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dragstart sets suppress; click never clears it", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    fireDrag(el, "dragstart");
    expect(guard.isSuppressing()).toBe(true);

    fireClick(el);
    expect(onClick).not.toHaveBeenCalled();
    expect(guard.isSuppressing()).toBe(true);
  });

  it("dragend clears suppress after a tick", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    fireDrag(el, "dragstart");
    fireDrag(el, "dragend");
    expect(guard.isSuppressing()).toBe(true);

    vi.runAllTimers();
    expect(guard.isSuppressing()).toBe(false);

    fireClick(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("aborted drag (dragend, no synthetic click): next click is allowed", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    fireDrag(el, "dragstart");
    fireDrag(el, "dragend");
    vi.runAllTimers();

    fireClick(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("synthetic click before dragend clear tick is still suppressed", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    fireDrag(el, "dragstart");
    fireDrag(el, "dragend");
    fireClick(el);
    expect(onClick).not.toHaveBeenCalled();

    vi.runAllTimers();
    fireClick(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("attachHandlers hand fuse + drag guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(actions.handleFuse).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborted drag then left-click opens fuse on the same card", () => {
    const div = document.createElement("div");
    const vm = minimalHandVm();
    const ctx = minimalHandCtx();
    const state = { activePlayer: "first" } as GameState;

    attachHandlers(div, vm, ctx, state, () => {});

    fireDrag(div, "dragstart");
    fireDrag(div, "dragend");
    vi.runAllTimers();

    fireClick(div);

    expect(actions.handleFuse).toHaveBeenCalledTimes(1);
    expect(actions.handleFuse).toHaveBeenCalledWith(
      "first",
      "gear_uid",
      true,
      vm.card,
    );
  });
});
