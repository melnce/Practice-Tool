// Debug script to verify all replay deck cards exist
(globalThis as Record<string, unknown>).HEADLESS = true;

async function main() {
  const { initCardDatabaseNode } =
    await import("../dist/data/cardLoaderNode.js");
  const { getCardDetails } = await import("../dist/data/cardIndex.js");

  await initCardDatabaseNode();

  const CARDS = [
    "Goblin",
    "Fighter",
    "Wise Merman",
    "Goliath",
    "Angel of the Word",
    "Insight",
    "Gilgamesh",
    "Dark Angel Olivia",
  ];

  const missing = CARDS.filter((name) => !getCardDetails(name));
  console.log("Missing cards:", missing.length ? missing : "None");
}

main().catch(console.error);
