
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const dir = process.argv[2];

function scan(d) {
    if (!fs.existsSync(d)) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    entries.forEach(entry => {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
            // Recurse? Maybe later. For now just shallow or specific dir.
        } else if (entry.name.endsWith('.ts')) {
            try {
                execSync(`npx eslint "${fullPath}" --no-color --max-warnings=0`, { stdio: 'pipe' });
            } catch (e) {
                console.log(`FAIL: ${fullPath}`);
            }
        }
    });
}
scan(dir);
