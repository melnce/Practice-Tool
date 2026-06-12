// src/ui/motion/wrapRender.ts — motion pipeline around adapter.render()

import { getLogs } from "../../core/logger.js";
import { captureRects, captureElements } from "./flip.js";
import { classify, drainLog } from "./classifier.js";
import { motionEnabled } from "./motion.js";
import { runMotionPlan } from "./playback.js";

let logCursor = 0;

function motionRoot(): ParentNode {
  return document.getElementById("arena") ?? document.getElementById("appRoot") ?? document.body;
}

export function wrapRender(realRender: () => void): () => void {
  return () => {
    const root = motionRoot();
    const prevRects = captureRects(root);
    const prevElements = captureElements(root);
    const prevUids = new Set(prevRects.keys());

    realRender();

    const { events, newCursor, gap } = drainLog(logCursor, getLogs);
    logCursor = newCursor;

    if (gap || !motionEnabled()) {
      return;
    }

    const nextUids = new Set(captureRects(root).keys());
    const plan = classify(events, prevUids, nextUids);

    void runMotionPlan(plan, prevRects, prevElements, root);
  };
}

export function resetMotionCursor(): void {
  logCursor = 0;
}
