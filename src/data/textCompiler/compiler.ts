import type { Effect } from "../../core/types/index.js";
import { makeEffect } from "../../logic/core/effects/build.js";

interface CompiledOutput {
  keywords: string[];
  fanfare: Effect[];
  lastWords: Effect[];
  spell: Effect[];
  unresolved: string[];
}

const KEYWORDS = [
  "Storm",
  "Rush",
  "Ward",
  "Bane",
  "Drain",
  "Snipe",
  "Intimidate",
];

export function compileCardText(text: string, type: string): CompiledOutput {
  const output: CompiledOutput = {
    keywords: [],
    fanfare: [],
    lastWords: [],
    spell: [],
    unresolved: [],
  };

  if (!text) return output;

  // Normalize text: split by newlines or "Fanfare:", "Last Words:" markers
  // This is a naive parser. A full parser would tokenise.
  // We'll treat the text as specific sections.

  // 1. Extract global keywords (simple check)
  // Example: "Storm. Fanfare: ..."
  // We'll remove found keywords from text to avoid re-parsing them as unresolved clauses?
  // Actually, keywords usually appear independently or at start.

  const remainingText = text;

  for (const kw of KEYWORDS) {
    // Match whole word, case insensitive? distinct keyword usually capitalized.
    // "Storm." or "Storm" or "Ward,"
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(remainingText)) {
      // Capitalize for standard storage
      output.keywords.push(kw);
      // Optional: remove it? "Storm." -> ""
      // For now, let's leave it, but we might get "Storm" as unresolved if we don't have a pattern.
      // Let's rely on line parsing.
    }
  }

  // 2. Parse sections
  // Simple state machine
  let currentSection: "spell" | "fanfare" | "last_words" =
    type === "Spell" ? "spell" : "spell"; // Default to spell for Spells, for Followers text without prefix is usually passive or unhandled.
  // Actually, for Followers, lines without "Fanfare:" prefix are often traits or passives.

  // Split into sentences/clauses.
  // Splitting by period or newline.
  const chunks = text
    .split(/(?:\r?\n|(?<=\.)\s+)/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < chunks.length; i++) {
    const rawChunk = chunks[i];
    if (rawChunk === undefined) continue;
    let chunk: string = rawChunk;

    // Detect Section Headers
    if (/^Fanfare:?/i.test(chunk)) {
      currentSection = "fanfare";
      chunk = chunk.replace(/^Fanfare:?\s*/i, "");
    } else if (/^Last Words:?/i.test(chunk)) {
      currentSection = "last_words";
      chunk = chunk.replace(/^Last Words:?\s*/i, "");
    }

    if (!chunk) continue;

    // Skip keywords if they are the only thing in the chunk (already handled)
    const isJustKeyword = KEYWORDS.some((kw) =>
      new RegExp(`^${kw}\\.?$`, "i").test(chunk),
    );
    if (isJustKeyword) continue;

    // Compile Effect
    const effect = parseEffect(chunk);
    // console.log(`[Compiler] Parsing chunk: "${chunk}" ->`, effect);

    if (effect) {
      if (currentSection === "fanfare") output.fanfare.push(effect);
      else if (currentSection === "last_words") output.lastWords.push(effect);
      else if (type === "Spell") output.spell.push(effect);
      else output.unresolved.push(chunk); // Passive text on follower not supported yet
    } else {
      output.unresolved.push(chunk);
    }
  }

  return output;
}

function parseEffect(clause: string): Effect | null {
  // 1. Draw
  // "Draw a card." / "Draw 2 cards."
  const drawMatch = clause.match(/^Draw (\d+|a) cards?\.?$/i);
  if (drawMatch) {
    const matchVal = drawMatch[1];
    const count =
      matchVal?.toLowerCase() === "a" ? 1 : parseInt(matchVal ?? "1");
    return makeEffect("draw", { count });
  }

  // 2. Deal Damage
  // "Deal X damage to an enemy follower."
  // "Deal X damage to the enemy leader."
  const dmgMatch = clause.match(
    /^Deal (\d+) damage(?: to (an enemy follower|the enemy leader))?\.?$/i,
  );
  if (dmgMatch) {
    const amt = parseInt(dmgMatch[1] ?? "0");
    const targetStr = (dmgMatch[2] ?? "").toLowerCase();
    // Map target string to conventions (if resolveTarget supports them)
    // Our engine usually requires explicit selection or random.
    // "Deal X to an enemy follower" usually implies target SELECTION if not "random".
    // The prompt said: "Deal X damage to an enemy follower." -> op damage amount X target enemy follower
    // I'll stick to a generic "damage" op and assume "target" property handles the selector string.
    // But `resolveTarget` needs `select` op usually.
    // If it's targeted play, it's usually `op: "damage", amount: X` nested inside `op: "select"`.
    // For v1, let's mapping to a flat object as requested, marking ambiguity.

    if (targetStr.includes("follower")) {
      // Targeted? implied by "an enemy follower".
      return {
        op: "select",
        target: "enemy_follower",
        effects: [makeEffect("damage", { amount: amt })],
      };
    } else if (targetStr.includes("leader")) {
      return makeEffect("damage", {
        amount: amt,
        target: "enemy_leader",
        fallback_leader: true,
      });
    } else {
      // Implicit / Generic
      // "Deal X damage." -> Default to simple damage op?
      return makeEffect("damage", { amount: amt });
    }
  }

  // 3. Summon
  // "Summon a <Name>." / "Summon 2 <Name>s."
  const summonMatch = clause.match(/^Summon (\d+|a|an) (.+?)(?:s)?\.?$/i);
  if (summonMatch) {
    const countStr = (summonMatch[1] ?? "a").toLowerCase();
    const count =
      countStr === "a" || countStr === "an" ? 1 : parseInt(countStr);
    const name = summonMatch[2] ?? "Unknown"; // Clean up plurals? "Knight" vs "Knights"
    // Heuristic: remove trailing 's' if not part of name? Name matching is hard.
    // Assuming user provides singular names or we fix later.

    return makeEffect("summon", { source: "named", name, count });
  }

  // 4. Spellboost
  // "Spellboost: Subtract 1 from the cost of this card."
  if (/^Spellboost: Subtract 1 from the cost of this card\.?$/i.test(clause)) {
    // Spellboost keyword typically triggers cost reduction
    return makeEffect("cost", { target: "self", mode: "reduce", amount: 1 });
  }

  // "Spellboost: Deal 1 more damage."
  // This implies a variable damage op.
  if (/^Spellboost: Deal 1 more damage\.?$/i.test(clause)) {
    return makeEffect("damage", { amount: "spellboost" }); // Simplified representation
  }

  return null;
}
