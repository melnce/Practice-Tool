import { state } from "../../../core/gameState.js";
import { CardInstance, Player } from "../../../core/types.js";
import { ProcessingCandidate } from "./process.js";
import { TriggerSpec } from "./types.js";

function mapToCandidate(card: CardInstance, owner: Player, source: string): ProcessingCandidate {
    const mainTriggers = (card.triggers || []) as TriggerSpec[];
    const stateTriggers = (card.keywordState?.triggers || []) as TriggerSpec[];

    return {
        card,
        owner,
        source,
        triggers: [...mainTriggers, ...stateTriggers]
    };
}

export function getAllZoneCandidates(): ProcessingCandidate[] {
    return [
        ...state.blueBoard.map(c => mapToCandidate(c, 'blue', 'board')),
        ...state.redBoard.map(c => mapToCandidate(c, 'red', 'board')),
        ...state.blueHand.map(c => mapToCandidate(c, 'blue', 'hand')),
        ...state.redHand.map(c => mapToCandidate(c, 'red', 'hand')),
    ];
}

export function getCrestCandidates(activePlayer: Player): ProcessingCandidate[] {
    const crests = activePlayer === 'blue' ? state.blueCrests : state.redCrests;
    if (!Array.isArray(crests)) return [];

    return crests.map(crest => {
        // Crest structure in legacy: 
        // crest triggers can be in `crest.triggers` (array) or `crest.trigger` (single)
        const rawTriggers = Array.isArray(crest.triggers) && crest.triggers.length
            ? crest.triggers
            : (crest.trigger ? [crest.trigger] : []);

        return {
            card: crest,
            owner: activePlayer,
            source: 'crest',
            triggers: rawTriggers as TriggerSpec[]
        };
    });
}
