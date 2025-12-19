
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Effect {
    op: string;
    [key: string]: any;
}

export interface Card {
    id: string;
    name: string;
    type: string;
    cost: string | number;
    class?: string;
    fanfare?: Effect[];
    evolve?: Effect[];
    superevolve?: Effect[];
    spell?: Effect[];
    keywords?: any[];
    triggers?: any[];
    [key: string]: any;
}

export interface OpSignature {
    op: string;
    target?: string;
    select?: boolean | number;
    hasCondition?: boolean;
    hasEffects?: boolean; // For gates/nested
    keyParams: string[];
}

export interface SignatureEntry {
    signature: string;
    normalizedSig: OpSignature;
    representativeCard: string;
    representativeCardId: string;
    zone: string; // fanfare, evolve, spell, etc.
    count: number;
    cards: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeEffect(eff: Effect): OpSignature {
    const sig: OpSignature = {
        op: eff.op,
        keyParams: [],
    };

    // Target
    if (eff.target) {
        sig.target = String(eff.target);
        sig.keyParams.push(`target:${sig.target}`);
    }

    // Select
    if (eff.select !== undefined) {
        sig.select = eff.select;
        sig.keyParams.push(`select:${eff.select}`);
    }

    // Condition
    if (eff.condition) {
        sig.hasCondition = true;
        sig.keyParams.push("has_condition");
    }

    // Nested effects (for gates)
    if (eff.effects && Array.isArray(eff.effects) && eff.effects.length > 0) {
        sig.hasEffects = true;
        sig.keyParams.push("has_nested_effects");
    }

    // Key numerical params
    if (eff.amount !== undefined) sig.keyParams.push(`amount:${eff.amount}`);
    if (eff.count !== undefined) sig.keyParams.push(`count:${eff.count}`);
    if (eff.cost !== undefined) sig.keyParams.push(`cost:${eff.cost}`);
    if (eff.name !== undefined) sig.keyParams.push(`name:${eff.name}`);

    return sig;
}

export function signatureToString(sig: OpSignature): string {
    const parts = [sig.op];
    if (sig.keyParams.length > 0) {
        parts.push(`(${sig.keyParams.sort().join(",")})`);
    }
    return parts.join("");
}

function extractEffectsFromArray(effects: Effect[], zone: string, card: Card, results: Map<string, SignatureEntry>) {
    if (!Array.isArray(effects)) return;

    for (const eff of effects) {
        if (!eff || !eff.op) continue;

        const normalized = normalizeEffect(eff);
        const sigStr = signatureToString(normalized);

        if (results.has(sigStr)) {
            const entry = results.get(sigStr)!;
            entry.count++;
            if (!entry.cards.includes(card.name)) {
                entry.cards.push(card.name);
            }
        } else {
            results.set(sigStr, {
                signature: sigStr,
                normalizedSig: normalized,
                representativeCard: card.name,
                representativeCardId: card.id,
                zone,
                count: 1,
                cards: [card.name],
            });
        }

        // Recurse into nested effects
        if (eff.effects) extractEffectsFromArray(eff.effects, zone, card, results);
        if (eff.options) {
            for (const opt of eff.options) {
                if (opt.effects) extractEffectsFromArray(opt.effects, zone, card, results);
            }
        }
    }
}

function extractKeywordEffects(keywords: any[], zone: string, card: Card, results: Map<string, SignatureEntry>) {
    if (!Array.isArray(keywords)) return;

    for (const kw of keywords) {
        if (typeof kw === "object" && kw !== null) {
            // Keywords like LastWords, Enhance, etc. can have effects
            if (kw.effects) extractEffectsFromArray(kw.effects, `keyword:${kw.name || "unknown"}`, card, results);
        }
    }
}

function extractTriggerEffects(triggers: any[], card: Card, results: Map<string, SignatureEntry>) {
    if (!Array.isArray(triggers)) return;

    for (const trig of triggers) {
        if (trig && trig.effects) {
            extractEffectsFromArray(trig.effects, `trigger:${trig.event || "unknown"}`, card, results);
        }
    }
}

export function processCard(card: Card, results: Map<string, SignatureEntry>) {
    // Fanfare
    if (card.fanfare) extractEffectsFromArray(card.fanfare, "fanfare", card, results);

    // Evolve
    if (card.evolve) extractEffectsFromArray(card.evolve, "evolve", card, results);

    // Super-evolve
    if (card.superevolve) extractEffectsFromArray(card.superevolve, "superevolve", card, results);

    // Spell
    if (card.spell) extractEffectsFromArray(card.spell, "spell", card, results);

    // Keywords with effects
    if (card.keywords) extractKeywordEffects(card.keywords, "keyword", card, results);

    // Triggers
    if (card.triggers) extractTriggerEffects(card.triggers, card, results);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan Logic
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanResult {
    signatures: Map<string, SignatureEntry>;
    setStats: { name: string; cardCount: number }[];
}

export function scanSets(setsDir: string, setsToScan: string[], tokensFile?: string): ScanResult {
    const results = new Map<string, SignatureEntry>();
    const setStats: { name: string; cardCount: number }[] = [];

    // Scan main sets
    for (const setFile of setsToScan) {
        const filePath = path.join(setsDir, setFile);
        if (!fs.existsSync(filePath)) {
            console.warn(`Set file not found: ${filePath}`);
            continue;
        }

        const raw = fs.readFileSync(filePath, "utf-8");
        const cards: Card[] = JSON.parse(raw);

        setStats.push({ name: setFile, cardCount: cards.length });

        for (const card of cards) {
            processCard(card, results);
        }
    }

    // Scan tokens
    if (tokensFile && fs.existsSync(tokensFile)) {
        const raw = fs.readFileSync(tokensFile, "utf-8");
        const tokens: Card[] = JSON.parse(raw);
        setStats.push({ name: "token_details.json", cardCount: tokens.length });

        for (const token of tokens) {
            processCard(token, results);
        }
    }

    return { signatures: results, setStats };
}
