# Split the Share-card frame policy from its queries

**Strength:** Worth exploring · **Category:** in-process **Status:** ✅ done

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

## Decisions (grilled + built 2026-06-27)

**Scope narrowed to the untested policy — the brag ladder.** After [06](06-net-scores-aggregation.md),
`thirtyDayDelta` was already thin (`averageNet` + a subtraction whose boundary
`averageNet` tests) and `practiceStreak` is a pure `currentStreak` call; neither
hides untested branching, so both stay as-is. Tier 2 (similar-starter percentile)
already lived in `peerPercentile.ts`. The only inline, untested policy was tiers
1 and 3 of the brag.

Built `src/lib/shareCard.ts`: `PERCENTILE_BRAG_THRESHOLD` (moved out of the
router), `personalBestBrag(priorNets, currentNet)`, `globalPercentileBrag(better,
total, threshold?)`. The router's `buildBrag` keeps its lazy query staging and
early returns, now calling the pure deciders. **No `pickBrag`/`netDelta`** — a
variadic `pickBrag` would force eager evaluation of all three tiers' queries,
defeating the laziness, and `netDelta` would wrap a one-line subtraction (YAGNI).

**Preserved a control-flow subtlety:** once the similar-starter pool is meaningful,
tier 2 returns its result *even when that's null* — it does **not** fall through to
the global percentile (only a too-small pool falls through). That `if
(peerPercentile) return …` block was left untouched.

Verified: `tsc --noEmit` clean, `vitest run` 341/341 (7 new `shareCard` tests
pinning the threshold boundary + the "first run isn't a best" rule).
