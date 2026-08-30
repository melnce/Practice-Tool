/**
 * @vitest-environment jsdom
 *
 * Hand-card fuse vs drag: zone rule (never cancel dragstart; release inside
 * hand → fuse; release outside → drag/play). Suppress trailing click after
 * drag so one gesture cannot fuse twice.
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

const HAND_ID = "blueHand";

function mountHandContainer(
  rect: { left: number; top: number; right: number; bottom: number } = {
    left: 0,
    top: 0,
    right: 400,
    bottom: 200,
  },
) {
  const hand = document.createElement("div");
  hand.id = HAND_ID;
  hand.getBoundingClientRect = () =>
    ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return rect;
      },
    }) as DOMRect;
  document.body.appendChild(hand);
  return hand;
}

function fireDragStart(el: HTMLElement) {
  const ev = new Event("dragstart", { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

function fireDragEnd(el: HTMLElement, clientX: number, clientY: number) {
  // jsdom lacks DragEvent; Event + client coords is enough for our hit-test.
  const ev = new Event("dragend", { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
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

describe("HandDragClickSuppressor zone rule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    mountHandContainer();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("never cancels dragstart when no pointermove precedes it", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });

    firePointer(el, "pointerdown", 100, 100);
    // No pointermove — the hardware ordering that broke the threshold guard.
    const drag = fireDragStart(el);
    expect(drag.defaultPrevented).toBe(false);
    expect(guard.isSuppressing()).toBe(true);
  });

  it("dragend inside hand with card still in hand opens fuse", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });

    firePointer(el, "pointerdown", 50, 50);
    fireDragStart(el);
    fireDragEnd(el, 80, 80); // inside hand rect
    expect(onFuse).toHaveBeenCalledTimes(1);
  });

  it("dragend outside hand does not open fuse", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });

    firePointer(el, "pointerdown", 50, 50);
    fireDragStart(el);
    fireDragEnd(el, 500, 500); // outside hand
    expect(onFuse).not.toHaveBeenCalled();
  });

  it("dragend at 0,0 (lost gesture) does not open fuse", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    // Hand does not contain the origin.
    document.body.innerHTML = "";
    mountHandContainer({ left: 100, top: 100, right: 500, bottom: 300 });

    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });

    firePointer(el, "pointerdown", 150, 150);
    fireDragStart(el);
    fireDragEnd(el, 0, 0);
    expect(onFuse).not.toHaveBeenCalled();
  });

  it("dragend inside hand but card already consumed does not open fuse", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => false,
    });

    firePointer(el, "pointerdown", 50, 50);
    fireDragStart(el);
    fireDragEnd(el, 80, 80);
    expect(onFuse).not.toHaveBeenCalled();
  });

  it("trailing click after dragstart is suppressed (one gesture, one action)", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });

    firePointer(el, "pointerdown", 50, 50);
    fireDragStart(el);
    fireDragEnd(el, 80, 80); // fuse via dragend
    fireClick(el); // must not double-fire
    expect(onFuse).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
  });

  it("plain click with no drag opens fuse", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });

    firePointer(el, "pointerdown", 50, 50);
    fireClick(el);
    expect(onFuse).toHaveBeenCalledTimes(1);
  });

  it("missing dragend: next pointerdown clears the latch so click works", () => {
    const guard = createHandDragClickSuppressor();
    const el = document.createElement("div");
    const onFuse = vi.fn();
    guard.attach(el, onFuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });

    firePointer(el, "pointerdown", 100, 100);
    fireDragStart(el);
    // Intentionally no dragend — latch stuck.
    expect(guard.isSuppressing()).toBe(true);
    fireClick(el);
    expect(onFuse).not.toHaveBeenCalled();

    firePointer(el, "pointerdown", 120, 120);
    expect(guard.isSuppressing()).toBe(false);
    fireClick(el);
    expect(onFuse).toHaveBeenCalledTimes(1);
  });
});

describe("attachHandlers hand fuse + zone drag guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(actions.handleFuse).mockClear();
    document.body.innerHTML = "";
    mountHandContainer();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("release inside hand after dragstart opens fuse via handlers", () => {
    const div = document.createElement("div");
    const vm = minimalHandVm();
    const ctx = minimalHandCtx();
    const state = {
      activePlayer: "first",
      players: {
        first: { hand: [{ uid: "gear_uid" }] },
        second: { hand: [] },
      },
    } as unknown as GameState;

    attachHandlers(div, vm, ctx, state, () => {});

    firePointer(div, "pointerdown", 50, 50);
    const drag = fireDragStart(div);
    expect(drag.defaultPrevented).toBe(false);
    fireDragEnd(div, 80, 80);

    expect(actions.handleFuse).toHaveBeenCalledTimes(1);
    expect(actions.handleFuse).toHaveBeenCalledWith(
      "first",
      "gear_uid",
      true,
      vm.card,
    );
  });

  it("plain click opens fuse", () => {
    const div = document.createElement("div");
    const vm = minimalHandVm();
    const ctx = minimalHandCtx();
    const state = {
      activePlayer: "first",
      players: {
        first: { hand: [{ uid: "gear_uid" }] },
        second: { hand: [] },
      },
    } as unknown as GameState;

    attachHandlers(div, vm, ctx, state, () => {});

    firePointer(div, "pointerdown", 50, 50);
    fireClick(div);

    expect(actions.handleFuse).toHaveBeenCalledTimes(1);
  });
});
