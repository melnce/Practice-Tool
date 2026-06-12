// src/ui/motion/flip.ts — FLIP capture and playback

import { animate, dur, motionEnabled } from "./motion.js";

export interface FlipTransform {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
}

export function captureRects(root: ParentNode): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  const nodes = root.querySelectorAll<HTMLElement>("[data-instance-id]");
  nodes.forEach((el) => {
    const id = el.dataset.instanceId;
    if (!id) return;
    map.set(id, el.getBoundingClientRect());
  });
  return map;
}

export function captureElements(root: ParentNode): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>("[data-instance-id]").forEach((el) => {
    const id = el.dataset.instanceId;
    if (id) map.set(id, el);
  });
  return map;
}

export function computeInvertTransform(from: DOMRect, to: DOMRect): FlipTransform {
  if (from.width === 0 || from.height === 0 || to.width === 0 || to.height === 0) {
    return { dx: 0, dy: 0, sx: 1, sy: 1 };
  }

  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;

  return { dx, dy, sx, sy };
}

function applyInvert(el: HTMLElement, t: FlipTransform): void {
  el.style.transform = `translate(${t.dx}px, ${t.dy}px) scale(${t.sx}, ${t.sy})`;
}

export async function playMoves(
  prevRects: Map<string, DOMRect>,
  root: ParentNode,
): Promise<void> {
  if (!motionEnabled()) return;

  const tasks: Promise<void>[] = [];
  const current = captureRects(root);

  for (const [uid, prev] of prevRects) {
    const next = current.get(uid);
    if (!next) continue;

    const t = computeInvertTransform(prev, next);
    if (t.dx === 0 && t.dy === 0 && t.sx === 1 && t.sy === 1) continue;

    const el = root.querySelector<HTMLElement>(`[data-instance-id="${uid}"]`);
    if (!el) continue;

    applyInvert(el, t);
    tasks.push(
      animate(
        el,
        [
          { transform: el.style.transform },
          { transform: "translate(0, 0) scale(1, 1)" },
        ],
        {
          duration: dur(200),
          easing: "var(--ease-spring)",
        },
      ).then(() => {
        el.style.transform = "";
      }),
    );
  }

  await Promise.all(tasks);
}
