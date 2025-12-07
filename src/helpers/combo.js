export function comboReadyInHand(card, owner, state) {
  // Look for combo gates in both fanfare and spell blocks
  const gates = [
    ...(Array.isArray(card?.fanfare) ? card.fanfare : []),
    ...(Array.isArray(card?.spell)   ? card.spell   : []),
  ];
  if (!gates.length) return false;

  const plays = owner === "blue" ? (state.bluePlaysThisTurn || 0)
                                 : (state.redPlaysThisTurn  || 0);
  const futurePlays = plays + 1; // glow one play early (as intended)

  return gates.some(e =>
    e && e.op === "combo_gate" &&
    futurePlays >= (Number(e.count ?? e.min ?? 1) || 1)
  );
}
