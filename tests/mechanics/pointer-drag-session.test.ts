/**
 * @vitest-environment jsdom
 *
 * Pointer-drag session: threshold, drop hit-test, hand fuse zone rule,
 * pointercancel cleanup. No HTML5 DnD.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  attachPointerDragSource,
  setDropTarget,
  clearDropTarget,
  DRAG_THRESHOLD_PX,
  isPointerDragActive,
  getActivePointerId,
  forceCancelPointerDrag,
  shouldSuppressClickFromPointerDrag,
} from "../../src/ui/pointerDragSession.js";

function fire(
  el: HTMLElement,
  type: string,
  x: number,
  y: number,
  opts: Partial<PointerEventInit> = {},
) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "touch",
      button: type === "pointermove" ? -1 : 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
      ...opts,
    }),
  );
}

describe("pointerDragSession", () => {
  let source: HTMLElement;
  let board: HTMLElement;
  let hand: HTMLElement;

  beforeEach(() => {
    forceCancelPointerDrag();
    document.body.innerHTML = "";
    hand = document.createElement("div");
    hand.id = "blueHand";
    hand.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 200,
        width: 400,
        height: 200,
        x: 0,
        y: 0,
        toJSON() {},
      }) as DOMRect;
    board = document.createElement("div");
    board.id = "blueBoard";
    board.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 300,
        right: 500,
        bottom: 500,
        width: 400,
        height: 200,
        x: 100,
        y: 300,
        toJSON() {},
      }) as DOMRect;
    source = document.createElement("div");
    source.className = "card";
    document.body.append(hand, board, source);
    hand.appendChild(source);

    // elementFromPoint stub — jsdom lacks this property.
    // Hand cards may sit outside the container rect (fan overflow).
    document.elementFromPoint = (x: number, y: number) => {
      if (y >= 300) return board;
      // Overflowed card hit (left of hand container box 0..400).
      if (x >= -50 && x < 0 && y >= 0 && y < 200) return source;
      if (y >= 0 && y < 200 && x >= 0 && x <= 400) return source;
      return document.body;
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("isPointerOverHandZone is true over an overflowed hand card outside the container rect", async () => {
    const { isPointerOverHandZone } =
      await import("../../src/ui/pointerDragSession.js");
    // Container box: 0..400. Point (-20, 50) is outside the rect but hits `source`
    // (a child of #blueHand) via the elementFromPoint stub — the 1024×768 fan case.
    const handRect = hand.getBoundingClientRect();
    expect(-20 < handRect.left || -20 > handRect.right).toBe(true);
    expect(isPointerOverHandZone("blueHand", -20, 50)).toBe(true);
    expect(isPointerOverHandZone("blueHand", 500, 100)).toBe(false);
  });

  it("release on overflowed hand card (outside container rect) opens fuse", () => {
    const onDrop = vi.fn();
    const onFuse = vi.fn();
    setDropTarget(board, () => true, onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onFuseGesture: onFuse,
        isInitiatorStillInHand: () => true,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 80, 80);
    // Outside #blueHand rect, but elementFromPoint returns the hand card.
    fire(source, "pointerup", -20, 50);
    expect(onFuse).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("tap below threshold does not start drag or call drop", () => {
    const onDrop = vi.fn();
    const onBegan = vi.fn();
    setDropTarget(board, () => true, onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onDragBegan: onBegan,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 50 + DRAG_THRESHOLD_PX - 1, 50);
    fire(source, "pointerup", 50 + DRAG_THRESHOLD_PX - 1, 50);
    expect(onBegan).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(isPointerDragActive()).toBe(false);
  });

  it("drag past threshold onto drop target fires onDrop", () => {
    const onDrop = vi.fn();
    setDropTarget(board, (p) => p.startsWith("hand,"), onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 50, 50 + DRAG_THRESHOLD_PX + 2);
    fire(source, "pointermove", 200, 400);
    fire(source, "pointerup", 200, 400);
    expect(onDrop).toHaveBeenCalledWith("hand,blueHand,u1", 200, 400);
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();
    expect(isPointerDragActive()).toBe(false);
  });

  it("release inside hand after drag opens fuse, not drop", () => {
    const onDrop = vi.fn();
    const onFuse = vi.fn();
    setDropTarget(board, () => true, onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onFuseGesture: onFuse,
        isInitiatorStillInHand: () => true,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 80, 80);
    fire(source, "pointerup", 100, 100); // still inside hand rect
    expect(onFuse).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("release at 0,0 (lost gesture) does nothing", () => {
    const onDrop = vi.fn();
    const onFuse = vi.fn();
    setDropTarget(board, () => true, onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onFuseGesture: onFuse,
        isInitiatorStillInHand: () => true,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 80, 80);
    // Outside every zone (hand is 0..400 x 0..200; board hit-test at y>=300).
    fire(source, "pointerup", 500, 100);
    expect(onFuse).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("pointercancel leaves no stuck session or preview", () => {
    const onDrop = vi.fn();
    const onFuse = vi.fn();
    const onEnded = vi.fn();
    setDropTarget(board, () => true, onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onFuseGesture: onFuse,
        isInitiatorStillInHand: () => true,
        onDragEnded: onEnded,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 80, 80);
    expect(document.querySelector(".pointer-drag-preview")).toBeTruthy();
    fire(source, "pointercancel", 80, 80);
    expect(isPointerDragActive()).toBe(false);
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();
    expect(onDrop).not.toHaveBeenCalled();
    expect(onFuse).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalled();
    expect(shouldSuppressClickFromPointerDrag(source)).toBe(true);
  });

  it("disabled source does not attach drag", () => {
    const onBegan = vi.fn();
    attachPointerDragSource(
      source,
      { payload: "x", kind: "hand", onDragBegan: onBegan },
      false,
    );
    expect(source.dataset.pointerDraggable).toBe("false");
    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 100, 100);
    expect(onBegan).not.toHaveBeenCalled();
  });

  it("re-render mid-gesture: pointerup on non-source ends session and next drag works", () => {
    const onDrop = vi.fn();
    setDropTarget(board, (p) => p.startsWith("hand,"), onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
      },
      true,
    );

    fire(source, "pointerdown", 50, 50, { pointerId: 1 });
    fire(source, "pointermove", 50, 50 + DRAG_THRESHOLD_PX + 2, {
      pointerId: 1,
    });

    const replacement = document.createElement("div");
    replacement.className = "card";
    hand.replaceChild(replacement, source);

    // Release lands on board — no drag listeners on this element (repro path).
    fire(board, "pointerup", 200, 400, { pointerId: 1 });
    expect(isPointerDragActive()).toBe(false);
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();

    attachPointerDragSource(
      replacement,
      {
        payload: "hand,blueHand,u2",
        kind: "hand",
        handContainerId: "blueHand",
      },
      true,
    );
    fire(replacement, "pointerdown", 60, 60, { pointerId: 2 });
    fire(replacement, "pointermove", 60, 60 + DRAG_THRESHOLD_PX + 2, {
      pointerId: 2,
    });
    fire(replacement, "pointermove", 200, 400, { pointerId: 2 });
    fire(replacement, "pointerup", 200, 400, { pointerId: 2 });
    expect(onDrop).toHaveBeenCalledWith("hand,blueHand,u2", 200, 400);
  });

  it("re-render mid-gesture past threshold cancels without drop or fuse", () => {
    const onDrop = vi.fn();
    const onFuse = vi.fn();
    const onEnded = vi.fn();
    setDropTarget(board, () => true, onDrop);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onFuseGesture: onFuse,
        isInitiatorStillInHand: () => true,
        onDragEnded: onEnded,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 80, 80);
    expect(document.querySelector(".pointer-drag-preview")).toBeTruthy();

    const replacement = document.createElement("div");
    replacement.className = "card";
    hand.replaceChild(replacement, source);

    fire(board, "pointerup", 200, 400);
    expect(isPointerDragActive()).toBe(false);
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onFuse).not.toHaveBeenCalled();
  });

  it("lostpointercapture on detached source ends session; connected source is no-op", () => {
    const onEnded = vi.fn();
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onDragEnded: onEnded,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 80, 80);
    expect(isPointerDragActive()).toBe(true);

    const detached = source;
    const replacement = document.createElement("div");
    replacement.className = "card";
    hand.replaceChild(replacement, detached);

    detached.dispatchEvent(
      new PointerEvent("lostpointercapture", {
        bubbles: false,
        cancelable: false,
        pointerId: 1,
      }),
    );
    expect(isPointerDragActive()).toBe(false);
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();
    expect(onEnded).toHaveBeenCalledTimes(1);

    // Normal post-up lostpointercapture on a still-connected source must not strand.
    attachPointerDragSource(
      replacement,
      {
        payload: "hand,blueHand,u2",
        kind: "hand",
        handContainerId: "blueHand",
      },
      true,
    );
    fire(replacement, "pointerdown", 50, 50, { pointerId: 2 });
    fire(replacement, "pointermove", 80, 80, { pointerId: 2 });
    fire(replacement, "pointerup", 80, 80, { pointerId: 2 });
    expect(isPointerDragActive()).toBe(false);
    replacement.dispatchEvent(
      new PointerEvent("lostpointercapture", {
        bubbles: false,
        cancelable: false,
        pointerId: 2,
      }),
    );
    expect(isPointerDragActive()).toBe(false);
  });

  it("self-heal: stale session with disconnected source does not block new press", () => {
    const onBegan = vi.fn();
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onDragBegan: onBegan,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    const replacement = document.createElement("div");
    replacement.className = "card";
    hand.replaceChild(replacement, source);
    expect(isPointerDragActive()).toBe(true);
    expect(getActivePointerId()).toBe(1);

    attachPointerDragSource(
      replacement,
      {
        payload: "hand,blueHand,u2",
        kind: "hand",
        handContainerId: "blueHand",
        onDragBegan: onBegan,
      },
      true,
    );
    fire(replacement, "pointerdown", 60, 60, { pointerId: 2 });
    fire(replacement, "pointermove", 80, 80, { pointerId: 2 });
    expect(onBegan).toHaveBeenCalledTimes(1);
    expect(isPointerDragActive()).toBe(true);
    expect(getActivePointerId()).toBe(2);
  });

  it("visibilitychange hidden cancels an active gesture", () => {
    const onEnded = vi.fn();
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
        onDragEnded: onEnded,
      },
      true,
    );

    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 80, 80);
    expect(isPointerDragActive()).toBe(true);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    expect(isPointerDragActive()).toBe(false);
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();
    expect(onEnded).toHaveBeenCalledTimes(1);
    forceCancelPointerDrag(); // idempotent
    expect(isPointerDragActive()).toBe(false);
  });

  it("clearDropTarget removes registration", () => {
    const onDrop = vi.fn();
    setDropTarget(board, () => true, onDrop);
    clearDropTarget(board);
    attachPointerDragSource(
      source,
      {
        payload: "hand,blueHand,u1",
        kind: "hand",
        handContainerId: "blueHand",
      },
      true,
    );
    fire(source, "pointerdown", 50, 50);
    fire(source, "pointermove", 200, 400);
    fire(source, "pointerup", 200, 400);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
