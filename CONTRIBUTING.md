# Contributing to Stamp Studio

Thanks for your interest in improving **Stamp Studio** — an open-source, browser-based stamp/seal designer with multi-language text support (Latin, Arabic, CJK, Devanagari, Thai, Hebrew).

We welcome contributions of all sizes: bug reports, feature ideas, docs, translations, and code.

## Ways to contribute

- 🐛 **Report bugs** — open an issue with steps to reproduce, expected vs. actual behavior, and a screenshot if the problem is visual.
- 💡 **Suggest features** — open an issue describing the use case before writing code, so we can agree on scope.
- 📖 **Improve docs** — README, code comments, or in-app tooltips.
- 🌍 **Add language / font support** — the app uses the Noto font family for global coverage; PRs adding new script coverage or RTL fixes are especially welcome.
- 🧩 **Add stamp templates** — new preset shapes under `public/stamp/app.js` `STAMP_TEMPLATES`.

## Development setup

Requirements: [Bun](https://bun.sh) ≥ 1.1 (or Node ≥ 20 with `npm`/`pnpm`).

```bash
git clone https://github.com/<your-username>/<repo>.git
cd <repo>
bun install
bun run dev
```

The dev server runs at `http://localhost:8080`. The stamp editor itself is a static app under `public/stamp/` and is also usable standalone by opening `public/stamp/index.html` in a browser.

Useful scripts:

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `bun run dev`       | Start Vite dev server with HMR             |
| `bun run build`     | Production build                           |
| `bun run build:dev` | Development-mode build (used by CI checks) |
| `bun run lint`      | Run ESLint                                 |
| `bun run format`    | Format with Prettier                       |

## Project structure

```
public/stamp/       Static stamp editor (HTML/CSS/JS, no framework)
  index.html        UI shell
  app.js            All editor logic (canvas, layers, export)
  style.css         Theme + layout
src/routes/         TanStack Start routes (React shell)
src/components/     Shared React components
```

Most editor changes happen in `public/stamp/`. The React shell just hosts the static app.

## Pull request workflow

1. Fork the repo and create a branch: `git checkout -b fix/short-description`.
2. Make your change. Keep PRs focused — one topic per PR.
3. Run `bun run lint` and `bun run build:dev` locally; both must pass.
4. Manually test the stamp editor: add a curved-text layer, switch templates, export PNG and SVG.
5. Commit with a clear message (see below) and push.
6. Open a PR against `main`. Describe **what** changed and **why**, and include before/after screenshots for visual changes.

### Commit messages

Use short, imperative subject lines. Optional [Conventional Commits](https://www.conventionalcommits.org/) prefixes are appreciated:

- `feat: add hexagon stamp template`
- `fix: prevent hang when switching to oval preset`
- `docs: clarify export DPI options`
- `chore: bump @tanstack/react-start`

## Code style

- 2-space indent, single quotes in JS/TS, semicolons on.
- Prefer small, focused functions over deep nesting.
- Don't hardcode colors in components — use the design tokens defined in `src/styles.css` and `public/stamp/style.css`.
- Keep the static stamp app framework-free (no React inside `public/stamp/`).

## Reporting security issues

Please **do not** open a public issue for security problems. Email the maintainer or use GitHub's private security advisory feature to report vulnerabilities.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md). Be kind, be patient, assume good intent.

## License

By contributing you agree that your contributions will be licensed under the [MIT License](./LICENSE).
