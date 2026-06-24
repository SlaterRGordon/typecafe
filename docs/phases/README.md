# Phase Documents

Detailed execution docs for the [roadmap](../roadmap.md), in service of the [vision](../vision.md):

> **Monkeytype tells you how fast you are. TypeCafe makes you faster.**

| Phase | Doc | Goal |
|---|---|---|
| 0 | [phase-0-trust.md](phase-0-trust.md) | The numbers are beyond reproach |
| 1 | [phase-1-loop.md](phase-1-loop.md) | Test → diagnosis → one-click drill |
| 2 | [phase-2-ui-overhaul.md](phase-2-ui-overhaul.md) | Typer toolbar and first-screen UI overhaul |
| 3 | [phase-3-progression.md](phase-3-progression.md) | Trends, streaks, deltas — the retention engine |
| 4 | [phase-4-coach.md](phase-4-coach.md) | Diagnosis becomes prescription |
| 5 | [phase-5-competition.md](phase-5-competition.md) | Async competition that serves improvement |
| 6 | [phase-6-reach.md](phase-6-reach.md) | Content, SEO, embeds |
| 7 | [phase-7-moonshots.md](phase-7-moonshots.md) | The door stays open |

## Locked constraints (decided 2026-06-12)

These are settled. Phase docs assume them; revisit only deliberately.

1. **Capacity: owner + AI agents.** Claude does the heavy implementation; the owner directs, reviews, and makes taste calls. Work is sized in *sessions* — one focused agent working session producing a reviewable change (S = 1 session, M = 2–4, L = 5+).
2. **Keystroke data: full timelines.** Raw per-keystroke timing is captured and persisted (with a pruning policy), plus rolling aggregates that live forever.
3. **Infra: free tier only, for now.** No email provider, no paid workers, no LLM spend. Designs prefer *derived-on-read* over scheduled jobs (date-seeded challenges instead of cron, computed league windows instead of resets). Each doc notes its "when there's budget" upgrades.
4. **AI: heuristics first.** Rule-based diagnosis ships the value; the LLM coach is a defined later upgrade, not a dependency.
5. **Guest data: local-first, sync on signup.** Progression works from the first keystroke without an account, mirrored in localStorage, batch-imported on signup (the `learnProgress.batchImport` pattern, generalized).
6. **Monetization: free forever, donations only.** No premium surfaces are reserved. Certification, API, coach — all free if built.
7. **Pre-launch: break anything.** Schema rewrites and UX overhauls need no migration paths. This window closes at launch; use it.

## Division of labor — what the agent can and can't do

**Claude can own end-to-end:** schema changes and migrations, tRPC routers, React components and pages, the scoring/diagnosis math and its unit tests, Playwright e2e + screenshot coverage, copy, SEO pages, refactors (Typer decomposition), and verifying its own UI work via the screenshot tour.

**Claude can draft but the owner must judge:** visual design (agent ships candidates + screenshots; owner picks), feature prioritization within a phase, anything touching brand voice.

**The owner must do (agent cannot):** Vercel dashboard config and env secrets, third-party accounts (Google Search Console, OAuth apps, future email provider), community seeding (Reddit/Discord/PH posts — *agents must never astroturf*), judging real-user behavior from GA4, spending money, and recruiting beta users.

**Neither can do yet (honestly):** anything requiring data volume that doesn't exist (percentile claims from our own data, the research dataset, ML-trained text generation) or real-device native measurement. These stay in Phase 7 until their prerequisites exist.

## Standing rules for every phase

- Every feature passes the vision filter: *does it make someone faster, or prove that they're getting faster?*
- Every shipped surface gets e2e coverage **and** states added to the screenshot tour (`tests/e2e/screenshots.spec.ts`).
- Scoring math lives in `src/lib/` as pure functions with unit tests — never inside components.
- Every diagnosis shown to a user ends in a button.
- Deltas over absolutes, everywhere a delta exists.
