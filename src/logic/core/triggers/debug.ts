
export const DEBUG_TRIGGERS = {
    enabled: false,
    trace: [] as any[],
    enable: () => { DEBUG_TRIGGERS.enabled = true; },
    disable: () => { DEBUG_TRIGGERS.enabled = false; },
    clear: () => { DEBUG_TRIGGERS.trace = []; },
    log: (entry: any) => {
        if (DEBUG_TRIGGERS.enabled) {
            DEBUG_TRIGGERS.trace.push({
                time: Date.now(),
                ...entry
            });
        }
    }
};

if (typeof window !== "undefined") {
    (window as any).__DEBUG_TRIGGERS = DEBUG_TRIGGERS;
}
