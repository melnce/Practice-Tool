/**
 * @vitest-environment jsdom
 *
 * Hand-card left-click fuse must survive:
 * - under-threshold pointer jitter (native drag cancelled → click fires)
 * - aborted drag (dragend without click)
 * - missing dragend (stuck latch cleared on next pointerdown)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createHandDragClickSuppressor,
  DRAG_THRESHOLD_PX,
} from "../../src/ui/zones/dragClickGuard.js";
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
  const ev = new Event(type, { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

function fireClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function firePointer(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
  y: number,
  extras: Partial<PointerEventInit> = {},
) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: type === "pointermove" ? -1 : 0,
      buttons: type === "pointerup" ? 0 : 1,
      ...extras,
    }),
  );
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

  it("dragstart under threshold is cancelled; click still fires fuse", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    firePointer(el, "pointerdown", 100, 100);
    firePointer(el, "pointermove", 100 + DRAG_THRESHOLD_PX - 1, 100);
    const drag = fireDrag(el, "dragstart");
    expect(drag.defaultPrevented).toBe(true);
    expect(guard.isSuppressing()).toBe(false);

    fireClick(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("dragstart past threshold suppresses the trailing click", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    firePointer(el, "pointerdown", 100, 100);
    firePointer(el, "pointermove", 100 + DRAG_THRESHOLD_PX + 5, 100);
    const drag = fireDrag(el, "dragstart");
    expect(drag.defaultPrevented).toBe(false);
    expect(guard.isSuppressing()).toBe(true);

    fireClick(el);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("dragend clears suppress after a tick", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    firePointer(el, "pointerdown", 100, 100);
    firePointer(el, "pointermove", 100 + DRAG_THRESHOLD_PX + 5, 100);
    fireDrag(el, "dragstart");
    fireDrag(el, "dragend");
    expect(guard.isSuppressing()).toBe(true);

    vi.runAllTimers();
    expect(guard.isSuppressing()).toBe(false);

    fireClick(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("missing dragend: next pointerdown clears the latch so click works", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    firePointer(el, "pointerdown", 100, 100);
    firePointer(el, "pointermove", 100 + DRAG_THRESHOLD_PX + 5, 100);
    fireDrag(el, "dragstart");
    // Intentionally no dragend — latch stuck.
    expect(guard.isSuppressing()).toBe(true);

    fireClick(el);
    expect(onClick).not.toHaveBeenCalled();

    // New gesture recovers.
    firePointer(el, "pointerdown", 120, 120);
    expect(guard.isSuppressing()).toBe(false);
    fireClick(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("aborted drag (dragend, no synthetic click): next click is allowed", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onClick = vi.fn();
    guard.attach(el, onClick);

    firePointer(el, "pointerdown", 100, 100);
    firePointer(el, "pointermove", 100 + DRAG_THRESHOLD_PX + 5, 100);
    fireDrag(el, "dragstart");
    fireDrag(el, "dragend");
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

    firePointer(div, "pointerdown", 50, 50);
    firePointer(div, "pointermove", 50 + DRAG_THRESHOLD_PX + 5, 50);
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

  it("under-threshold jitter then click opens fuse", () => {
    const div = document.createElement("div");
    const vm = minimalHandVm();
    const ctx = minimalHandCtx();
    const state = { activePlayer: "first" } as GameState;

    attachHandlers(div, vm, ctx, state, () => {});

    firePointer(div, "pointerdown", 50, 50);
    firePointer(div, "pointermove", 50 + 3, 50);
    const drag = fireDrag(div, "dragstart");
    expect(drag.defaultPrevented).toBe(true);
    fireClick(div);

    expect(actions.handleFuse).toHaveBeenCalledTimes(1);
  });
});
