
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const setsDir = path.resolve('cards/sets');
const tokenFile = path.resolve('cards/token_details.json');

console.log(`Watching for changes in ${setsDir} and ${tokenFile}...`);

let debounceTimer: NodeJS.Timeout | null = null;

function runMerge() {
    console.log('Change detected. Running mergeSets.ts...');
    exec('npx tsx scripts/mergeSets.ts', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error running merge script: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Merge script stderr: ${stderr}`);
        }
        console.log(stdout);
        console.log('Update complete.');
    });
}

const watcherCallback = (eventType: string, filename: string | null) => {
    if (filename && filename.endsWith('.json')) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runMerge, 500);
    }
};

try {
    fs.watch(setsDir, watcherCallback);
    // basic file watching for single file
    fs.watchFile(tokenFile, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
            watcherCallback('change', 'token_details.json');
        }
    });

    // Run once immediately on startup
    runMerge();
} catch (e) {
    console.error("Failed to start watcher:", e);
}

