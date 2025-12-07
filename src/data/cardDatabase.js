// =============================
// cardDatabase.js
// =============================
import {
  hasInherentStorm,
  hasInherentRush,
  hasInherentWard,
  hasInherentIntimidate,
  hasInherentBarrier,
  hasInherentBane,
  hasInherentBanishOnDeath,
  hasInherentLastWords,
  hasInherentCountdown
} from "./keywords.js";

let fullCardData = {};
let tokenCardData = {};

export async function loadCardDatabase() {
  fullCardData = {};
  tokenCardData = {};

  const fullRes = await fetch(`${window.APP_ROOT}cards/card_details.json`);
  if (!fullRes.ok) throw new Error(`Main cards failed: ${fullRes.status}`);
  const fullJson = await fullRes.json();

  const tokenRes = await fetch(`${window.APP_ROOT}cards/token_details.json`);
  if (!tokenRes.ok) throw new Error(`Tokens failed: ${tokenRes.status}`);
  const tokenJson = await tokenRes.json();

  // Load lab vanilla set
  let vanillaJson = [];
  try {
    const vanillaRes = await fetch(`${window.APP_ROOT}cards/vanilla_lab_set.json`);
    if (vanillaRes.ok) {
      vanillaJson = await vanillaRes.json();
    }
  } catch (e) {
    console.warn("Vanilla lab set not found or failed to load", e);
  }

  for (const card of [...fullJson, ...vanillaJson]) {
    if (!card.name) continue;
    if (card.type === "Follower" || card.type === "Amulet") {
      card.hasStorm = hasInherentStorm(card.description, card.keywords);
      card.hasRush = hasInherentRush(card.description, card.keywords);
      card.hasWard = hasInherentWard(card.description, card.keywords);
      card.hasIntimidate = hasInherentIntimidate(card.description, card.keywords);
      card.hasBarrier = hasInherentBarrier(card.description, card.keywords);
      card.barrierCharges = card.hasBarrier ? 1 : 0;
      card.hasBane = hasInherentBane(card.description, card.keywords);
      card.hasBanishOnDeath = hasInherentBanishOnDeath(card.keywords);
      card.hasLastWords = hasInherentLastWords(card.keywords);
      card.hasCountdown = hasInherentCountdown(card.keywords);

      if (card.hasLastWords) {
        const lastWordsKeyword = card.keywords.find(k => typeof k === 'object' && k.name === "LastWords");
        card.lastWordsEffects = lastWordsKeyword?.effects || [];
      }

      if (card.hasCountdown) {
        const countdownKeyword = card.keywords.find(k => typeof k === 'object' && k.name === "Countdown");
        if (countdownKeyword) {
          card.countdown = parseInt(countdownKeyword.turns) || 0;
        }
      }
    }
    fullCardData[card.name] = card;
  }

  for (const token of tokenJson) {
    if (!token.name) continue;
    if (token.type === "Follower" || token.type === "Amulet") {
      token.hasStorm = hasInherentStorm(token.description, token.keywords);
      token.hasRush = hasInherentRush(token.description, token.keywords);
      token.hasWard = hasInherentWard(token.description, token.keywords);
      token.hasIntimidate = hasInherentIntimidate(token.description, token.keywords);
      token.hasBarrier = hasInherentBarrier(token.description, token.keywords);
      token.barrierCharges = token.hasBarrier ? 1 : 0;
      token.hasBane = hasInherentBane(token.description, token.keywords);
      token.hasBanishOnDeath = hasInherentBanishOnDeath(token.keywords);
      token.hasLastWords = hasInherentLastWords(token.keywords);
      token.hasCountdown = hasInherentCountdown(token.keywords);

      if (token.hasCountdown) {
        const countdownKeyword = token.keywords.find(k => typeof k === 'object' && k.name === "Countdown");
        if (countdownKeyword) {
          token.countdown = parseInt(countdownKeyword.turns) || 0;
        }
      }
    }
    tokenCardData[token.name] = token;
  }
}

export function getCardDetails(name) {
  return fullCardData[name] || tokenCardData[name] || null;
}

window.cardDatabase = {
  getCardDetails,
  fullData: fullCardData,
  tokenData: tokenCardData,
  reload: loadCardDatabase
};

