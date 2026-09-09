#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildClauseShapeReport,
  formatClauseShapeReport,
} from "./lib/clauseShapeReport.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const report = buildClauseShapeReport();
const text = formatClauseShapeReport(report);

const outDir = path.join(ROOT, "reports");
fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, "clause-shape.json");
const txtPath = path.join(outDir, "clause-shape.txt");

fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(txtPath, text);

console.log(text);
console.log(
  `\nWrote ${path.relative(ROOT, jsonPath)} and ${path.relative(ROOT, txtPath)}`,
);
