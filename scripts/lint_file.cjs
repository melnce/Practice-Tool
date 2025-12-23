const { execSync } = require("child_process");
const fs = require("fs");
const file = process.argv[2];
const outFile = process.argv[3];

console.log(`Linting ${file} to ${outFile}...`);

try {
  // encoding: 'utf8' is crucial for string output
  execSync(`npx eslint "${file}" --no-color --max-warnings=0`, {
    stdio: "pipe",
    encoding: "utf8",
  });
  fs.writeFileSync(outFile, "No errors found.");
} catch (e) {
  // eslint returns non-zero exit code if errors found
  const output = (e.stdout || "") + "\n" + (e.stderr || "");
  fs.writeFileSync(outFile, output);
}
console.log("Done.");
