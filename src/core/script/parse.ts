import {
  SCRIPT_SCHEMA_VERSION,
  ScriptSchemaError,
  type ScriptDocument,
  type ScriptStep,
  type ScriptCardRef,
  type ScriptDefenderRef,
} from "./types.js";
import type { Player } from "../types/player.js";
import { normalizeSeed } from "../seed.js";

function isPlayer(v: unknown): v is Player {
  return v === "first" || v === "second";
}

function parseCardRef(raw: unknown, path: string): ScriptCardRef {
  if (!raw || typeof raw !== "object") {
    throw new ScriptSchemaError(`${path}: expected card ref object`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.cardId !== "string" || !o.cardId) {
    throw new ScriptSchemaError(`${path}.cardId: required non-empty string`);
  }
  const ref: ScriptCardRef = { cardId: o.cardId };
  if (o.occ !== undefined) {
    if (typeof o.occ !== "number" || !Number.isInteger(o.occ) || o.occ < 0) {
      throw new ScriptSchemaError(`${path}.occ: expected non-negative integer`);
    }
    ref.occ = o.occ;
  }
  return ref;
}

function parseDefenderRef(raw: unknown, path: string): ScriptDefenderRef {
  if (!raw || typeof raw !== "object") {
    throw new ScriptSchemaError(`${path}: expected defender ref`);
  }
  const o = raw as Record<string, unknown>;
  if (o.kind === "leader") return { kind: "leader" };
  return parseCardRef(raw, path);
}

function parseStep(raw: unknown, index: number): ScriptStep {
  if (!raw || typeof raw !== "object") {
    throw new ScriptSchemaError(`steps[${index}]: expected object`);
  }
  const o = raw as Record<string, unknown>;
  const op = o.op;
  switch (op) {
    case "END_TURN":
      return { op: "END_TURN" };
    case "PLAY_CARD":
      return {
        op: "PLAY_CARD",
        card: parseCardRef(o.card, `steps[${index}].card`),
      };
    case "ATTACK":
      return {
        op: "ATTACK",
        attacker: parseCardRef(o.attacker, `steps[${index}].attacker`),
        defender: parseDefenderRef(o.defender, `steps[${index}].defender`),
      };
    case "EVOLVE": {
      if (o.mode !== "normal" && o.mode !== "super") {
        throw new ScriptSchemaError(
          `steps[${index}].mode: expected "normal" | "super"`,
        );
      }
      return {
        op: "EVOLVE",
        card: parseCardRef(o.card, `steps[${index}].card`),
        mode: o.mode,
      };
    }
    case "ENGAGE":
      return {
        op: "ENGAGE",
        card: parseCardRef(o.card, `steps[${index}].card`),
      };
    case "BONUS_PP":
      return { op: "BONUS_PP" };
    case "CHOOSE_TARGET":
      return {
        op: "CHOOSE_TARGET",
        target: parseDefenderRef(o.target, `steps[${index}].target`),
      };
    case "CHOOSE_MODE": {
      if (
        !Array.isArray(o.indices) ||
        o.indices.some((n) => typeof n !== "number")
      ) {
        throw new ScriptSchemaError(
          `steps[${index}].indices: expected number[]`,
        );
      }
      return { op: "CHOOSE_MODE", indices: o.indices.map((n) => Number(n)) };
    }
    case "TOGGLE_MULLIGAN":
      return {
        op: "TOGGLE_MULLIGAN",
        card: parseCardRef(o.card, `steps[${index}].card`),
      };
    case "CONFIRM_MULLIGAN":
      return { op: "CONFIRM_MULLIGAN" };
    default:
      throw new ScriptSchemaError(
        `steps[${index}].op: unknown op ${JSON.stringify(op)}`,
      );
  }
}

/** Parse and validate a script document. Rejects unknown schema versions. */
export function parseScriptDocument(raw: unknown): ScriptDocument {
  if (!raw || typeof raw !== "object") {
    throw new ScriptSchemaError("Script root must be an object");
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCRIPT_SCHEMA_VERSION) {
    throw new ScriptSchemaError(
      `Unsupported schemaVersion ${JSON.stringify(o.schemaVersion)}; expected ${SCRIPT_SCHEMA_VERSION}`,
    );
  }
  if (typeof o.name !== "string" || !o.name.trim()) {
    throw new ScriptSchemaError("name: required non-empty string");
  }
  if (!isPlayer(o.scriptedSide)) {
    throw new ScriptSchemaError('scriptedSide: expected "first" | "second"');
  }
  if (!Array.isArray(o.steps)) {
    throw new ScriptSchemaError("steps: expected array");
  }
  const doc: ScriptDocument = {
    schemaVersion: SCRIPT_SCHEMA_VERSION,
    name: o.name.trim(),
    scriptedSide: o.scriptedSide,
    steps: o.steps.map((s, i) => parseStep(s, i)),
  };
  if (typeof o.seed === "number" && Number.isFinite(o.seed)) {
    doc.seed = o.seed;
  } else if (typeof o.seed === "string" && o.seed.trim() !== "") {
    try {
      doc.seed = normalizeSeed(o.seed);
    } catch {
      /* ignore invalid */
    }
  }
  if (typeof o.deckAId === "string") doc.deckAId = o.deckAId;
  if (typeof o.deckBId === "string") doc.deckBId = o.deckBId;
  if (typeof o.notes === "string") doc.notes = o.notes;
  return doc;
}

export function scriptToJson(doc: ScriptDocument): string {
  return JSON.stringify(doc, null, 2);
}
