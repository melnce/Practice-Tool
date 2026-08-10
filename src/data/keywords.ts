// src/data/keywords.ts

export function hasInherentStorm(
  description: string,
  keywords: any[],
): boolean {
  // ONLY check the keywords array - don't scan descriptions!
  return (
    Array.isArray(keywords) &&
    keywords.some((k) => typeof k === "string" && k.toLowerCase() === "storm")
  );
}

export function hasInherentRush(description: string, keywords: any[]): boolean {
  if (
    Array.isArray(keywords) &&
    keywords.some((k) => typeof k === "string" && k.toLowerCase() === "rush")
  )
    return true;
  if (!description) return false;
  const desc = description.trim().toLowerCase();
  const lines = desc.split("\n").map((line) => line.trim());
  return (
    lines.includes("rush") ||
    desc === "rush" ||
    desc.endsWith("\nrush") ||
    desc.startsWith("rush\n")
  );
}

export function hasInherentWard(description: string, keywords: any[]): boolean {
  if (
    Array.isArray(keywords) &&
    keywords.some((k) => typeof k === "string" && k.toLowerCase() === "ward")
  )
    return true;
  if (!description) return false;
  const desc = description.trim().toLowerCase();
  const lines = desc.split("\n").map((line) => line.trim());
  return (
    lines.includes("ward") ||
    desc === "ward" ||
    desc.endsWith("\nward") ||
    desc.startsWith("ward\n")
  );
}

export function hasInherentIntimidate(
  description: string,
  keywords: any[],
): boolean {
  if (
    Array.isArray(keywords) &&
    keywords.some(
      (k) => typeof k === "string" && k.toLowerCase() === "intimidate",
    )
  )
    return true;
  if (!description) return false;
  const desc = description.trim().toLowerCase();
  const lines = desc.split("\n").map((l) => l.trim());
  return (
    lines.includes("intimidate") ||
    desc === "intimidate" ||
    desc.endsWith("\nintimidate") ||
    desc.startsWith("intimidate\n")
  );
}

export function hasInherentBarrier(
  description: string,
  keywords: any[],
): boolean {
  if (
    Array.isArray(keywords) &&
    keywords.some((k) => typeof k === "string" && k.toLowerCase() === "barrier")
  )
    return true;
  if (!description) return false;
  const desc = description.trim().toLowerCase();
  const lines = desc.split("\n").map((l) => l.trim());
  return lines.includes("barrier") || desc === "barrier";
}

export function hasInherentBane(description: string, keywords: any[]): boolean {
  if (
    Array.isArray(keywords) &&
    keywords.some((k) => typeof k === "string" && k.toLowerCase() === "bane")
  )
    return true;
  if (!description) return false;
  const desc = description.trim().toLowerCase();
  const lines = desc.split("\n").map((l) => l.trim());
  return (
    lines.includes("bane") ||
    desc === "bane" ||
    desc.endsWith("\nbane") ||
    desc.startsWith("bane\n")
  );
}

export function hasInherentBanishOnDeath(keywords: any[]): boolean {
  return (
    Array.isArray(keywords) &&
    keywords.some(
      (k) => typeof k === "string" && k.toLowerCase() === "banishondeath",
    )
  );
}

export function hasInherentLastWords(keywords: any[]): boolean {
  return (
    Array.isArray(keywords) &&
    keywords.some(
      (k) =>
        (typeof k === "string" && k.toLowerCase() === "lastwords") ||
        (typeof k === "object" &&
          k !== null &&
          (k as any).name === "LastWords"),
    )
  );
}

export function hasInherentCountdown(keywords: any[]): boolean {
  return (
    Array.isArray(keywords) &&
    keywords.some(
      (k) => typeof k === "object" && (k as any).name === "Countdown",
    )
  );
}
