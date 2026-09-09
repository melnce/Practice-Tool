#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildVocabularyReport,
  formatVocabularyReport,
} from "./lib/vocabularyReport.js";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

const report = buildVocabularyReport();
const text = formatVocabularyReport(report);

const outDir = path.join(ROOT, "reports");
fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, "vocabulary.json");
const txtPath = path.join(outDir, "vocabulary.txt");

fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(txtPath, text);

console.log(text);
console.log(
  `\nWrote ${path.relative(ROOT, jsonPath)} and ${path.relative(ROOT, txtPath)}`,
);
