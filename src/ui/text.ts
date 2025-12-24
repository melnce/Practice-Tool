// src/ui/text.ts
// Helper functions for injecting badges and description text
// Moved from logic/core/resolveTarget.ts to isolate UI/presentation logic

export function injectDescAndBadge(
  card: any,
  htmlChunk: string,
  badgeLines: string | string[],
) {
  _ensureInjectState(card);

  // Add unique HTML chunk
  if (htmlChunk && !card.__descSet.has(htmlChunk)) {
    card.__descSet.add(htmlChunk);
    card.__descChunks.push(htmlChunk);
  }

  // Add unique badge lines
  for (const line of (Array.isArray(badgeLines)
    ? badgeLines
    : [badgeLines]
  ).filter(Boolean)) {
    if (!card.__badgeSet.has(line)) {
      card.__badgeSet.add(line);
      card.__badgeLines.push(line);
    }
  }

  // Rebuild description: base + all injected chunks, separated by <br>
  const parts = [];
  if (card.__descBase) parts.push(card.__descBase);
  if (card.__descChunks.length) parts.push(...card.__descChunks);
  card.description = parts.join("<br>");

  // Reuse the Icarus badge plumbing
  card.__icarusBuff = true;
  card.__icarusBadgeText = card.__badgeLines.join("\n");
}

function _ensureInjectState(card: any) {
  if (card.__injectInit) return;
  card.__injectInit = true;

  // Save the original description once
  card.__descBase = card.__descBase ?? (card.description || "");

  // Hold unique HTML chunks and badge lines
  card.__descChunks = card.__descChunks || [];
  card.__descSet = card.__descSet || new Set();

  card.__badgeLines = card.__badgeLines || [];
  card.__badgeSet = card.__badgeSet || new Set();
}














