<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules

- Inspect existing code before modifying it.
- Work only on the requested milestone; do not work ahead.
- Avoid unnecessary dependencies and refactors. Use strict TypeScript.
- Run targeted checks, then lint and build before milestone completion.
- Keep terminal output concise and do not dump entire files in final responses.
- Update `docs/STATUS.md` and commit after each completed milestone.
- Never commit secrets.
