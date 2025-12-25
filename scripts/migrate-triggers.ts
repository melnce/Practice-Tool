/**
 * Migration Script: Convert singular "trigger" to "triggers" array in card JSONs
 * 
 * This script finds all occurrences of "trigger": {...} or "trigger": [...]
 * and converts them to "triggers": [...]
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CARDS_DIR = path.join(__dirname, '..', 'cards');
const SET_DIR = path.join(CARDS_DIR, 'sets');

interface MigrationResult {
    file: string;
    migratedCount: number;
}

function migrateFile(filePath: string): MigrationResult {
    const content = fs.readFileSync(filePath, 'utf-8');
    let migratedCount = 0;

    // Parse JSON
    let data: any;
    try {
        data = JSON.parse(content);
    } catch (e) {
        console.error(`Failed to parse ${filePath}:`, e);
        return { file: filePath, migratedCount: 0 };
    }

    // Recursive migration function
    function migrate(obj: any): void {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
            for (const item of obj) {
                migrate(item);
            }
            return;
        }

        // Check for "trigger" property (singular)
        if ('trigger' in obj && !('triggers' in obj)) {
            const trigger = obj.trigger;

            // Convert to array format
            if (Array.isArray(trigger)) {
                // Already an array, just rename
                obj.triggers = trigger;
            } else if (trigger && typeof trigger === 'object') {
                // Single object, wrap in array
                obj.triggers = [trigger];
            } else {
                // Skip if not valid trigger data
                delete obj.trigger;
                return;
            }

            delete obj.trigger;
            migratedCount++;
        }

        // Recurse into all properties
        for (const key of Object.keys(obj)) {
            migrate(obj[key]);
        }
    }

    migrate(data);

    if (migratedCount > 0) {
        // Write back with pretty formatting
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
        console.log(`✅ Migrated ${migratedCount} trigger(s) in ${path.basename(filePath)}`);
    }

    return { file: filePath, migratedCount };
}

function run() {
    console.log('🚀 Starting trigger → triggers migration...\n');

    const results: MigrationResult[] = [];

    // Process all.json
    const allJsonPath = path.join(CARDS_DIR, 'all.json');
    if (fs.existsSync(allJsonPath)) {
        results.push(migrateFile(allJsonPath));
    }

    // Process set files
    if (fs.existsSync(SET_DIR)) {
        const setFiles = fs.readdirSync(SET_DIR).filter(f => f.endsWith('.json'));
        for (const setFile of setFiles) {
            results.push(migrateFile(path.join(SET_DIR, setFile)));
        }
    }

    // Summary
    const totalMigrated = results.reduce((sum, r) => sum + r.migratedCount, 0);
    const filesChanged = results.filter(r => r.migratedCount > 0).length;

    console.log(`\n📊 Migration complete:`);
    console.log(`   - ${totalMigrated} trigger(s) converted to triggers[]`);
    console.log(`   - ${filesChanged} file(s) modified`);
}

run();
