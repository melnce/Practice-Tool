/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { animate, motionEnabled, setMotionSpeed } from "../../src/ui/motion/motion.js";

describe("motion guard", () => {
  beforeEach(() => {
    setMotionSpeed("instant");
  });

  afterEach(() => {
    setMotionSpeed("normal");
    vi.restoreAllMocks();
  });

  it("with motion disabled, animate applies final state and never calls WAAPI", () => {
    const waapi = vi.fn();
    Element.prototype.animate = waapi;
    const el = document.createElement("div");
    document.body.appendChild(el);

    expect(motionEnabled()).toBe(false);

    return animate(el, [{ opacity: 1 }, { opacity: 0.25, transform: "scale(0.9)" }], {
      duration: 200,
    }).then(() => {
      expect(waapi).not.toHaveBeenCalled();
      expect(el.style.opacity).toBe("0.25");
      expect(el.style.transform).toBe("scale(0.9)");
    });
  });
});
