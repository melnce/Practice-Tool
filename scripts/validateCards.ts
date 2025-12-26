/**
 * @file LLM Card Validator
 *
 * DESIGN: Uses OpenAI/Gemini to validate that card effects match their descriptions.
 * Analyzes card effect arrays and asks the LLM if behavior matches description.
 *
 * USAGE:
 *   1. Set OPENAI_API_KEY or GEMINI_API_KEY in .env file
 *   2. Run: npx tsx scripts/validateCards.ts
 *   3. Review output in tests/validation/report.json
 *
 * OPTIONS:
 *   --limit=N     Only validate N cards (for testing)
 *   --start=ID    Start from card ID
 *   --verbose     Print each card result
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
config({ path: path.join(__dirname, "..", ".env") });

// Support both OpenAI and Gemini
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    console.error("❌ Missing API key in .env file");
    console.error("   Add one of:");
    console.error("   GEMINI_API_KEY=... (free: https://aistudio.google.com/app/apikey)");
    console.error("   OPENAI_API_KEY=sk-...");
    process.exit(1);
}

const USE_GEMINI = !!GEMINI_API_KEY && !OPENAI_API_KEY;

// =============================================================================
// CONFIG
// =============================================================================

const BATCH_SIZE = 2; // Lower parallelism to reduce transient failures
const BATCH_DELAY_MS = 500; // Delay between batches to avoid rate limiting
const MAX_RETRIES = 3; // Max retries per request
const MAX_EFFECTS_LINES = 40; // Truncate effects list to prevent output limit issues

// HTTP status codes that should trigger a retry
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504, 520];

// Passive keywords that might appear in description but not in effects array
const PASSIVE_KEYWORDS = [
    "Ward", "Storm", "Bane", "Rush", "Drain", "Ambush", "Barrier",
    "Aura", "Accelerate", "Crystallize", "Invincible"
];

// =============================================================================
// TYPES
// =============================================================================

interface CardDef {
    id: string;
    name: string;
    cost: string | number;
    attack?: string | number;
    defense?: string | number;
    type: string;
    class?: string;
    description?: string | null;
    fanfare?: unknown[];
    evolve?: unknown[];
    superevolve?: unknown[];
    spell?: unknown[];
    keywords?: unknown[];
    triggers?: unknown[];
}

interface ValidationResult {
    cardId: string;
    cardName: string;
    description: string;
    verdict: "PASS" | "FAIL" | "UNCLEAR" | "ERROR";
    reasoning: string;
    stateChanges: string;
    timestamp: string;
    retries?: number; // Number of retries needed
}

interface ValidationReport {
    totalCards: number;
    passed: number;
    failed: number;
    unclear: number;
    errors: number;
    results: ValidationResult[];
    generatedAt: string;
}

// =============================================================================
// LLM API
// =============================================================================

const SYSTEM_PROMPT = `You are a QA engineer validating a trading card game implementation.
Given a card's description and the observed state changes when played, determine if the implementation matches the description.

Rules:
- PASS: State changes match the description (all described effects are implemented)
- FAIL: State changes contradict or are missing effects from the description
- UNCLEAR: Cannot determine (missing info, conditional effects not shown, etc.)

IMPORTANT EQUIVALENCES (treat as identical, NEVER fail for these):
- "Search for X" === "Draw X" (search is draw with a filter)
- "Summon Magic Sediment" === "Gain an earth sigil" (same mechanic)
- "ally:leader" === "your leader" (same target)
- Super-Evolve duplicating Evolve effects is EXPECTED (inheritance)
- Passive Keywords detected from description are informational only
- +0/-2 and -0/-2 are functionally identical (zero attack change)
- "Engage (sacrifice: true)" means the card is destroyed when activated (self-destruction is implicit)
- "Engage (sacrifice: false)" means the card is NOT destroyed when activated (just pays PP cost)
- "Destroy all followers" with sacrifice: true === "Destroy this card and all followers"
- Crest "Definition:" text describes what the crest WILL DO later, not an immediate effect
- "Gain Crest: X" followed by Definition is CORRECT - the crest is gained, definition is informational
- "Super Skybound Art" === "Skybound Art 15" (Super SBA requires SBA count of 15 to activate)

ENGAGE MECHANIC SEMANTICS (CRITICAL - read carefully):
- "Engage (N):" in description = PAY N PP to activate, card NOT destroyed = sacrifice: false is CORRECT
- "Engage:" with no number, and explicit "Destroy this card" = sacrifice: true is CORRECT
- The number in parentheses (N) is the PP COST, NOT a sacrifice indicator
- If description says "Engage (1):" and implementation shows "Engage (sacrifice: false)", this is CORRECT (pays 1 PP, not destroyed)
- If description says "Engage: Destroy this card" and implementation shows "Engage (sacrifice: true)", this is CORRECT

Be lenient on minor wording differences. Only FAIL for genuinely missing or contradicting effects.`;


// JSON Schema for Structured Outputs
const VALIDATION_SCHEMA = {
    name: "card_validation",
    strict: true,
    schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            verdict: { type: "string", enum: ["PASS", "FAIL", "UNCLEAR"] },
            reasoning: { type: "string", description: "One line explanation" }
        },
        required: ["verdict", "reasoning"]
    }
};

// Sleep helper with jitter for exponential backoff
function sleep(ms: number): Promise<void> {
    const jitter = Math.random() * 100;
    return new Promise(resolve => setTimeout(resolve, ms + jitter));
}

interface LLMResponse {
    verdict: "PASS" | "FAIL" | "UNCLEAR";
    reasoning: string;
}

// Safely parse JSON with fallback
function safeJsonParse(text: string): LLMResponse | null {
    try {
        if (!text || text.trim().length === 0) return null;
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function askGemini(prompt: string): Promise<LLMResponse> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: SYSTEM_PROMPT + "\n\n" + prompt + "\n\nRespond with JSON: {\"verdict\": \"PASS|FAIL|UNCLEAR\", \"reasoning\": \"...\"}" }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 200,
                    responseMimeType: "application/json"
                }
            }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = safeJsonParse(text);
    if (!parsed) {
        throw new Error(`Failed to parse Gemini response: ${text.slice(0, 100)}`);
    }
    return parsed;
}

async function askOpenAI(prompt: string): Promise<LLMResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: prompt }
            ],
            temperature: 0,
            max_tokens: 200,
            response_format: {
                type: "json_schema",
                json_schema: VALIDATION_SCHEMA
            }
        }),
    });

    // Check for retryable errors
    if (!response.ok) {
        const errorText = await response.text();
        const isRetryable = RETRYABLE_STATUS_CODES.includes(response.status);
        const error = new Error(`OpenAI API error: ${response.status}`) as Error & { retryable?: boolean };
        error.retryable = isRetryable;
        throw error;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(text);
    if (!parsed) {
        const error = new Error(`Failed to parse OpenAI response: ${text.slice(0, 100)}`) as Error & { retryable?: boolean };
        error.retryable = true; // Retry on parse failures
        throw error;
    }
    return parsed;
}

// Retry wrapper with exponential backoff
async function askLLMWithRetry(prompt: string): Promise<{ response: LLMResponse; retries: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = USE_GEMINI ? await askGemini(prompt) : await askOpenAI(prompt);
            return { response, retries: attempt };
        } catch (err) {
            lastError = err as Error;
            const isRetryable = (err as Error & { retryable?: boolean }).retryable ?? true;

            if (!isRetryable || attempt === MAX_RETRIES - 1) {
                throw lastError;
            }

            // Exponential backoff: 1s, 2s, 4s
            const backoffMs = Math.pow(2, attempt) * 1000;
            await sleep(backoffMs);
        }
    }

    throw lastError || new Error("Max retries exceeded");
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatTarget(target: unknown, select?: number): string {
    if (typeof target !== "string") return String(target);

    // If explicit count is provided (select > 0), use singular form where appropriate
    // If no count (undefined or 0), assume "ALL" (plural)
    const isPlural = (!select && select !== 0) || (select !== undefined && select > 1);

    // Explicit mappings for common targets
    // Format: [Singular, Plural]
    const mappings: Record<string, [string, string]> = {
        "enemy:follower": ["enemy follower", "enemy followers"],
        "ally:follower": ["allied follower", "allied followers"],
        "other:follower": ["other follower", "other followers"],
        "all:follower": ["follower", "followers"],
        "enemy:amulet": ["enemy amulet", "enemy amulets"],
        "ally:amulet": ["allied amulet", "allied amulets"],
    };

    if (mappings[target]) {
        const noun = isPlural ? mappings[target][1] : mappings[target][0];
        // Prepend "all" only if we are targeting everything (no specific select count)
        if (isPlural && (!select && select !== 0)) {
            return `all ${noun}`;
        }
        return noun;
    }

    // Default formatting substitutions
    return target
        .replace("ally:leader", "your leader")
        .replace("enemy:leader", "enemy leader")
        .replace("ally:follower", "allied follower")
        .replace("enemy:follower", "enemy follower")
        .replace("all:follower", "all followers")
        .replace("other:follower", "other followers")
        .replace("_", " ");
}

function formatStat(value: unknown, isSet = false): string {
    if (value === undefined || value === null) return "";
    const num = Number(value);
    if (isNaN(num)) return String(value);
    // Show sign for non-zero values, just the number for zero
    if (num === 0) return "0";
    if (isSet) return String(num);
    return num > 0 ? `+${num}` : `${num}`;
}

function formatDynamicValue(value: unknown, description?: string): string {
    if (value === undefined || value === null) {
        // Try to infer from common patterns
        return "X";
    }
    if (typeof value === "string" && value.startsWith("{")) {
        // Dynamic reference like {self.spellboostCount}
        if (value.includes("spellboostCount")) return "X (Spellboost count)";
        if (value.includes("combo")) return "X (Combo count)";
        if (value.includes("earth_counter")) return "X (Earth sigils)";
        if (value.includes("shadows")) return "X (Shadows)";
        if (value.includes("hand_count")) return "X (cards in hand)";
        return "X (dynamic)";
    }
    return String(value);
}

// =============================================================================
// STATE CAPTURE (Effect Analysis)
// =============================================================================

function analyzeExpectedEffects(card: CardDef): string[] {
    const effects: string[] = [];

    function extractFromEffects(arr: unknown[] | undefined, trigger: string, isElseBranch = false) {
        if (!Array.isArray(arr) || arr.length === 0) return;

        for (const effect of arr) {
            if (!effect || typeof effect !== "object") continue;
            const e = effect as Record<string, unknown>;

            switch (e.op) {
                case "draw":
                    effects.push(`${trigger}: Draw ${e.count || 1} card(s)`);
                    break;
                case "select": {
                    const selectCount = (e.select as number) || (e.count as number) || 1;
                    const selectTarget = formatTarget(e.target, selectCount);
                    const filterCond = e.filter as Record<string, unknown> | undefined;
                    let targetStr = selectTarget;
                    if (filterCond) {
                        const filterParts: string[] = [];
                        if (filterCond.type) filterParts.push(`type=${filterCond.type}`);
                        if (filterCond.tribe) filterParts.push(`tribe=${filterCond.tribe}`);
                        if (filterCond.class) filterParts.push(`class=${filterCond.class}`);
                        if (filterCond.name) filterParts.push(`name=${filterCond.name}`);
                        if (filterParts.length) targetStr += ` (${filterParts.join(", ")})`;
                    }
                    effects.push(`${trigger}: Select ${selectCount} ${targetStr}`);
                    if (e.condition) {
                        const condStr = Object.entries(e.condition as Record<string, unknown>)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ");
                        effects.push(`  └─ Condition: ${condStr}`);
                    }
                    if (Array.isArray(e.effects)) {
                        extractFromEffects(e.effects as unknown[], `  └─ Selection Effect`);
                    }
                    break;
                }
                case "add_to_hand": {
                    const name = e.name || "[dynamic card]";
                    effects.push(`${trigger}: Add ${e.count || 1}x ${name} to hand`);
                    break;
                }
                case "damage": {
                    const amt = formatDynamicValue(e.amount);
                    const count = e.count as number | undefined;
                    const repeat = e.repeat as number | undefined;
                    const times = repeat || count || 1;
                    const dynamicAmt = e.amount_source ? ` (X = ${e.amount_source})` : "";
                    const addAmt = e.add_amount ? ` + (X = ${e.add_amount})` : "";
                    const condition = e.condition as { not_self?: boolean } | undefined;

                    const dist = e.distribution as string | undefined;
                    let targetStr = formatTarget(e.target, e.select as number);

                    if (dist) {
                        if (dist.includes("random")) {
                            targetStr = targetStr.replace(/^all /, "random ").replace(/^enemy/, "random enemy");
                            if (!targetStr.includes("random")) targetStr = `random ${targetStr}`;
                        } else if (dist.includes("split")) {
                            targetStr = `split between ${targetStr}`;
                        } else if (dist === "by_stat" || dist === "highest" || dist === "lowest") {
                            const stat = e.stat || "attack";
                            const dir = dist === "lowest" ? "lowest" : "highest";
                            if (targetStr.startsWith("random ")) {
                                targetStr = `random ${targetStr.replace("random ", "")} with ${dir} ${stat}`;
                            } else {
                                targetStr = `${targetStr} with ${dir} ${stat}`;
                            }
                        }
                    }

                    if (condition?.not_self) {
                        targetStr += " (excluding self)";
                    }
                    if (e.can_target_leader || e.spill_to_leader) {
                        targetStr += " or enemy leader";
                    }

                    if (times > 1) {
                        if (dist === "random") {
                            // Distinct random targets: "Deal X damage to 2 random enemy followers"
                            const baseTarget = targetStr.replace(/s$/, ""); // naive singularize check
                            effects.push(`${trigger}: Deal ${amt}${dynamicAmt}${addAmt} damage to ${times} ${baseTarget}s`);
                        } else {
                            // Repeated hits: "Deal X damage to random enemy follower 2 times"
                            effects.push(`${trigger}: Deal ${amt}${dynamicAmt}${addAmt} damage to ${targetStr} ${times} times`);
                        }
                    } else {
                        // Single target case - singularize if random distribution
                        let finalTarget = targetStr;
                        if (dist === "random" && times === 1) {
                            finalTarget = targetStr.replace(/followers$/, "follower").replace(/enemies$/, "enemy");
                        }
                        effects.push(`${trigger}: Deal ${amt}${dynamicAmt}${addAmt} damage to ${finalTarget}`);
                    }
                    break;
                }
                case "restore": {
                    const amt = formatDynamicValue(e.amount);
                    const dynamicAmt = e.amount_source ? ` (X = ${e.amount_source})` : "";
                    effects.push(`${trigger}: Restore ${amt}${dynamicAmt} to ${formatTarget(e.target || "leader", e.select as number)}`);
                    break;
                }
                case "summon": {
                    if (e.source === "graveyard") {
                        effects.push(`${trigger}: Reanimate (${e.max_cost || "X"})`);
                    } else if (e.mode === "copy") {
                        const src = e.source === "hand" ? "hand" : (e.source || "unknown");
                        const sel = e.source === "self" ? "this" : (e.select ? `selected` : "random");
                        const filterF = e.filter as any;
                        const filterParts = [];
                        if (filterF?.type) filterParts.push(`type=${filterF.type}`);
                        if (filterF?.cost_lte) filterParts.push(`cost<=${filterF.cost_lte}`);
                        const filterStr = filterParts.length ? ` (${filterParts.join(", ")})` : "";
                        let desc = `Summon ${e.count || 1}x copy of ${sel} card from ${src}${filterStr}`;
                        if (e.max_cost) desc += ` (max cost ${e.max_cost})`;
                        if (e.eot_destroy) desc += ` (destroy at end of turn)`;
                        effects.push(`${trigger}: ${desc}`);

                        if (Array.isArray(e.then)) {
                            extractFromEffects(e.then as unknown[], `  └─ Then`);
                        }
                    } else {
                        const name = e.name || "[dynamic summon]";
                        const kws = (e.keywords as string[])?.join(", ");
                        const kwStr = kws ? ` with ${kws}` : "";
                        effects.push(`${trigger}: Summon ${e.count || 1}x ${name}${kwStr}`);
                    }
                    break;
                }
                case "stat": {
                    const isSet = e.action === "set";
                    const atk = e.attack !== undefined ? formatStat(e.attack, isSet) : "";
                    const def = e.defense !== undefined ? `/${formatStat(e.defense, isSet)}` : "";
                    const atkSrc = e.attack_source ? ` (X = ${e.attack_source})` : "";
                    const defSrc = e.defense_source ? ` (X = ${e.defense_source})` : "";

                    let stats = "";
                    if (e.attack !== undefined || e.defense !== undefined || e.attack_source || e.defense_source) {
                        stats = `${atk}${atkSrc}${def}${defSrc}`;
                    } else if (e.action !== "give" && !e.keywords) {
                        // Only default to X if it's a set/buff action without keywords, implying value
                        stats = formatDynamicValue(undefined);
                    }
                    const filter = e.filter as { class?: string; subtype?: string; trait?: string; name?: string; not_self?: boolean } | undefined;
                    const filterStr = filter?.class || filter?.subtype || filter?.trait || "";
                    let target = filterStr ? `${filterStr} ${formatTarget(e.target, e.select as number)}` : formatTarget(e.target, e.select as number);

                    if (e.name) {
                        target += ` named "${e.name}"`;
                    }
                    if (filter?.name) {
                        target += ` named "${filter.name}"`;
                    }
                    if (e.name_filter) {
                        target += ` named "${e.name_filter}"`;
                    }

                    const dist = e.distribution as string | undefined;
                    const filterPosition = typeof e.filter === "string" ? e.filter : undefined;
                    if (filterPosition === "leftmost") {
                        target = `leftmost ${target}`;
                    } else if (e.random === true || (dist && dist.includes("random"))) {
                        target = target.replace(/^all /, "random ").replace(/^enemy/, "random enemy").replace(/^ally/, "random allied").replace(/^allied/, "random allied");
                        if (!target.includes("random")) target = `random ${target}`;
                    }

                    const condition = e.condition as { not_self?: boolean; tribe?: string; class?: string } | undefined;
                    if (condition?.tribe) {
                        target = `${condition.tribe} ${target}`;
                    }
                    if (condition?.class) {
                        target = `${condition.class} ${target}`;
                    }

                    if (condition?.not_self || filter?.not_self) {
                        target += " (excluding self)";
                    }

                    const keywords = (e.keywords as (string | { name: string })[])?.map(k =>
                        typeof k === "string" ? k : k.name
                    ).join(", ") || "";
                    const effectStr = [stats, keywords].filter(Boolean).join(" and ");

                    let durationStr = "";
                    if (e.duration === "opponent_turn_end") durationStr = " until the end of your opponent's turn";
                    else if (e.until_eot) durationStr = " until the end of the turn";

                    effects.push(`${trigger}: ${e.action || "give"} ${effectStr} to ${target}${durationStr}`);
                    break;
                }
                case "keyword": {
                    const kws = (e.keywords as unknown[])?.map(k =>
                        typeof k === "string" ? k : (k as { name?: string })?.name || "unknown"
                    ).join(", ") || (e.name || "unknown");
                    const filter = (e.filter || e.filters) as { class?: string; subtype?: string; trait?: string } | undefined;
                    const filterStr = filter?.class || filter?.subtype || filter?.trait || "";
                    let target = filterStr ? `${filterStr} ${formatTarget(e.target, e.select as number)}` : formatTarget(e.target, e.select as number);

                    const condition = e.condition as { not_self?: boolean; tribe?: string; class?: string } | undefined;
                    if (condition?.tribe) {
                        target = `${condition.tribe} ${target}`;
                    }
                    if (condition?.class) {
                        target = `${condition.class} ${target}`;
                    }
                    if (condition?.not_self || e.exclude_self) {
                        target += " (excluding self)";
                    }

                    const nameFilter = e.name_filter as string | undefined;
                    if (nameFilter) {
                        target += ` named "${nameFilter}"`;
                    }

                    effects.push(`${trigger}: ${e.action || "grant"} ${kws} to ${target}`);
                    break;
                }
                case "destroy": {
                    const count = (e.count as number) || (e.select as number);
                    const condObj = e.condition as { not_self?: boolean; tribe?: string; class?: string; is_super_evolved?: boolean; damaged?: boolean } | undefined;
                    const dist = e.distribution as string | undefined;
                    const targetOrScope = (e.scope as string) || (e.target as string);
                    let target = formatTarget(targetOrScope, count);

                    if (condObj?.tribe) target = `${condObj.tribe} ${target}`;
                    if (condObj?.class) target = `${condObj.class} ${target}`;
                    if (condObj?.not_self) target += " (excluding self)";
                    if (condObj?.is_super_evolved) target = `super-evolved ${target}`;
                    if (condObj?.damaged) target = `damaged ${target}`;

                    if (e.exclude && Array.isArray(e.exclude)) {
                        const excludes = e.exclude.map((ex: string) => ex.replace("context.", "")).join(", ");
                        target += ` (excluding ${excludes})`;
                    }

                    if (dist === "random") {
                        target = `random ${target}`;
                    } else if (dist === "highest") {
                        const stat = e.stat || "attack";
                        target = `random ${target} with highest ${stat}`;
                    } else if (dist === "all") {
                        // Avoid "all all followers" - check if already plural
                        if (!target.startsWith("all ")) {
                            target = `all ${target}s`;
                        }
                        target = target.replace("any allied cards", "allied cards").replace("all ally:any", "all allied cards");
                    }

                    const dynamicCount = e.count_source ? `X (X = ${e.count_source})` : (count && count > 1 ? count : "");

                    if (dynamicCount) {
                        effects.push(`${trigger}: Destroy ${dynamicCount} ${target}`);
                    } else if (dist === "all") {
                        // If distinct all, don't say 1
                        effects.push(`${trigger}: Destroy ${target}`);
                    } else {
                        effects.push(`${trigger}: Destroy ${target}`);
                    }

                    // Extract "then" effects if present
                    if (Array.isArray(e.then)) {
                        extractFromEffects(e.then as unknown[], `  └─ Then`);
                    }
                    break;
                }
                case "evolve":
                    const mode = e.mode === "super" ? "Super-evolve" : "Evolve";
                    effects.push(`${trigger}: ${mode} ${formatTarget(e.target || "self", e.select as number)}`);
                    break;
                case "counter":
                    effects.push(`${trigger}: ${e.action} ${e.amount || 1} to ${e.key} counter`);
                    break;
                case "search": {
                    const filter = e.filter as any || {};
                    const parts = [];
                    if (filter.type) parts.push(`type=${filter.type}`);
                    if (filter.class) parts.push(`class=${filter.class}`);
                    if (filter.trait) parts.push(`trait=${filter.trait}`);
                    if (filter.cost_lte) parts.push(`cost<=${filter.cost_lte}`);
                    if (filter.cost_gte) parts.push(`cost>=${filter.cost_gte}`);
                    if (filter.cost_eq) parts.push(`cost=${filter.cost_eq}`);
                    const filterStr = parts.length ? ` (${parts.join(", ")})` : "";
                    effects.push(`${trigger}: Search for ${e.count || 1} card(s)${filterStr}`);
                    break;
                }
                case "cost": {
                    effects.push(`${trigger}: Cost: ${e.action || e.mode} ${e.amount} to ${formatTarget(e.target || "cards", e.select as number)}`);
                    break;
                }
                case "deck": {
                    effects.push(`${trigger}: Deck: ${e.action} (mode=${e.mode})`);
                    break;
                }
                case "return":
                    effects.push(`${trigger}: Return ${formatTarget(e.target, e.select as number)} to ${e.destination}`);
                    break;
                case "earth_rite":
                case "necromancy": {
                    const cost = e.cost || e.amount || 1;
                    const opName = e.op === "earth_rite" ? "Earth Rite" : "Necromancy";
                    effects.push(`${trigger}: ${opName} (${cost})`);
                    if (Array.isArray(e.effects)) {
                        extractFromEffects(e.effects as unknown[], `  └─ ${opName}`);
                    }
                    if (Array.isArray(e.else_effects)) {
                        extractFromEffects(e.else_effects as unknown[], `  └─ Else`);
                    }
                    break;
                }
                case "banish": {
                    const banishCount = (e.count as number) || (e.select as number);
                    let banishTarget = (e.scope as string) ? (e.scope as string) : formatTarget(e.target, banishCount);
                    const banishDist = e.distribution as string | undefined;
                    if (banishDist === "random") {
                        banishTarget = `random ${banishTarget.replace(/^all /, "")}`;
                    }
                    if (banishCount && banishCount > 0 && banishDist !== "random") {
                        effects.push(`${trigger}: Banish ${banishCount} ${banishTarget}`);
                    } else {
                        effects.push(`${trigger}: Banish ${banishTarget}`);
                    }
                    if (e.filters || e.filter) {
                        const f = e.filters || e.filter;
                        const filterStr = JSON.stringify(f).replace(/"/g, "").replace(/[{}]/g, "");
                        effects.push(`  └─ Filter: ${filterStr}`);
                    }
                    break;
                }
                case "earth_rite":
                case "necromancy": {
                    const cost = e.cost || e.amount || 1;
                    const opName = e.op === "earth_rite" ? "Earth Rite" : "Necromancy";
                    effects.push(`${trigger}: ${opName} (${cost})`);
                    if (Array.isArray(e.effects)) {
                        extractFromEffects(e.effects as unknown[], `  └─ ${opName}`);
                    }
                    if (Array.isArray(e.else_effects)) {
                        extractFromEffects(e.else_effects as unknown[], `  └─ Else`);
                    }
                    break;
                }
                case "gate": {
                    // Handle Combo/Enhance dual-path detection
                    const condition = e.condition as string || "condition";
                    const count = e.count || e.requirement || "";

                    // Show both paths for combo/enhance
                    if (condition === "combo" || condition === "enhance" || condition === "overflow" || condition === "skybound_art") {
                        // Base path (condition NOT met)
                        if (Array.isArray(e.else_effects) && (e.else_effects as unknown[]).length > 0) {
                            extractFromEffects(e.else_effects as unknown[], `${trigger} (base)`);
                        }
                        // Conditional path (condition IS met)
                        if (Array.isArray(e.effects)) {
                            const condLabel = condition === "combo" ? `Combo ${count}` :
                                condition === "enhance" ? `Enhance ${count}` :
                                    condition === "skybound_art" ? `Skybound Art ${count}` :
                                        condition === "overflow" ? `Overflow` :
                                            `${condition} ${count}`;
                            extractFromEffects(e.effects as unknown[], `${trigger} IF ${condLabel}`);
                        }
                    } else {
                        // Generic conditional
                        effects.push(`${trigger}: Conditional (${condition} ${count})`);
                        if (Array.isArray(e.effects)) {
                            extractFromEffects(e.effects as unknown[], `  └─ If met`);
                        }
                        if (Array.isArray(e.else_effects)) {
                            extractFromEffects(e.else_effects as unknown[], `  └─ Else`);
                        }
                    }
                    break;
                }
                case "mode": {
                    const options = e.options as unknown[];
                    const count = (e.select as number) || (e.select_count as number) || 1;
                    if (options && options.length > 0) {
                        const countStr = count > 1 ? `Choose ${count} modes` : "Choose a mode";
                        effects.push(`${trigger}: ${countStr} (${options.length} options):`);
                        options.forEach((opt, idx) => {
                            if (opt && typeof opt === "object") {
                                const o = opt as Record<string, unknown>;
                                const optName = o.name ? `"${o.name}"` : `Option ${idx + 1}`;
                                effects.push(`  ${idx + 1}. ${optName}`);
                                if (Array.isArray(o.effects)) {
                                    extractFromEffects(o.effects as unknown[], `    └─ Effect`);
                                }
                            }
                        });
                    } else {
                        effects.push(`${trigger}: Choose a mode`);
                    }
                    break;
                }
                case "pp":
                    if (e.action === "recover") {
                        effects.push(`${trigger}: Recover ${e.amount || 1} PP`);
                    } else if (e.action === "gain_max") {
                        effects.push(`${trigger}: Gain ${e.amount || 1} max PP`);
                    } else {
                        effects.push(`${trigger}: ${e.action || "modify"} ${e.amount || 1} PP`);
                    }
                    break;
                case "spellboost":
                    if (e.target === "self" && e.mode === "set") {
                        effects.push(`${trigger}: Set spellboost count to ${e.amount ?? 0}`);
                    } else {
                        effects.push(`${trigger}: Spellboost hand ${e.count || 1} time(s)`);
                    }
                    break;
                case "crest": {
                    const playerStr = e.player === "opponent" ? "(Opponent) " : "";
                    const crestName = e.name || e.crest || "Unknown Crest";
                    if (e.action === "pay_counter") {
                        effects.push(`${trigger}: Pay ${e.amount} ${e.counter} from ${crestName}`);
                        if (Array.isArray(e.on_success_effects)) {
                            extractFromEffects(e.on_success_effects as unknown[], `  └─ On Success`);
                        }
                    } else if (e.action === "destroy") {
                        effects.push(`${trigger}: Destroy Crest: ${crestName}`);
                    } else if (e.action === "advance") {
                        effects.push(`${trigger}: Advance Crest: ${crestName} by ${e.amount || 1}`);
                    } else if (e.action === "delay") {
                        effects.push(`${trigger}: Delay all crests by ${e.amount || 1}`);
                    } else {
                        effects.push(`${trigger}: Gain ${playerStr}Crest: ${crestName}`);

                        if (e.description) {
                            effects.push(`  └─ Definition: ${e.description}`);
                        } else if (Array.isArray(e.triggers)) {
                            /* Reuse logic for triggers but simplified */
                            for (const tr of e.triggers as any[]) {
                                const eventName = String(tr.event || "trigger").replace(/_/g, " ");
                                let trLabel = `  └─ Ability: On ${eventName}`;
                                if (tr.condition) {
                                    const condStr = Object.entries(tr.condition).map(([k, v]) => `${k}=${v}`).join(", ");
                                    trLabel += ` (IF ${condStr})`;
                                }
                                extractFromEffects(tr.effects, trLabel);
                            }
                        }
                    }
                    break;
                }
                case "countdown": {
                    const action = e.action || "advance";
                    const amt = formatDynamicValue(e.amount);
                    const dynamicAmt = e.amount_source ? ` (X = ${e.amount_source})` : "";
                    effects.push(`${trigger}: Countdown ${action} by ${amt}${dynamicAmt}`);
                    break;
                }
                case "mode_bonus":
                    effects.push(`${trigger}: Increase mode selection count by ${e.amount || 1}`);
                    break;
                case "reanimate":
                    effects.push(`${trigger}: Reanimate (${e.cost || "X"})`);
                    break;
                case "repeat_effect": {
                    const times = e.count_source ? `X times (${e.count_source})` : `${e.count || 1} times`;
                    effects.push(`${trigger}: Repeat effect ${times}`);
                    if (e.effect) {
                        extractFromEffects([e.effect], `  └─ Repeated`);
                    }
                    break;
                }
                case "select": {
                    // Extract nested effects from select operations
                    const count = (e.count as number) || (e.select as number) || 1;
                    const target = formatTarget(e.target, count);
                    effects.push(`${trigger}: Select ${count} ${target}`);
                    if (Array.isArray(e.effects)) {
                        extractFromEffects(e.effects as unknown[], `  └─ Selected`);
                    }
                    break;
                }
                default:
                    if (e.op) effects.push(`${trigger}: ${e.op} effect`);
            }
        }
    }

    // Extract from main effect arrays
    extractFromEffects(card.fanfare, "Fanfare");
    extractFromEffects(card.spell, "Spell");

    // Handle Evolve/Super-Evolve which might be objects
    const evolveEff = card.evolve && !Array.isArray(card.evolve) ? (card.evolve as any).effects : card.evolve;
    extractFromEffects(evolveEff, "Evolve");

    const superEff = card.superevolve && !Array.isArray(card.superevolve) ? (card.superevolve as any).effects : card.superevolve;
    extractFromEffects(superEff, "Super-Evolve");

    if (card.attacks_per_turn && card.attacks_per_turn > 1) {
        effects.push(`Keyword: Can attack ${card.attacks_per_turn} times per turn`);
    }

    // Keywords (including Enhance, LastWords, etc.)
    if (Array.isArray(card.keywords)) {
        for (const kw of card.keywords) {
            if (typeof kw === "string") {
                effects.push(`Keyword: ${kw}`);
            } else if (kw && typeof kw === "object") {
                const k = kw as Record<string, unknown>;
                if (k.name === "LastWords" && Array.isArray(k.effects)) {
                    extractFromEffects(k.effects, "Last Words");
                } else if (String(k.name).toLowerCase() === "enhance" && Array.isArray(k.effects)) {
                    // Show Enhance path explicitly
                    effects.push(`--- Enhance (${k.cost}) Path ---`);
                    extractFromEffects(k.effects, `Enhance (${k.cost})`);
                } else if (k.name === "Engage" && Array.isArray(k.effects)) {
                    effects.push(`Keyword: Engage (sacrifice: ${k.sacrifice || false})`);
                    extractFromEffects(k.effects, "Engage");
                } else if (k.name) {
                    if (Array.isArray(k.effects) && k.effects.length > 0) {
                        effects.push(`Keyword: ${k.name}`);
                        extractFromEffects(k.effects, k.name as string);
                    } else if (k.name === "Spellboost") {
                        const sbDetails = [];
                        if (k.reduceCostBy) sbDetails.push(`Cost -${k.reduceCostBy}`);
                        if (k.power) sbDetails.push(`Power +${k.power}`);
                        if (k.minCost !== undefined) sbDetails.push(`(Min ${k.minCost})`);
                        effects.push(`Keyword: Spellboost ${sbDetails.join(", ")}`);
                    } else {
                        effects.push(`Keyword: ${k.name}`);
                    }
                }
            }
        }
    }

    // Triggers (Strike, Clash, etc.)
    if (Array.isArray(card.triggers)) {
        for (const trigger of card.triggers) {
            if (trigger && typeof trigger === "object") {
                const t = trigger as {
                    event?: string;
                    effects?: unknown[];
                    condition?: Record<string, unknown>;
                };
                if (Array.isArray(t.effects)) {
                    const eventName = String(t.event || "trigger").replace(/_/g, " ");
                    let trLabel = `On ${eventName}`;

                    if ((t as any).once_per_turn) {
                        trLabel += " (Once per turn)";
                    }

                    if (t.condition) {
                        const condStr = Object.entries(t.condition)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ");
                        trLabel += ` (IF ${condStr})`;
                    }
                    extractFromEffects(t.effects, trLabel);
                }
            }
        }
    }

    // On Discard (Kit, etc.)
    // @ts-ignore
    if (Array.isArray(card.on_discard)) {
        // @ts-ignore
        extractFromEffects(card.on_discard, "When discarded");
    }

    // Detect passive keywords from description that might not be in keywords array
    if (card.description) {
        for (const kw of PASSIVE_KEYWORDS) {
            // Check if keyword is in description but not already captured
            if (card.description.includes(kw) && !effects.some(e => e.toLowerCase().includes(kw.toLowerCase()))) {
                effects.push(`Passive Keyword: ${kw}`);
            }
        }
    }

    return effects;
}

// =============================================================================
// VALIDATION
// =============================================================================

async function validateCard(card: CardDef): Promise<ValidationResult> {
    const description = card.description || "(no description)";
    const stateChanges = analyzeExpectedEffects(card);

    // Skip cards with no description and no effects
    if (!card.description && stateChanges.length === 0) {
        return {
            cardId: card.id,
            cardName: card.name,
            description: "(vanilla card)",
            verdict: "PASS",
            reasoning: "Vanilla card with no effects",
            stateChanges: "None",
            timestamp: new Date().toISOString(),
        };
    }

    // Truncate effects list if too long to prevent output limit issues
    let stateChangesText: string;
    if (stateChanges.length === 0) {
        stateChangesText = "No programmed effects found";
    } else if (stateChanges.length > MAX_EFFECTS_LINES) {
        stateChangesText = stateChanges.slice(0, MAX_EFFECTS_LINES).join("\n") +
            `\n... (truncated, ${stateChanges.length - MAX_EFFECTS_LINES} more effects)`;
    } else {
        stateChangesText = stateChanges.join("\n");
    }

    const prompt = `
CARD: ${card.name} (${card.type}, Cost: ${card.cost})
DESCRIPTION: "${description}"

PROGRAMMED EFFECTS:
${stateChangesText}

Does the implementation match the description?`;

    try {
        // Call LLM with retry logic
        const { response, retries } = await askLLMWithRetry(prompt);

        return {
            cardId: card.id,
            cardName: card.name,
            description,
            verdict: response.verdict,
            reasoning: response.reasoning.trim(),
            stateChanges: stateChangesText,
            timestamp: new Date().toISOString(),
            retries,
        };
    } catch (error) {
        return {
            cardId: card.id,
            cardName: card.name,
            description,
            verdict: "ERROR",
            reasoning: error instanceof Error ? error.message : String(error),
            stateChanges: stateChangesText,
            timestamp: new Date().toISOString(),
        };
    }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    // Parse args
    const args = process.argv.slice(2);
    const limitArg = args.find(a => a.startsWith("--limit="));
    const startArg = args.find(a => a.startsWith("--start="));
    const verbose = args.includes("--verbose");

    const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
    const startId = startArg ? startArg.split("=")[1] : null;
    const idsArg = args.find(a => a.startsWith("--ids="));
    const targetIds = idsArg ? idsArg.split("=")[1].split(",") : null;

    // Load cards
    const allCardsPath = path.join(__dirname, "..", "cards", "all.json");
    const tokenCardsPath = path.join(__dirname, "..", "cards", "token_details.json");

    const allCards: CardDef[] = JSON.parse(fs.readFileSync(allCardsPath, "utf-8"));
    const tokenCards: CardDef[] = JSON.parse(fs.readFileSync(tokenCardsPath, "utf-8"));

    let cards = [...allCards, ...tokenCards];

    // Apply start filter
    if (startId) {
        const startIndex = cards.findIndex(c => c.id === startId);
        if (startIndex >= 0) {
            cards = cards.slice(startIndex);
        }
    }

    // Apply ids filter (overrides start/limit mostly, but we apply limit after)
    if (targetIds && targetIds.length > 0) {
        cards = cards.filter(c => targetIds.includes(c.id));
    }

    // Apply limit
    cards = cards.slice(0, limit);

    const modelName = USE_GEMINI ? "Gemini 2.5 Flash" : "GPT-4.1 mini (with retries)";
    console.log(`🔍 Validating ${cards.length} cards with ${modelName} (batch size ${BATCH_SIZE})...\n`);

    const results: ValidationResult[] = [];
    let passed = 0, failed = 0, unclear = 0, errors = 0, totalRetries = 0;

    // Process in batches for speed
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        const batch = cards.slice(i, i + BATCH_SIZE);

        // Validate batch in parallel
        const batchResults = await Promise.all(batch.map(validateCard));

        for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            const cardIndex = i + j;
            results.push(result);

            // Update counters
            switch (result.verdict) {
                case "PASS": passed++; break;
                case "FAIL": failed++; break;
                case "UNCLEAR": unclear++; break;
                case "ERROR": errors++; break;
            }
            if (result.retries) totalRetries += result.retries;

            // Progress
            const icon = result.verdict === "PASS" ? "✅" :
                result.verdict === "FAIL" ? "❌" :
                    result.verdict === "UNCLEAR" ? "❓" : "⚠️";

            if (verbose || result.verdict === "FAIL") {
                console.log(`${icon} [${cardIndex + 1}/${cards.length}] ${batch[j].name}: ${result.verdict}`);
                if (result.verdict === "FAIL") {
                    console.log(`   └─ ${result.reasoning}`);
                }
            } else {
                process.stdout.write(`\r[${cardIndex + 1}/${cards.length}] ✅${passed} ❌${failed} ❓${unclear} ⚠️${errors}`);
            }
        }

        // Rate limiting between batches
        if (i + BATCH_SIZE < cards.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    console.log("\n");

    // Generate report
    const report: ValidationReport = {
        totalCards: cards.length,
        passed,
        failed,
        unclear,
        errors,
        results,
        generatedAt: new Date().toISOString(),
    };

    // Write report
    const outputDir = path.join(__dirname, "..", "tests", "validation");
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const reportPath = path.join(outputDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Write failed cards separately for easy review
    const failedCards = results.filter(r => r.verdict === "FAIL");
    if (failedCards.length > 0) {
        const failedPath = path.join(outputDir, "failed.json");
        fs.writeFileSync(failedPath, JSON.stringify(failedCards, null, 2));
    }

    // Summary
    console.log("═══════════════════════════════════════");
    console.log("           VALIDATION REPORT           ");
    console.log("═══════════════════════════════════════");
    console.log(`Total:   ${cards.length}`);
    console.log(`✅ Pass:  ${passed} (${((passed / cards.length) * 100).toFixed(1)}%)`);
    console.log(`❌ Fail:  ${failed} (${((failed / cards.length) * 100).toFixed(1)}%)`);
    console.log(`❓ Unclear: ${unclear}`);
    console.log(`⚠️ Errors: ${errors}`);
    console.log(`🔄 Total retries: ${totalRetries}`);
    console.log("═══════════════════════════════════════");
    console.log(`\n📄 Full report: ${reportPath}`);
    if (failedCards.length > 0) {
        console.log(`📄 Failed cards: ${path.join(outputDir, "failed.json")}`);
    }
}

main().catch(console.error);
