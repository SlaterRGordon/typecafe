# Extract the Progress hero delta

**Strength:** Speculative · **Category:** in-process **Status:** ✅ done

## Files

`src/pages/progress.tsx` — `:138–171` (`fitLine`, `wpm`, `hero`)

## Problem

Most of the dashboard's math is already deep and tested in `src/lib/progress` /
`src/lib/trajectory` (`rejectOutliers`, `trendSeries`, `linearTrend`,
`personalRecords`, `dailyRollups`, `detectPlateau`). What's left inline is the
**hero delta**: the `useMemo` that reads the WPM trend line's first/last
endpoints and turns them into `{start, current, delta, trend}` — the single
number a user shares. It has no test pinning it.

## Solution

Extract `heroDelta(series)` (and the `fitLine` closure) into `src/lib/progress`.
The page reads the result.

## Before / After

```
Before                                   After
──────                                   ─────
progress.tsx                             lib/progress
  fitLine() closure                        heroDelta(series): {start,current,
  hero = line endpoints → delta/trend        delta,trend}
        (untested, in render)            ──────── called by ────────
  ── over already-deep lib math ──       progress.tsx reads it
```

## Benefits

- locality: the shared headline number gets a test

## Outcome (2026-06-27)

`heroDelta(points)` + the `HeroDelta` type now live in `src/lib/progress.ts`; it
recomputes the WPM trend line internally (same inputs as the chart's `wpm` memo,
so the headline matches the slope the chart shows). The page's `hero` memo is now
`heroDelta(series.points)`, and the dead `line` field dropped out of the `wpm`
memo. 5 tests pin the empty / single-point / rising / falling / flat-band cases.

Verified: `tsc` clean; 371 unit tests pass; progress e2e green.

Marginal as predicted — one small derivation, not a trapped module. Done for
completeness now that the seam was open.
