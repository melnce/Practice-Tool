export const adapter = {
    render: () => { console.warn("Render called but not injected"); },
    showChoiceModal: (options: any[], callback: (index: number) => void) => { console.warn("showChoiceModal called but not injected"); },
    // Add other UI dependencies here if needed (e.g. sounds)
};

export function injectAdapter(impl: Partial<typeof adapter>) {
    Object.assign(adapter, impl);
}
