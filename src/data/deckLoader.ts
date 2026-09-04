// src/data/deckLoader.ts
import { state } from "../core/gameState.js";
import { drawCard, shuffleInPlace } from "../core/utils.js";
import { adapter } from "../core/adapter.js";
import { getCardDetails, getGlobalCardIndex } from "./cardIndex.js";
import { logEvent } from "../core/logger.js";
import type { CardInstance } from "../core/types/index.js";
import { expandDeckEntries } from "./deckExpand.js";
import { findUnknownCards } from "./deckValidation.js";
import type { FetchedDeck, RawDeck, RawDeckCardEntry } from "./rawDeck.js";
import { isRawDeckObject } from "./rawDeck.js";
import { getImportedDeckRaw } from "./importedDeckStore.js";

function normalizeDeck(raw: RawDeck, deckFile?: string): RawDeckCardEntry[] {
  const expanded = expandDeckEntries(raw);
  const isOrdered = isRawDeckObject(raw) && !!raw.ordered;

  if (isOrdered) {
    return expanded.reverse();
  }

  shuffleInPlace(expanded);
  return expanded;
}

function assertDeckCardsResolvable(raw: RawDeck, deckFile: string): void {
  const index = getGlobalCardIndex();
  if (!index) return;

  const unknown = findUnknownCards(expandDeckEntries(raw), index);
  const realUnknown = unknown.filter((c) => c !== "(empty entry)");
  if (realUnknown.length === 0) return;

  const deckId = deckFile.replace(/\.json$/i, "");
  throw new Error(
    `Deck "${deckId}": unknown card(s): ${realUnknown.join(", ")} (not in card database)`,
  );
}

function enrichDeck(
  rawDeck: RawDeck,
  deckFile: string | undefined,
  owner: "first" | "second",
): CardInstance[] {
  assertDeckCardsResolvable(rawDeck, deckFile ?? "unknown");

  const deck = normalizeDeck(rawDeck, deckFile);
  return deck.map((card) => {
    const fullData =
      (card.id != null && getCardDetails(String(card.id))) ||
      (card.name != null && getCardDetails(card.name));

    const base = fullData ? { ...fullData, ...card } : { ...card };
    return { ...base, uid: state.rng.makeUid(), owner } as CardInstance;
  });
}

async function fetchDeck(deckId: string): Promise<FetchedDeck> {
  let file = String(deckId)
    .replace(/^\/?decks\//i, "")
    .replace(/^\/+/, "");
  if (!/\.json$/i.test(file)) file += ".json";
  const id = file.replace(/\.json$/i, "");

  // Session-imported decks (paste / JSON file) — not fetched from decks/
  const imported = getImportedDeckRaw(id);
  if (imported) {
    return Object.assign({ ...imported } as object, {
      __deckFile: file,
    }) as FetchedDeck;
  }

  const root = window.APP_ROOT ?? "/";
  const url = `${root}decks/${file}`;
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Deck not found at ${url}`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `Deck not found at ${url} (server returned HTML — check the deck name and that decks/${file} exists)`,
    );
  }
  let obj: RawDeck;
  try {
    obj = (await res.json()) as RawDeck;
  } catch {
    throw new Error(`Deck "${file.replace(/\.json$/i, "")}": invalid JSON`);
  }
  return Object.assign(obj as object, { __deckFile: file }) as FetchedDeck;
}

export async function loadBlueDeck(deckName: string) {
  const loaded = await fetchDeck(deckName);
  state.players.first.deckFile = loaded.__deckFile;
  const enriched = enrichDeck(loaded, loaded.__deckFile, "first");

  state.players.first.deck.length = 0;
  state.players.first.deck.push(...enriched);
  state.players.first.hand.length = 0;
  state.players.first.board.length = 0;
  state.players.first.graveyard.length = 0;

  state.players.first.hp = 20;
  state.players.first.pp = 1;
  state.players.first.maxPP = 1;
  for (let i = 0; i < 4; i++)
    drawCard(state.players.first.hand, state.players.first.deck);

  logEvent("deckLoad", {
    owner: "first",
    file: state.players.first.deckFile,
    count: state.players.first.deck.length,
  });

  adapter.render();
}

export async function loadRedDeck(deckName: string) {
  const loaded = await fetchDeck(deckName);
  state.players.second.deckFile = loaded.__deckFile;
  const enriched = enrichDeck(loaded, loaded.__deckFile, "second");

  state.players.second.deck.length = 0;
  state.players.second.deck.push(...enriched);
  state.players.second.hand.length = 0;
  state.players.second.board.length = 0;
  state.players.second.graveyard.length = 0;

  state.players.second.hp = 20;
  state.players.second.pp = 1;
  state.players.second.maxPP = 1;
  for (let i = 0; i < 4; i++)
    drawCard(state.players.second.hand, state.players.second.deck);

  logEvent("deckLoad", {
    owner: "second",
    file: state.players.second.deckFile,
    count: state.players.second.deck.length,
  });

  adapter.render();
}

/** QA harness: load a deck from in-memory JSON (no fetch). */
export function loadPlayerDeckFromRaw(
  owner: "first" | "second",
  raw: RawDeck,
  deckFile = "qa_deck.json",
  drawOpening = true,
): void {
  const player = state.players[owner];
  player.deckFile = deckFile;
  const enriched = enrichDeck(raw, deckFile, owner);

  player.deck.length = 0;
  player.deck.push(...enriched);
  player.hand.length = 0;
  player.board.length = 0;
  player.graveyard.length = 0;

  player.hp = 20;
  player.pp = 1;
  player.maxPP = 1;

  if (drawOpening) {
    for (let i = 0; i < 4; i++) drawCard(player.hand, player.deck, owner);
  }

  logEvent("deckLoad", {
    owner,
    file: deckFile,
    count: player.deck.length,
    source: "qa_raw",
  });

  adapter.render();
}

export function loadDecksFromRaw(
  blue: RawDeck,
  red: RawDeck,
  options?: { drawOpening?: boolean },
): void {
  const draw = options?.drawOpening !== false;
  loadPlayerDeckFromRaw("first", blue, "qa_blue.json", draw);
  loadPlayerDeckFromRaw("second", red, "qa_red.json", draw);
}
