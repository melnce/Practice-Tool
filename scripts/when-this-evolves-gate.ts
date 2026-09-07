/**
 * When-this-evolves gate — printed "When this follower (super-)evolves" lines
 * must be flagged for effect-granted evolve (card-level evolve_trigger_always
 * or per-effect on_any_evolve). Cards carrying evolve_trigger_always must have
 * that wording in their description.
 *
 * Distinct from "Evolve:" lines, which run only when the player spends EP
 * (official Q&A Olivia 10104110).
 */

type CardJson = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  evolve_trigger_always?: boolean;
  evolve?: unknown;
  superevolve?: unknown;
};

export type WhenThisEvolvesGateIssue = {
  id: string;
  name: string;
  kind: "error";
  message: string;
};

const WHEN_THIS_EVOLVES_RE = /when this follower (super-)?evolves/i;

function collectEffects(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  if (
    root &&
    typeof root === "object" &&
    Array.isArray((root as { effects?: unknown[] }).effects)
  ) {
    return [...(root as { effects: unknown[] }).effects];
  }
  return [];
}

function allEffectsOnAnyEvolve(effects: unknown[]): boolean {
  if (effects.length === 0) return false;
  return effects.every(
    (e) =>
      e &&
      typeof e === "object" &&
      (e as { on_any_evolve?: boolean }).on_any_evolve === true,
  );
}

type WhenLine = { line: string; mode: "normal" | "super" };

function whenThisEvolvesLines(description: string): WhenLine[] {
  const out: WhenLine[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    if (!WHEN_THIS_EVOLVES_RE.test(line)) continue;
    const mode = /when this follower super-evolves/i.test(line)
      ? "super"
      : "normal";
    out.push({ line, mode });
  }
  return out;
}

export function checkWhenThisEvolvesForCard(
  card: CardJson,
): WhenThisEvolvesGateIssue[] {
  const desc = String(card.description ?? "");
  const hasWording = WHEN_THIS_EVOLVES_RE.test(desc);
  const flagged = card.evolve_trigger_always === true;
  const issues: WhenThisEvolvesGateIssue[] = [];

  if (flagged && !hasWording) {
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: `${card.id} ${card.name}: evolve_trigger_always is true but description lacks "when this follower evolves" / "when this follower super-evolves"`,
    });
    return issues;
  }

  if (!hasWording) return issues;

  if (flagged) return issues;

  const lines = whenThisEvolvesLines(desc);
  for (const { line, mode } of lines) {
    const section = mode === "super" ? card.superevolve : card.evolve;
    const effects = collectEffects(section);
    if (allEffectsOnAnyEvolve(effects)) continue;
    const sectionLabel = mode === "super" ? "superevolve[]" : "evolve[]";
    issues.push({
      id: card.id,
      name: card.name,
      kind: "error",
      message: `${card.id} ${card.name}: printed "${line}" but missing evolve_trigger_always and not all ${sectionLabel} effects have on_any_evolve`,
    });
  }

  return issues;
}
