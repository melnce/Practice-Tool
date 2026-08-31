/**
 * @vitest-environment jsdom
 *
 * Hand-card fuse vs pointer-drag: click path + suppress after drag.
 * Release-inside-hand → fuse is owned by the pointer drag session (see
 * pointer-drag-session.test.ts).
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
import * as drag from "../../src/ui/drag.js";

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
      uid: "u1",
      name: "Sephie",
      type: "Follower",
      fuse_recipes: [{ materials: [] }],
      description: "Fuse: Cards",
      ...(overrides.card as object),
    } as any,
    idx: 0,
    isSelectable: false,
    isSelected: false,
    canAttack: false,
    canEngage: false,
    ...overrides,
  };
}

function handCtx(overrides: Partial<ZoneContext> = {}): ZoneContext {
  return {
    containerId: HAND_ID,
    owner: "first",
    isHand: true,
    isBoard: false,
    isMyHand: true,
    isMyBoard: false,
    isBlueHand: true,
    isMulligan: false,
    hideHandFaces: false,
    ...overrides,
  } as ZoneContext;
}

describe("createHandDragClickSuppressor (pointer era)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mountHandContainer();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("plain click with no drag opens fuse", () => {
    const el = document.createElement("div");
    document.getElementById(HAND_ID)!.appendChild(el);
    const fuse = vi.fn();
    const guard = createHandDragClickSuppressor();
    guard.attach(el, fuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });
    firePointer(el, "pointerdown", 50, 50);
    fireClick(el);
    expect(fuse).toHaveBeenCalledTimes(1);
  });

  it("click suppressed when pointer-drag layer marks the element", () => {
    const el = document.createElement("div");
    document.getElementById(HAND_ID)!.appendChild(el);
    const fuse = vi.fn();
    const guard = createHandDragClickSuppressor();
    guard.attach(el, fuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });
    firePointer(el, "pointerdown", 50, 50);
    el.dataset.pointerDragSuppressClick = "1";
    fireClick(el);
    expect(fuse).toHaveBeenCalledTimes(0);
  });

  it("missing end: next pointerdown clears latch so click works", () => {
    const el = document.createElement("div");
    document.getElementById(HAND_ID)!.appendChild(el);
    const fuse = vi.fn();
    const guard = createHandDragClickSuppressor();
    guard.attach(el, fuse, {
      handContainerId: HAND_ID,
      isInitiatorStillInHand: () => true,
    });
    firePointer(el, "pointerdown", 100, 100);
    el.dataset.pointerDragSuppressClick = "1";
    // New press clears.
    firePointer(el, "pointerdown", 120, 120);
    fireClick(el);
    expect(fuse).toHaveBeenCalledTimes(1);
  });
});

describe("attachHandlers hand fuse wiring", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mountHandContainer();
    vi.mocked(actions.handleFuse).mockClear();
    vi.mocked(drag.enableCardDragFromHand).mockClear();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("wires enableCardDragFromHand with fuse gesture callback", () => {
    const div = document.createElement("div");
    document.getElementById(HAND_ID)!.appendChild(div);
    const vm = minimalHandVm();
    const state = {
      phase: "main",
      activePlayer: "first",
      players: { first: { hand: [vm.card] }, second: { hand: [] } },
    } as unknown as GameState;

    attachHandlers(div, vm, handCtx(), state, () => {});

    expect(drag.enableCardDragFromHand).toHaveBeenCalled();
    const args = vi.mocked(drag.enableCardDragFromHand).mock.calls[0]!;
    expect(args[3]).toBe(true);
    expect(args[4]).toMatchObject({
      onFuseGesture: expect.any(Function),
      isInitiatorStillInHand: expect.any(Function),
    });
  });

  it("plain click opens fuse via handlers", () => {
    const div = document.createElement("div");
    document.getElementById(HAND_ID)!.appendChild(div);
    const vm = minimalHandVm();
    const state = {
      phase: "main",
      activePlayer: "first",
      players: { first: { hand: [vm.card] }, second: { hand: [] } },
    } as unknown as GameState;

    attachHandlers(div, vm, handCtx(), state, () => {});
    firePointer(div, "pointerdown", 50, 50);
    fireClick(div);
    expect(actions.handleFuse).toHaveBeenCalled();
  });
});
