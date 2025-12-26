const fs = require('fs');

const filePath = 'c:\\Projects\\Practice Tool\\cards\\sets\\10000_basic.json';
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Find and remove the malformed line 1066 (0-indexed: 1065)
// This line starts with "    ]," but then has escaped backslash content
const malformedIndex = lines.findIndex(line =>
  line.includes('    ],\\n')
);

if (malformedIndex !== -1) {
  console.log('Found malformed line at index:', malformedIndex);
  console.log('Content:', lines[malformedIndex].substring(0, 50));
  // Replace this line with just "    ]"
  lines[malformedIndex] = '    ]';
  console.log('Replaced with:', lines[malformedIndex]);
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

// Verify the JSON is valid
try {
  JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log('JSON is now valid!');
} catch (e) {
  console.log('JSON is still invalid:', e.message);
}
