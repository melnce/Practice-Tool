
import { describe, it, expect, vi, beforeEach } from "vitest";
import { startNewGame, dispatch, getState } from "../../src/engine.js";

// Mock UI
vi.mock("../../src/ui/render.js", () => ({
    render: vi.fn(),
    updateCounts: vi.fn(),
    updateEvoButtonsUI: vi.fn(),
    updateCrestsUI: vi.fn(),
    renderZone: vi.fn(),
    makeLeaderDroppable: vi.fn(),
    wireHistoryImagePreview: vi.fn()
}));

// Mock DOM
vi.mock("../../src/ui/dom.js", () => ({
    byId: () => document.createElement("div"),
    clear: () => { },
    wireClick: () => { },
    getDragData: () => "",
    setDragData: () => { }
}));

describe("Engine Actions", () => {
    beforeEach(async () => {
        // Minimal DOM for startNewGame
        const slots = ["blueDeckSelect", "redDeckSelect", "seedInput", "blueHand", "redHand", "blueBoard", "redBoard", "blueLeader", "redLeader"];
        document.body.innerHTML = slots.map(id => {
            if (id.includes("Select")) return `<select id="${id}"><option value="sample_${id.includes("blue") ? 'blue' : 'red'}">D</option></select>`;
            if (id.includes("Input")) return `<input id="${id}" value="123" />`;
            return `<div id="${id}"></div>`;
        }).join("");
        ["blueHP", "redHP", "bluePP", "redPP", "blueShadows", "redShadows"].forEach(id => {
            const d = document.createElement("div"); d.id = id; document.body.appendChild(d);
        });
    });

    it("should play a card via PLAY_CARD action", async () => {
        // 1. Setup
        const state = await startNewGame({ deckAId: "sample_blue", deckBId: "sample_red", seed: 999 });

        // Find a playable card in Blue's hand (assuming generic low cost or cheat PP)
        // For test stability, let's give infinite PP
        state.bluePP = 10;
        state.blueMaxPP = 10;

        const cardToPlay = state.blueHand[0];
        expect(cardToPlay).toBeDefined();
        const initialHandSize = state.blueHand.length;

        // 2. Dispatch PLAY_CARD
        dispatch(state, {
            type: "PLAY_CARD",
            player: "blue",
            cardUid: cardToPlay.uid
        });

        // 3. Assert
        // Card should be gone from hand
        expect(state.blueHand.length).toBe(initialHandSize - 1);
        expect(state.blueHand.find(c => c.uid === cardToPlay.uid)).toBeUndefined();

        // Card should be in board (if follower/amulet) or graveyard (if spell)
        // determining type...
        if (cardToPlay.type === "Spell") {
            expect(state.blueGraveyard.find(c => c.uid === cardToPlay.uid)).toBeDefined();
        } else {
            expect(state.blueBoard.find(c => c.uid === cardToPlay.uid)).toBeDefined();
        }
    });
});


