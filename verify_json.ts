import * as fs from "fs";

try {
    const filePath = "cards/sets/10004_skybound-dragons.json";
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const card = content.find((c: any) => c.name === "Beelzebub, Supreme King");

    if (!card) throw new Error("Card not found");

    console.log("Card found:", card.name);
    console.log("Fanfare length:", card.fanfare.length);
    console.log("Fanfare[0] op:", card.fanfare[0].op);
    console.log("Fanfare[0] count:", card.fanfare[0].count);
    console.log("Fanfare[0] target:", card.fanfare[0].target);
    console.log("Fanfare[0] effects count:", card.fanfare[0].effects.length);
    console.log("Fanfare[1] op:", card.fanfare[1].op);
    console.log("Fanfare[1] amount:", card.fanfare[1].amount);

    if (card.fanfare[0].effects[0].op !== "remove_abilities")
        throw new Error("Effect 0 mismatch");
    if (card.fanfare[0].effects[1].op !== "damage")
        throw new Error("Effect 1 mismatch");
    if (card.fanfare[0].effects[1].amount !== 9)
        throw new Error("Damage amount mismatch");
    if (card.fanfare[1].op !== "add_leader_damage_taken_bonus")
        throw new Error("Effect 2 mismatch");

    console.log("VERIFICATION SUCCESS");
} catch (e: any) {
    console.error("VERIFICATION FAILED:", e.message);
    process.exit(1);
}
