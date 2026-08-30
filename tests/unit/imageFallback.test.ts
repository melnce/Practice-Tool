import { describe, expect, it } from "vitest";
import {
  attachCardImageFallback,
  cardIdFromImageUrl,
  detachImageLoadHandlers,
} from "../../src/ui/imageFallback.js";

type TestImg = HTMLImageElement & {
  _src?: string;
};

function makeImg(): TestImg {
  const img = {
    _src: "",
    dataset: {} as DOMStringMap,
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    get src() {
      return this._src ?? "";
    },
    set src(v: string) {
      this._src = v;
    },
  };
  return img as TestImg;
}

describe("imageFallback", () => {
  it("parses card id from dotgg URLs", () => {
    expect(
      cardIdFromImageUrl(
        "https://static.dotgg.gg/shadowverse/cards/10901110.webp",
      ),
    ).toBe("10901110");
  });

  it("skips onerror when primary equals CDN fallback (connection-fail safe)", () => {
    const img = makeImg();
    const url = "https://static.dotgg.gg/shadowverse/cards/10901110.webp";
    attachCardImageFallback(img, url, "10901110");
    expect(img.src).toBe(url);
    expect(img.onerror).toBeNull();
  });

  it("clears onerror after fallback is exhausted", () => {
    const img = makeImg();
    attachCardImageFallback(
      img,
      "https://example.test/primary.webp",
      "10901110",
    );
    expect(img.onerror).toBeTypeOf("function");
    img.dataset.fallbackApplied = "1";
    img.onerror?.(new Event("error") as Event);
    expect(img.onerror).toBeNull();
    expect(img.onload).toBeNull();
  });

  it("detachImageLoadHandlers nulls handlers", () => {
    const img = makeImg();
    img.onerror = () => {};
    img.onload = () => {};
    detachImageLoadHandlers(img);
    expect(img.onerror).toBeNull();
    expect(img.onload).toBeNull();
  });
});
