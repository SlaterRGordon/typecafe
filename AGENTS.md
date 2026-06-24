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
- Always use the ponytail skill: laziest solution that works — stdlib/native before deps, shortest diff, no speculative abstraction.
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
- Target mode model after Phase 2: Timed / Words / Practice / Grams / Relaxed are top-level; there should be no user-facing Normal mode.
- Phase 2 UI direction: frequent controls live in the typer toolbar (mode, length/custom length, language, settings icon, restart, fullscreen); settings becomes a dropdown for secondary toggles only. Do not preserve the old gear modal as the front door when working on the overhaul.
- E2E gotchas: before the Phase 2 toolbar overhaul lands, legacy config modal tests close via the `#configModal` checkbox `evaluate` trick (overlay intercepts clicks); modals fade in — settle ~600ms before screenshots; pages mostly lack `h1` — wait on content instead

<!-- pane-agent-context:start -->
## Pane

The developer is using Pane for this repository. Pane can manage saved repositories and create user-visible panes with terminal-backed tools for planning, discussion, implementation, and review work.

Start with `runpane doctor --json` before taking Pane actions. Use it to understand wrapper/runtime details, daemon reachability, and the next safe commands.

Use `runpane agent-context --json` for full Pane CLI context. Use `runpane agent-context --command "panels wait" --json` or another command name for detailed schema only when needed.

Default to context-safe validation: after creating panes or sending terminal input, run `runpane panels wait` or `runpane panels screen` before reporting success. Prefer `runpane panels submit` for normal text plus Enter; use `runpane panels input` only for exact bytes such as Ctrl-C or escape sequences.

Common commands:
- `runpane doctor --json`
- `runpane agent-context --json`
- `runpane repos list --json`
- `runpane repos add --path <repo> --yes --json`
- `runpane agents doctor --agent codex --repo active --json`
- `runpane panes create --repo active --name <name> --agent codex --prompt "<task>" --wait-ready --yes --json`
- `runpane panels list --pane <pane-id> --json`
- `runpane panels screen --panel <panel-id> --limit 80 --json`
- `runpane panels wait --panel <panel-id> --for ready --timeout-ms 30000 --json`
- `runpane panels submit --panel <panel-id> --text "<answer>" --yes --json`
- `runpane panels input --panel <panel-id> --input-file <path|-> --yes --json`

WSL note: if `runpane doctor --json` cannot find `/tmp/pane-daemon.../daemon.sock` or `runpane` resolves to a broken Windows shim, Pane may be running on Windows. Try `powershell.exe -NoProfile -Command 'Set-Location $env:TEMP; runpane doctor --json'`, then create panes through the same PowerShell form using the saved WSL repo name or id. Use `runpane agents doctor --agent codex --repo <selector> --json` to diagnose the repo environment Pane will actually use.
<!-- pane-agent-context:end -->
