# Legacy Tests Directory

## Purpose
This directory contains tests that were migrated from the main test suite during the **Strict Test Reset (Dec 2025)**. 
These tests were identified as **BROKEN**, either due to:
1.  **Harness/Infra Rot**: Relying on stale internal APIs (like `makeUid`) or missing mocks.
2.  **Invalid Test Code**: Containing syntax errors or missing test setup variables.

## Rules & Policies
1.  **Legacy tests never drive engine changes.** 
    - Do NOT modify `src/` code to fix a legacy test.
2.  **Read-Only History.**
    - Keep these tests as reference implementations for edge cases they tried to cover.
3.  **Resurrection Policy.**
    - To "fix" a legacy test, you must **Rewrite It** in the main `tests/` directory using strictly public APIs (`GameDispatch`, `runEffects`) and proper test helpers.
    - Do not simply move it back.
4.  **No CI Enforcement.**
    - These tests are usually excluded from strict CI checks or `npm test` runs that mandate 100% success.

## Inventory
See `docs/reports/test_reset_report.md` for the full list of files migrated here and their specific failure reasons.
