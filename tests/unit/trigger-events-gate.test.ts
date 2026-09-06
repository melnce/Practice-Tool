import { describe, it, expect } from "vitest";
import { TRIGGER_EVENT_NAMES } from "../../src/logic/core/triggers/types.js";

function checkTriggerEvent(event: string): string | null {
  const CREST_TYPE_ALIASES = new Set(["end_of_turn_own", "start_of_turn_own"]);
  if (CREST_TYPE_ALIASES.has(event)) return null;
  if (!TRIGGER_EVENT_NAMES.has(event as any)) {
    return `unknown trigger event "${event}"`;
  }
  return null;
}

describe("trigger event validation", () => {
  it("flags an unknown trigger event name", () => {
    expect(checkTriggerEvent("ally_follower_exits_field")).toMatch(
      /unknown trigger event/i,
    );
  });

  it("accepts a known trigger event name", () => {
    expect(checkTriggerEvent("ally_follower_enter")).toBeNull();
  });
});
