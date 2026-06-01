// src/data/deckLoader.ts
import { state } from "../core/gameState.js";
import { drawCard, shuffleInPlace } from "../core/utils.js";
import { adapter } from "../core/adapter.js";
import { getCardDetails } from "./cardDatabase.js";
import { logEvent } from "../core/logger.js";
import type { CardInstance } from "../core/types/index.js";
import type {
  FetchedDeck,
  RawDeck,
  RawDeckCardEntry,
} from "./rawDeck.js";
import { isRawDeckObject } from "./rawDeck.js";

function normalizeDeck(raw: RawDeck, deckFile?: string): RawDeckCardEntry[] {
  const expanded: RawDeckCardEntry[] = [];
  const isOrdered = isRawDeckObject(raw) && !!raw.ordered;

  // Testing decks: skip shuffle to preserve deterministic order
  const isTestDeck = deckFile?.toLowerCase().includes("0_testing");

  if (Array.isArray(raw)) {
    for (const item of raw) {
      expanded.push(typeof item === "string" ? { name: item } : item);
    }
  } else if (raw.cards && Array.isArray(raw.cards)) {
    for (const entry of raw.cards) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) {
        const { count: _omit, ...rest } = entry;
        expanded.push(rest);
      }
    }
  }

  if (isOrdered || isTestDeck) {
    // We draw with deck.pop(), so reverse to make JSON[0] the first drawn.
    return expanded.reverse();
  }

  shuffleInPlace(expanded);
  return expanded;
}

function enrichDeck(rawDeck: RawDeck, deckFile?: string): CardInstance[] {
  const deck = normalizeDeck(rawDeck, deckFile);
  return deck.map((card) => {
    const fullData =
      (card.id != null && getCardDetails(String(card.id))) ||
      (card.name != null && getCardDetails(card.name));

    const base = fullData ? { ...fullData, ...card } : { ...card };
    return { ...base, uid: state.rng.makeUid() } as CardInstance;
  });
}

async function fetchDeck(deckId: string): Promise<FetchedDeck> {
  const root = window.APP_ROOT ?? "/";
  let file = String(deckId)
    .replace(/^\/?decks\//i, "")
    .replace(/^\/+/, "");
  if (!/\.json$/i.test(file)) file += ".json";
  const url = `${root}decks/${file}`;
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Deck not found at ${url}`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `Deck not found at ${url} (server returned HTML — check the deck name and that decks/${file} exists)`,
    );
  }
  const obj = (await res.json()) as RawDeck;
  return Object.assign(obj as object, { __deckFile: file }) as FetchedDeck;
}

export async function loadBlueDeck(deckName: string) {
  const loaded = await fetchDeck(deckName);
  state.players.first.deckFile = loaded.__deckFile;
  const enriched = enrichDeck(loaded, loaded.__deckFile);

  state.players.first.deck.length = 0;
  state.players.first.deck.push(...enriched);
  state.players.first.hand.length = 0;
  state.players.first.board.length = 0;
  state.players.first.graveyard.length = 0;

  state.players.first.hp = 20;
  state.players.first.pp = 1;
  state.players.first.maxPP = 1;
  for (let i = 0; i < 4; i++) drawCard(state.players.first.hand, state.players.first.deck);

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
  const enriched = enrichDeck(loaded, loaded.__deckFile);

  state.players.second.deck.length = 0;
  state.players.second.deck.push(...enriched);
  state.players.second.hand.length = 0;
  state.players.second.board.length = 0;
  state.players.second.graveyard.length = 0;

  state.players.second.hp = 20;
  state.players.second.pp = 1;
  state.players.second.maxPP = 1;
  for (let i = 0; i < 4; i++) drawCard(state.players.second.hand, state.players.second.deck);

  logEvent("deckLoad", {
    owner: "second",
    file: state.players.second.deckFile,
    count: state.players.second.deck.length,
  });

  adapter.render();
}
