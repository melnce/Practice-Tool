import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.resolve(
  __dirname,
  "../cards/sets/10004_skybound-dragons.json",
);

const raw = fs.readFileSync(FILE, "utf-8");
const cards = JSON.parse(raw);

const reordered = cards.map((c: any) => {
  // strict order: id, name, ...rest
  const { id, name, ...rest } = c;
  return { id, name, ...rest };
});

fs.writeFileSync(FILE, JSON.stringify(reordered, null, 2));
console.log("IDs moved to top.");
