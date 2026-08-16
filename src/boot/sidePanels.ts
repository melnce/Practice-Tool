import { populateDeckSelects } from "./deckSelection.js";

export function initSidePanels(): void {
  // Save/Load positions + checkpoint buttons
  void import("../ui/positionPanel.js").then(({ initPositionPanel }) => {
    initPositionPanel();
  });

  // Sparring line (scripted dummy) panel
  void import("../ui/scriptPanel.js").then(({ initScriptPanel }) => {
    initScriptPanel();
  });

  // Puzzle mode (position + goal + checker)
  void import("../ui/puzzlePanel.js").then(({ initPuzzlePanel }) => {
    initPuzzlePanel();
  });

  // Decklist paste import / export
  void import("../ui/deckImportPanel.js").then(({ initDeckImportPanel }) => {
    initDeckImportPanel({
      refreshSelects: async () => {
        await populateDeckSelects({ preserveSelection: true });
      },
    });
  });
}
