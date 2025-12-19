
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../tests/unit/ops-signatures.test.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replacements
content = content.replace(/state\.blueBoard\.push\(([^)]+)\);/g, 'placeOnBoard($1, "blue");');
content = content.replace(/state\.redBoard\.push\(([^)]+)\);/g, 'placeOnBoard($1, "red");');

content = content.replace(/state\.blueHand\.push\(([^)]+)\);/g, 'placeInHand($1, "blue");');
content = content.replace(/state\.redHand\.push\(([^)]+)\);/g, 'placeInHand($1, "red");');

content = content.replace(/state\.blueGraveyard\.push\(([^)]+)\);/g, 'placeInGraveyard($1, "blue");');
content = content.replace(/state\.redGraveyard\.push\(([^)]+)\);/g, 'placeInGraveyard($1, "red");');

fs.writeFileSync(filePath, content, 'utf8');
console.log("Refactored tests/unit/ops-signatures.test.ts");
