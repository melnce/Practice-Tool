const fs = require("fs");
const report = JSON.parse(fs.readFileSync("lint_report.json", "utf8"));

let output = "";
report.forEach((file) => {
  if (file.messages.length > 0 && file.filePath.includes("src")) {
    output += `\nFILE: ${file.filePath}\n`;
    file.messages.forEach((m) => {
      output += `  [${m.line}:${m.column}] ${m.ruleId}: ${m.message}\n`;
    });
  }
});

const outputDir = "reports";
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}
fs.writeFileSync("reports/src_lint_errors.txt", output);
console.log("Written to reports/src_lint_errors.txt");
