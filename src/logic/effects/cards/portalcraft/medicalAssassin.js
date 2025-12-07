import { state } from "@core/gameState.js";
import { applyKeyword } from "@logic/core/keywords.js";
import { logEvent } from "@core/logger.js"; // Add import


function hasTribe(card, tribe) {
  if (!card || card.type !== "Follower" || !Array.isArray(card.tribes)) return false;
  const t = String(tribe).toLowerCase();
  return card.tribes.some(x => String(x).toLowerCase() === t);
}

function ownerBoard(owner) {
  return owner === "blue" ? state.blueBoard : state.redBoard;
}

// Initialize the gate if it doesn't exist
function ensureMedAssGate() {
  if (!state.__medAssGate) {
    state.__medAssGate = { blue: false, red: false };
  }
}

// Call at the start of each player's turn to reset the gate
export function resetMedicalAssassinGate(owner) {
  ensureMedAssGate();
  state.__medAssGate[owner] = false;
}

/**
 * Call this when ANY follower enters the board (from hand or summon)
 */
export function medicalAssassinOnFollowerEnter(owner, enteringCard) {
  if (!enteringCard || enteringCard.type !== "Follower") return;
  
  // Check if it's a Puppetry follower
  if (!hasTribe(enteringCard, "Puppetry")) return;

  // Must have at least one Medical-Grade Assassin on board (owner only)
  const board = ownerBoard(owner);
  const hasAssassin = board.some(c => 
    c && 
    c.type === "Follower" && 
    c.name === "Medical-Grade Assassin"
  );
  
  if (!hasAssassin) return;

  // Check the once-per-turn gate
  ensureMedAssGate();
  if (state.__medAssGate[owner]) return;

  // If the entering card already has Bane, just consume the gate and stop
  if (enteringCard.hasBane || 
      (Array.isArray(enteringCard.keywords) && 
       enteringCard.keywords.some(k => 
         (typeof k === "string" && k.toLowerCase() === "bane") ||
         (k && typeof k === "object" && k.name && k.name.toLowerCase() === "bane")
       ))) {
    state.__medAssGate[owner] = true;
    return;
  }

  // Apply Bane keyword
  applyKeyword(enteringCard, "bane");
  
  // Log the medical assassin buff effect
  logEvent("medicalAssassinBuff", { owner, target: enteringCard.name, uid: enteringCard.uid });
  
  state.__medAssGate[owner] = true;
}
