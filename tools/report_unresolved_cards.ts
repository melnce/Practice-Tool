
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../');
const COMPILED_DIR = path.join(ROOT, 'cards/compiled');
const REPORT_DIR = path.join(ROOT, 'cards/reports');
const REPORT_FILE = path.join(REPORT_DIR, 'unresolved_report.json');

if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
}

interface UnresolvedEntry {
    text: string;
    count: number;
    examples: string[];
}

export function generateReportData(cards: any[]): { stats: any, ranking: UnresolvedEntry[] } {
    let totalUnresolvedClauses = 0;
    let cardsWithUnresolved = 0;
    const clauseMap = new Map<string, UnresolvedEntry>();

    for (const card of cards) {
        if (card.unresolved && card.unresolved.length > 0) {
            cardsWithUnresolved++;
            for (const rawText of card.unresolved) {
                totalUnresolvedClauses++;

                // Normalize: trim, collapse spaces, remove trailing period
                const normalized = rawText.trim().replace(/\s+/g, ' ').replace(/\.$/, '');

                if (!clauseMap.has(normalized)) {
                    clauseMap.set(normalized, { text: normalized, count: 0, examples: [] });
                }
                const entry = clauseMap.get(normalized)!;
                entry.count++;
                if (entry.examples.length < 5) {
                    entry.examples.push(card.id);
                }
            }
        }
    }

    const ranking = Array.from(clauseMap.values()).sort((a, b) => b.count - a.count);

    const stats = {
        totalCards: cards.length,
        cardsWithUnresolved,
        percentUnresolved: cards.length ? ((cardsWithUnresolved / cards.length) * 100).toFixed(1) + "%" : "0.0%",
        totalUnresolvedClauses
    };

    return { stats, ranking };
}

async function main() {
    console.log(`Reading compiled cards from ${COMPILED_DIR}...`);
    if (!fs.existsSync(COMPILED_DIR)) {
        console.error("Compiled directory not found.");
        process.exit(1);
    }

    const files = fs.readdirSync(COMPILED_DIR).filter(f => f.endsWith('.json'));
    const allCards: any[] = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(COMPILED_DIR, file), 'utf-8');
        try {
            const cards = JSON.parse(content);
            allCards.push(...cards);
        } catch (e) {
            console.error(`Failed to parse ${file}`);
        }
    }

    const { stats, ranking } = generateReportData(allCards);

    // Stdout Summary
    console.log("\n--- Unresolved Coverage Report ---");
    console.log(`Total Cards: ${stats.totalCards}`);
    console.log(`Cards with Issues: ${stats.cardsWithUnresolved} (${stats.percentUnresolved})`);
    console.log(`Total Unresolved Clauses: ${stats.totalUnresolvedClauses}`);
    console.log("\nTop 50 Unresolved Patterns:");

    ranking.slice(0, 50).forEach(entry => {
        console.log(`${String(entry.count).padStart(4)} | ${entry.text}`);
    });

    // Write JSON
    const report = {
        stats,
        unresolved: ranking
    };
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`\nDetailed report written to ${REPORT_FILE}`);
}

// Only run main if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('report_unresolved_cards.ts')) {
    main().catch(console.error);
}
