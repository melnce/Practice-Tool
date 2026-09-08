import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  buildQaPinBlockIndex,
  evaluateQaPin,
  extractAnswerKeywords,
  isQaPinnedFileScoped,
  QA_PIN_BLOCK_KEYWORD_MIN,
} from "../../scripts/lib/officialReconcile.js";

const CARD_ID = "10021130";
const CARD_NAME = "Centaur Centurion";
const ANSWER =
  "Yes. The crest effect restores Ward and Barrier on your leader.";

function writeFixture(rootDir: string, body: string): string {
  const testsDir = path.join(rootDir, "tests");
  fs.mkdirSync(testsDir, { recursive: true });
  const file = path.join(testsDir, "centaur-qa-pin.test.ts");
  fs.writeFileSync(
    file,
    `
import { describe, it, expect } from "vitest";

describe("Centaur Centurion (${CARD_ID})", () => {
  it("asserts behaviour", () => {
    ${body}
    expect(true).toBe(true);
  });
});

describe("filler deck", () => {
  it("uses board filler", () => {
    const fillerId = "${CARD_ID}";
    void fillerId;
  });
});
`,
  );
  return file;
}

describe("Q&A pin predicate (block-scoped)", () => {
  it("extracts enough keywords for the min-2 threshold", () => {
    const keywords = extractAnswerKeywords(ANSWER);
    expect(keywords.length).toBeGreaterThanOrEqual(QA_PIN_BLOCK_KEYWORD_MIN);
    expect(keywords).toContain("crest");
    expect(keywords).toContain("barrier");
  });

  it("reports unpinned when keywords sit outside subject blocks", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pin-outside-"));
    const file = writeFixture(dir, `expect(true).toBe(true);`);
    fs.appendFileSync(
      file,
      `\nconst unrelated = "crest restores ward barrier leader";\n`,
    );

    const corpus = [
      { file: "fixture.test.ts", text: fs.readFileSync(file, "utf-8") },
    ];
    const blockIndex = buildQaPinBlockIndex(dir);
    const pin = evaluateQaPin(CARD_ID, CARD_NAME, ANSWER, corpus, blockIndex);

    expect(isQaPinnedFileScoped(CARD_ID, ANSWER, corpus).pinnedFileScoped).toBe(
      true,
    );
    expect(pin.pinnedBlockScopedMin2).toBe(false);
    expect(pin.pinnedBlockScopedHalf).toBe(false);
  });

  it("reports pinned when keywords sit inside a subject block body", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pin-inside-"));
    const file = writeFixture(
      dir,
      `void "crest restores ward barrier leader";`,
    );

    const corpus = [
      { file: "fixture.test.ts", text: fs.readFileSync(file, "utf-8") },
    ];
    const blockIndex = buildQaPinBlockIndex(dir);
    const pin = evaluateQaPin(CARD_ID, CARD_NAME, ANSWER, corpus, blockIndex);

    expect(pin.pinnedBlockScopedMin2).toBe(true);
    expect(pin.pinnedBlockScopedHalf).toBe(true);
    expect(pin.matchedBlock).toContain("Centaur Centurion");
    expect(pin.matchedKeywords.length).toBeGreaterThanOrEqual(
      QA_PIN_BLOCK_KEYWORD_MIN,
    );
  });
});
