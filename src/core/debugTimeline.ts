export interface DebugEvent {
  type: string;
  timestamp: number;
  payload?: unknown;
}

let _recording = false;
let _timeline: DebugEvent[] = [];

export function startRecordingTimeline(): void {
  _recording = true;
}

export function stopRecordingTimeline(): void {
  _recording = false;
}

export function clearTimeline(): void {
  _timeline = [];
}

export function recordEvent(
  event: Omit<DebugEvent, "timestamp"> & { timestamp?: number },
): void {
  if (!_recording) return;

  // Deep clone payload to snapshot state? Shallow for now as per minimal reqs,
  // but safer to strictly clone if we suspect mutation.
  // The requirement said "shallow-cloned object to an internal array".
  // "event" arg itself is likely transient, so we store a copy.
  _timeline.push({
    ...event,
    timestamp: event.timestamp ?? Date.now(),
  });
}

export function getTimeline(): DebugEvent[] {
  return [..._timeline];
}














