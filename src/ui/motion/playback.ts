// src/ui/motion/playback.ts — exit/entry/pop FX in #arenaFx

import { animate, dur, motionEnabled } from "./motion.js";
import type { MotionPlan, MotionEntry, MotionExit, MotionPop } from "./classifier.js";

const MAX_CORPSES = 12;

function fxLayer(): HTMLElement | null {
  return document.getElementById("arenaFx");
}

function deckAnchor(owner?: string): DOMRect | null {
  const side = owner === "second" ? "enemy" : "ally";
  const plate = document.querySelector(
    `.leader-plate[data-side="${side}"]`,
  ) as HTMLElement | null;
  return plate?.getBoundingClientRect() ?? null;
}

function rectCenter(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function placeAtRect(el: HTMLElement, rect: DOMRect, rootRect: DOMRect): void {
  el.style.position = "absolute";
  el.style.left = `${rect.left - rootRect.left}px`;
  el.style.top = `${rect.top - rootRect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.pointerEvents = "none";
}

export async function playExits(
  plan: MotionPlan,
  prevRects: Map<string, DOMRect>,
  prevElements: Map<string, HTMLElement>,
): Promise<void> {
  const layer = fxLayer();
  if (!layer || !motionEnabled()) return;

  const rootRect = layer.getBoundingClientRect();
  const tasks: Promise<void>[] = [];
  let corpseCount = 0;

  for (const exit of plan.exits) {
    if (corpseCount >= MAX_CORPSES) break;
    const rect = prevRects.get(exit.uid);
    const source = prevElements.get(exit.uid);
    if (!rect || !source) continue;

    const corpse = source.cloneNode(true) as HTMLElement;
    corpse.classList.add("motion-corpse");
    corpse.dataset.motionCorpse = exit.kind;
    corpse.removeAttribute("data-instance-id");
    placeAtRect(corpse, rect, rootRect);
    layer.appendChild(corpse);
    corpseCount++;

    const keyframes = exitKeyframes(exit, rect, rootRect);
    tasks.push(
      animate(corpse, keyframes, {
        duration: dur(exit.kind === "fade" ? 120 : 200),
        easing: "var(--ease-out)",
      }).then(() => corpse.remove()),
    );
  }

  await Promise.all(tasks);
}

function exitKeyframes(
  exit: MotionExit,
  from: DOMRect,
  rootRect: DOMRect,
): Keyframe[] {
  if (exit.kind === "banish") {
    return [
      { opacity: 1, filter: "brightness(1)" },
      { opacity: 0, filter: "brightness(2.5)", transform: "scale(0.6)" },
    ];
  }
  if (exit.kind === "fuse-consume" && exit.initiatorUid) {
    const target = document.querySelector<HTMLElement>(
      `[data-instance-id="${exit.initiatorUid}"]`,
    );
    if (target) {
      const to = target.getBoundingClientRect();
      const fromC = rectCenter(from);
      const toC = rectCenter(to);
      const dx = toC.x - fromC.x;
      const dy = toC.y - fromC.y;
      return [
        { opacity: 1, transform: "translate(0, 0) scale(1)" },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.35)` },
      ];
    }
  }
  if (exit.kind === "return-deck") {
    const deck = deckAnchor();
    if (deck) {
      const fromC = rectCenter(from);
      const toC = rectCenter(deck);
      const dx = toC.x - fromC.x;
      const dy = toC.y - fromC.y;
      return [
        { opacity: 1, transform: "translate(0, 0) scale(1)" },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.25)` },
      ];
    }
  }
  if (exit.kind === "fade") {
    return [{ opacity: 1 }, { opacity: 0 }];
  }
  return [
    { opacity: 1, transform: "scale(1)" },
    { opacity: 0, transform: "scale(0.85)", filter: "brightness(0.6)" },
  ];
}

export async function playEntries(
  plan: MotionPlan,
  root: ParentNode,
  prevRects: Map<string, DOMRect>,
): Promise<void> {
  if (!motionEnabled()) return;
  const tasks: Promise<void>[] = [];

  for (const entry of plan.entries) {
    const el = root.querySelector<HTMLElement>(`[data-instance-id="${entry.uid}"]`);
    if (!el) continue;
    tasks.push(entryAnimation(entry, el, prevRects, root));
  }

  await Promise.all(tasks);
}

async function entryAnimation(
  entry: MotionEntry,
  el: HTMLElement,
  prevRects: Map<string, DOMRect>,
  root: ParentNode,
): Promise<void> {
  if (entry.kind === "draw") {
    const deck = deckAnchor(entry.owner);
    const to = el.getBoundingClientRect();
    if (deck) {
      const fromC = rectCenter(deck);
      const toC = rectCenter(to);
      const dx = fromC.x - toC.x;
      const dy = fromC.y - toC.y;
      return animate(
        el,
        [
          { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.5)` },
          { opacity: 1, transform: "translate(0, 0) scale(1)" },
        ],
        { duration: dur(320), easing: "var(--ease-spring)" },
      ).then(() => {
        el.style.transform = "";
        el.style.opacity = "";
      });
    }
  }

  if (entry.kind === "bounce" && entry.fromUid) {
    const fromRect = prevRects.get(entry.fromUid);
    const to = el.getBoundingClientRect();
    if (fromRect) {
      const fromC = rectCenter(fromRect);
      const toC = rectCenter(to);
      const dx = fromC.x - toC.x;
      const dy = fromC.y - toC.y;
      return animate(
        el,
        [
          { opacity: 0.6, transform: `translate(${dx}px, ${dy}px) scale(0.9)` },
          { opacity: 1, transform: "translate(0, 0) scale(1)" },
        ],
        { duration: dur(320), easing: "var(--ease-spring)" },
      ).then(() => {
        el.style.transform = "";
        el.style.opacity = "";
      });
    }
  }

  if (entry.kind === "summon") {
    return animate(
      el,
      [
        { opacity: 0, transform: "scale(0.55)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: dur(200), easing: "var(--ease-spring)" },
    ).then(() => {
      el.style.transform = "";
      el.style.opacity = "";
    });
  }

  return animate(
    el,
    [
      { opacity: 0, transform: "scale(0.92)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    { duration: dur(200), easing: "var(--ease-out)" },
  ).then(() => {
    el.style.transform = "";
    el.style.opacity = "";
  });
}

export async function playPops(plan: MotionPlan, root: ParentNode): Promise<void> {
  const layer = fxLayer();
  if (!layer || !motionEnabled()) return;

  const layerRect = layer.getBoundingClientRect();
  const tasks: Promise<void>[] = [];

  for (const pop of plan.pops) {
    const anchor = popAnchor(pop, root);
    if (!anchor) continue;

    if (pop.kind === "barrier-ring") {
      tasks.push(playBarrierRing(layer, layerRect, anchor));
      continue;
    }

    const el = document.createElement("div");
    el.className = `motion-pop motion-pop--${pop.kind}`;
    el.textContent = pop.kind === "heal" ? `+${pop.amount}` : `-${pop.amount}`;
    const c = rectCenter(anchor);
    el.style.left = `${c.x - layerRect.left}px`;
    el.style.top = `${c.y - layerRect.top}px`;
    layer.appendChild(el);

    tasks.push(
      animate(
        el,
        [
          { opacity: 0, transform: "translate(-50%, 0) scale(0.6)" },
          { opacity: 1, transform: "translate(-50%, -18px) scale(1)" },
          { opacity: 0, transform: "translate(-50%, -36px) scale(0.9)" },
        ],
        { duration: dur(650), easing: "var(--ease-out)" },
      ).then(() => el.remove()),
    );
  }

  await Promise.all(tasks);
}

function popAnchor(pop: MotionPop, root: ParentNode): DOMRect | null {
  if (pop.uid) {
    const el = root.querySelector<HTMLElement>(`[data-instance-id="${pop.uid}"]`);
    return el?.getBoundingClientRect() ?? null;
  }
  if (pop.player) {
    const side = pop.player === "second" ? "enemy" : "ally";
    const hp = document.querySelector(
      `.leader-plate[data-side="${side}"] .leader-defense`,
    ) as HTMLElement | null;
    return hp?.getBoundingClientRect() ?? null;
  }
  return null;
}

async function playBarrierRing(
  layer: HTMLElement,
  layerRect: DOMRect,
  anchor: DOMRect,
): Promise<void> {
  const ring = document.createElement("div");
  ring.className = "motion-barrier-ring";
  const c = rectCenter(anchor);
  ring.style.left = `${c.x - layerRect.left}px`;
  ring.style.top = `${c.y - layerRect.top}px`;
  layer.appendChild(ring);

  await animate(
    ring,
    [
      { opacity: 0.9, transform: "translate(-50%, -50%) scale(0.6)" },
      { opacity: 0, transform: "translate(-50%, -50%) scale(1.8)" },
    ],
    { duration: dur(320), easing: "var(--ease-out)" },
  );
  ring.remove();
}

export async function runMotionPlan(
  plan: MotionPlan,
  prevRects: Map<string, DOMRect>,
  prevElements: Map<string, HTMLElement>,
  root: ParentNode,
): Promise<void> {
  await playExits(plan, prevRects, prevElements);
  const { playMoves } = await import("./flip.js");
  await playMoves(prevRects, root);
  await playEntries(plan, root, prevRects);
  await playPops(plan, root);
}
