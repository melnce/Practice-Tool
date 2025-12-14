
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../');
const CARDS_DIR = path.join(ROOT, 'cards');
const SETS_DIR = path.join(CARDS_DIR, 'sets');
const ALL_FILE = path.join(CARDS_DIR, 'all.json');
const INDEX_FILE = path.join(CARDS_DIR, 'index.json');

// Helper to ensure directory exists
if (!fs.existsSync(SETS_DIR)) {
    console.error(`Sets directory not found: ${SETS_DIR}`);
    process.exit(1);
}

async function main() {
    console.log(`Reading sets from: ${SETS_DIR}`);

    const files = fs.readdirSync(SETS_DIR).filter(f => f.endsWith('.json'));
    const allCards: any[] = [];
    const indexData: Record<string, string> = {};

    // Sort files to ensure deterministic order (by set ID usually present in filename)
    files.sort((a, b) => {
        const idA = parseInt(a.split('_')[0]) || 999999;
        const idB = parseInt(b.split('_')[0]) || 999999;
        return idA - idB;
    });

    for (const file of files) {
        const filePath = path.join(SETS_DIR, file);
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const json = JSON.parse(raw);
            if (!Array.isArray(json)) {
                console.warn(`Skipping ${file}: Not an array.`);
                continue;
            }

            console.log(`Merging ${file} (${json.length} cards)`);
            allCards.push(...json);

            // Populate index
            const setIdMatch = file.match(/^(\d+)_/);
            if (setIdMatch) {
                indexData[setIdMatch[1]] = `sets/${file}`;
            }
        } catch (e) {
            console.error(`Error reading ${file}:`, e);
        }
    }

    // Write all.json
    console.log(`Writing combined file: ${ALL_FILE} (${allCards.length} cards)`);
    fs.writeFileSync(ALL_FILE, JSON.stringify(allCards, null, 2));

    // Write index.json
    console.log(`Writing index to ${INDEX_FILE}`);
    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));

    console.log("Done.");
}

main().catch(e => console.error(e));

