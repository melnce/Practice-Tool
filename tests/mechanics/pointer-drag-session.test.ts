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

    // elementFromPoint stub — jsdom lacks this property
    document.elementFromPoint = (x: number, y: number) => {
      if (y >= 300) return board;
      if (y >= 0 && y < 200 && x >= 0 && x <= 400) return hand;
      return document.body;
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
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
