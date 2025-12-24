// src/helpers/combo.ts
import { CardInstance, GameState } from "../core/types.js";

export function comboReadyInHand(
  card: CardInstance,
  owner: "first" | "second",
  state: GameState,
): boolean {
  // Look for combo gates in both fanfare and spell blocks
  const gates = [
    ...(Array.isArray(card?.fanfare) ? card.fanfare : []),
    ...(Array.isArray(card?.spell) ? card.spell : []),
  ];
  if (!gates.length) return false;

  const plays =
    owner === "first"
      ? state.players.first.playsThisTurn || 0
      : state.players.second.playsThisTurn || 0;
  const futurePlays = plays + 1; // glow one play early (as intended)

  return gates.some(
    (e) =>
      e &&
      e.op === "gate" &&
      (e as any).condition === "combo" &&
      futurePlays >= (Number((e as any).count ?? 1) || 1),
  );
}














