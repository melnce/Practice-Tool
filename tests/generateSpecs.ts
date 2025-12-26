/**
 * @file Card Behavior Specs Generator
 *
 * DESIGN: Auto-generates behavior specifications from card effects.
 * Instead of parsing descriptions (NLP is unreliable), we directly analyze
 * the effect arrays to determine expected outcomes.
 *
 * This generates a specs.json that the test runner validates.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    fanfare?: Effect[];
    evolve?: Effect[];
    superevolve?: Effect[];
    spell?: Effect[];
    keywords?: (string | KeywordDef)[];
    triggers?: TriggerDef[];
}

interface Effect {
    op: string;
    [key: string]: unknown;
}

interface KeywordDef {
    name: string;
    effects?: Effect[];
    [key: string]: unknown;
}

interface TriggerDef {
    event: string;
    effects?: Effect[];
    [key: string]: unknown;
}

// Spec types
interface CardSpec {
    id: string;
    name: string;
    type: string;
    cost: number;
    description: string | null;
    scenarios: Scenario[];
}

interface Scenario {
    trigger: "fanfare" | "evolve" | "superevolve" | "spell" | "lastwords" | "strike" | "enhance" | "other";
    setup?: SetupConfig;
    expectations: Expectation[];
    conditions?: Condition[];
}

interface SetupConfig {
    minPP?: number;
    requiresTarget?: "ally" | "enemy" | "any";
    requiresBoard?: boolean;
    requiresDeck?: boolean;
    comboCount?: number;
    enhanceCost?: number;
}

interface Expectation {
    type: "hand_change" | "board_change" | "hp_change" | "draw" | "damage" |
    "summon" | "buff" | "keyword_granted" | "destroy" | "counter" |
    "restore" | "evolve" | "return" | "discard" | "transform" | "cost_change";
    player?: "self" | "enemy";
    amount?: number | string;
    target?: string;
    cardName?: string;
    keywords?: string[];
}

interface Condition {
    type: "combo" | "enhance" | "earth_rite" | "overflow" | "vengeance" | "invocation" | "resonance";
    value?: number;
}

// =============================================================================
// EFFECT ANALYZERS
// =============================================================================

function analyzeEffect(effect: Effect): Expectation[] {
    const expectations: Expectation[] = [];

    switch (effect.op) {
        case "draw":
            expectations.push({
                type: "draw",
                player: "self",
                amount: (effect.count as number) || 1,
            });
            break;

        case "add_to_hand":
            expectations.push({
                type: "hand_change",
                player: "self",
                amount: (effect.count as number) || 1,
                cardName: effect.name as string,
            });
            break;

        case "damage":
            expectations.push({
                type: "damage",
                target: effect.target as string,
                amount: effect.amount as number,
            });
            break;

        case "restore":
            expectations.push({
                type: "restore",
                target: effect.target as string,
                amount: effect.amount as number,
                player: (effect.player as "self" | "enemy") || "self",
            });
            break;

        case "summon":
            expectations.push({
                type: "summon",
                cardName: effect.name as string,
                amount: (effect.count as number) || 1,
            });
            break;

        case "stat":
            if (effect.action === "give" || effect.action === "set") {
                expectations.push({
                    type: "buff",
                    target: effect.target as string,
                    amount: `+${effect.attack || 0}/+${effect.defense || 0}`,
                });
            }
            break;

        case "keyword":
            if (effect.action === "grant" || effect.action === "give") {
                expectations.push({
                    type: "keyword_granted",
                    target: effect.target as string,
                    keywords: effect.keywords as string[],
                });
            }
            break;

        case "destroy":
            expectations.push({
                type: "destroy",
                target: effect.target as string,
            });
            break;

        case "evolve":
            expectations.push({
                type: "evolve",
                target: effect.target as string || "self",
            });
            break;

        case "counter":
            expectations.push({
                type: "counter",
                target: effect.key as string,
                amount: effect.amount as number,
            });
            break;

        case "return":
            expectations.push({
                type: "return",
                target: effect.target as string,
            });
            break;

        case "discard":
            expectations.push({
                type: "discard",
                amount: (effect.count as number) || 1,
            });
            break;

        case "transform":
            expectations.push({
                type: "transform",
                target: effect.target as string,
                cardName: effect.into as string,
            });
            break;

        case "cost":
            expectations.push({
                type: "cost_change",
                target: effect.target as string,
                amount: effect.amount as number,
            });
            break;

        case "search":
            expectations.push({
                type: "draw",
                player: "self",
                amount: (effect.count as number) || 1,
            });
            break;

        case "gate":
            // Conditional effect - analyze nested effects
            if (Array.isArray(effect.effects)) {
                for (const nested of effect.effects as Effect[]) {
                    expectations.push(...analyzeEffect(nested));
                }
            }
            break;

        case "mode":
            // Mode choice - analyze first option as representative
            if (Array.isArray(effect.options) && effect.options.length > 0) {
                const firstOption = effect.options[0] as { effects?: Effect[] };
                if (Array.isArray(firstOption.effects)) {
                    for (const nested of firstOption.effects) {
                        expectations.push(...analyzeEffect(nested));
                    }
                }
            }
            break;
    }

    return expectations;
}

function extractConditions(effect: Effect): Condition[] {
    const conditions: Condition[] = [];

    if (effect.op === "gate") {
        if (effect.condition === "combo") {
            conditions.push({ type: "combo", value: effect.count as number });
        } else if (effect.condition === "enhance") {
            conditions.push({ type: "enhance", value: effect.cost as number });
        }
    }

    return conditions;
}

function analyzeEffects(effects: Effect[]): { expectations: Expectation[], conditions: Condition[] } {
    const expectations: Expectation[] = [];
    const conditions: Condition[] = [];

    for (const effect of effects) {
        expectations.push(...analyzeEffect(effect));
        conditions.push(...extractConditions(effect));
    }

    return { expectations, conditions };
}

// =============================================================================
// SPEC GENERATOR
// =============================================================================

function generateSpec(card: CardDef): CardSpec {
    const scenarios: Scenario[] = [];

    // Fanfare effects
    if (card.fanfare && card.fanfare.length > 0) {
        const { expectations, conditions } = analyzeEffects(card.fanfare);
        if (expectations.length > 0) {
            scenarios.push({
                trigger: "fanfare",
                expectations,
                conditions: conditions.length > 0 ? conditions : undefined,
            });
        }
    }

    // Spell effects
    if (card.spell && card.spell.length > 0) {
        const { expectations, conditions } = analyzeEffects(card.spell);
        if (expectations.length > 0) {
            scenarios.push({
                trigger: "spell",
                expectations,
                conditions: conditions.length > 0 ? conditions : undefined,
            });
        }
    }

    // Evolve effects
    if (card.evolve && card.evolve.length > 0) {
        const { expectations } = analyzeEffects(card.evolve);
        if (expectations.length > 0) {
            scenarios.push({
                trigger: "evolve",
                expectations,
            });
        }
    }

    // Super-Evolve effects
    if (card.superevolve && card.superevolve.length > 0) {
        const { expectations } = analyzeEffects(card.superevolve);
        if (expectations.length > 0) {
            scenarios.push({
                trigger: "superevolve",
                expectations,
            });
        }
    }

    // Keyword effects (LastWords, Engage, etc.)
    if (card.keywords) {
        for (const kw of card.keywords) {
            if (typeof kw === "object" && kw.effects) {
                const { expectations } = analyzeEffects(kw.effects);
                if (expectations.length > 0) {
                    const trigger = kw.name === "LastWords" ? "lastwords" :
                        kw.name === "Enhance" ? "enhance" : "other";
                    scenarios.push({
                        trigger,
                        expectations,
                    });
                }
            }
        }
    }

    // Trigger effects (Strike, Clash, etc.)
    if (card.triggers) {
        for (const trigger of card.triggers) {
            if (trigger.effects) {
                const { expectations } = analyzeEffects(trigger.effects);
                if (expectations.length > 0) {
                    scenarios.push({
                        trigger: trigger.event as Scenario["trigger"] || "other",
                        expectations,
                    });
                }
            }
        }
    }

    return {
        id: card.id,
        name: card.name,
        type: card.type,
        cost: typeof card.cost === "string" ? parseInt(card.cost, 10) : card.cost,
        description: card.description || null,
        scenarios,
    };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    // Load cards
    const allCardsPath = path.join(__dirname, "..", "cards", "all.json");
    const tokenCardsPath = path.join(__dirname, "..", "cards", "token_details.json");

    const allCards: CardDef[] = JSON.parse(fs.readFileSync(allCardsPath, "utf-8"));
    const tokenCards: CardDef[] = JSON.parse(fs.readFileSync(tokenCardsPath, "utf-8"));

    const allCardDefs = [...allCards, ...tokenCards];

    console.log(`Generating specs for ${allCardDefs.length} cards...`);

    // Generate specs
    const specs: CardSpec[] = [];
    let withScenarios = 0;
    let totalScenarios = 0;

    for (const card of allCardDefs) {
        const spec = generateSpec(card);
        specs.push(spec);

        if (spec.scenarios.length > 0) {
            withScenarios++;
            totalScenarios += spec.scenarios.length;
        }
    }

    // Write specs
    const outputPath = path.join(__dirname, "specs", "generated_specs.json");
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(specs, null, 2));

    console.log(`\nGenerated specs for ${specs.length} cards`);
    console.log(`Cards with testable scenarios: ${withScenarios}`);
    console.log(`Total scenarios: ${totalScenarios}`);
    console.log(`Output: ${outputPath}`);

    // Summary by trigger type
    const triggerCounts: Record<string, number> = {};
    for (const spec of specs) {
        for (const scenario of spec.scenarios) {
            triggerCounts[scenario.trigger] = (triggerCounts[scenario.trigger] || 0) + 1;
        }
    }
    console.log("\nScenarios by trigger:");
    for (const [trigger, count] of Object.entries(triggerCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${trigger}: ${count}`);
    }
}

main().catch(console.error);
