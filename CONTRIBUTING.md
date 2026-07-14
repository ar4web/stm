# Contributing to Stamp Studio

Thanks for wanting to improve Stamp Studio! This is a small, focused project, so the bar for contributions is low — but please follow this workflow so things stay clean.

## Getting started

```bash
git clone https://github.com/ar4web/stamp-studio.git
cd stamp-studio
bun install   # or: npm install
bun run dev    # http://localhost:8080
```

## Project layout

- `public/stamp/` — the standalone, framework-free stamp editor (HTML/CSS/JS). This is the core engine.
- `src/` — the TanStack Start React shell that hosts the editor.

Most logic lives in `public/stamp/app.js`. UI text and structure live in `public/stamp/index.html` + `style.css`.

## Making changes

1. Fork and branch: `git checkout -b fix/my-change`
2. Keep the standalone editor in `public/stamp/` self-contained (no build step required to run it).
3. Format with Prettier (LF line endings): `npx prettier --write .`
4. Make sure `bun run build` and `bun run lint` pass.
5. Open a PR describing the change and why.

## Good first issues

- Add a new stamp template preset (`public/stamp/app.js` → `STAMP_TEMPLATES`)
- Improve RTL text rendering for Arabic/Hebrew curved layers
- Add PDF export
- Translate the UI

## Codex / AI-assisted PRs

This project welcomes AI-assisted contributions (including OpenAI Codex, OpenCode, Cline, and similar tools). If you open a PR generated or assisted by an agent:

- Keep the standalone editor in `public/stamp/` self-contained (no build step required to run it).
- Run `npx prettier --write .` so diffs stay clean (LF line endings).
- Make sure `bun run build` and `bun run lint` pass before opening the PR.
- Add a short note in the PR description describing what the agent changed and how you verified it.

## Code of Conduct

Be respectful. Assume good intent. File issues with repro steps. That's it.
