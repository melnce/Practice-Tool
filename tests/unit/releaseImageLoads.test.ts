/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { releaseImageLoads } from "../../src/ui/releaseImageLoads.js";

describe("releaseImageLoads", () => {
  it("clears src and drops onload/onerror on descendant images", () => {
    const root = document.createElement("div");
    root.className = "card";
    const img = document.createElement("img");
    img.src = "https://static.dotgg.gg/shadowverse/cards/10001110.webp";
    let errorCalls = 0;
    img.onerror = () => {
      errorCalls += 1;
    };
    img.onload = () => {};
    root.appendChild(img);

    releaseImageLoads(root);

    // jsdom keeps src="" after assignment; Chromium drops the pending loader either way.
    expect(
      img.getAttribute("src") === null || img.getAttribute("src") === "",
    ).toBe(true);
    expect(img.onerror).toBeNull();
    expect(img.onload).toBeNull();
    expect(errorCalls).toBe(0);
  });

  it("accepts a lone HTMLImageElement", () => {
    const img = document.createElement("img");
    img.src = "https://example.test/a.webp";
    img.onerror = () => {};
    releaseImageLoads(img);
    expect(img.onerror).toBeNull();
    expect(
      img.getAttribute("src") === null || img.getAttribute("src") === "",
    ).toBe(true);
  });

  it("is a no-op on null / non-element nodes", () => {
    expect(() => releaseImageLoads(null)).not.toThrow();
    expect(() => releaseImageLoads(document.createTextNode("x"))).not.toThrow();
  });
});
