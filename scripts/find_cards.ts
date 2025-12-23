import fs from "fs";
const all = JSON.parse(fs.readFileSync("cards/all.json", "utf-8"));
const tokens = JSON.parse(fs.readFileSync("cards/token_details.json", "utf-8"));

interface Card {
  name: string;
  cost: number | string;
  type: string;
}

const combined = [...all, ...tokens] as Card[];
const spells = combined.filter((c) => c.type === "Spell");
const highCost = combined.filter(
  (c) =>
    c.type === "Follower" &&
    (typeof c.cost === "number" ? c.cost >= 7 : parseInt(String(c.cost)) >= 7),
);

console.log("Spells (first 10):");
spells.slice(0, 10).forEach((c) => console.log(`  ${c.name} (cost ${c.cost})`));

console.log("\nHigh Cost Followers (first 10):");
highCost
  .slice(0, 10)
  .forEach((c) => console.log(`  ${c.name} (cost ${c.cost})`));
