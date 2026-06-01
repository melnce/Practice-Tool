import { describe, it, expect, afterEach } from "vitest";
import {
  isDev,
  isHistoryDisabled,
  isUidEnrichDisabled,
  readEnv,
  setNodeEnv,
} from "../../src/core/env.js";

describe("env (cross-runtime)", () => {
  let savedProcess: typeof globalThis.process | undefined;

  afterEach(() => {
    if (savedProcess !== undefined) {
      globalThis.process = savedProcess;
      savedProcess = undefined;
    }
  });

  it("env helpers work when process is undefined (browser-like)", () => {
    savedProcess = globalThis.process;
    Reflect.deleteProperty(globalThis, "process");

    expect(() => isUidEnrichDisabled()).not.toThrow();
    expect(() => isHistoryDisabled()).not.toThrow();
    expect(() => isDev()).not.toThrow();
    expect(() => readEnv("DISABLE_UID_ENRICH")).not.toThrow();

    expect(isUidEnrichDisabled()).toBe(false);
    expect(isHistoryDisabled()).toBe(false);
  });

  it("reads DISABLE_UID_ENRICH from process when present", () => {
    setNodeEnv("DISABLE_UID_ENRICH", "1");
    expect(isUidEnrichDisabled()).toBe(true);
    setNodeEnv("DISABLE_UID_ENRICH", undefined);
  });
});
