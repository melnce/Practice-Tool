/** Globals registered for inline HTML onclick handlers (index.html). */
export {};

declare global {
  interface Window {
    endTurnBlue: () => void;
    endTurnRed: () => void;
    useRedBoost: () => void;
    /** Optional asset root prefix (defaults to "/" in deckLoader). */
    APP_ROOT?: string;
  }
}
