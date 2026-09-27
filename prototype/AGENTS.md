# OpenDesign frontend worktree

## Purpose

This worktree is isolated for LinguaType frontend design and implementation. Read `FRONTEND-BRIEF.md` before changing UI code.

## Frozen backend boundary

- Treat `contracts/scaffold-api.v1.openapi.json` as the only API contract.
- Do not edit `app/api/scaffold/route.ts`, `app/scaffold-api-contract.ts`, or files under `contracts/` during frontend work.
- Do not reproduce Chinese-segment extraction or help-routing rules in the browser.
- If the UI appears to require an API change, stop and ask for a separately versioned contract decision.
- Never write API keys or model credentials into the repository.

## Product boundaries

- Process one mixed Chinese-English target sentence at a time using the task, full essay, and target sentence as context.
- Show one English expression for a direct item.
- For a complex item, initially show only its Chinese semantic scaffolds. Reveal selected English locally without another request.
- Never auto-insert, auto-replace, assemble, or generate the user's complete sentence.
- Preserve independent state for each essay and each processed sentence. A failed request must not change the essay or other cards.

## Verification

- Run `npm run contract:check` after changes touching API calls or result rendering.
- Run the existing lint and production build before delivery when dependencies are available.
