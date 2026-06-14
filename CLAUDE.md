# TypeCafe — Agent Instructions

<!-- CLAUDE.md and AGENTS.md are intentionally identical. If you edit one, copy it over the other. -->

## Read this first

> **Monkeytype tells you how fast you are. TypeCafe makes you faster.**
> Every screen either proves that promise or gets out of the way.

Before any product work, read [docs/vision.md](docs/vision.md). Before implementing a feature, read its phase doc in [docs/phases/](docs/phases/README.md) — the README holds seven **locked constraints** (decided 2026-06-12, do not relitigate): free-tier infra only (no cron/email/LLM spend — prefer derived-on-read/write), full keystroke timelines + additive aggregates, local-first guest data (sync on signup), heuristics before LLM, free forever (no premium gating), pre-launch break-anything, owner + AI agents capacity.

The vision filter for any change: *does it make someone faster, or prove they're getting faster?* If no — flag it instead of building it.

## Standing rules

- Scoring/diagnosis math lives in `src/lib/` as pure functions with unit tests — never inside components. The numbers are the product; treat scoring changes like security changes.
- Every UI change updates the e2e suite **and** the screenshot tour (`tests/e2e/screenshots.spec.ts`, captures to `docs/screenshots/<project>/`).
- Every diagnosis shown to a user ends in an action button. Deltas over absolutes wherever a delta exists.
- Never build: realtime multiplayer racing, theme marketplace, classroom tooling, decorative gamification (XP/badges without deltas or streaks).
- Tick the relevant checkbox in the phase doc in the same change that completes it.
- One focused task at a time; do not refactor unrelated code you pass by.

## Committing

- Commit straight to the `development` branch (the integration/dev branch). **No pull requests, no feature branches** — this is a solo owner + AI workflow. Don't push to `main` or `prod`.
- Commit after each completed, verified slice (suite green) — not one giant commit at the end, and never commit with the test suite red or types failing.
- Use **Conventional Commits**: `type(scope): summary` in the imperative mood, e.g. `feat(diagnosis): add post-test slow-key findings`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `cleanup`; scope optional.
- Add a body when the change isn't self-evident: what changed and why, the phase/roadmap item it advances (e.g. `phase-1-loop.md §1.3`), and how you verified it (tests run + result).
- Tick the phase-doc/roadmap checkbox in the same commit that completes the work.

## Commands

- Dev server: `npm run dev` (Playwright config auto-starts it on 127.0.0.1:3000)
- Unit tests: `npx vitest run` (config: `vitest.config.ts`, tests in `src/**/*.test.ts`)
- E2E: `npx playwright test` (desktop + mobile projects; helpers in `tests/e2e/helpers/`)
- Screenshot tour: `npx playwright test tests/e2e/screenshots.spec.ts`

## Architecture pointers

- `src/components/typer/Typer.tsx` — test orchestration (being decomposed into `src/components/typer/hooks/`)
- `src/lib/stats.ts` — WPM/accuracy/consistency math (pure; the source of truth)
- `src/hooks/useTestSettings.ts` — persisted test settings (localStorage `typecafe:testSettings`)
- `src/server/api/routers/` — tRPC routers; Prisma schema in `prisma/schema.prisma` (Postgres)
- Modes: Normal / Practice / Grams / Relaxed are top-level; Timed/Words is a sub-type of Normal only
- Mode switching is an always-visible inline `ModeBar` (`src/components/typer/config/ModeBar.tsx`) above the typer; every other setting (length, type, text, language, grams, live stats, keyboard) lives in the `Config` gear modal. In e2e, switch modes via `getByTestId("mode-bar")`, not the modal
- E2E gotchas: config modal closes via the `#configModal` checkbox `evaluate` trick (overlay intercepts clicks); modals fade in — settle ~600ms before screenshots; pages mostly lack `h1` — wait on content instead
