/**
 * @file LLM Crest Validator
 *
 * DESIGN: Uses OpenAI/Gemini to validate that crest effects match their descriptions.
 * Extracts crest definitions from card JSONs and asks the LLM if behavior matches description.
 *
 * USAGE:
 *   1. Set OPENAI_API_KEY or GEMINI_API_KEY in .env file
 *   2. Run: npx tsx scripts/validateCrests.ts
 *   3. Review output in tests/validation/crest_report.json
 *
 * OPTIONS:
 *   --limit=N     Only validate N crests (for testing)
 *   --verbose     Print each crest result
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
  console.error(
    "   GEMINI_API_KEY=... (free: https://aistudio.google.com/app/apikey)",
  );
  console.error("   OPENAI_API_KEY=sk-...");
  process.exit(1);
}

const USE_GEMINI = !!GEMINI_API_KEY && !OPENAI_API_KEY;

// =============================================================================
// CONFIG
// =============================================================================

const BATCH_SIZE = 2;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504, 520];

// =============================================================================
// TYPES
// =============================================================================

interface CrestTrigger {
  event?: string;
  type?: string;
  condition?: Record<string, unknown>;
  effects?: unknown[];
  once_per_turn?: boolean;
}

interface CrestDef {
  name: string;
  description?: string;
  countdown?: number;
  triggers?: CrestTrigger[];
  effects?: unknown[];
  on_gain?: unknown[];
  keywords?: string[];
  image?: string;
  // Source card info
  sourceCardId: string;
  sourceCardName: string;
}

interface ValidationResult {
  crestName: string;
  sourceCard: string;
  description: string;
  verdict: "PASS" | "FAIL" | "UNCLEAR" | "ERROR";
  reasoning: string;
  programmedBehavior: string;
  timestamp: string;
  retries?: number;
}

interface ValidationReport {
  totalCrests: number;
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
Given a crest's description and the programmed behavior, determine if the implementation matches the description.

CRESTS are persistent effects that attach to a player (like auras). They can have:
- Triggers: Event-based effects (e.g., "ally_follower_enter" = when ally enters)
- Countdown: Duration in turns before crest is destroyed
- Effects: Payload effects fired on countdown completion (only with Last Words keyword)
- Last Words: Effects fired when crest is destroyed

Rules:
- PASS: Programmed behavior matches the description
- FAIL: Behavior contradicts or is missing from the description
- UNCLEAR: Cannot determine (missing info, etc.)

Event name mappings (treat as equivalent):
- "ally_follower_enter" = "Whenever an allied follower enters the field"
- "end_of_turn_own" = "At the end of your turn"
- "start_of_turn_own" = "At the start of your turn"
- "ally_card_played" = "Whenever you play a card"

Be lenient on minor wording differences. Only FAIL for genuinely missing or contradicting effects.`;

interface LLMResponse {
  verdict: "PASS" | "FAIL" | "UNCLEAR";
  reasoning: string;
}

function sleep(ms: number): Promise<void> {
  const jitter = Math.random() * 100;
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

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
              {
                text:
                  SYSTEM_PROMPT +
                  "\n\n" +
                  prompt +
                  '\n\nRespond with JSON: {"verdict": "PASS|FAIL|UNCLEAR", "reasoning": "..."}',
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 200,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "crest_validation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              verdict: { type: "string", enum: ["PASS", "FAIL", "UNCLEAR"] },
              reasoning: {
                type: "string",
                description: "One line explanation",
              },
            },
            required: ["verdict", "reasoning"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const isRetryable = RETRYABLE_STATUS_CODES.includes(response.status);
    const error = new Error(`OpenAI API error: ${response.status}`) as Error & {
      retryable?: boolean;
    };
    error.retryable = isRetryable;
    throw error;
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(text);
  if (!parsed) {
    const error = new Error(
      `Failed to parse OpenAI response: ${text.slice(0, 100)}`,
    ) as Error & { retryable?: boolean };
    error.retryable = true;
    throw error;
  }
  return parsed;
}

async function askLLMWithRetry(
  prompt: string,
): Promise<{ response: LLMResponse; retries: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = USE_GEMINI
        ? await askGemini(prompt)
        : await askOpenAI(prompt);
      return { response, retries: attempt };
    } catch (err) {
      lastError = err as Error;
      const isRetryable =
        (err as Error & { retryable?: boolean }).retryable ?? true;

      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        throw lastError;
      }

      const backoffMs = Math.pow(2, attempt) * 1000;
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

// =============================================================================
// CREST EXTRACTION
// =============================================================================

interface CardDef {
  id: string;
  name: string;
  fanfare?: unknown[];
  evolve?: unknown[] | { effects?: unknown[] };
  superevolve?: unknown[] | { effects?: unknown[] };
  spell?: unknown[];
  keywords?: unknown[];
  triggers?: unknown[];
}

function extractCrestsFromCard(card: CardDef): CrestDef[] {
  const crests: CrestDef[] = [];

  function processEffects(effects: unknown[] | undefined) {
    if (!Array.isArray(effects)) return;
    for (const effect of effects) {
      if (!effect || typeof effect !== "object") continue;
      const e = effect as Record<string, unknown>;

      if (e.op === "crest" && (e.action === "gain" || !e.action)) {
        // Only extract crest definitions (action: gain), not pay_counter or other actions
        crests.push({
          name: (e.name as string) || "Unknown Crest",
          description: (e.description as string) || undefined,
          countdown: typeof e.countdown === "number" ? e.countdown : undefined,
          triggers: Array.isArray(e.triggers)
            ? (e.triggers as CrestTrigger[])
            : undefined,
          effects: Array.isArray(e.effects) ? e.effects : undefined,
          on_gain: Array.isArray(e.on_gain) ? e.on_gain : undefined,
          keywords: Array.isArray(e.keywords)
            ? (e.keywords as string[])
            : undefined,
          image: e.image as string | undefined,
          sourceCardId: card.id,
          sourceCardName: card.name,
        });
      }

      // Check nested effects (gates, etc.)
      if (Array.isArray(e.effects)) processEffects(e.effects as unknown[]);
      if (Array.isArray(e.else_effects))
        processEffects(e.else_effects as unknown[]);
      if (Array.isArray(e.then)) processEffects(e.then as unknown[]);
    }
  }

  processEffects(card.fanfare);
  processEffects(card.spell);

  // Evolve/superevolve can be array or object with effects
  const evolveEff =
    card.evolve && !Array.isArray(card.evolve)
      ? (card.evolve as { effects?: unknown[] }).effects
      : card.evolve;
  processEffects(evolveEff as unknown[]);

  const superEff =
    card.superevolve && !Array.isArray(card.superevolve)
      ? (card.superevolve as { effects?: unknown[] }).effects
      : card.superevolve;
  processEffects(superEff as unknown[]);

  // Check keywords (Enhance, etc.)
  if (Array.isArray(card.keywords)) {
    for (const kw of card.keywords) {
      if (
        kw &&
        typeof kw === "object" &&
        Array.isArray((kw as Record<string, unknown>).effects)
      ) {
        processEffects((kw as Record<string, unknown>).effects as unknown[]);
      }
    }
  }

  return crests;
}

function formatTrigger(trigger: CrestTrigger): string {
  const event = trigger.event || trigger.type || "unknown";
  let desc = `On ${event.replace(/_/g, " ")}`;

  if (trigger.condition) {
    const condStr = Object.entries(trigger.condition)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    desc += ` (IF ${condStr})`;
  }

  if (trigger.once_per_turn) {
    desc += " [Once per turn]";
  }

  // Format effects
  if (Array.isArray(trigger.effects) && trigger.effects.length > 0) {
    const effectsStr = trigger.effects
      .map((e) => {
        if (typeof e === "object" && e !== null) {
          const op = (e as Record<string, unknown>).op as string;
          return formatEffect(e as Record<string, unknown>);
        }
        return String(e);
      })
      .join("; ");
    desc += `: ${effectsStr}`;
  }

  return desc;
}

function formatEffect(e: Record<string, unknown>, depth = 0): string {
  const op = e.op as string;
  const indent = "  ".repeat(depth);

  // Helper to format stat values correctly (handles negative numbers)
  function formatStat(val: unknown): string {
    if (val === undefined || val === null) return "";
    const num = Number(val);
    if (isNaN(num)) return String(val);
    if (num === 0) return "0";
    return num > 0 ? `+${num}` : `${num}`; // Negative numbers already have minus sign
  }

  switch (op) {
    case "damage": {
      const amt = e.amount ?? e.amount_source ?? "X";
      const parts: string[] = [];
      parts.push(`Deal ${amt} damage to ${e.target || "target"}`);
      if (e.distribution) parts.push(`(${e.distribution})`);
      if (e.spill_to_leader) parts.push(`(spills to leader)`);
      return parts.join(" ");
    }
    case "restore": {
      const amt = e.amount ?? e.amount_source ?? "X";
      return `Restore ${amt} to ${e.target || "target"}`;
    }
    case "draw": {
      const filters = e.filters as Record<string, unknown> | undefined;
      const filterParts: string[] = [];
      if (filters?.type) filterParts.push(`type=${filters.type}`);
      if (filters?.defense_eq)
        filterParts.push(`defense=${filters.defense_eq}`);
      if (filters?.attack_eq) filterParts.push(`attack=${filters.attack_eq}`);
      const filterStr = filterParts.length
        ? ` (${filterParts.join(", ")})`
        : "";
      return `Draw ${e.count || 1} card(s)${filterStr}`;
    }
    case "search": {
      const filter = e.filter as Record<string, unknown> | undefined;
      const filterParts: string[] = [];
      if (filter?.type) filterParts.push(`type=${filter.type}`);
      if (filter?.cost_lte) filterParts.push(`cost≤${filter.cost_lte}`);
      if (filter?.tribe) filterParts.push(`tribe=${filter.tribe}`);
      const filterStr = filterParts.length
        ? ` (${filterParts.join(", ")})`
        : "";
      return `Search for ${e.count || 1} card(s)${filterStr}`;
    }
    case "add_to_hand":
      return `Add ${e.count || 1}x ${e.name || "card"} to hand`;
    case "summon": {
      if (e.source === "graveyard" || e.mode === "reanimate") {
        return `Reanimate (${e.max_cost || e.cost || "X"})`;
      }
      return `Summon ${e.count || 1}x ${e.name || "token"}`;
    }
    case "reanimate":
      return `Reanimate (${e.cost || e.max_cost || "X"})`;
    case "stat": {
      // Handle mode=double specially
      if (e.mode === "double") {
        return `Double attack and defense of ${e.target || "target"}`;
      }
      const atk = e.attack !== undefined ? formatStat(e.attack) : "";
      const def = e.defense !== undefined ? `/${formatStat(e.defense)}` : "";
      const kws = Array.isArray(e.keywords) ? e.keywords.join(", ") : "";
      const stats = [atk + def, kws].filter(Boolean).join(" and ");
      return `Give ${stats} to ${e.target || "target"}`.trim();
    }
    case "keyword": {
      const action = (e.action as string) || "grant";
      const target = (e.target as string) || "target";

      // Handle grant_trigger specially to show nested trigger effects
      if (action === "grant_trigger") {
        const triggers = Array.isArray(e.triggers) ? e.triggers : [];
        if (triggers.length > 0) {
          const triggerDescs = triggers
            .map((t: any) => {
              const event = t.type || t.event || "trigger";
              const effects = Array.isArray(t.effects) ? t.effects : [];
              const effectsStr = effects
                .map((eff: any) => formatEffect(eff, depth + 1))
                .join("; ");
              return `On ${event.replace(/_/g, " ")}: ${effectsStr}`;
            })
            .join("; ");
          return `Grant trigger to ${target} → ${triggerDescs}`;
        }
        return `Grant trigger to ${target}`;
      }

      const keywords = Array.isArray(e.keywords)
        ? e.keywords
            .map((k) =>
              typeof k === "string" ? k : (k as { name?: string })?.name || "?",
            )
            .join(", ")
        : e.name || "keyword";
      return `Grant ${keywords} to ${target}`;
    }
    case "destroy":
      return `Destroy ${e.target || e.scope || "target"}`;
    case "banish":
      return `Banish ${e.target || e.scope || "target"}`;
    case "evolve":
      return `Evolve ${e.target || "target"}`;
    case "earth_rite": {
      const cost = e.cost || 1;
      let result = `Earth Rite (${cost})`;
      if (Array.isArray(e.effects) && e.effects.length > 0) {
        const nested = e.effects
          .map((eff) => formatEffect(eff as Record<string, unknown>, depth + 1))
          .join("; ");
        result += ` → ${nested}`;
      }
      return result;
    }
    case "necromancy": {
      const cost = e.cost || e.amount || 1;
      let result = `Necromancy (${cost})`;
      if (Array.isArray(e.effects) && e.effects.length > 0) {
        const nested = e.effects
          .map((eff) => formatEffect(eff as Record<string, unknown>, depth + 1))
          .join("; ");
        result += ` → ${nested}`;
      }
      return result;
    }
    case "counter":
      return `${e.action} ${e.amount || 1} ${e.key || "counter"}`;
    case "crest": {
      if (e.action === "advance") {
        return `Advance crest countdown by ${e.amount || 1}`;
      }
      return `${e.action || "modify"} crest`;
    }
    case "discard": {
      // Handle mode=except_named
      if (e.mode === "except_named" && Array.isArray(e.names)) {
        return `Discard all cards except named "${e.names.join(", ")}"`;
      }
      const filter = e.filter as Record<string, unknown> | undefined;
      const filterStr = filter?.name ? ` not named "${filter.name}"` : "";
      return `Discard ${e.count || "cards"}${filterStr}`;
    }
    case "gate": {
      // Expand conditional/gate effects
      const condition = (e.condition as string) || "condition";
      const count = e.count || e.requirement || "";
      const name = (e.name as string) || "";
      let result = `IF ${condition}`;
      if (name) result += ` (name="${name}")`;
      if (count) result += ` (${count})`;

      if (Array.isArray(e.effects) && e.effects.length > 0) {
        const nested = e.effects
          .map((eff) => formatEffect(eff as Record<string, unknown>, depth + 1))
          .join("; ");
        result += `: ${nested}`;
      }
      if (Array.isArray(e.else_effects) && e.else_effects.length > 0) {
        const elseNested = e.else_effects
          .map((eff) => formatEffect(eff as Record<string, unknown>, depth + 1))
          .join("; ");
        result += ` ELSE: ${elseNested}`;
      }
      return result;
    }
    case "select": {
      const mode = (e.mode as string) || "target";
      const qty = e.qty || e.count || 1;
      const target = (e.target as string) || "target";
      const cond = e.condition as Record<string, unknown> | undefined;

      let condStr = "";
      if (cond) {
        const condParts: string[] = [];
        if (cond.attack_lte) condParts.push(`attack≤${cond.attack_lte}`);
        if (cond.attack_gte) condParts.push(`attack≥${cond.attack_gte}`);
        if (cond.defense_lte) condParts.push(`defense≤${cond.defense_lte}`);
        if (cond.defense_gte) condParts.push(`defense≥${cond.defense_gte}`);
        if (cond.exclude_keyword) condParts.push(`not ${cond.exclude_keyword}`);
        if (cond.tribe) condParts.push(`tribe=${cond.tribe}`);
        condStr = condParts.length > 0 ? ` WHERE ${condParts.join(", ")}` : "";
      }

      let result = `Select ${qty} ${mode} from ${target}${condStr}`;

      if (Array.isArray(e.effects) && e.effects.length > 0) {
        const nested = e.effects
          .map((eff) => formatEffect(eff as Record<string, unknown>, depth + 1))
          .join("; ");
        result += ` THEN: ${nested}`;
      }
      return result;
    }
    case "repeat_effect": {
      const times = e.count_source
        ? `X (${e.count_source})`
        : `${e.count || 1}`;
      let result = `Repeat ${times} times`;
      if (e.effect && typeof e.effect === "object") {
        result += `: ${formatEffect(e.effect as Record<string, unknown>, depth + 1)}`;
      }
      if (Array.isArray(e.effects) && e.effects.length > 0) {
        const nested = e.effects
          .map((eff) => formatEffect(eff as Record<string, unknown>, depth + 1))
          .join("; ");
        result += `: ${nested}`;
      }
      return result;
    }
    default:
      return `${op} effect`;
  }
}

function formatCrestBehavior(crest: CrestDef): string {
  const parts: string[] = [];

  // Countdown
  if (crest.countdown !== undefined) {
    parts.push(`Countdown: ${crest.countdown} turns`);
  }

  // On Gain effects
  if (crest.on_gain && crest.on_gain.length > 0) {
    const effectsStr = crest.on_gain
      .map((e) => {
        if (typeof e === "object" && e !== null) {
          return formatEffect(e as Record<string, unknown>);
        }
        return String(e);
      })
      .join("; ");
    parts.push(`On Gain: ${effectsStr}`);
  }

  // Keywords
  if (crest.keywords && crest.keywords.length > 0) {
    parts.push(`Keywords: ${crest.keywords.join(", ")}`);
  }

  // Triggers
  if (crest.triggers && crest.triggers.length > 0) {
    const triggersStr = crest.triggers
      .map((t) => formatTrigger(t))
      .join("\n  ");
    parts.push(`Triggers:\n  ${triggersStr}`);
  }

  // Effects (Last Words / Countdown completion)
  if (crest.effects && crest.effects.length > 0) {
    const effectsStr = crest.effects
      .map((e) => {
        if (typeof e === "object" && e !== null) {
          return formatEffect(e as Record<string, unknown>);
        }
        return String(e);
      })
      .join("; ");
    parts.push(`Effects (Last Words/Completion): ${effectsStr}`);
  }

  return parts.length > 0 ? parts.join("\n") : "No programmed behavior found";
}

// =============================================================================
// VALIDATION
// =============================================================================

async function validateCrest(crest: CrestDef): Promise<ValidationResult> {
  const description = crest.description || "(no description)";
  const programmedBehavior = formatCrestBehavior(crest);

  // Skip crests with no description
  if (!crest.description) {
    return {
      crestName: crest.name,
      sourceCard: `${crest.sourceCardName} (${crest.sourceCardId})`,
      description: "(no description)",
      verdict: "UNCLEAR",
      reasoning: "No crest description provided in JSON",
      programmedBehavior,
      timestamp: new Date().toISOString(),
    };
  }

  const prompt = `
CREST: ${crest.name}
SOURCE CARD: ${crest.sourceCardName} (ID: ${crest.sourceCardId})
DESCRIPTION: "${description}"

PROGRAMMED BEHAVIOR:
${programmedBehavior}

Does the implementation match the description?`;

  try {
    const { response, retries } = await askLLMWithRetry(prompt);

    return {
      crestName: crest.name,
      sourceCard: `${crest.sourceCardName} (${crest.sourceCardId})`,
      description,
      verdict: response.verdict,
      reasoning: response.reasoning.trim(),
      programmedBehavior,
      timestamp: new Date().toISOString(),
      retries,
    };
  } catch (error) {
    return {
      crestName: crest.name,
      sourceCard: `${crest.sourceCardName} (${crest.sourceCardId})`,
      description,
      verdict: "ERROR",
      reasoning: error instanceof Error ? error.message : String(error),
      programmedBehavior,
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
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const verbose = args.includes("--verbose");

  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

  // Load cards
  const allCardsPath = path.join(__dirname, "..", "cards", "all.json");
  const tokenCardsPath = path.join(
    __dirname,
    "..",
    "cards",
    "token_details.json",
  );

  const allCards: CardDef[] = JSON.parse(
    fs.readFileSync(allCardsPath, "utf-8"),
  );
  const tokenCards: CardDef[] = JSON.parse(
    fs.readFileSync(tokenCardsPath, "utf-8"),
  );

  const cards = [...allCards, ...tokenCards];

  // Extract all crests
  console.log("🔍 Extracting crests from cards...");
  const allCrests: CrestDef[] = [];
  const seenNames = new Set<string>();

  for (const card of cards) {
    const crests = extractCrestsFromCard(card);
    for (const crest of crests) {
      // Deduplicate by name (same crest may appear in evolve + superevolve)
      if (!seenNames.has(crest.name)) {
        seenNames.add(crest.name);
        allCrests.push(crest);
      }
    }
  }

  console.log(`   Found ${allCrests.length} unique crests\n`);

  // Apply limit
  const crestsToValidate = allCrests.slice(0, limit);

  const modelName = USE_GEMINI
    ? "Gemini 2.5 Flash"
    : "GPT-4.1 mini (with retries)";
  console.log(
    `🔍 Validating ${crestsToValidate.length} crests with ${modelName} (batch size ${BATCH_SIZE})...\n`,
  );

  const results: ValidationResult[] = [];
  let passed = 0,
    failed = 0,
    unclear = 0,
    errors = 0,
    totalRetries = 0;

  // Process in batches
  for (let i = 0; i < crestsToValidate.length; i += BATCH_SIZE) {
    const batch = crestsToValidate.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(batch.map(validateCrest));

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const crestIndex = i + j;
      results.push(result);

      switch (result.verdict) {
        case "PASS":
          passed++;
          break;
        case "FAIL":
          failed++;
          break;
        case "UNCLEAR":
          unclear++;
          break;
        case "ERROR":
          errors++;
          break;
      }
      if (result.retries) totalRetries += result.retries;

      const icon =
        result.verdict === "PASS"
          ? "✅"
          : result.verdict === "FAIL"
            ? "❌"
            : result.verdict === "UNCLEAR"
              ? "❓"
              : "⚠️";

      if (verbose || result.verdict === "FAIL") {
        console.log(
          `${icon} [${crestIndex + 1}/${crestsToValidate.length}] ${batch[j].name}: ${result.verdict}`,
        );
        if (result.verdict === "FAIL") {
          console.log(`   └─ ${result.reasoning}`);
        }
      } else {
        process.stdout.write(
          `\r[${crestIndex + 1}/${crestsToValidate.length}] ✅${passed} ❌${failed} ❓${unclear} ⚠️${errors}`,
        );
      }
    }

    // Rate limiting between batches
    if (i + BATCH_SIZE < crestsToValidate.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log("\n");

  // Generate report
  const report: ValidationReport = {
    totalCrests: crestsToValidate.length,
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

  const reportPath = path.join(outputDir, "crest_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Write failed crests separately
  const failedCrests = results.filter((r) => r.verdict === "FAIL");
  if (failedCrests.length > 0) {
    const failedPath = path.join(outputDir, "crest_failed.json");
    fs.writeFileSync(failedPath, JSON.stringify(failedCrests, null, 2));
  }

  // Summary
  console.log("═══════════════════════════════════════");
  console.log("        CREST VALIDATION REPORT        ");
  console.log("═══════════════════════════════════════");
  console.log(`Total:   ${crestsToValidate.length}`);
  console.log(
    `✅ Pass:  ${passed} (${((passed / crestsToValidate.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `❌ Fail:  ${failed} (${((failed / crestsToValidate.length) * 100).toFixed(1)}%)`,
  );
  console.log(`❓ Unclear: ${unclear}`);
  console.log(`⚠️ Errors: ${errors}`);
  console.log(`🔄 Total retries: ${totalRetries}`);
  console.log("═══════════════════════════════════════");
  console.log(`\n📄 Full report: ${reportPath}`);
  if (failedCrests.length > 0) {
    console.log(
      `📄 Failed crests: ${path.join(outputDir, "crest_failed.json")}`,
    );
  }
}

main().catch(console.error);
