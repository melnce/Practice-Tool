#!/usr/bin/env node
// scripts/migrate-damage-ops.ts
// Migrates all legacy damage_* ops to canonical "op": "damage" format.
//
// Usage: npx ts-node scripts/migrate-damage-ops.ts [--dry-run]

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// MIGRATION RULES
// ============================================================================

interface MigrationRule {
    legacyOp: string;
    transform: (eff: any) => any;
}

const MIGRATION_RULES: MigrationRule[] = [
    {
        legacyOp: "damage_all",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            // damage_all with target is just direct damage to pool
            // No need to add distribution: "direct" as it's the default
        }),
    },
    {
        legacyOp: "damage_random",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            distribution: "random_hits",
            count: eff.count ?? 1,
        }),
    },
    {
        legacyOp: "damage_split_sequential",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            distribution: "split_sequential",
            amount_source: "hand_size",
        }),
    },
    {
        legacyOp: "damage_split_fixed",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            distribution: "split_sequential",
        }),
    },
    {
        legacyOp: "damage_split_all_enemies",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            distribution: "split_sequential",
            spill_to_leader: true,
            ...(String(eff.count_source || "").toLowerCase() === "crest_count"
                ? { amount_source: "crest_count" }
                : {}),
        }),
    },
    {
        legacyOp: "damage_follower_or_leader",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            select: 1,
            fallback_leader: true,
        }),
    },
    {
        legacyOp: "damage_all_by_allied_golems",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            amount_source: "golem_count",
            target: eff.target || "enemy:follower",
        }),
    },
    {
        legacyOp: "damage_random_selected_defense",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            distribution: "random_hits",
            count: 1,
            amount_source: "selected_defense",
            target: eff.target || "enemy:follower",
        }),
    },
    {
        legacyOp: "damage_highest_defense",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            distribution: "by_stat",
            stat: "defense",
        }),
    },
    {
        legacyOp: "damage_self",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            target: "self",
        }),
    },
    {
        legacyOp: "damage_enemy_leader_by_other_allies",
        transform: (eff) => ({
            ...eff,
            op: "damage",
            amount_source: "other_allies",
            target: "enemy:leader",
        }),
    },
];

// ============================================================================
// MIGRATION ENGINE
// ============================================================================

interface MigrationStats {
    filesProcessed: number;
    effectsMigrated: number;
    byOp: Record<string, number>;
    warnings: string[];
}

function cleanObject(obj: any): any {
    // Remove undefined/null values and legacy fields that are now redundant
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
            // Remove count_source after migration (replaced by amount_source)
            if (key === "count_source") continue;
            result[key] = value;
        }
    }
    return result;
}

function migrateEffect(eff: any, stats: MigrationStats, cardId: string): any {
    if (!eff || typeof eff !== "object") return eff;

    const op = eff.op as string;
    if (!op) return eff;

    // Find matching migration rule
    const rule = MIGRATION_RULES.find((r) => r.legacyOp === op);
    if (rule) {
        stats.effectsMigrated++;
        stats.byOp[op] = (stats.byOp[op] || 0) + 1;
        const migrated = cleanObject(rule.transform(eff));
        return migrated;
    }

    return eff;
}

function migrateArray(arr: any[], stats: MigrationStats, cardId: string): any[] {
    return arr.map((item) => {
        if (Array.isArray(item)) return migrateArray(item, stats, cardId);
        if (typeof item === "object" && item !== null) return migrateObject(item, stats, cardId);
        return item;
    });
}

function migrateObject(obj: any, stats: MigrationStats, cardId: string): any {
    if (!obj || typeof obj !== "object") return obj;

    // First, migrate this object if it's an effect
    let result = migrateEffect(obj, stats, cardId);

    // Then recurse into nested arrays/objects
    const migrated: any = {};
    for (const [key, value] of Object.entries(result)) {
        if (Array.isArray(value)) {
            migrated[key] = migrateArray(value, stats, cardId);
        } else if (typeof value === "object" && value !== null) {
            migrated[key] = migrateObject(value, stats, cardId);
        } else {
            migrated[key] = value;
        }
    }
    return migrated;
}

function migrateFile(filePath: string, dryRun: boolean, stats: MigrationStats): void {
    const content = fs.readFileSync(filePath, "utf-8");
    let data: any;
    try {
        data = JSON.parse(content);
    } catch (e) {
        stats.warnings.push(`Failed to parse ${filePath}: ${e}`);
        return;
    }

    stats.filesProcessed++;

    // Handle both array of cards and single card
    const cards = Array.isArray(data) ? data : [data];
    const migratedCards = cards.map((card) => {
        const cardId = card.id || card.name || "unknown";
        return migrateObject(card, stats, cardId);
    });

    const migratedData = Array.isArray(data) ? migratedCards : migratedCards[0];
    const migratedContent = JSON.stringify(migratedData, null, 2) + "\n";

    if (!dryRun && migratedContent !== content) {
        fs.writeFileSync(filePath, migratedContent, "utf-8");
    }
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");

    console.log("=".repeat(60));
    console.log("Damage Op Migration Script");
    console.log(dryRun ? "MODE: DRY RUN (no changes will be written)" : "MODE: LIVE");
    console.log("=".repeat(60));

    const stats: MigrationStats = {
        filesProcessed: 0,
        effectsMigrated: 0,
        byOp: {},
        warnings: [],
    };

    // Find all JSON files in cards/sets
    const cardsDir = path.join(__dirname, "..", "cards", "sets");
    const files = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
        console.log(`Processing: ${file}`);
        migrateFile(path.join(cardsDir, file), dryRun, stats);
    }

    // Also migrate token_details.json
    const tokenFile = path.join(__dirname, "..", "cards", "token_details.json");
    if (fs.existsSync(tokenFile)) {
        console.log("Processing: token_details.json");
        migrateFile(tokenFile, dryRun, stats);
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Files processed: ${stats.filesProcessed}`);
    console.log(`Effects migrated: ${stats.effectsMigrated}`);
    console.log("\nBy legacy op:");
    for (const [op, count] of Object.entries(stats.byOp).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${op}: ${count}`);
    }

    if (stats.warnings.length) {
        console.log("\nWARNINGS:");
        for (const w of stats.warnings) {
            console.log(`  ${w}`);
        }
    }

    console.log("\n" + (dryRun ? "Dry run complete. No files were modified." : "Migration complete!"));
}

main();
