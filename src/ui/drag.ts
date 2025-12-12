// src/ui/drag.ts
import { getDragData, setDragData } from "./dom.js";
import { doAction } from "../core/history.js";
import { CardInstance, GameState, Player } from "../core/types.js";


// External game logic hooks (keep same import paths as your project)
const logic = () => import(/* webpackIgnore: true */ "../logic/index.js");

export function makeLeaderDroppable(leaderEl: HTMLElement, targetPlayer: Player, state: GameState) {
    leaderEl.ondragover = (e) => e.preventDefault();
    leaderEl.ondrop = (e) => {
        e.preventDefault();
        const data = getDragData(e);
        const [attackerPlayer, attackerIndex] = data.split(",");

        // Only allow dropping attacker onto the opposite leader on the correct turn
        if ((targetPlayer === "blue" && state.isBlueTurn) || (targetPlayer === "red" && !state.isBlueTurn)) return;

        logic().then(({ attackLeader }) => {
            attackLeader(parseInt(attackerIndex), attackerPlayer as Player, targetPlayer);
        });
    };
}

export function enableCardDragFromHand(div: HTMLElement, card: CardInstance, containerId: string) {
    div.draggable = true;
    div.ondragstart = (e) => setDragData(e, `hand,${containerId},${card.uid}`);
}

export function enableAttackerDrag(div: HTMLElement, player: Player, boardIndex: number) {
    div.draggable = true;
    div.ondragstart = (e) => setDragData(e, `${player},${boardIndex}`);
}

export function enableBoardDropForOwnSide(div: HTMLElement, containerId: string, state: GameState) {
    div.ondragover = (e) => e.preventDefault();
    div.ondrop = (e) => {
        e.preventDefault();
        const data = getDragData(e);

        // Evo button drag payload
        if (data.includes("NormalEvo") || data.includes("SuperEvo")) return; // handled at card level

        // Hand -> board
        const [sourceType, sourceId, cardUid] = data.split(",");
        if (sourceType === "hand" && sourceId === containerId.replace("Board", "Hand")) {
            const player = containerId === "blueBoard" ? "blue" : "red";
            const hand = state[`${player}Hand`];
            const index = hand.findIndex(c => c.uid === cardUid);
            if (index !== -1) logic().then(({ playCard }) => playCard(hand, player, index));
        }
    };
}

export function enableCardEvoDrop(div: HTMLElement, containerId: string, card: CardInstance, state: GameState, rerender: () => void) {
    div.ondragover = (e) => e.preventDefault();
    div.ondrop = (e) => {
        e.preventDefault();
        const data = getDragData(e);
        if (!(data.includes("NormalEvo") || data.includes("SuperEvo"))) return;
        if (card.hasEvolved) return;

        const isBlueSide = containerId === "blueBoard";
        const isNormal = data.includes("NormalEvo");
        const isSuper = data.includes("SuperEvo");

        // Turn + charges + per-turn lock
        if (isBlueSide) {
            if (!state.isBlueTurn) return;
            if (isNormal) { if (state.blueEvoUsedThisTurn || !(state.blueEvoCharges > 0)) return; }
            else { if (state.blueEvoUsedThisTurn || !(state.blueSuperEvoCharges > 0)) return; }
        } else {
            if (state.isBlueTurn) return;
            if (isNormal) { if (state.redEvoUsedThisTurn || !(state.redEvoCharges > 0)) return; }
            else { if (state.redEvoUsedThisTurn || !(state.redSuperEvoCharges > 0)) return; }
        }

        const owner: Player = isBlueSide ? "blue" : "red";
        const mode = isNormal ? "normal" : "super";
        doAction(isSuper ? "Super Evolve" : "Evolve", () => {
            const boost = isSuper ? 3 : 2;

            // ensure buff container, then apply evo stats
            if (!card.buffs) card.buffs = { attack: 0, defense: 0 };
            card.buffs.attack += boost;
            card.buffs.defense += boost;

            // @ts-ignore
            card.attack = (Number(card.attack) || 0) + boost;
            // @ts-ignore
            card.defense = (Number(card.defense) || 0) + boost;
            // @ts-ignore
            card.peak_defense = Math.max(card.peak_defense ?? Number(card.defense), Number(card.defense));
            if (card.evo_image) card.base_image = card.evo_image;

            if (card.hasStorm) {
                card.isRush = false;
                if (!card.hasAttacked) card.can_attack = true;
            } else {
                card.hasRush = true;
                card.isRush = true;
                if (!card.hasAttacked) card.can_attack = true;
            }
            card.hasEvolved = true;
            card.evoType = isSuper ? "super" : "normal";

            // REMOVE THE MANUAL CHARGE DECREMENTING HERE
            // The onEvolve function will handle charge spending
            if (isBlueSide) {
                state.blueEvoUsedThisTurn = true; // Just track turn usage
            } else {
                state.redEvoUsedThisTurn = true;  // Just track turn usage
            }

            // fire evolve hooks (does its own logging AND charge spending)
            logic().then(({ onEvolve }) => onEvolve(card, owner, mode));
        }, {}, { autoRender: false });
        rerender();
    };
}

export function enableEnemyFollowerDrop(div: HTMLElement, attackerData: any, defenderIndex: number, state: GameState, isRedBoard: boolean) {
    div.ondragover = (e) => e.preventDefault();
    div.ondrop = (e) => {
        e.preventDefault();
        const data = getDragData(e);
        const [attackerPlayer, attackerIndex] = data.split(",");

        const defenderPlayer = isRedBoard ? "red" : "blue";
        // @ts-ignore  (state keys)
        const defenders = state[`${defenderPlayer}Board`];
        const defender = defenders[defenderIndex];

        // @ts-ignore
        const hasWard = defenders.some(c => c.hasWard && Number(c.defense) > 0);
        if (hasWard && !defender.hasWard) return;
        if (defender.hasIntimidate && !defender.hasWard) return;

        logic().then(({ attackFollower }) => {
            // @ts-ignore
            attackFollower(parseInt(attackerIndex), defenderIndex, attackerPlayer, defenderPlayer);
        });
    };
}
