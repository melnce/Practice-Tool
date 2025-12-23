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

const updated = cards.map((c: any) => {
  if (c.id) return c;
  const match = c.base_image.match(/\/(\d+)\.webp/);
  if (match) {
    c.id = match[1];
  } else {
    console.warn(`No ID found for ${c.name}`);
  }
  // Clean description: "Fanfare:Skybound" -> "Fanfare: Skybound"
  if (c.description) {
    c.description = c.description
      .replace(/Fanfare:(\S)/g, "Fanfare: $1")
      .replace(/Enhance\((\d+)\):(\S)/g, "Enhance($1): $2");
  }
  return c;
});

fs.writeFileSync(FILE, JSON.stringify(updated, null, 2));
console.log("IDs injected.");
