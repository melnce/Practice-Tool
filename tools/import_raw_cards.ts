import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { compileCardText } from "../src/data/textCompiler/compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "../");
const RAW_DIR = path.join(ROOT, "cards/raw");
const COMPILED_DIR = path.join(ROOT, "cards/compiled");

if (!fs.existsSync(COMPILED_DIR)) {
  fs.mkdirSync(COMPILED_DIR, { recursive: true });
}

async function main() {
  console.log(`Searching for raw cards in ${RAW_DIR}...`);
  if (!fs.existsSync(RAW_DIR)) {
    console.error("Raw directory not found.");
    process.exit(1);
  }

  const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const rawContent = fs.readFileSync(path.join(RAW_DIR, file), "utf-8");
    let cards;
    try {
      cards = JSON.parse(rawContent);
      if (!Array.isArray(cards)) cards = [cards];
    } catch (e) {
      console.error(`Failed to parse ${file}:`, e);
      continue;
    }

    const compiledCards = cards.map((raw: any) => {
      console.log(`  Compiling ${raw.name}...`);
      const compiled = compileCardText(raw.text || "", raw.type || "Follower");

      // Merge compiled effects with raw structure
      return {
        id: raw.id,
        name: raw.name,
        type: raw.type,
        class: raw.craft || raw.class, // normalize
        cost: raw.cost,
        stats: raw.stats, // optional
        // Compiler outputs
        keywords: compiled.keywords,
        fanfare: compiled.fanfare,
        lastWordsEffects: compiled.lastWords,
        spell: compiled.spell,
        unresolved: compiled.unresolved,
        // Debug info
        sourceText: raw.text,
      };
    });

    const outFile = path.join(COMPILED_DIR, file); // matched filename
    fs.writeFileSync(outFile, JSON.stringify(compiledCards, null, 2));
    console.log(`  Wrote ${compiledCards.length} cards to ${outFile}`);
  }
}

main().catch((e) => console.error(e));
