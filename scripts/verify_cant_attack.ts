import { state } from "../src/core/gameState";
import { runEffects } from "../src/logic/core/effects/index";
import { endTurnBlue } from "../src/logic/core/turns";
import { CardInstance } from "../src/core/types";

// Setup Mock State
(state as any).isBlueTurn = true;
(state as any).activePlayer = "blue";
(state as any).roundCount = 5;
(state as any).blueBoard = [];
(state as any).redBoard = [];

const card: CardInstance = {
  type: "Follower",
  name: "TestFollower",
  uid: "f1",
  can_attack: true,
  keywordState: {},
} as any;

(state as any).blueBoard.push(card);

console.log("--- START TEST: until_end_of_turn ---");
console.log("Initial keywordState:", JSON.stringify(card.keywordState));

// 1. Apply Effect
runEffects(
  [
    {
      op: "keyword",
      keyword: "cant_attack",
      until_end_of_turn: true,
    },
  ],
  "blue",
  null,
  { targets: [card] },
);

console.log("After Apply keywordState:", JSON.stringify(card.keywordState));

// Verify Applied
if (card.keywordState.cantAttack !== true) {
  console.error("FAILURE: cantAttack not applied!");
}
if (card.keywordState.cantAttackExpiresOnTurn !== 5) {
  console.error(
    "FAILURE: expires_on_turn not set! Got:",
    card.keywordState.cantAttackExpiresOnTurn,
  );
} else {
  console.log("SUCCESS: expires_on_turn set to 5.");
}

// 2. End Turn
console.log("Calling endTurnBlue...");
endTurnBlue();

console.log("After EndTurn keywordState:", JSON.stringify(card.keywordState));

// Verify Cleared
if (card.keywordState.cantAttack === undefined) {
  console.log("SUCCESS: cantAttack cleared.");
} else {
  console.error("FAILURE: cantAttack persisted!");
}

console.log("--- START TEST: until_opponent_eot ---");
(state as any).isBlueTurn = true;
const card2: CardInstance = {
  type: "Follower",
  name: "TestFollower2",
  uid: "f2",
  keywordState: {},
} as any;
(state as any).blueBoard = [card2];
(state as any).redBoard = []; // Ensure clear
(state as any).roundCount = 6;

runEffects(
  [
    {
      op: "keyword",
      keywords: [
        {
          name: "cant_attack",
          until_opponent_eot: true,
        },
      ],
    },
  ],
  "blue",
  null,
  { targets: [card2] },
);

console.log("After Apply 2 keywordState:", JSON.stringify(card2.keywordState));

// Blue ends turn
console.log("Blue ending turn...");
endTurnBlue(); // Calls clearExpiredCantAttackAtEOT("blue")
// ks.cantAttackOwner = "blue". endedPlayer="blue".
// If my fix works (owner !== endedPlayer), blue !== blue is FALSE. Should NOT clear.
console.log(
  "After Blue End Turn keywordState:",
  JSON.stringify(card2.keywordState),
);

if (card2.keywordState.cantAttack === true) {
  console.log("SUCCESS: Persisted through owner turn.");
} else {
  console.error("FAILURE: Cleared prematurely!");
}

// Red ends turn
console.log("Red ending turn...");
// Assume Red Turn Logic...
// In script we just call the helper manually to verify logic
import { clearExpiredCantAttackAtEOT } from "../src/logic/core/keywords/eot";
clearExpiredCantAttackAtEOT("red"); // As if Red ended turn

console.log(
  "After Red End Turn keywordState:",
  JSON.stringify(card2.keywordState),
);

if (card2.keywordState.cantAttack === undefined) {
  console.log("SUCCESS: Cleared after opponent turn.");
} else {
  console.error("FAILURE: Persisted across opponent turn!");
}
