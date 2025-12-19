// src/core/adapter.ts
// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT ADAPTER - Default implementations are silent no-ops.
// Browser code injects real implementations via injectAdapter().
// This enables core modules to call adapter functions without UI imports.
// ─────────────────────────────────────────────────────────────────────────────

export const adapter = {
    // Default: no-op. Browser boot injects real implementations.
    render: () => { /* no-op by default */ },
    showChoiceModal: (_options: unknown[], _callback: (index: number) => void) => { /* no-op */ },

    // Targeting confirmation UI
    showTargetConfirmationButton: (_vm: unknown) => { /* no-op */ },
    hideTargetConfirmation: () => { /* no-op */ },
    triggerConfirmButtonClick: () => { /* no-op */ },
};

export function injectAdapter(impl: Partial<typeof adapter>) {
    Object.assign(adapter, impl);
}
