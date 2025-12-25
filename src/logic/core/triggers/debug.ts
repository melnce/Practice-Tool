export const DEBUG_TRIGGERS = {
  enabled: false,
  trace: [] as any[],
  _tick: 0, // P0-1 FIX: Deterministic counter instead of Date.now()
  enable: () => {
    DEBUG_TRIGGERS.enabled = true;
  },
  disable: () => {
    DEBUG_TRIGGERS.enabled = false;
  },
  clear: () => {
    DEBUG_TRIGGERS.trace = [];
    DEBUG_TRIGGERS._tick = 0;
  },
  log: (entry: any) => {
    if (DEBUG_TRIGGERS.enabled) {
      DEBUG_TRIGGERS.trace.push({
        time: ++DEBUG_TRIGGERS._tick, // P0-1 FIX: Was Date.now()
        ...entry,
      });
    }
  },
};

if (typeof window !== "undefined") {
  (window as any).__DEBUG_TRIGGERS = DEBUG_TRIGGERS;
}















