import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "../");
export const CARDS_DIR = path.join(ROOT, "cards");
export const SETS_DIR = path.join(CARDS_DIR, "sets");
export const ALL_FILE = path.join(CARDS_DIR, "all.json");
export const INDEX_FILE = path.join(CARDS_DIR, "index.json");

export interface MergedCards {
  allCards: unknown[];
  indexData: Record<string, string>;
}

/** Merge all set files under cards/sets/ (canonical card-data source). */
export function mergeSetsFromDisk(setsDir = SETS_DIR): MergedCards {
  if (!fs.existsSync(setsDir)) {
    throw new Error(`Sets directory not found: ${setsDir}`);
  }

  const files = fs.readdirSync(setsDir).filter((f) => f.endsWith(".json"));
  const allCards: unknown[] = [];
  const indexData: Record<string, string> = {};

  files.sort((a, b) => {
    const idA = parseInt(a.split("_")[0]) || 999999;
    const idB = parseInt(b.split("_")[0]) || 999999;
    return idA - idB;
  });

  for (const file of files) {
    const filePath = path.join(setsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const json: unknown = JSON.parse(raw);
    if (!Array.isArray(json)) {
      console.warn(`Skipping ${file}: Not an array.`);
      continue;
    }

    allCards.push(...json);

    const setIdMatch = file.match(/^(\d+)_/);
    if (setIdMatch) {
      indexData[setIdMatch[1]] = `sets/${file}`;
    }
  }

  return { allCards, indexData };
}

async function main() {
  console.log(`Reading sets from: ${SETS_DIR}`);

  const { allCards, indexData } = mergeSetsFromDisk();

  for (const file of fs
    .readdirSync(SETS_DIR)
    .filter((f) => f.endsWith(".json"))) {
    const filePath = path.join(SETS_DIR, file);
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (Array.isArray(json)) {
      console.log(`Merged ${file} (${json.length} cards)`);
    }
  }

  console.log(`Writing combined file: ${ALL_FILE} (${allCards.length} cards)`);
  fs.writeFileSync(ALL_FILE, JSON.stringify(allCards, null, 2));

  console.log(`Writing index to ${INDEX_FILE}`);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));

  console.log("Done.");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
