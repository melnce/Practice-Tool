
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function scan(d) {
    if (!fs.existsSync(d)) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    entries.forEach(entry => {
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
            scan(fullPath);
        } else if (entry.name.endsWith('.ts')) {
            try {
                execSync(`npx eslint "${fullPath}" --no-color --max-warnings=0`, { stdio: 'pipe' });
            } catch (e) {
                console.log(`FAIL: ${fullPath}`);
            }
        }
    });
}
const dir = process.argv[2];
scan(dir);
