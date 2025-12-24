import { describe, it, expect, beforeEach } from "vitest";
import {
  startRecordingTimeline,
  stopRecordingTimeline,
  clearTimeline,
  recordEvent,
  getTimeline,
} from "../../src/core/debugTimeline";

describe("Debug Timeline", () => {
  beforeEach(() => {
    stopRecordingTimeline();
    clearTimeline();
  });

  it("does not record when disabled", () => {
    recordEvent({ type: "test" });
    expect(getTimeline()).toHaveLength(0);
  });

  it("records events when enabled", () => {
    startRecordingTimeline();
    recordEvent({ type: "event1", payload: { a: 1 } });
    recordEvent({ type: "event2" });

    const timeline = getTimeline();
    expect(timeline).toHaveLength(2);
    expect(timeline[0].type).toBe("event1");
    expect((timeline[0].payload as any).a).toBe(1);
    expect(timeline[1].type).toBe("event2");
  });

  it("stops recording when requested", () => {
    startRecordingTimeline();
    recordEvent({ type: "on" });
    stopRecordingTimeline();
    recordEvent({ type: "off" });

    const timeline = getTimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].type).toBe("on");
  });

  it("clears timeline", () => {
    startRecordingTimeline();
    recordEvent({ type: "e" });
    expect(getTimeline()).toHaveLength(1);

    clearTimeline();
    expect(getTimeline()).toHaveLength(0);
  });
});






