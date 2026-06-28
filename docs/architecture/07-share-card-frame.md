# Split the Share-card frame policy from its queries

**Strength:** Worth exploring · **Category:** in-process **Status:** open

## Files

`src/server/api/routers/test.ts` — `buildBrag` (`:59`), `thirtyDayDelta` (`:127`),
`practiceStreak` (`:190`)

## Problem

After persisting a **Test**, the `create` mutation assembles the **Share card**'s
**Brag** + **Delta** + **Streak**. The policy lives in three private `async`
functions that interleave Prisma queries with the decision logic:

- the flattering-frame ladder (new **Best** → starter-peer percentile → global
  percentile → nothing)
- the `PERCENTILE_BRAG_THRESHOLD = 60` "never tell a slow typer they beat 8%" rule
- the `MIN_TESTS_FOR_AVG_DELTA = 3` honest-comparison floor

None of that policy runs without a live DB, yet it's exactly the "is the brag
honest?" logic that wants tests. Query and decision are **fused** — a leaky seam
whose interface (functions taking a `PrismaClient`) is as wide as its body.

## Solution

Split *fetch* from *decide*. The router gathers rows (prior-at-config, the 30-day
window, the streak days); a pure `src/lib/shareCard.ts` — `pickBrag(frames)`,
`netDelta(rows)` — chooses the frame. The 60 / 3 thresholds become the constants
under test. Percentile pieces (`peerPercentile.ts`) already live in lib; this
finishes the job for the two inline percentile tiers, and consumes
[06](06-net-scores-aggregation.md)'s `averageNet`.

## Before / After

```
Before                                  After
──────                                  ─────
buildBrag(prisma)  — query ⨯ policy     test.ts: fetch rows
thirtyDayDelta(prisma) — query ⨯ math   lib/shareCard.ts: pickBrag · netDelta
practiceStreak(prisma)                    (pure, table-testable)
```

## Benefits

- the brag ladder becomes a table test: feed frames, assert the chosen line
- honesty thresholds stop being invisible router trivia
- `create` shrinks to "persist, fetch, decide"

## Caveat

Softer than [06](06-net-scores-aggregation.md). The brag queries are deliberately
**lazy** — tier 3 only runs if tier 2's pool is empty. Keep that staging in the
router; extract the per-tier *decision*, not one giant pre-fetch.
