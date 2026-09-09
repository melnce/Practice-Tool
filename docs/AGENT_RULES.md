## Agent Rules

- Always run `npm run check:fast` after changes.
- Never ignore type or lint failures.
- Do not modify legacy tests.
- Prefer fixing logic over weakening tests.
- If using @ts-expect-error, explain why.
- When saving manual test output or logs, ALWAYS use `reports/` directory (e.g. `npm test > reports/log.txt`). NEVER write logs to root.
- Precedence for any card-behaviour question, highest first: (1) owner rulings in `docs/owner-rulings.md`; (2) printed card text; (3) the official Cygames Q&A in `docs/official-qa.md`; (4) `docs/svwb_rulebook_formatted.md`. Authored JSON is never evidence of intent. Consult the rulings file first — it overrides everything below it, and `docs/svwb_rulebook_formatted.md` is what gets corrected when a ruling disagrees with it.
