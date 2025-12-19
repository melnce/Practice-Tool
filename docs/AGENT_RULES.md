## Agent Rules

- Always run `npm run check:fast` after changes.
- Never ignore type or lint failures.
- Do not modify legacy tests.
- Prefer fixing logic over weakening tests.
- If using @ts-expect-error, explain why.
- When saving manual test output or logs, ALWAYS use `reports/` directory (e.g. `npm test > reports/log.txt`). NEVER write logs to root.
