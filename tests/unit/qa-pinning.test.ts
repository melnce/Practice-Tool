import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import {
  buildOfficialReport,
  buildQaPinBlockIndex,
  evaluateQaPin,
  extractQaKeywords,
  isQaPinnedFileScoped,
  QA_PIN_BLOCK_KEYWORD_MIN,
  QA_PIN_UNPINNED_FILE_SCOPED_SAME_EXTRACTION_STATUS,
  qaPinTwoKeywordTierCaveat,
} from "../../scripts/lib/officialReconcile.js";

const CARD_ID = "10021130";
const CARD_NAME = "Centaur Centurion";
const QUESTION =
  "If Centaur Centurion restores Ward on my leader, does the crest also grant Barrier?";
const ANSWER =
  "Yes. The crest effect restores Ward and Barrier on your leader.";

const CONTENT_FREE_ANSWER = "Yes, it will.";
const CONTENT_FREE_QUESTION =
  "If I play multiple copies of Beelzebub, Supreme King, can I give the enemy leader Takes 1 more damage multiple times?";
const CONTENT_FREE_CARD_ID = "10474120";
const CONTENT_FREE_CARD_NAME = "Beelzebub, Supreme King";

const NAME_ONLY_QUESTION =
  "If I play Beelzebub, Supreme King, what happens to the enemy leader?";
const NAME_ONLY_ANSWER = "Yes, you can.";

function writeFixture(
  rootDir: string,
  cardId: string,
  cardName: string,
  body: string,
  fileName = "centaur-qa-pin.test.ts",
): string {
  const testsDir = path.join(rootDir, "tests");
  fs.mkdirSync(testsDir, { recursive: true });
  const file = path.join(testsDir, fileName);
  fs.writeFileSync(
    file,
    `
import { describe, it, expect } from "vitest";

describe("${cardName} (${cardId})", () => {
  it("asserts behaviour", () => {
    ${body}
    expect(true).toBe(true);
  });
});

describe("filler deck", () => {
  it("uses board filler", () => {
    const fillerId = "${cardId}";
    void fillerId;
  });
});
`,
  );
  return file;
}

describe("Q&A pin predicate (block-scoped)", () => {
  it("extracts enough keywords from question + answer for the min-2 threshold", () => {
    const keywords = extractQaKeywords(QUESTION, ANSWER, CARD_NAME, CARD_ID);
    expect(keywords.length).toBeGreaterThanOrEqual(QA_PIN_BLOCK_KEYWORD_MIN);
    expect(keywords).toContain("crest");
    expect(keywords).toContain("barrier");
    expect(keywords).not.toContain("centaur");
    expect(keywords).not.toContain("centurion");
  });

  it("reports unpinned when keywords sit outside subject blocks", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pin-outside-"));
    const file = writeFixture(
      dir,
      CARD_ID,
      CARD_NAME,
      `expect(true).toBe(true);`,
    );
    fs.appendFileSync(
      file,
      `\nconst unrelated = "crest restores ward barrier leader";\n`,
    );

    const corpus = [
      { file: "fixture.test.ts", text: fs.readFileSync(file, "utf-8") },
    ];
    const blockIndex = buildQaPinBlockIndex(dir);
    const pin = evaluateQaPin(
      CARD_ID,
      CARD_NAME,
      QUESTION,
      ANSWER,
      corpus,
      blockIndex,
    );

    expect(
      isQaPinnedFileScoped(CARD_ID, CARD_NAME, QUESTION, ANSWER, corpus)
        .pinnedFileScoped,
    ).toBe(true);
    expect(pin.pinnedBlockScopedMin2).toBe(false);
    expect(pin.pinnedBlockScopedHalf).toBe(false);
  });

  it("reports pinned when keywords sit inside a subject block body", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pin-inside-"));
    const file = writeFixture(
      dir,
      CARD_ID,
      CARD_NAME,
      `void "crest restores ward barrier leader";`,
    );

    const corpus = [
      { file: "fixture.test.ts", text: fs.readFileSync(file, "utf-8") },
    ];
    const blockIndex = buildQaPinBlockIndex(dir);
    const pin = evaluateQaPin(
      CARD_ID,
      CARD_NAME,
      QUESTION,
      ANSWER,
      corpus,
      blockIndex,
    );

    expect(pin.pinnedBlockScopedMin2).toBe(true);
    expect(pin.pinnedBlockScopedHalf).toBe(true);
    expect(pin.matchedBlock).toContain("Centaur Centurion");
    expect(pin.matchedKeywords.length).toBeGreaterThanOrEqual(
      QA_PIN_BLOCK_KEYWORD_MIN,
    );
  });

  it("pins content-free answers when discriminating words live in the question", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pin-question-"));
    writeFixture(
      dir,
      CONTENT_FREE_CARD_ID,
      CONTENT_FREE_CARD_NAME,
      `void "multiple copies Takes 1 more damage";`,
      "beelzebub-qa-pin.test.ts",
    );

    const corpus = [
      {
        file: "beelzebub-qa-pin.test.ts",
        text: fs.readFileSync(
          path.join(dir, "tests/beelzebub-qa-pin.test.ts"),
          "utf-8",
        ),
      },
    ];
    const blockIndex = buildQaPinBlockIndex(dir);
    const pinned = evaluateQaPin(
      CONTENT_FREE_CARD_ID,
      CONTENT_FREE_CARD_NAME,
      CONTENT_FREE_QUESTION,
      CONTENT_FREE_ANSWER,
      corpus,
      blockIndex,
    );
    expect(
      extractQaKeywords(
        CONTENT_FREE_QUESTION,
        CONTENT_FREE_ANSWER,
        CONTENT_FREE_CARD_NAME,
        CONTENT_FREE_CARD_ID,
      ),
    ).toContain("multiple");
    expect(pinned.pinnedBlockScopedMin2).toBe(true);
    expect(pinned.matchedKeywords).toContain("multiple");
  });

  it("reports unpinned when question keywords are absent from the subject block", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pin-question-miss-"));
    writeFixture(
      dir,
      CONTENT_FREE_CARD_ID,
      CONTENT_FREE_CARD_NAME,
      `expect(true).toBe(true);`,
      "beelzebub-qa-pin-miss.test.ts",
    );

    const corpus = [
      {
        file: "beelzebub-qa-pin-miss.test.ts",
        text: fs.readFileSync(
          path.join(dir, "tests/beelzebub-qa-pin-miss.test.ts"),
          "utf-8",
        ),
      },
    ];
    const blockIndex = buildQaPinBlockIndex(dir);
    const pin = evaluateQaPin(
      CONTENT_FREE_CARD_ID,
      CONTENT_FREE_CARD_NAME,
      CONTENT_FREE_QUESTION,
      CONTENT_FREE_ANSWER,
      corpus,
      blockIndex,
    );
    expect(pin.pinnedBlockScopedMin2).toBe(false);
    expect(pin.matchedKeywords.length).toBeLessThan(QA_PIN_BLOCK_KEYWORD_MIN);
  });

  it("does not pin from the subject card name alone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-pin-name-only-"));
    writeFixture(
      dir,
      CONTENT_FREE_CARD_ID,
      CONTENT_FREE_CARD_NAME,
      `void "beelzebub supreme king";`,
      "beelzebub-name-only.test.ts",
    );

    const corpus = [
      {
        file: "beelzebub-name-only.test.ts",
        text: fs.readFileSync(
          path.join(dir, "tests/beelzebub-name-only.test.ts"),
          "utf-8",
        ),
      },
    ];
    const blockIndex = buildQaPinBlockIndex(dir);
    const pin = evaluateQaPin(
      CONTENT_FREE_CARD_ID,
      CONTENT_FREE_CARD_NAME,
      NAME_ONLY_QUESTION,
      NAME_ONLY_ANSWER,
      corpus,
      blockIndex,
    );
    expect(pin.pinnedBlockScopedMin2).toBe(false);
    expect(pin.matchedKeywords).not.toContain("beelzebub");
    expect(pin.matchedKeywords).not.toContain("supreme");
    expect(pin.matchedKeywords).not.toContain("king");
  });
});

describe("two-keyword tier caveat", () => {
  it("pins report.qaPinTwoKeywordTierCaveat to the exported formatter", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    const meta = JSON.parse(
      fs.readFileSync(path.join(root, "cards/official-meta.json"), "utf-8"),
    );
    const report = buildOfficialReport(meta, root);
    expect(report.qaPinTwoKeywordTierCaveat).toBe(
      qaPinTwoKeywordTierCaveat(report.twoKeywordPinCount),
    );
    expect(report.qaPinTwoKeywordTierCaveat).toContain("weakest tier");
    expect(report.qaPinTwoKeywordTierCaveat).toContain(
      String(report.twoKeywordPinCount),
    );
    expect(report.qaPinTwoKeywordTierCaveat).toContain(
      "not a coverage guarantee",
    );
    expect(report.pinnedAnswerOnlyFileScopedCount).toBe(62);
    expect(report.pinnedAnswerOnlyBlockScopedMin2Count).toBe(16);
    expect(report.pinnedCount).toBe(102);
    expect(report.pinnedFileScopedCount).toBe(142);
    expect(QA_PIN_UNPINNED_FILE_SCOPED_SAME_EXTRACTION_STATUS).toBe(
      "unpinned (file-scoped, same extraction)",
    );
  });
});
