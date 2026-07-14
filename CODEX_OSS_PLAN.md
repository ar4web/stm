# Stamp Studio — OSS Hardening + Codex for Open Source Application Plan

## Goal

Get accepted into OpenAI's **Codex for Open Source** program:

- API credits (Codex Open Source Fund)
- **6 months of ChatGPT Pro with Codex**
- Conditional **Codex Security** access (core maintainers w/ write access)

Eligibility (verbatim from program page):

> "If you're a core maintainer or run a widely used public project"
> "API credits through the Codex Open Source Fund for projects that [do meaningful OSS work]"
> "core maintainers with write access" → Codex Security

---

## PART A — Problems found & fixed (DONE ✅)

| #   | Problem                                                       | Status                                                            |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Repo `magic-html-ring` was **PRIVATE** → disqualified the app | ✅ Made **public**                                                |
| 2   | Repo name `magic-html-ring` ≠ product "Stamp Studio"          | ✅ Renamed repo → `stamp-studio`                                  |
| 3   | No repo description / homepage / topics                       | ✅ Added description, homepage (`ar4web.github.io/ASM`), 5 topics |
| 4   | README had placeholder clone URL `<your-username>/<repo>`     | ✅ Fixed → `ar4web/stamp-studio`                                  |
| 5   | Stray `pid` file (process id) committed                       | ✅ Removed + gitignored via deletion                              |
| 6   | README "Screenshots" was a TODO                               | ✅ Added hero screenshot + Live Demo badge                        |
| 7   | Local remote still pointed to old slug                        | ✅ Updated to `stamp-studio.git`                                  |
| 8   | Two repos for one product (`stamp-studio` + `ASM`)            | ⚠️ Decided to KEEP `ASM` as live site (no break) — see Part C     |

Result: `https://github.com/ar4web/stamp-studio` is now a clean, public, well-described OSS repo.

---

## PART B — Remaining hardening (TODO, before applying)

These strengthen the application. None block it, but reviewers favor active, healthy repos.

- [ ] **Consolidate naming**: decide if `ASM` live site moves into `stamp-studio` (Pages from `/docs` or `gh-pages`). Reduces "two repos, one product" confusion.
- [ ] **Add a real CONTRIBUTING flow that uses Codex** — e.g. document "Codex can open PRs" so the app shows _intent to use_ Codex for PR workflows (the fund explicitly mentions "teams using Codex to power GitHub PR workflows").
- [ ] **Seed issues** tagged `good first issue` (README already lists 4). Real open issues signal an active project.
- [ ] **Get ≥1 star / external contributor** if possible (friends, communities). "Widely used public project" helps.
- [ ] **Verify `bun run lint` + `bun run build` pass** locally so the PR checklist isn't aspirational.
- [ ] **Add LICENSE file present** — confirmed MIT is set (good).
- [ ] **Pin the live demo in the repo description** so visitors land on working software immediately.

---

## PART C — Decision needed: `ASM` repo

`ASM` (public) hosts the GitHub Pages live site at `ar4web.github.io/ASM`.

Option 1 (recommended for clean OSS story): Move live site into `stamp-studio`

- Enable Pages on `stamp-studio` from `main` `/public/stamp` or a `gh-pages` branch
- Set homepage → `https://ar4web.github.io/stamp-studio`
- Archive/redirect `ASM`
  Risk: changes live URL. Mitigate with a 1-line redirect in `ASM`.

Option 2 (zero-risk): Keep `ASM` as live site, just link it from `stamp-studio` README (already done).

→ Recommend Option 1 only after confirming the exported `public/stamp` builds standalone.

---

## PART D — Application copy (ready to paste)

**Project:** Stamp Studio — https://github.com/ar4web/stamp-studio
**Live demo:** https://ar4web.github.io/ASM
**License:** MIT
**Stack:** TanStack Start (React 19 + Vite), Tailwind v4, Canvas 2D, Noto fonts
**Role:** Sole core maintainer (write access)

**Why it qualifies:**

- Public, MIT-licensed open-source project with a live demo used by designers.
- Free alternative to paid stamp/seal design software; multi-language (Arabic, CJK, Devanagari, Hebrew) text support serves a global, non-English user base.
- Plan to use Codex to (a) power PR workflows / triage good-first-issues, (b) add PDF export + improved RTL curved-text rendering, (c) run Codex Security on dependency updates.

**Intended Codex use (key for approval):**

- Automate contribution PRs from `good first issue` list.
- Generate tests + refactors for the Canvas renderer.
- Security review of npm/bun dependencies via Codex Security.

---

## PART E — Next actions (ordered)

1. ✅ Repo public + renamed + described (done)
2. ✅ README + screenshot + live demo (done)
3. ☐ Run `bun install && bun run lint && bun run build` — confirm green
4. ☐ Decide ASM consolidation (Part C)
5. ☐ Seed 2–3 `good first issue` issues
6. ☐ Add CONTRIBUTING note about Codex PRs
7. ☐ Submit application at the "Apply today" link
8. ☐ After approval: enable Codex Security, wire Codex into PR workflow

---

_Generated 2026-07-14. Repo: ar4web/stamp-studio (public)._
