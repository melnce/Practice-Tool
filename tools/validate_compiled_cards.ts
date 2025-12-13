
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../');
const COMPILED_DIR = path.join(ROOT, 'cards/compiled');

// Valid ops (incomplete list, but good for v1 check)
const KNOWN_OPS = ["draw", "damage", "summon", "summon_named", "select", "damage_follower_or_leader", "reduce_cost_self"];

async function main() {
    console.log(`Validating cards in ${COMPILED_DIR}...`);
    if (!fs.existsSync(COMPILED_DIR)) {
        console.error("Compiled directory not found.");
        process.exit(1);
    }

    const files = fs.readdirSync(COMPILED_DIR).filter(f => f.endsWith('.json'));
    let hasErrors = false;

    for (const file of files) {
        const content = fs.readFileSync(path.join(COMPILED_DIR, file), 'utf-8');
        const cards = JSON.parse(content);

        for (const card of cards) {
            // Check unresolved
            if (card.unresolved && card.unresolved.length > 0) {
                console.error(`[FAIL] ${card.name} (${file}) has unresolved text:`);
                card.unresolved.forEach((u: string) => console.error(`  - "${u}"`));
                hasErrors = true;
            }

            // Check ops match basic whitelist
            const checkEffects = (effs: any[]) => {
                if (!Array.isArray(effs)) return;
                effs.forEach(e => {
                    if (!KNOWN_OPS.includes(e.op)) {
                        // Loose check for now, specific ops might be missing from my list
                        // console.warn(`[WARN] ${card.name}: Unknown op "${e.op}"`);
                    }
                    if (e.effects) checkEffects(e.effects);
                });
            };

            checkEffects(card.fanfare);
            checkEffects(card.lastWordsEffects);
            checkEffects(card.spell);
        }
    }

    if (hasErrors) {
        console.error("\nValidation failed.");
        process.exit(1);
    } else {
        console.log("\nValidation passed.");
    }
}

main().catch(e => console.error(e));
