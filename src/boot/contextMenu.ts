/** Suppress browser context menu on game surface (cards/boards/leaders/buttons) */
export function initContextMenu(): void {
  document.addEventListener(
    "contextmenu",
    (e) => {
      const el = e.target as HTMLElement;
      if (
        el.closest(".card") ||
        el.closest(".zone") ||
        el.closest(".leader") ||
        el.closest(".evo-btn")
      ) {
        e.preventDefault();
      }
    },
    { capture: true },
  );
}
