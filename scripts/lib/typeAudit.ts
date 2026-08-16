/**
 * Text-first Spell vs Amulet derivation for non-Follower cards.
 * Calibration: 10543310 Sloth = Spell, 10342210 Nation of Disdain = Amulet.
 */

export type CardForTypeAudit = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  keywords?: unknown[];
  triggers?: unknown[];
  fanfare?: unknown[];
  spell?: unknown[];
};

export type DerivedTypeResult = {
  derived: "Spell" | "Amulet";
  evidence: string;
  markers: string[];
};

function keywordNames(keywords: unknown[] | undefined): string[] {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((k) => {
      if (typeof k === "string") return k;
      if (k && typeof k === "object" && "name" in k)
        return String((k as { name: string }).name);
      return "";
    })
    .filter(Boolean);
}

function hasKeyword(keywords: unknown[] | undefined, name: string): boolean {
  const target = name.toLowerCase().replace(/[\s_-]+/g, "");
  return keywordNames(keywords).some(
    (k) => k.toLowerCase().replace(/[\s_-]+/g, "") === target,
  );
}

/** Card-level Engage (not "whenever you Engage an amulet" in hand text). */
export function hasCardLevelEngage(card: CardForTypeAudit): boolean {
  const desc = card.description ?? "";
  const hasEngageKw = hasKeyword(card.keywords, "Engage");
  const engageLine = desc
    .split("\n")
    .some((l) => /^engage\s*(\(\d+\))?\s*:/i.test(l.trim()));
  return hasEngageKw || engageLine;
}

/** Card-level Countdown (not countdown inside a crest grant). */
export function hasCardLevelCountdown(card: CardForTypeAudit): boolean {
  const desc = card.description ?? "";
  if (/^gain crest:/im.test(desc.trim())) return false;
  return (
    /^countdown\s*\(/im.test(desc) || hasKeyword(card.keywords, "Countdown")
  );
}

export function hasCardLevelLastWords(card: CardForTypeAudit): boolean {
  const desc = card.description ?? "";
  return /^last words:/im.test(desc) || hasKeyword(card.keywords, "LastWords");
}

export function hasBoardPersistence(card: CardForTypeAudit): boolean {
  const desc = card.description ?? "";
  const boardLine = desc.split("\n").some((line) => {
    const t = line.trim();
    if (
      /^fanfare:/i.test(t) ||
      /^evolve:/i.test(t) ||
      /^super-evolve:/i.test(t)
    )
      return false;
    return (
      /^at the (start|end) of (your|this|the|opponent)/i.test(t) ||
      /^during your turn, whenever/i.test(t) ||
      /^whenever you play another card/i.test(t) ||
      /^once on each of your turns/i.test(t)
    );
  });
  const boardTriggers =
    (card.triggers?.length ?? 0) > 0 && !/activates in hand/i.test(desc);
  return boardLine || boardTriggers;
}

/** Derive expected type from description and ops markers. */
export function deriveSpellAmuletType(
  card: CardForTypeAudit,
): DerivedTypeResult {
  const desc = card.description ?? "";

  if (
    hasCardLevelEngage(card) ||
    hasCardLevelCountdown(card) ||
    hasCardLevelLastWords(card) ||
    hasBoardPersistence(card)
  ) {
    const markers: string[] = [];
    if (hasCardLevelEngage(card)) markers.push("Engage");
    if (hasCardLevelCountdown(card)) markers.push("Countdown");
    if (hasCardLevelLastWords(card)) markers.push("Last Words");
    if (hasBoardPersistence(card)) markers.push("board-persist");
    const quote =
      desc
        .split("\n")
        .find((l) =>
          /countdown|engage|last words|at the (start|end) of|whenever you play another|during your turn/i.test(
            l,
          ),
        ) ?? desc.slice(0, 100);
    return { derived: "Amulet", evidence: quote, markers };
  }

  if (/activates in hand/i.test(desc)) {
    return {
      derived: "Spell",
      evidence: desc.split("\n")[0] ?? desc,
      markers: ["hand-activation"],
    };
  }

  if (/^gain crest:/im.test(desc.trim())) {
    return {
      derived: "Spell",
      evidence: desc.split("\n")[0] ?? desc,
      markers: ["crest-grant"],
    };
  }

  return {
    derived: "Spell",
    evidence: desc.split("\n")[0]?.slice(0, 100) ?? desc.slice(0, 100),
    markers: ["one-shot"],
  };
}

export type TypeAuditRow = {
  id: string;
  name: string;
  current: string;
  derived: "Spell" | "Amulet";
  evidence: string;
  markers: string[];
  contradiction: boolean;
};

export function auditSpellAmuletTypes(
  cards: CardForTypeAudit[],
): TypeAuditRow[] {
  return cards
    .filter((c) => c.type === "Spell" || c.type === "Amulet")
    .map((c) => {
      const { derived, evidence, markers } = deriveSpellAmuletType(c);
      return {
        id: c.id,
        name: c.name,
        current: c.type ?? "",
        derived,
        evidence,
        markers,
        contradiction: c.type !== derived,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Linter: Spell-typed card must not carry amulet-only markers. */
export function spellAmuletMarkerIssues(card: CardForTypeAudit): string[] {
  if (card.type !== "Spell") return [];
  const desc = card.description ?? "";

  if (/activates in hand/i.test(desc)) return [];
  if (/^gain crest:/im.test(desc.trim())) return [];

  const issues: string[] = [];
  if (hasCardLevelCountdown(card)) {
    issues.push(
      "Spell-typed card has card-level Countdown marker (description or keywords)",
    );
  }
  if (hasCardLevelEngage(card)) {
    issues.push(
      "Spell-typed card has card-level Engage marker (description or keywords)",
    );
  }
  if (hasCardLevelLastWords(card)) {
    issues.push(
      "Spell-typed card has card-level Last Words marker (description or keywords)",
    );
  }
  if (hasBoardPersistence(card)) {
    issues.push(
      "Spell-typed card has board-persistence markers (turn triggers or board triggers[])",
    );
  }
  return issues;
}
