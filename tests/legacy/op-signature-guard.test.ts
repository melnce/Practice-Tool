
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { scanSets } from "../../src/data/opSignatureScanner.js";

const SETS_DIR = path.join(__dirname, "../../cards/sets");
const TOKENS_FILE = path.join(__dirname, "../../cards/token_details.json");
const INVENTORY_FILE = path.join(__dirname, "../../docs/reports/op_signature_inventory.md");

const SETS_TO_SCAN = [
    "10000_basic.json",
    "10001_legends-rise.json",
    "10002_infinity-evolved.json",
    "10003_heirs-of-the-omen.json",
];

describe("Op Signature Guard", () => {
    it("should match the committed op signature inventory", () => {
        // 1. Scan current code
        const scanResult = scanSets(SETS_DIR, SETS_TO_SCAN, TOKENS_FILE);
        const currentSignatures = new Set(scanResult.signatures.keys());

        // 2. Parse committed inventory
        if (!fs.existsSync(INVENTORY_FILE)) {
            throw new Error(`Inventory file not found at ${INVENTORY_FILE}. Run 'npx tsx scripts/scan-op-signatures.ts' to generate it.`);
        }
        const inventoryContent = fs.readFileSync(INVENTORY_FILE, "utf-8");
        const inventorySignatures = new Set<string>();

        // Extract signatures from markdown table rows: | `signature` | ...
        const regex = /^\| `([^`]+)` \|/gm;
        let match;
        while ((match = regex.exec(inventoryContent)) !== null) {
            inventorySignatures.add(match[1]);
        }

        // 3. Compare
        const newSignatures: string[] = [];
        const missingSignatures: string[] = [];

        for (const sig of currentSignatures) {
            if (!inventorySignatures.has(sig)) {
                newSignatures.push(sig);
            }
        }

        for (const sig of inventorySignatures) {
            if (!currentSignatures.has(sig)) {
                missingSignatures.push(sig);
            }
        }

        // 4. Report
        if (newSignatures.length > 0 || missingSignatures.length > 0) {
            console.error("Op Signature Mismatch Detected!");

            if (newSignatures.length > 0) {
                console.error("\n[NEW SIGNATURES] - These appear in sets 0-3 but are not in the inventory:");
                newSignatures.forEach(s => {
                    const entry = scanResult.signatures.get(s);
                    console.error(`  - ${s} (e.g. ${entry?.representativeCard})`);
                });
            }

            if (missingSignatures.length > 0) {
                console.error("\n[MISSING SIGNATURES] - These are in the inventory but no longer in sets 0-3:");
                missingSignatures.forEach(s => console.error(`  - ${s}`));
            }

            console.error("\nTo fix this:");
            console.error("1. Run 'npx tsx scripts/scan-op-signatures.ts' to update the inventory.");
            console.error("2. If you added a new feature, ensure you have added corresponding tests in 'tests/unit/ops-signatures.test.ts'.");
            console.error("3. Commit the updated inventory file.");
        }

        expect(newSignatures).toEqual([]);
        expect(missingSignatures).toEqual([]);
    });
});
