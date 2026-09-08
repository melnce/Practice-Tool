/**
 * op-key-shape guards for filter/condition on routes where the engine rejects them.
 */

import type { CardJson } from "./loadCards.js";

export type RouteGuardWarning = {
  id: string;
  name: string;
  path: string;
  note: string;
  found: string;
};

function compact(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function hasPoolNarrowObject(obj: Record<string, unknown>): boolean {
  for (const field of ["filter", "filters", "condition"] as const) {
    const val = obj[field];
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      if (Object.keys(val as object).length > 0) return true;
    }
  }
  return false;
}

function walk(
  node: unknown,
  path: string,
  visit: (obj: Record<string, unknown>, path: string) => void,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`, visit));
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj, path);
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === "object") {
      walk(val, path ? `${path}.${key}` : key, visit);
    }
  }
}

export function checkRouteDropSiblingGuards(
  card: CardJson,
): RouteGuardWarning[] {
  const out: RouteGuardWarning[] = [];

  walk(card, "$", (obj, path) => {
    const op = String(obj.op ?? "");
    if (!op) return;

    if (op === "summon" && obj.source === "named" && hasPoolNarrowObject(obj)) {
      out.push({
        id: card.id,
        name: card.name,
        path,
        found: compact({ op, source: "named", filter: obj.filter ?? null }),
        note: 'op:"summon" with source:"named" must not carry filter/condition — the name already selects the card',
      });
    }

    if (
      op === "destroy" &&
      typeof obj.scope === "string" &&
      obj.scope &&
      hasPoolNarrowObject(obj)
    ) {
      out.push({
        id: card.id,
        name: card.name,
        path,
        found: compact({ op, scope: obj.scope, filter: obj.filter ?? null }),
        note: 'op:"destroy" with scope names its target outright — filter/condition is not supported',
      });
    }

    if (
      op === "discard" &&
      obj.mode === "except_named" &&
      hasPoolNarrowObject(obj)
    ) {
      out.push({
        id: card.id,
        name: card.name,
        path,
        found: compact({
          op,
          mode: "except_named",
          filter: obj.filter ?? null,
        }),
        note: 'op:"discard" with mode:"except_named" must not carry filter/condition — names list what to keep',
      });
    }

    if (
      op === "add_to_hand" &&
      (obj.source === "named" || obj.source === "copy") &&
      hasPoolNarrowObject(obj)
    ) {
      out.push({
        id: card.id,
        name: card.name,
        path,
        found: compact({ op, source: obj.source, filter: obj.filter ?? null }),
        note: `op:"add_to_hand" with source:"${obj.source}" must not carry filter/condition on this route`,
      });
    }
  });

  return out;
}
