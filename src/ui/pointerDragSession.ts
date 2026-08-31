// src/ui/pointerDragSession.ts
/**
 * Shared pointer-drag session: one gesture at a time for mouse + touch.
 * Sources call begin/move/end; drop targets register accept + onDrop handlers.
 * Hit-testing uses elementFromPoint (pointer capture keeps events on the source).
 */

export type DropAccept = (payload: string) => boolean;
export type DropHandler = (
  payload: string,
  clientX: number,
  clientY: number,
) => void;

export interface RegisteredDropTarget {
  element: HTMLElement;
  accepts: DropAccept;
  onDrop: DropHandler;
  /** Optional highlight class while a compatible payload is dragged. */
  highlightClass?: string;
}

export interface DragSourceOptions {
  payload: string;
  /** 'hand' enables fuse-on-release-inside-hand when no drop fires. */
  kind: "hand" | "attacker" | "evo";
  handContainerId?: string;
  onFuseGesture?: (clientX: number, clientY: number) => void;
  isInitiatorStillInHand?: () => boolean;
  /** Card text panel while dragging (hand / board cards). */
  onDragBegan?: () => void;
  onDragEnded?: () => void;
  /** Called once when movement crosses the tap/drag threshold. */
  onThresholdCrossed?: () => void;
}

/** Pixel distance before a press becomes a drag. Never aborts the gesture. */
export const DRAG_THRESHOLD_PX = 8;

const dropTargets = new Set<RegisteredDropTarget>();

/** Suppress trailing click briefly after a threshold-crossing drag (any source). */
let suppressClickUntilMs = 0;

let session: {
  pointerId: number;
  source: HTMLElement;
  options: DragSourceOptions;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
  preview: HTMLElement | null;
  /** Suppress trailing click after any threshold-crossing drag. */
  suppressClick: boolean;
} | null = null;

function pruneDropTargets() {
  for (const t of [...dropTargets]) {
    if (!t.element.isConnected) dropTargets.delete(t);
  }
}

/** Test hook — whether a pointer-drag session is live. */
export function isPointerDragActive(): boolean {
  return session !== null;
}

/** Test hook — whether the current (or last-finished) gesture crossed the drag threshold. */
export function didLastGestureDrag(): boolean {
  return !!session?.dragging || !!session?.suppressClick;
}

export function registerDropTarget(target: RegisteredDropTarget): () => void {
  dropTargets.add(target);
  return () => {
    dropTargets.delete(target);
    target.element.classList.remove(
      target.highlightClass ?? "pointer-drop-highlight",
    );
  };
}

/** Replace any prior registration on the same element. */
export function setDropTarget(
  element: HTMLElement,
  accepts: DropAccept,
  onDrop: DropHandler,
  highlightClass = "pointer-drop-highlight",
): void {
  for (const t of [...dropTargets]) {
    if (t.element === element) dropTargets.delete(t);
  }
  dropTargets.add({ element, accepts, onDrop, highlightClass });
  // Mark for debugging / CSS
  element.dataset.pointerDrop = "1";
}

export function clearDropTarget(element: HTMLElement): void {
  for (const t of [...dropTargets]) {
    if (t.element === element) {
      t.element.classList.remove(t.highlightClass ?? "pointer-drop-highlight");
      dropTargets.delete(t);
    }
  }
  delete element.dataset.pointerDrop;
}

/** Invoke a registered drop handler (unit/invariant tests). */
export function invokeDropOnElement(
  element: HTMLElement,
  payload: string,
  clientX = 0,
  clientY = 0,
): boolean {
  for (const t of dropTargets) {
    if (t.element === element && t.accepts(payload)) {
      t.onDrop(payload, clientX, clientY);
      return true;
    }
  }
  return false;
}

/**
 * True when the pointer is over the hand — including cards that overflow the
 * container box (fan negative margins). Rect tests miss those releases at
 * narrow tablet widths (e.g. 1024×768).
 */
export function isPointerOverHandZone(
  handContainerId: string,
  clientX: number,
  clientY: number,
): boolean {
  const handEl = document.getElementById(handContainerId);
  if (!handEl) return false;
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!hit) return false;
  let node: HTMLElement | null = hit;
  while (node) {
    if (node === handEl) return true;
    node = node.parentElement;
  }
  return false;
}

function clearHighlights(payload: string | null) {
  pruneDropTargets();
  for (const t of dropTargets) {
    const cls = t.highlightClass ?? "pointer-drop-highlight";
    if (payload && t.accepts(payload) && t.element.isConnected) {
      t.element.classList.add(cls);
    } else {
      t.element.classList.remove(cls);
    }
  }
}

function makePreview(source: HTMLElement): HTMLElement {
  const preview = source.cloneNode(true) as HTMLElement;
  preview.classList.add("pointer-drag-preview");
  preview.classList.remove("pointer-drag-source");
  preview.removeAttribute("id");
  delete preview.dataset.pointerDragId;
  preview.style.position = "fixed";
  preview.style.pointerEvents = "none";
  preview.style.zIndex = "10000";
  preview.style.margin = "0";
  preview.style.opacity = "0.92";
  const rect = source.getBoundingClientRect();
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.left = `${rect.left}px`;
  preview.style.top = `${rect.top}px`;
  document.body.appendChild(preview);
  return preview;
}

function movePreview(preview: HTMLElement, clientX: number, clientY: number) {
  const w = preview.offsetWidth;
  const h = preview.offsetHeight;
  preview.style.left = `${clientX - w / 2}px`;
  preview.style.top = `${clientY - h / 2}px`;
}

function findDropTargetAt(
  clientX: number,
  clientY: number,
  payload: string,
  source: HTMLElement,
  preview: HTMLElement | null,
): RegisteredDropTarget | null {
  pruneDropTargets();
  const prevVis = preview?.style.visibility;
  const prevPe = source.style.pointerEvents;
  if (preview) preview.style.visibility = "hidden";
  source.style.pointerEvents = "none";
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  source.style.pointerEvents = prevPe;
  if (preview) preview.style.visibility = prevVis ?? "";

  if (!hit) return null;
  let node: HTMLElement | null = hit;
  while (node) {
    for (const t of dropTargets) {
      if (t.element === node && t.accepts(payload)) return t;
    }
    node = node.parentElement;
  }
  return null;
}

function endSession(cancelled: boolean) {
  if (!session) return;
  const s = session;
  clearHighlights(null);
  if (s.preview) {
    s.preview.remove();
    s.preview = null;
  }
  s.source.classList.remove("pointer-drag-source");
  delete s.source.dataset.pointerDragId;
  try {
    s.source.releasePointerCapture(s.pointerId);
  } catch {
    /* already released */
  }
  if (s.dragging) s.options.onDragEnded?.();

  if (s.suppressClick) {
    // Survive past any sibling pointerup/click in this turn (handler order varies).
    suppressClickUntilMs = performance.now() + 100;
    s.source.dataset.pointerDragSuppressClick = "1";
    setTimeout(() => {
      delete s.source.dataset.pointerDragSuppressClick;
    }, 0);
  }

  session = null;
  void cancelled;
}

function onPointerMove(ev: PointerEvent) {
  if (!session || ev.pointerId !== session.pointerId) return;
  session.lastX = ev.clientX;
  session.lastY = ev.clientY;

  const dx = ev.clientX - session.startX;
  const dy = ev.clientY - session.startY;
  if (!session.dragging) {
    if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    session.dragging = true;
    session.suppressClick = true;
    session.source.classList.add("pointer-drag-source");
    session.preview = makePreview(session.source);
    session.options.onThresholdCrossed?.();
    session.options.onDragBegan?.();
    clearHighlights(session.options.payload);
  }

  if (session.preview) movePreview(session.preview, ev.clientX, ev.clientY);
  // Refresh highlights as pointer moves (targets may scroll — rare here).
  clearHighlights(session.options.payload);
  ev.preventDefault();
}

function onPointerUp(ev: PointerEvent) {
  if (!session || ev.pointerId !== session.pointerId) return;
  const s = session;
  const { clientX, clientY } = ev;

  if (!s.dragging) {
    // Tap — leave click path alone; no suppress.
    endSession(true);
    return;
  }

  const target = findDropTargetAt(
    clientX,
    clientY,
    s.options.payload,
    s.source,
    s.preview,
  );
  if (target) {
    target.onDrop(s.options.payload, clientX, clientY);
    endSession(false);
    return;
  }

  // Hand fuse rule: release inside hand, card still in hand → fuse.
  if (
    s.options.kind === "hand" &&
    s.options.handContainerId &&
    s.options.onFuseGesture &&
    isPointerOverHandZone(s.options.handContainerId, clientX, clientY) &&
    (s.options.isInitiatorStillInHand?.() ?? false)
  ) {
    s.options.onFuseGesture(clientX, clientY);
    endSession(false);
    return;
  }

  // Lost gesture (nowhere) — do nothing.
  endSession(false);
}

function onPointerCancel(ev: PointerEvent) {
  if (!session) return;
  if (ev.pointerId !== session.pointerId) return;
  // Cancel cleanly — no fuse, no drop.
  if (session.dragging) session.suppressClick = true;
  endSession(true);
}

/** Active gesture pointer id, or null. */
export function getActivePointerId(): number | null {
  return session?.pointerId ?? null;
}

/** Force-cancel any active gesture (tests / system interruption). */
export function forceCancelPointerDrag(): void {
  if (!session) return;
  if (session.dragging) session.suppressClick = true;
  endSession(true);
}

export function attachPointerDragSource(
  el: HTMLElement,
  options: DragSourceOptions,
  enabled: boolean,
): void {
  // Tear down prior listeners stored on the element.
  const prev = (el as HTMLElement & { __pointerDragCleanup?: () => void })
    .__pointerDragCleanup;
  if (prev) prev();

  if (!enabled) {
    el.dataset.pointerDraggable = "false";
    el.removeAttribute("draggable");
    return;
  }

  el.dataset.pointerDraggable = "true";
  el.removeAttribute("draggable");

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (session) return;
    delete el.dataset.pointerDragSuppressClick;
    suppressClickUntilMs = 0;
    session = {
      pointerId: ev.pointerId,
      source: el,
      options,
      startX: ev.clientX,
      startY: ev.clientY,
      lastX: ev.clientX,
      lastY: ev.clientY,
      dragging: false,
      preview: null,
      suppressClick: false,
    };
    el.dataset.pointerDragId = String(ev.pointerId);
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      /* capture optional */
    }
  };

  el.addEventListener("pointerdown", onDown);
  // Capture phase so we finish the gesture before click-guard pointerup/click.
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp, true);
  el.addEventListener("pointercancel", onPointerCancel, true);

  (
    el as HTMLElement & { __pointerDragCleanup?: () => void }
  ).__pointerDragCleanup = () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp, true);
    el.removeEventListener("pointercancel", onPointerCancel, true);
  };
}

/** Whether a click should be ignored because a pointer-drag just finished. */
export function shouldSuppressClickFromPointerDrag(el?: HTMLElement): boolean {
  if (el?.dataset.pointerDragSuppressClick === "1") return true;
  return performance.now() < suppressClickUntilMs;
}
