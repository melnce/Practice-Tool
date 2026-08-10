// scripts/analyzeProfile.js
// Analyze CPU profile to find hotspots

const fs = require("fs");
const path = require("path");

// Find the cpuprofile file
const files = fs.readdirSync(".").filter((f) => f.endsWith(".cpuprofile"));
if (files.length === 0) {
  console.log("No .cpuprofile files found");
  process.exit(1);
}

const profilePath = files[files.length - 1]; // Use most recent
console.log(`Analyzing: ${profilePath}\n`);

const data = JSON.parse(fs.readFileSync(profilePath, "utf8"));
const nodes = data.nodes;
const samples = data.samples;
const timeDeltas = data.timeDeltas;

// Build node map
const nodeById = new Map();
nodes.forEach((n) => nodeById.set(n.id, n));

// Calculate self-time for each node
const selfTime = new Map();
let totalTime = 0;

for (let i = 0; i < samples.length; i++) {
  const id = samples[i];
  const delta = timeDeltas[i] || 100;
  totalTime += delta;
  selfTime.set(id, (selfTime.get(id) || 0) + delta);
}

// Build results
const results = [];
selfTime.forEach((time, id) => {
  const node = nodeById.get(id);
  if (node && node.callFrame) {
    const cf = node.callFrame;
    let url = cf.url || "";
    // Simplify path
    url = url.replace(/.*[\/\\]dist[\/\\]/, "dist/");
    url = url.replace(/.*[\/\\]src[\/\\]/, "src/");
    url = url.replace(/.*[\/\\]node_modules[\/\\]/, "node_modules/");

    results.push({
      name: cf.functionName || "(anonymous)",
      url: url,
      line: cf.lineNumber + 1, // 0-indexed to 1-indexed
      selfTime: time,
      pct: (time / totalTime) * 100,
    });
  }
});

// Sort by self-time descending
results.sort((a, b) => b.selfTime - a.selfTime);

// Print summary
console.log(`Total samples: ${samples.length}`);
console.log(`Total time: ${(totalTime / 1000).toFixed(1)}ms\n`);

console.log("═".repeat(80));
console.log("TOP 30 HOTSPOTS BY SELF-TIME");
console.log("═".repeat(80));
console.log("");

results.slice(0, 30).forEach((r, i) => {
  const selfMs = (r.selfTime / 1000).toFixed(1);
  const pctStr = r.pct.toFixed(1).padStart(5);
  const nameStr = r.name.substring(0, 35).padEnd(35);
  const locStr = `${r.url}:${r.line}`;
  console.log(
    `${String(i + 1).padStart(2)}. ${nameStr} ${selfMs.padStart(8)}ms (${pctStr}%)  ${locStr}`,
  );
});

// Group by file
console.log("\n");
console.log("═".repeat(80));
console.log("TIME BY FILE");
console.log("═".repeat(80));
console.log("");

const byFile = new Map();
results.forEach((r) => {
  const file = r.url || "(unknown)";
  byFile.set(file, (byFile.get(file) || 0) + r.selfTime);
});

const fileResults = [...byFile.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

fileResults.forEach(([file, time], i) => {
  const pct = ((time / totalTime) * 100).toFixed(1);
  const ms = (time / 1000).toFixed(1);
  console.log(
    `${String(i + 1).padStart(2)}. ${file.substring(0, 55).padEnd(55)} ${ms.padStart(8)}ms (${pct.padStart(5)}%)`,
  );
});

// Look for engine-specific hotspots
console.log("\n");
console.log("═".repeat(80));
console.log("ENGINE HOTSPOTS (dist/logic, dist/core)");
console.log("═".repeat(80));
console.log("");

const engineResults = results.filter(
  (r) =>
    r.url.includes("dist/logic") ||
    r.url.includes("dist/core") ||
    r.url.includes("dist/bench"),
);

engineResults.slice(0, 25).forEach((r, i) => {
  const selfMs = (r.selfTime / 1000).toFixed(1);
  const pctStr = r.pct.toFixed(1).padStart(5);
  const nameStr = r.name.substring(0, 35).padEnd(35);
  const locStr = `${r.url}:${r.line}`;
  console.log(
    `${String(i + 1).padStart(2)}. ${nameStr} ${selfMs.padStart(8)}ms (${pctStr}%)  ${locStr}`,
  );
});
