// Polyfills
const noop = () => {};
const win: any = {
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: "http://localhost/" },
  cardDatabase: null, // Placeholder
};
(globalThis as any).window = win;
(globalThis as any).document = {
  addEventListener: noop,
  getElementById: () => ({ style: {} }), // Dummy element
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add: noop, remove: noop } }),
};
(globalThis as any).HEADLESS = true;

async function main() {
  const { startNewGame, dispatch } = await import("../src/engine.js");

  const mockDB = {
    getCardDetails: (name: string) => {
      if (name.includes("Vyrn"))
        return {
          id: "10441210",
          name: "Vyrn, Li'l Red Dragon",
          type: "Follower",
          cost: 2,
          attack: 2,
          defense: 2,
          fanfare: [{ op: "super_evo_gate", effects: [{ op: "evolve_self" }] }],
        };
      return null;
    },
  };
  win.cardDatabase = mockDB;

  console.log("Starting test...");
  const { state } = await startNewGame();

  state.roundCount = 8;
  state.bluePP = 10;
  state.blueMaxPP = 10;

  const vyrnData = mockDB.getCardDetails("Vyrn");
  const vyrn = { ...vyrnData, uid: "hand_1", owner: "blue" };
  state.blueHand = [vyrn];

  console.log("Playing Vyrn...");
  // @ts-ignore
  dispatch(state, { type: "PLAY_CARD", player: "blue", cardUid: "hand_1" });

  const onBoard = state.blueBoard[0];
  console.log("Board size:", state.blueBoard.length);
  if (onBoard) {
    console.log("Card:", onBoard.name);
    console.log("Has Evolved:", onBoard.hasEvolved);
    if (onBoard.hasEvolved) console.log("SUCCESS: Vyrn evolved.");
    else console.error("FAILURE: Vyrn did NOT evolve.");
  } else {
    console.error("FAILURE: Board empty.");
  }
}

main().catch((e) => console.error(e));
