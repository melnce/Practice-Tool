/**
 * scripts/scan-op-signatures.ts
 * 
 * Scans card JSON for sets 0-3 (excluding set 4 skybound-dragons).
 * Extracts normalized "op signatures" from each card's effects.
 * Outputs a markdown report to docs/reports/op_signature_inventory.md
 * 
 * Usage: npx tsx scripts/scan-op-signatures.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanSets, SignatureEntry } from "../src/data/opSignatureScanner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const SETS_DIR = path.join(__dirname, "..", "cards", "sets");
const TOKENS_FILE = path.join(__dirname, "..", "cards", "token_details.json");
const OUTPUT_DIR = path.join(__dirname, "..", "docs", "reports");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "op_signature_inventory.md");

// Sets to scan (0-3), excluding set 4
const SETS_TO_SCAN = [
    "10000_basic.json",
    "10001_legends-rise.json",
    "10002_infinity-evolved.json",
    "10003_heirs-of-the-omen.json",
];

// Known ops from the codebase
const KNOWN_OPS = new Set([
    // Combat
    "damage", "damage_all", "damage_random", "damage_split_sequential",
    "damage_follower_or_leader", "damage_all_by_allied_golems", "damage_split_fixed",
    "damage_random_selected_defense", "damage_split_all_enemies", "damage_highest_defense",
    "damage_enemy_leader_by_other_allies", "damage_self",
    "destroy", "destroy_all", "destroy_highest", "destroy_random",
    "destroy_random_other_allies", "destroy_allied_amulets",
    "destroy_allied_amulets_then_damage", "destroy_self", "destroy_then",
    "destroy_defender_if_damaged", "follower_strike_destroy",
    "banish", "banish_all_enemy_copies", "banish_duplicates_from_deck",
    "banish_random", "banish_self",
    "heal_leader", "dynamic_heal_leader", "set_max_hp", "leader_barrier",
    "restore_full_defense_self", "restore_self_and_heal_leader", "restore_allies",
    // Board
    "summon_named", "summon_named_enemy", "summon_exact_copy", "summon_last_destroyed",
    "reanimate", "reanimate_ally", "return_to_hand", "return_to_hand_then",
    "bounce_all_enemy", "bounce_random_enemy", "swap_with_deck",
    "transform", "transform_random", "transform_random_enemy",
    "swap_attack_defense", "swap_attack_defense_all",
    // Buffs
    "buff", "buff_self", "dynamic_buff_self", "buff_all", "buff_random",
    "set_stats", "set_attack", "keyword", "keyword_all",
    "modify_cost", "reduce_cost", "reduce_cost_in_hand", "spellboost_hand",
    "remove_keyword", "copy_stats",
    // Resources
    "add_max_pp", "gain_max_pp", "recover_pp", "recover_ep",
    "add_shadows", "necromancy_gate", "overflow_gate", "earth_rite",
    "draw", "draw_all_named_with_keyword", "draw_combo_follower",
    "draw_filtered", "draw_named", "draw_opponent", "add_to_hand",
    "add_selected_copy_to_hand", "discard_select_hand", "discard_all_except_named",
    "transform_in_hand", "transform_random_spell_in_hand",
    "replace_deck", "replace_deck_with_set_minus", "set_cost_last_drawn",
    "halve_deck_cost", "reduce_deck_followers_cost",
    "gain_crest", "crest_add_counter", "crest_pay_counter",
    "fuse_start", "start_fortifier_fuse", "start_fuse_from_card",
    "fuse_finalize_generic", "fuse_finalize_alpha", "fuse_finalize_gear_multi",
    "fuse_finalize_fortifier", "fuse_finalize_gardens_allure", "fuse_finalize_loot",
    // Misc
    "choose", "select", "target", "evolve_self", "super_evolve_self",
    "rally_gate", "combo_gate", "max_pp_gate", "board_name_gate",
    "super_evolved_allied_gate", "amulet_count_gate", "skybound_art_gate",
    "nested_effects", "repeat_effect", "conditional",
    "add_counter", "reduce_countdown", "invoke_from_deck",
    "shuffle_into_deck", "return_hand_to_deck",
    "increase_opponent_hand_cost_eot", "double_stats_allies",
    "himeka_crest_effect",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
    const { signatures: results, setStats } = scanSets(SETS_DIR, SETS_TO_SCAN, TOKENS_FILE);
    const unknownOps = new Set<string>();

    // Check for unknown ops
    for (const entry of results.values()) {
        if (!KNOWN_OPS.has(entry.normalizedSig.op)) {
            unknownOps.add(entry.normalizedSig.op);
        }
    }

    // Sort results by op name
    const sortedEntries = [...results.values()].sort((a, b) => a.normalizedSig.op.localeCompare(b.normalizedSig.op));

    // Group by op
    const byOp = new Map<string, SignatureEntry[]>();
    for (const entry of sortedEntries) {
        const op = entry.normalizedSig.op;
        if (!byOp.has(op)) byOp.set(op, []);
        byOp.get(op)!.push(entry);
    }

    // Generate markdown report
    const lines: string[] = [];
    lines.push("# Op Signature Inventory");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push("| Set | Card Count |");
    lines.push("|-----|------------|");
    for (const s of setStats) {
        lines.push(`| ${s.name} | ${s.cardCount} |`);
    }
    lines.push("");
    lines.push(`**Total unique op signatures:** ${results.size}`);
    lines.push(`**Total unique ops used:** ${byOp.size}`);
    lines.push("");

    if (unknownOps.size > 0) {
        lines.push("## ⚠️ Unknown/Unimplemented Ops");
        lines.push("");
        for (const op of [...unknownOps].sort()) {
            lines.push(`- \`${op}\``);
        }
        lines.push("");
    }

    lines.push("## Op Signatures by Operation");
    lines.push("");

    for (const [op, entries] of [...byOp.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const isUnknown = unknownOps.has(op);
        lines.push(`### ${op}${isUnknown ? " ⚠️" : ""}`);
        lines.push("");
        lines.push("| Signature | Zone | Representative Card | Usage Count |");
        lines.push("|-----------|------|---------------------|-------------|");
        for (const entry of entries) {
            const sig = entry.signature; // No truncation for CI guard accuracy
            lines.push(`| \`${sig}\` | ${entry.zone} | ${entry.representativeCard} | ${entry.count} |`);
        }
        lines.push("");
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write report
    fs.writeFileSync(OUTPUT_FILE, lines.join("\n"), "utf-8");
    console.log(`✅ Report written to: ${OUTPUT_FILE}`);
    console.log(`   Total unique signatures: ${results.size}`);
    console.log(`   Total unique ops: ${byOp.size}`);
    if (unknownOps.size > 0) {
        console.log(`   ⚠️ Unknown ops: ${[...unknownOps].join(", ")}`);
    }
}

main();
